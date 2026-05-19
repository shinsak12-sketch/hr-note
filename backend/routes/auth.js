import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 로그인
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });

  const [user] = await sql`SELECT * FROM users WHERE username = ${username}`;
  if (!user) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, username: user.username, name: user.name } });
});

// 전체 계정 목록 조회 (관리자용)
router.get('/users', authMiddleware, async (req, res) => {
  const users = await sql`SELECT id, username, name, created_at FROM users ORDER BY created_at DESC`;
  res.json(users);
});

// 계정 추가
router.post('/users', authMiddleware, async (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password || !name)
    return res.status(400).json({ error: '모든 항목을 입력하세요.' });

  const hash = await bcrypt.hash(password, 10);
  const [user] = await sql`
    INSERT INTO users (username, password_hash, name)
    VALUES (${username}, ${hash}, ${name})
    RETURNING id, username, name, created_at
  `;
  res.status(201).json(user);
});

// 계정 삭제
router.delete('/users/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  await sql`DELETE FROM users WHERE id = ${id}`;
  res.json({ message: '삭제되었습니다.' });
});

// 비밀번호 변경
router.patch('/users/:id/password', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: '새 비밀번호를 입력하세요.' });
  const hash = await bcrypt.hash(password, 10);
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`;
  res.json({ message: '비밀번호가 변경되었습니다.' });
});

export default router;
