// Neon(Postgres) 연결. 테이블은 첫 요청 때 자동으로 만든다.
// 환경변수: DATABASE_URL (Vercel의 Neon 연동이 넣어 주는 이름). POSTGRES_URL도 받는다.
// 로컬 리허설은 LOCAL_PG=1 이면 일반 Postgres(pg)로 붙는다.

let runner;
let ready;

async function getRunner() {
  if (runner) return runner;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL 환경변수가 없어요. Vercel → Settings → Environment Variables에 Neon 연결 문자열을 넣어 주세요.');
  if (process.env.LOCAL_PG) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url });
    runner = async (text, params) => (await pool.query(text, params)).rows;
  } else {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    runner = (text, params) => sql.query(text, params);
  }
  return runner;
}

export async function query(text, params = []) {
  const run = await getRunner();
  if (!ready) {
    ready = run(`
      CREATE TABLE IF NOT EXISTS responses (
        room        text        NOT NULL,
        cid         text        NOT NULL,
        name        text        NOT NULL DEFAULT '',
        grp         int,
        answers     jsonb       NOT NULL,
        score       int         NOT NULL,
        level       int         NOT NULL,
        paid        boolean     NOT NULL DEFAULT false,
        uses        text[]      NOT NULL DEFAULT '{}',
        wish        text        NOT NULL DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (room, cid)
      )`).catch((e) => { ready = null; throw e; });
  }
  await ready;
  return run(text, params);
}

export function roomOf(v) {
  const s = String(v || '').trim().slice(0, 32).replace(/[^0-9A-Za-z가-힣_-]/g, '');
  return s || 'main';
}
