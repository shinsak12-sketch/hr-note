/* =========================================================================
   경리 콕핏 — 무설치(오프라인) 단일 스크립트 버전
   - ES 모듈 대신 일반 스크립트 → index.html 더블클릭(file://)으로 동작
   - 폴더 선택(input webkitdirectory)으로 엑셀 읽기
   - 앱 데이터(설정·계획)는 브라우저(localStorage)에 저장 + 백업 내려받기
   - 3D/디자인은 그대로 유지
   전역 의존: window.XLSX (vendor/xlsx.full.min.js)
   ========================================================================= */
(function () {
"use strict";

/* ------------------------------ 유틸 ------------------------------ */
const h = (html) => { const t=document.createElement("template"); t.innerHTML=String(html).trim(); return t.content.firstElementChild; };
const $ = (s, r=document) => r.querySelector(s);
const el = (id) => document.getElementById(id);

/* 안전한 localStorage (file:// 에서 막히면 메모리 폴백) */
const LS = (function(){
  let ok=true; try{ localStorage.setItem("__t","1"); localStorage.removeItem("__t"); }catch(e){ ok=false; }
  const mem={};
  return {
    ok,
    get(k){ try{ return ok? localStorage.getItem(k) : (mem[k]??null); }catch(e){ return mem[k]??null; } },
    set(k,v){ try{ if(ok) localStorage.setItem(k,v); else mem[k]=v; }catch(e){ mem[k]=v; } },
    del(k){ try{ if(ok) localStorage.removeItem(k); else delete mem[k]; }catch(e){ delete mem[k]; } },
    getJSON(k){ const t=this.get(k); return t? JSON.parse(t):null; },
    setJSON(k,o){ this.set(k, JSON.stringify(o)); },
  };
})();

/* ------------------------------ 포맷 ------------------------------ */
function fmtWon(n){ if(n==null||isNaN(n)) return "-"; return Math.round(n).toLocaleString("ko-KR"); }
const UNIT={"억":1e8,"백만":1e6,"만":1e4,"원":1};
function fmtCompact(n){
  if(n==null||isNaN(n)) return "-";
  const u=(typeof ctx!=="undefined")&&ctx.unit;
  if(u && UNIT[u]){ const f=UNIT[u]; const v=n/f;
    const dp = f>=1e8 ? (Math.abs(v)<10?2:Math.abs(v)<100?1:0) : (f>=1e6? (Math.abs(v)<100?1:0):0);
    return v.toLocaleString("ko-KR",{maximumFractionDigits:dp})+(u==="원"?"":u);
  }
  const a=Math.abs(n), s=n<0?"-":"";
  if(a>=1e8) return s+(a/1e8).toFixed(a>=1e9?0:2).replace(/\.00$/,"")+"억";
  if(a>=1e4) return s+Math.round(a/1e4).toLocaleString("ko-KR")+"만";
  return s+Math.round(a).toLocaleString("ko-KR");
}
function fmtPct(r,dp=0){ if(r==null||isNaN(r))return"-"; return (r*100).toFixed(dp)+"%"; }

/* ------------------------------ 색 ------------------------------ */
function hexToRgb(x){ x=x.replace("#",""); if(x.length===3) x=x.split("").map(c=>c+c).join("");
  return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)]; }
function rgbToHex(r){ return "#"+r.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join(""); }
function mix(h1,h2,t){ const a=hexToRgb(h1),b=hexToRgb(h2); return rgbToHex([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]); }
function shade(hex,amt){ return amt>=0? mix(hex,"#ffffff",amt) : mix(hex,"#000000",-amt); }
const CAT = ["#3987e5","#d95926","#199e70","#c98500","#d55181","#008300","#9085e9","#e66767"];
function catColor(i){ return CAT[i] || "#7f8796"; }
/* 색 = 연말 추정 ÷ 예산 (= 집행률/시간진도). 예산 내면 파랑/초록, 초과 예상이면 빨강 */
const EXEC_STOPS = [[0,"#2f6fe0"],[0.80,"#1f9e6b"],[1.00,"#1f9e6b"],[1.06,"#e0a11a"],[1.15,"#e0631f"],[1.35,"#cf2f2f"]];
function execColor(r, pace){
  let v = pace ? r/Math.max(pace,0.001) : r; if(isNaN(v)) v=0; v=Math.max(0,Math.min(1.35,v));
  for(let i=0;i<EXEC_STOPS.length-1;i++){ const [a,ca]=EXEC_STOPS[i],[b,cb]=EXEC_STOPS[i+1]; if(v<=b) return mix(ca,cb,(v-a)/(b-a)); }
  return EXEC_STOPS[EXEC_STOPS.length-1][1];
}

/* ------------------------------ 집계 ------------------------------ */
function buildTree(leaves){
  const root={children:new Map()};
  for(const r of leaves){
    const path=[r.l1,r.l2,r.l3].filter(x=>x!=null&&x!=="");
    let node=root;
    path.forEach((name,depth)=>{
      if(!node.children.has(name)) node.children.set(name,{name,depth:depth+1,budget:0,actual:0,children:new Map(),leaf:null});
      node=node.children.get(name);
      node.budget+=(r.budget||0); node.actual+=(r.actual||0);
      if(depth===path.length-1) node.leaf=r;
    });
  }
  const toArr=(m)=>[...m.values()].map(n=>({...n,children:toArr(n.children)}));
  return toArr(root.children);
}
const sumBudget=(ns)=>ns.reduce((s,n)=>s+n.budget,0);
const sumActual=(ns)=>ns.reduce((s,n)=>s+n.actual,0);

/* ------------------------------ 샘플 ------------------------------ */
function sampleLeaves(){
  const P=(l1,l2,l3,code,budget,rate)=>({code,l1,l2,l3,budget,actual:Math.round(budget*rate)});
  return [
    P("인건비","급여","기본급","1010",1_080_000_000,.58),
    P("인건비","급여","상여금","1020",240_000_000,.35),
    P("인건비","4대보험","건강보험","1030",96_000_000,.57),
    P("인건비","4대보험","국민연금","1040",88_000_000,.56),
    P("인건비","복리후생","식대","1050",72_000_000,.61),
    P("인건비","복리후생","경조사","1060",18_000_000,.44),
    P("지급수수료","외주","손해사정 위탁","2010",420_000_000,.72),
    P("지급수수료","외주","법률자문","2020",84_000_000,.48),
    P("지급수수료","전산","솔루션 사용료","2030",156_000_000,.63),
    P("지급수수료","전산","클라우드","2040",60_000_000,.70),
    P("임차관리비","사무실","임차료","3010",300_000_000,.58),
    P("임차관리비","사무실","관리비","3020",84_000_000,.60),
    P("임차관리비","차량","유류/리스","3030",66_000_000,.52),
    P("마케팅","광고","온라인","4010",120_000_000,.41),
    P("마케팅","광고","오프라인","4020",48_000_000,.90),
    P("마케팅","영업","접대비","4030",36_000_000,1.08),
    P("일반관리","사무","소모품","5010",30_000_000,.66),
    P("일반관리","사무","통신비","5020",24_000_000,.58),
    P("일반관리","교육","임직원 교육","5030",42_000_000,.29),
    P("일반관리","여비","국내출장","5040",33_000_000,.74),
  ];
}
const sampleFees=()=>[
  {typeCode:"P",type:"대인",band:"소액",rateType:"정액",rate:120000},
  {typeCode:"P",type:"대인",band:"일반",rateType:"정액",rate:250000},
  {typeCode:"P",type:"대인",band:"고액",rateType:"정률",rate:0.03},
  {typeCode:"D",type:"대물",band:"소액",rateType:"정액",rate:90000},
  {typeCode:"D",type:"대물",band:"일반",rateType:"정액",rate:180000},
  {typeCode:"D",type:"대물",band:"고액",rateType:"정률",rate:0.025},
  {typeCode:"C",type:"자차",band:"일반",rateType:"정액",rate:110000},
];
const sampleCaseTypes=()=>[
  {typeCode:"P",type:"대인",desc:"인적 피해 손해사정"},
  {typeCode:"D",type:"대물",desc:"물적 피해 손해사정"},
  {typeCode:"C",type:"자차",desc:"자기차량 손해"},
];

