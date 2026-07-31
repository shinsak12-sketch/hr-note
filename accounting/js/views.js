/* =========================================================================
   views.js — 화면 렌더러 + 3D 사업비 도시(cityscape)
   ========================================================================= */
import { fmtWon, fmtCompact, fmtPct, execColor, shade, catColor,
         buildTree, sumBudget, sumActual } from "./data.js";

const h = (html)=>{ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstElementChild; };
const $ = (s,r=document)=>r.querySelector(s);

/** 화면 전환 시 떠있는 오버레이(3D 툴팁 등) 정리 */
export function clearOverlays(){ hideTip(); }

/* ============================ 빈 상태 / 온보딩 ============================ */
export function renderEmpty(root, { onConnect, onSample, supported }){
  root.innerHTML="";
  root.appendChild(h(`
    <div class="empty">
      <div class="empty__card">
        <div class="empty__ico">🗂️</div>
        <h2>데이터 폴더를 연결하세요</h2>
        <p>이 앱은 서버 없이 동작합니다. 크롬에서 <b>폴더 하나를 연결</b>하면
           그 안의 엑셀(계정항목·수수료단가·사고유형)을 읽고, 계획·설정은 같은 폴더에
           자동 저장합니다. 데이터는 <b>전부 내 PC</b>에만 남습니다.</p>
        <div class="empty__actions">
          <button class="btn btn--primary" id="btnConnect" ${supported?"":"disabled"}>📁 폴더 연결하기</button>
          <button class="btn btn--ghost" id="btnSample">✨ 샘플로 둘러보기</button>
        </div>
        <div class="empty__hint">
          ${supported
            ? "처음이면 빈 폴더를 고른 뒤, 기준정보 화면에서 <b>템플릿 엑셀</b>을 자동 생성할 수 있어요."
            : "⚠ 이 브라우저는 폴더 연결(File System Access)을 지원하지 않습니다. 크롬/엣지에서 열어주세요."}
        </div>
      </div>
    </div>`));
  $("#btnConnect",root)?.addEventListener("click", onConnect);
  $("#btnSample",root)?.addEventListener("click", onSample);
}

/* ============================ 홈 (대시보드 + 3D 도시) ============================ */
export function renderHome(root, ctx){
  const leaves = ctx.data.leaves || [];
  root.innerHTML="";
  if(!leaves.length){
    root.appendChild(h(`<div class="soon"><div class="big">📊</div>
      <h3>표시할 사업비 데이터가 없습니다</h3>
      <p>기준정보에서 <b>계정항목.xlsx</b>를 읽어오거나, 상단에서 <b>샘플로 둘러보기</b>를 눌러보세요.</p></div>`));
    return;
  }
  const tree = buildTree(leaves);
  const totBudget=sumBudget(tree), totActual=sumActual(tree);
  const rate = totActual/totBudget;
  const remain = totBudget-totActual;
  const over = tree.filter(n=>n.actual>n.budget).length;

  // --- KPI 스트립 ---
  const kpis=h(`<div class="kpis"></div>`);
  const kpi=(label,val,unit,accent,delta)=>h(`
    <div class="kpi" style="--accent:${accent}">
      <div class="kpi__label">${label}</div>
      <div class="kpi__val">${val}<span class="unit">${unit||""}</span></div>
      ${delta||""}
    </div>`);
  kpis.append(
    kpi("연간 계획 사업비", fmtCompact(totBudget),"원", "var(--cat-1)"),
    kpi("집행액", fmtCompact(totActual),"원", "var(--cat-3)",
        `<div class="kpi__delta ${rate<=1?'up':'down'}">집행률 ${fmtPct(rate,1)}</div>`),
    kpi("잔여 예산", fmtCompact(remain),"원", remain>=0?"var(--st-good)":"var(--st-crit)"),
    kpi("초과 대분류", String(over),"개", over?"var(--st-crit)":"var(--st-good)",
        `<div class="kpi__delta ${over?'down':'up'}">${over?'예산 초과 주의':'모두 예산 내'}</div>`),
  );
  root.appendChild(kpis);

  // --- 3D 도시 + 우측 순위 ---
  const layout=h(`<div class="grid-2" style="grid-template-columns:1.7fr 1fr;align-items:stretch"></div>`);
  const cityCard=h(`
    <div class="card city-wrap" style="padding:0;overflow:hidden">
      <div class="card__hd" style="padding:16px 18px 14px">
        <div>
          <div class="card__title"><span class="dot" style="background:var(--cat-1)"></span>사업비 구성 · 3D</div>
          <div class="card__sub">바닥면적 = 계획예산 · 높이 = 집행액 · 색 = 집행률 (클릭하여 드릴다운)</div>
        </div>
      </div>
      <div class="city" id="city"></div>
    </div>`);
  const rankCard=renderRankPanel(tree, ctx);
  layout.append(cityCard, rankCard);
  root.appendChild(layout);

  buildCity($("#city",cityCard), tree, { title:"전체", ctx });
}

