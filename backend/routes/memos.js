import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// 목록 조회 (본인 메모만)
router.get('/', async (req, res) => {
  const { q } = req.query;
  let memos;
  if (q) {
    memos = await sql`
      SELECT * FROM memos
      WHERE user_id = ${req.user.id}
      AND (title ILIKE ${'%'+q+'%'} OR content ILIKE ${'%'+q+'%'} OR tag ILIKE ${'%'+q+'%'})
      ORDER BY memo_date DESC, updated_at DESC
    `;
  } else {
    memos = await sql`
      SELECT * FROM memos WHERE user_id = ${req.user.id}
      ORDER BY memo_date DESC, updated_at DESC
    `;
  }
  res.json(memos);
});

// 단건 조회
router.get('/:id', async (req, res) => {
  const [memo] = await sql`
    SELECT * FROM memos WHERE id = ${req.params.id} AND user_id = ${req.user.id}
  `;
  if (!memo) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
  res.json(memo);
});

// 등록
router.post('/', async (req, res) => {
  const { memo_date, title, content, tag } = req.body;
  if (!memo_date) return res.status(400).json({ error: '일자는 필수입니다.' });
  const [memo] = await sql`
    INSERT INTO memos (user_id, memo_date, title, content, tag)
    VALUES (${req.user.id}, ${memo_date}, ${title||null}, ${content||null}, ${tag||null})
    RETURNING *
  `;
  res.status(201).json(memo);
});

// 수정 (자동저장 포함)
router.put('/:id', async (req, res) => {
  const { memo_date, title, content, tag } = req.body;
  const [memo] = await sql`
    UPDATE memos SET
      memo_date=${memo_date}, title=${title||null},
      content=${content||null}, tag=${tag||null}, updated_at=NOW()
    WHERE id=${req.params.id} AND user_id=${req.user.id}
    RETURNING *
  `;
  if (!memo) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
  res.json(memo);
});

// 삭제
router.delete('/:id', async (req, res) => {
  await sql`DELETE FROM memos WHERE id = ${req.params.id} AND user_id = ${req.user.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
