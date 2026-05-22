import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 전체 목록
router.get('/', authMiddleware, async (req, res) => {
  const { category, type, status, year } = req.query;
  let list = await sql`
    SELECT a.*, o.headquarters, o.department
    FROM attendance a
    LEFT JOIN offices o ON a.office_id = o.id
    ORDER BY a.start_date DESC
  `;
  if (category) list = list.filter(r => r.category === category);
  if (type) list = list.filter(r => r.type === type);
  if (status) list = list.filter(r => r.status === status);
  if (year) list = list.filter(r => {
    const s = new Date(r.start_date).getFullYear();
    const e = r.end_date ? new Date(r.end_date).getFullYear() : 9999;
    return s <= Number(year) && e >= Number(year);
  });
  res.json(list);
});

// 현황 통계
router.get('/stats', authMiddleware, async (req, res) => {
  const { year } = req.query;
  const y = Number(year) || new Date().getFullYear();
  const list = await sql`SELECT * FROM attendance`;

  const today = new Date();

  // 현재 진행중 카운트
  const active = list.filter(r => r.status === '진행중');
  const summary = {
    휴직: active.filter(r => r.category === '휴직').length,
    휴가: active.filter(r => r.category === '휴가').length,
    단축근무: active.filter(r => r.category === '단축근무').length,
    근무OFF: active.filter(r => r.category === '근무OFF').length,
  };

  // 월별 집계 (해당 월말 기준 진행중 인원)
  const monthly = Array.from({ length: 12 }, (_, mi) => {
    const monthEnd = new Date(y, mi + 1, 0); // 월말
    const types = {};
    list.forEach(r => {
      const start = new Date(r.start_date);
      const end = r.end_date ? new Date(r.end_date) : new Date('9999-12-31');
      if (start <= monthEnd && end >= monthEnd) {
        const key = r.type;
        types[key] = (types[key] || 0) + 1;
      }
    });
    return { month: mi + 1, ...types };
  });

  // D-15 복직 예정자
  const d15 = list.filter(r => {
    if (r.status !== '진행중' || !r.return_date) return false;
    const ret = new Date(r.return_date);
    const diff = Math.ceil((ret - today) / (1000*60*60*24));
    return diff >= 0 && diff <= 15;
  }).map(r => ({
    ...r,
    days_left: Math.ceil((new Date(r.return_date) - today) / (1000*60*60*24)),
  })).sort((a, b) => a.days_left - b.days_left);

  res.json({ summary, monthly, d15 });
});

// 등록
router.post('/', authMiddleware, async (req, res) => {
  const d = req.body;
  const [rec] = await sql`
    INSERT INTO attendance (
      category, type, office_id, org_name, emp_no, emp_name,
      start_date, end_date, return_date, used_days, note,
      child_order, split_count, disease_name, remaining_days,
      family_target, leave_reason, multi_birth, premature,
      birth_date, post_birth_days, paid_period, prenatal_days,
      reduce_hours, work_start_time, work_end_time, normal_return_date, contract_date,
      retirement_date, off_start_date, leave_deleted, doc_completed
    ) VALUES (
      ${d.category}, ${d.type}, ${d.office_id||null}, ${d.org_name||null},
      ${d.emp_no}, ${d.emp_name}, ${d.start_date}, ${d.end_date||null},
      ${d.return_date||null}, ${d.used_days||null}, ${d.note||null},
      ${d.child_order||null}, ${d.split_count||null}, ${d.disease_name||null},
      ${d.remaining_days||null}, ${d.family_target||null}, ${d.leave_reason||null},
      ${d.multi_birth||false}, ${d.premature||false}, ${d.birth_date||null},
      ${d.post_birth_days||null}, ${d.paid_period||null}, ${d.prenatal_days||null},
      ${d.reduce_hours||null}, ${d.work_start_time||null}, ${d.work_end_time||null},
      ${d.normal_return_date||null}, ${d.contract_date||null},
      ${d.retirement_date||null}, ${d.off_start_date||null},
      ${d.leave_deleted||false}, ${d.doc_completed||false}
    ) RETURNING *
  `;
  res.status(201).json(rec);
});

// 수정
router.patch('/:id', authMiddleware, async (req, res) => {
  const d = req.body;
  const [rec] = await sql`
    UPDATE attendance SET
      category=${d.category}, type=${d.type}, office_id=${d.office_id||null},
      org_name=${d.org_name||null}, emp_no=${d.emp_no}, emp_name=${d.emp_name},
      start_date=${d.start_date}, end_date=${d.end_date||null},
      return_date=${d.return_date||null}, used_days=${d.used_days||null},
      note=${d.note||null}, child_order=${d.child_order||null},
      split_count=${d.split_count||null}, disease_name=${d.disease_name||null},
      remaining_days=${d.remaining_days||null}, family_target=${d.family_target||null},
      leave_reason=${d.leave_reason||null}, multi_birth=${d.multi_birth||false},
      premature=${d.premature||false}, birth_date=${d.birth_date||null},
      post_birth_days=${d.post_birth_days||null}, paid_period=${d.paid_period||null},
      prenatal_days=${d.prenatal_days||null}, reduce_hours=${d.reduce_hours||null},
      work_start_time=${d.work_start_time||null}, work_end_time=${d.work_end_time||null},
      normal_return_date=${d.normal_return_date||null}, contract_date=${d.contract_date||null},
      retirement_date=${d.retirement_date||null}, off_start_date=${d.off_start_date||null},
      leave_deleted=${d.leave_deleted||false}, doc_completed=${d.doc_completed||false},
      updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(rec);
});

// 종료처리
router.patch('/:id/close', authMiddleware, async (req, res) => {
  const { status, end_comment, end_date } = req.body;
  const [rec] = await sql`
    UPDATE attendance SET status=${status}, end_comment=${end_comment||null},
      end_date=${end_date||null}, updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `;
  res.json(rec);
});

// 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM attendance WHERE id=${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