function renderRankPanel(tree, ctx){
  const rows=[...tree].sort((a,b)=>b.budget-a.budget);
  const max=Math.max(...rows.map(r=>r.budget),1);
  const card=h(`<div class="card"><div class="card__hd"><div>
      <div class="card__title"><span class="dot" style="background:var(--cat-3)"></span>대분류 집행 현황</div>
      <div class="card__sub">예산 규모순 · 막대색은 집행률</div>
    </div></div><div class="card__bd" id="rankbd" style="padding-top:6px"></div></div>`);
  const bd=$("#rankbd",card);
  rows.forEach((n,i)=>{
    const r=n.actual/n.budget, col=execColor(r);
    const row=h(`
      <div style="padding:11px 2px;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">
          <div style="font-weight:650;display:flex;gap:9px;align-items:center">
            <span class="swatch" style="width:10px;height:10px;border-radius:3px;background:${catColor(i)}"></span>${n.name}
          </div>
          <div style="font-variant-numeric:tabular-nums;font-size:12.5px">
            <b>${fmtCompact(n.actual)}</b>
            <span style="color:var(--ink-mut)"> / ${fmtCompact(n.budget)}</span>
          </div>
        </div>
        <div style="height:8px;border-radius:99px;background:var(--surface-3);overflow:hidden;position:relative">
          <i style="display:block;height:100%;width:${Math.min(100,r*100)}%;background:${col};border-radius:99px"></i>
          ${r>1?`<span style="position:absolute;right:6px;top:-1px;font-size:9px;color:var(--st-crit);font-weight:800">▲${fmtPct(r-1,0)} 초과</span>`:""}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:11px;color:var(--ink-mut)">
          <span>집행률 ${fmtPct(r,1)}</span><span>잔여 ${fmtCompact(n.budget-n.actual)}</span>
        </div>
      </div>`);
    bd.appendChild(row);
  });
  return card;
}

