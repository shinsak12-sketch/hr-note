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
function fmtCompact(n){
  if(n==null||isNaN(n)) return "-";
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
const EXEC_STOPS = [[0,"#2f6fe0"],[0.60,"#1f9e6b"],[0.85,"#e0a11a"],[1.00,"#e0631f"],[1.20,"#cf2f2f"]];
function execColor(r, pace){
  let v = pace ? r/Math.max(pace,0.001) : r; if(isNaN(v)) v=0; v=Math.max(0,Math.min(1.2,v));
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
    case "plan": renderSoon(content,{icon:"🧭",title:"사업비 계획 — 다음 단계",desc:"산출근거(드라이버) 기반 예산 수립 + 내년 롤링.",plan:["고정/단가×수량/수입연동/인원연동/증감률","월별 자동 배분","브라우저 저장 + 백업 내려받기"]}); break;
    case "variance": renderSoon(content,{icon:"📊",title:"계획 vs 실적 — 다음 단계",desc:"실적 엑셀을 읽어 집행률과 연말 추정을 분석.",plan:["집행률·잔여·초과","이벤트 반영 추정","월별 추이"]}); break;
    case "income": renderSoon(content,{icon:"💳",title:"수입 · 수수료 — 다음 단계",desc:"유형×구간 단가와 처리건수로 월별 수수료 집계.",plan:["예상/실제 처리건수","단가 적용","월별 수입"]}); break;
    case "pnl": renderSoon(content,{icon:"💰",title:"손익 · 현금흐름 — 다음 단계",desc:"수입−사업비 손익, 입·출금 타이밍 기반 현금 잔액.",plan:["월별 손익","현금흐름 시뮬","현금 부족 경보"]}); break;
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

/* ------------------------------ 홈 (3D 대시보드) ------------------------------ */
function renderHome(root){
  const leaves=ctx.data.leaves||[]; root.innerHTML="";
  if(!leaves.length){ root.appendChild(h(`<div class="soon"><div class="big">📊</div>
    <h3>표시할 사업비 데이터가 없습니다</h3><p>기준정보에서 폴더를 읽거나, 샘플로 둘러보세요.</p></div>`)); return; }
  const tree=buildTree(leaves);
  const totB=sumBudget(tree), totA=sumActual(tree), rate=totA/totB, remain=totB-totA;
  const over=tree.filter(n=>n.actual>n.budget).length;

  const kpis=h(`<div class="kpis"></div>`);
  const kpi=(label,val,unit,accent,delta)=>h(`<div class="kpi" style="--accent:${accent}">
    <div class="kpi__label">${label}</div><div class="kpi__val">${val}<span class="unit">${unit||""}</span></div>${delta||""}</div>`);
  kpis.append(
    kpi("연간 계획 사업비",fmtCompact(totB),"원","var(--cat-1)"),
    kpi("집행액",fmtCompact(totA),"원","var(--cat-3)",`<div class="kpi__delta ${rate<=1?'up':'down'}">집행률 ${fmtPct(rate,1)}</div>`),
    kpi("잔여 예산",fmtCompact(remain),"원",remain>=0?"var(--st-good)":"var(--st-crit)"),
    kpi("초과 대분류",String(over),"개",over?"var(--st-crit)":"var(--st-good)",`<div class="kpi__delta ${over?'down':'up'}">${over?'예산 초과 주의':'모두 예산 내'}</div>`),
  );
  root.appendChild(kpis);

  const layout=h(`<div class="grid-2" style="grid-template-columns:1.7fr 1fr;align-items:stretch"></div>`);
  const cityCard=h(`<div class="card city-wrap" style="padding:0;overflow:hidden">
    <div class="card__hd" style="padding:16px 18px 14px"><div>
      <div class="card__title"><span class="dot" style="background:var(--cat-1)"></span>사업비 구성 · 3D</div>
      <div class="card__sub">바닥면적 = 계획예산 · 높이 = 집행액 · 색 = 집행률 (클릭하여 드릴다운)</div>
    </div></div><div class="city" id="city"></div></div>`);
  layout.append(cityCard, renderRankPanel(tree));
  root.appendChild(layout);
  buildCity($("#city",cityCard), tree, {path:[]});
}
function renderRankPanel(tree){
  const rows=[...tree].sort((a,b)=>b.budget-a.budget);
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-3)"></span>대분류 집행 현황</div>
    <div class="card__sub">예산 규모순 · 막대색은 집행률</div></div></div>
    <div class="card__bd" id="rankbd" style="padding-top:6px"></div></div>`);
  const bd=$("#rankbd",card);
  rows.forEach((n,i)=>{ const r=n.actual/n.budget, col=execColor(r);
    bd.appendChild(h(`<div style="padding:11px 2px;border-bottom:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
        <div style="font-weight:650;display:flex;gap:9px;align-items:center"><span class="swatch" style="width:10px;height:10px;border-radius:3px;background:${catColor(i)}"></span>${n.name}</div>
        <div style="font-variant-numeric:tabular-nums;font-size:12.5px"><b>${fmtCompact(n.actual)}</b><span style="color:var(--ink-mut)"> / ${fmtCompact(n.budget)}</span></div>
      </div>
      <div style="height:8px;border-radius:99px;background:var(--surface-3);overflow:hidden;position:relative">
        <i style="display:block;height:100%;width:${Math.min(100,r*100)}%;background:${col};border-radius:99px"></i>
        ${r>1?`<span style="position:absolute;right:6px;top:-1px;font-size:9px;color:var(--st-crit);font-weight:800">▲${fmtPct(r-1,0)} 초과</span>`:""}
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:11px;color:var(--ink-mut)">
        <span>집행률 ${fmtPct(r,1)}</span><span>잔여 ${fmtCompact(n.budget-n.actual)}</span></div>
    </div>`)); });
  return card;
}

/* --- 3D 도시 --- */
function buildCity(cityEl, nodes, state){
  cityEl._yaw = cityEl._yaw==null? -42 : cityEl._yaw;
  cityEl.innerHTML=`
    <div class="city__hud" id="hud"></div>
    <div class="city__spin">
      <button class="iconbtn" id="rotL" title="회전" style="width:36px;height:36px">⟲</button>
      <button class="iconbtn" id="rotR" title="회전" style="width:36px;height:36px">⟳</button>
    </div>
    <div class="city__stage" id="stage" style="--yaw:${cityEl._yaw}deg"></div>
    <div class="city__legend"><div>집행률</div><div class="legend__bar"></div>
      <div class="legend__scale"><span>여유</span><span>정상</span><span>주의</span><span>초과</span></div></div>`;
  const stage=$("#stage",cityEl);
  const cols=Math.ceil(Math.sqrt(nodes.length))||1, rows=Math.ceil(nodes.length/cols), cell=150;
  const boardW=cols*cell, boardH=rows*cell;
  const maxB=Math.max(...nodes.map(n=>n.budget),1), maxA=Math.max(...nodes.map(n=>n.actual),1);
  const board=h(`<div class="board" style="left:${-boardW/2}px;top:${-boardH/2}px;width:${boardW}px;height:${boardH}px;--cell:${cell}px"></div>`);
  stage.appendChild(board);
  nodes.forEach((n,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const fp=44+70*Math.sqrt(n.budget/maxB), hz=14+188*(n.actual/maxA);
    const bx=col*cell+(cell-fp)/2, by=row*cell+(cell-fp)/2;
    const r=n.actual/n.budget, base=execColor(r);
    const cTop=shade(base,.22), cA=shade(base,-.12), cB=shade(base,-.34);
    const bldg=h(`<div class="bldg" style="left:${bx}px;top:${by}px;width:${fp}px;height:${fp}px">
      <div class="bldg__face" style="width:${fp}px;height:${fp}px;background:${cTop};transform:translateZ(${hz}px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)"></div>
      <div class="bldg__face" style="width:${fp}px;height:${hz}px;background:${cA};transform-origin:0 0;transform:rotateX(90deg)"></div>
      <div class="bldg__face" style="width:${fp}px;height:${hz}px;background:${cA};transform-origin:0 0;transform:translateY(${fp}px) rotateX(90deg)"></div>
      <div class="bldg__face" style="width:${hz}px;height:${fp}px;background:${cB};transform-origin:0 0;transform:rotateY(-90deg)"></div>
      <div class="bldg__face" style="width:${hz}px;height:${fp}px;background:${cB};transform-origin:0 0;transform:translateX(${fp}px) rotateY(-90deg)"></div>
      <div class="bldg__cap">${n.name}</div></div>`);
    board.appendChild(bldg);
    const cap=bldg.querySelector(".bldg__cap");
    bldg.addEventListener("pointerenter",(e)=>{ showTip(e,n); cap.style.opacity="1"; });
    bldg.addEventListener("pointermove",moveTip);
    bldg.addEventListener("pointerleave",()=>{ hideTip(); cap.style.opacity="0"; });
    bldg.addEventListener("click",()=>{ if(n.children && n.children.length){
      cityEl.classList.add("is-drill");
      buildCity(cityEl, n.children.map(c=>({...c})), {path:(state.path||[]).concat([n.name])});
    }});
  });
  cityEl.addEventListener("pointerleave", hideTip);
  $("#rotL",cityEl).onclick=()=>{ cityEl._yaw-=22; stage.style.setProperty("--yaw",cityEl._yaw+"deg"); };
  $("#rotR",cityEl).onclick=()=>{ cityEl._yaw+=22; stage.style.setProperty("--yaw",cityEl._yaw+"deg"); };
  renderCrumb(cityEl, state);
}
function renderCrumb(cityEl, state){
  const hud=$("#hud",cityEl); if(!hud) return; const path=state.path||[]; hud.innerHTML="";
  const crumb=h(`<div class="city__crumb"></div>`);
  crumb.append(h(`<button data-lvl="-1">🏙️ 전체</button>`));
  path.forEach(p=>crumb.append(h(`<span>›</span>`),h(`<b>${p}</b>`)));
  crumb.querySelector('[data-lvl="-1"]').onclick=()=>{ cityEl.classList.remove("is-drill");
    buildCity(cityEl, ctx.data.tree||buildTree(ctx.data.leaves||[]), {path:[]}); };
  hud.appendChild(crumb);
}
let tipEl=null;
function tip(){ if(!tipEl){ tipEl=h(`<div class="city-tip"></div>`); document.body.appendChild(tipEl);} return tipEl; }
function showTip(e,n){ const r=n.actual/n.budget, t=tip();
  t.innerHTML=`<div class="city-tip__t"><span class="swatch" style="background:${execColor(r)}"></span>${n.name}</div>
    <div class="city-tip__row"><span>계획예산</span><b>${fmtWon(n.budget)}원</b></div>
    <div class="city-tip__row"><span>집행액</span><b>${fmtWon(n.actual)}원</b></div>
    <div class="city-tip__row"><span>잔여</span><b>${fmtWon(n.budget-n.actual)}원</b></div>
    <div class="city-tip__bar"><i style="width:${Math.min(100,r*100)}%;background:${execColor(r)}"></i></div>
    <div class="city-tip__row" style="margin-top:7px"><span>집행률</span><b style="color:${execColor(r)}">${fmtPct(r,1)}</b></div>
    ${n.children&&n.children.length?`<div class="city-tip__row"><span style="color:var(--cat-1)">클릭 → 하위 ${n.children.length}개 보기</span></div>`:""}`;
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

/* ------------------------------ 시작 ------------------------------ */
(function boot(){
  const savedTheme=LS.get("cockpit:theme"); if(savedTheme) document.documentElement.setAttribute("data-theme",savedTheme);
  loadCache();                 // 지난번 읽은 데이터가 있으면 복원
  go(ctx.data.leaves && ctx.data.leaves.length ? "home" : "home");
})();

})();
