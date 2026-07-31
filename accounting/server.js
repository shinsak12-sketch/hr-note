#!/usr/bin/env node
/* =========================================================================
   경리 콕핏 — 로컬 정적 서버 (의존성 없음, Node 내장 모듈만 사용)
   폴더 연결(File System Access API)은 localhost 에서만 되므로 이 서버로 띄웁니다.
   실행:  node server.js   →  http://localhost:4173 자동 열림
   ========================================================================= */
const http=require("http"), fs=require("fs"), path=require("path"), url=require("url");
const { exec }=require("child_process");

const ROOT=__dirname;
const PORT=Number(process.env.PORT||4173);
const MIME={
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon",
  ".woff2":"font/woff2", ".map":"application/json",
};

const server=http.createServer((req,res)=>{
  let p=decodeURIComponent(url.parse(req.url).pathname);
  if(p==="/") p="/index.html";
  const file=path.normalize(path.join(ROOT,p));
  if(!file.startsWith(ROOT)){ res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file,(err,buf)=>{
    if(err){ res.writeHead(404,{"content-type":"text/plain; charset=utf-8"}); return res.end("404: "+p); }
    res.writeHead(200,{"content-type":MIME[path.extname(file)]||"application/octet-stream","cache-control":"no-cache"});
    res.end(buf);
  });
});

function open(u){
  const cmd = process.platform==="win32" ? `start "" "${u}"`
            : process.platform==="darwin" ? `open "${u}"`
            : `xdg-open "${u}"`;
  exec(cmd,()=>{});
}

server.listen(PORT,()=>{
  const u=`http://localhost:${PORT}`;
  console.log(`\n  경리 콕핏 실행 중 →  ${u}\n  (종료: Ctrl+C)\n`);
  open(u);
});
server.on("error",e=>{
  if(e.code==="EADDRINUSE"){ console.error(`포트 ${PORT} 사용 중. 다른 포트로: PORT=4200 node server.js`); process.exit(1); }
  throw e;
});