/* ============================ 3D 도시 빌더 ============================ */
function buildCity(cityEl, nodes, state){
  const ctx=state.ctx;
  cityEl._yaw = cityEl._yaw ?? -42;
  cityEl.innerHTML=`
    <div class="city__hud" id="hud"></div>
    <div class="city__spin">
      <button class="iconbtn" id="rotL" title="왼쪽으로 회전" style="width:36px;height:36px">⟲</button>
      <button class="iconbtn" id="rotR" title="오른쪽으로 회전" style="width:36px;height:36px">⟳</button>
    </div>
    <div class="city__stage" id="stage" style="--yaw:${cityEl._yaw}deg"></div>
    <div class="city__legend">
      <div>집행률</div>
      <div class="legend__bar"></div>
      <div class="legend__scale"><span>여유</span><span>정상</span><span>주의</span><span>초과</span></div>
    </div>`;
  const stage=cityEl.querySelector("#stage");

  const cols=Math.ceil(Math.sqrt(nodes.length))||1;
  const rows=Math.ceil(nodes.length/cols);
  const cell=150, gap=0;
  const boardW=cols*cell, boardH=rows*cell;
  const maxB=Math.max(...nodes.map(n=>n.budget),1);
  const maxA=Math.max(...nodes.map(n=>n.actual),1);

  const board=h(`<div class="board" style="left:${-boardW/2}px;top:${-boardH/2}px;width:${boardW}px;height:${boardH}px;--cell:${cell}px"></div>`);
  stage.appendChild(board);

  nodes.forEach((n,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const fp = 44 + 70*Math.sqrt(n.budget/maxB);          // 바닥면적(예산)
    const hz = 14 + 188*(n.actual/maxA);                  // 높이(집행액)
    const bx = col*cell + (cell-fp)/2;
    const by = row*cell + (cell-fp)/2;
    const r = n.actual/n.budget;
    const base=execColor(r);
    const cTop=shade(base,.22), cA=shade(base,-.12), cB=shade(base,-.34);
    // 4면 박스: 바닥 footprint(fp×fp)에서 +Z 로 hz 만큼 압출
    const bldg=h(`
      <div class="bldg" data-i="${i}"
           style="left:${bx}px;top:${by}px;width:${fp}px;height:${fp}px">
        <div class="bldg__face" style="width:${fp}px;height:${fp}px;background:${cTop};transform:translateZ(${hz}px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)"></div>
        <div class="bldg__face" style="width:${fp}px;height:${hz}px;background:${cA};transform-origin:0 0;transform:rotateX(90deg)"></div>
        <div class="bldg__face" style="width:${fp}px;height:${hz}px;background:${cA};transform-origin:0 0;transform:translateY(${fp}px) rotateX(90deg)"></div>
        <div class="bldg__face" style="width:${hz}px;height:${fp}px;background:${cB};transform-origin:0 0;transform:rotateY(-90deg)"></div>
        <div class="bldg__face" style="width:${hz}px;height:${fp}px;background:${cB};transform-origin:0 0;transform:translateX(${fp}px) rotateY(-90deg)"></div>
        <div class="bldg__cap">${n.name}</div>
      </div>`);
    board.appendChild(bldg);

    bldg.addEventListener("pointerenter",(e)=>{ showTip(e,n,i); bldg.querySelector(".bldg__cap").style.opacity="1"; });
    bldg.addEventListener("pointermove",(e)=>moveTip(e));
    bldg.addEventListener("pointerleave",()=>{ hideTip(); bldg.querySelector(".bldg__cap").style.opacity="0"; });
    bldg.addEventListener("click",()=>{
      if(n.children && n.children.length){
        state.path=(state.path||[]).concat([n.name]);
        drillTo(cityEl, state, n);
      }
    });
  });

  cityEl.addEventListener("pointerleave", hideTip);

  // 회전
  cityEl.querySelector("#rotL").onclick=()=>{ cityEl._yaw-=22; stage.style.setProperty("--yaw",cityEl._yaw+"deg"); };
  cityEl.querySelector("#rotR").onclick=()=>{ cityEl._yaw+=22; stage.style.setProperty("--yaw",cityEl._yaw+"deg"); };

  renderCrumb(cityEl, state);
}

function drillTo(cityEl, state, node){
  cityEl.classList.add("is-drill");
  const kids=node.children.map(c=>({...c}));
  buildCity(cityEl, kids, { ...state, title:node.name });
}
function renderCrumb(cityEl, state){
  const hud=cityEl.querySelector("#hud"); if(!hud) return;
  const path=state.path||[];
  hud.innerHTML="";
  const crumb=h(`<div class="city__crumb"></div>`);
  crumb.append(h(`<button data-lvl="-1">🏙️ 전체</button>`));
  path.forEach((p,i)=> crumb.append(h(`<span>›</span>`), h(`<b>${p}</b>`)));
  crumb.querySelector('[data-lvl="-1"]').onclick=()=>{
    state.path=[];
    cityEl.classList.remove("is-drill");
    const full = state.ctx.data.tree || buildTree(state.ctx.data.leaves||[]);
    buildCity(cityEl, full, { ctx:state.ctx, path:[] });
  };
  hud.appendChild(crumb);
}

