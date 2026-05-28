import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const list = await sql`SELECT * FROM org_name_map ORDER BY input_name`;
  res.json(list);
});

router.post('/', authMiddleware, async (req, res) => {
  const { input_name, mapped_org_name } = req.body;
  const [rec] = await sql`
    INSERT INTO org_name_map (input_name, mapped_org_name)
    VALUES (${input_name}, ${mapped_org_name})
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  res.json(rec);
});

router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM org_name_map WHERE id=${req.params.id}`;
  res.json({ ok: true });
});

export default router;
