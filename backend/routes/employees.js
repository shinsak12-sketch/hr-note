import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import * as XLSX from 'xlsx';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 목록 조회
router.get('/', authMiddleware, async (req, res) => {
  const list = await sql`SELECT * FROM employees ORDER BY headquarters, department, org_name, emp_no`;
  res.json(list);
});

// 양식 다운로드
router.get('/template', authMiddleware, (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [['본부','부서','센터','출력조직','사번','성명','직급','직위','직책','직무','직군','성별','생년월일','입사일']];
  const example = [['수도권보상본부','강남차량보상부','강남보상센터','강남보상센터','11500001','홍길동','대리','주임','팀원','보상','손해사정','남','1990-01-01','2015-03-02']];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  ws['!cols'] = [14,14,14,14,10,8,8,8,8,8,8,5,12,12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '명부');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=HR노트_명부양식.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 엑셀 업로드 (덮어쓰기)
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

    const parseDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().split('T')[0];
      if (typeof v === 'number') {
        return new Date((v - 25569) * 86400 * 1000).toISOString().split('T')[0];
      }
      return String(v).trim() || null;
    };
    const str = (v) => String(v || '').trim() || null;

    let inserted = 0, updated = 0;
    for (const r of rows) {
      const emp_no = str(r['사번']);
      if (!emp_no) continue;
      const data = {
        headquarters: str(r['본부']),
        department: str(r['부서']),
        org_name: str(r['센터']),
        output_org: str(r['출력조직']),
        name: str(r['성명']),
        grade: str(r['직급']),
        position: str(r['직위']),
        title: str(r['직책']),
        job: str(r['직무']),
        job_group: str(r['직군']),
        gender: str(r['성별']),
        birth_date: parseDate(r['생년월일']),
        hire_date: parseDate(r['입사일']),
      };
      const [existing] = await sql`SELECT id FROM employees WHERE emp_no=${emp_no}`;
      if (existing) {
        await sql`UPDATE employees SET
          headquarters=${data.headquarters}, department=${data.department},
          org_name=${data.org_name}, output_org=${data.output_org},
          name=${data.name}, grade=${data.grade}, position=${data.position},
          title=${data.title}, job=${data.job}, job_group=${data.job_group},
          gender=${data.gender}, birth_date=${data.birth_date}, hire_date=${data.hire_date},
          updated_at=NOW() WHERE emp_no=${emp_no}`;
        updated++;
      } else {
        await sql`INSERT INTO employees
          (emp_no, headquarters, department, org_name, output_org, name, grade, position, title, job, job_group, gender, birth_date, hire_date)
          VALUES (${emp_no}, ${data.headquarters}, ${data.department}, ${data.org_name}, ${data.output_org}, ${data.name}, ${data.grade}, ${data.position}, ${data.title}, ${data.job}, ${data.job_group}, ${data.gender}, ${data.birth_date}, ${data.hire_date})`;
        inserted++;
      }
    }
    res.json({ inserted, updated, total: rows.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
