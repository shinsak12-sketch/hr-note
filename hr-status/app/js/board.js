/* 인력현황: 분류 기준을 엑셀형 표로 출력 (시트 · 정렬 · 필터 · 선택 · 복사 · 메모) */
var Board = (function () {
  var $ = U.$, esc = U.esc;
  var GC = ["#3B6FD8", "#1E8C7E", "#C9862B", "#8A3FA8", "#C2410C"];
  var SHEETS = [], cv = null, OPT = { avg: true, heat: false }, SEL = { anchor: null, cells: [] }, VIS = [], Q = "", drag = false, fp = null, mpk = null, cm = null, mp = null, qi = -1;

  function LAST() { var m = M.MONTHS; return m[m.length - 1] || ""; }
  function setOf(id) { return M.S.sets.filter(function (s) { return s.id === id; })[0]; }
  function S() { var s = setOf(cv.set); if (!s && M.S.sets.length) { s = M.S.sets[0]; cv.set = s.id; } return s; }
  function newSheet(base) { var s = base ? JSON.parse(JSON.stringify(base)) : { set: M.S.sets[0] ? M.S.sets[0].id : "", asof: LAST(), from: null, to: null, unit: null, lvl: 9, cmp: { mom: true, yoy: false, per: true }, closed: {}, rh: {}, vf: {}, hc: {}, sort: null }; s.id = "v" + Date.now() + Math.floor(Math.random() * 99); s.name = ""; return s; }
  function persistUI() { try { localStorage.setItem("hrs.board", JSON.stringify({ sheets: SHEETS, cur: cv && cv.id, opt: OPT })); } catch (e) { } }
  function loadUI() {
    try { var j = JSON.parse(localStorage.getItem("hrs.board") || "null"); if (j && j.sheets && j.sheets.length) { SHEETS = j.sheets; OPT = j.opt || OPT; cv = SHEETS.filter(function (s) { return s.id === j.cur; })[0] || SHEETS[0]; } } catch (e) { }
    if (!SHEETS.length) { SHEETS = [newSheet()]; cv = SHEETS[0]; }
  }
  function per() { var s = S(), L = LAST(), f = cv.from || (s && s.from) || M.MONTHS[0] || "", t = cv.to || (s && s.to) || L; if (t > L) t = L; if (f > t) f = t; return { from: f, to: t, unit: cv.unit || (s && s.unit) || "m" }; }
  function allCols() { var p = per(); return M.MONTHS.filter(function (m) { if (m < p.from || m > p.to) return false; var mm = +m.slice(5); return p.unit === "m" || (p.unit === "q" && mm % 3 === 0) || (p.unit === "y" && mm === 12) || m === p.to; }); }
  function cols() { return allCols().filter(function (m) { return !(cv.hc || {})[m]; }); }
  function A(m) { return M.assign(S(), m); }
  function has(m) { return M.MONTHS.indexOf(m) >= 0; }
  function cmpList() { var c = [], cs = cols(); if (cv.cmp.mom && has(U.ym(cv.asof, -1))) c.push(["전월比", U.ym(cv.asof, -1)]); if (cv.cmp.yoy && has(U.ym(cv.asof, -12))) c.push(["전년 동월比", U.ym(cv.asof, -12)]); if (cv.cmp.per && cs[0]) c.push(["기간 처음比", cs[0]]); return c; }
  function mkey(ri, m) { return cv.set + "|" + S().rows[ri].id + "|" + m; }

  function condDesc(i) {
    var rows = M.rowsAt(S(), cv.asof), parts = [];
    M.ancIdx(rows, i).forEach(function (a) { if (rows[a].cards.length) parts.push("<b>" + esc(rows[a].nm) + "</b> 조건"); });
    var g = {}; rows[i].cards.forEach(function (c) { var k = M.ctype(c.c); (g[k] = g[k] || []).push(M.cardLabel(c.c) + (Object.keys(c.f || {}).length ? "(" + M.fltLabel(c.f) + ")" : "")); });
    for (var k in g) parts.push(M.typeName(k) + " " + esc(g[k].join(" 또는 ")));
    if (!parts.length) return M.isPar(rows, i) ? "아래 줄 합계" : rows[i].rest ? "↺ 나머지" : "담긴 카드 없음";
    return parts.join(' <span class="and">그리고</span> ') + (M.isPar(rows, i) ? " · 아래 줄 합계" : "") + (rows[i].pr ? " · ⚡우선" : "");
  }

  /* ── 그리기 ── */
  function render(anim) {
    if (!cv) loadUI();
    if (!S()) { $("#tcard").innerHTML = '<div class="emptyset"><h2>분류 기준이 없습니다</h2><p>설정에서 <b>⚙ 기본 세팅</b>을 하면 조직별 · 직급별 · 직무별 분류 기준이 생깁니다.</p><button class="btn pri big" data-go2="setting">설정으로</button></div>'; $("#sets").innerHTML = ""; renderSheets(); return; }
    if (!has(cv.asof)) cv.asof = LAST();
    renderTools(); renderSets(); renderTable(anim); renderSheets();
  }
  function renderTools() {
    var p = per();
    $("#asofBtn").innerHTML = U.fmtM(cv.asof) + ' <span class="cal">▦</span>';
    $("#perBtn").innerHTML = U.fmtM(p.from) + " ~ " + U.fmtM(p.to) + ' <span class="cal">▦</span>';
    U.$$("#unit button").forEach(function (b) { b.classList.toggle("on", b.dataset.u === p.unit); });
    U.$$("#lvl button").forEach(function (b) { b.classList.toggle("on", +b.dataset.lv === cv.lvl); });
    U.$$("[data-cmp]").forEach(function (c) { c.checked = !!cv.cmp[c.dataset.cmp]; c.parentNode.classList.toggle("on", c.checked); });
    U.$$("[data-opt]").forEach(function (c) { c.checked = !!OPT[c.dataset.opt]; c.parentNode.classList.toggle("on", c.checked); });
    $("#app").classList.toggle("heat", !!OPT.heat);
  }
  function fActive() { return !!(cv.sort || Object.keys(cv.rh || {}).length || Object.keys(cv.vf || {}).length || Object.keys(cv.hc || {}).length); }
  function renderSets() {
    $("#sets").innerHTML = M.S.sets.map(function (s) { var r = M.assign(s, cv.asof); return '<button class="setc' + (s.id === cv.set ? " on" : "") + '" data-set="' + s.id + '">' + esc(s.nm) + '<span class="n">' + (r.row[s.rows[0] && s.rows[0].id] || r.total - r.un.length) + "</span>" + (r.un.length ? '<span class="w" title="누락 ' + r.un.length + '명">!</span>' : "") + "</button>"; }).join("");
    var u = A(cv.asof).un.length;
    $("#fchip").innerHTML = fActive() ? '<button class="fchip" data-act="fclear" title="정렬 · 줄 필터 · 값 조건 · 숨긴 열 모두 해제">⏷ 정렬 · 필터 적용 중 ✕</button>' : "";
    $("#unc").innerHTML = u ? '<button class="unchip" data-act="un">⚠ 확인 필요 · 누락 ' + u + "명</button>" : '<span class="okchip">✓ 누락 없음</span>';
  }
  function val(i, key) {
    var set = S(), r = set.rows[i]; if (key === "k") return r.nm; var a = key.slice(2), p = per();
    if (key[0] === "m") return A(a).row[r.id];
    if (key[0] === "a") { var ms = M.MONTHS.filter(function (m) { return m.slice(0, 4) === a && m >= p.from && m <= p.to; }), s = 0; ms.forEach(function (m) { s += A(m).row[r.id]; }); return ms.length ? s / ms.length : 0; }
    var c = cmpList()[+a]; return c ? A(cv.asof).row[r.id] - A(c[1]).row[r.id] : 0;
  }
  function okv(v, f) { var n = +f.v; return f.op === "ge" ? v >= n : f.op === "le" ? v <= n : f.op === "eq" ? v === n : f.op === "gt" ? v > n : f.op === "lt" ? v < n : f.op === "nz" ? v !== 0 : true; }
  function viewOrder() {
    var set = S(), rows = set.rows, rh = cv.rh || {}, vf = cv.vf || {}, filt = Object.keys(rh).length || Object.keys(vf).length, out = [], memo = {};
    function kids(i) {
      var k = i < 0 ? rows.map(function (_, j) { return j; }).filter(function (j) { return !M.ancIdx(rows, j).length; }) : M.kidsIdx(rows, i);
      if (cv.sort) { var key = cv.sort.key, dir = cv.sort.dir; k = k.slice().sort(function (a, b) { var x = val(a, key), y = val(b, key); return (typeof x === "string" ? x.localeCompare(y, "ko") : x - y) * dir; }); }
      return k;
    }
    function vis(i) { if (memo[i] !== undefined) return memo[i]; var r = rows[i], v;
      if (rh[r.id]) v = false; else if (!M.isPar(rows, i)) v = Object.keys(vf).every(function (k) { return okv(val(i, k), vf[k]); }); else v = !filt || M.kidsIdx(rows, i).some(vis);
      return (memo[i] = v); }
    function walk(i) { kids(i).forEach(function (j) { if (!vis(j)) return; if (rows[j].d < cv.lvl) out.push(j); if (!cv.closed[rows[j].id]) walk(j); }); }
    walk(-1); return out;
  }
  function fbtn(key) {
    var on = (cv.sort && cv.sort.key === key) || (key === "k" && Object.keys(cv.rh || {}).length) || (cv.vf && cv.vf[key]) || (key.slice(0, 2) === "m:" && Object.keys(cv.hc || {}).length);
    var ic = cv.sort && cv.sort.key === key ? (cv.sort.dir > 0 ? "↑" : "↓") : on ? "⏷" : "▾";
    return '<button class="fb' + (on ? " on" : "") + '" data-fcol="' + key + '" title="정렬 · 필터">' + ic + "</button>";
  }
  function renderTable(anim) {
    var set = S(), rows = set.rows, cs = cols(), R = {}, ra = A(cv.asof), p = per();
    cs.forEach(function (m) { R[m] = A(m); });
    var cmpC = cmpList().map(function (c) { return [c[0], A(c[1])]; });
    var years = []; cs.forEach(function (m, ci) { var y = m.slice(0, 4), l = years[years.length - 1]; if (l && l.y === y) l.cols.push(ci); else years.push({ y: y, cols: [ci] }); });
    var C = []; years.forEach(function (y, yi) { y.cols.forEach(function (ci, k) { C.push({ t: "m", m: cs[ci], ci: ci, ys: yi && !k }); });
      if (OPT.avg) C.push({ t: "a", y: y.y, ms: M.MONTHS.filter(function (m) { return m.slice(0, 4) === y.y && m >= p.from && m <= p.to; }) }); });
    var nAll = 1 + C.length + cmpC.length, rn = 0;
    function RN(ri) { ++rn; return '<th class="rn" data-rn="' + rn + '"' + (ri !== undefined ? ' data-selrow="' + ri + '"' : "") + ">" + rn + "</th>"; }
    var head = '<tr class="colhdr"><th class="rn" data-selall="1" title="전체 선택"></th>' + Array.apply(null, { length: nAll }).map(function (_, i) { var c = C[i - 1]; return '<th data-cl="' + i + '"' + (c && c.t === "m" ? ' data-selcol="' + c.m + '"' : "") + ">" + U.colL(i) + "</th>"; }).join("") + "</tr>" +
      '<tr class="yr">' + RN() + '<th class="k"></th>' + years.map(function (y, i) { return '<th class="' + (i ? "ys" : "") + '" colspan="' + (y.cols.length + (OPT.avg ? 1 : 0)) + '">' + y.y + "년</th>"; }).join("") + (cmpC.length ? '<th class="cs" colspan="' + cmpC.length + '">증감 · ' + U.fmtM(cv.asof) + " 기준</th>" : "") + "</tr>" +
      '<tr class="mo">' + RN() + '<th class="k">구분' + fbtn("k") + "</th>" + C.map(function (c) { return c.t === "m" ? '<th class="' + (c.m === cv.asof ? "cur " : "") + (c.ys ? "ys" : "") + '">' + (+c.m.slice(5)) + "월" + fbtn("m:" + c.m) + "</th>" : '<th class="av" title="' + c.y + "년 " + c.ms.length + '개월 평균 (월말 인원)">평균' + fbtn("a:" + c.y) + "</th>"; }).join("") +
      cmpC.map(function (c, i) { return '<th class="cmp' + (i ? "" : " cs") + '">' + c[0] + fbtn("c:" + i) + "</th>"; }).join("") + "</tr>";
    var body = ""; VIS = [];
    viewOrder().forEach(function (i) {
      var r = rows[i]; VIS.push(i);
      var par = M.isPar(rows, i), anc = M.ancIdx(rows, i), gi = r.d === 0 ? -1 : r.d === 1 ? i : anc[1], grp = gi >= 0 ? rows.filter(function (x, j) { return x.d === 1 && j <= gi; }).length - 1 : -1;
      var hit = Q && r.nm.indexOf(Q) >= 0;
      body += '<tr data-ri="' + i + '" style="--d:' + r.d + (grp >= 0 ? ";--gc:" + GC[grp % GC.length] : "") + '" class="lv' + Math.min(r.d, 3) + (par ? " par" : "") + (cv.closed[r.id] ? " closed" : "") + (hit ? " hit" : "") + (anim ? " in" : "") + '">' + RN(i) +
        '<td class="k" data-row="' + i + '" title="' + esc(condDesc(i).replace(/<[^>]+>/g, "")) + '"><span class="nm">' + (par ? '<span class="tw" data-fold="' + r.id + '">▼</span>' : '<span class="dt"></span>') + esc(r.nm) + "</span></td>" +
        C.map(function (c, x) {
          if (c.t === "a") { var s = 0; c.ms.forEach(function (m) { s += A(m).row[r.id]; }); var v = c.ms.length ? s / c.ms.length : 0; return '<td class="av" data-x="' + (x + 1) + '">' + (v ? v.toFixed(1) : "–") + "</td>"; }
          var n = R[c.m].row[r.id], h = "";
          if (c.ci) { var pv = R[cs[c.ci - 1]].row[r.id], d = n - pv, pc = pv ? Math.abs(d) / pv : d ? 1 : 0; if (d) h = (d > 0 ? "u" : "d") + (pc >= 0.06 ? 3 : pc >= 0.025 ? 2 : 1); }
          var mk = M.S.memo[cv.set + "|" + r.id + "|" + c.m];
          return '<td class="num' + (c.m === cv.asof ? " cur" : "") + (c.ys ? " ys" : "") + (n ? "" : " z") + (mk ? " memo" : "") + '"' + (h ? ' data-h="' + h + '"' : "") + ' data-x="' + (x + 1) + '" data-cell="' + i + "|" + c.m + '">' + (n || "–") + "</td>";
        }).join("") +
        cmpC.map(function (c, ci) { var d = ra.row[r.id] - c[1].row[r.id]; return '<td class="cmp' + (ci ? "" : " cs") + '"><span class="dl ' + (d > 0 ? "up" : d < 0 ? "dn" : "z") + '">' + (d > 0 ? "▲ " + d : d < 0 ? "▼ " + -d : "–") + "</span></td>"; }).join("") + "</tr>";
    });
    if (cs.some(function (m) { return R[m].un.length; })) body += '<tr class="unrow">' + RN() + '<td class="k" data-act="un">⚠ 누락 인력 · 분류 기준 밖</td>' + C.map(function (c) { return c.t === "a" ? '<td class="av"></td>' : '<td class="' + (c.m === cv.asof ? "cur" : "") + '">' + R[c.m].un.length + "</td>"; }).join("") + cmpC.map(function () { return "<td></td>"; }).join("") + "</tr>";
    $("#tcard").innerHTML = '<div class="tblw" id="tblw"><table class="rt"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" +
      '<div class="tfoot"><span><span class="sw"></span>기준월</span><span class="up">▲ 증가</span><span class="dn">▼ 감소</span>' + (OPT.avg ? "<span><i>평균</i> = 그해 출력 기간 안 달들의 월말 인원 평균</span>" : "") +
      '<span class="heatlg">변화 색칠 <i class="h d3"></i><i class="h d1"></i><i class="h z"></i><i class="h u1"></i><i class="h u3"></i> 전월 대비 감소 ← → 증가</span>' +
      '<span style="margin-left:auto">끌기 = 여러 칸 선택 · Ctrl+C = 복사 · 머리 ▾ = 정렬 · 필터 · 우클릭 = 메뉴 · ※ 말일자(그달 마지막 직원명부) 인원</span></div>';
    var w = $("#tblw"); w.addEventListener("scroll", function () { w.querySelector("table").classList.toggle("shadowed", w.scrollLeft > 2); $("#mtip").style.opacity = 0; });
    var cur = w.querySelector("th.cur"); if (cur && anim) w.scrollLeft = Math.max(0, cur.offsetLeft - w.clientWidth + 260);
    paintSel();
  }
  function renderSheets() {
    $("#sheets").innerHTML = SHEETS.map(function (s, i) { var st = setOf(s.set); return '<div class="st' + (s === cv ? " on" : "") + '" data-sheet="' + s.id + '" title="더블클릭 = 이름 바꾸기 · Ctrl+PageUp/Down = 넘기기"><span class="sn">' + esc(s.name || "화면 " + (i + 1)) + "</span><small>" + esc(st ? st.nm : "-") + " · " + U.fmtM(s.asof) + "</small>" + (SHEETS.length > 1 ? '<button class="x" data-close="' + s.id + '" title="시트 닫기">✕</button>' : "") + "</div>"; }).join("") +
      '<button class="add" data-act="newSheet" title="지금 화면을 복사해 새 시트로">＋ 시트</button>';
    var p = per(); $("#stL").textContent = U.fmtM(p.from) + " ~ " + U.fmtM(p.to) + " · " + { m: "월별", q: "분기말", y: "연말" }[p.unit];
    var f = M.fileOfMonth(cv.asof); $("#stR").textContent = f ? "기준월 파일 " + f.name : "";
  }
  function upd(fn, anim) { fn(); SEL = { anchor: null, cells: [] }; render(anim); persistUI(); }

  /* ── 선택 ── */
  function cellEl(ri, m) { return document.querySelector('[data-cell="' + ri + "|" + m + '"]'); }
  function setSel(ri, m, extend) {
    var cs = cols();
    if (extend && SEL.anchor) { var a = SEL.anchor, r1 = VIS.indexOf(a.ri), r2 = VIS.indexOf(ri), c1 = cs.indexOf(a.m), c2 = cs.indexOf(m); SEL.cells = [];
      for (var r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (var c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) SEL.cells.push({ ri: VIS[r], m: cs[c] }); SEL.end = { ri: ri, m: m }; }
    else { SEL.anchor = { ri: ri, m: m }; SEL.cells = [{ ri: ri, m: m }]; SEL.end = null; }
    paintSel();
  }
  function paintSel() {
    U.$$("td.num.sel,td.num.anchor,th.hl,td.copied").forEach(function (t) { t.classList.remove("sel", "anchor", "hl", "copied"); });
    var set = S(), sum = 0, n = 0;
    SEL.cells = SEL.cells.filter(function (c) { return cellEl(c.ri, c.m); });
    SEL.cells.forEach(function (c) { var el = cellEl(c.ri, c.m); el.classList.add("sel"); sum += A(c.m).row[set.rows[c.ri].id]; n++;
      var ch = document.querySelector('[data-cl="' + el.dataset.x + '"]'), rh = el.parentNode.querySelector("th.rn"); if (ch) ch.classList.add("hl"); if (rh) rh.classList.add("hl"); });
    var ae = SEL.anchor && cellEl(SEL.anchor.ri, SEL.anchor.m); if (ae) ae.classList.add("anchor");
    $("#stSel").textContent = n > 1 ? "선택 " + n + "칸 · 합계 " + sum.toLocaleString() + " · 평균 " + (sum / n).toFixed(1) : n ? "선택 1칸 · " + sum + "명" : "";
    var ri = SEL.anchor ? SEL.anchor.ri : null;
    $("#stCond").innerHTML = ae ? U.colL(+ae.dataset.x) + ae.parentNode.querySelector("th.rn").dataset.rn + " · " + esc(set.rows[ri].nm) + " · " + U.fmtM(SEL.anchor.m) + " · " + condDesc(ri) : "";
  }
  function selRect() { if (!SEL.cells.length) return null; var cs = cols(), rs = {}, ms = {}; SEL.cells.forEach(function (c) { rs[c.ri] = 1; ms[c.m] = 1; }); return { rows: VIS.filter(function (i) { return rs[i]; }), ms: cs.filter(function (m) { return ms[m]; }) }; }
  function copySel(withHead) {
    var r = selRect(); if (!r) { U.toast("복사할 칸을 먼저 고르세요"); return; } var set = S(), lines = [];
    if (withHead) lines.push(["구분"].concat(r.ms.map(U.fmtM)).join("\t"));
    r.rows.forEach(function (i) { var row = r.ms.map(function (m) { return A(m).row[set.rows[i].id]; }); lines.push((withHead ? [set.rows[i].nm] : []).concat(row).join("\t")); });
    U.copyText(lines.join("\n"), function () { U.toast(r.rows.length * r.ms.length + "칸 복사함" + (withHead ? " (머리글 포함)" : "") + " · 엑셀에 붙여넣기 하세요"); U.$$("td.num.sel").forEach(function (td) { td.classList.add("copied"); }); });
  }

  /* ── 명단 · 메모 ── */
  function people(list, title, sub) {
    var ov = U.modal("<h3>" + esc(title) + "</h3><p>" + sub + '</p><div class="list"><table class="tbl"><thead><tr><th>사번</th><th>성명</th><th>소속</th><th>직급</th><th>직무</th><th>직책</th>' + (list.some(function (p) { return p._why; }) ? "<th>빠진 이유</th>" : "") + "</tr></thead><tbody>" +
      list.slice(0, 2000).map(function (p) { return '<tr><td class="mono">' + esc(p.sb) + "</td><td>" + esc(p.nm) + "</td><td>" + esc(p.org) + "</td><td>" + esc(p.gnm) + "</td><td>" + esc(p.job) + "</td><td>" + esc(p.pos || "-") + "</td>" + (p._why ? '<td class="why">' + esc(p._why) + "</td>" : "") + "</tr>"; }).join("") +
      '</tbody></table></div><div class="foot"><button class="btn" id="pxl">⇩ 엑셀</button><button class="btn" data-x>닫기</button></div>', null, "wide");
    ov.querySelector("#pxl").onclick = function () { xlsx([["사번", "성명", "소속", "직급", "직무", "직책"]].concat(list.map(function (p) { return [p.sb, p.nm, p.org, p.gnm, p.job, p.pos]; })), title.replace(/[\\/:*?"<>|·]/g, " ").trim()); };
  }
  function openCell(ri, m) { var r = S().rows[ri], res = A(m); people(res.who[r.id], r.nm + " · " + U.fmtM(m) + " 말 " + res.who[r.id].length + "명", "분류 기준 '" + esc(S().nm) + "'으로 이 줄에 들어간 사람"); }
  function showUn() { var r = A(cv.asof); r.un.forEach(function (p) { p._why = r.why[p.sb]; }); people(r.un, "누락 인력 · " + U.fmtM(cv.asof) + " 말 " + r.un.length + "명", "분류 기준 어느 줄에도 안 들어간 사람 · 설정 › 분류 기준에서 담거나, 조직 미매칭이면 설정 › 미매칭에서 처리"); r.un.forEach(function (p) { delete p._why; }); }
  function memoPop(ri, m, x, y) {
    closeAll(); var k = mkey(ri, m), r = S().rows[ri];
    mp = document.createElement("div"); mp.className = "mpop"; mp.style.left = Math.min(x, innerWidth - 276) + "px"; mp.style.top = Math.min(y, innerHeight - 200) + "px";
    mp.innerHTML = "<b>메모 · " + esc(r.nm) + " · " + U.fmtM(m) + '</b><textarea id="mtx" placeholder="예: 9/4 조직개편으로 2명 이동">' + esc(M.S.memo[k] || "") + '</textarea><div class="r">' + (M.S.memo[k] ? '<button class="btn sm" id="mdel">삭제</button>' : "") + '<button class="btn sm" id="mno">취소</button><button class="btn sm pri" id="mok">저장</button></div>';
    document.body.appendChild(mp); var tx = mp.querySelector("#mtx"); tx.focus();
    function save(v) { var keep = SEL; App.change(function () { if (v) M.S.memo[k] = v; else delete M.S.memo[k]; }, "sets"); SEL = keep; paintSel(); closeAll(); U.toast(v ? "메모 저장" : "메모 지움"); }
    mp.querySelector("#mok").onclick = function () { save(U.norm(tx.value)); };
    mp.querySelector("#mno").onclick = closeAll; if (mp.querySelector("#mdel")) mp.querySelector("#mdel").onclick = function () { save(""); };
    tx.onkeydown = function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) mp.querySelector("#mok").click(); if (e.key === "Escape") closeAll(); };
  }
  function memos() {
    var ks = Object.keys(M.S.memo);
    var ov = U.modal("<h3>메모 모아보기 · " + ks.length + "개</h3>" + (ks.length ? '<div class="list"><table class="tbl"><thead><tr><th>분류 기준</th><th>줄</th><th>월</th><th>메모</th></tr></thead><tbody>' +
      ks.map(function (k) { var a = k.split("|"), st = setOf(a[0]), r = st && st.rows.filter(function (x) { return x.id === a[1]; })[0]; return r ? '<tr data-jump="' + esc(k) + '" class="link"><td>' + esc(st.nm) + "</td><td>" + esc(r.nm) + '</td><td class="mono">' + U.fmtM(a[2]) + '</td><td style="white-space:normal">' + esc(M.S.memo[k]) + "</td></tr>" : ""; }).join("") +
      '</tbody></table></div><p class="fs">줄을 누르면 그 칸으로 이동</p>' : "<p>아직 메모가 없습니다. 표의 칸을 우클릭해서 쓰세요.</p>") + '<div class="foot"><button class="btn" data-x>닫기</button></div>');
    U.$$("[data-jump]", ov).forEach(function (tr) { tr.onclick = function () {
      var a = tr.dataset.jump.split("|"), st = setOf(a[0]), ri = st.rows.findIndex(function (x) { return x.id === a[1]; }); ov.remove();
      upd(function () { cv.set = a[0]; cv.from = cv.to = cv.unit = null; if (a[2] < per().from) cv.from = a[2]; cv.closed = {}; cv.lvl = 9; cv.rh = {}; cv.vf = {}; cv.hc = {}; }, true);
      setSel(ri, a[2]); var el = cellEl(ri, a[2]); if (el) el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); }; });
  }

  /* ── 정렬 · 필터 팝업 ── */
  function filterPop(key, btn) {
    closeAll(); var set = S(), rows = set.rows, isK = key === "k", isM = key[0] === "m";
    var title = isK ? "구분" : key[0] === "m" ? U.fmtM(key.slice(2)) + "월 열" : key[0] === "a" ? key.slice(2) + "년 평균 열" : (cmpList()[+key.slice(2)] || ["증감"])[0] + " 열";
    var vf = (cv.vf || {})[key] || { op: "", v: "" };
    fp = document.createElement("div"); fp.className = "fpop"; fp.dataset.k = key;
    fp.innerHTML = '<div class="fh">' + esc(title) + '</div><button class="fi" data-s="1">↑ ' + (isK ? "가나다순" : "작은 값부터") + ' 정렬</button><button class="fi" data-s="-1">↓ ' + (isK ? "가나다 역순" : "큰 값부터") + " 정렬</button>" +
      (cv.sort ? '<button class="fi" data-s="0">↺ 정렬 해제 (처음 순서)</button>' : "") + '<p class="fnote">정렬은 같은 위 줄 안에서만 순서가 바뀜 (계층 유지)</p><hr>' +
      (isK ? '<div class="fsub">줄 고르기</div><input class="fsrch" placeholder="줄 이름 찾기"><label class="fc all"><input type="checkbox" data-all>(모두 선택)</label><div class="flist">' +
        rows.map(function (r) { return '<label class="fc" style="padding-left:' + (6 + r.d * 12) + 'px" data-nm="' + esc(r.nm) + '"><input type="checkbox" data-rid="' + r.id + '"' + ((cv.rh || {})[r.id] ? "" : " checked") + ">" + esc(r.nm) + "</label>"; }).join("") + "</div>" :
        '<div class="fsub">값 조건 <span class="fnote">(맨 아래 줄 기준)</span></div><div class="frow"><select class="fop"><option value="">조건 없음</option>' +
        [["nz", "0 아닌 것만"], ["ge", "이상 ≥"], ["le", "이하 ≤"], ["gt", "초과 >"], ["lt", "미만 <"], ["eq", "같음 ="]].map(function (o) { return '<option value="' + o[0] + '"' + (vf.op === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + '</select><input class="fv" type="number" value="' + esc(vf.v) + '" placeholder="숫자"></div>' +
        (isM ? '<hr><div class="fsub">열 보이기</div><div class="flist mcols">' + allCols().map(function (m) { return '<label class="fc"><input type="checkbox" data-mc="' + m + '"' + ((cv.hc || {})[m] ? "" : " checked") + ">" + U.fmtM(m) + "</label>"; }).join("") + "</div>" : "")) +
      '<div class="fft"><button class="btn sm" data-fclr>이 열 필터 지우기</button><span style="flex:1"></span><button class="btn sm" data-fno>취소</button><button class="btn sm pri" data-fok>확인</button></div>';
    document.body.appendChild(fp);
    var b = btn.getBoundingClientRect(); fp.style.left = Math.max(8, Math.min(b.left - 10, innerWidth - fp.offsetWidth - 8)) + "px"; fp.style.top = Math.max(8, Math.min(b.bottom + 4, innerHeight - fp.offsetHeight - 8)) + "px";
    U.$$("[data-s]", fp).forEach(function (x) { x.onclick = function () { var d = +x.dataset.s; upd(function () { cv.sort = d ? { key: key, dir: d } : null; }); closeAll(); U.toast(d ? title + " 기준 " + (d > 0 ? "오름차순" : "내림차순") + " 정렬" : "정렬 해제"); }; });
    var all = fp.querySelector("[data-all]");
    if (all) { var boxes = U.$$("[data-rid]", fp); all.checked = boxes.every(function (x) { return x.checked; });
      all.onchange = function () { boxes.forEach(function (x) { if (x.closest(".fc").style.display !== "none") x.checked = all.checked; }); };
      fp.querySelector(".fsrch").oninput = function () { var qq = U.norm(this.value); U.$$(".flist .fc", fp).forEach(function (l) { l.style.display = !qq || l.dataset.nm.indexOf(qq) >= 0 ? "" : "none"; }); }; }
    fp.querySelector("[data-fno]").onclick = closeAll;
    fp.querySelector("[data-fclr]").onclick = function () { upd(function () { if (isK) cv.rh = {}; else { cv.vf = cv.vf || {}; delete cv.vf[key]; } if (isM) cv.hc = {}; if (cv.sort && cv.sort.key === key) cv.sort = null; }); closeAll(); U.toast("이 열 필터를 지웠습니다"); };
    fp.querySelector("[data-fok]").onclick = function () {
      if (isM) { var hc0 = {}; U.$$("[data-mc]", fp).forEach(function (x) { if (!x.checked) hc0[x.dataset.mc] = 1; }); if (Object.keys(hc0).length >= allCols().length) { U.toast("열을 하나 이상 남겨야 함"); return; } }
      upd(function () {
        if (isK) { var rh = {}; U.$$("[data-rid]", fp).forEach(function (x) { if (!x.checked) rh[x.dataset.rid] = 1; }); cv.rh = rh; }
        else { cv.vf = cv.vf || {}; var op = fp.querySelector(".fop").value, v = fp.querySelector(".fv").value; if (op && (op === "nz" || v !== "")) cv.vf[key] = { op: op, v: v }; else delete cv.vf[key]; }
        if (isM) cv.hc = hc0;
      }); closeAll(); U.toast("필터 적용");
    };
  }

  /* ── 달력형 월 고르기 (분류 기준 화면도 씀) ── */
  function pick(btn, mode, curv, cb) {
    closeAll(); var MS = M.MONTHS; if (!MS.length) { U.toast("직원명부가 없습니다"); return; }
    var L = MS[MS.length - 1], Y0 = +MS[0].slice(0, 4), Y1 = +L.slice(0, 4), yr = +((mode === "one" ? curv.asof : curv.to) || L).slice(0, 4), a = null;
    mpk = document.createElement("div"); mpk.className = "mpk"; document.body.appendChild(mpk);
    function draw() {
      var h = '<div class="mh"><button data-y="-1"' + (yr <= Y0 ? " disabled" : "") + "><</button><b>" + yr + '년</b><button data-y="1"' + (yr >= Y1 ? " disabled" : "") + ">></button></div>" +
        '<div class="ylist">' + Array.apply(null, { length: Math.min(12, Y1 - Y0 + 1) }).map(function (_, i) { var y = Math.max(Y0, Y1 - 11) + i; return '<button data-yy="' + y + '" class="' + (y === yr ? "on" : "") + '">' + y + "</button>"; }).join("") + '</div><div class="mg">';
      for (var m = 1; m <= 12; m++) {
        var k = yr + "-" + (m < 10 ? "0" : "") + m, ok = MS.indexOf(k) >= 0, cls = "";
        if (mode === "one") { if (k === curv.asof) cls = "sel"; } else { var f = a || curv.from, t = a || curv.to, lo = f < t ? f : t, hi = f < t ? t : f; if (k === lo || k === hi) cls = "sel"; else if (k > lo && k < hi) cls = "in"; }
        if (k === L) cls += " last";
        h += '<button data-m="' + k + '" class="' + cls + '"' + (ok ? "" : " disabled") + ">" + m + "월</button>";
      }
      h += '</div><div class="mft">' + (mode === "one" ? '<span class="mhint">고르면 바로 적용 · 흐린 달 = 직원명부 없음</span><button data-last>가장 최근 (' + U.fmtM(L) + ")</button>" :
        '<span class="mhint">' + (a ? "끝 달을 고르세요" : "시작 달 → 끝 달 순서로 누르기") + '</span><button data-pre="fy">이번 FY(7월~)</button><button data-pre="12">최근 12개월</button><button data-pre="ytd">올해</button><button data-pre="ly">작년</button><button data-pre="all">전체</button>') + "</div>";
      mpk.innerHTML = h;
    }
    draw();
    var b = btn.getBoundingClientRect(); mpk.style.left = Math.max(8, Math.min(b.left, innerWidth - mpk.offsetWidth - 8)) + "px"; mpk.style.top = b.bottom + 4 + "px";
    function clamp(m, up) { var x = MS.filter(function (k) { return up ? k >= m : k <= m; }); return up ? x[0] : x[x.length - 1]; }
    function done(f, t) { f = clamp(f, true) || MS[0]; t = clamp(t, false) || L; closeAll(); cb(f, t); }
    mpk.addEventListener("mouseover", function (e) { var x = e.target.closest("[data-m]"); if (mode === "one" || !a || !x) return; var hv = x.dataset.m, lo = a < hv ? a : hv, hi = a < hv ? hv : a;
      U.$$("[data-m]", mpk).forEach(function (bt) { var k = bt.dataset.m; bt.classList.toggle("sel", k === lo || k === hi); bt.classList.toggle("in", k > lo && k < hi); }); });
    mpk.addEventListener("click", function (e) {
      e.stopPropagation(); var x;
      if ((x = e.target.closest("[data-y]"))) { yr += +x.dataset.y; draw(); return; }
      if ((x = e.target.closest("[data-yy]"))) { yr = +x.dataset.yy; draw(); return; }
      if ((x = e.target.closest("[data-last]"))) { closeAll(); cb(L); return; }
      if ((x = e.target.closest("[data-pre]"))) { var pr = x.dataset.pre, ly = +L.slice(0, 4), lm = +L.slice(5);
        if (pr === "fy") done((lm >= 7 ? ly : ly - 1) + "-07", L); else if (pr === "12") done(U.ym(L, -11), L); else if (pr === "ytd") done(ly + "-01", L); else if (pr === "ly") done(ly - 1 + "-01", ly - 1 + "-12"); else done(MS[0], L); return; }
      if ((x = e.target.closest("[data-m]"))) { var m = x.dataset.m; if (mode === "one") { closeAll(); cb(m); return; } if (!a) { a = m; draw(); } else done(a < m ? a : m, a < m ? m : a); }
    });
  }
  function closeAll() { if (fp) { fp.remove(); fp = null; } if (mpk) { mpk.remove(); mpk = null; } if (cm) { cm.remove(); cm = null; } if (mp) { mp.remove(); mp = null; } }
  function cellMenu(ri, m, x, y) {
    closeAll(); cm = document.createElement("div"); cm.className = "cmenu";
    var its = [["⧉", "복사", "Ctrl+C", function () { copySel(false); }], ["⧉", "머리글 포함 복사", "", function () { copySel(true); }], "-",
      ["☰", "명단 보기", "Enter", function () { openCell(ri, m); }], ["✎", M.S.memo[mkey(ri, m)] ? "메모 고치기" : "메모 쓰기", "", function () { memoPop(ri, m, x, y); }], "-",
      ["↓", "이 열 큰 값부터 정렬", "", function () { upd(function () { cv.sort = { key: "m:" + m, dir: -1 }; }); }],
      ["⏷", "이 열 0 아닌 줄만", "", function () { upd(function () { cv.vf = cv.vf || {}; cv.vf["m:" + m] = { op: "nz", v: "" }; }); }],
      ["⊘", "이 열 숨기기", "", function () { if (cols().length < 2) return U.toast("열을 하나 이상 남겨야 함"); upd(function () { cv.hc = cv.hc || {}; cv.hc[m] = 1; }); }]];
    cm.innerHTML = its.map(function (it, i) { return it === "-" ? "<hr>" : '<button data-ci="' + i + '"><span class="i">' + it[0] + "</span>" + it[1] + '<span class="k">' + it[2] + "</span></button>"; }).join("");
    document.body.appendChild(cm); cm.style.left = Math.min(x, innerWidth - cm.offsetWidth - 8) + "px"; cm.style.top = Math.min(y, innerHeight - cm.offsetHeight - 8) + "px";
    cm.addEventListener("click", function (e) { var b = e.target.closest("[data-ci]"); if (!b) return; var it = its[+b.dataset.ci]; if (cm) { cm.remove(); cm = null; } it[3](); });
  }

  /* ── 내보내기 ── */
  function xlsx(aoa, name, widths) {
    var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(aoa); if (widths) ws["!cols"] = widths.map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1"); U.download(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), name + "_" + U.stamp() + ".xlsx");
  }
  function exportRep() {
    var set = S(), cs = cols(), p = per(), cmp = cmpList(), rows = set.rows;
    var head1 = ["구분"], aoa = [["■ " + set.nm + " (" + U.fmtM(p.from) + " ~ " + U.fmtM(p.to) + ", 말일자 인원)"], []];
    var years = []; cs.forEach(function (m) { var y = m.slice(0, 4); if (years.indexOf(y) < 0) years.push(y); });
    var colsDef = []; years.forEach(function (y) { cs.filter(function (m) { return m.slice(0, 4) === y; }).forEach(function (m) { colsDef.push({ m: m }); }); if (OPT.avg) colsDef.push({ y: y }); });
    head1 = head1.concat(colsDef.map(function (c) { return c.m ? U.fmtM(c.m) : c.y + " 평균"; })).concat(cmp.map(function (c) { return c[0]; }));
    aoa.push(head1);
    VIS.forEach(function (i) {
      var r = rows[i], line = [new Array(r.d + 1).join("  ") + r.nm];
      colsDef.forEach(function (c) { if (c.m) line.push(A(c.m).row[r.id]); else { var ms = M.MONTHS.filter(function (m) { return m.slice(0, 4) === c.y && m >= p.from && m <= p.to; }), s = 0; ms.forEach(function (m) { s += A(m).row[r.id]; }); line.push(ms.length ? Math.round(s / ms.length * 10) / 10 : ""); } });
      cmp.forEach(function (c) { line.push(A(cv.asof).row[r.id] - A(c[1]).row[r.id]); });
      aoa.push(line);
    });
    aoa.push(["누락 인력 (분류 기준 밖)"].concat(colsDef.map(function (c) { return c.m ? A(c.m).un.length : ""; })));
    aoa.push([]); aoa.push(["※ 말일자 인력 기준 · 분류 기준 '" + set.nm + "'"]);
    xlsx(aoa, set.nm, [28].concat(head1.slice(1).map(function () { return 9; })));
    U.toast("보고용 엑셀을 내려받았습니다");
  }
  function exportList() {
    var set = S(), res = A(cv.asof), rows = set.rows, path = {};
    rows.forEach(function (r, i) { path[r.id] = M.ancIdx(rows, i).map(function (a) { return rows[a].nm; }).concat([r.nm]).join(" › "); });
    var aoa = [["사번", "성명", "소속", "직급", "직무", "직책", "분류 줄"]];
    rows.forEach(function (r, i) { if (M.isPar(rows, i)) return; res.who[r.id].forEach(function (p) { aoa.push([p.sb, p.nm, p.org, p.gnm, p.job, p.pos, path[r.id]]); }); });
    res.un.forEach(function (p) { aoa.push([p.sb, p.nm, p.org, p.gnm, p.job, p.pos, "(누락) " + res.why[p.sb]]); });
    xlsx(aoa, set.nm + "_명단_" + cv.asof, [12, 10, 24, 8, 14, 12, 50]);
    U.toast(U.fmtM(cv.asof) + " 명단을 내려받았습니다");
  }

  /* ── 이벤트 ── */
  function onView() { return App.view === "board"; }
  function init() {
    loadUI();
    document.addEventListener("click", function (e) {
      var t;
      if (fp && !e.target.closest(".fpop") && !e.target.closest("[data-fcol]")) { fp.remove(); fp = null; }
      if (mpk && !e.target.closest(".mpk") && !e.target.closest(".pick,[data-mpk]")) { mpk.remove(); mpk = null; }
      if (cm && !e.target.closest(".cmenu")) { cm.remove(); cm = null; }
      if (mp && !e.target.closest(".mpop")) { mp.remove(); mp = null; }
      if (!onView()) return;
      if ((t = e.target.closest("[data-go2]"))) { App.go(t.dataset.go2); return; }
      if ((t = e.target.closest("[data-fcol]"))) { e.stopPropagation(); if (fp && fp.dataset.k === t.dataset.fcol) { closeAll(); return; } filterPop(t.dataset.fcol, t); return; }
      if ((t = e.target.closest("#asofBtn"))) { pick(t, "one", { asof: cv.asof }, function (m) { upd(function () { cv.asof = m; var p = per(); if (m > p.to) cv.to = m; if (m < p.from) cv.from = m; }); U.toast("기준월 " + U.fmtM(m)); }); return; }
      if ((t = e.target.closest("#perBtn"))) { var p0 = per(); pick(t, "range", { from: p0.from, to: p0.to }, function (f, to) { upd(function () { cv.from = f; cv.to = to; if (cv.asof < f || cv.asof > to) cv.asof = to; }, true); U.toast("기간 " + U.fmtM(f) + " ~ " + U.fmtM(to)); }); return; }
      if ((t = e.target.closest("[data-act='fclear']"))) { upd(function () { cv.sort = null; cv.rh = {}; cv.vf = {}; cv.hc = {}; }, true); U.toast("정렬 · 필터를 모두 해제했습니다"); return; }
      if ((t = e.target.closest("[data-selall]"))) { var c0 = cols(); SEL.anchor = { ri: VIS[0], m: c0[0] }; setSel(VIS[VIS.length - 1], c0[c0.length - 1], true); return; }
      if ((t = e.target.closest("[data-selcol]"))) { var m0 = t.dataset.selcol; SEL.anchor = { ri: VIS[0], m: m0 }; setSel(VIS[VIS.length - 1], m0, true); return; }
      if ((t = e.target.closest("[data-selrow]"))) { var r0 = +t.dataset.selrow, c1 = cols(); SEL.anchor = { ri: r0, m: c1[0] }; setSel(r0, c1[c1.length - 1], true); return; }
      if (e.target.closest("[data-cell]")) return;
      if ((t = e.target.closest("[data-close]"))) { e.stopPropagation(); var i = SHEETS.findIndex(function (s) { return s.id === t.dataset.close; }); upd(function () { SHEETS.splice(i, 1); if (SHEETS.indexOf(cv) < 0) cv = SHEETS[Math.max(0, i - 1)]; }, true); return; }
      if ((t = e.target.closest("[data-sheet]"))) { var s = SHEETS.filter(function (x) { return x.id === t.dataset.sheet; })[0]; if (s !== cv) upd(function () { cv = s; }, true); return; }
      if ((t = e.target.closest("[data-act='newSheet']"))) { upd(function () { var n = newSheet(cv); SHEETS.push(n); cv = n; }, true); U.toast("지금 화면을 복사해 새 시트를 열었음"); return; }
      if ((t = e.target.closest("[data-set]"))) { if (cv.set !== t.dataset.set) upd(function () { cv.set = t.dataset.set; cv.closed = {}; cv.from = cv.to = cv.unit = null; cv.rh = {}; cv.vf = {}; cv.hc = {}; cv.sort = null; }, true); return; }
      if ((t = e.target.closest("[data-fold]"))) { upd(function () { cv.closed[t.dataset.fold] = !cv.closed[t.dataset.fold]; }); return; }
      if ((t = e.target.closest("[data-row]"))) { setSel(+t.dataset.row, cv.asof, false); return; }
      if ((t = e.target.closest("[data-act='un']"))) { showUn(); return; }
      if ((t = e.target.closest("[data-act='memos']"))) { memos(); return; }
      if ((t = e.target.closest("[data-act='reload']"))) { App.reload(); return; }
      if ((t = e.target.closest("[data-act='exportRep']"))) { exportRep(); return; }
      if ((t = e.target.closest("[data-act='exportList']"))) { exportList(); return; }
      if ((t = e.target.closest("#unit button"))) { upd(function () { cv.unit = t.dataset.u; }, true); return; }
      if ((t = e.target.closest("#lvl button"))) { upd(function () { cv.lvl = +t.dataset.lv; cv.closed = {}; }, true); return; }
    });
    document.addEventListener("change", function (e) { if (!onView()) return; var t = e.target; if (t.dataset.cmp) upd(function () { cv.cmp[t.dataset.cmp] = t.checked; }); if (t.dataset.opt) upd(function () { OPT[t.dataset.opt] = t.checked; }); });
    document.addEventListener("dblclick", function (e) {
      if (!onView()) return; var t = e.target.closest("[data-cell]"); if (t) { var a = t.dataset.cell.split("|"); openCell(+a[0], a[1]); return; }
      t = e.target.closest("[data-sheet] .sn"); if (!t) return; var s = SHEETS.filter(function (x) { return x.id === t.closest("[data-sheet]").dataset.sheet; })[0];
      t.contentEditable = true; t.focus(); document.getSelection().selectAllChildren(t); t.onblur = function () { s.name = U.norm(t.textContent); renderSheets(); persistUI(); }; t.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); t.blur(); } };
    });
    document.addEventListener("contextmenu", function (e) { if (!onView()) return; var t = e.target.closest("[data-cell]"); if (!t) return; e.preventDefault(); var a = t.dataset.cell.split("|");
      if (!SEL.cells.some(function (c) { return c.ri === +a[0] && c.m === a[1]; })) setSel(+a[0], a[1]); cellMenu(+a[0], a[1], e.clientX, e.clientY); });
    document.addEventListener("mousedown", function (e) { if (!onView()) return; var t = e.target.closest("[data-cell]"); if (!t || e.button !== 0) return; var a = t.dataset.cell.split("|"); setSel(+a[0], a[1], e.shiftKey); drag = true; });
    document.addEventListener("mouseover", function (e) {
      if (!onView()) return; var t;
      if (drag && (t = e.target.closest("[data-cell]"))) { var a = t.dataset.cell.split("|"); if (!(SEL.end && SEL.end.ri === +a[0] && SEL.end.m === a[1])) setSel(+a[0], a[1], true); }
      t = e.target.closest("td.memo"); var tip = $("#mtip"); if (!t) { tip.style.opacity = 0; return; }
      var b = t.dataset.cell.split("|"); tip.innerHTML = "<b>메모 · " + U.fmtM(b[1]) + "</b>" + esc(M.S.memo[mkey(+b[0], b[1])] || ""); var r = t.getBoundingClientRect(); tip.style.left = Math.min(r.right + 6, innerWidth - 270) + "px"; tip.style.top = r.top + "px"; tip.style.opacity = 1;
    });
    document.addEventListener("mouseup", function () { drag = false; });
    $("#q").addEventListener("input", function () { findRows(false); });
    document.addEventListener("keydown", function (e) {
      var k = e.key, inF = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable;
      if (k === "Escape") { if (fp || mpk || cm || mp) { closeAll(); return; } }
      if (!onView()) return;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "f") { e.preventDefault(); $("#q").focus(); $("#q").select(); return; }
      if (e.ctrlKey && (k === "PageDown" || k === "PageUp")) { e.preventDefault(); var i = SHEETS.indexOf(cv) + (k === "PageDown" ? 1 : -1); if (SHEETS[i]) upd(function () { cv = SHEETS[i]; }, true); return; }
      if (e.target.id === "q") { if (k === "Enter") { e.preventDefault(); findRows(true); } if (k === "Escape") { e.target.value = ""; Q = ""; renderTable(); e.target.blur(); } return; }
      if (inF || U.$(".ov")) return;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "c" && SEL.cells.length) { e.preventDefault(); copySel(false); return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "a") { e.preventDefault(); var ca = cols(); SEL.anchor = { ri: VIS[0], m: ca[0] }; setSel(VIS[VIS.length - 1], ca[ca.length - 1], true); return; }
      if (k === "Escape") { SEL = { anchor: null, cells: [] }; paintSel(); return; }
      if (!SEL.anchor) return;
      var cs = cols(), pos = SEL.end || SEL.anchor, ri = VIS.indexOf(pos.ri), ci = cs.indexOf(pos.m);
      if (k === "Enter") { e.preventDefault(); openCell(SEL.anchor.ri, SEL.anchor.m); return; }
      var dr = k === "ArrowDown" ? 1 : k === "ArrowUp" ? -1 : 0, dc = k === "ArrowRight" ? 1 : k === "ArrowLeft" ? -1 : 0;
      if (!dr && !dc) return; e.preventDefault();
      ri = Math.max(0, Math.min(VIS.length - 1, ri + dr)); ci = Math.max(0, Math.min(cs.length - 1, ci + dc));
      setSel(VIS[ri], cs[ci], e.shiftKey); var el = cellEl(VIS[ri], cs[ci]); if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function findRows(next) {
    Q = U.norm($("#q").value); renderTable(); if (!Q) { qi = -1; return; }
    var hits = U.$$("tr.hit"); if (!hits.length) { U.toast("'" + Q + "' 줄 없음 (접힌 줄은 펼친 뒤 찾음)"); return; }
    qi = next ? (qi + 1) % hits.length : 0; var tr = hits[qi]; tr.scrollIntoView({ block: "center", behavior: "smooth" }); setSel(+tr.dataset.ri, cv.asof); $("#q").focus();
  }
  function showSet(id) { if (!cv) loadUI(); cv.set = id; cv.closed = {}; cv.from = cv.to = cv.unit = null; cv.rh = {}; cv.vf = {}; cv.hc = {}; cv.sort = null; persistUI(); }

  return { init: init, render: render, showSet: showSet, pick: pick, people: people };
})();
