/* 분류 기준: 카드를 보고서 줄(바구니)에 담아 만듦 */
var Classify = (function () {
  var $ = U.$, esc = U.esc;
  var curId = null, verSel = {}, AGG = null, plv = 3, tab = "org", olv = 4, q = "", onlyUn = false, picked = null, landed = null, unView = "grp", unOpen = true, RES = null, LASTM = null, EL = null;
  try { curId = localStorage.getItem("hrs.cset"); } catch (e) { }

  function set() { var S = M.S; var s = S.sets.filter(function (x) { return x.id === curId; })[0] || S.sets[0]; if (s) curId = s.id; return s; }
  /* 기간별 바구니: 지금 고른 기간 · 줄의 카드(읽기 CR / 쓰기 CW) */
  function V(s) { s = s || set(); if (!s || !s.pv || !s.pv.length) return null; var v = s.pv.filter(function (x) { return x.id === verSel[s.id]; })[0]; if (!v) { v = s.pv[s.pv.length - 1]; verSel[s.id] = v.id; } return v; }
  function CR(r) { var v = V(); return v ? v.cards[r.id] || [] : r.cards; }
  function CW(r) { var v = V(); if (!v) return r.cards; return v.cards[r.id] || (v.cards[r.id] = []); }
  function vMonths() { var s = set(), v = V(s); return v ? M.verRange(s, v).months : M.MONTHS; }
  function latest() { if (V()) { var ms = vMonths(); return ms.length ? ms[ms.length - 1] : null; } var l = M.latestFile(); return l ? l.m : null; }
  /* 이 기간 모든 달의 누락을 소속 경로별로 */
  function aggUn(s) {
    var agg = {};
    vMonths().forEach(function (m) { M.assign(s, m).un.forEach(function (p) { var k = p.path || p.org, a = agg[k] = agg[k] || { path: k, ms: {}, why: "" }; a.ms[m] = (a.ms[m] || 0) + 1; if (!a.why) a.why = M.assign(s, m).why[p.sb]; }); });
    return Object.keys(agg).map(function (k) { var a = agg[k], ms = Object.keys(a.ms).sort(); a.months = ms.length; a.first = ms[0]; a.last = ms[ms.length - 1]; a.n = a.ms[a.last]; a.max = Math.max.apply(null, ms.map(function (m) { return a.ms[m]; })); return a; });
  }
  function missMonths(s, v) { return M.verRange(s, v).months.filter(function (m) { return M.assign(s, m).un.length; }).length; }
  function persons() { var m = latest(), s = m && M.snap(m); return s ? s.persons : []; }
  function cnt(card) { return persons().filter(function (p) { return M.hit(card, p); }).length; }
  function usedIn(c) { return set().rows.filter(function (r) { return CR(r).some(function (x) { return x.c === c; }); }).length; }
  function colVals(h) { var m = {}; persons().forEach(function (p) { var v = p.row[h] || ""; m[v] = (m[v] || 0) + 1; }); return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }); }

  function chip(card, o) {
    o = o || {}; var c = card.c, t = M.ctype(c), v = M.cval(c), cls = t.slice(0, 4) === "col:" ? "ext" : t;
    var lv = t === "org" ? (function () { var e = M.byId("org", v); return '<span class="lvt">' + (e && e.lv ? "L" + e.lv : "?") + "</span>"; })() : "";
    var hf = Object.keys(card.f || {}).length, u = o.pool ? usedIn(c) : 0;
    var key = c + "\n" + (o.from || "") + "\n" + (o.idx === undefined ? "" : o.idx) + "\n" + (hf ? JSON.stringify(card.f) : "");
    return '<span class="chip ' + cls + (u ? " used" : "") + (o.from ? " inrow" : "") + '" data-drag="' + esc(key) + '"' + (o.from ? ' data-edit="' + o.from + "|" + o.idx + '"' : "") +
      ' title="' + esc(M.typeName(t) + " · " + M.cardLabel(c)) + (o.from ? " · 누르면 조건 추가 · 쪼개기" : "") + '"><span class="dot"></span>' + lv + esc(M.cardLabel(c)) +
      (hf ? '<span class="flt">' + esc(M.fltLabel(card.f)) + "</span>" : "") + '<span class="n">' + (o.n !== undefined ? o.n : cnt(card)) + "</span>" + (u ? '<span class="usedm">✓' + u + "</span>" : "") +
      (o.un ? '<span class="un">' + o.un + "</span>" : "") + (o.rm ? '<button class="x" data-rm="' + o.from + "|" + o.idx + '" title="빼기">✕</button>' : "") + "</span>";
  }
  function condText(s, i) {
    var rows = s.rows, parts = [];
    M.ancIdx(rows, i).forEach(function (a) { if (CR(rows[a]).length) parts.push("<b>" + esc(rows[a].nm) + "</b>"); });
    var g = {}; CR(rows[i]).forEach(function (c) { var k = M.ctype(c.c); (g[k] = g[k] || []).push(M.cardLabel(c.c) + (Object.keys(c.f || {}).length ? "(" + M.fltLabel(c.f) + ")" : "")); });
    for (var k in g) parts.push(M.typeName(k) + " " + esc(g[k].join(" 또는 ")));
    return parts.join(' <span class="and">그리고</span> ');
  }
  function isLast(rows, i) { var d = rows[i].d; for (var j = i + 1; j < rows.length; j++) { if (rows[j].d < d) return true; if (rows[j].d === d) return false; } return true; }

  function render(el) {
    EL = el || EL; var s = set();
    if (!s) { EL.innerHTML = '<div class="emptyset"><h2>분류 기준이 없습니다</h2><p>기준값을 먼저 만들면(⚙ 기본 세팅) 기본 분류 기준 3개가 생깁니다. 직접 만들려면 아래 버튼을 누르세요.</p><button class="btn pri big" data-ca="setNew">＋ 새 분류 기준</button></div>'; return; }
    LASTM = latest(); RES = LASTM ? M.assign(s, LASTM) : { row: {}, un: [], dup: {}, who: {}, why: {}, total: 0, dupN: 0 };
    AGG = V(s) ? aggUn(s) : null; if (AGG && unView === "grp") unView = "path"; if (!AGG && unView === "path") unView = "grp";
    EL.innerHTML = '<div class="cbar"><select class="inp sel" id="cSet" aria-label="분류 기준">' + M.S.sets.map(function (x) { return '<option value="' + x.id + '"' + (x === s ? " selected" : "") + ">" + esc(x.nm) + "</option>"; }).join("") + "</select>" +
      '<button class="ib wide" data-ca="setNew">＋ 새로</button><button class="ib wide" data-ca="setCopy">⧉ 복사</button><button class="ib wide" data-ca="setRen">✎ 이름</button><button class="ib wide" data-ca="setDel">✕ 삭제</button>' +
      '<span class="sep"></span><span class="fld">출력 기간</span><button class="pick" id="cPer">' + U.fmtM(s.from) + " ~ " + U.fmtM(s.to) + ' <span class="cal">▦</span></button>' +
      '<div class="seg" id="cUnit">' + [["m", "월별"], ["q", "분기말"], ["y", "연말"]].map(function (u) { return '<button data-cu="' + u[0] + '"' + (s.unit === u[0] ? ' class="on"' : "") + ">" + u[1] + "</button>"; }).join("") + "</div>" +
      '<span class="sp"></span><span class="stat"><b>' + RES.total + '</b> 전체</span><span class="stat ok"><b>' + (RES.total - RES.un.length) + '</b> 배치</span>' +
      '<button class="stat' + (RES.un.length ? " bad" : " ok") + '" data-ca="showUn"><b>' + RES.un.length + "</b> 미배치 ↓</button>" + (RES.dupN ? '<span class="stat warn"><b>' + RES.dupN + "</b> 겹침</span>" : "") +
      (AGG ? '<span class="stat' + (AGG.length ? " bad" : " ok") + '"><b>' + AGG.length + "</b> 이 기간 누락 소속</span>" : "") +
      '<button class="btn pri" data-ca="preview">▦ 인력현황에서 보기</button></div>' + verBar(s) +
      '<div class="cmain"><div class="panel pool" id="pool" data-drop="pool"></div><div class="panel"><h3>' + esc(s.nm) + ' <small>줄에 마우스를 올리면 ▲▼ · ＋하위 · ⚡우선 · ↺나머지 · ✕ · 이름은 더블클릭</small></h3><div class="rows" id="crows"></div>' +
      '<button class="addrow" data-ca="addTop">＋ 줄 추가</button><div class="panel unp" id="unp"></div>' +
      '<div class="rule"><b>담는 규칙</b> · 같은 종류 카드는 <b>또는</b>, 다른 종류는 <b>그리고</b> · 위 줄(합계 줄)에 담은 카드는 아래 줄 모두에 <b>공통 조건</b> · <b>⚡ 우선</b> 줄이 사람을 먼저 가져감 · <b>↺ 나머지</b> 줄은 같은 위 줄 안에서 남은 사람을 모두 받음 · 담은 카드를 누르면 그 카드에만 <b>조건</b>을 걸거나 값마다 <b>쪼개기</b> · 인원은 ' + (V(s) ? "이 기간 마지막 달" : "최신") + " 직원명부(" + (LASTM ? U.fmtM(LASTM) : "-") + ") 기준" + (V(s) ? " · <b>기간별 바구니</b>: 줄은 모든 기간 공통, 담긴 카드만 기간마다 따로 · 명부 소속 카드 = 그달 명부에 적힌 소속 경로 그대로" : "") + "</div></div></div>";
    renderPool(); renderRows(s); renderUn(); wire();
    $("#stL").textContent = "분류 기준 '" + s.nm + "' · 줄 " + s.rows.length + "개";
    if (landed) { U.$$("#crows .chip").forEach(function (c) { if (c.dataset.drag.split("\n")[0] === landed) c.classList.add("landed"); }); landed = null; }
  }
  function verBar(s) {
    if (!s.pv || !s.pv.length) return '<div class="vbar"><span class="fs">지금은 모든 달에 같은 바구니 · 조직개편으로 기간마다 담을 카드가 달라지면 →</span><button class="btn sm" data-ca="pvOn">⧗ 기간별 바구니로 쓰기</button></div>';
    var cur = V(s);
    return '<div class="vbar"><b>기간별 바구니</b>' + s.pv.map(function (v, i) {
      var rg = M.verRange(s, v), mm = missMonths(s, v);
      return '<button class="vchip' + (v === cur ? " on" : "") + '" data-pv="' + v.id + '" title="' + rg.months.length + '개월' + (mm ? " · 누락 있는 달 " + mm : " · 누락 없음") + '"><span>' + (i + 1) + "</span>" + U.fmtM(v.from) + " ~ " + (rg.to ? U.fmtM(rg.to) : "") + (mm ? "<em>" + mm + "</em>" : "<i>✓</i>") + "</button>";
    }).join("") + '<button class="btn sm" data-ca="pvNew" data-mpk title="고른 달부터 새 바구니 · 그 직전 바구니를 복사해서 시작">＋ 새 기간</button>' +
      (s.pv.indexOf(cur) > 0 ? '<button class="btn sm" data-ca="pvFrom" data-mpk>시작월 바꾸기</button>' : "") + (s.pv.length > 1 ? '<button class="btn sm" data-ca="pvDel">이 기간 삭제</button>' : "") +
      '<span class="fs">빨간 숫자 = 그 기간에 누락 있는 달 수</span></div>';
  }
  function renderPool() {
    function unOf(c) {
      if (AGG && M.ctype(c) === "pth") { var v = M.cval(c), per = {}; AGG.forEach(function (a) { if (a.path === v || a.path.indexOf(v + " › ") === 0) Object.keys(a.ms).forEach(function (m) { per[m] = (per[m] || 0) + a.ms[m]; }); }); var mx = 0; for (var k in per) if (per[k] > mx) mx = per[k]; return mx; }
      var n = 0; RES.un.forEach(function (p) { if (M.cardOk(c, p)) n++; }); return n;
    }
    function pass(c) { if (q && M.cardLabel(c).indexOf(q) < 0) return false; if (onlyUn && !unOf(c)) return false; return true; }
    function chips(list) { return list.filter(pass).map(function (c) { return chip({ c: c, f: {} }, { pool: 1, un: unOf(c) }); }).join(""); }
    var body = "", S = M.S;
    if (tab === "pth") {
      body += '<div class="ptools"><div class="seg">' + [1, 2, 3].map(function (l) { return '<button data-plv="' + l + '"' + (plv === l ? ' class="on"' : "") + ">" + M.LVN[l + 1] + "</button>"; }).join("") + "</div></div>";
      var ps = M.pathsIn(vMonths()).filter(function (x) { return x.depth === plv; }), pg = {};
      ps.forEach(function (x) { var k = x.path.split(" › ").slice(0, -1).join(" › "); (pg[k] = pg[k] || []).push(x); });
      Object.keys(pg).sort().forEach(function (k) {
        var h = pg[k].filter(function (x) { return pass("pth:" + x.path); }).map(function (x) { return chip({ c: "pth:" + x.path, f: {} }, { pool: 1, un: unOf("pth:" + x.path), n: x.n || "~" + U.fmtM(x.last).slice(2) }); }).join("");
        if (h) body += '<div class="grp">' + (k ? "<h5>" + esc(k) + "</h5>" : "") + '<div class="wrap">' + h + "</div></div>";
      });
      body += '<div class="ptip">' + (V() ? "이 기간(" + U.fmtM(vMonths()[0]) + " ~ " + U.fmtM(LASTM) + ") 명부에 나온 소속 경로" : "전체 명부에 나온 소속 경로") + " · 숫자 = 마지막 달 인원 (~25.06 = 그때까지만 있었음) · 상위를 담으면 아래가 모두 들어감</div>";
    } else if (tab === "org") {
      body += '<div class="ptools"><div class="seg">' + [1, 2, 3, 4, 0].map(function (l) { return '<button data-lv="' + l + '"' + (olv === l ? ' class="on"' : "") + ">" + (l ? M.LVN[l] : "미정") + "</button>"; }).join("") + "</div></div>";
      var lst = S.org.filter(function (o) { return o.lv === olv; }), groups = {};
      lst.forEach(function (o) { var k = o.p || ""; (groups[k] = groups[k] || []).push("org:" + o.id); });
      Object.keys(groups).forEach(function (k) { var h = chips(groups[k]); if (h) body += '<div class="grp">' + (k ? "<h5>" + esc(M.nm(M.byId("org", k))) + "</h5>" : "") + '<div class="wrap">' + h + "</div></div>"; });
      body += '<div class="ptip">상위 조직 카드를 담으면 그 아래 조직이 모두 들어감 · 담은 카드를 누르면 직무 · 직급 등으로 거르거나 쪼갤 수 있음</div>';
    } else if (tab === "job") body += '<div class="wrap">' + chips(S.job.map(function (x) { return "job:" + x.id; })) + "</div>";
    else if (tab === "grd") body += '<div class="wrap">' + chips(S.grd.map(function (x) { return "grd:" + x.id; })) + "</div>";
    else if (tab === "per") {
      var ps = q ? persons().filter(function (p) { return p.sb.indexOf(q) >= 0 || (p.nm || "").indexOf(q) >= 0; }).slice(0, 40) : [];
      body += '<div class="wrap">' + ps.map(function (p) { return chip({ c: "per:" + p.sb, f: {} }, { pool: 1 }); }).join("") + "</div>" + '<div class="ptip">' + (q ? "" : "위 검색 칸에 사번이나 이름을 넣으세요 · ") + "특정 한 사람만 따로 뺄 때 · 누락 인력 목록에서 바로 끌어와도 됨</div>";
    } else {
      var h = tab.slice(4), used = S.sets.some(function (s) { return s.rows.some(function (r) { return r.cards.some(function (x) { return M.ctype(x.c) === tab || (x.f || {})[tab]; }); }); });
      body += '<div class="wrap">' + chips(colVals(h).map(function (v) { return tab + ":" + v; })) + '</div><div class="ptip">직원명부 \'' + esc(h) + "' 열의 값 · 명부에 새 값이 생기면 카드도 자동으로 생김" + (used ? "" : ' · <button class="lnk" data-coldel="' + esc(h) + '">이 카드 종류 빼기</button>') + "</div>";
    }
    if (!/chip/.test(body) && tab !== "per") body += '<div class="ptip">조건에 맞는 카드 없음</div>';
    var T = [["pth", "명부 소속"], ["org", "조직"], ["job", "직무"], ["grd", "직급"]].concat(S.cols.map(function (h) { return ["col:" + h, h]; })).concat([["per", "사람"]]);
    $("#pool").innerHTML = "<h3>카드 <small>빨간 숫자 = 미배치</small></h3>" +
      '<div class="ptabs">' + T.map(function (t) { return '<button data-tab="' + esc(t[0]) + '"' + (tab === t[0] ? ' class="on"' : "") + "><i class=\"t-" + (t[0].slice(0, 4) === "col:" ? "ext" : t[0]) + "\"></i>" + esc(t[1]) + "</button>"; }).join("") +
      '<button class="addtab" data-ca="colAdd" title="직원명부 열을 카드 종류로 추가">＋ 종류</button></div>' +
      '<div class="pbody"><div class="ptools"><input class="inp" id="cq" placeholder="' + (tab === "per" ? "사번 · 이름 찾기" : "카드 찾기") + '" value="' + esc(q) + '"><label><input type="checkbox" id="onlyUn"' + (onlyUn ? " checked" : "") + "> 미배치만</label></div>" + body + "</div>";
  }
  function renderRows(s) {
    var rows = s.rows;
    $("#crows").innerHTML = rows.map(function (r, i) {
      var par = M.isPar(rows, i), gl = ""; for (var k = 1; k < r.d; k++) gl += "  "; if (r.d) gl += isLast(rows, i) ? "└ " : "├ ";
      var ph = par ? "공통 조건 (선택) — 아래 줄 모두에 걸림" : r.rest ? "↺ 나머지: 카드 없이도 위 줄 안의 남은 인원을 받음" : "카드를 여기에 끌어다 놓기";
      var ct = condText(s, i), dup = RES.dup[r.id];
      var cr = CR(r), show = !par && ct && (cr.length > 1 || cr.some(function (c) { return Object.keys(c.f || {}).length; }) || M.ancIdx(rows, i).some(function (a) { return CR(rows[a]).length; }));
      return '<div class="row' + (par ? " par" : "") + (r.d === 0 ? " lv0" : "") + '" data-drop="' + r.id + '"><div class="nm"><span class="gl">' + gl + '</span><span class="t" data-ren="' + r.id + '">' + esc(r.nm) + "</span>" +
        (r.pr ? '<span class="tag pr">⚡우선</span>' : "") + (r.rest ? '<span class="tag rest">↺나머지</span>' : "") + "</div>" +
        '<span class="cnt" data-who="' + r.id + '" title="눌러서 인원 보기">' + (RES.row[r.id] || 0) + "</span>" +
        '<div class="slotw"><div class="slot" data-ph="' + ph + '">' + cr.map(function (c, ix) { return chip(c, { from: r.id, idx: ix, rm: 1 }); }).join("") + "</div>" +
        (show ? '<div class="cond">= ' + ct + "</div>" : "") + (dup ? '<div class="dup">⚠ ' + dup + "명이 다른 줄과 겹침 (위 줄에 집계)</div>" : "") + "</div>" +
        '<div class="racts"><button data-up="' + i + '">▲</button><button data-dn="' + i + '">▼</button><button data-sub="' + i + '">＋하위</button>' +
        (par ? "" : '<button data-pr="' + i + '" class="' + (r.pr ? "on" : "") + '" title="이 줄이 사람을 먼저 가져감">⚡</button><button data-rest="' + i + '" class="' + (r.rest ? "on2" : "") + '" title="남은 인원을 모두 받음">↺</button>') +
        (r.d ? '<button data-del="' + i + '">✕</button>' : "") + "</div></div>";
    }).join("");
  }
  function renderUn() {
    var un = RES.un, el = $("#unp");
    if (AGG ? !AGG.length : !un.length) { el.innerHTML = '<h3>누락 인력 <span class="okb">✓ 0명</span><small>' + (AGG ? "이 기간 모든 달" : "모든 인원") + "이 어느 줄엔가 들어가 있음</small></h3>"; return; }
    var body;
    if (unView === "path" && AGG) {
      body = '<table class="ut"><thead><tr><th>끌어서 담기</th><th>명부 소속 경로</th><th class="n">빠진 달</th><th>기간</th><th class="n">최대 인원</th><th>빠진 이유</th></tr></thead><tbody>' +
        AGG.sort(function (a, b) { return b.months - a.months || b.max - a.max; }).map(function (a) {
          return "<tr><td>" + chip({ c: "pth:" + a.path, f: {} }, { n: a.n }) + "</td><td>" + esc(a.path) + '</td><td class="n">' + a.months + '</td><td class="mono">' + U.fmtM(a.first) + (a.first !== a.last ? " ~ " + U.fmtM(a.last) : "") + '</td><td class="n">' + a.max + '</td><td class="why">' + esc(a.why || "") + "</td></tr>";
        }).join("") + "</tbody></table>";
    } else if (unView === "grp") {
      var g = {}; un.forEach(function (p) { var key = (p.olow || "?" + p.org) + "|" + (p.jid || "?" + p.job); (g[key] = g[key] || []).push(p); });
      body = '<table class="ut"><thead><tr><th>끌어서 담기</th><th>조직</th><th>직무</th><th class="n">인원</th><th>빠진 이유</th></tr></thead><tbody>' +
        Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; }).map(function (key) {
          var ps = g[key], p = ps[0], c = p.olow ? chip({ c: "org:" + p.olow, f: p.jid ? { job: [p.jid] } : {} }, { n: ps.length }) : '<span class="fs">조직 미매칭</span>';
          return "<tr><td>" + c + "</td><td>" + esc(p.org) + "</td><td>" + esc(p.job) + '</td><td class="n">' + ps.length + '</td><td class="why">' + esc(RES.why[p.sb]) + "</td></tr>";
        }).join("") + "</tbody></table>";
    } else {
      body = '<table class="ut"><thead><tr><th>끌어서 담기</th><th>사번</th><th>성명</th><th>조직</th><th>직무</th><th>직급</th><th>직책</th><th>빠진 이유</th></tr></thead><tbody>' +
        un.slice(0, 500).map(function (p) { return "<tr><td>" + chip({ c: "per:" + p.sb, f: {} }, { n: 1 }) + '</td><td class="mono">' + esc(p.sb) + "</td><td>" + esc(p.nm) + "</td><td>" + esc(p.org) + "</td><td>" + esc(p.job) + "</td><td>" + esc(p.gnm) + "</td><td>" + esc(p.pos || "-") + '</td><td class="why">' + esc(RES.why[p.sb]) + "</td></tr>"; }).join("") + "</tbody></table>";
    }
    el.innerHTML = '<h3 data-ca="unToggle" style="cursor:pointer">' + (unOpen ? "▾" : "▸") + ' 누락 인력 <span class="badb">' + (AGG ? AGG.length + "개 소속" : un.length + "명") + "</span><small>" + (AGG ? "이 기간 " + vMonths().length + "개월 중 한 번이라도 빠진 소속" : U.fmtM(LASTM) + " 말 · 어느 줄에도 안 들어간 사람") + "</small></h3>" +
      (unOpen ? '<div class="ubar"><div class="seg">' + (AGG ? '<button data-uv="path"' + (unView === "path" ? ' class="on"' : "") + ">소속 경로 (기간 전체)</button>" : "") + '<button data-uv="grp"' + (unView === "grp" ? ' class="on"' : "") + '>묶음 (조직 · 직무)</button><button data-uv="per"' + (unView === "per" ? ' class="on"' : "") + ">사람별" + (AGG ? " (" + U.fmtM(LASTM) + ")" : "") + "</button></div>" +
        '<span class="fs">' + (unView === "path" ? "명부 소속 카드를 줄로 끌거나 누른 뒤 줄을 누르면 담김 · 빠진 달 = 이 기간에서 그 소속이 누락된 달 수" : "묶음 카드를 줄로 끌면 \'조직 + 직무 조건\' 카드로 담김 · 조직 미매칭은 설정 › 미매칭에서 먼저 처리") + '</span></div><div class="uscroll">' + body + "</div>" : "");
  }

  /* ── 끌어다 놓기 ── */
  function rowById(id) { return set().rows.filter(function (r) { return r.id === id; })[0]; }
  function drop(key, to) {
    var a = key.split("\n"), c = a[0], from = a[1], idx = a[2], f = a[3] ? JSON.parse(a[3]) : {};
    App.change(function () {
      var card = { c: c, f: f };
      if (from) { var fr = rowById(from); if (fr && CR(fr)[+idx]) card = CW(fr).splice(+idx, 1)[0]; }
      if (to === "pool") return;
      var r = rowById(to), sig = JSON.stringify(card);
      if (!CR(r).some(function (x) { return JSON.stringify(x) === sig; })) CW(r).push(card);
    }, "sets");
    landed = c;
    U.toast(to === "pool" ? "'" + M.cardLabel(c) + "' 뺌" : rowById(to).nm + "에 '" + M.cardLabel(c) + "' 담음");
  }
  function wire() {
    U.$$("#spane [data-drag]").forEach(function (el) {
      el.draggable = true;
      el.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", el.dataset.drag); e.dataTransfer.effectAllowed = "copyMove"; setTimeout(function () { el.classList.add("dragging"); }, 0); });
      el.addEventListener("dragend", function () { el.classList.remove("dragging"); });
      el.addEventListener("click", function (e) {
        if (e.target.closest(".x")) return; var key = el.dataset.drag; if (picked && picked !== key) return; e.stopPropagation();
        if (el.dataset.edit && !picked) { var p = el.dataset.edit.split("|"); editor(p[0], +p[1]); return; }
        if (picked === key) { picked = null; el.classList.remove("picked"); return; }
        U.$$(".picked").forEach(function (p) { p.classList.remove("picked"); }); picked = key; el.classList.add("picked"); U.toast("담을 줄을 누르세요");
      });
    });
    U.$$("#spane [data-drop]").forEach(function (z) {
      z.classList.add("drop");
      z.addEventListener("dragover", function (e) { e.preventDefault(); e.stopPropagation(); U.$$(".over").forEach(function (o) { if (o !== z) o.classList.remove("over"); }); z.classList.add("over"); });
      z.addEventListener("dragleave", function (e) { if (!z.contains(e.relatedTarget)) z.classList.remove("over"); });
      z.addEventListener("drop", function (e) { e.preventDefault(); e.stopPropagation(); z.classList.remove("over"); var d = e.dataTransfer.getData("text/plain"); if (d) drop(d, z.dataset.drop); });
      z.addEventListener("click", function (e) { if (!picked || e.target.closest("button,input,select,[data-ren]")) return; e.stopPropagation(); var d = picked; picked = null; drop(d, z.dataset.drop); });
    });
    var cq = $("#cq"); if (cq) cq.oninput = function () { q = U.norm(cq.value); var pos = cq.selectionStart; renderPool(); wire(); var n = $("#cq"); n.focus(); n.setSelectionRange(pos, pos); };
    var ou = $("#onlyUn"); if (ou) ou.onchange = function () { onlyUn = ou.checked; render(); };
    var cs = $("#cSet"); if (cs) cs.onchange = function () { curId = cs.value; try { localStorage.setItem("hrs.cset", curId); } catch (e) { } render(); };
  }

  /* ── 카드 조건 · 쪼개기 ── */
  function editor(rowId, idx) {
    var r = rowById(rowId), card = CR(r)[idx], c = card.c, own = M.ctype(c);
    if (own === "per") { U.toast("사람 카드는 조건을 걸 수 없음"); return; }
    var base = persons().filter(function (p) { return M.cardOk(c, p); });
    var keys = ["job", "grd"].concat(M.S.cols.map(function (h) { return "col:" + h; })).filter(function (k) { return k !== own; });
    var sec = keys.map(function (k) {
      var m = {}; base.forEach(function (p) { var v = M.attr(p, k) || ""; m[v] = (m[v] || 0) + 1; });
      var vals = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; });
      if (vals.length < 2 && !(card.f || {})[k]) return "";
      return '<div class="fsec"><div class="fh"><b>' + esc(M.typeName(k)) + '</b><span class="fs">' + vals.length + '개 값</span><button class="btn sm" data-split="' + esc(k) + '">✂ ' + esc(M.typeName(k)) + "별로 쪼개기</button></div><div class=\"fvals\">" +
        vals.map(function (v) { var on = !(card.f || {})[k] || card.f[k].indexOf(v) >= 0; return '<label class="fv' + (on ? " on" : "") + '"><input type="checkbox" data-fk="' + esc(k) + '" value="' + esc(v) + '"' + (on ? " checked" : "") + ">" + esc(M.valLabel(k, v)) + '<span class="n">' + m[v] + "</span></label>"; }).join("") + "</div></div>";
    }).join("");
    U.modal("<h3>" + esc(M.cardLabel(c)) + " · 조건</h3><p>'" + esc(r.nm) + "' 줄에 담긴 이 카드 인원(" + base.length + "명) 중 체크한 값만 들어갑니다. 쪼개기를 누르면 값마다 카드가 따로 생깁니다.</p>" +
      (sec || '<p class="fs">이 카드 안에는 나눌 만한 값이 없습니다.</p>') + '<div class="fprev" id="fprev"></div>' +
      '<div class="foot"><button class="btn" id="fclr" style="margin-right:auto">조건 지우기</button><button class="btn" data-x>취소</button><button class="btn pri" id="ok">적용</button></div>',
      function (ov, close) {
        function read() { var f = {}; keys.forEach(function (k) { var all = U.$$('[data-fk="' + k + '"]', ov); if (!all.length) return; var on = all.filter(function (x) { return x.checked; }).map(function (x) { return x.value; }); if (on.length < all.length) f[k] = on; }); return f; }
        function upd() { var f = read(), n = base.filter(function (p) { return M.fltOk(f, p); }).length; ov.querySelector("#fprev").innerHTML = "→ 이 카드로 <b>" + n + "명</b> 들어감" + (n < base.length ? ' · <span class="bad">' + (base.length - n) + "명은 빠져서 누락으로 감</span>" : ""); U.$$(".fv", ov).forEach(function (l) { l.classList.toggle("on", l.querySelector("input").checked); }); }
        ov.addEventListener("change", upd); upd();
        ov.querySelector("#fclr").onclick = function () { U.$$("[data-fk]", ov).forEach(function (x) { x.checked = true; }); upd(); };
        ov.querySelector("#ok").onclick = function () { var f = read(); if (keys.some(function (k) { return f[k] && !f[k].length; })) { U.toast("값을 하나 이상 체크하세요"); return; } App.change(function () { card.f = f; }, "sets"); landed = c; close(); };
        U.$$("[data-split]", ov).forEach(function (b) {
          b.onclick = function () {
            var k = b.dataset.split, f = read(), vals = U.$$('[data-fk="' + k + '"]', ov).filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
            if (vals.length < 2) { U.toast("쪼갤 값이 2개 이상이어야 함"); return; }
            App.change(function () { var rc = CW(r); rc.splice.apply(rc, [idx, 1].concat(vals.map(function (v) { var nf = JSON.parse(JSON.stringify(f)); nf[k] = [v]; return { c: c, f: nf }; }))); }, "sets");
            close(); U.toast(M.cardLabel(c) + "을 " + M.typeName(k) + "별 " + vals.length + "개로 쪼갬 · 다른 줄로 끌어 옮기세요");
          };
        });
      });
  }

  /* ── 이벤트 ── */
  document.addEventListener("click", function (e) {
    if (App.view !== "setting" || !EL || !EL.contains(e.target) && !e.target.closest(".mpk")) return;
    var t, s = set();
    if (picked && !e.target.closest("[data-drag],[data-drop]")) { picked = null; U.$$(".picked").forEach(function (p) { p.classList.remove("picked"); }); }
    if ((t = e.target.closest("[data-tab]"))) { tab = t.dataset.tab; q = ""; render(); return; }
    if ((t = e.target.closest("[data-lv]"))) { olv = +t.dataset.lv; render(); return; }
    if ((t = e.target.closest("[data-plv]"))) { plv = +t.dataset.plv; render(); return; }
    if ((t = e.target.closest("[data-pv]"))) { verSel[s.id] = t.dataset.pv; render(); return; }
    if ((t = e.target.closest("[data-uv]"))) { unView = t.dataset.uv; render(); return; }
    if ((t = e.target.closest("[data-coldel]"))) { var h = t.dataset.coldel; App.change(function () { M.S.cols = M.S.cols.filter(function (x) { return x !== h; }); }, "sets"); tab = "org"; render(); return; }
    if ((t = e.target.closest("[data-rm]"))) { e.stopPropagation(); var a = t.dataset.rm.split("|"); App.change(function () { CW(rowById(a[0])).splice(+a[1], 1); }, "sets"); return; }
    if ((t = e.target.closest("[data-cu]"))) { App.change(function () { s.unit = t.dataset.cu; }, "sets"); return; }
    if ((t = e.target.closest("#cPer"))) { Board.pick(t, "range", { from: s.from, to: s.to }, function (f, to) { App.change(function () { s.from = f; s.to = to; }, "sets"); }); return; }
    var rows = s && s.rows;
    if ((t = e.target.closest("[data-sub]"))) { var i = +t.dataset.sub, j = i + 1; while (j < rows.length && rows[j].d > rows[i].d) j++; App.change(function () { rows.splice(j, 0, M.R("새 줄", rows[i].d + 1)); delete rows[i].pr; delete rows[i].rest; }, "sets"); return; }
    if ((t = e.target.closest("[data-del]"))) { var i2 = +t.dataset.del, e2 = i2 + 1; while (e2 < rows.length && rows[e2].d > rows[i2].d) e2++; var nm = rows[i2].nm; App.change(function () { rows.splice(i2, e2 - i2); }, "sets"); U.toast("'" + nm + "' 줄 삭제 (Ctrl+Z 로 되돌리기)"); return; }
    if ((t = e.target.closest("[data-pr]"))) { App.change(function () { var r = rows[+t.dataset.pr]; r.pr = r.pr ? 0 : 1; if (r.pr) r.rest = 0; }, "sets"); return; }
    if ((t = e.target.closest("[data-rest]"))) { App.change(function () { var r = rows[+t.dataset.rest]; r.rest = r.rest ? 0 : 1; if (r.rest) r.pr = 0; }, "sets"); return; }
    if ((t = e.target.closest("[data-up],[data-dn]"))) {
      var k = +(t.dataset.up || t.dataset.dn), up = !!t.dataset.up, d = rows[k].d, end = k + 1; while (end < rows.length && rows[end].d > d) end++;
      var blk = rows.slice(k, end);
      if (up) { var p = k - 1; while (p >= 0 && rows[p].d > d) p--; if (p < 0 || rows[p].d < d) { U.toast("더 위로 못 감"); return; } App.change(function () { rows.splice(k, blk.length); rows.splice.apply(rows, [p, 0].concat(blk)); }, "sets"); }
      else { if (end >= rows.length || rows[end].d < d) { U.toast("더 아래로 못 감"); return; } var ne = end + 1; while (ne < rows.length && rows[ne].d > d) ne++; App.change(function () { rows.splice(k, blk.length); rows.splice.apply(rows, [ne - blk.length, 0].concat(blk)); }, "sets"); }
      return;
    }
    if ((t = e.target.closest("[data-who]"))) { var rr = rowById(t.dataset.who); Board.people(RES.who[rr.id], rr.nm + " · " + U.fmtM(LASTM) + " 말 " + RES.who[rr.id].length + "명", "최신 직원명부 기준으로 이 줄에 들어간 사람"); return; }
    if ((t = e.target.closest("[data-ca]"))) {
      var act = t.dataset.ca;
      if (act === "preview") { Board.showSet(s.id); App.go("board"); }
      else if (act === "showUn") { unOpen = true; render(); $("#unp").scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (act === "unToggle") { unOpen = !unOpen; render(); }
      else if (act === "pvOn") U.confirmBox("기간별 바구니로 쓰기", "지금 담긴 카드를 <b>첫 기간(" + U.fmtM(M.MONTHS[0]) + " ~)</b> 바구니로 옮깁니다. 줄은 그대로이고, 이후 [＋ 새 기간]으로 조직개편 달부터 바구니를 나눠 담으면 됩니다.<br>카드 종류에 <b>명부 소속</b>(그달 명부에 적힌 소속 경로 그대로)이 생깁니다.", "기간별로 쓰기", false, function () {
          App.change(function () { var v = { id: M.nid("v"), from: M.MONTHS[0], cards: {} }; s.rows.forEach(function (r) { if (r.cards.length) v.cards[r.id] = r.cards; r.cards = []; }); s.pv = [v]; verSel[s.id] = v.id; }, "sets"); tab = "pth"; render(); });
      else if (act === "pvNew") Board.pick(t, "one", { asof: LASTM }, function (m) {
          if (s.pv.some(function (v) { return v.from === m; })) { U.toast(U.fmtM(m) + " 부터 시작하는 기간이 이미 있음"); return; }
          var src = M.verAt(s, m) || s.pv[0], id;
          App.change(function () { id = M.nid("v"); s.pv.push({ id: id, from: m, cards: JSON.parse(JSON.stringify(src.cards)) }); s.pv.sort(function (a, b) { return a.from < b.from ? -1 : 1; }); }, "sets");
          verSel[s.id] = id; render(); U.toast(U.fmtM(m) + " 부터 새 바구니 · " + U.fmtM(src.from) + " 바구니를 복사함 · 바뀐 카드만 옮기면 됨", false, 5000);
        });
      else if (act === "pvFrom") { var cv0 = V(s), ix = s.pv.indexOf(cv0); Board.pick(t, "one", { asof: cv0.from }, function (m) {
          if (m <= s.pv[ix - 1].from || (s.pv[ix + 1] && m >= s.pv[ix + 1].from)) { U.toast("앞뒤 기간 사이 달만 고를 수 있음"); return; }
          App.change(function () { cv0.from = m; }, "sets"); render(); }); }
      else if (act === "pvDel") { var dv = V(s), di = s.pv.indexOf(dv); U.confirmBox("이 기간 삭제", U.fmtM(dv.from) + " 부터의 바구니를 지웁니다. 그 달들은 " + (di > 0 ? "앞 기간" : "다음 기간") + " 바구니로 셈합니다. (Ctrl+Z 로 되돌릴 수 있음)", "삭제", true, function () {
          App.change(function () { if (di === 0) s.pv[1].from = dv.from; s.pv.splice(di, 1); }, "sets"); verSel[s.id] = s.pv[Math.max(0, di - 1)].id; render(); }); }
      else if (act === "addTop") App.change(function () { rows.push(M.R("새 줄", 1)); }, "sets");
      else if (act === "setNew") U.nameBox("새 분류 기준", "이름", "새 현황", function (v) { var id; App.change(function () { id = M.nid("s"); M.S.sets.push({ id: id, nm: v, from: M.MONTHS[Math.max(0, M.MONTHS.length - 12)] || "", to: M.MONTHS[M.MONTHS.length - 1] || "", unit: "m", rows: [M.R("전체", 0), M.R("새 줄", 1)] }); }, "sets"); curId = id; render(); });
      else if (act === "setCopy") U.nameBox("분류 기준 복사", "이름", s.nm + " (복사)", function (v) { var id; App.change(function () { var c = JSON.parse(JSON.stringify(s)); id = M.nid("s"); c.id = id; c.nm = v; var mp = {}; c.rows.forEach(function (r) { var n = M.nid("r"); mp[r.id] = n; r.id = n; }); (c.pv || []).forEach(function (v) { v.id = M.nid("v"); var nc = {}; Object.keys(v.cards).forEach(function (k) { if (mp[k]) nc[mp[k]] = v.cards[k]; }); v.cards = nc; }); M.S.sets.push(c); }, "sets"); curId = id; render(); });
      else if (act === "setRen") U.nameBox("분류 기준 이름 바꾸기", "이름", s.nm, function (v) { App.change(function () { s.nm = v; }, "sets"); });
      else if (act === "setDel") U.confirmBox("'" + s.nm + "' 삭제", "줄 " + s.rows.length + "개와 담은 카드가 지워집니다. (Ctrl+Z 로 되돌릴 수 있음)", "삭제", true, function () { App.change(function () { M.S.sets.splice(M.S.sets.indexOf(s), 1); }, "sets"); curId = null; render(); });
      else if (act === "colAdd") {
        var hs = M.HEADERS.filter(function (h) { return M.S.cols.indexOf(h) < 0 && !M.PRIVATE.test(h) && ["사번", "No.", "소속", "직급", "직무", "직급코드"].indexOf(h) < 0 && !/일$|일자|일\(/.test(h); });
        U.modal('<h3>카드 종류 추가</h3><p>직원명부 열을 고르면 그 열의 값이 카드가 됩니다. 담은 카드의 조건 · 쪼개기에도 쓰입니다. (개인정보 · 날짜 열은 뺐습니다)</p><div class="collist">' +
          hs.map(function (h) { var v = colVals(h); return '<button class="colpick" data-colpick="' + esc(h) + '"><b>' + esc(h) + "</b><span>" + v.length + "개 값 · " + esc(v.slice(0, 4).join(", ")) + (v.length > 4 ? " …" : "") + "</span></button>"; }).join("") +
          '</div><div class="foot"><button class="btn" data-x>닫기</button></div>', function (ov, close) {
            U.$$("[data-colpick]", ov).forEach(function (b) { b.onclick = function () { var h = b.dataset.colpick; App.change(function () { M.S.cols.push(h); }, "sets"); tab = "col:" + h; close(); render(); }; });
          });
      }
    }
  });
  document.addEventListener("dblclick", function (e) {
    if (App.view !== "setting" || !EL) return;
    var t = e.target.closest("[data-ren]"); if (!t || !EL.contains(t)) return;
    var r = rowById(t.dataset.ren); t.contentEditable = true; t.focus(); document.getSelection().selectAllChildren(t);
    t.onblur = function () { var v = U.norm(t.textContent); if (v && v !== r.nm) App.change(function () { r.nm = v; }, "sets"); else render(); };
    t.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); t.blur(); } if (ev.key === "Escape") { t.textContent = r.nm; t.blur(); } };
  });
  return { render: render, current: function () { return set(); } };
})();
