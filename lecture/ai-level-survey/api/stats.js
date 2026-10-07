import { query, roomOf } from '../lib/db.js';
import { GROUPS } from '../public/survey.js';

export default async function handler(req, res) {
  try {
    const room = roomOf(req.query.room);
    const rows = await query(
      `SELECT name, grp, score, level, paid, uses, wish, extract(epoch FROM updated_at) * 1000 AS at
         FROM responses WHERE room = $1 ORDER BY updated_at DESC`,
      [room],
    );
    const levels = [0, 0, 0, 0];
    const uses = {};
    const groups = Array.from({ length: GROUPS }, (_, i) => ({ g: i + 1, n: 0, sum: 0 }));
    let paid = 0;
    let total = 0;
    for (const r of rows) {
      levels[r.level]++;
      total += r.score;
      if (r.paid) paid++;
      for (const k of r.uses || []) uses[k] = (uses[k] || 0) + 1;
      if (r.grp) { groups[r.grp - 1].n++; groups[r.grp - 1].sum += r.level; }
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      room,
      count: rows.length,
      levels,
      paid,
      avgScore: rows.length ? total / rows.length : 0,
      uses,
      groups: groups.map((x) => ({ g: x.g, n: x.n, avg: x.n ? x.sum / x.n : null })),
      recent: rows.slice(0, 30).map((r) => ({ name: r.name, grp: r.grp, level: r.level, at: Number(r.at) })),
      wishes: rows.filter((r) => r.wish).slice(0, 40).map((r) => ({ text: r.wish, level: r.level, at: Number(r.at) })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
