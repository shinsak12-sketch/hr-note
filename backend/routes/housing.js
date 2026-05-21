import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;

// 주소 → 좌표 변환
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

// 실제 도로 거리 계산
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

// 거리 확인 (로그인 불필요)
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

// 신청 현황 조회 (사번 + 비밀번호, 로그인 불필요)
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

// 신청 철회 (로그인 불필요, 사번+비밀번호 확인)
router.delete('/withdraw/:id', async (req, res) => {
  const { emp_no, password } = req.body;
  const [request] = await sql`
    SELECT * FROM housing_requests WHERE id = ${req.params.id}
  `;
  if (!request) return res.status(404).json({ error: '신청 내역을 찾을 수 없습니다.' });
  if (request.emp_no !== emp_no || request.password !== password)
    return res.status(401).json({ error: '본인 확인에 실패했습니다.' });
  if (request.status !== '신청')
    return res.status(400).json({ error: '이미 처리 중인 신청은 철회할 수 없습니다.' });
  await sql`DELETE FROM housing_requests WHERE id = ${req.params.id}`;
  res.json({ message: '철회되었습니다.' });
});

// 신청 목록 조회 (내부, 로그인 필요)
router.get('/', authMiddleware, async (req, res) => {
  const requests = await sql`
    SELECT h.*, o.org_name, o.headquarters
    FROM housing_requests h
    LEFT JOIN offices o ON h.office_id = o.id
    ORDER BY h.created_at DESC
  `;
  res.json(requests);
});

// 상태 변경 (내부, 로그인 필요)
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status, note } = req.body;
  const [request] = await sql`
    UPDATE housing_requests SET status=${status}, note=${note||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(request);
});

// 비밀번호 초기화 (내부, 로그인 필요)
router.patch('/:id/reset-password', authMiddleware, async (req, res) => {
  await sql`UPDATE housing_requests SET password = '1111' WHERE id = ${req.params.id}`;
  res.json({ message: '비밀번호가 1111로 초기화되었습니다.' });
});

// 삭제 (내부, 로그인 필요)
router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM housing_requests WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