/* ------------------------------ 엑셀 파싱/템플릿 ------------------------------ */
const FILES = { accounts:"계정항목.xlsx", fees:"수수료단가.xlsx", caseTypes:"사고유형.xlsx" };
const norm=(s)=>String(s==null?"":s).trim();
function pick(row, aliases){
  for(const a of aliases){ if(a in row && norm(row[a])!=="") return row[a]; }
  const keys=Object.keys(row);
  for(const a of aliases){ const k=keys.find(k=>norm(k).replace(/\s/g,"")===norm(a).replace(/\s/g,"")); if(k && norm(row[k])!=="") return row[k]; }
  return "";
}
function sheetRows(buf){ const wb=XLSX.read(buf,{type:"array"}); const ws=wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(ws,{defval:""}); }
function parseAccounts(buf){
  const rows=sheetRows(buf), out=[], errs=[];
  rows.forEach((r,i)=>{
    const code=norm(pick(r,["코드","계정코드","code"])), l1=norm(pick(r,["대분류","1분류","l1"]));
    const l2=norm(pick(r,["중분류","2분류","l2"])), l3=norm(pick(r,["소분류","3분류","l3"]));
    if(!code && !l1) return;
    if(!code) errs.push(`${i+2}행: 코드 누락 (${l1||"?"}/${l2}/${l3})`);
    if(!l1) errs.push(`${i+2}행: 대분류 누락 (코드 ${code})`);
    out.push({code,l1,l2,l3,budget:0,actual:0});
  });
  const seen=new Map(); out.forEach(r=>{ if(r.code){ if(seen.has(r.code)) errs.push(`코드 중복: ${r.code}`); seen.set(r.code,1);} });
  return {rows:out, errors:errs};
}
function parseFees(buf){
  const rows=sheetRows(buf), out=[], errs=[];
  rows.forEach((r,i)=>{
    const typeCode=norm(pick(r,["유형코드","typecode","코드"])), type=norm(pick(r,["사고유형","유형","type"]));
    const band=norm(pick(r,["구간","등급","band"])), rateType=norm(pick(r,["단가유형","유형구분","ratetype"]))||"정액";
    let rate=pick(r,["단가","금액","요율","rate"]);
    if(!type && !typeCode) return;
    rate=Number(String(rate).replace(/[,%\s]/g,""));
    if(rateType==="정률" && rate>1) rate=rate/100;
    if(isNaN(rate)) errs.push(`${i+2}행: 단가 숫자 아님 (${type}/${band})`);
    out.push({typeCode,type,band,rateType,rate:isNaN(rate)?0:rate});
  });
  return {rows:out, errors:errs};
}
function parseCaseTypes(buf){
  const rows=sheetRows(buf), out=[], errs=[];
  rows.forEach(r=>{
    const typeCode=norm(pick(r,["유형코드","typecode","코드"])), type=norm(pick(r,["사고유형","유형","type"])), desc=norm(pick(r,["설명","비고","desc"]));
    if(!type && !typeCode) return;
    out.push({typeCode,type,desc});
  });
  return {rows:out, errors:errs};
}
function wbAOA(sheet, aoa, cols){
  const ws=XLSX.utils.aoa_to_sheet(aoa); if(cols) ws["!cols"]=cols.map(w=>({wch:w}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,sheet);
  return XLSX.write(wb,{bookType:"xlsx",type:"array"});
}
const tplAccounts=()=>wbAOA("계정항목",[["코드","대분류","중분류","소분류"],["1010","인건비","급여","기본급"],["1020","인건비","급여","상여금"],["1030","인건비","4대보험","건강보험"],["2010","지급수수료","외주","손해사정 위탁"],["3010","임차관리비","사무실","임차료"],["4010","마케팅","광고","온라인"],["5010","일반관리","사무","소모품"]],[10,16,16,20]);
const tplFees=()=>wbAOA("수수료단가",[["유형코드","사고유형","구간","단가유형","단가"],["P","대인","소액","정액","120000"],["P","대인","일반","정액","250000"],["P","대인","고액","정률","3"],["D","대물","일반","정액","180000"],["C","자차","일반","정액","110000"]],[10,12,10,10,12]);
const tplCaseTypes=()=>wbAOA("사고유형",[["유형코드","사고유형","설명"],["P","대인","인적 피해 손해사정"],["D","대물","물적 피해 손해사정"],["C","자차","자기차량 손해"]],[10,12,28]);

/* ------------------------------ 파일 I/O (무설치) ------------------------------ */
function download(name, data, mime){
  const blob=new Blob([data],{type:mime||"application/octet-stream"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },1500);
}
function pickFile(accept,cb){
  const i=document.createElement("input"); i.type="file"; if(accept)i.accept=accept;
  i.style.display="none"; document.body.appendChild(i);
  i.onchange=()=>{ const f=i.files[0]; i.remove(); if(f) cb(f); }; i.click();
}
function escAttr(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
function pickFolder(cb){
  const inp=document.createElement("input");
  inp.type="file"; inp.multiple=true;
  inp.webkitdirectory=true; inp.setAttribute("webkitdirectory","");
  inp.style.display="none"; document.body.appendChild(inp);
  inp.onchange=()=>{ const files=[...inp.files]; inp.remove(); cb(files); };
  inp.click();
}
async function readMastersFromFiles(files){
  const byName={};
  for(const f of files){ byName[f.name]=f; }
  const folderName = files.length ? (files[0].webkitRelativePath||files[0].name).split("/")[0] : "";
  const readParse=async(name,parser)=>{ const f=byName[name]; if(!f) return {rows:[],errors:[]}; const buf=await f.arrayBuffer(); return parser(buf); };
  const a=await readParse(FILES.accounts,parseAccounts);
  const fe=await readParse(FILES.fees,parseFees);
  const c=await readParse(FILES.caseTypes,parseCaseTypes);
  return { folderName, leaves:a.rows, fees:fe.rows, caseTypes:c.rows,
    errors:{accounts:a.errors,fees:fe.errors,caseTypes:c.errors},
    found:{accounts:!!byName[FILES.accounts],fees:!!byName[FILES.fees],caseTypes:!!byName[FILES.caseTypes]} };
}

/* ============================================================================
   앱 상태 / 라우팅
   ============================================================================ */
const NAV = [
  {id:"home",ico:"🏙️",label:"대시보드",title:"대시보드",sub:"사업비 구성 3D 히트맵"},
  {id:"plan",ico:"🧭",label:"사업비계획",title:"사업비 계획",sub:"산출근거 기반 예산 수립"},
  {id:"variance",ico:"📊",label:"계획대비",title:"계획 vs 실적",sub:"항목별 집행·연말 추정"},
  {id:"income",ico:"💳",label:"수입/수수료",title:"수입 · 수수료",sub:"사고처리건 · 단가"},
  {id:"pnl",ico:"💰",label:"손익/현금",title:"손익 · 현금흐름",sub:"흑자/적자 · 현금 잔액"},
  {id:"masters",ico:"🗄️",label:"기준정보",title:"기준정보",sub:"계정·수수료·사고유형 (엑셀 원천)"},
  {id:"settings",ico:"⚙️",label:"설정",title:"설정",sub:""},
];
const YEAR_SCOPED = new Set(["home","plan","variance","income","pnl","settings"]);

const ctx = {
  route:"home",
  year:new Date().getFullYear(),
  files:null,            // 마지막으로 선택한 폴더의 File[]
  unit:"",               // 금액 표시 단위 ("" = 자동)
  data:emptyData(),
};
function emptyData(){ return {leaves:[],fees:[],caseTypes:[],errors:{},orphans:[],settings:defSettings(),sample:false,folderName:"",cached:false}; }
function defSettings(){ return {openingCash:0,feeLag:1,costLag:0}; }

/* --- 저장/불러오기 (localStorage 캐시) --- */
function dataKey(){ return "cockpit:data:"+ctx.year; }
function setKey(){ return "cockpit:settings:"+ctx.year; }
function loadCache(){
  const d=LS.getJSON(dataKey());
  const s=LS.getJSON(setKey())||defSettings();
  if(d){ ctx.data={...d,settings:s,sample:false,cached:true}; ctx.data.tree=buildTree(ctx.data.leaves||[]); return true; }
  ctx.data=emptyData(); ctx.data.settings=s; return false;
}
function saveCache(){
  const {leaves,fees,caseTypes,errors,orphans,folderName}=ctx.data;
  LS.setJSON(dataKey(),{leaves,fees,caseTypes,errors,orphans,folderName});
}

/* ------------------------------ 액션 ------------------------------ */
const actions = {
  pick(){
    pickFolder(async(files)=>{
      if(!files || !files.length) return;
      ctx.files=files;
      const m=await readMastersFromFiles(files);
      if(!m.found.accounts && !m.found.fees && !m.found.caseTypes){
        toast("warn","엑셀을 못 찾음","선택한 폴더에 계정항목.xlsx 등이 없습니다. 템플릿을 내려받아 넣어주세요.");
      }
      ctx.data={ leaves:m.leaves,fees:m.fees,caseTypes:m.caseTypes,errors:m.errors,orphans:[],
                 settings:LS.getJSON(setKey())||defSettings(), sample:false, folderName:m.folderName, cached:false };
      ctx.data.tree=buildTree(ctx.data.leaves);
      saveCache();
      toast("ok","읽기 완료",`${m.folderName||"폴더"} · 계정 ${m.leaves.length}개`);
      go(ctx.route==="home"?"home":"masters");
    });
  },
  useSample(){
    const leaves=sampleLeaves();
    ctx.data={leaves,fees:sampleFees(),caseTypes:sampleCaseTypes(),errors:{},orphans:[],
      settings:{openingCash:180_000_000,feeLag:1,costLag:0},sample:true,folderName:"",cached:false,tree:buildTree(leaves)};
    toast("ok","샘플 모드","가상 데이터로 둘러봅니다"); go("home");
  },
  downloadTemplates(){
    download(FILES.accounts, tplAccounts(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setTimeout(()=>download(FILES.fees, tplFees()),300);
    setTimeout(()=>download(FILES.caseTypes, tplCaseTypes()),600);
    toast("ok","템플릿 3개 내려받음","다운로드 폴더에서 원하는 폴더로 옮긴 뒤, 엑셀로 편집하고 '폴더에서 읽기' 하세요");
  },
  saveSettings(obj){
    ctx.data.settings=obj; LS.setJSON(setKey(),obj);
    toast("ok","저장됨",`${ctx.year} 설정을 이 브라우저에 저장했습니다`);
  },
  reload(){ actions.pick(); },
};

/* ------------------------------ 렌더 ------------------------------ */
function go(route){ ctx.route=route; render(); }
function render(){
  clearOverlays();
  const content=el("content");
  const meta=NAV.find(n=>n.id===ctx.route)||NAV[0];
  el("viewTitle").textContent=meta.title;
  el("viewSub").textContent=meta.sub||"";
  paintNav(); updateChrome();

  const hasData = ctx.data.sample || (ctx.data.leaves && ctx.data.leaves.length);
  if(!hasData && (ctx.route==="home")){ renderEmpty(content); return; }

  switch(ctx.route){
    case "home": renderHome(content); break;
    case "masters": renderMasters(content); break;
    case "settings": renderSettings(content); break;
    case "plan": renderPlan(content); break;
    case "variance": renderVariance(content); break;
    case "income": renderIncome(content); break;
    case "pnl": renderPnl(content); break;
    default: renderHome(content);
  }
}
function paintNav(){
  const nav=el("nav"); nav.innerHTML="";
  NAV.forEach(n=>{ const b=document.createElement("button");
    b.className="navitem"+(n.id===ctx.route?" is-active":"");
    b.innerHTML=`<span class="ni-ico">${n.ico}</span><span class="ni-lbl">${n.label}</span>`;
    b.title=n.title; b.onclick=()=>go(n.id); nav.appendChild(b); });
}
function updateChrome(){
  const fs=el("folderStat"), ft=el("folderText"), reload=el("reloadBtn"), yp=el("yearPick");
  if(ctx.data.sample){ fs.classList.remove("is-on"); ft.textContent="샘플 모드"; reload.hidden=true; }
  else if(ctx.data.leaves && ctx.data.leaves.length){ fs.classList.add("is-on");
    ft.textContent=(ctx.data.folderName||"읽은 데이터")+(ctx.data.cached?" (저장됨)":""); reload.hidden=false; }
  else { fs.classList.remove("is-on"); ft.textContent="폴더 미선택"; reload.hidden=true; }
  yp.hidden=!YEAR_SCOPED.has(ctx.route);
  el("yearVal").textContent=ctx.year;
}

/* ------------------------------ 빈 상태 ------------------------------ */
function renderEmpty(root){
  root.innerHTML="";
  root.appendChild(h(`
    <div class="empty"><div class="empty__card">
      <div class="empty__ico">🗂️</div>
      <h2>데이터 폴더를 선택하세요</h2>
      <p>서버·설치 없이 동작합니다. 데이터를 모아둘 <b>폴더를 선택</b>하면 그 안의
         엑셀(계정항목·수수료단가·사고유형)을 읽습니다. 데이터는 <b>전부 내 PC</b>에만 있습니다.</p>
      <div class="empty__actions">
        <button class="btn btn--primary" id="btnPick">📂 폴더 선택해서 읽기</button>
        <button class="btn" id="btnTpl">📥 템플릿 엑셀 내려받기</button>
        <button class="btn btn--ghost" id="btnSample">✨ 샘플로 둘러보기</button>
      </div>
      <div class="empty__hint">처음이면 <b>템플릿 내려받기</b> → 다운로드된 엑셀 3개를 폴더에 넣고 편집 → <b>폴더 선택해서 읽기</b> 순서로 하세요.</div>
    </div></div>`));
  $("#btnPick",root).onclick=actions.pick;
  $("#btnTpl",root).onclick=actions.downloadTemplates;
  $("#btnSample",root).onclick=actions.useSample;
}

/* ------------------------------ 연도 진도(pace) / 추정 ------------------------------ */
function yearPace(year){
  const now=new Date(), y=now.getFullYear();
  if(year<y) return 1; if(year>y) return 0.02;
  const s=new Date(y,0,1), e=new Date(y+1,0,1);
  return Math.min(1,Math.max(0.02,(now-s)/(e-s)));
}
function forecast(actual,pace){ return pace>0? actual/pace : actual; }

/* ------------------------------ 홈 (대시보드) ------------------------------ */
function renderHome(root){
  const leaves=ctx.data.leaves||[]; root.innerHTML="";
  if(!leaves.length){ root.appendChild(h(`<div class="soon"><div class="big">📊</div>
    <h3>표시할 사업비 데이터가 없습니다</h3><p>기준정보에서 폴더를 읽거나, 샘플로 둘러보세요.</p></div>`)); return; }
  const tree=buildTree(leaves);
  const pace=yearPace(Number(ctx.year));
  const curMonth=currentMonth(Number(ctx.year));

  const crumbBar=h(`<div class="crumbbar" id="crumbbar"></div>`);
  const kpis=h(`<div class="kpis" id="kpis"></div>`);
  const layout=h(`<div class="grid-2" style="grid-template-columns:1.62fr 1fr;align-items:stretch"></div>`);
  const vizCard=h(`<div class="card city-wrap" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
    <div class="card__hd" style="padding:14px 16px 12px">
      <div><div class="card__title"><span class="dot" style="background:var(--cat-1)"></span>사업비 구성</div>
        <div class="card__sub" id="vizSub">면적=예산 · 높이=집행 · 색=연말 추정(초과 예상=빨강)</div></div>
      <div class="viztoggle" id="vizToggle">
        <button data-v="city" class="is-on">🏙️ 3D</button>
        <button data-v="donut">◔ 비중</button>
        <button data-v="bars">▦ 막대</button>
      </div>
    </div>
    <div class="vizbody" id="vizbody" style="flex:1"></div></div>`);
  const side=h(`<div id="sidewrap"></div>`);
  layout.append(vizCard, side);
  const monthCard=h(`<div class="card" style="margin-top:18px"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-4)"></span>월별 계획 vs 집행 <span id="monthScope" style="color:var(--ink-mut);font-weight:500"></span></div>
    <div class="card__sub">회색=계획 · 색=집행(당월까지) · 점선=오늘</div></div></div>
    <div class="card__bd" id="monthbd" style="padding-top:8px"></div></div>`);
  root.append(crumbBar, kpis, layout, monthCard);

  const state={path:[], pace, viz:"city", curMonth, tree, cityEl:h(`<div class="city"></div>`)};
  function scopeNodes(){ let ns=tree; for(const name of state.path){ const f=ns.find(n=>n.name===name); if(!f) break; ns=f.children; } return ns; }
  state.scopeNodes=scopeNodes;
  state.update=function(){
    const nodes=scopeNodes();
    renderCrumbBar(crumbBar, state);
    renderKpis(kpis, nodes, pace, state.path);
    side.innerHTML=""; side.appendChild(renderRankPanel(nodes, pace, state.path, state));
    renderViz($("#vizbody",vizCard), nodes, state);
    renderMonthly($("#monthbd",monthCard), nodes, pace, curMonth);
    $("#monthScope",monthCard).textContent = state.path.length? "· "+state.path[state.path.length-1] : "· 전체";
    el("viewSub").textContent = state.path.length? "현재 보기: "+state.path.join(" › ") : "사업비 구성 · 월별 추이";
  };
  $("#vizToggle",vizCard).querySelectorAll("button").forEach(b=>b.onclick=()=>{
    state.viz=b.dataset.v;
    $("#vizToggle",vizCard).querySelectorAll("button").forEach(x=>x.classList.toggle("is-on",x===b));
    renderViz($("#vizbody",vizCard), scopeNodes(), state);
  });
  state.update();
}
function renderViz(container, nodes, state){
  container.innerHTML="";
  if(state.viz==="donut") buildDonut(container, nodes, state);
  else if(state.viz==="bars") buildBars(container, nodes, state);
  else { container.appendChild(state.cityEl); buildCity(state.cityEl, nodes, state); }
}
/* 상단 경로바 (세부 ↔ 전체 이동을 쉽게) */
function renderCrumbBar(bar, state){
  const path=state.path||[]; bar.innerHTML="";
  const back=h(`<button class="crumbbar__back" ${path.length?"":"disabled"}>◀ 뒤로</button>`);
  back.onclick=()=>{ if(path.length){ state.path=path.slice(0,-1); state.update(); } };
  bar.appendChild(back);
  const chips=h(`<div class="crumbbar__path"></div>`);
  const home=h(`<button class="crumbbar__chip ${path.length?"":"is-cur"}">🏙️ 전체</button>`);
  home.onclick=()=>{ state.path=[]; state.update(); };
  chips.appendChild(home);
  path.forEach((p,idx)=>{ chips.append(h(`<span class="crumbbar__sep">›</span>`));
    const c=h(`<button class="crumbbar__chip ${idx===path.length-1?"is-cur":""}">${p}</button>`);
    c.onclick=()=>{ state.path=path.slice(0,idx+1); state.update(); }; chips.appendChild(c); });
  bar.appendChild(chips);
}
function renderKpis(container, nodes, pace, path){
  const totB=sumBudget(nodes), totA=sumActual(nodes), rate=totB? totA/totB:0;
  const proj=forecast(totA,pace), projDiff=proj-totB;
  const overCount=nodes.filter(n=>forecast(n.actual,pace)>n.budget*1.0001).length;
  const scope = path.length? path[path.length-1] : "전체";
  const kpi=(label,val,unit,accent,delta)=>h(`<div class="kpi" style="--accent:${accent}">
    <div class="kpi__label">${label}</div><div class="kpi__val">${val}<span class="unit">${unit||""}</span></div>${delta||""}</div>`);
  container.innerHTML="";
  container.append(
    kpi(`계획 사업비 · ${scope}`, fmtCompact(totB),"원","var(--cat-1)",
        `<div class="kpi__delta" style="color:var(--ink-mut)">잔여 ${fmtCompact(totB-totA)}</div>`),
    kpi("집행액", fmtCompact(totA),"원","var(--cat-3)",
        `<div class="kpi__delta ${rate<=pace?'up':'down'}">집행률 ${fmtPct(rate,1)} · 시간 ${fmtPct(pace,0)} 경과</div>`),
    kpi("연말 추정(이 속도면)", fmtCompact(proj),"원", projDiff>0?"var(--st-crit)":"var(--st-good)",
        `<div class="kpi__delta ${projDiff>0?'down':'up'}">계획 대비 ${projDiff>0?'▲ 초과 '+fmtCompact(projDiff):'▼ 여유 '+fmtCompact(-projDiff)}</div>`),
    kpi("초과 예상 항목", String(overCount),"개", overCount?"var(--st-crit)":"var(--st-good)",
        `<div class="kpi__delta ${overCount?'down':'up'}">${overCount?'연말 초과 예상':'모두 예산 내'}</div>`),
  );
}
function renderRankPanel(nodes, pace, path, state){
  const rows=[...nodes].sort((a,b)=>b.budget-a.budget);
  const title = path.length? path[path.length-1]+" · 하위 항목" : "대분류 집행 현황";
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-3)"></span>${title}</div>
    <div class="card__sub">막대=집행률 · 색=시간 대비 속도 · ◆=연말 추정</div></div></div>
    <div class="card__bd" id="rankbd" style="padding-top:6px"></div></div>`);
  const bd=$("#rankbd",card);
  rows.forEach((n,i)=>{ const r=n.budget? n.actual/n.budget:0, col=execColor(r,pace);
    const proj=forecast(n.actual,pace), projPct=n.budget? proj/n.budget:0, over=proj>n.budget*1.0001;
    const rowEl=h(`<div class="rankrow" style="padding:11px 2px;border-bottom:1px solid var(--line);cursor:${n.children&&n.children.length?'pointer':'default'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
        <div style="font-weight:650;display:flex;gap:9px;align-items:center"><span class="swatch" style="width:10px;height:10px;border-radius:3px;background:${catColor(i)}"></span>${n.name}</div>
        <div style="font-variant-numeric:tabular-nums;font-size:12.5px"><b>${fmtCompact(n.actual)}</b><span style="color:var(--ink-mut)"> / ${fmtCompact(n.budget)}</span></div>
      </div>
      <div style="height:8px;border-radius:99px;background:var(--surface-3);overflow:hidden;position:relative">
        <i style="display:block;height:100%;width:${Math.min(100,r*100)}%;background:${col};border-radius:99px"></i>
        <span title="연말 추정 위치" style="position:absolute;left:calc(${Math.min(100,projPct*100)}% - 4px);top:-2px;color:${over?'var(--st-crit)':'var(--ink-2)'};font-size:10px">◆</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:11px;color:var(--ink-mut)">
        <span>집행률 ${fmtPct(r,1)}</span><span style="color:${over?'var(--st-crit)':'var(--ink-mut)'}">연말 추정 ${fmtPct(projPct,0)}${over?' ⚠':''}</span></div>
    </div>`);
    if(n.children && n.children.length) rowEl.onclick=()=>{ state.path=path.concat([n.name]); state.update(); };
    bd.appendChild(rowEl); });
  return card;
}

/* --- 3D 도시 (정방향·전체 바닥·상시 라벨·초과 느낌표) --- */
function layoutKey(state){ return "cockpit:layout:"+ctx.year+":"+((state.path||[]).join(">")||"root"); }
const D2R=Math.PI/180;
function project(rx,ry,rz,yaw,tilt,zoom){
  const cy=Math.cos(yaw*D2R), sy=Math.sin(yaw*D2R), ct=Math.cos(tilt*D2R), st=Math.sin(tilt*D2R);
  const X=rx*cy-ry*sy, Y=rx*sy+ry*cy;
  return [X*zoom, (Y*ct - rz*st)*zoom];
}
function buildCity(cityEl, nodes, state){
  const pace=state.pace||0;
  cityEl.innerHTML=`
    <div class="city__spin">
      <button class="iconbtn" id="rotL" title="왼쪽 회전">⟲</button>
      <button class="iconbtn" id="rotR" title="오른쪽 회전">⟳</button>
      <button class="iconbtn" id="zReset" title="정방향 초기화" style="font-size:14px">⌂</button>
    </div>
    <div class="city__stage" id="stage"></div>
    <div class="city__labels" id="labels"></div>
    <div class="city__legend"><div>색 = 연말 추정 ÷ 예산</div><div class="legend__bar"></div>
      <div class="legend__scale"><span>여유</span><span>정상</span><span>주의</span><span>초과</span></div></div>`;
  const stage=$("#stage",cityEl), labels=$("#labels",cityEl);
  stage.style.transition="transform .12s ease-out";

  const layCols=Math.ceil(Math.sqrt(nodes.length))||1, layRows=Math.ceil(nodes.length/layCols), cell=128;
  const floorCols=Math.max(6,layCols+2), floorRows=Math.max(4,layRows+1);
  const offC=Math.floor((floorCols-layCols)/2), offR=Math.floor((floorRows-layRows)/2);
  const boardW=floorCols*cell, boardH=floorRows*cell;
  const maxB=Math.max(...nodes.map(n=>n.budget),1), maxA=Math.max(...nodes.map(n=>n.actual),1);

  if(cityEl._yaw==null){ cityEl._yaw=0; cityEl._tilt=58; cityEl._zoom=null; }
  // 화면에 맞게 초기 줌
  if(cityEl._zoom==null){
    const ct=Math.cos(58*D2R), st=Math.sin(58*D2R);
    const projW=boardW, projH=boardH*ct+250*st;
    cityEl._zoom=Math.max(.35,Math.min((cityEl.clientWidth-46)/projW,(cityEl.clientHeight-56)/projH,1.1));
  }
  function origin(){ return [cityEl.clientWidth*0.5, cityEl.clientHeight*0.60]; }
  const board=h(`<div class="board" style="left:${-boardW/2}px;top:${-boardH/2}px;width:${boardW}px;height:${boardH}px;--cell:${cell}px"></div>`);
  stage.appendChild(board);

  const saved=LS.getJSON(layoutKey(state))||{};
  const items=[];
  nodes.forEach((n,i)=>{
    const def={gx:offC+(i%layCols), gy:offR+Math.floor(i/layCols)};
    const g=saved[n.name]||def;
    const fp=40+66*Math.sqrt(n.budget/maxB), hz=14+186*(n.actual/maxA);
    const r=n.budget? n.actual/n.budget:0, base=execColor(r,pace);
    const proj=forecast(n.actual,pace), over=proj>n.budget*1.0001;
    const cTop=shade(base,.22), cA=shade(base,-.12), cB=shade(base,-.34);
    const bx=g.gx*cell+(cell-fp)/2, by=g.gy*cell+(cell-fp)/2;
    const bldg=h(`<div class="bldg" style="left:${bx}px;top:${by}px;width:${fp}px;height:${fp}px">
      <div class="bldg__face" style="width:${fp}px;height:${fp}px;background:${cTop};transform:translateZ(${hz}px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)"></div>
      <div class="bldg__face" style="width:${fp}px;height:${hz}px;background:${cA};transform-origin:0 0;transform:rotateX(90deg)"></div>
      <div class="bldg__face" style="width:${fp}px;height:${hz}px;background:${cA};transform-origin:0 0;transform:translateY(${fp}px) rotateX(90deg)"></div>
      <div class="bldg__face" style="width:${hz}px;height:${fp}px;background:${cB};transform-origin:0 0;transform:rotateY(-90deg)"></div>
      <div class="bldg__face" style="width:${hz}px;height:${fp}px;background:${cB};transform-origin:0 0;transform:translateX(${fp}px) rotateY(-90deg)"></div>
    </div>`);
    board.appendChild(bldg);
    bldg._node=n; bldg._fp=fp; bldg._hz=hz;
    // 상시 라벨(스크린 오버레이) + 초과 느낌표
    const lab=h(`<div class="blabel ${over?'is-over':''}">
      ${over?`<span class="blabel__bang" title="연말 예산 초과 예상">!</span>`:""}
      <div class="blabel__name">${n.name}</div>
      <div class="blabel__num"><b style="color:${base}">${fmtPct(r,0)}</b> · ${fmtCompact(n.actual)}</div>
    </div>`);
    labels.appendChild(lab);
    bldg._lab=lab; items.push(bldg);
    bldg.addEventListener("pointerenter",(e)=>{ if(!cityEl._drag){ showTip(e,n,pace); lab.classList.add("hi"); } });
    bldg.addEventListener("pointermove",(e)=>{ if(!cityEl._drag) moveTip(e); });
    bldg.addEventListener("pointerleave",()=>{ hideTip(); lab.classList.remove("hi"); });
    bldg.addEventListener("pointerdown",(e)=>startBldgDrag(e,cityEl,board,bldg,state,cell,floorCols,floorRows,positionLabels));
  });

  function positionLabels(){
    const [ox,oy]=origin();
    for(const b of items){
      const cx=parseFloat(b.style.left)+b._fp/2 - boardW/2;
      const cy=parseFloat(b.style.top)+b._fp/2 - boardH/2;
      const [sx,sy]=project(cx,cy,b._hz+18,cityEl._yaw,cityEl._tilt,cityEl._zoom);
      b._lab.style.left=(ox+sx)+"px"; b._lab.style.top=(oy+sy)+"px";
    }
  }
  function applyView(){ stage.style.transform=`translate(-50%,-50%) rotateX(${cityEl._tilt}deg) rotateZ(${cityEl._yaw}deg) scale(${cityEl._zoom})`; positionLabels(); }
  cityEl._positionLabels=positionLabels; cityEl._applyView=applyView;
  applyView();

  cityEl.onpointerdown=(e)=>{ if(e.target.closest(".bldg")||e.target.closest(".iconbtn")) return; startOrbit(e,cityEl,applyView); };
  cityEl.onwheel=(e)=>{ e.preventDefault(); cityEl._zoom=Math.min(2.4,Math.max(.3,cityEl._zoom*(e.deltaY<0?1.1:0.9))); applyView(); };
  cityEl.addEventListener("pointerleave", hideTip);
  $("#rotL",cityEl).onclick=()=>{ cityEl._yaw-=22; applyView(); };
  $("#rotR",cityEl).onclick=()=>{ cityEl._yaw+=22; applyView(); };
  $("#zReset",cityEl).onclick=()=>{ cityEl._yaw=0; cityEl._tilt=58; cityEl._zoom=null; buildCity(cityEl,nodes,state); };
}
function startOrbit(e,cityEl,applyView){
  cityEl._drag="orbit"; hideTip();
  const sx=e.clientX, sy=e.clientY, y0=cityEl._yaw, t0=cityEl._tilt;
  const mv=(ev)=>{ cityEl._yaw=y0+(ev.clientX-sx)*0.35; cityEl._tilt=Math.min(80,Math.max(18,t0-(ev.clientY-sy)*0.25)); applyView(); };
  const up=()=>{ cityEl._drag=null; window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up); };
  window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up);
}
function startBldgDrag(e,cityEl,board,bldg,state,cell,cols,rows,positionLabels){
  e.stopPropagation(); hideTip();
  const sx=e.clientX, sy=e.clientY;
  const startLeft=parseFloat(bldg.style.left), startTop=parseFloat(bldg.style.top);
  const yaw=cityEl._yaw*Math.PI/180, tilt=cityEl._tilt*Math.PI/180, zoom=cityEl._zoom;
  const cos=Math.cos(yaw), sin=Math.sin(yaw), ct=Math.max(0.15,Math.cos(tilt));
  let moved=false;
  const mv=(ev)=>{
    const dsx=(ev.clientX-sx), dsy=(ev.clientY-sy);
    if(!moved && Math.hypot(dsx,dsy)<5) return;
    moved=true; cityEl._drag="bldg"; bldg.style.zIndex=50; bldg._lab&&bldg._lab.classList.add("hi");
    // 화면 이동량 → 보드 평면 이동량(회전/틸트/줌 역변환)
    const xp=dsx/zoom, yp=(dsy/zoom)/ct;
    const dbx= xp*cos + yp*sin, dby= -xp*sin + yp*cos;
    bldg.style.left=(startLeft+dbx)+"px"; bldg.style.top=(startTop+dby)+"px";
    positionLabels&&positionLabels();
  };
  const up=()=>{
    window.removeEventListener("pointermove",mv); window.removeEventListener("pointerup",up);
    if(moved){
      const fp=bldg._fp;
      let gx=Math.round((parseFloat(bldg.style.left)-(cell-fp)/2)/cell);
      let gy=Math.round((parseFloat(bldg.style.top)-(cell-fp)/2)/cell);
      gx=Math.min(cols-1,Math.max(0,gx)); gy=Math.min(rows-1,Math.max(0,gy));
      const saved=LS.getJSON(layoutKey(state))||{};
      saved[bldg._node.name]={gx,gy}; LS.setJSON(layoutKey(state),saved);
      bldg.style.zIndex="";
      setTimeout(()=>state.update(),0);   // 스냅 반영 재배치
    }
    cityEl._drag=null;
  };
  window.addEventListener("pointermove",mv); window.addEventListener("pointerup",up);
  // 이동이 아니면(클릭) 드릴다운
  const clickUp=()=>{ window.removeEventListener("pointerup",clickUp);
    if(!moved && bldg._node.children && bldg._node.children.length){ cityEl.classList.add("is-drill"); state.path=(state.path||[]).concat([bldg._node.name]); state.update(); } };
  window.addEventListener("pointerup",clickUp);
}
function renderCrumb(cityEl, state){
  const hud=$("#hud",cityEl); if(!hud) return; const path=state.path||[]; hud.innerHTML="";
  const crumb=h(`<div class="city__crumb"></div>`);
  const home=h(`<button>🏙️ 전체</button>`); home.onclick=()=>{ cityEl.classList.remove("is-drill"); state.path=[]; state.update(); };
  crumb.appendChild(home);
  path.forEach((p,idx)=>{ crumb.append(h(`<span>›</span>`)); const b=h(`<button><b>${p}</b></button>`);
    b.onclick=()=>{ state.path=path.slice(0,idx+1); state.update(); }; crumb.appendChild(b); });
  hud.appendChild(crumb);
}
/* --- 도넛(비중) --- */
function buildDonut(container, nodes, state){
  container.innerHTML="";
  const rows=[...nodes].map((n,i)=>({n,i})).sort((a,b)=>b.n.budget-a.n.budget);
  const tot=sumBudget(nodes)||1;
  const R=120, r=78, C=2*Math.PI*R, cx=150, cy=150;
  const wrap=h(`<div class="donutwrap"></div>`);
  const svg=`<svg class="donut" viewBox="0 0 300 300" width="300" height="300">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--surface-3)" stroke-width="${R-r}"/>
    ${rows.map((o,k)=>{ const f=o.n.budget/tot; const off=rows.slice(0,k).reduce((s,x)=>s+x.n.budget/tot,0);
      return `<circle class="donut__seg" data-name="${o.n.name}" cx="${cx}" cy="${cy}" r="${R}" fill="none"
        stroke="${catColor(o.i)}" stroke-width="${R-r}" stroke-dasharray="${f*C} ${C}"
        stroke-dashoffset="${-off*C}" transform="rotate(-90 ${cx} ${cy})"/>`; }).join("")}
    <text x="${cx}" y="${cy-6}" text-anchor="middle" fill="var(--ink-mut)" font-size="12">총 계획예산</text>
    <text x="${cx}" y="${cy+18}" text-anchor="middle" fill="var(--ink)" font-size="21" font-weight="800">${fmtCompact(tot)}</text>
  </svg>`;
  const legend=h(`<div class="donutleg"></div>`);
  rows.forEach((o)=>{ const share=o.n.budget/tot; const r2=o.n.budget?o.n.actual/o.n.budget:0;
    const row=h(`<div class="dleg ${o.n.children&&o.n.children.length?'clk':''}">
      <span class="swatch" style="background:${catColor(o.i)}"></span>
      <span class="dleg__nm">${o.n.name}</span>
      <span class="dleg__pc">${fmtPct(share,0)}</span>
      <span class="dleg__am">${fmtCompact(o.n.budget)}</span></div>`);
    if(o.n.children&&o.n.children.length) row.onclick=()=>{ state.path=state.path.concat([o.n.name]); state.update(); };
    legend.appendChild(row); });
  wrap.innerHTML=svg; wrap.appendChild(legend);
  container.appendChild(wrap);
  wrap.querySelectorAll(".donut__seg").forEach(seg=>{
    seg.addEventListener("pointerenter",()=>seg.style.strokeWidth=(R-r+8)+"px");
    seg.addEventListener("pointerleave",()=>seg.style.strokeWidth=(R-r)+"px");
    seg.addEventListener("click",()=>{ const nm=seg.dataset.name; const nn=nodes.find(x=>x.name===nm);
      if(nn&&nn.children&&nn.children.length){ state.path=state.path.concat([nm]); state.update(); } });
  });
}
/* --- 2D 가로 막대(정밀) --- */
function buildBars(container, nodes, state){
  container.innerHTML="";
  const pace=state.pace||0;
  const rows=[...nodes].sort((a,b)=>b.budget-a.budget);
  const wrap=h(`<div class="hbars"></div>`);
  rows.forEach((n,i)=>{ const r=n.budget?n.actual/n.budget:0, col=execColor(r,pace);
    const proj=forecast(n.actual,pace), pj=n.budget?proj/n.budget:0, over=proj>n.budget*1.0001;
    const row=h(`<div class="hbar ${n.children&&n.children.length?'clk':''}">
      <div class="hbar__lbl"><span class="swatch" style="background:${catColor(i)}"></span>${n.name}${over?' <span class="bang-i">!</span>':''}</div>
      <div class="hbar__track">
        <i style="width:${Math.min(100,r*100)}%;background:${col}"></i>
        <span class="hbar__proj" style="left:${Math.min(100,pj*100)}%" title="연말 추정"></span>
      </div>
      <div class="hbar__val"><b>${fmtCompact(n.actual)}</b><span> / ${fmtCompact(n.budget)}</span><br>
        <span class="${over?'ov':''}">집행 ${fmtPct(r,0)} · 추정 ${fmtPct(pj,0)}</span></div>
    </div>`);
    if(n.children&&n.children.length) row.onclick=()=>{ state.path=state.path.concat([n.name]); state.update(); };
    wrap.appendChild(row); });
  container.appendChild(wrap);
}
/* --- 월별 계획 vs 집행 --- */
const MONTH_W=[0.92,0.86,0.95,1.0,1.06,1.0,0.97,1.02,1.05,1.06,1.08,1.13];
function currentMonth(year){ const now=new Date(), y=now.getFullYear(); if(year<y) return 12; if(year>y) return 0; return now.getMonth()+1; }
function monthlySeries(totB,totA,curMonth){
  const ws=MONTH_W.reduce((a,b)=>a+b,0);
  const plan=MONTH_W.map(w=>totB*w/ws);
  let ew=0; for(let m=0;m<curMonth;m++) ew+=MONTH_W[m];
  const actual=MONTH_W.map((w,m)=> m<curMonth ? (ew>0? totA*w/ew : 0) : null);
  return {plan,actual};
}
function renderMonthly(container, nodes, pace, curMonth){
  container.innerHTML="";
  const totB=sumBudget(nodes), totA=sumActual(nodes);
  const {plan,actual}=monthlySeries(totB,totA,curMonth);
  const maxV=Math.max(...plan, ...actual.filter(x=>x!=null), 1);
  const bars=h(`<div class="mbars"></div>`);
  for(let m=0;m<12;m++){
    const ph=Math.round(plan[m]/maxV*100), ah=actual[m]!=null?Math.round(actual[m]/maxV*100):0;
    const acol=actual[m]!=null? execColor(plan[m]?actual[m]/plan[m]:0,1) : "var(--cat-3)";
    const col=h(`<div class="mcol ${m+1===curMonth?'is-now':''}" title="${m+1}월 · 계획 ${fmtCompact(plan[m])}${actual[m]!=null?' · 집행 '+fmtCompact(actual[m]):''}">
      <div class="mcol__bars">
        <div class="mbar plan" style="height:${ph}%"></div>
        <div class="mbar act" style="height:${ah}%;background:${acol}"></div>
      </div>
      <div class="mcol__lbl">${m+1}</div></div>`);
    bars.appendChild(col);
  }
  const legend=h(`<div style="display:flex;gap:16px;justify-content:flex-end;margin-bottom:8px;font-size:11.5px;color:var(--ink-mut)">
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--surface-3);border:1px solid var(--line-2);vertical-align:-1px"></span> 계획</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--cat-3);vertical-align:-1px"></span> 집행(당월까지)</span>
    <span>계획 합계 ${fmtCompact(totB)} · 집행 ${fmtCompact(totA)}</span></div>`);
  container.append(legend, bars);
}

let tipEl=null;
function tip(){ if(!tipEl){ tipEl=h(`<div class="city-tip"></div>`); document.body.appendChild(tipEl);} return tipEl; }
function showTip(e,n,pace){ const r=n.budget? n.actual/n.budget:0, t=tip(), col=execColor(r,pace);
  const proj=forecast(n.actual,pace), over=proj>n.budget*1.0001;
  t.innerHTML=`<div class="city-tip__t"><span class="swatch" style="background:${col}"></span>${n.name}</div>
    <div class="city-tip__row"><span>계획예산</span><b>${fmtWon(n.budget)}원</b></div>
    <div class="city-tip__row"><span>집행액</span><b>${fmtWon(n.actual)}원</b></div>
    <div class="city-tip__row"><span>잔여</span><b>${fmtWon(n.budget-n.actual)}원</b></div>
    <div class="city-tip__bar"><i style="width:${Math.min(100,r*100)}%;background:${col}"></i></div>
    <div class="city-tip__row" style="margin-top:7px"><span>집행률 (시간 ${fmtPct(pace,0)})</span><b style="color:${col}">${fmtPct(r,1)}</b></div>
    <div class="city-tip__row"><span>연말 추정</span><b style="color:${over?'var(--st-crit)':'var(--st-good)'}">${fmtWon(proj)}원${over?' ⚠초과':''}</b></div>
    ${n.children&&n.children.length?`<div class="city-tip__row"><span style="color:var(--cat-1)">클릭 → 하위 ${n.children.length}개 · 드래그 → 이동</span></div>`:`<div class="city-tip__row"><span style="color:var(--ink-mut)">드래그 → 이동</span></div>`}`;
  moveTip(e); t.classList.add("show"); }
function moveTip(e){ const t=tip(); t.style.left=Math.min(e.clientX+16,innerWidth-t.offsetWidth-12)+"px"; t.style.top=Math.min(e.clientY+16,innerHeight-t.offsetHeight-12)+"px"; }
function hideTip(){ if(tipEl) tipEl.classList.remove("show"); }
function clearOverlays(){ hideTip(); }

/* ------------------------------ 기준정보 ------------------------------ */
function renderMasters(root){
  root.innerHTML=""; const d=ctx.data;
  const errs=[...(d.errors?.accounts||[]),...(d.errors?.fees||[]),...(d.errors?.caseTypes||[])];
  if(!d.leaves?.length){
    root.appendChild(h(`<div class="banner banner--warn"><div class="banner__ico">📄</div><div class="banner__body">
      <b>아직 계정항목 엑셀이 없습니다.</b> 아래 <b>템플릿 내려받기</b> → 폴더에 넣고 편집 → <b>폴더에서 읽기</b> 하세요.</div></div>`));
  } else if(errs.length){
    root.appendChild(h(`<div class="banner banner--crit"><div class="banner__ico">⚠️</div><div class="banner__body">
      <b>검증 경고 ${errs.length}건</b><ul>${errs.slice(0,6).map(e=>`<li>${e}</li>`).join("")}</ul></div></div>`));
  } else {
    root.appendChild(h(`<div class="banner banner--ok"><div class="banner__ico">✅</div><div class="banner__body">
      <b>정상</b> 계정 ${d.leaves.length}개 · 수수료단가 ${d.fees?.length||0}개 · 사고유형 ${d.caseTypes?.length||0}개 읽음.</div></div>`));
  }
  const bar=h(`<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn btn--primary" id="pickBtn">📂 폴더에서 읽기 / 다시 읽기</button>
    <button class="btn" id="tplBtn">📥 템플릿 엑셀 내려받기</button>
    ${d.sample?`<span class="tag tag--warn">샘플 모드</span>`:(d.leaves?.length?`<span class="tag">📁 ${d.folderName||"읽은 데이터"}</span>`:"")}
  </div>`);
  root.appendChild(bar);
  $("#pickBtn",bar).onclick=actions.pick; $("#tplBtn",bar).onclick=actions.downloadTemplates;

  const grid=h(`<div class="grid-2" style="grid-template-columns:1.5fr 1fr;align-items:start"></div>`);
  grid.appendChild(renderAccountTree(d.leaves||[]));
  const side=h(`<div style="display:flex;flex-direction:column;gap:18px"></div>`);
  side.appendChild(renderFeeTable(d.fees||[])); side.appendChild(renderCaseTypes(d.caseTypes||[]));
  grid.appendChild(side); root.appendChild(grid);
}
function renderAccountTree(leaves){
  const tree=buildTree(leaves);
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-1)"></span>계정 항목 (대·중·소)</div>
    <div class="card__sub">엑셀 계정항목.xlsx · 총 ${leaves.length}개 소분류</div></div></div>
    <div class="card__bd"><div class="tree" id="tree"></div></div></div>`);
  const t=$("#tree",card);
  tree.forEach((n1,i)=>{ const col=catColor(i);
    const node1=h(`<div class="tnode"><div class="trow lvl1"><span class="twist">▾</span>
      <span class="tlabel"><span class="swatch" style="background:${col}"></span>${n1.name}</span>
      <span style="color:var(--ink-mut);font-size:12px">${n1.children.length}개 중분류</span></div><div class="tchildren"></div></div>`);
    const c1=node1.querySelector(".tchildren");
    n1.children.forEach(n2=>{ const node2=h(`<div class="tnode"><div class="trow"><span class="twist">▾</span>
        <span class="tlabel">${n2.name}</span><span style="color:var(--ink-mut);font-size:12px">${n2.children.length}</span></div><div class="tchildren"></div></div>`);
      const c2=node2.querySelector(".tchildren");
      n2.children.forEach(n3=>c2.appendChild(h(`<div class="trow"><span class="twist" style="visibility:hidden">•</span>
        <span class="tlabel">${n3.name}</span><span class="tcode">${n3.leaf?.code||""}</span></div>`)));
      c1.appendChild(node2); wireTwist(node2); });
    t.appendChild(node1); wireTwist(node1); });
  return card;
}
function wireTwist(node){ const row=node.querySelector(".trow"), tw=row.querySelector(".twist"), kids=node.querySelector(".tchildren");
  if(!kids) return; tw.addEventListener("click",()=>{ kids.classList.toggle("collapsed"); tw.classList.toggle("closed"); }); }
