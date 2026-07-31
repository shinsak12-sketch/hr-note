/* =========================================================================
   xlsxio.js — 엑셀 마스터 읽기 + 템플릿 생성 (전역 XLSX = SheetJS 사용)
   파일 규약:
     계정항목.xlsx   : 코드 | 대분류 | 중분류 | 소분류
     수수료단가.xlsx : 유형코드 | 사고유형 | 구간 | 단가유형(정액/정률) | 단가
     사고유형.xlsx   : 유형코드 | 사고유형 | 설명
   ========================================================================= */

export const FILES = {
  accounts:"계정항목.xlsx",
  fees:"수수료단가.xlsx",
  caseTypes:"사고유형.xlsx",
};

const XLSX = ()=> window.XLSX;

function norm(s){ return String(s??"").trim(); }
/** 헤더 별칭 중 존재하는 첫 값 */
function pick(row, aliases){
  for(const a of aliases){ if(a in row && norm(row[a])!=="") return row[a]; }
  // 공백/유사 헤더 보정
  const keys=Object.keys(row);
  for(const a of aliases){
    const k=keys.find(k=>norm(k).replace(/\s/g,"")===norm(a).replace(/\s/g,""));
    if(k && norm(row[k])!=="") return row[k];
  }
  return "";
}

function firstSheetRows(buf){
  const wb=XLSX().read(buf,{type:"array"});
  const ws=wb.Sheets[wb.SheetNames[0]];
  return XLSX().utils.sheet_to_json(ws,{defval:""});
}

/* ---------- 파서 ---------- */
export function parseAccounts(buf){
  const rows=firstSheetRows(buf), out=[], errs=[];
  rows.forEach((r,i)=>{
    const code=norm(pick(r,["코드","계정코드","code"]));
    const l1=norm(pick(r,["대분류","1분류","l1"]));
    const l2=norm(pick(r,["중분류","2분류","l2"]));
    const l3=norm(pick(r,["소분류","3분류","l3"]));
    if(!code && !l1) return; // 빈 줄
    if(!code) errs.push(`${i+2}행: 코드 누락 (${l1||"?"}/${l2}/${l3})`);
    if(!l1)   errs.push(`${i+2}행: 대분류 누락 (코드 ${code})`);
    out.push({code,l1,l2,l3,budget:0,actual:0});
  });
  // 코드 중복
  const seen=new Map();
  out.forEach(r=>{ if(r.code){ if(seen.has(r.code)) errs.push(`코드 중복: ${r.code}`); seen.set(r.code,1);} });
  return {rows:out, errors:errs};
}
export function parseFees(buf){
  const rows=firstSheetRows(buf), out=[], errs=[];
  rows.forEach((r,i)=>{
    const typeCode=norm(pick(r,["유형코드","typecode","코드"]));
    const type=norm(pick(r,["사고유형","유형","type"]));
    const band=norm(pick(r,["구간","등급","band"]));
    const rateType=norm(pick(r,["단가유형","유형구분","ratetype"]))||"정액";
    let rate=pick(r,["단가","금액","요율","rate"]);
    if(!type && !typeCode) return;
    rate=Number(String(rate).replace(/[,%\s]/g,""));
    if(rateType==="정률" && rate>1) rate=rate/100; // 3 → 0.03
    if(isNaN(rate)) errs.push(`${i+2}행: 단가 숫자 아님 (${type}/${band})`);
    out.push({typeCode,type,band,rateType,rate:isNaN(rate)?0:rate});
  });
  return {rows:out, errors:errs};
}
export function parseCaseTypes(buf){
  const rows=firstSheetRows(buf), out=[], errs=[];
  rows.forEach(r=>{
    const typeCode=norm(pick(r,["유형코드","typecode","코드"]));
    const type=norm(pick(r,["사고유형","유형","type"]));
    const desc=norm(pick(r,["설명","비고","desc"]));
    if(!type && !typeCode) return;
    out.push({typeCode,type,desc});
  });
  return {rows:out, errors:errs};
}

/* ---------- 템플릿 생성 (ArrayBuffer 반환) ---------- */
function wbFromAOA(sheetName, aoa, colWidths){
  const ws=XLSX().utils.aoa_to_sheet(aoa);
  if(colWidths) ws["!cols"]=colWidths.map(w=>({wch:w}));
  const wb=XLSX().utils.book_new();
  XLSX().utils.book_append_sheet(wb, ws, sheetName);
  return XLSX().write(wb,{bookType:"xlsx",type:"array"});
}
export function tplAccounts(){
  return wbFromAOA("계정항목",[
    ["코드","대분류","중분류","소분류"],
    ["1010","인건비","급여","기본급"],
    ["1020","인건비","급여","상여금"],
    ["1030","인건비","4대보험","건강보험"],
    ["2010","지급수수료","외주","손해사정 위탁"],
    ["3010","임차관리비","사무실","임차료"],
    ["4010","마케팅","광고","온라인"],
    ["5010","일반관리","사무","소모품"],
  ],[10,16,16,20]);
}
export function tplFees(){
  return wbFromAOA("수수료단가",[
    ["유형코드","사고유형","구간","단가유형","단가"],
    ["P","대인","소액","정액","120000"],
    ["P","대인","일반","정액","250000"],
    ["P","대인","고액","정률","3"],
    ["D","대물","일반","정액","180000"],
    ["C","자차","일반","정액","110000"],
  ],[10,12,10,10,12]);
}
export function tplCaseTypes(){
  return wbFromAOA("사고유형",[
    ["유형코드","사고유형","설명"],
    ["P","대인","인적 피해 손해사정"],
    ["D","대물","물적 피해 손해사정"],
    ["C","자차","자기차량 손해"],
  ],[10,12,28]);
}
