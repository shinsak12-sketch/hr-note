import { Router } from 'express';
import * as XLSX from 'xlsx';
import multer from 'multer';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authMiddleware);

// 목록 조회
router.get('/', async (req, res) => {
  const { headquarters, department, q } = req.query;
  let offices = await sql`SELECT * FROM offices ORDER BY headquarters, department NULLS FIRST, org_name`;
  if (headquarters) offices = offices.filter(o => o.headquarters === headquarters);
  if (department) offices = offices.filter(o => o.department === department || o.headquarters === headquarters);
  if (q) offices = offices.filter(o =>
    o.org_name?.includes(q) || o.address?.includes(q) ||
    o.manager_name?.includes(q) || o.phone?.includes(q)
  );
  res.json(offices);
});

// 본부 목록
router.get('/headquarters', async (req, res) => {
  const rows = await sql`SELECT DISTINCT headquarters FROM offices ORDER BY headquarters`;
  res.json(rows.map(r => r.headquarters));
});

// 부서 목록 (본부 기준)
router.get('/departments', async (req, res) => {
  const { headquarters } = req.query;
  let rows;
  if (headquarters) {
    rows = await sql`SELECT DISTINCT department FROM offices WHERE headquarters = ${headquarters} AND department IS NOT NULL ORDER BY department`;
  } else {
    rows = await sql`SELECT DISTINCT department FROM offices WHERE department IS NOT NULL ORDER BY department`;
  }
  res.json(rows.map(r => r.department));
});

// 단건 조회
router.get('/:id', async (req, res) => {
  const [office] = await sql`SELECT * FROM offices WHERE id = ${req.params.id}`;
  if (!office) return res.status(404).json({ error: '사무실을 찾을 수 없습니다.' });
  res.json(office);
});

// 등록 (마스터만)
router.post('/', async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  const { headquarters, department, org_name, address, manager_name, phone } = req.body;
  if (!headquarters || !org_name || !address)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  const [office] = await sql`
    INSERT INTO offices (headquarters, department, org_name, address, manager_name, phone)
    VALUES (${headquarters}, ${department||null}, ${org_name}, ${address}, ${manager_name||null}, ${phone||null})
    RETURNING *
  `;
  res.status(201).json(office);
});

// 수정 (마스터만)
router.put('/:id', async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  const { headquarters, department, org_name, address, manager_name, phone } = req.body;
  const [office] = await sql`
    UPDATE offices SET
      headquarters=${headquarters}, department=${department||null}, org_name=${org_name},
      address=${address}, manager_name=${manager_name||null}, phone=${phone||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(office);
});

// 삭제 (마스터만)
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  await sql`DELETE FROM offices WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

// 엑셀 양식 다운로드
router.get('/template/excel', (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [['본부명', '부서명', '조직명', '주소', '관리자명', '전화번호']];
  const example = [
    ['서울본부', '', '서울본부', '서울시 강남구 테헤란로 123', '홍길동', '02-1234-5678'],
    ['서울본부', '인사부서', '인사팀', '서울시 강남구 테헤란로 123', '김철수', '02-1234-5679'],
    ['서울본부', '인사부서', '강남센터', '서울시 강남구 역삼로 456', '이영희', '02-9876-5432'],
    ['부산본부', '', '부산본부', '부산시 해운대구 센텀로 78', '박민수', '051-1234-5678'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  ws['!cols'] = [12, 12, 12, 30, 10, 14].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '사무실등록양식');

  // 안내 시트
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['항목', '설명'],
    ['본부명', '필수. 최상위 조직 (예: 서울본부, 부산본부)'],
    ['부서명', '선택. 본부 하위 부서 (예: 인사부서, 영업부서). 없으면 빈칸'],
    ['조직명', '필수. 실제 조직/센터명 (예: 강남센터, 인사팀)'],
    ['주소', '필수. 도로명 주소'],
    ['관리자명', '선택'],
    ['전화번호', '선택'],
  ]);
  ws2['!cols'] = [12, 40].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, '작성안내');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=HR노트_사무실양식.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 엑셀 업로드 (마스터만)
router.post('/upload/excel', upload.single('file'), async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let success = 0, errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const headquarters = String(r['본부명'] || '').trim();
      const department = String(r['부서명'] || '').trim() || null;
      const org_name = String(r['조직명'] || '').trim();
      const address = String(r['주소'] || '').trim();

      if (!headquarters || !org_name || !address) {
        errors.push(`${rowNum}행: 필수값 누락`); continue;
      }
      await sql`
        INSERT INTO offices (headquarters, department, org_name, address, manager_name, phone)
        VALUES (${headquarters}, ${department}, ${org_name}, ${address},
          ${String(r['관리자명']||'').trim()||null}, ${String(r['전화번호']||'').trim()||null})
      `;
      success++;
    }
    res.json({ success, errors, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: '파일 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
