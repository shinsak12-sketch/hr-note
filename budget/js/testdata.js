/* 테스트(더미) 데이터 — 2025 · 2026년 판관비 실적을 그럴듯하게 만들어 냄
   같은 분류면 늘 같은 값 (나중에 집행 화면용 분개장 더미도 같은 금액으로 만들기 위해) */
(function (root) {
  "use strict";

  // 대분류별 연간 규모 (원, 2025년)
  var SCALE = {
    "임원보수": 1.15e9, "직원급여": 7.4e9, "상여금": 1.0e9, "잡급여": 1.5e8, "퇴직급여": 6.2e8, "복리후생비": 9.2e8,
    "여비교통비": 2.1e8, "접대비": 1.8e8, "통신비": 1.4e8, "세금과공과": 4e7, "감가상각비": 1.9e8, "지급임차료": 1.75e9,
    "수선비": 1.2e8, "보험료": 3e7, "차량유지비": 2.6e8, "교육훈련비": 1.6e8, "도서인쇄비": 2.2e7, "회의비": 4.5e7,
    "소모품비": 6e7, "지급수수료": 2.8e8, "조사연구비": 2e7, "광고선전비": 3e7, "행사비": 6e7, "손해조사비": 8e7, "채용비": 1.5e7, "잡비": 7e7
  };
  // 같은 대분류 안 비중 (이름에 들어 있으면)
  var WEIGHT = { "직원급여": 6.6, "성과급": 0.9, "성과가급": 0.3, "국민건강보험료": 4, "국민연금보험료": 4.5, "고용,산재": 2.5, "근로재해": 1.2, "선택적복리후생": 3, "직원독려식대": 2, "임차,관리비(본점)": 4, "임차,관리비(지점)": 6, "전산시스템": 2, "차량유류대": 3 };
  // 월 분포 (합 상관없음 — 비율로 씀)
  var PATTERN = [
    [/성과상여|상여금/, [2, 1, 1, 1, 1, 40, 1, 1, 1, 1, 1, 40]],
    [/^성과급/, [1, 1, 30, 1, 1, 1, 1, 1, 30, 1, 1, 1]],
    [/성과가급/, [1, 1, 1, 1, 1, 30, 1, 1, 1, 1, 1, 30]],
    [/연차휴가보상금/, [55, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5]],
    [/학자금/, [1, 2, 40, 2, 1, 1, 1, 2, 38, 2, 1, 1]],
    [/하계휴양소/, [0, 0, 0, 0, 0, 5, 45, 45, 5, 0, 0, 0]],
    [/의료비|건강진단/, [1, 1, 1, 2, 2, 2, 2, 2, 5, 35, 35, 12]],
    [/선택적복리후생/, [45, 1, 1, 1, 1, 1, 45, 1, 1, 1, 1, 1]],
    [/교육|연수원/, [2, 4, 14, 14, 12, 4, 2, 4, 14, 14, 12, 4]],
    [/결의행사|행사/, [45, 2, 2, 2, 2, 5, 2, 2, 2, 2, 4, 30]],
    [/^기타\(보험료\)|보험료\)/, [80, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]],
    [/회계감사/, [5, 5, 40, 5, 5, 5, 5, 5, 5, 5, 5, 10]],
    [/세무조정/, [0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    [/장애인고용부담금/, [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    [/퇴직급여/, [6, 4, 14, 5, 4, 10, 5, 4, 12, 5, 6, 25]],
    [/감가상각|임차|사무기기|렌트카|전산시스템|BIZRING|사용료|창고/, "flat"]
  ];
  // 2026년에 일부러 튀게 만든 달 (집행 화면 테스트용)
  var SPIKE26 = [[/경조금/, 3, 3.2], [/본점주관|본점 회의/, 8, 3.0], [/접대비\(지점\)/, 10, 2.4], [/시외출장비/, 6, 0.4]];

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; }; }

  // 분류 → 실적 항목 (더존 과목 하나 = 항목 하나, 더존 연결이 없는 계정은 계정 이름으로)
  function items(cat) {
    var out = [];
    cat.forEach(function (t) {
      t.kids.forEach(function (m) {
        (m.kids && m.kids.length ? m.kids.map(function (s) { return [s, m.name + " › " + s.name]; }) : [[m, m.name]]).forEach(function (x) {
          var lf = x[0], dz = lf.dz && lf.dz.length ? lf.dz : [{ code: "", name: lf.name }];
          dz.forEach(function (d) { out.push({ top: t.name, leaf: lf.id, path: x[1], code: d.code || "", name: d.name || lf.name }); });
        });
      });
    });
    // 대분류 안 비중
    var byTop = {};
    out.forEach(function (it) { (byTop[it.top] = byTop[it.top] || []).push(it); });
    Object.keys(byTop).forEach(function (top) {
      var list = byTop[top], sum = 0;
      list.forEach(function (it) {
        var r = rng(hash("w" + it.name))(), w = 0.4 + 1.2 * r;
        Object.keys(WEIGHT).forEach(function (k) { if (it.name.indexOf(k) === 0) w = WEIGHT[k]; });
        it.w = w; sum += w;
      });
      var scale = SCALE[top] || 5e7;
      list.forEach(function (it) { it.base = scale * it.w / sum; });
    });
    return out;
  }

  function pattern(name) {
    for (var i = 0; i < PATTERN.length; i++) if (PATTERN[i][0].test(name)) return PATTERN[i][1];
    return null;
  }

  // 한 항목의 한 해 월별 실적 (원, 10원 단위)
  function months(it, year) {
    var r = rng(hash(year + "|" + it.name + "|" + it.code)), pat = pattern(it.name), out = [];
    var grow = year === 2026 ? 1 + (rng(hash("g" + it.name))() * 0.15 - 0.05) : 1;
    var annual = it.base * grow;
    var shape = [], s = 0, i;
    for (i = 0; i < 12; i++) {
      var v = pat === "flat" ? 1 : pat ? pat[i] * (0.85 + 0.3 * r()) : 0.8 + 0.4 * r();
      if (/직원급여|임원보수/.test(it.name) && year === 2026 && i >= 3) v *= 1.03;
      shape.push(v); s += v;
    }
    for (i = 0; i < 12; i++) out.push(Math.round(annual * shape[i] / s / 10) * 10);
    if (year === 2026) SPIKE26.forEach(function (x) { if (x[0].test(it.name)) out[x[1]] = Math.round(out[x[1]] * x[2] / 10) * 10; });
    return out;
  }

  // 계정 ID → 월별 합 (그 계정에 연결된 더존 과목들의 합)
  function byLeaf(list, year) {
    var o = {};
    list.forEach(function (it) {
      var m = months(it, year), a = o[it.leaf] = o[it.leaf] || new Array(12).fill(0);
      m.forEach(function (v, i) { a[i] += v; });
    });
    return o;
  }

  // 더존 손익 원데이터 양식 (과목 | 계 | 1월 … 12월). upto: 몇 월까지. amounts: {과목명: [12]} 를 주면 그 금액으로
  function profitLoss(list, year, upto, amounts) {
    upto = upto || 12;
    var head = ["과  목", "계"];
    for (var i = 1; i <= upto; i++) head.push(i + "월");
    var seen = {}, lines = [];
    list.forEach(function (it) { if (seen[it.name]) return; seen[it.name] = 1; lines.push({ name: it.name, m: (amounts ? amounts[it.name] || new Array(12).fill(0) : months(it, year)).slice(0, upto) }); });
    var sum = function (rows) { var t = new Array(upto).fill(0); rows.forEach(function (r) { r.forEach(function (v, i) { t[i] += v; }); }); return t; };
    var sga = sum(lines.map(function (l) { return l.m; }));
    var rr = rng(hash("rev" + year));
    var rev = sga.map(function (v) { return Math.round(v * (1.03 + 0.04 * rr()) / 10) * 10; });
    var interest = sga.map(function () { return Math.round((8e6 + 4e6 * rr()) / 10) * 10; });
    var misc = sga.map(function () { return Math.round(1e6 * rr() / 10) * 10; });
    var loss = sga.map(function () { return Math.round(3e5 * rr() / 10) * 10; });
    var op = rev.map(function (v, i) { return v - sga[i]; });
    var nonop = interest.map(function (v, i) { return v + misc[i]; });
    var pre = op.map(function (v, i) { return v + nonop[i] - loss[i]; });
    var tax = pre.map(function (v) { return Math.max(0, Math.round(v * 0.2 / 10) * 10); });
    var row = function (name, m) { return [name, m.reduce(function (a, b) { return a + b; }, 0)].concat(m); };
    var zero = new Array(upto).fill(0);
    var aoa = [head, row("Ⅰ  . 매      출      액", rev), row("      관계회사용역매출", rev), row("Ⅱ  . 매    출   원   가", zero), row("Ⅲ  . 매  출  총  이  익", rev),
      row("Ⅳ  . 판  매  관  리  비", sga)];
    lines.forEach(function (l) { aoa.push(row("      " + l.name, l.m)); });
    aoa.push(row("Ⅴ  . 영    업   이   익", op), row("Ⅵ  . 영  업  외  수  익", nonop), row("      이자수익", interest), row("      기타(잡이익)", misc),
      row("Ⅶ  . 영  업  외  비  용", loss), row("      잡손실", loss), row("Ⅷ  . 법인세비용차감전순이익", pre),
      row("Ⅸ  . 법  인  세  비  용", tax), row("      법인세등", tax), row("Ⅹ  . 당  기  순  이  익", pre.map(function (v, i) { return v - tax[i]; })));
    return aoa;
  }

  /* 분개장 더미 (더존 분개장 출력 양식). asOf: 1월 ~ 몇 월까지 누계
     4월 파일부터는 '지난 달 수정' 테스트용으로 3월 전표 2건이 바뀜 (경조금 추가 · 시외출장비 금액 수정) */
  var MEMO = {
    "경조금": ["직원 부친상 조의금", "직원 결혼 축의금", "임원 모친상 조화", "직원 자녀 결혼 축의금", "협력사 대표 부친상 조화"],
    "출장": ["지점 현장 조사 출장", "본점 회의 참석 출장", "교육 참석 출장", "손해사정 현장 확인"],
    "식대": ["팀 야근 식대", "주간 회의 식대", "현장 직원 식대"],
    "접대": ["협력사 미팅 식대", "보험사 담당자 미팅", "고객사 간담회"],
    "통신": ["월 통신 요금", "휴대폰 요금", "인터넷 회선 요금"],
    "임차": ["월 임차료", "관리비"],
    "": ["월 정기 지급", "청구서 지급", "카드 사용분", "구매 대금"]
  };
  var PTN = ["○○상사", "△△식당", "□□꽃집", "한빛통신", "대한렌탈", "미래문구", "직원", "-", "서울빌딩관리", "푸른여행사"];
  function memoFor(name, r) {
    var k = /경조/.test(name) ? "경조금" : /출장|교통/.test(name) ? "출장" : /식대/.test(name) ? "식대" : /접대/.test(name) ? "접대" : /통신|FAX|핸드폰|BIZRING/.test(name) ? "통신" : /임차/.test(name) ? "임차" : "";
    var a = MEMO[k]; return a[Math.floor(r() * a.length)];
  }
  function journal(list, year, asOf) {
    var rows = [], noByDate = {}, amounts = {};
    var put = function (d, dr, drA, cr, crA, memo, ptn) {
      noByDate[d] = (noByDate[d] || 0) + 1;
      var no = noByDate[d], gj = [d, String(no + 90)];
      rows.push([d, String(no), dr, drA, "", 0, memo, "", ptn, gj[0], gj[1], "", ""]);
      rows.push([d, String(no), 0, "", crA, cr, "", "", "", gj[0], gj[1], "", ""]);
    };
    var day = function (m, r) { var dd = 1 + Math.floor(r() * 27); return year + "/" + ("0" + m).slice(-2) + "/" + ("0" + dd).slice(-2); };
    var seen = {};
    list.forEach(function (it) {
      if (seen[it.name] || !it.code) return;
      seen[it.name] = 1;
      var mm = months(it, year), acct = "[" + it.code + "]" + it.name, flat = pattern(it.name) === "flat", r = rng(hash("j" + year + it.name));
      amounts[it.name] = new Array(12).fill(0);
      for (var m = 1; m <= asOf; m++) {
        var total = mm[m - 1], n = flat ? 1 : 1 + Math.floor(r() * 5), left = total;
        for (var i = 0; i < n; i++) {
          var v = i === n - 1 ? left : Math.round(total / n * (0.6 + 0.8 * r()) / 1000) * 1000;
          if (i < n - 1 && Math.abs(v) > Math.abs(left)) v = Math.round(left / 2 / 10) * 10;
          left -= v;
          if (!v) continue;
          put(day(m, r), v, acct, v, r() < 0.7 ? "[25300]미지급금" : "[10301]보통예금", memoFor(it.name, r), PTN[Math.floor(r() * PTN.length)]);
          amounts[it.name][m - 1] += v;
        }
      }
    });
    // 지난 달 수정 테스트 (4월 파일부터)
    if (asOf >= 4) {
      var gyeong = list.filter(function (x) { return /경조금/.test(x.name) && x.code; })[0];
      if (gyeong) { put(year + "/03/28", 500000, "[" + gyeong.code + "]" + gyeong.name, 500000, "[25300]미지급금", "직원 모친상 조의금 (누락분 추가)", "-"); amounts[gyeong.name][2] += 500000; }
      var trip = list.filter(function (x) { return /시외출장비/.test(x.name) && x.code; })[0];
      if (trip) {
        for (var k = 0; k < rows.length; k += 2) {
          if (rows[k][3] === "[" + trip.code + "]" + trip.name && rows[k][0].slice(5, 7) === "03" && rows[k][2] > 230000) {
            rows[k][2] -= 230000; rows[k + 1][5] -= 230000; rows[k][6] += " (금액 정정)"; amounts[trip.name][2] -= 230000; break;
          }
        }
      }
    }
    // 판관비 아닌 전표 (예수금 · 보통예금)
    var rr = rng(hash("etc" + year));
    for (var m2 = 1; m2 <= asOf; m2++) for (var e = 0; e < 25; e++) {
      var v2 = Math.round((1e5 + 4e6 * rr()) / 10) * 10;
      put(day(m2, rr), v2, "[25400]예수금", v2, "[10301]보통예금", e % 5 ? "" : "원천세 납부", "-");
    }
    rows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (+a[1] - +b[1]) || (a[2] ? -1 : 1); });
    var dr = 0, cr = 0;
    rows.forEach(function (x) { dr += x[2]; cr += x[5]; });
    var aoa = [["구 분[기표]", "구 분[기표]", "차     변", "차     변", "대    변", "대    변", "적요", "거래처", "거래처", "구 분[결의]", "구 분[결의]", "PJT", "PJT"],
      ["년/월/일", "번호", "금액", "계정과목", "계정과목", "금액", "적요", "코드", "거래처명", "년/월/일", "번호", "코드", "PJT명"]].concat(rows);
    aoa.push(["합계", "", dr, "", "", cr, "", "", "", "", "", "", ""]);
    return { aoa: aoa, amounts: amounts };
  }

  root.TestData = { items: items, months: months, byLeaf: byLeaf, profitLoss: profitLoss, journal: journal };
})(this);
