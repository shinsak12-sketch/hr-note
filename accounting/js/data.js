/* =========================================================================
   data.js — 데이터 모델, 색 유틸, 숫자 포맷, 집계, 샘플 데이터 (순수 함수)
   ========================================================================= */

/* ---------- 숫자 포맷 ---------- */
export function fmtWon(n){
  if(n==null||isNaN(n)) return "-";
  return Math.round(n).toLocaleString("ko-KR");
}
/** 큰 금액을 억/만 단위로 축약 (예: 123456789 → "1.23억") */
export function fmtCompact(n){
  if(n==null||isNaN(n)) return "-";
  const a=Math.abs(n), s=n<0?"-":"";
  if(a>=1e8) return s+(a/1e8).toFixed(a>=1e9?0:2).replace(/\.00$/,"")+"억";
  if(a>=1e4) return s+Math.round(a/1e4).toLocaleString("ko-KR")+"만";
  return s+Math.round(a).toLocaleString("ko-KR");
}
export function fmtPct(r,dp=0){ if(r==null||isNaN(r))return"-"; return (r*100).toFixed(dp)+"%"; }

/* ---------- 색 유틸 ---------- */
export function hexToRgb(h){h=h.replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
export function rgbToHex(r){return "#"+r.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");}
export function lerp(a,b,t){return a+(b-a)*t;}
export function mix(h1,h2,t){const a=hexToRgb(h1),b=hexToRgb(h2);return rgbToHex([lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)]);}
export function shade(hex,amt){ // amt>0 밝게, <0 어둡게
  const t=Math.abs(amt); return amt>=0? mix(hex,"#ffffff",t) : mix(hex,"#000000",t);
}

/* 카테고리(대분류) 고정 8슬롯 — 순환 금지, 9번째는 "기타" */
export const CAT = ["#3987e5","#d95926","#199e70","#c98500","#d55181","#008300","#9085e9","#e66767"];
export function catColor(i){ return CAT[i] || "#7f8796"; }

/* 집행률 → 상태색(여유:cool → 정상:green → 주의:amber → 초과:red)
   pace(연중 경과율)를 주면 "속도 대비"로 환산, 없으면 단순 집행률.
   구간 사이는 부드럽게 보간. */
const EXEC_STOPS = [
  [0.00,"#2f6fe0"],  // 여유 (blue)
  [0.60,"#1f9e6b"],  // 정상 (green)
  [0.85,"#e0a11a"],  // 주의 (amber)
  [1.00,"#e0631f"],  // 임박 (orange)
  [1.20,"#cf2f2f"],  // 초과 (red)
];
export function execColor(execRatio, pace){
  let v = pace ? execRatio/Math.max(pace,0.001) : execRatio;
  if(isNaN(v)) v=0;
  v=Math.max(0,Math.min(1.2,v));
  for(let i=0;i<EXEC_STOPS.length-1;i++){
    const [a,ca]=EXEC_STOPS[i], [b,cb]=EXEC_STOPS[i+1];
    if(v<=b){ return mix(ca,cb,(v-a)/(b-a)); }
  }
  return EXEC_STOPS[EXEC_STOPS.length-1][1];
}
export function execLabel(r){ return r>=1?"초과":r>=0.85?"주의":r>=0.6?"정상":"여유"; }

/* ---------- 집계 ---------- */
/** leaves: [{code,l1,l2,l3,budget,actual}] → 레벨별 트리 집계 */
export function buildTree(leaves){
  const root={children:new Map()};
  for(const r of leaves){
    const path=[r.l1, r.l2, r.l3].filter(x=>x!=null && x!=="");
    let node=root;
    path.forEach((name,depth)=>{
      if(!node.children.has(name)) node.children.set(name,{name,depth:depth+1,budget:0,actual:0,children:new Map(),leaf:null});
      node=node.children.get(name);
      node.budget+=(r.budget||0); node.actual+=(r.actual||0);
      if(depth===path.length-1) node.leaf=r;
    });
  }
  const toArr=(m)=> [...m.values()].map(n=>({...n,children:toArr(n.children)}));
  return toArr(root.children);
}
export function sumBudget(nodes){return nodes.reduce((s,n)=>s+n.budget,0);}
export function sumActual(nodes){return nodes.reduce((s,n)=>s+n.actual,0);}

/* ---------- 샘플 데이터 (폴더 미연결 '둘러보기'용) ---------- */
export function sampleLeaves(){
  const P=(l1,l2,l3,code,budget,rate)=>({code,l1,l2,l3,budget,actual:Math.round(budget*rate)});
  return [
    P("인건비","급여","기본급","1010",  1_080_000_000, .58),
    P("인건비","급여","상여금","1020",   240_000_000, .35),
    P("인건비","4대보험","건강보험","1030", 96_000_000, .57),
    P("인건비","4대보험","국민연금","1040", 88_000_000, .56),
    P("인건비","복리후생","식대","1050",   72_000_000, .61),
    P("인건비","복리후생","경조사","1060", 18_000_000, .44),
    P("지급수수료","외주","손해사정 위탁","2010", 420_000_000, .72),
    P("지급수수료","외주","법률자문","2020",  84_000_000, .48),
    P("지급수수료","전산","솔루션 사용료","2030", 156_000_000, .63),
    P("지급수수료","전산","클라우드","2040",  60_000_000, .70),
    P("임차관리비","사무실","임차료","3010", 300_000_000, .58),
    P("임차관리비","사무실","관리비","3020",  84_000_000, .60),
    P("임차관리비","차량","유류/리스","3030", 66_000_000, .52),
    P("마케팅","광고","온라인","4010",       120_000_000, .41),
    P("마케팅","광고","오프라인","4020",      48_000_000, .90),
    P("마케팅","영업","접대비","4030",        36_000_000, 1.08),
    P("일반관리","사무","소모품","5010",       30_000_000, .66),
    P("일반관리","사무","통신비","5020",       24_000_000, .58),
    P("일반관리","교육","임직원 교육","5030",  42_000_000, .29),
    P("일반관리","여비","국내출장","5040",     33_000_000, .74),
  ];
}
export function sampleFeeSchedule(){
  return [
    {typeCode:"P",type:"대인",band:"소액",rateType:"정액",rate:120000},
    {typeCode:"P",type:"대인",band:"일반",rateType:"정액",rate:250000},
    {typeCode:"P",type:"대인",band:"고액",rateType:"정률",rate:0.03},
    {typeCode:"D",type:"대물",band:"소액",rateType:"정액",rate:90000},
    {typeCode:"D",type:"대물",band:"일반",rateType:"정액",rate:180000},
    {typeCode:"D",type:"대물",band:"고액",rateType:"정률",rate:0.025},
    {typeCode:"C",type:"자차",band:"일반",rateType:"정액",rate:110000},
  ];
}
export function sampleCaseTypes(){
  return [
    {typeCode:"P",type:"대인",desc:"인적 피해 손해사정"},
    {typeCode:"D",type:"대물",desc:"물적 피해 손해사정"},
    {typeCode:"C",type:"자차",desc:"자기차량 손해"},
  ];
}