/* --- 3D 툴팁 --- */
let tipEl=null;
function tip(){ if(!tipEl){ tipEl=h(`<div class="city-tip"></div>`); document.body.appendChild(tipEl);} return tipEl; }
function showTip(e,n,i){
  const r=n.actual/n.budget, t=tip();
  t.innerHTML=`
    <div class="city-tip__t"><span class="swatch" style="background:${execColor(r)}"></span>${n.name}</div>
    <div class="city-tip__row"><span>계획예산</span><b>${fmtWon(n.budget)}원</b></div>
    <div class="city-tip__row"><span>집행액</span><b>${fmtWon(n.actual)}원</b></div>
    <div class="city-tip__row"><span>잔여</span><b>${fmtWon(n.budget-n.actual)}원</b></div>
    <div class="city-tip__bar"><i style="width:${Math.min(100,r*100)}%;background:${execColor(r)}"></i></div>
    <div class="city-tip__row" style="margin-top:7px"><span>집행률</span><b style="color:${execColor(r)}">${fmtPct(r,1)}</b></div>
    ${n.children&&n.children.length?`<div class="city-tip__row"><span style="color:var(--cat-1)">클릭 → 하위 ${n.children.length}개 보기</span></div>`:""}`;
  moveTip(e); t.classList.add("show");
}
function moveTip(e){ const t=tip(); const x=e.clientX+16, y=e.clientY+16;
  t.style.left=Math.min(x, innerWidth-t.offsetWidth-12)+"px";
  t.style.top=Math.min(y, innerHeight-t.offsetHeight-12)+"px"; }
function hideTip(){ if(tipEl) tipEl.classList.remove("show"); }

/* ============================ 기준정보 ============================ */
export function renderMasters(root, ctx){
  root.innerHTML="";
  const d=ctx.data;
  const errs=[...(d.errors?.accounts||[]),...(d.errors?.fees||[]),...(d.errors?.caseTypes||[])];
  const orphans=d.orphans||[];

  // 검증 배너
  if(!d.leaves?.length){
    root.appendChild(h(`<div class="banner banner--warn"><div class="banner__ico">📄</div>
      <div class="banner__body"><b>아직 계정항목 엑셀이 없습니다.</b>
      아래 <b>템플릿 생성</b>을 누르면 폴더에 <code>계정항목.xlsx</code> 등이 만들어집니다. 엑셀에서 편집 후 <b>다시 읽기</b> 하세요.</div></div>`));
  } else if(errs.length || orphans.length){
    root.appendChild(h(`<div class="banner banner--crit"><div class="banner__ico">⚠️</div>
      <div class="banner__body"><b>검증 경고 ${errs.length+orphans.length}건</b>
      <ul>${errs.slice(0,6).map(e=>`<li>${e}</li>`).join("")}
      ${orphans.length?`<li>실적/계획엔 있으나 계정항목에 없는 코드 ${orphans.length}건 → 미분류 처리</li>`:""}</ul></div></div>`));
  } else {
    root.appendChild(h(`<div class="banner banner--ok"><div class="banner__ico">✅</div>
      <div class="banner__body"><b>정상</b> 계정 ${d.leaves.length}개 · 수수료단가 ${d.fees?.length||0}개 · 사고유형 ${d.caseTypes?.length||0}개 읽음.</div></div>`));
  }

  // 액션 바
  const bar=h(`<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn--primary" id="tplBtn">📥 템플릿 엑셀 생성</button>
      <button class="btn" id="reloadBtn2">🔄 엑셀 다시 읽기</button>
      ${ctx.store?.connected?`<span class="tag">📁 ${ctx.store.name}</span>`:`<span class="tag tag--warn">샘플 모드 (폴더 미연결)</span>`}
    </div>`);
  root.appendChild(bar);
  $("#tplBtn",bar).onclick=()=>ctx.actions.makeTemplates();
  $("#reloadBtn2",bar).onclick=()=>ctx.actions.reload();

  // 3열: 계정트리 / 수수료 / 사고유형
  const grid=h(`<div class="grid-2" style="grid-template-columns:1.5fr 1fr;align-items:start"></div>`);
  grid.appendChild(renderAccountTree(d.leaves||[]));
  const side=h(`<div style="display:flex;flex-direction:column;gap:18px"></div>`);
  side.appendChild(renderFeeTable(d.fees||[]));
  side.appendChild(renderCaseTypes(d.caseTypes||[]));
  grid.appendChild(side);
  root.appendChild(grid);
}

