import { Router } from 'express';
import * as XLSX from 'xlsx';
import multer from 'multer';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authMiddleware);

// 목록 조회 (필터)
router.get('/', async (req, res) => {
  const { group_type, group_name, q } = req.query;
  let offices = await sql`SELECT * FROM offices ORDER BY group_type, group_name, org_name`;
  if (group_type) offices = offices.filter(o => o.group_type === group_type);
  if (group_name) offices = offices.filter(o => o.group_name === group_name);
  if (q) offices = offices.filter(o =>
    o.org_name?.includes(q) || o.address?.includes(q) ||
    o.manager_name?.includes(q) || o.phone?.includes(q)
  );
  res.json(offices);
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
  const { group_type, group_name, org_name, address, manager_name, phone } = req.body;
  if (!group_type || !group_name || !org_name || !address)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  const [office] = await sql`
    INSERT INTO offices (group_type, group_name, org_name, address, manager_name, phone)
    VALUES (${group_type}, ${group_name}, ${org_name}, ${address}, ${manager_name||null}, ${phone||null})
    RETURNING *
  `;
  res.status(201).json(office);
});

// 수정 (마스터만)
router.put('/:id', async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  const { group_type, group_name, org_name, address, manager_name, phone } = req.body;
  const [office] = await sql`
    UPDATE offices SET
      group_type=${group_type}, group_name=${group_name}, org_name=${org_name},
      address=${address}, manager_name=${manager_name||null}, phone=${phone||null},
      updated_at=NOW()
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
  const headers = [['구분(본부/부서/센터)', '그룹명', '조직명', '주소', '관리자명', '전화번호']];
  const example = [
    ['본부', '서울본부', '서울본부', '서울시 강남구 테헤란로 123', '홍길동', '02-1234-5678'],
    ['부서', '서울본부', '인사팀', '서울시 강남구 테헤란로 123', '김철수', '02-1234-5679'],
    ['센터', '서울본부', '강남센터', '서울시 강남구 역삼로 456', '이영희', '02-9876-5432'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  ws['!cols'] = [14, 12, 12, 30, 10, 14].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '사무실등록양식');
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
    const TYPES = ['본부', '부서', '센터'];
    let success = 0, errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const group_type = String(r['구분(본부/부서/센터)'] || '').trim();
      const group_name = String(r['그룹명'] || '').trim();
      const org_name = String(r['조직명'] || '').trim();
      const address = String(r['주소'] || '').trim();

      if (!group_type || !group_name || !org_name || !address) {
        errors.push(`${rowNum}행: 필수값 누락`); continue;
      }
      if (!TYPES.includes(group_type)) {
        errors.push(`${rowNum}행: 구분 오류 (본부/부서/센터 중 하나)`); continue;
      }
      await sql`
        INSERT INTO offices (group_type, group_name, org_name, address, manager_name, phone)
        VALUES (${group_type}, ${group_name}, ${org_name}, ${address},
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