function renderFeeTable(fees){
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-2)"></span>수수료 단가표</div>
    <div class="card__sub">사고유형 × 구간 · 수수료단가.xlsx</div></div></div>
    <div class="card__bd" style="padding-top:6px"><div id="ft"></div></div></div>`);
  const bd=$("#ft",card);
  if(!fees.length){ bd.innerHTML=`<div style="color:var(--ink-mut);padding:12px 0">데이터 없음</div>`; return card; }
  const tbl=h(`<table class="tbl"><thead><tr><th>사고유형</th><th>구간</th><th>구분</th><th class="num">단가</th></tr></thead><tbody></tbody></table>`);
  const tb=tbl.querySelector("tbody");
  fees.forEach(f=>tb.appendChild(h(`<tr><td>${f.type}</td><td>${f.band||"-"}</td>
    <td><span class="tag ${f.rateType==='정률'?'tag--warn':''}">${f.rateType}</span></td>
    <td class="num">${f.rateType==="정률"?fmtPct(f.rate,1):fmtWon(f.rate)+"원"}</td></tr>`)));
  bd.appendChild(tbl); return card;
}
function renderCaseTypes(types){
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-7)"></span>사고 유형</div>
    <div class="card__sub">사고유형.xlsx</div></div></div>
    <div class="card__bd" style="padding-top:6px"><div id="ct"></div></div></div>`);
  const bd=$("#ct",card);
  if(!types.length){ bd.innerHTML=`<div style="color:var(--ink-mut);padding:12px 0">데이터 없음</div>`; return card; }
  const tbl=h(`<table class="tbl"><thead><tr><th>코드</th><th>유형</th><th>설명</th></tr></thead><tbody></tbody></table>`);
  const tb=tbl.querySelector("tbody");
  types.forEach(t=>tb.appendChild(h(`<tr><td><span class="tcode">${t.typeCode}</span></td><td>${t.type}</td><td style="color:var(--ink-2)">${t.desc||"-"}</td></tr>`)));
  bd.appendChild(tbl); return card;
}

