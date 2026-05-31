import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import * as XLSX from 'xlsx';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 목록 조회 (현재 입주자 포함)
router.get('/', authMiddleware, async (req, res) => {
  const list = await sql`
    SELECT h.*,
      r.id as resident_id, r.emp_no, r.emp_name, r.org_name as resident_org,
      r.move_in_date, r.move_out_date, r.note as resident_note
    FROM housing h
    LEFT JOIN housing_residents r ON r.housing_id = h.id AND r.move_out_date IS NULL
    ORDER BY h.org_name, h.address
  `;
  res.json(list);
});

// 통계 (반드시 /:id 보다 앞에)
router.get('/stats/summary', authMiddleware, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const d30 = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
  const d60 = new Date(Date.now() + 60*24*60*60*1000).toISOString().split('T')[0];
  const d90 = new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0];

  // 전체/입주중/공실/만료임박
  const [total] = await sql`SELECT COUNT(*) as cnt FROM housing`;
  const [occupied] = await sql`SELECT COUNT(*) as cnt FROM housing_residents WHERE move_out_date IS NULL`;
  const [exp30] = await sql`SELECT COUNT(*) as cnt FROM housing WHERE contract_end::date BETWEEN ${today}::date AND ${d30}::date`;
  const [exp60] = await sql`SELECT COUNT(*) as cnt FROM housing WHERE contract_end::date BETWEEN ${today}::date AND ${d60}::date`;
  const [exp90] = await sql`SELECT COUNT(*) as cnt FROM housing WHERE contract_end::date BETWEEN ${today}::date AND ${d90}::date`;

  // 본부별 현황
  const byHq = await sql`
    SELECT o.headquarters, COUNT(*) as cnt
    FROM housing_residents r
    JOIN offices o ON o.org_name = r.org_name
    WHERE r.move_out_date IS NULL
    GROUP BY o.headquarters
    ORDER BY cnt DESC
  `;

  // 만료 임박 목록
  const expiring = await sql`
    SELECT h.*, r.emp_name, r.emp_no, r.org_name as resident_org, r.move_in_date,
      CEIL((h.contract_end::date - CURRENT_DATE)::numeric) as days_left
    FROM housing h
    LEFT JOIN housing_residents r ON r.housing_id = h.id AND r.move_out_date IS NULL
    WHERE h.contract_end IS NOT NULL AND h.contract_end::date <= ${d90}::date AND h.contract_end::date >= ${today}::date
    ORDER BY h.contract_end ASC
  `;

  // 장기 입주자 TOP 10
  const longTerm = await sql`
    SELECT r.*, h.address,
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, r.move_in_date::date)) * 12 +
      EXTRACT(MONTH FROM AGE(CURRENT_DATE, r.move_in_date::date)) as months
    FROM housing_residents r
    JOIN housing h ON h.id = r.housing_id
    WHERE r.move_out_date IS NULL AND r.move_in_date IS NOT NULL
    ORDER BY r.move_in_date ASC
    LIMIT 10
  `;

  res.json({
    total: Number(total.cnt),
    occupied: Number(occupied.cnt),
    vacant: Number(total.cnt) - Number(occupied.cnt),
    exp30: Number(exp30.cnt),
    exp60: Number(exp60.cnt),
    exp90: Number(exp90.cnt),
    byHq,
    expiring,
    longTerm,
  });
});

// 신청 카운트 (홈화면용)
router.get('/pending-count', authMiddleware, async (req, res) => {
  const [row] = await sql`SELECT COUNT(*) as cnt FROM housing_residents WHERE move_out_date IS NULL`;
  res.json({ count: Number(row.cnt) });
});

const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;

