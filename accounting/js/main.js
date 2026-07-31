/* =========================================================================
   main.js — 부트스트랩 / 라우팅 / 데이터 로딩 / 액션
   ========================================================================= */
import { Store, isSupported } from "./storage.js";
import * as X from "./xlsxio.js";
import { buildTree, sampleLeaves, sampleFeeSchedule, sampleCaseTypes } from "./data.js";
import * as V from "./views.js";

const NAV = [
  {id:"home",     ico:"🏙️", label:"대시보드", title:"대시보드", sub:"사업비 구성 3D 히트맵"},
  {id:"plan",     ico:"🧭", label:"사업비계획", title:"사업비 계획", sub:"산출근거 기반 예산 수립"},
  {id:"variance", ico:"📊", label:"계획대비", title:"계획 vs 실적", sub:"항목별 집행·연말 추정"},
  {id:"income",   ico:"💳", label:"수입/수수료", title:"수입 · 수수료", sub:"사고처리건 · 단가"},
  {id:"pnl",      ico:"💰", label:"손익/현금", title:"손익 · 현금흐름", sub:"흑자/적자 · 현금 잔액"},
  {id:"masters",  ico:"🗄️", label:"기준정보", title:"기준정보", sub:"계정·수수료·사고유형 (엑셀 원천)"},
  {id:"settings", ico:"⚙️", label:"설정", title:"설정", sub:""},
];
const YEAR_SCOPED = new Set(["home","plan","variance","income","pnl","settings"]);

const app = document.getElementById("app");
const content = document.getElementById("content");

const ctx = {
  store: new Store(),
  route: "home",
  year: new Date().getFullYear(),
  data: emptyData(),
  actions: {},
};
function emptyData(){ return {leaves:[],fees:[],caseTypes:[],errors:{},orphans:[],settings:{},plan:null,sample:false,year:null}; }

/* ---------------- 데이터 로딩 ---------------- */
async function loadFromStore(){
  const s=ctx.store;
  const rd=async(file,parser)=>{
    if(await s.fileExists(file)){ const buf=await s.readArrayBuffer(file); const {rows,errors}=parser(buf); return {rows,errors}; }
    return {rows:[],errors:[]};
  };
  const a=await rd(X.FILES.accounts, X.parseAccounts);
  const f=await rd(X.FILES.fees, X.parseFees);
  const c=await rd(X.FILES.caseTypes, X.parseCaseTypes);
  const year=String(ctx.year);
  const settings=(await s.readJSON("settings.json",[year]))||{feeLag:1,costLag:0,openingCash:0};
  const plan=(await s.readJSON("plan.json",[year]))||null;
  ctx.data={ leaves:a.rows, fees:f.rows, caseTypes:c.rows,
    errors:{accounts:a.errors,fees:f.errors,caseTypes:c.errors},
    orphans:[], settings, plan, sample:false, year };
  ctx.data.tree=buildTree(ctx.data.leaves);
}
function loadSample(){
  const leaves=sampleLeaves();
  ctx.data={ leaves, fees:sampleFeeSchedule(), caseTypes:sampleCaseTypes(),
    errors:{}, orphans:[], settings:{feeLag:1,costLag:0,openingCash:180_000_000},
    plan:null, sample:true, year:String(ctx.year), tree:buildTree(leaves) };
}

/* ---------------- 액션 ---------------- */
ctx.actions = {
  async connect(){
    try{
      await ctx.store.pick();
      await loadFromStore();
      toast("ok","폴더 연결됨", ctx.store.name);
      go("masters");
    }catch(e){ if(e?.name!=="AbortError") toast("err","연결 실패", e.message); }
  },
  useSample(){ loadSample(); toast("ok","샘플 모드","가상 데이터로 둘러봅니다"); go("home"); },
  async reload(){
    if(ctx.store.connected){
      if(!(await ctx.store.ensurePermission())){ toast("warn","권한 필요","폴더 접근을 허용해 주세요"); return; }
      await loadFromStore(); toast("ok","다시 읽음","엑셀을 새로 불러왔습니다");
    } else { loadSample(); }
    render();
  },
  async makeTemplates(){
    if(!ctx.store.connected){ toast("warn","폴더 필요","먼저 폴더를 연결하세요"); return; }
    if(!(await ctx.store.ensurePermission())){ toast("warn","권한 필요","폴더 쓰기 권한을 허용해 주세요"); return; }
    const jobs=[
      [X.FILES.accounts, X.tplAccounts],
      [X.FILES.fees, X.tplFees],
      [X.FILES.caseTypes, X.tplCaseTypes],
    ];
    let made=0, skip=0;
    for(const [name,gen] of jobs){
      if(await ctx.store.fileExists(name)){ skip++; continue; }
      await ctx.store.writeArrayBuffer(name, gen()); made++;
    }
    await loadFromStore();
    toast("ok", `템플릿 ${made}개 생성`, skip?`${skip}개는 이미 있어 건너뜀`:"엑셀에서 편집 후 다시 읽기 하세요");
    render();
  },
  async saveSettings(obj){
    if(!ctx.store.connected){ toast("warn","폴더 필요","먼저 폴더를 연결하세요"); return; }
    if(!(await ctx.store.ensurePermission())) return;
    await ctx.store.writeJSON("settings.json", obj, [String(ctx.year)]);
    ctx.data.settings=obj;
    toast("ok","저장됨",`${ctx.year} 설정을 저장했습니다`);
  },
};