/* ------------------------------ 설정 ------------------------------ */
/* ============================================================================
   나머지 화면 (더미/샘플 데이터 기반 미리보기)
   ============================================================================ */
function kpiRow(items){ const row=h(`<div class="kpis"></div>`);
  items.forEach(k=>row.appendChild(h(`<div class="kpi" style="--accent:${k.accent||'var(--cat-1)'}">
    <div class="kpi__label">${k.label}</div><div class="kpi__val">${k.val}<span class="unit">${k.unit||""}</span></div>
    ${k.delta?`<div class="kpi__delta ${k.dcls||''}">${k.delta}</div>`:""}</div>`))); return row; }
function dualMonthChart(plan, actual, actColorFn){
  const maxV=Math.max(...plan, ...actual.filter(x=>x!=null),1);
  const bars=h(`<div class="mbars"></div>`);
  const cm=currentMonth(Number(ctx.year));
  for(let m=0;m<12;m++){ const ph=Math.round(plan[m]/maxV*100), ah=actual[m]!=null?Math.round(actual[m]/maxV*100):0;
    const acol=actColorFn?actColorFn(m,plan[m],actual[m]):"var(--cat-3)";
    bars.appendChild(h(`<div class="mcol ${m+1===cm?'is-now':''}" title="${m+1}월 · 계획 ${fmtCompact(plan[m])}${actual[m]!=null?' · 실적 '+fmtCompact(actual[m]):''}">
      <div class="mcol__bars"><div class="mbar plan" style="height:${ph}%"></div><div class="mbar act" style="height:${ah}%;background:${acol}"></div></div>
      <div class="mcol__lbl">${m+1}</div></div>`)); }
  return bars;
}
/* --- 사업비 계획 --- */
function driverType(l1){ return {"인건비":"인원연동","지급수수료":"수입연동","임차관리비":"고정(월정액)","마케팅":"증감률(전년대비)","일반관리":"단가×수량"}[l1]||"고정(월정액)"; }
const XLSX_MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CALC_METHODS=["%증감","절대증감","인원","단가×수량","수기"];

