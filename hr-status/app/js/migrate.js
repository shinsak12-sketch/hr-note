/* 데이터 형식 변환
   data\기준정보.xlsx 의 '정보' 시트에 형식 번호가 있음.
   프로그램을 고쳐 형식이 바뀌면 STEPS 에 [이전 번호 → 다음 번호] 변환을 하나씩 덧붙임.
   변환 전 원본은 backup 폴더에 '기준정보_변환전_v번호_날짜.xlsx' 로 먼저 보관함. */
var Migrate = (function () {
  var FMT = 1;
  var STEPS = {
    /* 예) 1: function (raw) { raw.sheets["새시트"] = []; return raw; }  // 1 → 2 */
  };
  function run(raw) {
    var from = raw.fmt || 1;
    if (from > FMT) return { ok: false, newer: true, from: from };
    for (var v = from; v < FMT; v++) {
      if (!STEPS[v]) throw new Error("형식 " + v + " → " + (v + 1) + " 변환 단계가 없습니다");
      raw = STEPS[v](raw); raw.fmt = v + 1;
    }
    return { ok: true, raw: raw, changed: from !== FMT, from: from };
  }
  return { FMT: FMT, run: run };
})();
