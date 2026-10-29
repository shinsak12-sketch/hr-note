/* 사업비 계획 계산 (화면과 무관한 순수 로직) */
(function (root) {
  "use strict";

  var METHODS = ["%증감", "절대증감", "인원", "단가×수량", "수기"];
  var SPLITS = ["균등", "수기", "비율"];
  var RND_UNITS = { "원": 1, "십원": 10, "백원": 100, "천원": 1000, "만원": 10000, "십만원": 100000 };
  var RND_MODES = ["반올림", "절상", "절하"];
  var DISP_UNITS = { "원": [1, 0], "천원": [1000, 0], "백만원": [1e6, 1], "억원": [1e8, 2] };

  function num(v) {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    var n = parseFloat(String(v).replace(/[,\s원%]/g, ""));
    return isFinite(n) ? n : 0;
  }

  // 엑셀 ROUND 와 같은 방식 (0.5 는 0에서 먼 쪽으로)
  function roundAway(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }

  function roundTo(x, unit, mode) {
    var q = x / unit;
    // 부동소수 오차 정리 (예: 10128.333333 / 1000)
    q = Math.round(q * 1e9) / 1e9;
    if (mode === "절상") q = q < 0 ? -Math.ceil(-q) : Math.ceil(q);
    else if (mode === "절하") q = q < 0 ? -Math.floor(-q) : Math.floor(q);
    else q = roundAway(q);
    return q * unit;
  }

  function blankRow(acc) {
    return {
      code: acc.code, l1: acc.l1 || "", l2: acc.l2 || "", l3: acc.l3 || "",
      prev: 0, meth: "", a: 0, b: 0, c: 0, split: "균등",
      sv: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], memo: ""
    };
  }

  // 산출 금액 (반올림 전)
  function baseAmount(r) {
    switch (r.meth) {
      case "%증감": return num(r.prev) * (1 + num(r.a));
      case "절대증감": return num(r.prev) + num(r.a);
      case "인원":
      case "단가×수량": return num(r.a) * num(r.b) * (num(r.c) > 0 ? num(r.c) : 1);
      case "수기": return num(r.a);
      default: return 0;
    }
  }

  function compute(r, settings) {
    var unit = RND_UNITS[settings.rndUnit] || 1000;
    var mode = settings.rndMode || "반올림";
    var k = baseAmount(r);
    var months = [], i, sum = 0, svSum = 0;
    for (i = 0; i < 12; i++) svSum += num(r.sv[i]);
    for (i = 0; i < 12; i++) {
      var raw;
      if (!r.meth) raw = 0;
      else if (r.split === "수기") raw = num(r.sv[i]);
      else if (r.split === "비율") raw = k * num(r.sv[i]);
      else raw = k / 12;
      var v = r.meth ? roundTo(raw, unit, mode) : 0;
      months.push(v);
      sum += v;
    }
    var check = "";
    if (r.meth && r.split === "비율" && Math.abs(svSum - 1) > 0.0005) check = "비율 합 " + (svSum * 100).toFixed(1) + "%";
    if (r.meth && r.split === "수기" && Math.round(svSum - k) !== 0) check = "수기 합 차이";
    var prev = num(r.prev);
    return {
      base: k, months: months, plan: sum,
      yoy: prev ? sum / prev - 1 : (sum ? Infinity : NaN),
      missing: !r.meth, check: check, svSum: svSum,
      checkDiff: r.split === "수기" ? svSum - k : 0
    };
  }

  function fmtWon(v) { return Math.round(v).toLocaleString("ko-KR"); }

  // 산출근거 문장 (표시 단위 기준)
  function basisText(r, settings) {
    var t = function (v) { return fmtUnit(v, settings.dispUnit, true); };
    var s = "";
    switch (r.meth) {
      case "%증감": s = "전년 " + t(r.prev) + " × (1" + (num(r.a) < 0 ? "−" : "+") + (Math.abs(num(r.a)) * 100).toFixed(1) + "%)"; break;
      case "절대증감": s = "전년 " + t(r.prev) + (num(r.a) < 0 ? " − " : " + ") + t(Math.abs(num(r.a))); break;
      case "인원": s = "인당 " + t(r.a) + " × " + num(r.b) + "명" + (num(r.c) > 1 ? " × " + num(r.c) + "개월" : ""); break;
      case "단가×수량": s = "단가 " + t(r.a) + " × " + num(r.b) + (num(r.c) > 1 ? " × " + num(r.c) + "개월" : ""); break;
      case "수기": s = "연간 " + t(r.a); break;
    }
    if (s && r.split === "수기") s += " · 월 수기분할";
    else if (s && r.split === "비율") s += " · 월 비율분할";
    return s;
  }

  // 표시 단위 숫자 (0 은 "-", 음수는 △)
  function fmtUnit(v, unitName, keepZero) {
    var u = DISP_UNITS[unitName] || DISP_UNITS["천원"];
    var n = v / u[0];
    var p = Math.pow(10, u[1]);
    n = roundAway(n * p) / p;
    if (n === 0 && !keepZero) return "-";
    var s = Math.abs(n).toLocaleString("ko-KR", { minimumFractionDigits: u[1], maximumFractionDigits: u[1] });
    return (n < 0 ? "△" : "") + s;
  }

  function fmtPct(v) {
    if (v === Infinity) return "신규";
    if (!isFinite(v)) return "";
    var s = (Math.abs(v) * 100).toFixed(1) + "%";
    if (v > 0.0005) return "+" + s;
    if (v < -0.0005) return "−" + s;
    return "0.0%";
  }

  // 코드순 정렬 후 대분류 묶음
  function groupRows(rows) {
    var sorted = rows.slice().sort(function (x, y) { return String(x.code).localeCompare(String(y.code), "ko", { numeric: true }); });
    var groups = [], idx = {};
    sorted.forEach(function (r) {
      var key = r.l1 || "(대분류 없음)";
      if (!(key in idx)) { idx[key] = groups.length; groups.push({ name: key, rows: [] }); }
      groups[idx[key]].rows.push(r);
    });
    return groups;
  }

  root.Calc = {
    METHODS: METHODS, SPLITS: SPLITS, RND_UNITS: RND_UNITS, RND_MODES: RND_MODES, DISP_UNITS: DISP_UNITS,
    num: num, roundTo: roundTo, blankRow: blankRow, baseAmount: baseAmount, compute: compute,
    basisText: basisText, fmtUnit: fmtUnit, fmtPct: fmtPct, fmtWon: fmtWon, groupRows: groupRows
  };
})(this);
