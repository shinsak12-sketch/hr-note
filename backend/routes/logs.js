import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();



// 로그 목록 조회
router.get('/', authMiddleware, async (req, res) => {
  const { page = 1, limit = 50, user_name, action } = req.query;
  const offset = (page - 1) * limit;
  
  let list;
  if (user_name && action) {
    list = await sql`SELECT * FROM access_logs WHERE user_name ILIKE ${'%'+user_name+'%'} AND action=${action} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${offset}`;
  } else if (user_name) {
    list = await sql`SELECT * FROM access_logs WHERE user_name ILIKE ${'%'+user_name+'%'} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${offset}`;
  } else if (action) {
    list = await sql`SELECT * FROM access_logs WHERE action=${action} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${offset}`;
  } else {
    list = await sql`SELECT * FROM access_logs ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${offset}`;
  }
  
  const [{ cnt }] = await sql`SELECT COUNT(*) as cnt FROM access_logs`;
  res.json({ list, total: Number(cnt) });
});

export default router;
