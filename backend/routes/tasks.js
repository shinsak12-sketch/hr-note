import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// 목록 조회
router.get('/', async (req, res) => {
  const { status } = req.query;
  let tasks;
  if (status) {
    tasks = await sql`SELECT * FROM tasks WHERE status = ${status} ORDER BY instruction_date DESC, created_at DESC`;
  } else {
    tasks = await sql`SELECT * FROM tasks ORDER BY instruction_date DESC, created_at DESC`;
  }
  res.json(tasks);
});

// 단건 조회
router.get('/:id', async (req, res) => {
  const [task] = await sql`SELECT * FROM tasks WHERE id = ${req.params.id}`;
  if (!task) return res.status(404).json({ error: '업무지시를 찾을 수 없습니다.' });
  res.json(task);
});

// 등록
router.post('/', async (req, res) => {
  const { instruction_date, content, assignee, due_date, status, note } = req.body;
  if (!instruction_date || !content || !assignee)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });
  const [task] = await sql`
    INSERT INTO tasks (instruction_date, content, assignee, due_date, status, note, created_by)
    VALUES (${instruction_date}, ${content}, ${assignee}, ${due_date||null}, ${status||'시작전'}, ${note||null}, ${req.user.id})
    RETURNING *
  `;
  res.status(201).json(task);
});

// 수정
router.put('/:id', async (req, res) => {
  const { instruction_date, content, assignee, due_date, status, note } = req.body;
  const [task] = await sql`
    UPDATE tasks SET
      instruction_date=${instruction_date}, content=${content}, assignee=${assignee},
      due_date=${due_date||null}, status=${status}, note=${note||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  if (!task) return res.status(404).json({ error: '업무지시를 찾을 수 없습니다.' });
  res.json(task);
});

// 상태만 변경
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const [task] = await sql`
    UPDATE tasks SET status=${status}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(task);
});

// 삭제
router.delete('/:id', async (req, res) => {
  await sql`DELETE FROM tasks WHERE id = ${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
