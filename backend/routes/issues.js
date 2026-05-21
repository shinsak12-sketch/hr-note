import { Router } from 'express';
import * as XLSX from 'xlsx';
import multer from 'multer';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authMiddleware);

// 이슈 목록 조회
router.get('/', async (req, res) => {
  const { emp_no, emp_name, issue_type, severity, date_from, date_to } = req.query;
  let conditions = [], params = [], i = 1;
  if (emp_no) { conditions.push(`emp_no ILIKE $${i++}`); params.push(`%${emp_no}%`); }
  if (emp_name) { conditions.push(`emp_name ILIKE $${i++}`); params.push(`%${emp_name}%`); }
  if (issue_type) { conditions.push(`issue_type = $${i++}`); params.push(issue_type); }
  if (severity) { conditions.push(`severity = $${i++}`); params.push(severity); }
  if (date_from) { conditions.push(`issue_date >= $${i++}`); params.push(date_from); }
  if (date_to) { conditions.push(`issue_date <= $${i++}`); params.push(date_to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const issues = await sql.query(`SELECT * FROM issues ${where} ORDER BY issue_date DESC, created_at DESC`, params);
  res.json(issues.rows);
});

// 홈 요약 통계
router.get('/stats/summary', async (req, res) => {
  const [totals] = await sql`
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE severity = '상') AS high,
      COUNT(*) FILTER (WHERE severity = '중') AS mid,
      COUNT(*) FILTER (WHERE severity = '하') AS low
    FROM issues
  `;
  const top3 = await sql`
    SELECT emp_no, emp_name, department, rank, COUNT(*) AS issue_count
    FROM issues GROUP BY emp_no, emp_name, department, rank
    ORDER BY issue_count DESC LIMIT 3
  `;
  res.json({ totals, top3 });
});

// 엑셀 양식 다운로드
router.get('/template/excel', (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [['사번','성명','소속','직급','직책','날짜','이슈구분','심각도','관련자','조치사항']];
  const example = [['10001','홍길동','서울센터','대리','팀원','2025-01-15','노무','상','박팀장','구두경고 조치']];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  ws['!cols'] = [8,10,12,8,8,14,10,6,16,30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '이슈등록양식');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=HR노트_업로드양식.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 엑셀 업로드
router.post('/upload/excel', upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    const ISSUE_TYPES = ['질병','노무','사고','사건','기타'];
    const SEVERITIES = ['상','중','하'];
    let success = 0, errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const emp_no = String(r['사번'] || '').trim();
      const emp_name = String(r['성명'] || '').trim();
      const issue_type = String(r['이슈구분'] || '').trim();
      const severity = String(r['심각도'] || '').trim();
      let issue_date = r['날짜'];

      if (!emp_no || !emp_name || !issue_type || !severity || !issue_date) {
        errors.push(`${rowNum}행: 필수값 누락`); continue;
      }
      if (!ISSUE_TYPES.includes(issue_type)) {
        errors.push(`${rowNum}행: 이슈구분 오류 (${issue_type})`); continue;
      }
      if (!SEVERITIES.includes(severity)) {
        errors.push(`${rowNum}행: 심각도 오류 (${severity})`); continue;
      }
      if (issue_date instanceof Date) {
        issue_date = issue_date.toISOString().split('T')[0];
      } else {
        issue_date = String(issue_date).trim();
      }
      await sql`
        INSERT INTO issues (emp_no, emp_name, department, rank, position, issue_date, issue_type, severity, related_person, action_taken, created_by)
        VALUES (${emp_no}, ${emp_name}, ${String(r['소속']||'').trim()||null}, ${String(r['직급']||'').trim()||null},
          ${String(r['직책']||'').trim()||null}, ${issue_date}, ${issue_type}, ${severity},
          ${String(r['관련자']||'').trim()||null}, ${String(r['조치사항']||'').trim()||null}, ${req.user.id})
      `;
      success++;
    }
    res.json({ success, errors, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: '파일 처리 중 오류가 발생했습니다.' });
  }
});

// 엑셀 내보내기
router.get('/export/excel', async (req, res) => {
  const issues = await sql`SELECT * FROM issues ORDER BY issue_date DESC`;
  const data = issues.map(i => ({
    '사번': i.emp_no, '성명': i.emp_name, '소속': i.department || '',
    '직급': i.rank || '', '직책': i.position || '',
    '날짜': i.issue_date?.toISOString?.()?.split('T')[0] || i.issue_date,
    '이슈구분': i.issue_type, '심각도': i.severity,
    '관련자': i.related_person || '', '조치사항': i.action_taken || '',
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [8,10,12,8,8,12,10,6,16,30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '이슈목록');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=HR노트_이슈목록.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 이슈 단건 조회
router.get('/:id', async (req, res) => {
  const [issue] = await sql`SELECT * FROM issues WHERE id = ${req.params.id}`;
  if (!issue) return res.status(404).json({ error: '이슈를 찾을 수 없습니다.' });
  res.json(issue);
});

// 이슈 등록
router.post('/', async (req, res) => {
  const { emp_no, emp_name, department, rank, position, issue_date, issue_type, severity, related_person, action_taken } = req.body;
  if (!emp_no || !emp_name || !issue_date || !issue_type || !severity)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  const [issue] = await sql`
    INSERT INTO issues (emp_no, emp_name, department, rank, position, issue_date, issue_type, severity, related_person, action_taken, created_by)
    VALUES (${emp_no}, ${emp_name}, ${department||null}, ${rank||null}, ${position||null}, ${issue_date}, ${issue_type}, ${severity}, ${related_person||null}, ${action_taken||null}, ${req.user.id})
    RETURNING *
  `;
  res.status(201).json(issue);
});

// 이슈 수정
router.put('/:id', async (req, res) => {
  const { emp_no, emp_name, department, rank, position, issue_date, issue_type, severity, related_person, action_taken } = req.body;
  const [issue] = await sql`
    UPDATE issues SET emp_no=${emp_no}, emp_name=${emp_name}, department=${department||null},
      rank=${rank||null}, position=${position||null}, issue_date=${issue_date},
      issue_type=${issue_type}, severity=${severity}, related_person=${related_person||null},
      action_taken=${action_taken||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  if (!issue) return res.status(404).json({ error: '이슈를 찾을 수 없습니다.' });
  res.json(issue);
});

// 이슈 삭제
router.delete('/:id', async (req, res) => {
  await sql`DELETE FROM issues WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