/* 범용 모달 */
function modal({title,sub,body,okLabel="확인",onOk}){
  const ov=h(`<div class="modal-ov"><div class="modal">
    <div class="modal__hd"><div><h3>${title}</h3>${sub?`<div class="modal__sub" style="margin-top:3px">${sub}</div>`:""}</div>
      <button class="modal__x" title="닫기">✕</button></div>
    <div class="modal__bd"></div>
    <div class="modal__ft"><button class="btn btn--ghost" data-cancel>취소</button>
      <button class="btn btn--primary" data-ok>${okLabel}</button></div></div></div>`);
  ov.querySelector(".modal__bd").appendChild(body);
  const close=()=>ov.remove();
  ov.querySelector(".modal__x").onclick=close;
  ov.querySelector("[data-cancel]").onclick=close;
  ov.querySelector("[data-ok]").onclick=()=>{ if(onOk && onOk()===false) return; close(); };
  ov.addEventListener("pointerdown",e=>{ if(e.target===ov) close(); });
  document.body.appendChild(ov); return ov;
}

/* 계획액 계산 팝업 */
function openCalcModal(item, onDone){
  const prev=+item.prevActual||0;
  let method=(item.calc&&item.calc.method)||"%증감";
  const P=Object.assign({pct:0,delta:0,per:0,heads:0,unit:0,qty:0,mult:1,manual:+item.budget||0}, (item.calc&&item.calc.params)||{});
  let split=item.split||"even";                 // even | manual | ratio
  let rUnit=(item.round&&item.round.unit)||1, rMode=(item.round&&item.round.mode)||"round";
  let amt=(item.amtRaw&&item.amtRaw.length===12)?item.amtRaw.slice():((item.months&&item.months.length===12)?item.months.slice():Array(12).fill(0));
  let pct=(item.ratios&&item.ratios.length===12)?item.ratios.slice():Array(12).fill(0);
  let basisEdited=item.note||""; let basisTouched=!!(item.note&&item.calc);

  const body=h(`<div></div>`);
  const rawTotal=()=>{ switch(method){
    case "수기": return Math.round(+P.manual||0);
    case "%증감": return Math.round(prev*(1+(+P.pct||0)/100));
    case "절대증감": return Math.round(prev+(+P.delta||0));
    case "인원": return Math.round((+P.per||0)*(+P.heads||0));
    case "단가×수량": return Math.round((+P.unit||0)*(+P.qty||0)*(+P.mult||1));
  } return 0; };
  const basisAuto=()=>{ switch(method){
    case "수기": return "수기 입력";
    case "%증감": return `전년실적 ${fmtCompact(prev)} × (1${(+P.pct||0)>=0?'+':'−'}${Math.abs(+P.pct||0)}%)`;
    case "절대증감": return `전년실적 ${fmtCompact(prev)} ${(+P.delta||0)>=0?'+':'−'} ${fmtCompact(Math.abs(+P.delta||0))}`;
    case "인원": return `인당 ${fmtCompact(+P.per||0)} × ${(+P.heads||0)}명`;
    case "단가×수량": return `${fmtCompact(+P.unit||0)} × ${(+P.qty||0)}${(+P.mult||1)>1?' × '+(+P.mult||1)+'개월':''}`;
  } return ""; };
  const roundFns={round:Math.round,ceil:Math.ceil,floor:Math.floor};
  const q=(x)=>{ const u=+rUnit||1; if(u<=1) return Math.round(x); return (roundFns[rMode]||Math.round)(x/u)*u; };
  const monthVals=()=>{ const t=rawTotal();
    if(split==="manual") return amt.map(v=>q(+v||0));
    if(split==="ratio") return pct.map(p=>q(t*(+p||0)/100));
    return Array(12).fill(0).map(()=>q(t/12)); };
  const confirmed=()=>monthVals().reduce((a,b)=>a+b,0);

  const fldNum=(val,onCh,w=200)=>{ const i=h(`<input class="input" type="number" value="${val}" style="max-width:${w}px">`); i.oninput=()=>onCh(Number(i.value)||0); return i; };
  const stepper=(val,step,onCh)=>{ const s=h(`<div class="stepper"><button data-d="-1">−</button><input value="${val}"><button data-d="1">+</button></div>`);
    const inp=s.querySelector("input"); s.querySelectorAll("button").forEach(b=>b.onclick=()=>{ inp.value=(Number(inp.value)||0)+step*Number(b.dataset.d); onCh(Number(inp.value)||0); }); inp.oninput=()=>onCh(Number(inp.value)||0); return s; };

  function inputsFor(){ const w=h(`<div></div>`);
    if(method==="%증감"){ const f=h(`<div class="fld"><label>증감률</label></div>`); f.appendChild(stepper(P.pct,1,v=>{P.pct=v;recompute();})); f.appendChild(h(`<span class="hint-inline">% (전년 대비)</span>`)); w.appendChild(f); }
    else if(method==="절대증감"){ const f=h(`<div class="fld"><label>증감액</label></div>`); f.appendChild(stepper(P.delta,1000000,v=>{P.delta=v;recompute();})); f.appendChild(h(`<span class="hint-inline">원 (+증액 / −감액)</span>`)); w.appendChild(f); }
    else if(method==="인원"){ const f1=h(`<div class="fld"><label>인당 금액</label></div>`); f1.appendChild(fldNum(P.per,v=>{P.per=v;recompute();})); f1.appendChild(h(`<span class="hint-inline">원</span>`)); w.appendChild(f1);
      const f2=h(`<div class="fld"><label>인원 수</label></div>`); f2.appendChild(stepper(P.heads,1,v=>{P.heads=v;recompute();})); f2.appendChild(h(`<span class="hint-inline">명</span>`)); w.appendChild(f2); }
    else if(method==="단가×수량"){ const f1=h(`<div class="fld"><label>단가</label></div>`); f1.appendChild(fldNum(P.unit,v=>{P.unit=v;recompute();})); f1.appendChild(h(`<span class="hint-inline">원</span>`)); w.appendChild(f1);
      const f2=h(`<div class="fld"><label>수량</label></div>`); f2.appendChild(stepper(P.qty,1,v=>{P.qty=v;recompute();})); w.appendChild(f2);
      const f3=h(`<div class="fld"><label>개월(선택)</label></div>`); f3.appendChild(stepper(P.mult,1,v=>{P.mult=v;recompute();})); f3.appendChild(h(`<span class="hint-inline">×개월 (1이면 미적용)</span>`)); w.appendChild(f3); }
    else { const f=h(`<div class="fld"><label>금액</label></div>`); f.appendChild(fldNum(P.manual,v=>{P.manual=v;recompute();},240)); f.appendChild(h(`<span class="hint-inline">원 (직접 입력)</span>`)); w.appendChild(f); }
    return w; }
  function roundControls(){
    const w=h(`<div class="fld" style="margin-top:8px"><label>반올림</label></div>`);
    const us=h(`<select class="input" style="max-width:100px"><option value="1">원</option><option value="1000">천원</option><option value="10000">만원</option></select>`);
    us.value=String(rUnit); us.onchange=()=>{ rUnit=Number(us.value); recompute(); };
    const ms=h(`<select class="input" style="max-width:100px"><option value="round">반올림</option><option value="ceil">절상</option><option value="floor">절하</option></select>`);
    ms.value=rMode; ms.onchange=()=>{ rMode=ms.value; recompute(); };
    w.appendChild(us); w.appendChild(ms); w.appendChild(h(`<span class="hint-inline">월별로 절상/절하/반올림 → 그 합이 확정 계획액</span>`)); return w;
  }
  function refreshMonths(){ const mon=body.querySelector("#mon"); if(!mon) return; const mv=monthVals();
    if(split==="even"){ mon.innerHTML=`<div class="hint-inline">월 ${fmtWon(mv[0]||0)}원 × 12개월 = 확정 ${fmtWon(confirmed())}원</div>`; return; }
    const grid=h(`<div class="months-grid"></div>`);
    for(let m=0;m<12;m++){
      if(split==="manual"){ const f=h(`<div class="mfld"><span>${m+1}월</span><input type="number" value="${amt[m]}"></div>`);
        f.querySelector("input").oninput=e=>{ amt[m]=Number(e.target.value)||0; refreshSum(); }; grid.appendChild(f); }
      else { const f=h(`<div class="mfld"><span>${m+1}월 (%)</span><input type="number" value="${pct[m]}"><div class="ratio-amt" style="font-size:9.5px;color:var(--ink-mut);text-align:right">${fmtCompact(mv[m])}</div></div>`);
        f.querySelector("input").oninput=e=>{ pct[m]=Number(e.target.value)||0; refreshSum(); }; grid.appendChild(f); }
    }
    mon.innerHTML=""; mon.appendChild(grid); mon.appendChild(h(`<div class="hint-inline" id="msum" style="margin-top:8px"></div>`)); refreshSum();
    function refreshSum(){ const mv=monthVals(); const s=mv.reduce((a,b)=>a+b,0); const el=body.querySelector("#msum");
      if(split==="ratio"){ grid.querySelectorAll(".ratio-amt").forEach((d,i)=>d.textContent=fmtCompact(mv[i]));
        const ps=pct.reduce((a,b)=>a+(+b||0),0); if(el){ el.innerHTML=`확정 합계 <b>${fmtWon(s)}원</b> · 비율 합 ${ps.toFixed(1)}%`; el.style.color=Math.abs(ps-100)<0.5?"var(--st-good)":"var(--st-warn)"; } }
      else if(el){ const diff=rawTotal()-s; el.innerHTML=`확정 합계 <b>${fmtWon(s)}원</b> · 산출액과 차이 ${fmtWon(diff)}원`; el.style.color="var(--ink-mut)"; }
      const te=body.querySelector("#tot"); if(te) te.textContent=fmtWon(s)+"원";
    }
  }
  function recompute(){ const raw=rawTotal();
    const re=body.querySelector("#rawtot"); if(re) re.textContent=fmtWon(raw)+"원";
    const bi=body.querySelector("#basis"); if(bi&&!basisTouched) bi.value=basisAuto();
    refreshMonths();
    const te=body.querySelector("#tot"); if(te) te.textContent=fmtWon(confirmed())+"원";
  }
  function paint(){ body.innerHTML=`
    <div class="modal__sub" style="margin-bottom:12px">기준(전년 실적): <b style="color:var(--ink)">${fmtWon(prev)}원</b></div>
    <div class="methods" id="mth"></div>
    <div id="inp"></div>
    <div class="calc-total">
      <div><div style="font-size:11.5px;color:var(--ink-mut)">산출 금액</div><b id="rawtot" style="font-size:16px">0원</b></div>
      <div style="text-align:right"><div style="font-size:11.5px;color:var(--ink-mut)">확정 계획액 (월 반올림 합계)</div><b id="tot">0원</b></div></div>
    <div class="fld"><label>산출근거</label><input class="input" id="basis" style="max-width:none;flex:1" value="${escAttr(basisTouched?basisEdited:basisAuto())}"></div>
    <div style="margin-top:14px"><b style="font-size:13px">월 분할</b>
      <div class="radio-row">
        <label><input type="radio" name="sp" value="even" ${split==="even"?"checked":""}> 12개월 균등</label>
        <label><input type="radio" name="sp" value="manual" ${split==="manual"?"checked":""}> 수기(금액)</label>
        <label><input type="radio" name="sp" value="ratio" ${split==="ratio"?"checked":""}> 비율(%)</label>
      </div><div id="rc"></div><div id="mon" style="margin-top:8px"></div></div>`;
    const mth=body.querySelector("#mth"); CALC_METHODS.forEach(m=>{ const b=h(`<button class="${m===method?"on":""}">${m}</button>`); b.onclick=()=>{ method=m; paint(); }; mth.appendChild(b); });
    body.querySelector("#inp").appendChild(inputsFor());
    body.querySelector("#rc").appendChild(roundControls());
    const bi=body.querySelector("#basis"); bi.oninput=()=>{ basisTouched=true; basisEdited=bi.value; };
    body.querySelectorAll('input[name="sp"]').forEach(r=>r.onchange=()=>{ split=r.value;
      if(split==="ratio"&&pct.reduce((a,b)=>a+(+b||0),0)===0) pct=Array(12).fill(Math.round(1000/12)/10);
      if(split==="manual"&&amt.reduce((a,b)=>a+(+b||0),0)===0){ const t=rawTotal(); amt=Array(12).fill(Math.round(t/12)); }
      recompute(); });
    recompute();
  }
  paint();
  modal({ title:`${item.l3||item.l2||item.l1||"항목"} · 계획액 계산`, sub:[item.l1,item.l2,item.l3].filter(Boolean).join(" › "), body, okLabel:"확인",
    onOk:()=>{ const mv=monthVals(); item.months=mv; item.budget=mv.reduce((a,b)=>a+b,0);
      item.calc={method,params:{...P}}; item.split=split; item.round={unit:rUnit,mode:rMode};
      item.amtRaw= split==="manual"? amt.slice():null; item.ratios= split==="ratio"? pct.slice():null;
      item.note= basisTouched? basisEdited : basisAuto(); onDone&&onDone(); } });
}
/* 전년도 가져오기 */
function samplePrev(){ return sampleLeaves().map(l=>({code:l.code,l1:l.l1,l2:l.l2,l3:l.l3,actual:l.actual})); }
function prevYearItems(){
  const prev=LS.getJSON("cockpit:data:"+(Number(ctx.year)-1));
  let src=(prev&&Array.isArray(prev.leaves)&&prev.leaves.length)?prev.leaves:null, sample=false;
  if(!src){ src=samplePrev(); sample=true; }
  return { items: src.map(l=>({code:l.code||"",l1:l.l1||"",l2:l.l2||"",l3:l.l3||"",prevActual:(+l.actual||+l.budget||0),budget:0,note:"",split:"even",months:[]})), sample };
}