/* ---------------- 라우팅 / 렌더 ---------------- */
function go(route){ ctx.route=route; render(); }
function render(){
  V.clearOverlays();
  // 온보딩: 데이터가 전혀 없고(연결X & 샘플X) → 빈 상태
  const noData = !ctx.store.connected && !ctx.data.sample;
  const meta = NAV.find(n=>n.id===ctx.route) || NAV[0];
  document.getElementById("viewTitle").textContent = meta.title;
  document.getElementById("viewSub").textContent = meta.sub || "";
  updateChrome();
  paintNav();

  if(noData){ V.renderEmpty(content,{onConnect:ctx.actions.connect,onSample:ctx.actions.useSample,supported:isSupported()}); return; }

  switch(ctx.route){
    case "home": V.renderHome(content, ctx); break;
    case "masters": V.renderMasters(content, ctx); break;
    case "settings": V.renderSettings(content, ctx); break;
    case "plan": V.renderSoon(content,{icon:"🧭",title:"사업비 계획 — 다음 단계",
      desc:"산출근거(드라이버) 기반으로 예산을 세우고, 내년엔 숫자만 바꿔 자동 재계산하는 롤링 방식으로 만듭니다.",
      plan:["항목별 산출근거: 고정 / 단가×수량 / 수입연동 / 인원연동 / 증감률","월별 자동 배분","계획 저장 → plan.json"]}); break;
    case "variance": V.renderSoon(content,{icon:"📊",title:"계획 vs 실적 — 다음 단계",
      desc:"실적_사업비.xlsx를 읽어 항목별 집행률과 연말 추정 추세를 분석합니다.",
      plan:["집행률·잔여·초과 항목","이벤트 반영 연말 추정","월별 추이 라인"]}); break;
    case "income": V.renderSoon(content,{icon:"💳",title:"수입 · 수수료 — 다음 단계",
      desc:"사고유형×구간 단가표와 처리건수로 월별 수수료 수입을 집계합니다.",
      plan:["예상/실제 처리건수","유형×구간 단가 적용","월별 수입 집계"]}); break;
    case "pnl": V.renderSoon(content,{icon:"💰",title:"손익 · 현금흐름 — 다음 단계",
      desc:"수입 − 사업비로 흑자/적자를, 입·출금 타이밍으로 월별 현금 잔액과 부족/여유를 봅니다.",
      plan:["월별 손익(재무제표 관점)","현금흐름 시뮬레이션","현금 부족 경보"]}); break;
    default: V.renderHome(content, ctx);
  }
}

function paintNav(){
  const nav=document.getElementById("nav");
  nav.innerHTML="";
  NAV.forEach(n=>{
    const b=document.createElement("button");
    b.className="navitem"+(n.id===ctx.route?" is-active":"");
    b.innerHTML=`<span class="ni-ico">${n.ico}</span><span class="ni-lbl">${n.label}</span>`;
    b.title=n.title;
    b.onclick=()=>go(n.id);
    nav.appendChild(b);
  });
}
function updateChrome(){
  const fs=document.getElementById("folderStat"), ft=document.getElementById("folderText");
  const reload=document.getElementById("reloadBtn");
  const yp=document.getElementById("yearPick");
  if(ctx.store.connected){ fs.classList.add("is-on"); ft.textContent=ctx.store.name; reload.hidden=false; }
  else if(ctx.data.sample){ fs.classList.remove("is-on"); ft.textContent="샘플 모드"; reload.hidden=true; }
  else { fs.classList.remove("is-on"); ft.textContent="폴더 미연결"; reload.hidden=true; }
  yp.hidden = !YEAR_SCOPED.has(ctx.route) || (!ctx.store.connected && !ctx.data.sample);
  document.getElementById("yearVal").textContent=ctx.year;
}

/* ---------------- 상단바 이벤트 ---------------- */
document.getElementById("reloadBtn").onclick=()=>ctx.actions.reload();
document.getElementById("yearPrev").onclick=async()=>{ ctx.year--; await refetchYear(); };
document.getElementById("yearNext").onclick=async()=>{ ctx.year++; await refetchYear(); };
async function refetchYear(){ if(ctx.store.connected) await loadFromStore(); render(); }

document.getElementById("themeToggle").onclick=()=>{
  const cur=document.documentElement.getAttribute("data-theme")==="light"?"dark":"light";
  document.documentElement.setAttribute("data-theme",cur);
  localStorage.setItem("cockpit-theme",cur);
};

/* ---------------- 토스트 ---------------- */
function toast(kind,title,desc){
  const wrap=document.getElementById("toasts");
  const ic={ok:"✅",warn:"⚠️",err:"⛔"}[kind]||"ℹ️";
  const t=document.createElement("div"); t.className="toast "+kind;
  t.innerHTML=`<span class="ti">${ic}</span><div><div class="tt">${title}</div>${desc?`<div class="td">${desc}</div>`:""}</div>`;
  wrap.appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transform="translateY(8px)"; setTimeout(()=>t.remove(),260); }, 3200);
}

/* ---------------- 시작 ---------------- */
(async function boot(){
  const saved=localStorage.getItem("cockpit-theme"); if(saved) document.documentElement.setAttribute("data-theme",saved);
  app.dataset.view="ready";
  // 이전 폴더 자동 복구 시도
  try{
    if(isSupported()){
      const ok=await ctx.store.restore();
      if(ok){ await loadFromStore(); toast("ok","폴더 재연결", ctx.store.name); go("home"); return; }
    }
  }catch(e){/* 무시 */}
  render(); // 빈 상태
})();