function renderAccountTree(leaves){
  const tree=buildTree(leaves);
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-1)"></span>계정 항목 (대·중·소)</div>
    <div class="card__sub">엑셀 <code>계정항목.xlsx</code>에서 읽음 · 총 ${leaves.length}개 소분류</div>
    </div></div><div class="card__bd"><div class="tree" id="tree"></div></div></div>`);
  const t=$("#tree",card);
  tree.forEach((n1,i)=>{
    const col=catColor(i);
    const node1=h(`<div class="tnode">
      <div class="trow lvl1">
        <span class="twist">▾</span>
        <span class="tlabel"><span class="swatch" style="background:${col}"></span>${n1.name}</span>
        <span style="color:var(--ink-mut);font-size:12px">${n1.children.length}개 중분류</span>
      </div>
      <div class="tchildren"></div></div>`);
    const c1=node1.querySelector(".tchildren");
    n1.children.forEach(n2=>{
      const node2=h(`<div class="tnode">
        <div class="trow"><span class="twist">▾</span>
          <span class="tlabel">${n2.name}</span>
          <span style="color:var(--ink-mut);font-size:12px">${n2.children.length}</span></div>
        <div class="tchildren"></div></div>`);
      const c2=node2.querySelector(".tchildren");
      n2.children.forEach(n3=>{
        c2.appendChild(h(`<div class="trow"><span class="twist" style="visibility:hidden">•</span>
          <span class="tlabel">${n3.name}</span>
          <span class="tcode">${n3.leaf?.code||""}</span></div>`));
      });
      c1.appendChild(node2);
      wireTwist(node2);
    });
    t.appendChild(node1);
    wireTwist(node1);
  });
  return card;
}
function wireTwist(node){
  const row=node.querySelector(".trow"), tw=row.querySelector(".twist"), kids=node.querySelector(".tchildren");
  if(!kids) return;
  const toggle=()=>{ kids.classList.toggle("collapsed"); tw.classList.toggle("closed"); };
  tw.addEventListener("click",toggle);
}

function renderFeeTable(fees){
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-2)"></span>수수료 단가표</div>
    <div class="card__sub">사고유형 × 구간 · <code>수수료단가.xlsx</code></div>
    </div></div><div class="card__bd" style="padding-top:6px"><div id="ft"></div></div></div>`);
  const bd=$("#ft",card);
  if(!fees.length){ bd.innerHTML=`<div style="color:var(--ink-mut);padding:12px 0">데이터 없음</div>`; return card; }
  const tbl=h(`<table class="tbl"><thead><tr>
    <th>사고유형</th><th>구간</th><th>구분</th><th class="num">단가</th></tr></thead><tbody></tbody></table>`);
  const tb=tbl.querySelector("tbody");
  fees.forEach(f=>{
    tb.appendChild(h(`<tr><td>${f.type}</td><td>${f.band||"-"}</td>
      <td><span class="tag ${f.rateType==='정률'?'tag--warn':''}">${f.rateType}</span></td>
      <td class="num">${f.rateType==="정률"? fmtPct(f.rate,1) : fmtWon(f.rate)+"원"}</td></tr>`));
  });
  bd.appendChild(tbl);
  return card;
}
function renderCaseTypes(types){
  const card=h(`<div class="card"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-7)"></span>사고 유형</div>
    <div class="card__sub"><code>사고유형.xlsx</code></div>
    </div></div><div class="card__bd" style="padding-top:6px"><div id="ct"></div></div></div>`);
  const bd=$("#ct",card);
  if(!types.length){ bd.innerHTML=`<div style="color:var(--ink-mut);padding:12px 0">데이터 없음</div>`; return card; }
  const tbl=h(`<table class="tbl"><thead><tr><th>코드</th><th>유형</th><th>설명</th></tr></thead><tbody></tbody></table>`);
  const tb=tbl.querySelector("tbody");
  types.forEach(t=> tb.appendChild(h(`<tr><td><span class="tcode">${t.typeCode}</span></td><td>${t.type}</td>
    <td style="color:var(--ink-2)">${t.desc||"-"}</td></tr>`)));
  bd.appendChild(tbl);
  return card;
}