function renderPlan(root){
  root.innerHTML="";
  if(!Array.isArray(ctx.data.leaves)) ctx.data.leaves=[];
  const leaves=ctx.data.leaves;
  const persist=()=>{ ctx.data.sample=false; ctx.data.folderName=ctx.data.folderName||"직접 입력"; ctx.data.leaves=leaves; ctx.data.tree=buildTree(leaves); saveCache(); };

  const yh=h(`<div class="planyear">
    <span class="planyear__lb">📅 계획 연도</span>
    <div class="yearpick"><button class="yearpick__btn" id="pyPrev">‹</button><span class="yearpick__val">${ctx.year}</span><button class="yearpick__btn" id="pyNext">›</button></div>
    <span class="hint-inline">먼저 연도를 고르세요 · 연도별로 따로 저장됩니다</span></div>`);
  root.appendChild(yh);
  $("#pyPrev",yh).onclick=()=>{ ctx.year--; loadCache(); render(); };
  $("#pyNext",yh).onclick=()=>{ ctx.year++; loadCache(); render(); };

  const kp=h(`<div id="pkpi"></div>`); root.appendChild(kp);
  const drawKpi=()=>{ const tot=leaves.reduce((s,l)=>s+(+l.budget||0),0), prev=leaves.reduce((s,l)=>s+(+l.prevActual||0),0);
    const filled=leaves.filter(l=>+l.budget>0).length, g=prev?(tot-prev)/prev:0;
    kp.innerHTML=""; kp.appendChild(kpiRow([
      {label:"금년 계획 합계",val:fmtCompact(tot),accent:"var(--cat-1)"},
      {label:"전년 실적 합계",val:fmtCompact(prev),accent:"var(--cat-7)"},
      {label:"전년 대비",val:(prev?(g>=0?"+":"")+fmtPct(g,1):"-"),accent:g>=0?"var(--st-crit)":"var(--st-good)",delta:prev?`${g>=0?'+':''}${fmtCompact(tot-prev)}`:"전년 데이터 필요",dcls:g>=0?"down":"up"},
      {label:"입력 완료",val:`${filled}/${leaves.length}`,unit:"개",accent:"var(--cat-3)",delta:filled<leaves.length?`미입력 ${leaves.length-filled}`:"완료",dcls:filled<leaves.length?"down":"up"},
    ])); };
  drawKpi();

  const bar=h(`<div class="editbar">
    <button class="btn btn--primary btn--sm" id="prevY">📥 전년도 가져오기</button>
    <button class="btn btn--sm" id="addRow">＋ 항목 추가</button>
    <button class="btn btn--sm" id="saveBook">💾 저장</button>
    <button class="btn btn--sm" id="expX">⬇ 엑셀 내보내기</button>
    <button class="btn btn--sm" id="impX">⬆ 엑셀 불러오기</button>
    <span class="hint-inline">전년 실적을 깔고 → <b>금년 계획액</b> 칸을 눌러 계산 → 저장</span>
    <span class="spacer"></span><span class="hint-inline">단위 ${ctx.unit?ctx.unit+"원":"자동"}</span></div>`);
  root.appendChild(bar);

  const card=h(`<div class="card"><div class="card__bd" style="padding-top:6px;overflow:auto">
    <table class="tbl"><thead><tr>
      <th style="width:130px">대분류</th><th style="width:120px">중분류</th><th style="width:130px">소분류</th><th style="width:64px">코드</th>
      <th class="num" style="width:110px">전년 실적</th><th class="num" style="width:120px">금년 계획액</th>
      <th>비고(산출근거)</th><th style="width:66px">월 분할</th><th style="width:28px"></th>
    </tr></thead><tbody id="ptb"></tbody></table></div></div>`);
  const tb=$("#ptb",card); root.appendChild(card);

  function rowEl(l,idx){
    const mv=(l.months&&l.months.length===12)?l.months:Array(12).fill(Math.round((+l.budget||0)/12));
    const splitLbl=l.split==="ratio"?"비율":l.split==="manual"?"수기":"균등";
    const tr=h(`<tr>
      <td class="tight"><input class="cell" data-f="l1" value="${escAttr(l.l1)}"></td>
      <td class="tight"><input class="cell" data-f="l2" value="${escAttr(l.l2)}"></td>
      <td class="tight"><input class="cell" data-f="l3" value="${escAttr(l.l3)}"></td>
      <td class="tight"><input class="cell" data-f="code" value="${escAttr(l.code)}"></td>
      <td class="num" style="color:var(--ink-mut)">${(+l.prevActual)?fmtCompact(l.prevActual):"-"}</td>
      <td class="num tight"><button class="cellbtn ${(+l.budget>0)?"has":""}" data-plan>${(+l.budget>0)?fmtCompact(l.budget):"입력 ▸"}</button></td>
      <td class="tight"><input class="cell" data-f="note" value="${escAttr(l.note)}" placeholder="산출근거"></td>
      <td class="tight"><button class="cellbtn mtoggle" title="1~12월 펼치기" style="text-align:center">▸ ${splitLbl}</button></td>
      <td class="tight"><button class="rowdel" title="삭제">🗑</button></td></tr>`);
    const detail=h(`<tr class="mdetail" hidden><td colspan="9" style="padding:2px 8px 8px">
      <div class="mrow">${mv.map((v,m)=>`<div class="mcell"><span>${m+1}월</span><b>${(+l.budget>0)?fmtCompact(v):"-"}</b></div>`).join("")}</div></td></tr>`);
    tr.querySelectorAll("input.cell").forEach(inp=>{ const f=inp.dataset.f; inp.oninput=()=>{ l[f]=inp.value; }; });
    tr.querySelector("[data-plan]").onclick=()=>openCalcModal(l,()=>{ persist(); rebuild(); });
    tr.querySelector(".mtoggle").onclick=()=>{ detail.hidden=!detail.hidden; tr.querySelector(".mtoggle").classList.toggle("open",!detail.hidden); };
    tr.querySelector(".rowdel").onclick=()=>{ leaves.splice(idx,1); persist(); rebuild(); };
    return {main:tr, detail};
  }
  function rebuild(){ tb.innerHTML=""; leaves.forEach((l,i)=>{ const r=rowEl(l,i); tb.appendChild(r.main); tb.appendChild(r.detail); }); drawKpi(); }
  rebuild();

  $("#prevY",bar).onclick=()=>{ const {items,sample}=prevYearItems();
    if(!items.length){ toast("warn","전년 데이터 없음","엑셀 불러오기로 전년 실적을 올려주세요"); return; }
    leaves.splice(0,leaves.length,...items); persist(); rebuild();
    toast("ok","전년도 가져옴", sample?`저장된 전년 데이터가 없어 샘플 전년 실적 ${items.length}건을 깔았습니다`:`전년 실적 ${items.length}건`); };
  $("#addRow",bar).onclick=()=>{ leaves.push({code:"",l1:"",l2:"",l3:"",prevActual:0,budget:0,note:"",split:"even",months:[]}); rebuild(); tb.lastElementChild.querySelector("input").focus(); };
  $("#saveBook",bar).onclick=()=>{ persist(); toast("ok","저장됨",`${leaves.length}개 항목 저장`); };
  $("#expX",bar).onclick=()=>{ const aoa=[["코드","대분류","중분류","소분류","전년실적","금년계획액","비고","1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"]];
    leaves.forEach(l=>{ const mo=(l.months&&l.months.length===12)?l.months:Array(12).fill(Math.round((+l.budget||0)/12));
      aoa.push([l.code||"",l.l1||"",l.l2||"",l.l3||"",Math.round(+l.prevActual||0),Math.round(+l.budget||0),l.note||"",...mo.map(x=>Math.round(+x||0))]); });
    download("사업비계획_"+ctx.year+".xlsx", wbAOA("사업비계획",aoa), XLSX_MIME); toast("ok","엑셀 내보냄","다운로드 폴더 확인"); };
  $("#impX",bar).onclick=()=>pickFile(".xlsx,.csv",async(file)=>{ try{ const buf=await file.arrayBuffer(); const rows=sheetRows(buf); const out=[];
    rows.forEach(r=>{ const code=norm(pick(r,["코드"])),l1=norm(pick(r,["대분류"])); if(!code&&!l1) return;
      const months=[]; for(let m=1;m<=12;m++){ const v=pick(r,[m+"월"]); months.push(Number(String(v).replace(/[,\s]/g,""))||0); }
      const hasM=months.some(x=>x>0);
      out.push({code,l1,l2:norm(pick(r,["중분류"])),l3:norm(pick(r,["소분류"])),
        prevActual:Number(String(pick(r,["전년실적","실적","집행액"])).replace(/[,\s]/g,""))||0,
        budget:Number(String(pick(r,["금년계획액","계획액","계획","금액"])).replace(/[,\s]/g,""))||0,
        note:norm(pick(r,["비고","산출근거"])), split:hasM?"manual":"even", months:hasM?months:[]}); });
    if(!out.length){ toast("warn","불러올 항목 없음","코드/대분류 열 확인"); return; }
    leaves.splice(0,leaves.length,...out); persist(); rebuild(); toast("ok","불러옴",`${out.length}건`);
  }catch(e){ toast("err","불러오기 실패",e.message); } });
}
/* --- 계획 vs 실적 --- */
function renderVariance(root){
  root.innerHTML=""; const leaves=ctx.data.leaves||[];
  if(!leaves.length){ root.appendChild(soonNote("📊","계획 vs 실적","폴더를 읽거나 샘플로 둘러보면 표가 표시됩니다.")); return; }
  const tree=buildTree(leaves), pace=yearPace(Number(ctx.year));
  const totB=sumBudget(tree),totA=sumActual(tree),proj=forecast(totA,pace);
  root.appendChild(kpiRow([
    {label:"계획",val:fmtCompact(totB),unit:"원",accent:"var(--cat-1)"},
    {label:"집행",val:fmtCompact(totA),unit:"원",accent:"var(--cat-3)",delta:`집행률 ${fmtPct(totA/totB,1)}`,dcls:totA/totB<=pace?"up":"down"},
    {label:"연말 추정",val:fmtCompact(proj),unit:"원",accent:proj>totB?"var(--st-crit)":"var(--st-good)",delta:`계획 대비 ${proj>totB?'▲'+fmtCompact(proj-totB):'▼'+fmtCompact(totB-proj)}`,dcls:proj>totB?"down":"up"},
    {label:"초과 예상 대분류",val:tree.filter(n=>forecast(n.actual,pace)>n.budget).length,unit:"개",accent:"var(--st-crit)"},
  ]));
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-2)"></span>계획 대비 실적 · 연말 추정</div>
    <div class="card__sub">시간진도 ${fmtPct(pace,0)} 기준 · 상태는 연말 추정 대비 예산</div></div></div>
    <div class="card__bd" style="padding-top:8px"><table class="tbl"><thead><tr>
      <th>구분</th><th class="num">계획</th><th class="num">집행</th><th class="num">집행률</th><th class="num">잔여</th><th class="num">연말 추정</th><th>상태</th>
    </tr></thead><tbody id="vtb"></tbody></table></div></div>`);
  const tb=$("#vtb",card);
  const rowFor=(n,depth,i)=>{ const r=n.budget?n.actual/n.budget:0, proj=forecast(n.actual,pace), pj=n.budget?proj/n.budget:0;
    const st = pj>1.05?["초과","tag--crit"]:pj>1.0?["주의","tag--warn"]:["정상","tag--good"];
    return h(`<tr><td style="padding-left:${12+depth*20}px">${depth?"":`<span class="swatch" style="background:${catColor(i)}"></span>`}${depth?"└ ":""}${n.name}</td>
      <td class="num">${fmtCompact(n.budget)}</td><td class="num">${fmtCompact(n.actual)}</td>
      <td class="num">${fmtPct(r,0)}</td><td class="num">${fmtCompact(n.budget-n.actual)}</td>
      <td class="num" style="color:${pj>1?'var(--st-crit)':'var(--ink)'}">${fmtPct(pj,0)}</td>
      <td><span class="tag ${st[1]}">${st[0]}</span></td></tr>`); };
  tree.forEach((n1,i)=>{ const t=rowFor(n1,0,i); t.style.fontWeight="700"; tb.appendChild(t);
    n1.children.forEach(n2=>tb.appendChild(rowFor(n2,1,i))); });
  root.appendChild(card);
}
/* --- 수입 · 수수료 --- */
const CASE_DEF=[{type:"대인",unit:220000,avg:480},{type:"대물",unit:150000,avg:850},{type:"자차",unit:110000,avg:400}];
function caseMonthly(){ const cm=currentMonth(Number(ctx.year));
  return CASE_DEF.map(c=>{ const cnt=MONTH_W.map(w=>Math.round(c.avg*w));
    const actCnt=cnt.map((v,m)=>m<cm?v:null); return {...c,cnt,actCnt}; }); }
function revenueMonthly(){ const cases=caseMonthly();
  const plan=Array(12).fill(0), actual=Array(12).fill(null);
  cases.forEach(c=>c.cnt.forEach((v,m)=>{ plan[m]+=v*c.unit; if(c.actCnt[m]!=null){ actual[m]=(actual[m]||0)+c.actCnt[m]*c.unit; } }));
  return {plan,actual,cases}; }
function renderIncome(root){
  root.innerHTML=""; const {plan,actual,cases}=revenueMonthly();
  const annual=plan.reduce((a,b)=>a+b,0), totCnt=cases.reduce((s,c)=>s+c.cnt.reduce((a,b)=>a+b,0),0);
  root.appendChild(kpiRow([
    {label:"연간 수수료 수입(추정)",val:fmtCompact(annual),unit:"원",accent:"var(--cat-3)"},
    {label:"연간 처리건수",val:totCnt.toLocaleString("ko-KR"),unit:"건",accent:"var(--cat-1)"},
    {label:"평균 건당 수수료",val:fmtCompact(Math.round(annual/totCnt)),unit:"원",accent:"var(--cat-4)"},
    {label:"월평균 처리건",val:Math.round(totCnt/12).toLocaleString("ko-KR"),unit:"건",accent:"var(--cat-7)"},
  ]));
  const grid=h(`<div class="grid-2" style="grid-template-columns:1.5fr 1fr;align-items:start"></div>`);
  const chart=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-3)"></span>월별 수수료 수입</div>
    <div class="card__sub">회색=계획 · 색=실적(당월까지) · 예시 더미</div></div></div>
    <div class="card__bd" id="revbd" style="padding-top:10px"></div></div>`);
  $("#revbd",chart).appendChild(dualMonthChart(plan,actual,()=>"var(--cat-3)"));
  const tbl=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-2)"></span>유형별 처리건 · 수입</div>
    <div class="card__sub">건당 단가 × 연간 건수</div></div></div>
    <div class="card__bd" style="padding-top:6px"><table class="tbl"><thead><tr>
      <th>사고유형</th><th class="num">건당 단가</th><th class="num">연간 건수</th><th class="num">연간 수입</th></tr></thead><tbody id="itb"></tbody></table></div></div>`);
  const itb=$("#itb",tbl);
  cases.forEach((c,i)=>{ const cnt=c.cnt.reduce((a,b)=>a+b,0);
    itb.appendChild(h(`<tr><td><span class="swatch" style="background:${catColor(i)}"></span>${c.type}</td>
      <td class="num">${fmtWon(c.unit)}원</td><td class="num">${cnt.toLocaleString("ko-KR")}</td>
      <td class="num"><b>${fmtCompact(cnt*c.unit)}</b></td></tr>`)); });
  grid.append(chart,tbl); root.appendChild(grid);
}
/* --- 손익 · 현금흐름 --- */
function renderPnl(root){
  root.innerHTML=""; const leaves=ctx.data.leaves||[];
  if(!leaves.length){ root.appendChild(soonNote("💰","손익 · 현금흐름","폴더를 읽거나 샘플로 둘러보면 표시됩니다.")); return; }
  const s=ctx.data.settings||defSettings();
  const rev=revenueMonthly().plan;                       // 월 수입
  const cost=monthlySeries(sumBudget(buildTree(leaves)),0,0).plan; // 월 비용(계획)
  const feeLag=Number(s.feeLag||1);
  const profit=rev.map((r,m)=>r-cost[m]);
  const annualProfit=profit.reduce((a,b)=>a+b,0);
  // 현금흐름: 수입은 feeLag 개월 뒤 입금
  let cash=Number(s.openingCash||0); const cashArr=[]; let minCash=cash, minM=0;
  for(let m=0;m<12;m++){ const inflow = m-feeLag>=0? rev[m-feeLag]:0; cash += inflow - cost[m]; cashArr.push(cash); if(cash<minCash){minCash=cash;minM=m;} }
  root.appendChild(kpiRow([
    {label:"연간 손익(추정)",val:fmtCompact(annualProfit),unit:"원",accent:annualProfit>=0?"var(--st-good)":"var(--st-crit)",delta:annualProfit>=0?"흑자 예상":"적자 예상",dcls:annualProfit>=0?"up":"down"},
    {label:"연간 수입",val:fmtCompact(rev.reduce((a,b)=>a+b,0)),unit:"원",accent:"var(--cat-3)"},
    {label:"연간 비용",val:fmtCompact(cost.reduce((a,b)=>a+b,0)),unit:"원",accent:"var(--cat-2)"},
    {label:"최저 현금(예상)",val:fmtCompact(minCash),unit:"원",accent:minCash<0?"var(--st-crit)":"var(--st-good)",delta:`${minM+1}월 · 수수료 ${feeLag}개월 후 입금 가정`,dcls:minCash<0?"down":"up"},
  ]));
  // 월별 손익 (부호 막대)
  const maxAbs=Math.max(...profit.map(Math.abs),1);
  const pcard=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-4)"></span>월별 손익 (수입 − 비용)</div>
    <div class="card__sub">초록=흑자 · 빨강=적자 · 예시 더미</div></div></div><div class="card__bd"><div class="signbars" id="sb"></div></div></div>`);
  const sb=$("#sb",pcard);
  profit.forEach((v,m)=>{ const hpct=Math.round(Math.abs(v)/maxAbs*46); const pos=v>=0;
    sb.appendChild(h(`<div class="scol" title="${m+1}월 손익 ${fmtCompact(v)}">
      <div class="scol__pos">${pos?`<div class="sbar" style="height:${hpct}%;background:var(--st-good)"></div>`:""}</div>
      <div class="scol__mid"></div>
      <div class="scol__neg">${!pos?`<div class="sbar" style="height:${hpct}%;background:var(--st-crit)"></div>`:""}</div>
      <div class="mcol__lbl">${m+1}</div></div>`)); });
  root.appendChild(pcard);
  // 현금 잔액 라인
  const minV=Math.min(0,...cashArr), maxV=Math.max(...cashArr,1), span=maxV-minV||1;
  const pts=cashArr.map((c,m)=>`${40+m*(920/11)},${180-(c-minV)/span*150}`).join(" ");
  const zeroY=180-(0-minV)/span*150;
  const ccard=h(`<div class="card" style="margin-top:18px"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-1)"></span>현금 잔액 추이</div>
    <div class="card__sub">시작 현금 ${fmtCompact(s.openingCash||0)} · 수수료 ${feeLag}개월 후 입금 가정</div></div></div>
    <div class="card__bd"><svg viewBox="0 0 1000 200" width="100%" height="190" preserveAspectRatio="none">
      <line x1="40" y1="${zeroY}" x2="960" y2="${zeroY}" stroke="var(--st-crit)" stroke-dasharray="4 4" opacity=".6"/>
      <polyline points="${pts}" fill="none" stroke="var(--cat-1)" stroke-width="2.5"/>
      ${cashArr.map((c,m)=>`<circle cx="${40+m*(920/11)}" cy="${180-(c-minV)/span*150}" r="3.5" fill="${c<0?'var(--st-crit)':'var(--cat-1)'}"/>`).join("")}
      ${cashArr.map((c,m)=>`<text x="${40+m*(920/11)}" y="196" text-anchor="middle" fill="var(--ink-mut)" font-size="11">${m+1}</text>`).join("")}
    </svg><div style="text-align:right;font-size:11.5px;color:var(--ink-mut);margin-top:4px">빨간 점선 아래 = 현금 부족 구간</div></div></div>`);
  root.appendChild(ccard);
}
function soonNote(icon,title,desc){ return h(`<div class="soon"><div class="big">${icon}</div><h3>${title}</h3><p>${desc}</p></div>`); }

