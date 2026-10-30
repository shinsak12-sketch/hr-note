/* 자료 모델: 기준값(조직 · 직급 · 직무 버전) · 분류 기준 · 직원명부 스냅샷 · 집계 */
var M = (function () {
  var P_ROSTER = "백데이터/설정/직원명부", P_ORDERS = "백데이터/설정/발령검색", P_ORGLIST = "백데이터/설정/조직목록",
    P_DATA = "data", P_BACKUP = "backup", P_CACHE = "cache/직원명부", MASTER = "기준정보.xlsx";
  var APP_VER = "0.1.3";
  var LVN = { 0: "레벨 미정", 1: "회사", 2: "본부", 3: "부서·파트", 4: "센터" };
  var LVCOL = { "소속6": 1, "소속5": 2, "소속4": 3, "소속3": 4 };
  var PRIVATE = /주민|생년월일|성명|이름|전화|휴대|주소|메일|계좌/;

  function blankState() {
    return { org: [], grd: [], job: [], sets: [], memo: {}, cols: ["직책", "직군"], log: [], orgListHash: "", seq: { o: 0, g: 0, j: 0, s: 0, r: 0 } };
  }
  var S = blankState(), extra = {}, rev = 1, setRev = 1, newer = false;

  /* ── 엔터티 도우미 ── */
  function nid(k) { S.seq[k] = (S.seq[k] || 0) + 1; return { o: "O", g: "G", j: "J", s: "S", r: "R" }[k] + ("000" + S.seq[k]).slice(-4); }
  function cur(e) { return e.v[0]; }
  function nm(e) { return e ? cur(e).nm : "(없음)"; }
  function list(kind) { return S[kind]; }
  function byId(kind, id) { var a = S[kind]; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function kids(id) { return S.org.filter(function (o) { return o.p === id; }).sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); }); }
  function path(o) { var a = []; while (o) { a.unshift(nm(o)); o = o.p ? byId("org", o.p) : null; } return a.join(" › "); }
  function desc(o) { var n = 0; kids(o.id).forEach(function (c) { n += 1 + desc(c); }); return n; }
  function touch() { rev++; setRev++; }
  function bump() { setRev++; }

  /* ── 이름 → 엔터티 찾기 (버전 기간을 봄) ── */
  var IDX = null;
  function index() {
    if (IDX && IDX.rev === rev) return IDX;
    var o = {}, g = {}, gc = {}, j = {};
    function add(map, key, e, v) { (map[key] = map[key] || []).push({ id: e.id, from: v.from || "", to: v.to || "", lv: e.lv }); }
    S.org.forEach(function (e) { e.v.forEach(function (v) { add(o, U.norm(v.nm), e, v); }); });
    S.grd.forEach(function (e) { e.v.forEach(function (v) { add(g, U.norm(v.nm), e, v); if (v.code) add(gc, U.norm(v.code), e, v); }); });
    S.job.forEach(function (e) { e.v.forEach(function (v) { add(j, U.norm(v.nm), e, v); }); });
    IDX = { rev: rev, o: o, g: g, gc: gc, j: j };
    return IDX;
  }
  function pick(c, date, lv) {
    if (!c || !c.length) return null;
    if (lv && c.length > 1) { var l = c.filter(function (x) { return x.lv === lv; }); if (l.length) c = l; }
    for (var i = 0; i < c.length; i++) if ((!c[i].from || c[i].from <= date) && (!c[i].to || c[i].to >= date)) return c[i].id;
    return c[0].id;
  }
  function findOrg(name, date, lv) { return pick(index().o[U.norm(name)], date || "9999", lv); }
  function findGrd(name, code, date) { var I = index(); return pick(code && I.gc[U.norm(code)], date || "9999") || pick(I.g[U.norm(name)], date || "9999"); }
  function findJob(name, date) { return pick(index().j[U.norm(name)], date || "9999"); }

  /* ── 직원명부 읽기 ── */
  var FILES = [], MONTHS = [], SNAP = {}, HEADERS = [];
  function rosterDate(fn) { var m = /(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/.exec(fn); return m ? m[1] + "-" + m[2] + "-" + m[3] : null; }
  /* 엑셀 → 머리글 + 사번 있는 줄 (값은 글자로 정리) */
  function rosterTable(buf) {
    var wb = XLSX.read(buf, { type: "array", cellDates: true });
    var ws = wb.Sheets[wb.SheetNames[0]], aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    var hi = -1; for (var i = 0; i < Math.min(10, aoa.length); i++) if (aoa[i].some(function (c) { return U.norm(c) === "사번"; })) { hi = i; break; }
    if (hi < 0) throw new Error("머리글에 '사번' 열이 없습니다");
    var H = aoa[hi].map(U.norm), sbi = H.indexOf("사번");
    if (H.indexOf("소속") < 0) throw new Error("머리글에 '소속' 열이 없습니다");
    var d = [];
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r]; if (!U.norm(row[sbi])) continue;
      d.push(H.map(function (h, k) { return !h ? "" : row[k] instanceof Date ? U.dateStr(row[k]) : U.norm(row[k]); }));
    }
    return { h: H, d: d };
  }
  /* 머리글 + 줄 → 사람 목록 (캐시에서도 이걸로 만듦) */
  function buildPersons(t) {
    var H = t.h, at = {}; H.forEach(function (h, k) { if (h && at[h] === undefined) at[h] = k; });
    var lvCols = Object.keys(LVCOL).filter(function (h) { return at[h] !== undefined; }).sort(function (a, b) { return LVCOL[a] - LVCOL[b]; });
    var out = t.d.map(function (row) {
      var o = {}; H.forEach(function (h, k) { if (h) o[h] = row[k]; });
      var chain = [];
      lvCols.forEach(function (h) {
        var v = o[h]; if (U.blank(v)) return;
        if (chain.length && chain[chain.length - 1].nm === v) return;
        chain.push({ lv: LVCOL[h], nm: v });
      });
      var low = o["소속"];
      if (!U.blank(low) && !chain.some(function (c) { return c.nm === low; })) chain.push({ lv: Math.min(4, (chain.length ? chain[chain.length - 1].lv : 0) + 1), nm: low });
      return { sb: o["사번"], nm: o["성명"] || "", org: low, chain: chain, gnm: o["직급"] || "", gcd: o["직급코드"] || "", job: o["직무"] || "", pos: o["직책"] || "", row: o, r: -1 };
    });
    return { headers: H.filter(Boolean), persons: out };
  }
  function parseRoster(buf) { return buildPersons(rosterTable(buf)); }

  /* ── 캐시: cache\직원명부\<원본 이름>.dat · 원본 크기 · 수정 시각이 같으면 엑셀을 다시 풀지 않음 ── */
  var CACHE_FMT = 1;
  async function gz(str) {
    if (!window.CompressionStream) return new TextEncoder().encode(str);
    return new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  }
  async function gunz(buf) {
    var b = new Uint8Array(buf);
    if (b[0] === 0x1f && b[1] === 0x8b) return await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return new TextDecoder().decode(b);
  }
  async function cacheGet(f, st) {
    try {
      var b = await Store.read(P_CACHE, f.name + ".dat"); if (!b) return null;
      var c = JSON.parse(await gunz(b));
      return c.fmt === CACHE_FMT && c.size === st.size && c.mt === st.mt ? c : null;
    } catch (e) { return null; }
  }
  async function cachePut(f, st, body) {
    try { body.fmt = CACHE_FMT; body.size = st.size; body.mt = st.mt; await Store.write(P_CACHE, f.name + ".dat", await gz(JSON.stringify(body))); } catch (e) { }
  }
  /* 백데이터 점검 결과: 인식 못 한 파일 · 읽기 실패 · 빠진 달 · 조직 목록 없음 */
  var ISSUES = { skip: [], err: [], gaps: [], dup: [], orgList: true, orders: [] };
  function validDate(d) { if (!d) return false; var m = +d.slice(5, 7), dd = +d.slice(8, 10); return m >= 1 && m <= 12 && dd >= 1 && dd <= 31; }
  async function scanFiles() {
    var names = await Store.list(P_ROSTER), skip = [];
    FILES = [];
    names.forEach(function (n) {
      if (/^\.|^desktop\.ini$|^thumbs\.db$/i.test(n)) return;
      if (!/\.xls[xm]?$/i.test(n)) { skip.push({ name: n, why: "엑셀 파일(.xlsx · .xls)이 아님" }); return; }
      var d = rosterDate(n);
      if (!d) { skip.push({ name: n, why: "파일 이름에 8자리 날짜(예: 20261030)가 없음" }); return; }
      if (!validDate(d)) { skip.push({ name: n, why: "날짜 '" + d + "' 가 올바르지 않음" }); return; }
      FILES.push({ name: n, date: d, m: d.slice(0, 7) });
    });
    FILES.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    ISSUES.skip = skip;
    return { files: FILES };
  }
  function monthsOf() {
    var byM = {}, dup = {};
    FILES.forEach(function (f) { if (byM[f.m]) (dup[f.m] = dup[f.m] || [byM[f.m].name]).push(f.name); byM[f.m] = f; });
    MONTHS = Object.keys(byM).sort();
    var gaps = []; if (MONTHS.length) for (var m = MONTHS[0]; m < MONTHS[MONTHS.length - 1]; m = U.ym(m, 1)) if (!byM[m]) gaps.push(m);
    ISSUES.gaps = gaps;
    ISSUES.dup = Object.keys(dup).map(function (m) { return { m: m, names: dup[m], used: byM[m].name }; });
    return byM;
  }
  async function loadAll(progress) {
    await scanFiles(); var done = 0, errs = [], all = FILES.slice(), fresh = 0;
    var st = await Store.info(P_ROSTER);
    for (var i = 0; i < all.length; i++) {
      var f = all[i];
      if (!SNAP[f.name]) {
        var s0 = st[f.name] || { size: -1, mt: -1 }, c = await cacheGet(f, s0);
        try {
          if (!c) {
            fresh++;
            var b = await Store.read(P_ROSTER, f.name); if (!b) throw new Error("파일을 열 수 없음 (다른 프로그램에서 쓰는 중인지 확인)");
            c = rosterTable(b); if (!c.d.length) throw new Error("사번이 있는 줄이 하나도 없음");
            await cachePut(f, s0, c);
          }
          var p = buildPersons(c);
          SNAP[f.name] = { file: f, persons: p.persons, headers: p.headers, r: -1 };
        } catch (e) { errs.push({ name: f.name, why: e.message || String(e) }); }
      }
      done++; if (progress) progress(done, all.length, fresh);
    }
    /* 원본이 없어진 캐시는 지움 */
    var keep = {}; all.forEach(function (f) { keep[f.name + ".dat"] = 1; });
    var cl = await Store.list(P_CACHE); for (var j = 0; j < cl.length; j++) if (!keep[cl[j]]) await Store.remove(P_CACHE, cl[j]);
    /* 읽지 못한 파일은 월 목록에서 뺌 (그달이 0명으로 나오지 않게) */
    FILES = FILES.filter(function (f) { return SNAP[f.name]; });
    var byM = monthsOf(); ISSUES.err = errs;
    var on = await Store.list(P_ORGLIST); ISSUES.orgList = on.some(function (n) { return /^조직\s*목록\.xls/i.test(n); });
    var od = await Store.list(P_ORDERS); ISSUES.orders = od.filter(function (n) { return !/\.xls[xm]?$/i.test(n) || !validDate(rosterDate(n)); }).map(function (n) { return { name: n, why: !/\.xls[xm]?$/i.test(n) ? "엑셀 파일이 아님" : "파일 이름에 8자리 날짜가 없음" }; });
    var last = latestFile(); HEADERS = last && SNAP[last.name] ? SNAP[last.name].headers : [];
    return { files: FILES.length, months: MONTHS.length, errs: errs, byM: byM, fresh: fresh };
  }
  function issues() { return ISSUES; }
  function issueCount() { return ISSUES.skip.length + ISSUES.err.length + ISSUES.gaps.length + ISSUES.orders.length + (ISSUES.orgList ? 0 : 1); }
  function latestFile() { return FILES.length ? FILES[FILES.length - 1] : null; }
  function fileOfMonth(m) { var f = null; FILES.forEach(function (x) { if (x.m === m) f = x; }); return f; }
  function snap(m) {
    var f = fileOfMonth(m); if (!f) return null;
    var s = SNAP[f.name]; if (!s) return null;
    if (s.r !== rev) { s.persons.forEach(function (p) { resolve(p, f.date); }); s.r = rev; }
    return s;
  }
  function resolve(p, date) {
    var ids = [];
    p.chain.forEach(function (c) { var id = findOrg(c.nm, date, c.lv); if (id && ids.indexOf(id) < 0) ids.push(id); });
    p.oids = ids; p.olow = findOrg(p.org, date) || null;
    if (p.olow && ids.indexOf(p.olow) < 0) ids.push(p.olow);
    p.gid = findGrd(p.gnm, p.gcd, date); p.jid = findJob(p.job, date);
  }

  /* ── 카드 · 조건 ── */
  function ctype(c) { return c.slice(0, 4) === "col:" ? c.slice(0, c.indexOf(":", 4)) : c.slice(0, 3); }
  function cval(c) { return c.slice(ctype(c).length + 1); }
  function attr(p, k) { if (k === "grd") return p.gid; if (k === "job") return p.jid; if (k.slice(0, 4) === "col:") return p.row[k.slice(4)] || ""; return ""; }
  function cardOk(c, p) {
    var t = ctype(c), v = cval(c);
    if (t === "org") return p.oids.indexOf(v) >= 0;
    if (t === "grd") return p.gid === v;
    if (t === "job") return p.jid === v;
    if (t === "per") return p.sb === v;
    if (t.slice(0, 4) === "col:") return (p.row[t.slice(4)] || "") === v;
    return false;
  }
  function fltOk(f, p) { for (var k in f) if (f[k].indexOf(attr(p, k)) < 0) return false; return true; }
  function hit(card, p) { return cardOk(card.c, p) && fltOk(card.f || {}, p); }
  function groupOk(cards, p) {
    if (!cards.length) return true; var g = {};
    cards.forEach(function (c) { var k = ctype(c.c); (g[k] = g[k] || []).push(c); });
    for (var k in g) if (!g[k].some(function (c) { return hit(c, p); })) return false;
    return true;
  }
  function typeName(t) { return t === "org" ? "조직" : t === "grd" ? "직급" : t === "job" ? "직무" : t === "per" ? "사람" : t.slice(0, 4) === "col:" ? t.slice(4) : t; }
  function cardLabel(c) {
    var t = ctype(c), v = cval(c);
    if (t === "org") return nm(byId("org", v)); if (t === "grd") return nm(byId("grd", v)); if (t === "job") return nm(byId("job", v));
    if (t === "per") { var l = latestFile(), s = l && SNAP[l.name], p = s && s.persons.filter(function (x) { return x.sb === v; })[0]; return (p ? p.nm + " " : "") + "(" + v + ")"; }
    return v || "(빈칸)";
  }
  function valLabel(k, v) { if (k === "grd") return nm(byId("grd", v)); if (k === "job") return nm(byId("job", v)); return v || "(빈칸)"; }
  function fltLabel(f) {
    return Object.keys(f || {}).map(function (k) { var v = f[k].map(function (x) { return valLabel(k, x); }); return typeName(k) + " " + (v.length > 2 ? v.slice(0, 2).join(", ") + " 외 " + (v.length - 2) : v.join(", ")); }).join(" · ");
  }

  /* ── 집계 ── */
  function isPar(rows, i) { return i + 1 < rows.length && rows[i + 1].d > rows[i].d; }
  function kidsIdx(rows, i) { var a = []; for (var j = i + 1; j < rows.length && rows[j].d > rows[i].d; j++) if (rows[j].d === rows[i].d + 1) a.push(j); return a; }
  function ancIdx(rows, i) { var a = [], d = rows[i].d; for (var j = i - 1; j >= 0 && d > 0; j--) if (rows[j].d < d) { a.unshift(j); d = rows[j].d; } return a; }
  var CACHE = {};
  function clearCache() { CACHE = {}; }
  function assign(set, m) {
    var key = set.id + "|" + m + "|" + rev + "|" + setRev; if (CACHE[key]) return CACHE[key];
    var rows = set.rows, n = rows.length, res = { row: {}, dup: {}, un: [], who: {}, why: {}, total: 0, dupN: 0 }, leaves = [];
    for (var i = 0; i < n; i++) { res.row[rows[i].id] = 0; res.who[rows[i].id] = []; if (!isPar(rows, i)) leaves.push(i); }
    var sn = snap(m); if (!sn) return (CACHE[key] = res);
    var anc = {}; leaves.forEach(function (i) { anc[i] = ancIdx(rows, i); });
    function ancOk(i, p) { return anc[i].every(function (a) { return groupOk(rows[a].cards, p); }); }
    function leafOk(i, p) { return rows[i].cards.length && ancOk(i, p) && groupOk(rows[i].cards, p); }
    var pri = leaves.filter(function (i) { return rows[i].pr; }), nor = leaves.filter(function (i) { return !rows[i].pr && !rows[i].rest; }), rest = leaves.filter(function (i) { return rows[i].rest; });
    sn.persons.forEach(function (p) {
      res.total++;
      var h = null, a;
      for (a = 0; a < pri.length; a++) if (leafOk(pri[a], p)) { h = pri[a]; break; }
      if (h === null) { var ms = nor.filter(function (i) { return leafOk(i, p); }); if (ms.length) { h = ms[0]; if (ms.length > 1) { res.dupN++; ms.forEach(function (i) { res.dup[rows[i].id] = (res.dup[rows[i].id] || 0) + 1; }); } } }
      if (h === null) for (a = 0; a < rest.length; a++) if (ancOk(rest[a], p)) { h = rest[a]; break; }
      if (h === null) { res.un.push(p); res.why[p.sb] = whyOut(rows, leaves, anc, p); return; }
      res.row[rows[h].id]++; res.who[rows[h].id].push(p);
    });
    for (i = n - 1; i >= 0; i--) if (isPar(rows, i)) { var s = 0, w = []; kidsIdx(rows, i).forEach(function (j) { s += res.row[rows[j].id]; w = w.concat(res.who[rows[j].id]); }); res.row[rows[i].id] = s; res.who[rows[i].id] = w; }
    return (CACHE[key] = res);
  }
  function whyOut(rows, leaves, anc, p) {
    if (!p.oids.length) return "조직 '" + p.org + "' 이 기준값에 없음 (미매칭)";
    for (var x = 0; x < leaves.length; x++) {
      var i = leaves[x], r = rows[i];
      for (var y = 0; y < r.cards.length; y++) {
        var cd = r.cards[y]; if (!cardOk(cd.c, p)) continue;
        if (!fltOk(cd.f || {}, p)) { var k = Object.keys(cd.f).filter(function (k) { return cd.f[k].indexOf(attr(p, k)) < 0; })[0]; return r.nm + " · " + cardLabel(cd.c) + " 의 " + typeName(k) + " 조건에서 빠짐 (" + (valLabel(k, attr(p, k)) || "없음") + ")"; }
        var bad = anc[i].filter(function (a) { return !groupOk(rows[a].cards, p); })[0];
        if (bad !== undefined) return r.nm + " · 위 줄 '" + rows[bad].nm + "' 공통 조건에서 빠짐";
        return r.nm + " · 같은 줄의 다른 종류 카드 조건에서 빠짐";
      }
    }
    return "담긴 카드 없음";
  }

  /* ── 조직 목록 ── */
  async function readOrgList() {
    var names = await Store.list(P_ORGLIST), fn = names.filter(function (n) { return /^조직\s*목록\.xls/i.test(n); })[0];
    if (!fn) return { list: [], file: null };
    var buf = await Store.read(P_ORGLIST, fn), wb = XLSX.read(buf, { type: "array", cellDates: true });
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    var hi = -1; for (var i = 0; i < Math.min(10, aoa.length); i++) if (aoa[i].some(function (c) { return U.norm(c) === "소속"; })) { hi = i; break; }
    if (hi < 0) return { list: [], file: fn };
    var H = aoa[hi].map(U.norm), at = function (h) { return H.indexOf(h); };
    var out = aoa.slice(hi + 1).filter(function (r) { return U.norm(r[at("소속")]); }).map(function (r) {
      return { code: U.norm(r[at("소속코드")]), nm: U.norm(r[at("소속")]), from: U.dateStr(r[at("시작일")]), to: U.dateStr(r[at("종료일")]) };
    });
    /* 내용이 바뀌었으면 보관 폴더에 날짜 붙여 복사 */
    var hash = String(out.length) + ":" + out.map(function (o) { return o.code + o.nm + o.from + o.to; }).join("|").length + ":" + simpleHash(JSON.stringify(out));
    if (hash !== S.orgListHash) {
      await Store.copy(P_ORGLIST, fn, P_ORGLIST + "/보관", "조직 목록_" + U.stamp().slice(0, 8) + ".xlsx");
      S.orgListHash = hash; out.changed = true;
    }
    return { list: out, file: fn };
  }
  function simpleHash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(16); }

  /* ── 기본 세팅: 최신 직원명부 · 조직 목록으로 기준값을 만듦 ── */
  async function autoSetup() {
    var last = latestFile(); if (!last || !SNAP[last.name]) throw new Error("백데이터\\설정\\직원명부 에 직원명부_날짜.xlsx 파일이 없습니다");
    var ol = await readOrgList(), olBy = {}; ol.list.forEach(function (o) { olBy[o.nm] = o; });
    var date = last.date, persons = SNAP[last.name].persons;
    S.org = []; S.grd = []; S.job = []; S.seq.o = S.seq.g = S.seq.j = 0;
    var key = {};
    persons.forEach(function (p) {
      var par = null;
      p.chain.forEach(function (c) {
        var k = c.lv + "|" + c.nm;
        if (!key[k]) {
          var src = olBy[c.nm];
          var e = { id: nid("o"), lv: c.lv, p: par, code: src ? src.code : "", ord: S.org.length + 1, dead: false,
            v: [{ n: 1, nm: c.nm, from: src && src.from ? src.from : date, to: "", src: src ? "조직 목록" : last.name, note: "" }] };
          S.org.push(e); key[k] = e.id;
        }
        par = key[k];
      });
    });
    ol.list.forEach(function (o) {
      if (S.org.some(function (e) { return nm(e) === o.nm; })) return;
      S.org.push({ id: nid("o"), lv: 0, p: null, code: o.code, ord: S.org.length + 1, dead: false, v: [{ n: 1, nm: o.nm, from: o.from || date, to: "", src: "조직 목록", note: "직원명부에 없어 레벨 미정" }] });
    });
    var g = {}, j = {};
    persons.forEach(function (p) {
      if (p.gnm) { var gk = p.gcd + "|" + p.gnm; g[gk] = g[gk] || { nm: p.gnm, code: p.gcd, n: 0 }; g[gk].n++; }
      if (p.job) { j[p.job] = (j[p.job] || 0) + 1; }
    });
    Object.keys(g).sort(function (a, b) { return g[a].code < g[b].code ? -1 : 1; }).forEach(function (k, i) {
      S.grd.push({ id: nid("g"), ord: i + 1, dead: false, v: [{ n: 1, nm: g[k].nm, code: g[k].code, from: date, to: "", src: last.name, note: "" }] });
    });
    Object.keys(j).sort(function (a, b) { return j[b] - j[a]; }).forEach(function (k, i) {
      S.job.push({ id: nid("j"), ord: i + 1, dead: false, v: [{ n: 1, nm: k, from: date, to: "", src: last.name, note: "" }] });
    });
    touch();
    if (!S.sets.length) defaultSets();
    log("기본 세팅: 조직 " + S.org.length + " · 직급 " + S.grd.length + " · 직무 " + S.job.length + " (" + last.name + ")");
    return { org: S.org.length, grd: S.grd.length, job: S.job.length, undecided: S.org.filter(function (o) { return o.lv === 0; }).length };
  }
  function R(nm, d, cards, o) { var r = { id: nid("r"), nm: nm, d: d, cards: (cards || []).map(function (c) { return typeof c === "string" ? { c: c, f: {} } : c; }) }; if (o) for (var k in o) r[k] = o[k]; return r; }
  function defaultSets() {
    var a = MONTHS[Math.max(0, MONTHS.length - 12)] || "", b = MONTHS[MONTHS.length - 1] || "";
    var rows = [R("전체", 0)], tops = S.org.filter(function (o) { return o.lv === 1; });
    var l2 = tops.length ? [].concat.apply([], tops.map(function (t) { return kids(t.id); })) : S.org.filter(function (o) { return o.lv === 2; });
    l2.forEach(function (o) {
      var ks = kids(o.id);
      if (!ks.length) { rows.push(R(nm(o), 1, ["org:" + o.id])); return; }
      rows.push(R(nm(o), 1, ["org:" + o.id]));
      ks.forEach(function (k) { rows.push(R(nm(k), 2, ["org:" + k.id])); });
      rows.push(R("(직속 · 기타)", 2, [], { rest: 1 }));
    });
    if (tops.length) rows.push(R("(회사 직속)", 1, ["org:" + tops[0].id], {}));
    S.sets.push({ id: nid("s"), nm: "조직별 인력", from: a, to: b, unit: "m", rows: rows });
    S.sets.push({ id: nid("s"), nm: "직급별 인력", from: a, to: b, unit: "m", rows: [R("전체", 0)].concat(S.grd.map(function (g) { return R(nm(g), 1, ["grd:" + g.id]); })) });
    S.sets.push({ id: nid("s"), nm: "직무별 인력", from: a, to: b, unit: "m", rows: [R("전체", 0)].concat(S.job.map(function (j) { return R(nm(j), 1, ["job:" + j.id]); })) });
    /* 회사 직속 줄: 회사 카드 + 우선 아님 → 본부 줄에 안 들어간 사람만 남도록 나머지로 */
    var last = S.sets[0].rows[S.sets[0].rows.length - 1]; if (last.nm === "(회사 직속)") { last.cards = []; last.rest = 1; }
  }

  /* ── 미매칭 검사: 모든 직원명부에서 기준값에 없는 이름 ── */
  function scanUnmatched() {
    var out = {}, order = FILES.slice();
    order.forEach(function (f, fi) {
      var s = SNAP[f.name]; if (!s) return;
      s.persons.forEach(function (p) {
        var par = "";
        p.chain.forEach(function (c) {
          if (!findOrg(c.nm, f.date, c.lv)) {
            var k = "org|" + c.lv + "|" + c.nm;
            var u = out[k] = out[k] || { kind: "org", k: k, nm: c.nm, lv: c.lv, up: par, files: {}, first: f.name, last: f.name, lastI: fi, sbs: {} };
            u.files[f.name] = 1; u.last = f.name; if (fi >= u.lastI) { if (fi > u.lastI) u.sbs = {}; u.lastI = fi; u.sbs[p.sb] = 1; }
          }
          par = c.nm;
        });
        if (p.gnm && !findGrd(p.gnm, p.gcd, f.date)) { var gk = "grd|" + p.gcd + "|" + p.gnm; var g = out[gk] = out[gk] || { kind: "grd", k: gk, nm: p.gnm, code: p.gcd, files: {}, first: f.name, last: f.name, lastI: fi, sbs: {} }; g.files[f.name] = 1; g.last = f.name; if (fi > g.lastI) { g.sbs = {}; g.lastI = fi; } g.sbs[p.sb] = 1; }
        if (p.job && !findJob(p.job, f.date)) { var jk = "job|" + p.job; var j = out[jk] = out[jk] || { kind: "job", k: jk, nm: p.job, files: {}, first: f.name, last: f.name, lastI: fi, sbs: {} }; j.files[f.name] = 1; j.last = f.name; if (fi > j.lastI) { j.sbs = {}; j.lastI = fi; } j.sbs[p.sb] = 1; }
      });
    });
    var arr = Object.keys(out).map(function (k) { var u = out[k]; u.nFiles = Object.keys(u.files).length; u.n = Object.keys(u.sbs).length; u.sug = suggest(u, order); return u; });
    return arr.sort(function (a, b) { return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : b.n - a.n; });
  }
  /* 추천: 그 이름이 마지막으로 나온 명부의 사람들이 다음 명부에서 간 곳 */
  function suggest(u, order) {
    var nx = order[u.lastI + 1]; if (!nx || !SNAP[nx.name]) return null;
    var cnt = {}, tot = 0, s = SNAP[nx.name];
    s.persons.forEach(function (p) {
      if (!u.sbs[p.sb]) return; tot++;
      var id = null;
      if (u.kind === "org") { var c = p.chain.filter(function (c) { return c.lv === u.lv; })[0]; id = c && findOrg(c.nm, nx.date, c.lv); }
      else if (u.kind === "grd") id = findGrd(p.gnm, p.gcd, nx.date); else id = findJob(p.job, nx.date);
      if (id) cnt[id] = (cnt[id] || 0) + 1;
    });
    var best = null; for (var k in cnt) if (!best || cnt[k] > cnt[best]) best = k;
    return best ? { id: best, pct: Math.round(cnt[best] / Math.max(1, tot) * 100), file: nx.name } : null;
  }

  /* ── 저장 · 불러오기 (data\기준정보.xlsx) ── */
  var KNOWN = ["정보", "조직", "조직버전", "직급", "직급버전", "직무", "직무버전", "분류기준", "분류줄", "메모", "설정", "기록"];
  function readSheet(wb, name) {
    var ws = wb.Sheets[name]; if (!ws) return [];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }); if (!aoa.length) return [];
    var H = aoa[0].map(U.norm);
    return aoa.slice(1).filter(function (r) { return r.some(function (c) { return c !== ""; }); }).map(function (r) { var o = {}; H.forEach(function (h, i) { if (h) o[h] = r[i] instanceof Date ? U.dateStr(r[i]) : r[i]; }); return o; });
  }
  function fromWorkbook(wb) {
    var info = {}; readSheet(wb, "정보").forEach(function (r) { info[r["항목"]] = r["값"]; });
    var raw = { fmt: +info["형식"] || 1, sheets: {}, ver: String(info["프로그램버전"] || "0.1") };
    KNOWN.forEach(function (n) { raw.sheets[n] = readSheet(wb, n); });
    var mg = Migrate.run(raw);
    if (!mg.ok) return { newer: true, from: mg.from };
    raw = mg.raw;
    var st = blankState(), sh = raw.sheets, str = function (v) { return U.norm(v); };
    function ents(base, vers, mk) {
      var by = {};
      sh[base].forEach(function (r) { var e = mk(r); e.v = []; e._x = extraCols(r, base); by[e.id] = e; });
      sh[vers].forEach(function (r) { var e = by[str(r["ID"])]; if (!e) return; e.v.push({ n: +r["버전"] || 1, nm: str(r["이름"]), code: str(r["직급코드"]), from: U.dateStr(r["시작일"]), to: U.dateStr(r["종료일"]), src: str(r["출처"]), note: str(r["메모"]) }); });
      return Object.keys(by).map(function (k) { var e = by[k]; e.v.sort(function (a, b) { return b.n - a.n; }); if (!e.v.length) e.v = [{ n: 1, nm: "(이름 없음)", from: "", to: "", src: "", note: "" }]; return e; })
        .sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); });
    }
    st.org = ents("조직", "조직버전", function (r) { return { id: str(r["ID"]), lv: +r["레벨"] || 0, p: str(r["상위ID"]) || null, code: str(r["소속코드"]), ord: +r["순번"] || 0, dead: str(r["폐지"]) === "Y" }; });
    st.grd = ents("직급", "직급버전", function (r) { return { id: str(r["ID"]), ord: +r["순번"] || 0, dead: str(r["폐지"]) === "Y" }; });
    st.job = ents("직무", "직무버전", function (r) { return { id: str(r["ID"]), ord: +r["순번"] || 0, dead: str(r["폐지"]) === "Y" }; });
    var sets = {};
    sh["분류기준"].forEach(function (r) { sets[str(r["ID"])] = { id: str(r["ID"]), nm: str(r["이름"]), ord: +r["순번"] || 0, from: str(r["시작월"]), to: str(r["끝월"]), unit: str(r["단위"]) || "m", rows: [], _x: extraCols(r, "분류기준") }; });
    sh["분류줄"].slice().sort(function (a, b) { return (+a["순번"] || 0) - (+b["순번"] || 0); }).forEach(function (r) {
      var s = sets[str(r["기준ID"])]; if (!s) return;
      var cards = []; try { cards = JSON.parse(r["카드"] || "[]"); } catch (e) { cards = []; }
      s.rows.push({ id: str(r["줄ID"]), nm: str(r["이름"]), d: +r["단계"] || 0, pr: str(r["우선"]) === "Y" ? 1 : 0, rest: str(r["나머지"]) === "Y" ? 1 : 0, cards: cards });
    });
    st.sets = Object.keys(sets).map(function (k) { return sets[k]; }).sort(function (a, b) { return a.ord - b.ord; });
    sh["메모"].forEach(function (r) { if (str(r["키"])) st.memo[str(r["키"])] = String(r["내용"]); });
    sh["설정"].forEach(function (r) {
      var k = str(r["키"]), v = r["값"];
      try { if (k === "카드종류") st.cols = JSON.parse(v); if (k === "번호") st.seq = JSON.parse(v); } catch (e) { }
      if (k === "조직목록해시") st.orgListHash = String(v);
    });
    st.log = sh["기록"].map(function (r) { return { t: str(r["시각"]), m: str(r["내용"]) }; });
    var keep = {}; wb.SheetNames.forEach(function (n) { if (KNOWN.indexOf(n) < 0) keep[n] = wb.Sheets[n]; });
    return { state: st, extra: keep, migrated: mg.changed, from: mg.from, ver: raw.ver };
  }
  var KNOWN_COLS = {
    "조직": ["ID", "레벨", "상위ID", "소속코드", "순번", "폐지"], "직급": ["ID", "순번", "폐지"], "직무": ["ID", "순번", "폐지"],
    "분류기준": ["ID", "이름", "순번", "시작월", "끝월", "단위"]
  };
  /* 프로그램이 모르는 열은 지우지 않고 그대로 들고 있다가 다시 씀 */
  function extraCols(r, sheet) { var k = KNOWN_COLS[sheet] || [], x = {}; Object.keys(r).forEach(function (h) { if (k.indexOf(h) < 0) x[h] = r[h]; }); return x; }
  function withExtra(sheet, head, rows, ents) {
    var xs = []; ents.forEach(function (e) { Object.keys(e._x || {}).forEach(function (h) { if (xs.indexOf(h) < 0 && head.indexOf(h) < 0) xs.push(h); }); });
    return [head.concat(xs)].concat(rows.map(function (r, i) { return r.concat(xs.map(function (h) { return (ents[i]._x || {})[h] === undefined ? "" : ents[i]._x[h]; })); }));
  }
  function sheet(aoa, widths) { var ws = XLSX.utils.aoa_to_sheet(aoa); if (widths) ws["!cols"] = widths.map(function (w) { return { wch: w }; }); return ws; }
  function toWorkbook() {
    var wb = XLSX.utils.book_new();
    function add(n, aoa, w) { XLSX.utils.book_append_sheet(wb, sheet(aoa, w), n); }
    add("정보", [["항목", "값"], ["형식", Migrate.FMT], ["저장", new Date().toLocaleString("ko-KR")], ["프로그램", "인력현황 관리"], ["프로그램버전", APP_VER]], [12, 24]);
    S.org.forEach(function (o, i) { o.ord = i + 1; });
    add("조직", withExtra("조직", KNOWN_COLS["조직"], S.org.map(function (o) { return [o.id, o.lv, o.p || "", o.code || "", o.ord, o.dead ? "Y" : ""]; }), S.org), [8, 6, 8, 10, 6, 6]);
    var vr = []; S.org.forEach(function (o) { o.v.forEach(function (v) { vr.push([o.id, v.n, v.nm, v.from, v.to, v.src, v.note]); }); });
    add("조직버전", [["ID", "버전", "이름", "시작일", "종료일", "출처", "메모"]].concat(vr), [8, 6, 28, 11, 11, 22, 30]);
    S.grd.forEach(function (o, i) { o.ord = i + 1; });
    add("직급", withExtra("직급", KNOWN_COLS["직급"], S.grd.map(function (o) { return [o.id, o.ord, o.dead ? "Y" : ""]; }), S.grd), [8, 6, 6]);
    vr = []; S.grd.forEach(function (o) { o.v.forEach(function (v) { vr.push([o.id, v.n, v.nm, v.code || "", v.from, v.to, v.src, v.note]); }); });
    add("직급버전", [["ID", "버전", "이름", "직급코드", "시작일", "종료일", "출처", "메모"]].concat(vr), [8, 6, 14, 10, 11, 11, 22, 30]);
    S.job.forEach(function (o, i) { o.ord = i + 1; });
    add("직무", withExtra("직무", KNOWN_COLS["직무"], S.job.map(function (o) { return [o.id, o.ord, o.dead ? "Y" : ""]; }), S.job), [8, 6, 6]);
    vr = []; S.job.forEach(function (o) { o.v.forEach(function (v) { vr.push([o.id, v.n, v.nm, v.from, v.to, v.src, v.note]); }); });
    add("직무버전", [["ID", "버전", "이름", "시작일", "종료일", "출처", "메모"]].concat(vr), [8, 6, 22, 11, 11, 22, 30]);
    add("분류기준", withExtra("분류기준", KNOWN_COLS["분류기준"], S.sets.map(function (s, i) { return [s.id, s.nm, i + 1, s.from || "", s.to || "", s.unit || "m"]; }), S.sets), [8, 24, 6, 9, 9, 6]);
    var rr = []; S.sets.forEach(function (s) { s.rows.forEach(function (r, i) { rr.push([s.id, r.id, i + 1, r.d, r.nm, r.pr ? "Y" : "", r.rest ? "Y" : "", JSON.stringify(r.cards)]); }); });
    add("분류줄", [["기준ID", "줄ID", "순번", "단계", "이름", "우선", "나머지", "카드"]].concat(rr), [8, 8, 6, 6, 24, 6, 6, 60]);
    add("메모", [["키", "내용"]].concat(Object.keys(S.memo).map(function (k) { return [k, S.memo[k]]; })), [30, 50]);
    add("설정", [["키", "값"], ["카드종류", JSON.stringify(S.cols)], ["번호", JSON.stringify(S.seq)], ["조직목록해시", S.orgListHash]], [14, 60]);
    add("기록", [["시각", "내용"]].concat(S.log.slice(-2000).map(function (l) { return [l.t, l.m]; })), [18, 80]);
    Object.keys(extra).forEach(function (n) { XLSX.utils.book_append_sheet(wb, extra[n], n); });
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  }
  /* ── 불러오기 · 저장 (데이터 보호) ──
     1) 프로그램 버전이 바뀌어 처음 열 때: 원본을 backup\기준정보_업데이트전_v옛버전_날짜.xlsx 로 먼저 복사
     2) 형식 변환이 필요할 때: backup\기준정보_변환전_v번호_날짜.xlsx 로 먼저 복사
     3) 하루 첫 저장 때: backup\기준정보_일별_날짜.xlsx (지우지 않음) · 30분마다: backup\기준정보_날짜_시각.xlsx (최근 30개)
     4) 저장 직후 다시 읽어 확인 · 이상하면 직전 파일로 되돌림
     5) 조직 · 직급 · 직무 · 분류 기준이 갑자기 0개가 되면 저장을 멈추고 물어봄 */
  var lastGood = null, loadedCnt = null, allowShrink = false, lastBackup = 0, dayDone = "";
  function counts(st) { st = st || S; var rows = 0; st.sets.forEach(function (x) { rows += x.rows.length; }); return { org: st.org.length, grd: st.grd.length, job: st.job.length, sets: st.sets.length, rows: rows, memo: Object.keys(st.memo).length }; }
  async function load() {
    var buf = await Store.read(P_DATA, MASTER);
    if (!buf) { S = blankState(); extra = {}; touch(); lastGood = null; loadedCnt = counts(); return { fresh: true }; }
    var wb = XLSX.read(buf, { type: "array", cellDates: true }), r = fromWorkbook(wb);
    if (r.newer) { newer = true; return { newer: true, from: r.from }; }
    var bytes = new Uint8Array(buf), upd = r.ver !== APP_VER;
    if (upd) await Store.write(P_BACKUP, "기준정보_업데이트전_v" + r.ver + "_" + U.stamp() + ".xlsx", bytes);
    if (r.migrated) await Store.write(P_BACKUP, "기준정보_변환전_v" + r.from + "_" + U.stamp() + ".xlsx", bytes);
    S = r.state; extra = r.extra; touch(); lastGood = bytes; loadedCnt = counts();
    return { migrated: r.migrated, from: r.from, updated: upd ? r.ver : null };
  }
  function shrunk() {
    if (allowShrink || !loadedCnt) return null; var c = counts(), bad = [];
    [["org", "조직"], ["grd", "직급"], ["job", "직무"], ["sets", "분류 기준"]].forEach(function (k) { if (loadedCnt[k[0]] > 0 && c[k[0]] === 0) bad.push(k[1] + " " + loadedCnt[k[0]] + "개 → 0개"); });
    if (loadedCnt.rows >= 10 && c.rows < loadedCnt.rows * 0.5) bad.push("분류 줄 " + loadedCnt.rows + "개 → " + c.rows + "개");
    return bad.length ? bad : null;
  }
  async function save() {
    if (newer) throw new Error("새 버전 프로그램으로 저장된 파일이라 이 프로그램으로는 저장하지 않습니다");
    var sh = shrunk(); if (sh) { var e = new Error("SHRINK"); e.detail = sh; throw e; }
    var day = U.today().replace(/-/g, "");
    if (dayDone !== day && lastGood) {
      var dn = "기준정보_일별_" + day + ".xlsx", have = await Store.list(P_BACKUP);
      if (have.indexOf(dn) < 0) await Store.write(P_BACKUP, dn, lastGood);
      dayDone = day;
    }
    if (Date.now() - lastBackup > 30 * 60 * 1000 && lastGood) {
      await Store.write(P_BACKUP, "기준정보_" + U.stamp() + ".xlsx", lastGood); lastBackup = Date.now(); await prune();
    }
    var bytes = toWorkbook(), want = counts();
    await Store.write(P_DATA, MASTER, bytes);
    /* 다시 읽어 확인 */
    try {
      var back = await Store.read(P_DATA, MASTER), chk = fromWorkbook(XLSX.read(back, { type: "array", cellDates: true })), got = counts(chk.state);
      if (got.org !== want.org || got.grd !== want.grd || got.job !== want.job || got.sets !== want.sets || got.rows !== want.rows) throw new Error("저장 확인 불일치");
    } catch (err) {
      if (lastGood) await Store.write(P_DATA, MASTER, lastGood);
      throw new Error("저장한 파일을 다시 읽어 보니 내용이 맞지 않아 직전 파일로 되돌렸습니다 (" + (err.message || err) + ")");
    }
    lastGood = bytes; loadedCnt = want; allowShrink = false;
  }
  async function prune() {
    var b = (await Store.list(P_BACKUP)).filter(function (n) { return /^기준정보_\d{8}_\d{4}\.xlsx$/.test(n); }).sort();
    for (var i = 0; i < b.length - 30; i++) await Store.remove(P_BACKUP, b[i]);
  }
  async function backups() {
    var names = (await Store.list(P_BACKUP)).filter(function (n) { return /^기준정보_.*\.xlsx$/.test(n); }), out = [];
    for (var i = 0; i < names.length; i++) {
      var n = names[i], m = /(\d{8})(?:_(\d{4}))?\.xlsx$/.exec(n), st = m ? m[1] + (m[2] || "0000") : "0", c = null;
      try { var r = fromWorkbook(XLSX.read(await Store.read(P_BACKUP, n), { type: "array", cellDates: true })); if (!r.newer) c = counts(r.state); } catch (e) { }
      out.push({ name: n, stamp: st, cnt: c });
    }
    return out.sort(function (a, b) { return a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0; });
  }
  async function restore(name) {
    var buf = await Store.read(P_BACKUP, name); if (!buf) throw new Error("백업 파일을 읽지 못했습니다");
    var r = fromWorkbook(XLSX.read(buf, { type: "array", cellDates: true })); if (r.newer) throw new Error("새 버전 프로그램 형식이라 되돌릴 수 없습니다");
    var cur = await Store.read(P_DATA, MASTER); if (cur) await Store.write(P_BACKUP, "기준정보_되돌리기전_" + U.stamp() + ".xlsx", new Uint8Array(cur));
    await Store.write(P_DATA, MASTER, new Uint8Array(buf));
    return load();
  }
  function log(m) { S.log.push({ t: new Date().toLocaleString("ko-KR"), m: m }); if (S.log.length > 2000) S.log.shift(); }

  /* ── 실행 취소 ── */
  var UNDO = [], REDO = [];
  function snapState() { return JSON.stringify(S); }
  function begin() { UNDO.push(snapState()); if (UNDO.length > 100) UNDO.shift(); REDO = []; }
  function undo() { if (!UNDO.length) return false; REDO.push(snapState()); S = JSON.parse(UNDO.pop()); touch(); return true; }
  function redo() { if (!REDO.length) return false; UNDO.push(snapState()); S = JSON.parse(REDO.pop()); touch(); return true; }

  function exportMaster() { return toWorkbook(); }

  return {
    P_ROSTER: P_ROSTER, P_ORDERS: P_ORDERS, P_ORGLIST: P_ORGLIST, P_DATA: P_DATA, P_BACKUP: P_BACKUP, LVN: LVN, PRIVATE: PRIVATE,
    get S() { return S; }, get FILES() { return FILES; }, get MONTHS() { return MONTHS; }, get HEADERS() { return HEADERS; }, get newer() { return newer; },
    nid: nid, nm: nm, list: list, byId: byId, kids: kids, path: path, desc: desc, touch: touch, bump: bump, R: R,
    findOrg: findOrg, findGrd: findGrd, findJob: findJob, scanFiles: scanFiles, loadAll: loadAll, issues: issues, issueCount: issueCount, latestFile: latestFile, snap: snap, fileOfMonth: fileOfMonth,
    ctype: ctype, cval: cval, attr: attr, cardOk: cardOk, fltOk: fltOk, hit: hit, typeName: typeName, cardLabel: cardLabel, valLabel: valLabel, fltLabel: fltLabel,
    isPar: isPar, kidsIdx: kidsIdx, ancIdx: ancIdx, assign: assign, clearCache: clearCache,
    readOrgList: readOrgList, autoSetup: autoSetup, defaultSets: defaultSets, scanUnmatched: scanUnmatched,
    load: load, save: save, log: log, backups: backups, restore: restore, counts: counts, APP_VER: APP_VER, allowShrink: function () { allowShrink = true; }, begin: begin, undo: undo, redo: redo, exportMaster: exportMaster,
    reset: function () { FILES = []; MONTHS = []; SNAP = {}; }
  };
})();
