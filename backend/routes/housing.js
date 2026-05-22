import { Router } from 'express';
import * as XLSX from 'xlsx';
import multer from 'multer';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;

async function geocode(address) {
  const res = await fetch(
    `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`,
    { headers: { 'X-NCP-APIGW-API-KEY-ID': NAVER_ID, 'X-NCP-APIGW-API-KEY': NAVER_SECRET } }
  );
  const data = await res.json();
  if (!data.addresses?.length) throw new Error('주소를 찾을 수 없습니다. 도로명 주소로 다시 입력해주세요.');
  const { x, y } = data.addresses[0];
  return { lng: parseFloat(x), lat: parseFloat(y) };
}

async function getDistance(startLng, startLat, goalLng, goalLat) {
  const res = await fetch(
    `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${startLng},${startLat}&goal=${goalLng},${goalLat}&option=trafast`,
    { headers: { 'X-NCP-APIGW-API-KEY-ID': NAVER_ID, 'X-NCP-APIGW-API-KEY': NAVER_SECRET } }
  );
  const data = await res.json();
  if (data.code !== 0) throw new Error('거리 계산에 실패했습니다.');
  const distanceM = data.route?.trafast?.[0]?.summary?.distance;
  return Math.round(distanceM / 100) / 10;
}

// ── 예외 대상 ──────────────────────────
router.get('/exceptions', async (req, res) => {
  const list = await sql`SELECT * FROM housing_exceptions ORDER BY created_at DESC`;
  res.json(list);
});

router.get('/exceptions/check/:emp_no', async (req, res) => {
  const [exc] = await sql`SELECT * FROM housing_exceptions WHERE emp_no = ${req.params.emp_no}`;
  res.json({ is_exception: !!exc, exception: exc || null });
});

router.post('/exceptions', authMiddleware, async (req, res) => {
  const { emp_no, emp_name, reason } = req.body;
  if (!emp_no || !emp_name || !reason)
    return res.status(400).json({ error: '모든 항목을 입력하세요.' });
  const [exc] = await sql`
    INSERT INTO housing_exceptions (emp_no, emp_name, reason, created_by)
    VALUES (${emp_no}, ${emp_name}, ${reason}, ${req.user.id})
    ON CONFLICT (emp_no) DO UPDATE SET emp_name=${emp_name}, reason=${reason}
    RETURNING *
  `;
  res.status(201).json(exc);
});