function renderSettings(root){
  root.innerHTML=""; const s=ctx.data.settings||defSettings();
  const card=h(`<div class="card" style="max-width:760px"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-4)"></span>설정 · 현금흐름 가정</div>
    <div class="card__sub">이 값들은 <b>이 브라우저</b>에 저장됩니다. (백업하려면 아래 '설정 내려받기')</div></div></div>
    <div class="card__bd">
    <div class="form-row"><div><label>시작 현금잔액</label><div class="hint">연초 보유 현금</div></div>
      <div><input class="input" id="s_cash" type="number" value="${s.openingCash||0}"> 원</div></div>
    <div class="form-row"><div><label>수수료 입금 시점</label><div class="hint">처리 후 입금까지</div></div>
      <div><select class="input" id="s_feeLag"><option value="0" ${s.feeLag==0?"selected":""}>당월 입금</option>
        <option value="1" ${(s.feeLag==null?1:s.feeLag)==1?"selected":""}>익월 입금 (기본)</option>
        <option value="2" ${s.feeLag==2?"selected":""}>2개월 후</option></select></div></div>
    <div class="form-row"><div><label>비용 지출 시점</label><div class="hint">대부분 발생 당월</div></div>
      <div><select class="input" id="s_costLag"><option value="0" ${(s.costLag==null?0:s.costLag)==0?"selected":""}>당월 지출 (기본)</option>
        <option value="1" ${s.costLag==1?"selected":""}>익월 지출</option></select></div></div>
    <div style="margin-top:18px;display:flex;gap:10px">
      <button class="btn btn--primary" id="saveS">💾 저장</button>
      <button class="btn" id="dlS">⬇ 설정 내려받기(.json)</button>
    </div></div></div>`);
  root.appendChild(card);
  $("#saveS",card).onclick=()=>actions.saveSettings({openingCash:Number($("#s_cash",card).value)||0,feeLag:Number($("#s_feeLag",card).value),costLag:Number($("#s_costLag",card).value)});
  $("#dlS",card).onclick=()=>download("settings_"+ctx.year+".json", JSON.stringify(ctx.data.settings,null,2),"application/json");
}

