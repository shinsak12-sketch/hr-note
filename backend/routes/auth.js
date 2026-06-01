import { writeLog } from './logs.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const WORK_TYPES = ['인사', '교육', '총무경리', '급여후생', '임원', '기타'];

// 로그인
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: '사번과 비밀번호를 입력하세요.' });

  const [user] = await sql`SELECT * FROM users WHERE username = ${username}`;
  if (!user) return res.status(401).json({ error: '사번 또는 비밀번호가 올바르지 않습니다.' });
  if (user.status === 'pending') return res.status(403).json({ error: '승인 대기 중입니다. 관리자에게 문의하세요.' });
  if (user.status === 'rejected') return res.status(403).json({ error: '승인이 거절된 계정입니다.' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: '사번 또는 비밀번호가 올바르지 않습니다.' });

  // 권한 정보 가져오기
  let allowedMenus = null;
  if (user.work_type) {
    const [perm] = await sql`SELECT allowed_menus FROM permissions WHERE work_type = ${user.work_type}`;
    allowedMenus = perm?.allowed_menus || null;
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role, work_type: user.work_type },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  writeLog({ id: user.id, name: user.name }, '로그인', null, null, ip);
  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, work_type: user.work_type, allowed_menus: allowedMenus }
  });
});

// 계정 신청 (누구나)
router.post('/request', async (req, res) => {
  const { username, password, name, work_type } = req.body;
  if (!username || !password || !name || !work_type)
    return res.status(400).json({ error: '모든 항목을 입력하세요.' });
  if (!WORK_TYPES.includes(work_type))
    return res.status(400).json({ error: '올바른 업무구분을 선택하세요.' });

  const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
  if (existing.length > 0) return res.status(400).json({ error: '이미 사용 중인 사번입니다.' });

  const hash = await bcrypt.hash(password, 10);
  const [user] = await sql`
    INSERT INTO users (username, password_hash, name, role, status, work_type)
    VALUES (${username}, ${hash}, ${name}, 'user', 'pending', ${work_type})
    RETURNING id, username, name, role, status, work_type
  `;
  res.status(201).json(user);
});

// 전체 계정 목록 (마스터)
router.get('/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  const users = await sql`SELECT id, username, name, role, status, work_type, created_at FROM users ORDER BY created_at DESC`;
  res.json(users);
});

// 계정 승인/거절 (마스터)
router.patch('/users/:id/status', authMiddleware, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  const { status } = req.body;
  await sql`UPDATE users SET status = ${status} WHERE id = ${req.params.id}`;
  res.json({ message: '처리되었습니다.' });
});

// 업무구분 변경 (마스터)
router.patch('/users/:id/work_type', authMiddleware, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  const { work_type } = req.body;
  await sql`UPDATE users SET work_type = ${work_type} WHERE id = ${req.params.id}`;
  res.json({ message: '변경되었습니다.' });
});

// 계정 삭제 (마스터)
router.delete('/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  await sql`DELETE FROM users WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

// 비밀번호 변경
router.patch('/users/:id/password', authMiddleware, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '새 비밀번호를 입력하세요.' });
  const hash = await bcrypt.hash(password, 10);
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${req.params.id}`;
  res.json({ message: '비밀번호가 변경되었습니다.' });
});

// 권한 목록 조회
router.get('/permissions', authMiddleware, async (req, res) => {
  const perms = await sql`SELECT * FROM permissions ORDER BY work_type`;
  res.json(perms);
});

// 권한 수정 (마스터)
router.put('/permissions', authMiddleware, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ error: '권한이 없습니다.' });
  const { work_type, allowed_menus } = req.body;
  await sql`
    INSERT INTO permissions (work_type, allowed_menus)
    VALUES (${work_type}, ${JSON.stringify(allowed_menus)})
    ON CONFLICT (work_type) DO UPDATE
    SET allowed_menus = ${JSON.stringify(allowed_menus)}, updated_at = NOW()
  `;
  res.json({ message: '저장되었습니다.' });
});

export default router;