router.delete('/exceptions/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM housing_exceptions WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

// ── 거리 확인 ──────────────────────────
router.post('/check-distance', async (req, res) => {
  const { home_address, office_id } = req.body;
  if (!home_address || !office_id)
    return res.status(400).json({ error: '주소와 소속을 입력하세요.' });
  try {
    const [office] = await sql`SELECT * FROM offices WHERE id = ${office_id}`;
    if (!office) return res.status(404).json({ error: '소속 정보를 찾을 수 없습니다.' });
    const [homeCoord, officeCoord] = await Promise.all([
      geocode(home_address),
      geocode(office.address),
    ]);
    const distance_km = await getDistance(homeCoord.lng, homeCoord.lat, officeCoord.lng, officeCoord.lat);
    res.json({ distance_km, eligible: distance_km > 50, office_address: office.address });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 신청 ──────────────────────────────
router.post('/apply', async (req, res) => {
  const { emp_no, emp_name, department, office_id, home_address, distance_km, note, password } = req.body;
  if (!emp_no || !emp_name || !office_id || !home_address || !password)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  const [request] = await sql`
    INSERT INTO housing_requests (emp_no, emp_name, department, office_id, home_address, distance_km, note, password)
    VALUES (${emp_no}, ${emp_name}, ${department||null}, ${office_id}, ${home_address}, ${distance_km||null}, ${note||null}, ${password})
    RETURNING id, emp_no, emp_name, status, created_at
  `;
  res.status(201).json(request);
});

// ── 신청자 현황 조회 ──────────────────
router.post('/my-status', async (req, res) => {
  const { emp_no, password } = req.body;
  if (!emp_no || !password)
    return res.status(400).json({ error: '사번과 비밀번호를 입력하세요.' });
  const requests = await sql`
    SELECT h.*, o.org_name, o.headquarters
    FROM housing_requests h
    LEFT JOIN offices o ON h.office_id = o.id
    WHERE h.emp_no = ${emp_no} AND h.password = ${password}
    ORDER BY h.created_at DESC
  `;
  if (requests.length === 0)
    return res.status(404).json({ error: '신청 내역이 없거나 비밀번호가 올바르지 않습니다.' });
  res.json(requests);
});

// ── 보완사항 제출 ──────────────────────
router.patch('/supplement/:id', async (req, res) => {
  const { emp_no, password, supplement } = req.body;
  const [r] = await sql`SELECT * FROM housing_requests WHERE id = ${req.params.id}`;
  if (!r) return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
  if (r.emp_no !== emp_no || r.password !== password)
    return res.status(401).json({ error: '본인 확인에 실패했습니다.' });
  if (r.status !== '보완요청')
    return res.status(400).json({ error: '보완요청 상태가 아닙니다.' });
  const [updated] = await sql`
    UPDATE housing_requests SET supplement=${supplement}, status='검토중', updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(updated);
});

// ── 신청 철회 ──────────────────────────
router.delete('/withdraw/:id', async (req, res) => {
  const { emp_no, password } = req.body;
  const [r] = await sql`SELECT * FROM housing_requests WHERE id = ${req.params.id}`;
  if (!r) return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
  if (r.emp_no !== emp_no || r.password !== password)
    return res.status(401).json({ error: '본인 확인에 실패했습니다.' });
  if (r.status !== '신청')
    return res.status(400).json({ error: '이미 처리 중인 신청은 철회할 수 없습니다.' });
  await sql`DELETE FROM housing_requests WHERE id = ${req.params.id}`;
  res.json({ message: '철회되었습니다.' });
});

// 기존 사택 일괄 업로드 양식
router.get('/template/excel', authMiddleware, (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [['사번', '성명', '소속(조직명)', '거주지주소', '사택주소', '계약시작일', '계약만료일', '보증금(만원)', '월세(만원)', '특이사항']];
  const example = [['11500001', '홍길동', '강남센터', '서울시 강남구 역삼로 123', '서울시 서초구 서초대로 456', '2024-01-01', '2025-12-31', '3000', '50', '']];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  ws['!cols'] = [10,8,12,25,25,12,12,10,10,20].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '사택등록양식');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=HR노트_사택등록양식.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.post('/upload/excel', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    let success = 0, errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const emp_no = String(r['사번'] || '').trim();
      const emp_name = String(r['성명'] || '').trim();
      const org_name = String(r['소속(조직명)'] || '').trim();
      const home_address = String(r['거주지주소'] || '').trim();
      const housing_address = String(r['사택주소'] || '').trim();

      if (!emp_no || !emp_name || !home_address) {
        errors.push(`${rowNum}행: 필수값 누락`); continue;
      }

      let office_id = null;
      if (org_name) {
        const [office] = await sql`SELECT id FROM offices WHERE org_name = ${org_name} LIMIT 1`;
        if (office) office_id = office.id;
      }

      const parseDate = (val) => {
        if (!val) return null;
        const s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        if (!isNaN(val)) {
          const d = new Date(Math.round((Number(val) - 25569) * 86400 * 1000));
          return d.toISOString().split('T')[0];
        }
        return null;
      };

      await sql`
        INSERT INTO housing_requests
          (emp_no, emp_name, office_id, home_address, housing_address,
           contract_start, contract_end, deposit, monthly_rent, contract_note,
           status, password, distance_km)
        VALUES
          (${emp_no}, ${emp_name}, ${office_id}, ${home_address}, ${housing_address||null},
           ${parseDate(r['계약시작일'])}, ${parseDate(r['계약만료일'])},
           ${String(r['보증금(만원)']||'').trim()||null},
           ${String(r['월세(만원)']||'').trim()||null},
           ${String(r['특이사항']||'').trim()||null},
           '승인', '1111', NULL)
        ON CONFLICT DO NOTHING
      `;
      success++;
    }
    res.json({ success, errors, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: '파일 처리 중 오류: ' + e.message });
  }
});
router.get('/', authMiddleware, async (req, res) => {
  const requests = await sql`
    SELECT h.*, o.org_name, o.headquarters, o.department as office_dept
    FROM housing_requests h
    LEFT JOIN offices o ON h.office_id = o.id
    ORDER BY h.created_at DESC
  `;
  res.json(requests);
});

// 현황 통계
router.get('/stats', authMiddleware, async (req, res) => {
  const { headquarters, department, org_name } = req.query;
  let requests = await sql`
    SELECT h.*, o.org_name, o.headquarters, o.department as office_dept
    FROM housing_requests h
    LEFT JOIN offices o ON h.office_id = o.id
    WHERE h.status = '승인'
  `;
  if (headquarters) requests = requests.filter(r => r.headquarters === headquarters);
  if (department) requests = requests.filter(r => r.office_dept === department);
  if (org_name) requests = requests.filter(r => r.org_name === org_name);

  const total = requests.length;
  const deposit_sum = requests.reduce((s, r) => s + (parseFloat(r.deposit) || 0), 0);
  const rent_sum = requests.reduce((s, r) => s + (parseFloat(r.monthly_rent) || 0), 0);

  const today = new Date();
  const expiring = requests.filter(r => {
    if (!r.contract_end) return false;
    const end = new Date(r.contract_end);
    const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
    return diff <= 180;
  }).map(r => {
    const end = new Date(r.contract_end);
    const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
    return { ...r, days_left: diff };
  }).sort((a, b) => a.days_left - b.days_left);

  res.json({ total, deposit_sum, rent_sum, expiring, list: requests });
});

// 상태 변경 (승인 시 계약정보 포함)
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status, manager_comment, housing_address, contract_start, contract_end, contract_note, deposit, monthly_rent } = req.body;
  const [r] = await sql`
    UPDATE housing_requests SET
      status=${status},
      manager_comment=${manager_comment||null},
      housing_address=${housing_address||null},
      contract_start=${contract_start||null},
      contract_end=${contract_end||null},
      contract_note=${contract_note||null},
      deposit=${deposit||null},
      monthly_rent=${monthly_rent||null},
      updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(r);
});

// 계약정보 수정
router.patch('/:id/contract', authMiddleware, async (req, res) => {
  const { housing_address, contract_start, contract_end, contract_note, deposit, monthly_rent } = req.body;
  const [r] = await sql`
    UPDATE housing_requests SET
      housing_address=${housing_address||null},
      contract_start=${contract_start||null},
      contract_end=${contract_end||null},
      contract_note=${contract_note||null},
      deposit=${deposit||null},
      monthly_rent=${monthly_rent||null},
      updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(r);
});

// 비밀번호 초기화
router.patch('/:id/reset-password', authMiddleware, async (req, res) => {
  await sql`UPDATE housing_requests SET password = '1111' WHERE id = ${req.params.id}`;
  res.json({ message: '비밀번호가 1111로 초기화되었습니다.' });
});

// 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM housing_requests WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