async function geocode(address) {
  const res = await fetch(
    `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`,
    { headers: { 'X-NCP-APIGW-API-KEY-ID': NAVER_ID, 'X-NCP-APIGW-API-KEY': NAVER_SECRET } }
  );
  const data = await res.json();
  if (!data.addresses?.length) throw new Error('주소를 찾을 수 없습니다.');
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

// 신청 목록 조회 (내부, 로그인 필요)
router.get('/requests', authMiddleware, async (req, res) => {
  const list = await sql`
    SELECT h.*, o.org_name, o.headquarters
    FROM housing_requests h
    LEFT JOIN offices o ON h.office_id = o.id
    ORDER BY h.created_at DESC
  `;
  res.json(list);
});

// 신청 상태 변경 (내부, 로그인 필요)
router.patch('/requests/:id/status', authMiddleware, async (req, res) => {
  const { status, manager_comment } = req.body;
  const [r] = await sql`
    UPDATE housing_requests SET status=${status}, note=${manager_comment||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(r);
});

// 사택 신청 (로그인 불필요)
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

// 신청 현황 조회 (로그인 불필요)
router.post('/my-status', async (req, res) => {
  const { emp_no, password } = req.body;
  if (!emp_no || !password) return res.status(400).json({ error: '사번과 비밀번호를 입력하세요.' });
  const requests = await sql`
    SELECT h.*, o.org_name, o.headquarters
    FROM housing_requests h
    LEFT JOIN offices o ON h.office_id = o.id
    WHERE h.emp_no=${emp_no} AND h.password=${password}
    ORDER BY h.created_at DESC
  `;
  if (requests.length === 0) return res.status(404).json({ error: '신청 내역이 없거나 비밀번호가 올바르지 않습니다.' });
  res.json(requests);
});

// 신청 철회 (로그인 불필요)
router.delete('/withdraw/:id', async (req, res) => {
  const { emp_no, password } = req.body;
  const [request] = await sql`SELECT * FROM housing_requests WHERE id=${req.params.id}`;
  if (!request) return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
  if (request.emp_no !== emp_no || request.password !== password)
    return res.status(401).json({ error: '본인 확인에 실패했습니다.' });
  if (request.status !== '신청') return res.status(400).json({ error: '이미 처리 중인 신청은 철회할 수 없습니다.' });
  await sql`DELETE FROM housing_requests WHERE id=${req.params.id}`;
  res.json({ message: '철회되었습니다.' });
});

// 거리 계산 (로그인 불필요)
router.post('/check-distance', async (req, res) => {
  const { home_address, office_id } = req.body;
  if (!home_address || !office_id) return res.status(400).json({ error: '주소와 소속을 입력하세요.' });
  try {
    const [office] = await sql`SELECT * FROM offices WHERE id=${office_id}`;
    if (!office) return res.status(404).json({ error: '소속 정보를 찾을 수 없습니다.' });
    const [homeCoord, officeCoord] = await Promise.all([geocode(home_address), geocode(office.address)]);
    const distance_km = await getDistance(homeCoord.lng, homeCoord.lat, officeCoord.lng, officeCoord.lat);
    res.json({ distance_km, eligible: distance_km >= 50, office_address: office.address });
  } catch(e) {
    console.error('check-distance error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 단건 조회 (이력 포함)
router.get('/:id', authMiddleware, async (req, res) => {
  const [h] = await sql`SELECT * FROM housing WHERE id=${req.params.id}`;
  if (!h) return res.status(404).json({ error: '없음' });
  const residents = await sql`
    SELECT * FROM housing_residents WHERE housing_id=${req.params.id} ORDER BY move_in_date DESC
  `;
  res.json({ ...h, residents });
});

// 사택 등록
router.post('/', authMiddleware, async (req, res) => {
  const d = req.body;
  const [h] = await sql`
    INSERT INTO housing (address, area_sqm, org_name, rent_type, deposit, monthly_rent,
      rent_day, payment_type, auto_renew_years, contract_start, initial_end, contract_end, note)
    VALUES (${d.address}, ${d.area_sqm||null}, ${d.org_name||null}, ${d.rent_type||null},
      ${d.deposit||null}, ${d.monthly_rent||null}, ${d.rent_day||null}, ${d.payment_type||null},
      ${d.auto_renew_years||null}, ${d.contract_start||null}, ${d.initial_end||null},
      ${d.contract_end||null}, ${d.note||null})
    RETURNING *
  `;
  res.status(201).json(h);
});

// 사택 수정
router.patch('/:id', authMiddleware, async (req, res) => {
  const d = req.body;
  const [h] = await sql`
    UPDATE housing SET
      address=${d.address}, area_sqm=${d.area_sqm||null}, org_name=${d.org_name||null},
      rent_type=${d.rent_type||null}, deposit=${d.deposit||null}, monthly_rent=${d.monthly_rent||null},
      rent_day=${d.rent_day||null}, payment_type=${d.payment_type||null},
      auto_renew_years=${d.auto_renew_years||null}, contract_start=${d.contract_start||null},
      initial_end=${d.initial_end||null}, contract_end=${d.contract_end||null},
      note=${d.note||null}, special_note=${d.special_note !== undefined ? d.special_note : null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(h);
});

// 사택 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM housing WHERE id=${req.params.id}`;
  res.json({ ok: true });
});

// 입주자 등록
router.post('/:id/residents', authMiddleware, async (req, res) => {
  const { emp_no, emp_name, org_name, move_in_date, note } = req.body;
  // 기존 입주자 퇴거 처리
  await sql`
    UPDATE housing_residents SET move_out_date=${move_in_date}
    WHERE housing_id=${req.params.id} AND move_out_date IS NULL
  `;
  const [r] = await sql`
    INSERT INTO housing_residents (housing_id, emp_no, emp_name, org_name, move_in_date, note)
    VALUES (${req.params.id}, ${emp_no}, ${emp_name}, ${org_name||null}, ${move_in_date}, ${note||null})
    RETURNING *
  `;
  res.status(201).json(r);
});

