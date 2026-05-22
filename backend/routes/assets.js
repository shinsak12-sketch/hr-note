import { Router } from 'express';
import * as XLSX from 'xlsx';
import multer from 'multer';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── 자산 목록 ──────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { q, asset_type } = req.query;
  let assets = await sql`
    SELECT a.*, o.org_name as office_org, o.headquarters, o.department
    FROM assets a LEFT JOIN offices o ON a.office_id = o.id
    ORDER BY a.updated_at DESC
  `;
  if (asset_type) assets = assets.filter(a => a.asset_type === asset_type);
  if (q) assets = assets.filter(a =>
    a.asset_no?.includes(q) || a.emp_name?.includes(q) ||
    a.emp_no?.includes(q) || a.org_name?.includes(q)
  );
  res.json(assets);
});

// 자산 현황 통계
router.get('/stats', authMiddleware, async (req, res) => {
  const assets = await sql`SELECT * FROM assets`;
  const byType = assets.reduce((acc, a) => {
    acc[a.asset_type] = (acc[a.asset_type] || 0) + 1;
    return acc;
  }, {});
  const requests = await sql`SELECT status FROM asset_requests`;
  const requestCounts = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const recent = await sql`
    SELECT ar.*, o.org_name FROM asset_requests ar
    LEFT JOIN offices o ON ar.office_id = o.id
    ORDER BY ar.created_at DESC LIMIT 5
  `;
  res.json({ total: assets.length, byType, requestCounts, recent });
});

// 자산 수정
router.patch('/:id', authMiddleware, async (req, res) => {
  const { emp_no, emp_name, office_id, org_name, status, note } = req.body;
  const [asset] = await sql`
    UPDATE assets SET emp_no=${emp_no||null}, emp_name=${emp_name||null},
      office_id=${office_id||null}, org_name=${org_name||null},
      status=${status||'사용중'}, note=${note||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(asset);
});

// ── 엑셀 양식 다운로드 ──────────────────
router.get('/template/excel', authMiddleware, (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [['자산번호', '자산구분', '사번', '성명', '소속(조직명)', '상태', '비고']];
  const example = [
    ['NB-2024-001', '노트북', '11500001', '홍길동', '강남센터', '사용중', ''],
    ['MN-2024-001', '모니터', '11500001', '홍길동', '강남센터', '사용중', ''],
    ['DP-2024-001', '데스크탑', '11500002', '김철수', '부산센터', '사용중', ''],
    ['IP-2024-001', '아이패드', '11500003', '이영희', '강남센터', '보관중', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  ws['!cols'] = [14, 10, 10, 8, 14, 8, 16].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '자산등록양식');

  const ws2 = XLSX.utils.aoa_to_sheet([
    ['항목', '필수', '설명'],
    ['자산번호', '✅', '고유 자산관리번호'],
    ['자산구분', '✅', '노트북/모니터/데스크탑/아이패드 중 하나'],
    ['사번', '선택', '현재 사용자 사번'],
    ['성명', '선택', '현재 사용자 성명'],
    ['소속(조직명)', '선택', 'offices 테이블의 org_name과 일치해야 함'],
    ['상태', '선택', '사용중/보관중/폐기 (기본값: 사용중)'],
    ['비고', '선택', ''],
  ]);
  ws2['!cols'] = [14, 6, 30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, '작성안내');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=HR노트_자산등록양식.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 엑셀 업로드
router.post('/upload/excel', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let success = 0, errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const asset_no = String(r['자산번호'] || '').trim();
      const asset_type = String(r['자산구분'] || '').trim();
      if (!asset_no || !asset_type) { errors.push(`${rowNum}행: 필수값 누락`); continue; }

      const org_name = String(r['소속(조직명)'] || '').trim();
      let office_id = null;
      if (org_name) {
        const [office] = await sql`SELECT id FROM offices WHERE org_name = ${org_name} LIMIT 1`;
        if (office) office_id = office.id;
      }

      await sql`
        INSERT INTO assets (asset_no, asset_type, emp_no, emp_name, office_id, org_name, status, note)
        VALUES (
          ${asset_no}, ${asset_type},
          ${String(r['사번']||'').trim()||null}, ${String(r['성명']||'').trim()||null},
          ${office_id}, ${org_name||null},
          ${String(r['상태']||'').trim()||'사용중'}, ${String(r['비고']||'').trim()||null}
        )
        ON CONFLICT (asset_no) DO UPDATE SET
          asset_type=EXCLUDED.asset_type, emp_no=EXCLUDED.emp_no,
          emp_name=EXCLUDED.emp_name, office_id=EXCLUDED.office_id,
          org_name=EXCLUDED.org_name, status=EXCLUDED.status,
          note=EXCLUDED.note, updated_at=NOW()
      `;
      success++;
    }
    res.json({ success, errors, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: '파일 처리 중 오류: ' + e.message });
  }
});

// ── 변경신고 ──────────────────────────
// 신고 접수 (로그인 불필요)
router.post('/requests', async (req, res) => {
  const { emp_no, emp_name, office_id, asset_type, old_asset_no, new_asset_no, change_date, reason } = req.body;
  if (!emp_no || !emp_name || !asset_type || !old_asset_no || !new_asset_no || !change_date || !reason)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  const [req_] = await sql`
    INSERT INTO asset_requests (emp_no, emp_name, office_id, asset_type, old_asset_no, new_asset_no, change_date, reason)
    VALUES (${emp_no}, ${emp_name}, ${office_id||null}, ${asset_type}, ${old_asset_no}, ${new_asset_no}, ${change_date}, ${reason})
    RETURNING *
  `;
  res.status(201).json(req_);
});

// 신청 목록 (로그인 필요)
router.get('/requests', authMiddleware, async (req, res) => {
  const requests = await sql`
    SELECT ar.*, o.org_name as office_org FROM asset_requests ar
    LEFT JOIN offices o ON ar.office_id = o.id
    ORDER BY ar.created_at DESC
  `;
  res.json(requests);
});

// 상태 변경 + 자산 자동 이동
router.patch('/requests/:id/status', authMiddleware, async (req, res) => {
  const { status, manager_comment } = req.body;
  const [request] = await sql`
    UPDATE asset_requests SET status=${status}, manager_comment=${manager_comment||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  // 확인완료 시 자산 자동 이동
  if (status === '확인완료') {
    await sql`
      UPDATE assets SET
        emp_no=${request.emp_no}, emp_name=${request.emp_name},
        office_id=${request.office_id}, updated_at=NOW()
      WHERE asset_no=${request.new_asset_no}
    `;
  }
  res.json(request);
});

// 신청 삭제
router.delete('/requests/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM asset_requests WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