/* ============================ 설정 ============================ */
export function renderSettings(root, ctx){
  root.innerHTML="";
  const s=ctx.data.settings||{};
  const card=h(`<div class="card" style="max-width:760px"><div class="card__hd"><div>
    <div class="card__title"><span class="dot" style="background:var(--cat-4)"></span>설정 · 현금흐름 가정</div>
    <div class="card__sub">이 값들은 연도 폴더의 <code>settings.json</code>에 저장됩니다.</div>
  </div></div><div class="card__bd">
    <div class="form-row"><div><label>시작 현금잔액</label><div class="hint">연초 보유 현금</div></div>
      <div><input class="input" id="s_cash" type="number" value="${s.openingCash??0}"> 원</div></div>
    <div class="form-row"><div><label>수수료 입금 시점</label><div class="hint">처리 후 며칠/개월 뒤 입금되는지</div></div>
      <div><select class="input" id="s_feeLag">
        <option value="0" ${s.feeLag==0?"selected":""}>당월 입금</option>
        <option value="1" ${(s.feeLag??1)==1?"selected":""}>익월 입금 (기본)</option>
        <option value="2" ${s.feeLag==2?"selected":""}>2개월 후</option>
      </select></div></div>
    <div class="form-row"><div><label>비용 지출 시점</label><div class="hint">대부분 발생 당월</div></div>
      <div><select class="input" id="s_costLag">
        <option value="0" ${(s.costLag??0)==0?"selected":""}>당월 지출 (기본)</option>
        <option value="1" ${s.costLag==1?"selected":""}>익월 지출</option>
      </select></div></div>
    <div style="margin-top:18px;display:flex;gap:10px">
      <button class="btn btn--primary" id="saveS" ${ctx.store?.connected?"":"disabled"}>💾 저장</button>
      ${ctx.store?.connected?"":`<span class="tag tag--warn">폴더 연결 시 저장 가능</span>`}
    </div>
  </div></div>`);
  root.appendChild(card);
  $("#saveS",card)?.addEventListener("click",()=>{
    ctx.actions.saveSettings({
      openingCash:Number($("#s_cash",card).value)||0,
      feeLag:Number($("#s_feeLag",card).value),
      costLag:Number($("#s_costLag",card).value),
    });
  });
}

/* ============================ 준비중 ============================ */
export function renderSoon(root, {icon,title,desc,plan}){
  root.innerHTML="";
  root.appendChild(h(`<div class="soon"><div class="big">${icon}</div>
    <h3>${title}</h3><p>${desc}</p>
    ${plan?`<div class="plan">${plan.map(p=>`▸ ${p}`).join("<br>")}</div>`:""}</div>`));
}
