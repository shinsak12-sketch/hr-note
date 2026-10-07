// 로컬 리허설용 서버: public/ 정적 파일 + api/ 함수를 Vercel처럼 돌린다.
//   DATABASE_URL=postgres://... LOCAL_PG=1 npm run dev   (일반 Postgres)
//   DATABASE_URL=<neon 주소> npm run dev                  (Neon 그대로)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function wrap(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
      const mod = await import(path.join(root, 'api', `${name}.js`));
      let body = '';
      for await (const c of req) body += c;
      req.query = Object.fromEntries(url.searchParams);
      req.body = body && /json/.test(req.headers['content-type'] || '') ? JSON.parse(body) : body;
      return await mod.default(req, wrap(res));
    }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!path.extname(p)) p += '.html';
    const file = path.join(root, 'public', path.normalize(p));
    if (!file.startsWith(path.join(root, 'public'))) throw new Error('bad path');
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (e) {
    res.statusCode = e.code === 'ENOENT' || e.code === 'ERR_MODULE_NOT_FOUND' ? 404 : 500;
    res.end(String(e.message));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}  (강사 화면: /host)`));
