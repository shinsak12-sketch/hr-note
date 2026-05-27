import { Router } from 'express';
import sql from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 전체 목록
router.get('/', authMiddleware, async (req, res) => {
  const { category, type, status, year } = req.query;
  let list = await sql`
    SELECT a.*, o.headquarters, o.department,
      p.start_date as parent_start_date, p.end_date as parent_end_date
    FROM attendance a
    LEFT JOIN offices o ON a.office_id = o.id
    LEFT JOIN attendance p ON a.parent_id = p.id
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

  // 종료 D-15 도래 (진행중인데 end_date가 15일 이내)
  const endingSoon = list.filter(r => {
    if (r.status !== '진행중' || !r.end_date) return false;
    const end = new Date(r.end_date);
    const diff = Math.ceil((end - today) / (1000*60*60*24));
    return diff >= 0 && diff <= 15;
  }).map(r => ({
    ...r,
    days_left: Math.ceil((new Date(r.end_date) - today) / (1000*60*60*24)),
  })).sort((a, b) => a.days_left - b.days_left);

  // 시작 D-7 도래 (진행중이 아닌데 start_date가 7일 이내 미래)
  const startingSoon = list.filter(r => {
    if (r.status !== '진행중') return false;
    const start = new Date(r.start_date);
    const diff = Math.ceil((start - today) / (1000*60*60*24));
    return diff > 0 && diff <= 7;
  }).map(r => ({
    ...r,
    days_left: Math.ceil((new Date(r.start_date) - today) / (1000*60*60*24)),
  })).sort((a, b) => a.days_left - b.days_left);

  res.json({ summary, monthly, d15, endingSoon, startingSoon });
});

// 등록
router.post('/', authMiddleware, async (req, res) => {
  const d = req.body;
  // 기간 중복 체크 (force가 아닐 때만)
  if (!d.force && d.emp_no && d.start_date) {
    const overlaps = await sql`
      SELECT id, type, start_date, end_date FROM attendance
      WHERE emp_no = ${d.emp_no} AND status = '진행중'
      AND start_date <= ${d.end_date || '9999-12-31'}
      AND (end_date IS NULL OR end_date >= ${d.start_date})
    `;
    if (overlaps.length > 0) {
      return res.status(409).json({
        error: `기간 중복: 이미 ${overlaps[0].type} (${overlaps[0].start_date?.split('T')[0]} ~ ${overlaps[0].end_date?.split('T')[0] || '미정'}) 이 진행중입니다.`,
        overlap: true
      });
    }
  }
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

// 연장 처리
router.post('/:id/extend', authMiddleware, async (req, res) => {
  const { start_date, end_date, return_date } = req.body;
  const [original] = await sql`SELECT * FROM attendance WHERE id=${req.params.id}`;
  if (!original) return res.status(404).json({ error: '원본 레코드를 찾을 수 없습니다.' });

  // 기존 레코드 정상종료 처리
  await sql`UPDATE attendance SET status='정상종료', updated_at=NOW() WHERE id=${req.params.id}`;

  // 같은 사번+종류의 기존 연장 횟수 계산
  const extensions = await sql`
    SELECT COUNT(*) as cnt FROM attendance 
    WHERE emp_no=${original.emp_no} AND type=${original.type} AND is_extension=true
  `;
  const extCount = Number(extensions[0].cnt);
  const newSplitCount = (original.split_count || 1) + extCount + 1;

  const [newRec] = await sql`
    INSERT INTO attendance (
      category, type, office_id, org_name, emp_no, emp_name,
      start_date, end_date, return_date, used_days,
      child_order, split_count, disease_name, family_target, leave_reason,
      reduce_hours, work_start_time, work_end_time, normal_return_date, contract_date,
      retirement_date, off_start_date, leave_deleted, doc_completed,
      is_extension, parent_id, status
    ) VALUES (
      ${original.category}, ${original.type}, ${original.office_id}, ${original.org_name},
      ${original.emp_no}, ${original.emp_name},
      ${start_date}, ${end_date||null}, ${return_date||null},
      ${end_date ? Math.ceil((new Date(end_date) - new Date(start_date)) / (1000*60*60*24)) + 1 : null},
      ${original.child_order||null}, ${newSplitCount},
      ${original.disease_name||null}, ${original.family_target||null}, ${original.leave_reason||null},
      ${original.reduce_hours||null}, ${original.work_start_time||null}, ${original.work_end_time||null},
      ${original.normal_return_date||null}, ${original.contract_date||null},
      ${original.retirement_date||null}, ${original.off_start_date||null},
      ${original.leave_deleted||false}, ${original.doc_completed||false},
      true, ${original.parent_id || original.id}, '진행중'
    ) RETURNING *
  `;
  res.status(201).json(newRec);
});

// 삭제
router.delete('/:id', authMiddleware, async (req, res) => {
  await sql`DELETE FROM attendance WHERE id=${req.params.id}`;
  res.json({ message: '삭제되었습니다.' });
});

export default router;