// 임차종료
router.patch('/:id/terminate', authMiddleware, async (req, res) => {
  const { terminate_date } = req.body;
  const [h] = await sql`
    UPDATE housing SET contract_end=${terminate_date}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  // 입주자 퇴거 처리
  await sql`
    UPDATE housing_residents SET move_out_date=${terminate_date}
    WHERE housing_id=${req.params.id} AND move_out_date IS NULL
  `;
  res.json(h);
});

// 퇴거 처리
router.patch('/:id/residents/:rid/checkout', authMiddleware, async (req, res) => {
  const { move_out_date } = req.body;
  const [r] = await sql`
    UPDATE housing_residents SET move_out_date=${move_out_date}
    WHERE id=${req.params.rid} RETURNING *
  `;
  res.json(r);
});

// 양식 다운로드
router.get('/template/excel', authMiddleware, (req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [['소속(센터)','사택주소','전용평수','계약시작일','최초종료일','현재종료일','자동갱신(년)','구분(월세/연세)','보증금(만원)','월세연세(만원)','지급일(1-31)','지급시기(선불/후불)','사번','성명','입주일','비고']];
  const example = [['강남보상센터','서울시 서초구 서초대로 456','24.5','2024-01-01','2025-12-31','2025-12-31',2,'월세',3000,50,25,'후불','11500001','홍길동','2024-01-01','']];
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
  ws['!cols'] = [14,30,8,12,12,12,10,12,10,12,8,12,10,8,12,15].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '사택등록');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=HR노트_사택등록양식.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// 엑셀 업로드
router.post('/upload/excel', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let success = 0, errors = [];

    const parseDate = (v) => {
      if (!v) return null;
      if (v instanceof Date) return v.toISOString().split('T')[0];
      if (typeof v === 'number') return new Date((v - 25569) * 86400 * 1000).toISOString().split('T')[0];
      return String(v).trim() || null;
    };
    const str = (v) => String(v || '').trim() || null;

    for (const r of rows) {
      const address = str(r['사택주소']);
      if (!address) continue;
      try {
        // 사택 upsert (주소 기준)
        let [h] = await sql`SELECT id FROM housing WHERE address=${address}`;
        if (!h) {
          [h] = await sql`
            INSERT INTO housing (address, area_sqm, org_name, rent_type, deposit, monthly_rent,
              rent_day, payment_type, auto_renew_years, contract_start, initial_end, contract_end)
            VALUES (${address}, ${str(r['전용평수'])}, ${str(r['소속(센터)'])},
              ${str(r['구분(월세/연세)'])}, ${str(r['보증금(만원)'])}, ${str(r['월세연세(만원)'])},
              ${str(r['지급일(1-31)'])}, ${str(r['지급시기(선불/후불)'])}, ${str(r['자동갱신(년)'])},
              ${parseDate(r['계약시작일'])}, ${parseDate(r['최초종료일'])}, ${parseDate(r['현재종료일'])})
            RETURNING *
          `;
        } else {
          await sql`
            UPDATE housing SET
              area_sqm=${str(r['전용평수'])}, org_name=${str(r['소속(센터)'])},
              rent_type=${str(r['구분(월세/연세)'])}, deposit=${str(r['보증금(만원)'])},
              monthly_rent=${str(r['월세연세(만원)'])}, rent_day=${str(r['지급일(1-31)'])},
              payment_type=${str(r['지급시기(선불/후불)'])}, auto_renew_years=${str(r['자동갱신(년)'])},
              contract_start=${parseDate(r['계약시작일'])}, initial_end=${parseDate(r['최초종료일'])},
              contract_end=${parseDate(r['현재종료일'])}, updated_at=NOW()
            WHERE id=${h.id}
          `;
        }
        // 입주자 등록
        const emp_no = str(r['사번']);
        const emp_name = str(r['성명']);
        const move_in = parseDate(r['입주일']);
        if (emp_no && emp_name && move_in) {
          const [existing] = await sql`
            SELECT id FROM housing_residents WHERE housing_id=${h.id} AND move_out_date IS NULL
          `;
          if (!existing) {
            await sql`
              INSERT INTO housing_residents (housing_id, emp_no, emp_name, org_name, move_in_date, note)
              VALUES (${h.id}, ${emp_no}, ${emp_name}, ${str(r['소속(센터)'])}, ${move_in}, ${str(r['비고'])})
            `;
          }
        }
        success++;
      } catch(e) { errors.push(e.message); }
    }
    res.json({ success, errors, total: rows.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
