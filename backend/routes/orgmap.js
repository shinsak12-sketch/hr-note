import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import * as XLSX from 'xlsx';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authMiddleware, async (req, res) => {
  const list = await sql`SELECT * FROM org_name_map ORDER BY input_name`;
  res.json(list);
});

router.post('/', authMiddleware, async (req, res) => {
  const { input_name, mapped_org_name } = req.body;
  const [rec] = await sql`
    INSERT INTO org_name_map (input_name, mapped_org_name)
    VALUES (${input_name}, ${mapped_org_name})
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  res.json(rec);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM org_name_map WHERE id=${req.params.id}`;
  res.json({ ok: true });
});

// 양식 다운로드
router.get('/template', authMiddleware, (req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['업로드소속명', '실제조직명'],
    ['강남차량부 강남보상센터', '강남보상센터'],
  ]);
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, '조직명매핑');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=orgmap_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 엑셀 업로드
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  let inserted = 0;
  for (const r of rows) {
    const input = String(r['업로드소속명'] || '').trim();
    const mapped = String(r['실제조직명'] || '').trim();
    if (!input || !mapped) continue;
    await sql`
      INSERT INTO org_name_map (input_name, mapped_org_name)
      VALUES (${input}, ${mapped})
      ON CONFLICT DO NOTHING
    `;
    inserted++;
  }
  res.json({ inserted });
});

export default router;
