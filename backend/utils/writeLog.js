import sql from '../db.js';

export async function writeLog(user, action, target, detail, ip) {
  try {
    await sql`
      INSERT INTO access_logs (user_id, user_name, action, target, detail, ip)
      VALUES (${user?.id||null}, ${user?.name||null}, ${action}, ${target||null}, ${detail||null}, ${ip||null})
    `;
  } catch(e) { console.error('log error:', e.message); }
}
