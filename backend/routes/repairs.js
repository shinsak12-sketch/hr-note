import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 수선요청 접수 (로그인 불필요)
router.post('/', async (req, res) => {
  const { emp_no, emp_name, office_id, repair_type, reason, request_date, password } = req.body;
  if (!emp_name || !repair_type || !reason || !request_date)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  const [r] = await sql`
    INSERT INTO repair_requests (emp_no, emp_name, office_id, repair_type, reason, request_date, password, is_direct)
    VALUES (${emp_no||null}, ${emp_name}, ${office_id||null}, ${repair_type}, ${reason}, ${request_date}, ${password||null}, false)
    RETURNING *
  `;
  res.status(201).json(r);
});

// 신청자 현황 조회
router.post('/my-status', async (req, res) => {
  const { emp_no, password } = req.body;
  if (!emp_no || !password) return res.status(400).json({ error: '사번과 비밀번호를 입력하세요.' });
  const requests = await sql`
    SELECT r.*, o.org_name FROM repair_requests r
    LEFT JOIN offices o ON r.office_id = o.id
    WHERE r.emp_no = ${emp_no} AND r.password = ${password}
    ORDER BY r.created_at DESC
  `;
  if (requests.length === 0) return res.status(404).json({ error: '신청 내역이 없거나 비밀번호가 올바르지 않습니다.' });
  res.json(requests);
});

// 전체 목록 (로그인 필요)
router.get('/', authMiddleware, async (req, res) => {
  const requests = await sql`
    SELECT r.*, o.org_name FROM repair_requests r
    LEFT JOIN offices o ON r.office_id = o.id
    ORDER BY r.created_at DESC
  `;
  res.json(requests);
});

// 직접 입력 (로그인 필요)
router.post('/direct', authMiddleware, async (req, res) => {
  const { emp_no, emp_name, office_id, repair_type, reason, request_date } = req.body;
  if (!emp_name || !repair_type || !reason || !request_date)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  const [r] = await sql`
    INSERT INTO repair_requests (emp_no, emp_name, office_id, repair_type, reason, request_date, is_direct, status)
    VALUES (${emp_no||null}, ${emp_name}, ${office_id||null}, ${repair_type}, ${reason}, ${request_date}, true, '접수')
    RETURNING *
  `;
  res.status(201).json(r);
});

// 상태 변경 + 코멘트
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status, manager_comment } = req.body;
  const [r] = await sql`
    UPDATE repair_requests SET status=${status}, manager_comment=${manager_comment||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(r);
});

// 비밀번호 초기화
router.patch('/:id/reset-password', authMiddleware, async (req, res) => {
  await sql`UPDATE repair_requests SET password = '1111' WHERE id = ${req.params.id}`;
  res.json({ message: '비밀번호가 1111로 초기화되었습니다.' });
});

// 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM repair_requests WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
