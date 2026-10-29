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

  // t: 총액(인원 · 단가×수량 역산용, 0 이면 전년 실적), auto: 자동 계산할 칸 a|b|c|t, pm: 전년 월별 실적
  function blankPlan() {
    return { prev: 0, meth: "", a: 0, b: 0, c: 0, t: 0, auto: "t", split: "균등", sv: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], memo: "", pm: [] };
  }

  function blankRow(acc) {
    return {
      code: acc.code, l1: acc.l1 || "", l2: acc.l2 || "", l3: acc.l3 || "",
      prev: 0, meth: "", a: 0, b: 0, c: 0, split: "균등",
      sv: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], memo: ""
    };
  }

  function isQty(meth) { return meth === "인원" || meth === "단가×수량"; }
  function autoOf(r) { return isQty(r.meth) && ["a", "b", "c"].indexOf(r.auto) >= 0 ? r.auto : "t"; }
  // 역산 기준 총액: 넣은 총액, 비어 있으면 전년 실적
  function totalOf(r) { return num(r.t) || num(r.prev); }

  // 인원 · 단가×수량: 네 칸(월액 a · 인원 b · 개월 c · 총액 t) 중 자동 칸을 나머지로 계산
  function solve(r) {
    var a = num(r.a), b = num(r.b), c = num(r.c) > 0 ? num(r.c) : 1, auto = autoOf(r), t = totalOf(r);
    if (auto === "a") a = b && c ? t / (b * c) : 0;
    else if (auto === "b") b = a && c ? t / (a * c) : 0;
    else if (auto === "c") c = a && b ? t / (a * b) : 0;
    else t = a * b * c;
    return { a: a, b: b, c: c, t: t, auto: auto };
  }

  // 산출 금액 (반올림 전)
  function baseAmount(r) {
    switch (r.meth) {
      case "%증감": return num(r.prev) * (1 + num(r.a));
      case "절대증감": return num(r.prev) + num(r.a);
      case "인원":
      case "단가×수량": return solve(r).t;
      case "수기": return num(r.a);
      default: return 0;
    }
  }

  // 연간 금액(단위의 배수)을 12달로: 단위로 나눠 떨어지지 않는 끝수는 12월에
  function splitEven(annual, unit) {
    var sign = annual < 0 ? -1 : 1, q = Math.round(Math.abs(annual) / unit), each = Math.floor(q / 12), out = [];
    for (var i = 0; i < 12; i++) out.push(sign * (i < 11 ? each : q - each * 11) * unit);
    return out;
  }

  /* 월 금액 · 확정 계획액
     균등 · 비율: 연간 금액을 먼저 반올림 단위 · 방식으로 확정 → 달로 나누고 끝수는 한 달에 (월 합계 = 연간 금액)
       균등은 12월, 비율은 비율이 가장 큰 달. 비율 합이 100% 가 아니면 끝수 조정 없이 경고
     수기: 넣은 월 금액 그대로 (단위 반올림), 산출 금액과 다르면 차이(manualDiff)만 알려 줌 */
  function compute(r, settings) {
    var unit = RND_UNITS[settings.rndUnit] || 1000;
    var mode = settings.rndMode || "반올림";
    var k = baseAmount(r);
    var months = [], i, svSum = 0, fixMonth = -1;
    for (i = 0; i < 12; i++) svSum += num(r.sv[i]);
    var ratioOk = Math.abs(svSum - 1) <= 0.0005;
    var annual = roundTo(k, unit, mode);
    if (!r.meth) months = new Array(12).fill(0);
    else if (r.split === "수기") for (i = 0; i < 12; i++) months.push(roundTo(num(r.sv[i]), unit, "반올림"));
    else if (r.split === "비율") {
      var big = 0;
      for (i = 0; i < 12; i++) { months.push(roundTo(annual * num(r.sv[i]), unit, "반올림")); if (num(r.sv[i]) > num(r.sv[big])) big = i; }
      if (ratioOk) {
        var d = annual - months.reduce(function (x, y) { return x + y; }, 0);
        if (Math.round(d)) { months[big] += d; fixMonth = big; }
      }
    } else {
      months = splitEven(annual, unit);
      if (months[11] !== months[0]) fixMonth = 11;
    }
    var sum = months.reduce(function (x, y) { return x + y; }, 0);
    var check = "";
    if (r.meth && r.split === "비율" && !ratioOk) check = "비율 합 " + (svSum * 100).toFixed(1) + "%";
    var prev = num(r.prev);
    return {
      base: k, annual: annual, months: months, plan: sum, fixMonth: fixMonth,
      yoy: prev ? sum / prev - 1 : (sum ? Infinity : NaN),
      missing: !r.meth, check: check, svSum: svSum,
      manualDiff: r.meth && r.split === "수기" ? sum - annual : 0,
      checkDiff: r.split === "수기" ? svSum - k : 0
    };
  }

  // 전년 월별 실적 → 비율 (합 100%). 없거나 합이 0 이면 null
  function ratiosFrom(pm) {
    if (!pm || pm.length !== 12) return null;
    var s = pm.reduce(function (x, y) { return x + num(y); }, 0);
    if (!s) return null;
    var out = pm.map(function (v) { return Math.round(num(v) / s * 10000) / 10000; });
    var d = Math.round((1 - out.reduce(function (x, y) { return x + y; }, 0)) * 10000) / 10000, big = 0;
    out.forEach(function (v, i) { if (v > out[big]) big = i; });
    out[big] = Math.round((out[big] + d) * 10000) / 10000;
    return out;
  }

  // 한글 금액: 10000000 → "일천만원"
  function hangulWon(v) {
    var n = Math.round(num(v));
    if (!n) return "영원";
    var neg = n < 0;
    n = Math.abs(n);
    var D = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"], U = ["", "십", "백", "천"], B = ["", "만", "억", "조", "경"];
    var out = "", g = 0;
    while (n > 0 && g < B.length) {
      var part = n % 10000, s = "";
      n = Math.floor(n / 10000);
      for (var i = 3; i >= 0; i--) {
        var d = Math.floor(part / Math.pow(10, i)) % 10;
        if (d) s += D[d] + U[i];
      }
      if (s) out = s + B[g] + out;
      g++;
    }
    return (neg ? "마이너스 " : "") + out + "원";
  }

  function fmtWon(v) { return Math.round(v).toLocaleString("ko-KR"); }

  // 산출근거 문장 (표시 단위 기준)
  function basisText(r, settings) {
    var t = function (v) { return fmtUnit(v, settings.dispUnit, true); };
    var s = "";
    switch (r.meth) {
      case "%증감": s = "전년 " + t(r.prev) + " × (1" + (num(r.a) < 0 ? "−" : "+") + (Math.abs(num(r.a)) * 100).toFixed(1) + "%)"; break;
      case "절대증감": s = "전년 " + t(r.prev) + (num(r.a) < 0 ? " − " : " + ") + t(Math.abs(num(r.a))); break;
      case "인원":
      case "단가×수량":
        var x = solve(r), per = r.meth === "인원", nb = function (v) { return (Math.round(v * 100) / 100).toLocaleString("ko-KR"); };
        if (x.auto === "t") s = (per ? "인당 " : "단가 ") + t(x.a) + " × " + nb(x.b) + (per ? "명" : "") + (x.c > 1 ? " × " + nb(x.c) + "개월" : "");
        else s = "총액 " + t(x.t) + (num(r.t) ? "" : "(전년)") + " ÷ " +
          (x.auto === "a" ? nb(x.b) + (per ? "명" : "") + " ÷ " + nb(x.c) + "개월 = " + (per ? "인당 월 " : "단가 ") + t(x.a)
            : x.auto === "b" ? t(x.a) + " ÷ " + nb(x.c) + "개월 = " + nb(x.b) + (per ? "명" : "")
              : t(x.a) + " ÷ " + nb(x.b) + (per ? "명" : "") + " = " + nb(x.c) + "개월");
        break;
      case "수기": s = "연간 " + t(r.a); break;
    }
    if (s && r.split === "수기") s += " · 월 수기";
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
    num: num, roundTo: roundTo, blankPlan: blankPlan, blankRow: blankRow, baseAmount: baseAmount, compute: compute,
    solve: solve, isQty: isQty, totalOf: totalOf, ratiosFrom: ratiosFrom, hangulWon: hangulWon,
    basisText: basisText, fmtUnit: fmtUnit, fmtPct: fmtPct, fmtWon: fmtWon, groupRows: groupRows
  };
})(this);