/* ------------------------------ 준비중 ------------------------------ */
function renderSoon(root,{icon,title,desc,plan}){
  root.innerHTML=""; root.appendChild(h(`<div class="soon"><div class="big">${icon}</div>
    <h3>${title}</h3><p>${desc}</p>${plan?`<div class="plan">${plan.map(p=>`▸ ${p}`).join("<br>")}</div>`:""}</div>`));
}

/* ------------------------------ 토스트 ------------------------------ */
function toast(kind,title,desc){
  const wrap=el("toasts"); const ic={ok:"✅",warn:"⚠️",err:"⛔"}[kind]||"ℹ️";
  const t=document.createElement("div"); t.className="toast "+kind;
  t.innerHTML=`<span class="ti">${ic}</span><div><div class="tt">${title}</div>${desc?`<div class="td">${desc}</div>`:""}</div>`;
  wrap.appendChild(t); setTimeout(()=>{ t.style.opacity="0"; t.style.transform="translateY(8px)"; setTimeout(()=>t.remove(),260); },3600);
}

/* ------------------------------ 상단바 이벤트 ------------------------------ */
el("reloadBtn").onclick=()=>actions.reload();
el("yearPrev").onclick=()=>{ ctx.year--; loadCache(); render(); };
el("yearNext").onclick=()=>{ ctx.year++; loadCache(); render(); };
el("themeToggle").onclick=()=>{ const cur=document.documentElement.getAttribute("data-theme")==="light"?"dark":"light";
  document.documentElement.setAttribute("data-theme",cur); LS.set("cockpit:theme",cur); };
el("unitSel").onchange=(e)=>{ ctx.unit=e.target.value; LS.set("cockpit:unit",ctx.unit); render(); };

/* ------------------------------ 시작 ------------------------------ */
(function boot(){
  const savedTheme=LS.get("cockpit:theme"); if(savedTheme) document.documentElement.setAttribute("data-theme",savedTheme);
  ctx.unit=LS.get("cockpit:unit")||""; const us=el("unitSel"); if(us) us.value=ctx.unit;
  loadCache();                 // 지난번 읽은 데이터가 있으면 복원
  go(ctx.data.leaves && ctx.data.leaves.length ? "home" : "home");
})();

})();
