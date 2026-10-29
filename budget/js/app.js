/* 사업비 관리 프로그램 — 사업비 계획 화면 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ---------- 상태 ----------
     S.cat  : 분류 트리 (기준정보.xlsx, 모든 연도 공통). 배열 순서 = 순번
              대분류 › 중분류 › 소분류(선택). 소분류가 없는 중분류는 그 자체가 계정, 있으면 소분류가 계정
              계정마다 연결된 더존 과목 dz:[{code, name}]
     S.plan : 이 연도의 계정별 입력값 {계정 ID: {prev, meth, a, b, c, split, sv, memo, out}}  (out = 계획 외)
     S.rows : 화면용 (분류 순서대로 사용 중인 계정 + 입력값) — 매번 다시 만듦. S.allRows 는 사용 안 함 포함
     S.lock : 계획 마감 상태 {state: draft|closed|open, rounds:[{n, closedAt, openedAt, reason, total, snap}]}
     S.ver  : 분류 버전 이력 {list:[{v, t, kind, sum, memo}], snaps:{v: 그때 분류 트리}} */
  var S = {
    year: null, years: [], settings: { dispUnit: "천원", rndUnit: "천원", rndMode: "반올림" }, cat: [], plan: {}, rows: [], allRows: [], log: [],
    lock: { state: "draft", rounds: [] }, ver: { list: [], snaps: {} }, exclude: []
  };
  var UI = { sel: null, collapsed: {}, nav: { t: "", m: "", s: "" }, onlyWarn: false, search: "", cell: null, sort: null, filters: {}, freeze: "acc", multi: {} };
  var undoStack = [], redoStack = [];
  var saveTimer = null, saving = false, savePending = false, saveFailed = false, masterDirty = false;
  var seq = 0; // 새 ID 번호
  var yearLocks = {}; // {연도: {계정 ID: true}} — 올해 이후 마감된 연도에서 금액이 있는 계정

  /* ---------- 분류 트리 ---------- */
  function isLeafMid(m) { return !m.kids || !m.kids.length; }
  // fn(대분류, 중분류, 소분류|null, 계정)
  function eachLeaf(cat, fn) {
    cat.forEach(function (t) {
      t.kids.forEach(function (m) {
        if (isLeafMid(m)) fn(t, m, null, m);
        else m.kids.forEach(function (s) { fn(t, m, s, s); });
      });
    });
  }
  function findLeaf(id, cat) {
    var hit = null;
    eachLeaf(cat || S.cat, function (t, m, s, lf) { if (!hit && lf.id === String(id)) hit = { top: t, mid: m, sub: s, leaf: lf }; });
    return hit;
  }
  function leafPath(h) { return h.top.name + " › " + h.mid.name + (h.sub ? " › " + h.sub.name : ""); }
  function leafIds(cat) { var o = {}; eachLeaf(cat, function (t, m, s, lf) { o[lf.id] = lf; }); return o; }
  function newId(p) { seq++; return p + seq; }
  function ensureIds(cat) {
    var max = seq;
    var scan = function (x) { var n = /^[GMA](\d+)$/.exec(x.id || ""); if (n) max = Math.max(max, parseInt(n[1], 10)); };
    cat.forEach(function (t) { scan(t); t.kids.forEach(function (m) { scan(m); (m.kids || []).forEach(scan); }); });
    seq = max;
    cat.forEach(function (t) {
      if (!t.id) t.id = newId("G");
      t.kids.forEach(function (m) {
        if (!m.id) m.id = newId("M");
        if (!m.kids) m.kids = [];
        if (!m.dz) m.dz = [];
        if (m.use === undefined) m.use = true;
        m.kids.forEach(function (s) { if (!s.id) s.id = newId("A"); if (!s.dz) s.dz = []; if (s.use === undefined) s.use = true; });
      });
    });
  }
  function leafCount(cat) { var n = 0; eachLeaf(cat, function () { n++; }); return n; }
  function topBy(name, cat) { return (cat || S.cat).filter(function (t) { return t.name === name; })[0] || null; }
  function midBy(top, name) { return top ? top.kids.filter(function (m) { return m.name === name; })[0] || null : null; }
  function catCounts(cat) {
    var m = 0, s = 0, d = 0;
    cat.forEach(function (t) { m += t.kids.length; t.kids.forEach(function (x) { s += x.kids.length; }); });
    eachLeaf(cat, function (t, mm, ss, lf) { d += lf.dz.length; });
    return "대 " + cat.length + " / 중 " + m + (s ? " / 소 " + s : "") + " / 더존 " + d;
  }

  // 기본 분류 (js/base.js: 내부 자료 작성용 서식 + 더존 계정코드)
  function baseCat() {
    var cat = [];
    (window.BASE_CAT || []).forEach(function (x) {
      var t = topBy(x[0], cat);
      if (!t) { t = { id: "", name: x[0], kids: [] }; cat.push(t); }
      t.kids.push({ id: "", name: x[1], use: true, kids: [], dz: x[2].map(function (d) { return { code: d[0], name: d[1] }; }) });
    });
    return cat;
  }

  /* ---------- 더존 과목 ---------- */
  function nm(s) { return String(s === undefined || s === null ? "" : s).replace(/\s+/g, ""); }
  function dzSame(a, b) { return !!((a.code && b.code && a.code === b.code) || (nm(a.name) && nm(a.name) === nm(b.name))); }
  function dzText(d) { return d.code ? "[" + d.code + "]" + (d.name || "") : d.name; }
  function dzShort(list) {
    if (!list || !list.length) return "";
    return (list[0].code || list[0].name) + (list.length > 1 ? " 외 " + (list.length - 1) : "");
  }
  // "[81101]연차휴가보상금" · "81101 연차휴가보상금" · "81101" · "연차휴가보상금"
  function parseDz(v) {
    v = String(v === undefined || v === null ? "" : v).trim();
    if (!v) return null;
    var m = /^\[?(\d{3,})\]?\s*(.*)$/.exec(v);
    if (m) return { code: m[1], name: m[2].trim() };
    return { code: "", name: v };
  }
  function findDz(cat, d, exceptLeaf) {
    var hit = null;
    eachLeaf(cat, function (t, m, s, lf) {
      if (hit || lf === exceptLeaf) return;
      lf.dz.forEach(function (x) { if (!hit && dzSame(x, d)) hit = { top: t, mid: m, sub: s, leaf: lf, dz: x }; });
    });
    return hit;
  }
  // 이미 아는 더존 과목 (기본 분류 + 지금 분류) — 코드나 이름 하나만 넣어도 나머지를 채움
  function knownDz() {
    var out = [], seen = {};
    var add = function (code, name) { var k = code ? "C" + code : "N" + nm(name); if (!seen[k]) { seen[k] = 1; out.push({ code: code, name: name }); } };
    eachLeaf(S.cat, function (t, m, s, lf) { lf.dz.forEach(function (d) { add(d.code, d.name); }); });
    (window.BASE_CAT || []).forEach(function (x) { x[2].forEach(function (d) { add(d[0], d[1]); }); });
    (window.DZ_ACCOUNTS || []).forEach(function (x) { add(x[0], x[1]); });
    return out;
  }
  function completeDz(d) {
    var k = knownDz();
    if (d.code && !d.name) k.forEach(function (x) { if (x.code === d.code && x.name) d.name = x.name; });
    if (!d.code && d.name) k.forEach(function (x) { if (!d.code && x.code && nm(x.name) === nm(d.name)) d.code = x.code; });
    return d;
  }

  /* ---------- 분류 버전 비교 ---------- */
  function catIndex(cat) {
    var idx = { tops: {}, mids: {}, subs: {}, leaves: {}, dz: {} };
    cat.forEach(function (t, ti) {
      idx.tops[t.id] = { name: t.name, i: ti };
      t.kids.forEach(function (m, mi) {
        idx.mids[m.id] = { name: m.name, top: t.id, path: t.name + " › " + m.name, i: mi };
        if (isLeafMid(m)) leaf(m, t.name + " › " + m.name);
        else m.kids.forEach(function (s, si) {
          idx.subs[s.id] = { name: s.name, mid: m.id, path: t.name + " › " + m.name + " › " + s.name, i: si };
          leaf(s, t.name + " › " + m.name + " › " + s.name);
        });
      });
    });
    function leaf(lf, path) {
      idx.leaves[lf.id] = { path: path, use: lf.use !== false };
      lf.dz.forEach(function (d) { idx.dz[d.code ? "C" + d.code : "N" + nm(d.name)] = { label: dzText(d), leaf: lf.id, path: path }; });
    }
    return idx;
  }
  // 결과: [{k: 추가|삭제|변경|이동|연결|해제|순번, what, before, after}]
  function diffCat(A, B) {
    var a = catIndex(A), b = catIndex(B), out = [], ord = 0;
    var push = function (k, what, before, after) { out.push({ k: k, what: what, before: before || "", after: after || "" }); };
    Object.keys(b.tops).forEach(function (id) {
      var x = a.tops[id], y = b.tops[id];
      if (!x) push("추가", "대분류", "", y.name);
      else { if (x.name !== y.name) push("변경", "대분류 이름", x.name, y.name); if (x.i !== y.i) ord++; }
    });
    Object.keys(a.tops).forEach(function (id) { if (!b.tops[id]) push("삭제", "대분류", a.tops[id].name, ""); });
    Object.keys(b.mids).forEach(function (id) {
      var x = a.mids[id], y = b.mids[id];
      if (!x) push("추가", "중분류", "", y.path);
      else {
        if (x.top !== y.top) push("이동", "중분류", x.path, y.path);
        else if (x.name !== y.name) push("변경", "중분류 이름", x.path, y.path);
        else if (x.i !== y.i) ord++;
      }
    });
    Object.keys(a.mids).forEach(function (id) { if (!b.mids[id]) push("삭제", "중분류", a.mids[id].path, ""); });
    Object.keys(b.subs).forEach(function (id) {
      var x = a.subs[id], y = b.subs[id];
      if (!x) push("추가", "소분류", "", y.path);
      else {
        if (x.mid !== y.mid) push("이동", "소분류", x.path, y.path);
        else if (x.name !== y.name) push("변경", "소분류 이름", x.path, y.path);
        else if (x.i !== y.i) ord++;
      }
    });
    Object.keys(a.subs).forEach(function (id) { if (!b.subs[id]) push("삭제", "소분류", a.subs[id].path, ""); });
    Object.keys(b.leaves).forEach(function (id) {
      var x = a.leaves[id], y = b.leaves[id];
      if (x && x.use !== y.use) push("변경", "사용", x.path + (x.use ? " (사용)" : " (사용 안 함)"), y.path + (y.use ? " (사용)" : " (사용 안 함)"));
    });
    Object.keys(b.dz).forEach(function (k) {
      var x = a.dz[k], y = b.dz[k];
      if (!x) push("연결", "더존 " + y.label, "", y.path);
      else if (x.leaf !== y.leaf) push("이동", "더존 " + y.label, x.path, y.path);
    });
    Object.keys(a.dz).forEach(function (k) { if (!b.dz[k]) push("해제", "더존 " + a.dz[k].label, a.dz[k].path, ""); });
    if (ord) push("순번", "순번 변경", "", ord + "곳");
    return out;
  }
  function summarize(d) {
    var c = {};
    d.forEach(function (x) { c[x.k] = (c[x.k] || 0) + 1; });
    return ["추가", "삭제", "변경", "이동", "연결", "해제"].filter(function (k) { return c[k]; }).map(function (k) { return k + " " + c[k]; })
      .concat(c["순번"] ? ["순번 변경"] : []).join(" · ");
  }

  /* ---------- 분류 버전 이력 ---------- */
  var verSession = {}; // 이번 실행에서 만든 버전 {v: {ts, memos}}
  function latestVer() { var l = S.ver.list; return l.length ? l[l.length - 1] : null; }
  // 분류가 바뀔 때마다 버전 하나. '계획 화면'에서 연달아 바꾼 것(10분 안)은 한 버전으로 묶음
  function addVersion(kind, memo) {
    var list = S.ver.list, last = latestVer(), now = Date.now();
    var vs = last && verSession[last.v];
    if (last && kind === "계획 화면" && last.kind === "계획 화면" && vs && now - vs.ts < 10 * 60000) {
      var prev = list.length > 1 ? S.ver.snaps[list[list.length - 2].v] : null;
      var d0 = prev ? diffCat(prev, S.cat) : null;
      if (d0 && !d0.length) { list.pop(); delete S.ver.snaps[last.v]; delete verSession[last.v]; masterDirty = true; return; }
      if (memo && vs.memos.indexOf(memo) < 0) vs.memos.push(memo);
      last.t = Store.stamp(); last.sum = d0 ? summarize(d0) : last.sum;
      last.memo = vs.memos.slice(0, 3).join(" / ") + (vs.memos.length > 3 ? " 외 " + (vs.memos.length - 3) + "건" : "");
      S.ver.snaps[last.v] = clone(S.cat);
      vs.ts = now;
      masterDirty = true;
      return;
    }
    var base = last ? S.ver.snaps[last.v] : null, d = base ? diffCat(base, S.cat) : null;
    if (base && !d.length) return;
    var v = last ? last.v + 1 : 1;
    list.push({ v: v, t: Store.stamp(), kind: kind, sum: d ? summarize(d) : "처음 기록 · " + catCounts(S.cat), memo: memo || "" });
    S.ver.snaps[v] = clone(S.cat);
    verSession[v] = { ts: now, memos: memo ? [memo] : [] };
    masterDirty = true;
  }

  /* ---------- 계획 마감 ---------- */
  function roundLabel(n) { return Store.roundLabel(n); }
  function isClosed() { return !!S.year && S.lock.state === "closed"; }
  function isChanging() { return !!S.year && S.lock.state === "open"; }
  function lastClosed() { var r = S.lock.rounds; for (var i = r.length - 1; i >= 0; i--) if (r[i].closedAt) return r[i]; return null; }
  function curRound() { var r = S.lock.rounds; return r.length ? r[r.length - 1] : null; }
  function locksOf(lock) {
    var out = {};
    if (!lock || lock.state !== "closed") return out;
    var rd = null;
    lock.rounds.forEach(function (r) { if (r.closedAt) rd = r; });
    if (rd) Object.keys(rd.snap).forEach(function (id) { if (rd.snap[id].plan) out[id] = true; });
    return out;
  }
  // 이 계정을 다른 분류로 옮기거나 지우면 안 되는 이유 (올해 이후 마감된 계획에 금액이 있음)
  function lockReason(id) {
    var ys = [];
    if (isClosed()) { var e = lastClosed().snap[id]; if (e && e.plan) ys.push(S.year); }
    Object.keys(yearLocks).forEach(function (y) { if (+y !== S.year && yearLocks[y][id]) ys.push(+y); });
    return ys.length ? ys.sort().join(" · ") + "년 마감 계획에 금액이 있습니다" : "";
  }
  function lockReasonNode(node, lv) {
    var ids = lv === 1 ? [] : lv === 2 ? (isLeafMid(node) ? [node.id] : node.kids.map(function (s) { return s.id; })) : [node.id];
    if (lv === 1) node.kids.forEach(function (m) { if (isLeafMid(m)) ids.push(m.id); else m.kids.forEach(function (s) { ids.push(s.id); }); });
    for (var i = 0; i < ids.length; i++) { var r = lockReason(ids[i]); if (r) return r; }
    return "";
  }
  function anyLock() { return isClosed() || Object.keys(yearLocks).some(function (y) { return +y !== S.year && Object.keys(yearLocks[y]).length; }); }
  function loadYearLocks() {
    var thisY = new Date().getFullYear();
    yearLocks = {};
    return Promise.all(S.years.filter(function (y) { return y >= thisY; }).map(function (y) {
      return Store.load(y).then(function (st) { yearLocks[y] = locksOf(st.lock); }, function () { /* 못 읽으면 건너뜀 */ });
    }));
  }
  function keepYearLock() { if (S.year && S.year >= new Date().getFullYear()) yearLocks[S.year] = locksOf(S.lock); }
  // 마감 상태에서는 계획 숫자를 바꾸는 일을 막음
  function guardClosed(what) {
    if (!isClosed()) return false;
    toast("🔒 " + S.year + "년 계획은 마감되었습니다. " + (what || "바꾸려면") + " [계획 변경]을 먼저 여세요", true, 4000);
    return true;
  }

  function planFor(id) { return S.plan[id] || Calc.blankPlan(); }
  function deriveRows() {
    var rows = [], all = [];
    eachLeaf(S.cat, function (t, m, s, lf) {
      var p = planFor(lf.id);
      var r = { id: lf.id, l1: t.name, l2: m.name, l3: s ? s.name : "", name: lf.name, dz: lf.dz || [], use: lf.use !== false, out: !!p.out,
        prev: p.prev, meth: p.meth, a: p.a, b: p.b, c: p.c, t: p.t || 0, auto: p.auto || "t", split: p.split, sv: p.sv.slice(), memo: p.memo, pm: (p.pm || []).slice() };
      all.push(r);
      if (r.use) rows.push(r);
    });
    S.rows = rows; S.allRows = all;
  }
  function rowBy(id) {
    for (var i = 0; i < S.rows.length; i++) if (S.rows[i].id === String(id)) return S.rows[i];
    return null;
  }
  function setPlan(id, d) {
    var old = S.plan[id], out = d.out !== undefined ? !!d.out : !!(old && old.out);
    var pm = d.pm !== undefined ? d.pm : old && old.pm || [];
    S.plan[id] = { prev: d.prev, meth: d.meth, a: d.a, b: d.b, c: d.c, t: d.t || 0, auto: d.auto || "t", split: d.split, sv: d.sv.slice(), memo: d.memo, pm: pm.slice() };
    if (out) S.plan[id].out = true;
  }
  function rowLabel(r) { return r.l3 ? r.l2 + " › " + r.l3 : r.l2; }

  function u(v, keepZero) { return Calc.fmtUnit(v, S.settings.dispUnit, keepZero); }
  function unitName() { return S.settings.dispUnit; }

  /* ---------- 변경 · 실행 취소 · 자동 저장 ---------- */
  function snapshot() { return JSON.stringify({ cat: S.cat, plan: S.plan, settings: S.settings }); }
  function restoreSnap(s) { var o = JSON.parse(s); S.cat = o.cat; S.plan = o.plan; S.settings = o.settings; masterDirty = true; }

  // opts.master: 분류(기준정보)도 바뀌는 변경 → 분류 버전 기록 (opts.verKind, opts.verMemo)
  function change(fn, logMsg, opts) {
    opts = opts || {};
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    fn();
    if (opts.master) { masterDirty = true; addVersion(opts.verKind || "계획 화면", opts.verMemo !== undefined ? opts.verMemo : logMsg); }
    if (logMsg) addLog(logMsg);
    deriveRows();
    renderAll();
    scheduleSave();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restoreSnap(undoStack.pop());
    addVersion("계획 화면", "실행 취소");
    addLog("실행 취소");
    deriveRows(); renderAll(); scheduleSave(); toast("실행 취소했습니다");
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restoreSnap(redoStack.pop());
    addVersion("계획 화면", "다시 실행");
    addLog("다시 실행");
    deriveRows(); renderAll(); scheduleSave(); toast("다시 실행했습니다");
  }
  function clearUndo() { undoStack = []; redoStack = []; }
  function addLog(m) {
    S.log.push({ t: Store.stamp(), m: m });
    if (S.log.length > 2000) S.log.shift();
  }

  function scheduleSave() {
    if (!S.year && !masterDirty) return;
    savePending = true;
    setSave("saving", "저장 대기…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 700);
  }
  function doSave() {
    clearTimeout(saveTimer);
    if (saving) { saveTimer = setTimeout(doSave, 300); return Promise.resolve(); }
    saving = true; savePending = false;
    setSave("saving", "저장 중…");
    var wasMaster = masterDirty;
    masterDirty = false;
    var job = (wasMaster ? Store.saveMaster(S.cat, S.ver, S.exclude) : Promise.resolve())
      .then(function () { return S.year ? Store.save(S) : Store.stamp(); });
    return job.then(function (t) {
      saving = false; saveFailed = false;
      setSave("ok", "자동 저장됨 " + t.slice(11, 16));
      if (savePending) scheduleSave();
    }, function (e) {
      saving = false; saveFailed = true; savePending = true;
      if (wasMaster) masterDirty = true;
      setSave("error", "저장 실패 — 클릭해서 다시 저장");
      toast("저장하지 못했습니다. 엑셀에서 data 폴더의 파일을 열어 두었다면 닫은 뒤 다시 저장하세요. (" + (e && e.name || e) + ")", true, 6000);
    });
  }
  function flushSave() {
    if (savePending || saving) return doSave();
    return Promise.resolve();
  }
  function setSave(kind, text) {
    var el = $("saveState");
    el.className = "saved" + (kind === "saving" ? " saving" : kind === "error" ? " error" : kind === "off" ? " off" : "");
    $("saveText").textContent = text;
    $("stState").textContent = kind === "saving" ? "저장 중" : kind === "error" ? "저장 실패" : "준비";
    // 제목 줄 캐릭터: 저장 중엔 바쁘게, 실패하면 고개 흔들기
    $("app").classList.toggle("saving", kind === "saving");
    $("app").classList.toggle("save-error", kind === "error");
  }

  /* ---------- 계산 결과 묶음 ---------- */
  function computeAll() {
    var groups = [], tot = { prev: 0, plan: 0, before: 0, m: new Array(12).fill(0) }, missing = 0, checks = 0, changed = 0, outs = 0;
    var base = isChanging() ? lastClosed() : null;
    S.rows.forEach(function (r) {
      if (!groups.length || groups[groups.length - 1].name !== r.l1) groups.push({ name: r.l1, rows: [], prev: 0, plan: 0, before: 0, m: new Array(12).fill(0) });
      var g = groups[groups.length - 1];
      g.rows.push(r);
      r._c = Calc.compute(r, S.settings);
      if (base) {
        var e = base.snap[r.id];
        r._before = e ? e.plan : 0;
        r._chg = Math.round(r._c.plan - r._before) !== 0 || (e ? e.months.some(function (v, i) { return Math.round(v - r._c.months[i]) !== 0; }) : !!r._c.plan);
        g.before += r._before;
        if (r._chg) changed++;
      }
      g.prev += Calc.num(r.prev); g.plan += r._c.plan;
      r._c.months.forEach(function (v, i) { g.m[i] += v; });
      if (r.out) outs++;
      else { if (r._c.missing) missing++; if (r._c.check) checks++; }
    });
    groups.forEach(function (g) {
      tot.prev += g.prev; tot.plan += g.plan; tot.before += g.before;
      g.m.forEach(function (v, i) { tot.m[i] += v; });
    });
    return { groups: groups, tot: tot, missing: missing, checks: checks, changed: changed, outs: outs, base: base };
  }
  function needsCheck(r) { return !r.out && (r._c.missing || !!r._c.check); }

  function visible(r) {
    if (UI.nav.t && r.l1 !== UI.nav.t) return false;
    if (UI.nav.m && r.l2 !== UI.nav.m) return false;
    if (UI.nav.s && r.l3 !== UI.nav.s) return false;
    if (UI.onlyWarn && !needsCheck(r)) return false;
    if (!filterOk(r)) return false;
    if (UI.search) {
      var hay = [r.l1, r.l2, r.l3, r.memo].concat(r.dz.map(dzText)).join(" ").toLowerCase();
      if (hay.indexOf(UI.search.toLowerCase()) < 0) return false;
    }
    return true;
  }

  /* ---------- 그리기 ---------- */
  var LAST = null;
  function renderAll() {
    LAST = computeAll();
    if (MODE === "exec") { renderExec(); renderLock(); $("fileName").textContent = S.year ? "— " + Store.execName(S.year) : ""; return; }
    renderTable(LAST); renderSummary(LAST); renderNav(LAST); renderBars(); renderStatus(LAST); renderLock(); renderTools();
    $("fileName").textContent = S.year ? "— " + Store.fileName(S.year) : "";
    $("btnUndo").disabled = !undoStack.length;
    $("btnRedo").disabled = !redoStack.length;
    $("btnWarn").classList.toggle("on", UI.onlyWarn);
    var anyOpen = LAST.groups.some(function (g) { return !UI.collapsed[g.name]; });
    $("foldText").textContent = anyOpen ? "모두 접기" : "모두 펼치기";
  }

  // 제목 줄 상태 표시 + 마감 버튼
  function renderLock() {
    var st = S.year ? S.lock.state : "", lc = lastClosed(), cur = curRound();
    var pill = $("lockPill");
    pill.hidden = !S.year;
    pill.className = "lockpill " + st;
    pill.textContent = st === "closed" ? "🔒 마감 · " + roundLabel(lc.n) : st === "open" ? "✎ " + roundLabel(cur.n) + " 중" : "작성 중";
    pill.title = st === "closed" ? lc.closedAt + " 마감" : st === "open" ? "변경 시작 " + cur.openedAt + (cur.reason ? " · 사유: " + cur.reason : "") : "아직 마감하지 않은 계획";
    $("btnLock").hidden = st === "closed";
    $("lockText").innerHTML = st === "open" ? "변경<br>마감" : "계획<br>마감";
    $("btnChange").hidden = st !== "closed";
    $("btnCancelChg").hidden = st !== "open";
    $("btnRounds").disabled = !S.lock.rounds.length;
    $("tbl").classList.toggle("locked", st === "closed");
  }

  function yoyCell(v) {
    var cls = v === Infinity ? "up" : !isFinite(v) ? "flat" : v > 0.0005 ? "up" : v < -0.0005 ? "down" : "flat";
    var a = v === Infinity ? 1 : isFinite(v) ? Math.abs(v) : 0;
    if (a >= 0.3) cls += " big v2"; else if (a >= 0.1) cls += " v1"; // 변동폭 색: ±10% · ±30% 이상
    return '<td class="num yoy ' + cls + '" data-k="yoy">' + Calc.fmtPct(v) + "</td>";
  }

  /* 표 열: acc 계정 · prev 전년 · plan 계획 · before 변경 전 · yoy 증감률 · m0~m11 월 · note 비고 */
  function tableCols() {
    var c = ["acc", "prev", "plan"];
    if (isChanging()) c.push("before");
    c.push("yoy");
    for (var i = 0; i < 12; i++) c.push("m" + i);
    c.push("note");
    return c;
  }
  var COL_NAME = { acc: "계정", prev: "전년 실적", plan: "계획", before: "변경 전", yoy: "증감률", note: "비고" };
  function colName(k) { return COL_NAME[k] || (+k.slice(1) + 1) + "월"; }
  function colVal(r, k) {
    var c = r._c;
    if (k === "acc") return r.l1 + " " + rowLabel(r);
    if (k === "prev") return Calc.num(r.prev);
    if (k === "plan") return r.out || c.missing ? 0 : c.plan;
    if (k === "before") return r._before || 0;
    if (k === "yoy") return c.missing || r.out ? NaN : c.yoy;
    if (k === "note") return r.memo;
    return c.missing ? 0 : c.months[+k.slice(1)];
  }
  function groupVal(g, k) {
    if (k === "acc" || k === "note") return g.name;
    if (k === "prev") return g.prev;
    if (k === "plan") return g.plan;
    if (k === "before") return g.before;
    if (k === "yoy") return g.prev ? g.plan / g.prev - 1 : NaN;
    return g.m[+k.slice(1)];
  }
  function cmpVal(a, b) {
    if (typeof a === "string" || typeof b === "string") return String(a).localeCompare(String(b), "ko", { numeric: true });
    var na = isNaN(a), nb = isNaN(b);
    if (na || nb) return na === nb ? 0 : na ? 1 : -1; // 빈 값은 늘 맨 뒤
    return a === b ? 0 : a < b ? -1 : 1;
  }
  function filterOk(r) {
    var ks = Object.keys(UI.filters);
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i], f = UI.filters[k], v = colVal(r, k);
      if (k === "acc") {
        if (f.groups && f.groups.indexOf(r.l1) < 0) return false;
        if (f.text && (r.l1 + " " + rowLabel(r) + " " + r.dz.map(dzText).join(" ")).toLowerCase().indexOf(f.text.toLowerCase()) < 0) return false;
      } else if (k === "note") {
        if (f.op === "has" && !r.memo) return false;
        if (f.op === "empty" && r.memo) return false;
        if (f.op === "contains" && String(v).toLowerCase().indexOf(String(f.text || "").toLowerCase()) < 0) return false;
      } else if (k === "yoy") {
        var x = Calc.num(f.v) / 100;
        if (f.op === "up" && !(v === Infinity || v >= x)) return false;
        if (f.op === "down" && !(isFinite(v) && v <= -x)) return false;
        if (f.op === "abs" && !(v === Infinity || (isFinite(v) && Math.abs(v) >= x))) return false;
        if (f.op === "new" && v !== Infinity) return false;
      } else {
        if (f.op === "nonzero" && !v) return false;
        if (f.op === "zero" && v) return false;
        if (f.op === "pos" && !(v > 0)) return false;
        if (f.op === "neg" && !(v < 0)) return false;
        if (f.op === "gte" && !(v >= Calc.num(f.v))) return false;
        if (f.op === "lte" && !(v <= Calc.num(f.v))) return false;
      }
    }
    return true;
  }
  function filtering() { return !!(UI.nav.t || UI.onlyWarn || UI.search || Object.keys(UI.filters).length); }

  function renderTable(R) {
    var el = $("tbl");
    if (!S.year) { el.innerHTML = ""; return; }
    if (!S.rows.length) {
      el.innerHTML = '<div class="empty"><b>계획에 올릴 계정이 없습니다.</b><br>' +
        (leafCount(S.cat) ? "분류의 계정이 모두 '사용 안 함'입니다.<br>" : "먼저 <b>설정 › 분류 관리</b>에서 대분류 · 중분류를 등록하세요. 중분류(소분류를 만들면 소분류)가 계획 줄이 됩니다.<br>") +
        '<button class="btn primary" data-act="catMgr">분류 관리 열기</button> <button class="btn" data-act="addAcc">＋ 계정 추가</button></div>';
      return;
    }
    var y = S.year, h = [], showBefore = !!R.base, closed = isClosed(), sk = UI.sort && UI.sort.k, sd = UI.sort ? UI.sort.dir : 1;
    var mark = function (k) { return (sk === k ? '<span class="sorti">' + (sd > 0 ? "▲" : "▼") + "</span>" : "") + (UI.filters[k] ? '<span class="filti" title="필터 적용 중">⏷</span>' : ""); };
    h.push('<table class="plan"><thead><tr><th class="c-acc" data-k="acc">계정' + mark("acc") + '</th><th data-k="prev">' + (y - 1) + "년 실적" + mark("prev") + '</th><th data-k="plan">' + y + "년 계획" + mark("plan") + "</th>" +
      (showBefore ? '<th class="c-before" data-k="before">변경 전<br><small>' + roundLabel(R.base.n) + "</small>" + mark("before") + "</th>" : "") + '<th data-k="yoy">증감률' + mark("yoy") + "</th>");
    for (var i = 1; i <= 12; i++) h.push('<th data-k="m' + (i - 1) + '">' + i + "월" + mark("m" + (i - 1)) + "</th>");
    h.push('<th style="min-width:260px" data-k="note">비고' + mark("note") + "</th></tr></thead><tbody>");
    var shown = 0, filtered = filtering(), noDrag = filtered || !!UI.sort;
    var groups = R.groups.slice();
    if (UI.sort) groups.sort(function (a, b) { return sd * cmpVal(groupVal(a, sk), groupVal(b, sk)); });
    groups.forEach(function (g) {
      var rows = g.rows.filter(visible);
      if (!rows.length) return;
      if (UI.sort) rows.sort(function (a, b) { return sd * cmpVal(colVal(a, sk), colVal(b, sk)); });
      var shut = !!UI.collapsed[g.name] && !UI.search && !UI.onlyWarn;
      h.push('<tr class="grp" data-grp="' + esc(g.name) + '"' + (noDrag ? "" : ' draggable="true"') + '><td class="c-acc" data-k="acc">' + (noDrag ? "" : '<span class="grip ggrip" title="끌어서 대분류 순서 바꾸기">⋮⋮</span>') + '<span class="caret">' + (shut ? "▸" : "▾") + "</span>" + esc(g.name) +
        '<span class="cnt">' + g.rows.length + "</span></td>" +
        '<td class="num" data-k="prev">' + u(g.prev) + '</td><td class="num" data-k="plan">' + u(g.plan) + "</td>" +
        (showBefore ? '<td class="num c-before" data-k="before">' + u(g.before) + "</td>" : "") + yoyCell(g.prev ? g.plan / g.prev - 1 : NaN) +
        g.m.map(function (v, k) { return '<td class="num" data-k="m' + k + '">' + u(v) + "</td>"; }).join("") + '<td data-k="note"></td></tr>');
      if (shut) return;
      rows.forEach(function (r) {
        shown++;
        var c = r._c, sel = UI.sel === r.id, miss = c.missing && !r.out;
        var diffFlag = c.manualDiff && r.meth !== "수기" ? '<span class="flag infof" title="월 금액을 직접 고쳐서 산출 금액과 다릅니다">산출 대비 ' + (c.manualDiff > 0 ? "+" : "△") + u(Math.abs(c.manualDiff), true) + "</span>" : "";
        h.push('<tr class="acc' + (miss ? " missing" : "") + (r.out ? " out" : "") + (r._chg ? " chg" : "") + (sel ? " is-sel" : "") + (UI.multi[r.id] ? " is-multi" : "") + '" data-id="' + esc(r.id) + '"' + (noDrag ? "" : ' draggable="true"') + ">" +
          '<td class="c-acc" data-k="acc">' + (noDrag ? '<span class="grip off"></span>' : '<span class="grip" title="끌어서 순서 바꾸기">⋮⋮</span>') +
          (r.l3 ? '<span class="l2">' + esc(r.l2) + ' ›</span><span class="l3">' + esc(r.l3) + "</span>" : '<span class="l3">' + esc(r.l2) + "</span>") +
          (r.dz.length ? '<span class="erp" title="더존: ' + esc(r.dz.map(dzText).join(", ")) + '">' + esc(dzShort(r.dz)) + "</span>" : "") +
          (r.out ? '<span class="flag outf" title="마감 뒤에 생긴 계정 — 계획 없이 실적만 들어갑니다">계획 외</span>' : "") +
          (r._chg ? '<span class="flag chgf">변경</span>' : "") + diffFlag +
          (c.check && !r.out ? '<span class="flag" title="' + esc(c.check) + '">분할 확인</span>' : "") + "</td>" +
          '<td class="num" data-k="prev">' + u(r.prev) + "</td>" +
          '<td class="num plan-v" data-k="plan" title="' + (r.out ? "계획 외 계정" : closed ? "마감됨 — 클릭하면 산출 내용 보기" : "클릭해서 산출 입력") + '">' +
          (r.out ? '<span class="outv">-</span>' : c.missing ? '<span class="need">입력 필요</span>' :
            '<span class="pv">' + u(c.plan) + '</span><span class="badge ' + ({ "균등": "b-eq", "수기": "b-man", "비율": "b-rat" }[r.split]) + '">' + esc(r.split) + "</span>") + "</td>" +
          (showBefore ? '<td class="num c-before" data-k="before">' + u(r._before) + "</td>" : "") +
          (c.missing ? '<td class="num" data-k="yoy"></td>' : yoyCell(c.yoy)) +
          c.months.map(function (v, k) { return '<td class="num m ed' + (v === 0 && !c.missing ? " zero" : "") + (k === c.fixMonth && r.split !== "수기" ? " fixm" : "") + '" data-k="m' + k + '">' + (c.missing ? "" : u(v)) + "</td>"; }).join("") +
          '<td class="c-note ed" data-k="note">' + (r.memo ? '<span class="memo">' + esc(r.memo) + "</span>" : "") + "</td></tr>");
      });
    });
    var t = R.tot;
    h.push('<tr class="total"><td class="c-acc" data-k="acc">합계' + (filtered ? ' <span class="cnt">(전체 기준)</span>' : "") + '</td><td class="num" data-k="prev">' + u(t.prev) +
      '</td><td class="num" data-k="plan">' + u(t.plan) + "</td>" + (showBefore ? '<td class="num" data-k="before">' + u(t.before) + "</td>" : "") + yoyCell(t.prev ? t.plan / t.prev - 1 : NaN) +
      t.m.map(function (v, k) { return '<td class="num" data-k="m' + k + '">' + u(v) + "</td>"; }).join("") + '<td data-k="note"></td></tr>');
    h.push("</tbody></table>");
    if (!shown && filtered) h.push('<div class="empty">조건에 맞는 계정이 없습니다.</div>');
    var top = el.scrollTop, left = el.scrollLeft;
    el.innerHTML = h.join("");
    applyFreeze();
    markCell();
    el.scrollTop = top; el.scrollLeft = left;
  }

  // 틀 고정: 계정 열부터 UI.freeze 열까지 왼쪽에 붙임
  function applyFreeze() {
    var cols = tableCols(), upto = cols.indexOf(UI.freeze || "acc");
    if (upto < 1) return;
    var ths = $("tbl").querySelectorAll("thead th"), left = 0, lefts = {};
    for (var i = 0; i <= upto && i < ths.length; i++) { lefts[ths[i].getAttribute("data-k")] = left; left += ths[i].offsetWidth; }
    Object.keys(lefts).forEach(function (k) {
      if (k === "acc") return;
      $("tbl").querySelectorAll('[data-k="' + k + '"]').forEach(function (c) {
        c.classList.add("fz");
        if (k === cols[upto]) c.classList.add("fz-last");
        c.style.left = lefts[k] + "px";
      });
    });
  }
  function markCell() {
    var tb = $("tbl");
    tb.querySelectorAll("td.cur").forEach(function (x) { x.classList.remove("cur"); });
    if (!UI.cell) { $("cellEd").hidden = true; return; }
    var td = tb.querySelector('tr.acc[data-id="' + String(UI.cell.id).replace(/["\\]/g, "\\$&") + '"] td[data-k="' + UI.cell.k + '"]');
    if (td) td.classList.add("cur");
    placeEd();
  }
  function renderTools() {
    var bits = [], n = Object.keys(UI.filters).length;
    if (UI.sort) bits.push("정렬: " + colName(UI.sort.k) + (UI.sort.dir > 0 ? " ▲" : " ▼"));
    if (n) bits.push("필터 " + n + " (" + Object.keys(UI.filters).map(colName).join(", ") + ")");
    if (UI.freeze && UI.freeze !== "acc") bits.push("틀 고정: " + colName(UI.freeze) + "까지");
    var m = Object.keys(UI.multi).length;
    $("tblState").innerHTML = (m ? '<span class="chip on" data-multi-clear="1" title="누르면 선택 해제">' + m + "개 선택 ✕</span>" : "") +
      (bits.length ? '<span class="tstate">' + esc(bits.join(" · ")) + '</span><button class="btn sm" data-tbl-reset="1">모두 해제</button>' : "") +
      '<span class="vlegend" title="증감률 칸 색">변동 <i class="v1"></i>±10% <i class="v2"></i>±30%</span>';
  }

  function renderSummary(R) {
    var t = R.tot, y = S.year, d = t.plan - t.prev, n = S.rows.length - R.outs, done = n - R.missing;
    var yoy = t.prev ? t.plan / t.prev - 1 : NaN;
    var maxI = 0;
    t.m.forEach(function (v, i) { if (v > t.m[maxI]) maxI = i; });
    var lc = lastClosed(), sub;
    if (R.base) { var dd = t.plan - t.before; sub = roundLabel(R.base.n) + " " + u(t.before, true) + " · " + (dd >= 0 ? "+" : "") + u(dd, true); }
    else if (isClosed()) sub = roundLabel(lc.n) + " 마감 · " + lc.closedAt.slice(0, 10);
    else sub = ((y || 1) - 1) + "년 실적 " + u(t.prev, true);
    $("kpis").innerHTML = [
      '<div class="kpi kpi-plan"><div class="k-label">' + (y || "") + '년 계획 총액</div><div class="k-value">' + u(t.plan, true) + "<small>" + unitName() + '</small></div><div class="k-sub">' + sub + "</div></div>",
      '<div class="kpi"><div class="k-label">전년 대비</div><div class="k-value ' + (yoy > 0 ? "up" : yoy < 0 ? "down" : "") + '">' + (Calc.fmtPct(yoy) || "-") + '</div><div class="k-sub">증감액 ' + (d >= 0 ? "+" : "") + u(d, true) + " " + unitName() + "</div></div>",
      '<div class="kpi"><div class="k-label">입력 완료</div><div class="k-value">' + done + " / " + n + '<small>계정</small></div><div class="k-prog"><i style="width:' + (n ? done / n * 100 : 0).toFixed(1) + '%"></i></div><div class="k-sub">' +
        (R.missing ? R.missing + "개 계정 입력 필요" : "모두 입력됨") + (R.checks ? " · 분할 확인 " + R.checks : "") + (R.outs ? " · 계획 외 " + R.outs : "") + (R.base ? " · 변경 " + R.changed : "") + "</div></div>",
      '<div class="kpi"><div class="k-label">가장 큰 달</div><div class="k-value">' + (t.plan ? (maxI + 1) + "월" : "-") + '</div><div class="k-sub">' + (t.plan ? u(t.m[maxI], true) + " " + unitName() + " (월평균 " + u(t.plan / 12, true) + ")" : "") + "</div></div>"
    ].join("");
  }

  function renderBars() {
    var R = LAST, mx = 0;
    var gs = R.groups.slice().sort(function (a, b) { return b.plan - a.plan; });
    gs.forEach(function (g) { if (g.plan > mx) mx = g.plan; });
    $("cats").innerHTML = gs.slice(0, 6).map(function (g) {
      var share = R.tot.plan ? g.plan / R.tot.plan * 100 : 0;
      return '<div class="cat" title="' + esc(g.name) + " " + u(g.plan, true) + unitName() + '"><span class="cat-n">' + esc(g.name) +
        '</span><span class="cat-bar"><i style="width:' + (mx ? g.plan / mx * 100 : 0).toFixed(1) + '%"></i></span><span class="cat-v">' + share.toFixed(1) + "%</span></div>";
    }).join("") + (gs.length > 6 ? '<div class="cat"><span class="cat-n">외 ' + (gs.length - 6) + "개</span></div>" : "");
    var mm = Math.max.apply(null, R.tot.m.concat([1]));
    $("months").innerHTML = '<div class="mbars">' + R.tot.m.map(function (v, i) {
      return '<div class="mb" title="' + (i + 1) + "월 " + u(v, true) + unitName() + '"><i style="height:' + (Math.max(0, v) / mm * 100).toFixed(1) + '%"></i><span>' + (i + 1) + "</span></div>";
    }).join("") + "</div>";
  }

  // 탐색바: 대분류 · 중분류 · 소분류 드롭다운 (위 칸을 고르면 아래 칸 목록이 좁혀짐)
  function renderNav(R) {
    var opt = function (list, v, all) {
      return '<option value="">' + all + "</option>" + list.map(function (x) { return '<option value="' + esc(x) + '"' + (x === v ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("");
    };
    var uniq = function (f, rows) { var o = []; rows.forEach(function (r) { var v = f(r); if (v && o.indexOf(v) < 0) o.push(v); }); return o; };
    var rT = S.rows, rM = rT.filter(function (r) { return !UI.nav.t || r.l1 === UI.nav.t; }), rS = rM.filter(function (r) { return !UI.nav.m || r.l2 === UI.nav.m; });
    $("navT").innerHTML = opt(uniq(function (r) { return r.l1; }, rT), UI.nav.t, "대분류 전체");
    $("navM").innerHTML = opt(uniq(function (r) { return r.l2; }, rM), UI.nav.m, "중분류 전체");
    var subs = uniq(function (r) { return r.l3; }, rS);
    $("navS").innerHTML = opt(subs, UI.nav.s, subs.length ? "소분류 전체" : "소분류 없음");
    $("navS").disabled = !subs.length;
    ["navT", "navM", "navS"].forEach(function (k) { $(k).classList.toggle("on", !!$(k).value); });
    var w = R.missing + R.checks;
    $("btnWarnChip").hidden = !w;
    $("btnWarnChip").textContent = "확인 필요 " + w;
    $("btnWarnChip").classList.toggle("on", UI.onlyWarn);
  }


  function renderStatus(R) {
    $("stCount").textContent = S.year ? "계정 " + S.rows.length + " · 입력 필요 " + R.missing + (R.checks ? " · 분할 확인 " + R.checks : "") + (R.outs ? " · 계획 외 " + R.outs : "") : "";
    $("stSum").textContent = S.year ? "합계: " + u(R.tot.plan, true) + " " + unitName() : "";
    renderFbar();
  }

  function renderFbar() {
    var r = rowBy(UI.sel);
    if (!r || !r._c) { $("fRef").textContent = "-"; $("fVal").innerHTML = ""; $("stSel").textContent = ""; return; }
    var c = r._c, path = r.l1 + " › " + rowLabel(r);
    $("fRef").textContent = r.name;
    $("fRef").title = path;
    $("stSel").textContent = "선택: " + path + (r.dz.length ? " · 더존 " + r.dz.map(dzText).join(", ") : "");
    if (r.out) { $("fVal").innerHTML = '<span class="w">계획 외</span> — 마감 뒤에 생긴 계정이라 계획 없이 실적만 들어갑니다'; return; }
    if (c.missing) { $("fVal").innerHTML = '<span class="w">산출 방식이 없습니다</span>' + (isClosed() ? " — 마감 때 0원으로 확정됨" : " — 계획 칸을 누르거나 Enter 를 눌러 입력하세요 (월 칸에 바로 써도 됩니다)"); return; }
    $("fVal").innerHTML = esc(Calc.basisText(r, S.settings)) + "<em>=</em>" + u(c.plan, true) + " " + unitName() +
      " · " + esc(r.split) + " 분할" + (r.memo ? " · 메모: " + esc(r.memo) : "") + (c.check ? '<span class="w">' + esc(c.check) + "</span>" : "");
  }

  function select(id, scroll) {
    UI.sel = id;
    var el = $("tbl");
    var prev = el.querySelector("tr.is-sel");
    if (prev) prev.classList.remove("is-sel");
    var tr = el.querySelector('tr.acc[data-id="' + String(id).replace(/["\\]/g, "\\$&") + '"]');
    if (tr) {
      tr.classList.add("is-sel");
      if (scroll) tr.scrollIntoView({ block: "nearest" });
    }
    renderFbar();
  }
  function visibleIds() {
    return Array.prototype.map.call($("tbl").querySelectorAll("tr.acc"), function (tr) { return tr.getAttribute("data-id"); });
  }

  /* ---------- 알림 ---------- */
  var toastTimer = null;
  function toast(msg, err, ms) {
    var t = $("toast");
    t.textContent = msg;
    t.className = "toast show" + (err ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast" + (err ? " err" : ""); }, ms || 2200);
  }

  /* ---------- 대화 상자 ---------- */
  var dlg = null;
  function openDialog(o) {
    closeDialog();
    var m = $("modal");
    m.innerHTML = '<div class="mdl-back"></div><div class="mdl' + (o.cls ? " " + o.cls : "") + '" role="dialog" style="width:' + (o.width || 520) + 'px">' +
      '<div class="mdl-head"><div>' + (o.crumb ? '<div class="mdl-crumb">' + esc(o.crumb) + "</div>" : "") + '<div class="mdl-title">' + esc(o.title) + "</div></div>" +
      '<button class="mdl-x" data-x="1" title="닫기 (Esc)">✕</button></div>' +
      '<div class="mdl-body">' + o.body + "</div>" +
      '<div class="mdl-foot">' + (o.footLeft || "") + (o.extra || "") +
      (o.noCancel ? "" : '<button class="btn" data-x="1">' + (o.cancelText || "취소") + "</button>") +
      (o.okText === null ? "" : '<button class="btn ' + (o.danger ? "danger" : "primary") + '" data-ok="1">' + (o.okText || "확인") + "</button>") + "</div></div>";
    dlg = { el: m.querySelector(".mdl"), onOk: o.onOk, onClose: o.onClose, enterOk: o.enterOk !== false };
    m.querySelectorAll("[data-x]").forEach(function (b) { b.addEventListener("click", closeDialog); });
    var ok = m.querySelector("[data-ok]");
    if (ok) ok.addEventListener("click", function () { if (!dlg.onOk || dlg.onOk() !== false) closeDialog(); });
    var first = m.querySelector("input:not([type=radio]):not([type=checkbox]):not([type=file]),select");
    if (first && o.focus !== false) setTimeout(function () { first.focus(); if (first.select) first.select(); }, 30);
    return dlg;
  }
  function closeDialog() {
    if (!dlg) return;
    var cb = dlg.onClose;
    dlg = null;
    $("modal").innerHTML = "";
    if (cb) cb();
    setTimeout(markCell, 0);
  }
  function confirmBox(title, html, okText, danger) {
    return new Promise(function (res) {
      var done = false;
      openDialog({
        title: title, width: 440, body: '<div class="mdl-pad msg">' + html + "</div>", okText: okText || "확인", danger: danger,
        onOk: function () { done = true; res(true); }, onClose: function () { if (!done) res(false); }
      });
    });
  }

  /* ---------- 숫자 입력칸 ---------- */
  function moneyInput(id, v, opts) {
    opts = opts || {};
    return '<div class="withunit"><input class="inp num" id="' + id + '" data-kind="' + (opts.kind || "won") + '" value="' + esc(fmtInput(v, opts.kind || "won")) + '"' +
      (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : "") + ">" + (opts.noHint ? "" : '<small id="' + id + '_h"></small>') + "</div>";
  }
  function fmtInput(v, kind) {
    if (v === "" || v === null || v === undefined) return "";
    if (kind === "pct") return String(Math.round(Calc.num(v) * 100000) / 1000);
    if (kind === "int") return Calc.num(v) ? String(Calc.num(v)) : "";
    return Calc.num(v) ? Calc.fmtWon(Calc.num(v)) : "";
  }
  function readInput(el) {
    var k = el.getAttribute("data-kind"), raw = el.value.trim();
    if (raw === "") return 0;
    var n = Calc.num(raw);
    return k === "pct" ? n / 100 : n;
  }
  function wireInputs(root, onChange) {
    root.querySelectorAll("input.inp.num").forEach(function (el) {
      el.addEventListener("input", function () {
        var bad = el.value.trim() !== "" && !isFinite(parseFloat(el.value.replace(/[,\s원%]/g, "")));
        el.classList.toggle("bad", bad);
        onChange(el);
      });
      el.addEventListener("blur", function () {
        if (el.classList.contains("bad")) return;
        if (el.getAttribute("data-kind") === "won" && el.value.trim() !== "") el.value = Calc.fmtWon(Calc.num(el.value));
      });
      el.addEventListener("focus", function () { setTimeout(function () { el.select(); }, 0); });
    });
  }

  /* ---------- 산출 입력 팝업 ---------- */
  function openPlan(id) {
    var r = rowBy(id || UI.sel);
    if (!r) { toast("먼저 계정을 선택하세요"); return; }
    select(r.id);
    if (r.out) { toast("'" + r.name + "' 은(는) 계획 외 계정입니다. 마감 뒤에 생긴 계정이라 계획을 넣지 않습니다", false, 3500); return; }
    var ro = isClosed();
    if (ro && !r.meth) { toast("🔒 마감된 계획입니다. 이 계정은 입력 없이 0원으로 마감됐습니다. 바꾸려면 [계획 변경]을 여세요", false, 4000); return; }
    var d = { prev: r.prev, meth: r.meth, a: r.a, b: r.b, c: r.c, t: r.t, auto: r.auto || "t", split: r.split, sv: r.sv.slice(), memo: r.memo, pm: r.pm.slice() };
    if (!d.meth) { d.meth = "%증감"; d.a = 0; }
    if (!(Calc.num(d.c) > 0) && Calc.isQty(d.meth)) d.c = 12;

    function fields() {
      switch (d.meth) {
        case "%증감": return [["증감률 (%)", "pa", d.a, { kind: "pct", noHint: true, ph: "예: 3 (=3%)" }]];
        case "절대증감": return [["증감액 (원)", "pa", d.a, { ph: "감액은 −" }]];
        case "인원":
        case "단가×수량":
          var per = d.meth === "인원";
          return [[per ? "인당 월액 (원)" : "단가 (원)", "pa", d.a, { auto: "a" }], [per ? "인원 (명)" : "수량", "pb", d.b, { kind: "int", noHint: true, auto: "b" }],
            ["개월", "pc", d.c, { kind: "int", noHint: true, auto: "c" }], ["총액 (원)", "pt", d.t, { auto: "t", ph: "비우면 전년 실적" }]];
        default: return [["연간 금액 (원)", "pa", d.a]];
      }
    }
    // 역산: 자동 칸은 나머지 세 칸으로 계산해서 보여줌 (입력 안 됨)
    function autoValue(k) {
      var x = Calc.solve(d), v = x[k];
      return k === "a" || k === "t" ? Calc.fmtWon(v) : String(Math.round(v * 100) / 100);
    }

    function leftHtml() {
      var h = '<div class="f-row"><label>전년 실적</label>' + moneyInput("pPrev", d.prev) + "</div>" +
        '<div class="f-row"><label>산출 방식</label><div class="seg" id="segM">' + Calc.METHODS.map(function (m) {
          return '<button data-m="' + m + '" class="' + (m === d.meth ? "on" : "") + '">' + m + "</button>";
        }).join("") + "</div></div>";
      var qty = Calc.isQty(d.meth), au = qty ? Calc.solve(d).auto : "";
      fields().forEach(function (f) {
        var o = f[3] || {}, isAuto = qty && o.auto === au;
        h += '<div class="f-row' + (qty ? " qty" : "") + '"><label>' + f[0] + "</label>" +
          (isAuto ? '<div class="withunit"><input class="inp num auto-v" id="' + f[1] + '" value="' + esc(autoValue(o.auto)) + '" disabled><small id="' + f[1] + '_h"></small></div>' : moneyInput(f[1], f[2], o)) +
          (qty ? '<button class="auto-b' + (isAuto ? " on" : "") + '" data-auto="' + o.auto + '" title="이 칸을 나머지로 계산">' + (isAuto ? "자동" : "자동") + "</button>" : "") + "</div>";
      });
      if (qty) h += '<div class="f-row"><span></span><div class="hint">네 칸 중 <b>자동</b>을 누른 칸을 나머지로 계산합니다' + (au !== "t" ? " · 확정 계획액 = 총액" + (Calc.num(d.t) ? "" : " (비어 있어 전년 실적)") : "") + "</div></div>";
      var lastYear = Calc.ratiosFrom(d.pm);
      h += '<div class="f-row"><label>월 분할</label><div class="seg" id="segS">' + Calc.SPLITS.map(function (s) {
        return '<button data-s="' + s + '" class="' + (s === d.split ? "on" : "") + '">' + s + "</button>";
      }).join("") + '<button data-last="1"' + (lastYear ? ' title="전년 월별 실적 비율로 나눕니다"' : ' disabled title="전년 월별 실적이 없습니다 — [전년 실적 가져오기]에서 1~12월 열이 있는 파일을 올리세요"') + ">작년처럼</button></div></div>";
      if (d.split !== "균등") {
        var pct = d.split === "비율";
        h += '<div class="mtools" id="mTools"></div><div class="mgrid">' + d.sv.map(function (v, i) {
          return '<label><span>' + (i + 1) + '월</span><input class="inp num" data-sv="' + i + '" data-kind="' + (pct ? "pct" : "won") + '" value="' + esc(fmtInput(v, pct ? "pct" : "won")) + '"' + (pct ? ' placeholder="%"' : "") + "></label>";
        }).join("") + "</div>";
      }
      h += '<div class="f-row"><label>메모</label><input class="inp plain" id="pMemo" value="' + esc(d.memo) + '" placeholder="산출근거 뒤에 붙는 메모 (예: 신규 1명 포함)"></div>';
      return h;
    }

    function readAll(root) {
      d.prev = readInput($("pPrev"));
      if ($("pa")) d.a = readInput($("pa"));
      if ($("pb")) d.b = readInput($("pb"));
      if ($("pc")) d.c = readInput($("pc"));
      if ($("pt")) d.t = readInput($("pt"));
      var au = Calc.isQty(d.meth) ? Calc.solve(d).auto : "";
      if (au === "a") d.a = 0; else if (au === "b") d.b = 0; else if (au === "c") d.c = 0;
      if (au && au !== "t") { var x = Calc.solve(d); d[au] = Math.round(x[au] * 10000) / 10000; }
      root.querySelectorAll("[data-sv]").forEach(function (el) { d.sv[+el.getAttribute("data-sv")] = readInput(el); });
      d.memo = $("pMemo").value;
    }

    function preview() {
      var c = Calc.compute(d, S.settings);
      if (Calc.isQty(d.meth)) { var au = Calc.solve(d).auto, ae = $("p" + au); if (ae && ae.disabled) ae.value = autoValue(au); }
      $("pPreview").innerHTML = '<div class="pv-title">미리보기</div><div class="pv-total"><span>확정 계획액</span><b>' + Calc.fmtWon(c.plan) + " 원</b><small>" +
        u(c.plan, true) + " " + unitName() + " · 전년 대비 " + (Calc.fmtPct(c.yoy) || "-") + "</small></div>" +
        '<div class="pv-grid">' + c.months.map(function (v, i) { return "<div><span>" + (i + 1) + "월</span><b>" + u(v) + "</b></div>"; }).join("") + "</div>" +
        '<div class="pv-basis">' + esc(Calc.basisText(d, S.settings)) + (d.memo ? " · " + esc(d.memo) : "") + "</div>" +
        '<div class="pv-note">표 금액 단위: ' + unitName() + " · 산출 금액 " + Calc.fmtWon(c.base) + " 원 → " + S.settings.rndUnit + " 단위 " + S.settings.rndMode + " " + Calc.fmtWon(c.annual) + " 원" +
        (d.split === "균등" ? "<br>÷ 12달" + (c.fixMonth >= 0 ? " · 나눠 떨어지지 않는 " + Calc.fmtWon(c.months[c.fixMonth] - c.months[0]) + " 원은 12월에" : "") :
          d.split === "비율" && c.fixMonth >= 0 ? "<br>비율로 나누고 끝수는 비율이 가장 큰 " + (c.fixMonth + 1) + "월에" : d.split === "수기" ? "<br>월 금액 그대로 · 확정 계획액 = 월 금액의 합" : "") + "</div>" +
        (c.check ? '<div class="pv-warn">⚠ 월 비율의 합이 100%가 아닙니다 (' + (c.svSum * 100).toFixed(1) + "%)</div>" : "") +
        prevMemoHtml(r.id) +
        (c.manualDiff ? '<div class="pv-info">월 금액의 합이 산출 금액보다 ' + Calc.fmtWon(Math.abs(c.manualDiff)) + " 원 " + (c.manualDiff > 0 ? "많습니다" : "적습니다") + " (표에 '산출 대비' 표시)</div>" : "");
      var tools = $("mTools");
      if (tools) {
        if (d.split === "비율") tools.innerHTML = "월 비율 합계 <span class=\"" + (Math.abs(c.svSum - 1) < 0.0005 ? "ok" : "bad") + "\">" + (c.svSum * 100).toFixed(1) + "%</span>" +
          '<button class="btn" data-fill="even">12개월 균등</button><button class="btn" data-fill="clear">비우기</button>';
        else tools.innerHTML = "월 합계 <b>" + Calc.fmtWon(c.svSum) + "</b> / 산출 금액 " + Calc.fmtWon(c.base) +
          (Math.round(c.checkDiff) ? ' <span class="bad">차이 ' + Calc.fmtWon(c.checkDiff) + "</span>" : ' <span class="ok">일치</span>') +
          '<button class="btn" data-fill="even">산출 금액 ÷ 12</button><button class="btn" data-fill="clear">비우기</button>';
      }
      document.querySelectorAll(".mdl input.inp.num").forEach(function (el) {
        var hEl = el.id ? document.getElementById(el.id + "_h") : null;
        if (hEl) {
          var v = el.disabled ? Calc.num(el.value) : readInput(el);
          hEl.textContent = v && el.getAttribute("data-kind") !== "int" ? Calc.hangulWon(v) : el.id === "pt" && !el.disabled ? "→ 전년 " + Calc.hangulWon(d.prev) : "";
          hEl.title = hEl.textContent;
        }
      });
    }

    function build() {
      var root = $("pLeft");
      root.innerHTML = leftHtml();
      wireInputs(root, function () { readAll(root); preview(); });
      $("pMemo").addEventListener("input", function () { readAll(root); preview(); });
      if (ro) root.querySelectorAll("input,button").forEach(function (x) { x.disabled = true; });
      root.querySelectorAll("#segM button").forEach(function (b) {
        b.addEventListener("click", function () {
          readAll(root);
          var m = b.getAttribute("data-m");
          if (m === d.meth) return;
          var base = Calc.baseAmount(d);
          d.meth = m;
          // 방식을 바꿔도 금액이 크게 달라지지 않게 기본값 채움
          if (m === "%증감") d.a = d.prev ? Math.round((base / d.prev - 1) * 1000) / 1000 : 0;
          else if (m === "절대증감") d.a = Math.round(base - d.prev);
          else if (m === "수기") d.a = Math.round(base);
          else { d.a = 0; d.b = 0; d.c = 12; d.t = 0; d.auto = "t"; }
          build();
          var f = $("pa"); if (f) f.focus();
        });
      });
      root.querySelectorAll(".auto-b").forEach(function (b) {
        b.addEventListener("click", function () {
          readAll(root);
          var k = b.getAttribute("data-auto");
          if (k === Calc.solve(d).auto) return;
          // 지금 자동이던 칸의 값은 그대로 넣어 둠 (금액이 갑자기 바뀌지 않게)
          var x = Calc.solve(d);
          d.a = x.a; d.b = x.b; d.c = x.c;
          if (x.auto === "t") d.t = Math.round(x.t);
          d.auto = k;
          build();
        });
      });
      root.querySelectorAll("#segS button").forEach(function (b) {
        b.addEventListener("click", function () {
          readAll(root);
          if (b.getAttribute("data-last")) { d.split = "비율"; d.sv = Calc.ratiosFrom(d.pm); build(); return; }
          var s = b.getAttribute("data-s");
          if (s === d.split) return;
          var c = Calc.compute(d, S.settings);
          if (s === "수기") d.sv = c.months.slice();
          else if (s === "비율") d.sv = c.plan ? c.months.map(function (v) { return Math.round(v / c.plan * 10000) / 10000; }) : new Array(12).fill(Math.round(10000 / 12) / 10000);
          d.split = s;
          build();
        });
      });
      preview();
    }

    openDialog({
      title: r.name, crumb: r.l1 + (r.l3 ? " › " + r.l2 : "") + (r.dz.length ? " · 더존 " + r.dz.map(dzText).join(", ") : ""), width: 880,
      body: '<div class="split2"><div class="mdl-pad" id="pLeft"></div><div class="mdl-pad preview" id="pPreview"></div></div>',
      footLeft: ro ? '<span class="l">🔒 마감된 계획 — 보기만 됩니다. 바꾸려면 [계획 변경]을 여세요</span>' : '<span class="l">Enter 확인 · Esc 취소</span>',
      extra: r.meth && !ro ? '<button class="btn danger" id="pClear">입력 지우기</button>' : "",
      okText: ro ? null : "확인", cancelText: ro ? "닫기" : null,
      onOk: function () {
        readAll($("pLeft"));
        var c = Calc.compute(d, S.settings), before = r._c ? r._c.plan : 0;
        change(function () { setPlan(r.id, d); },
          rowLabel(r) + " 산출 입력: " + (r.meth ? Calc.fmtWon(before) + " → " : "") + Calc.fmtWon(c.plan) + "원 (" + d.meth + ", " + d.split + ")");
      }
    });
    build();
    $("pLeft").addEventListener("click", function (e) {
      var f = e.target.getAttribute && e.target.getAttribute("data-fill");
      if (!f) return;
      readAll($("pLeft"));
      if (f === "clear") d.sv = new Array(12).fill(0);
      else if (d.split === "비율") d.sv = new Array(12).fill(1 / 12);
      else d.sv = Calc.compute(Object.assign({}, d, { split: "균등" }), S.settings).months;
      build();
    });
    var clr = $("pClear");
    if (clr) clr.addEventListener("click", function () {
      closeDialog();
      change(function () { var b = Calc.blankPlan(); b.prev = r.prev; setPlan(r.id, b); }, rowLabel(r) + " 산출 입력 지움");
      toast("입력을 지웠습니다 (Ctrl+Z 로 되돌리기)");
    });
    var a = $("pa");
    if (a && !ro) setTimeout(function () { a.focus(); }, 40);
  }

  // 다음 해 계획에 이어 보기: 전년 집행 메모 (칸 메모 + 그 계정 전표 줄 메모)
  function prevMemoHtml(id) {
    if (!PREVX || !PREVX.memos) return "";
    var out = [], ix = dzIndex(), byKey = {};
    PREVX.lines.forEach(function (l) { byKey["l|" + lineKey(l)] = l; });
    Object.keys(PREVX.memos).forEach(function (k) {
      var m = PREVX.memos[k], p = k.split("|");
      if (p[0] === "c" && p[1] === id) out.push((+p[2] ? p[2] + "월 " : "") + m.text);
      else if (p[0] === "l" && byKey[k] && ix.leaf(byKey[k]) === id) out.push(byKey[k].m + "월 전표 · " + m.text);
    });
    return out.length ? '<div class="pv-memo"><b>📎 ' + PREVX.year + "년 집행 메모</b><br>" + out.slice(0, 6).map(esc).join("<br>") + (out.length > 6 ? "<br>… 외 " + (out.length - 6) : "") + "</div>" : "";
  }

  /* ---------- 계정 추가 · 수정 (분류 드롭다운 + 직접 입력) ----------
     소분류를 비우면 중분류가 계정, 넣으면 소분류가 계정 */
  function accDialog(edit) {
    var hit = edit ? findLeaf(UI.sel) : null;
    if (edit && !hit) { toast("수정할 계정을 먼저 선택하세요"); return; }
    var base = hit || findLeaf(UI.sel) || null;
    var v = edit ? { l1: hit.top.name, l2: hit.mid.name, l3: hit.sub ? hit.sub.name : "" }
      : { l1: base ? base.top.name : "", l2: base && base.sub ? base.mid.name : "", l3: "" };
    var confirmed = false;

    function opts(list) { return list.map(function (x) { return '<option value="' + esc(x) + '">'; }).join(""); }
    function refreshLists() {
      var l1 = $("aL1").value.trim(), l2 = $("aL2").value.trim(), l3 = $("aL3").value.trim();
      var t = topBy(l1), m = midBy(t, l2);
      $("dl2").innerHTML = opts(t ? t.kids.map(function (x) { return x.name; }) : []);
      $("dl3").innerHTML = opts(m && !isLeafMid(m) ? m.kids.filter(function (s) { return s.use === false; }).map(function (s) { return s.name; }) : []);
      $("aL1t").textContent = l1 && !t ? "새 대분류" : "";
      $("aL2t").textContent = !l2 ? "" : !m ? "새 중분류" : isLeafMid(m) ? (edit && !hit.sub && m === hit.mid ? "" : m.use === false && !l3 ? "사용 안 함 → 다시 사용" : l3 ? "소분류로 나눔" : "이미 있음") : "소분류 " + m.kids.length + "개";
      var ex = m && !isLeafMid(m) ? m.kids.filter(function (s) { return s.name === l3; })[0] : null;
      $("aL3t").textContent = !l3 ? "" : ex && (!edit || ex !== hit.leaf) ? (ex.use === false ? "사용 안 함 → 다시 사용" : "이미 있음") : edit && hit.sub && l3 === hit.sub.name && m === hit.mid ? "" : "새 소분류";
    }

    openDialog({
      title: edit ? "계정 수정" : "계정 추가", width: 520,
      body: '<div class="mdl-pad">' +
        (isClosed() && !edit ? '<div class="confirm">🔒 ' + S.year + "년 계획은 마감되었습니다. 새 계정은 <b>계획 외</b>로 들어갑니다 (계획 없이 실적만).</div>" : "") +
        '<div class="f-row"><label>대분류</label><div class="withunit"><input class="inp plain" id="aL1" list="dl1" autocomplete="off" value="' + esc(v.l1) + '" placeholder="목록에서 고르거나 직접 입력"><small class="newtag" id="aL1t"></small></div></div>' +
        '<div class="f-row"><label>중분류</label><div class="withunit"><input class="inp plain" id="aL2" list="dl2" autocomplete="off" value="' + esc(v.l2) + '" placeholder="예: 연차휴가보상금"><small class="newtag" id="aL2t"></small></div></div>' +
        '<div class="f-row"><label>소분류 (선택)</label><div class="withunit"><input class="inp plain" id="aL3" list="dl3" autocomplete="off" value="' + esc(v.l3) + '" placeholder="비우면 중분류가 계정"' + (edit && !hit.sub ? " disabled" : "") + '><small class="newtag" id="aL3t"></small></div></div>' +
        (edit ? '<div class="f-row"><label>더존 연결</label><div class="ro" style="font-weight:400">' + (hit.leaf.dz.length ? esc(hit.leaf.dz.map(dzText).join(", ")) : "없음") + ' <small>분류 관리에서 바꿉니다</small></div></div>'
          : '<div class="f-row"><label>더존 과목 (선택)</label><input class="inp plain" id="aDz" list="dlDz" autocomplete="off" placeholder="코드나 과목명 — 예: 81101 또는 연차휴가보상금"></div>') +
        '<div class="f-row"><span></span><div class="hint">' + (edit ? (hit.sub ? "다른 중분류로 바꾸면 그 중분류의 맨 끝으로 옮겨집니다." : "소분류가 없는 계정입니다. 대분류를 바꾸면 그 대분류의 맨 끝으로 옮겨집니다.") :
          "소분류를 비우면 중분류가 계정이 됩니다. 순서는 표에서 줄을 끌거나 분류 관리에서 바꾸세요.") + "</div></div>" +
        '<datalist id="dl1">' + opts(S.cat.map(function (t) { return t.name; })) + '</datalist><datalist id="dl2"></datalist><datalist id="dl3"></datalist>' +
        '<datalist id="dlDz">' + knownDz().map(function (d) { return '<option value="' + esc(dzText(d)) + '">'; }).join("") + "</datalist>" +
        '<div class="confirm" id="aConfirm" hidden></div><div class="pv-warn" id="aErr"></div></div>',
      okText: edit ? "저장" : "추가",
      onOk: function () {
        var l1 = $("aL1").value.trim(), l2 = $("aL2").value.trim(), l3 = $("aL3").value.trim();
        var dz = !edit ? parseDz($("aDz").value) : null;
        var err = function (m) { $("aErr").textContent = m; return false; };
        $("aErr").textContent = "";
        if (!l1 || !l2) return err("대분류 · 중분류를 넣으세요.");
        var t = topBy(l1), m = midBy(t, l2), notes = [];
        if (dz) {
          completeDz(dz);
          var dup = findDz(S.cat, dz);
          if (dup) return err("더존 과목 " + dzText(dz) + " 은(는) 이미 '" + leafPath(dup) + "' 에 연결돼 있습니다. 분류 관리에서 옮기세요.");
        }
        if (edit) return saveEdit(l1, l2, l3, t, m, err);

        // 추가
        var mode, ex = null;
        if (!l3) {
          if (m && !isLeafMid(m)) return err("'" + l2 + "' 에는 소분류가 있습니다. 소분류 이름을 넣으세요.");
          if (m && m.use !== false) return err("'" + l1 + " › " + l2 + "' 은(는) 이미 있습니다.");
          mode = m ? "reviveMid" : "newMid";
        } else if (m && isLeafMid(m)) {
          var why = lockReason(m.id);
          if (why) return err("'" + l2 + "' 을(를) 소분류로 나눌 수 없습니다 — " + why + ". 그 연도에서 [계획 변경]을 연 뒤 하세요.");
          mode = "split";
          notes.push("'" + esc(l2) + "' 에 처음으로 소분류를 만듭니다. 연결된 더존 과목 " + m.dz.length + "개와 계획 입력값은 새 소분류 <b>" + esc(l3) + "</b> 로 옮겨집니다.");
        } else if (m) {
          ex = m.kids.filter(function (s) { return s.name === l3; })[0];
          if (ex && ex.use !== false) return err("'" + l2 + " › " + l3 + "' 은(는) 이미 있습니다.");
          mode = ex ? "reviveSub" : "newSub";
        } else mode = "newMidSub";
        var news = [];
        if (!t) news.push("대분류 <b>" + esc(l1) + "</b>");
        if (!m) news.push("중분류 <b>" + esc(l2) + "</b>");
        if (l3 && !ex) news.push("소분류 <b>" + esc(l3) + "</b>");
        if (news.length) notes.unshift("분류에 새로 만듭니다: " + news.join(" · "));
        if (notes.length && !confirmed) {
          var c = $("aConfirm");
          c.hidden = false;
          c.innerHTML = notes.join("<br>") + "<br>진행할까요? <small>(아래 버튼을 한 번 더 누르면 만듭니다)</small>";
          confirmed = true;
          dlg.el.querySelector("[data-ok]").textContent = news.length ? "신설하고 추가" : "추가";
          return false;
        }
        var id = null, out = isClosed();
        change(function () {
          var top = topBy(l1) || pushTop(l1), mid = midBy(top, l2);
          if (mode === "reviveMid") { mid.use = true; id = mid.id; }
          else if (mode === "newMid") { mid = pushMid(top, l2); id = mid.id; }
          else if (mode === "reviveSub") { ex.use = true; id = ex.id; }
          else {
            if (!mid) mid = pushMid(top, l2);
            var sub = { id: newId("A"), name: l3, use: true, dz: [] };
            if (mode === "split") {
              sub.dz = mid.dz; mid.dz = [];
              if (S.plan[mid.id]) { S.plan[sub.id] = S.plan[mid.id]; delete S.plan[mid.id]; }
            }
            mid.kids.push(sub);
            id = sub.id;
          }
          var lf = findLeaf(id).leaf;
          if (dz) lf.dz.push(dz);
          if (out && !S.plan[id]) { var b = Calc.blankPlan(); b.out = true; S.plan[id] = b; }
          UI.sel = id; delete UI.collapsed[l1]; if (UI.nav.t && UI.nav.t !== l1) UI.nav = { t: "", m: "", s: "" };
        }, (mode.indexOf("revive") === 0 ? "계정 다시 사용: " : "계정 추가: ") + l1 + " › " + l2 + (l3 ? " › " + l3 : "") + (news.length ? " (분류 신설)" : "") + (out ? " (계획 외)" : ""), { master: true });
        setTimeout(function () { select(id, true); }, 0);
        toast(out ? "계획 외 계정으로 추가했습니다" : mode.indexOf("revive") === 0 ? "다시 사용합니다" : "계정을 추가했습니다. 더블클릭해서 산출 방식을 입력하세요");
      }
    });

    function saveEdit(l1, l2, l3, t, m, err) {
      var id = hit.leaf.id, why = lockReason(id);
      if (!hit.sub) { // 소분류 없는 중분류 계정: 이름 · 대분류만
        if (m && m !== hit.mid) return err("'" + l1 + " › " + l2 + "' 은(는) 이미 있습니다.");
        if (l1 !== hit.top.name && why) return err("다른 대분류로 옮길 수 없습니다 — " + why + ". 그 연도에서 [계획 변경]을 연 뒤 하세요.");
        if (l1 === hit.top.name && l2 === hit.mid.name) { closeDialog(); return; }
        change(function () {
          var cur = findLeaf(id), top = topBy(l1) || pushTop(l1);
          cur.mid.name = l2;
          if (cur.top !== top) { cur.top.kids.splice(cur.top.kids.indexOf(cur.mid), 1); top.kids.push(cur.mid); }
        }, "계정 수정: " + leafPath(hit) + " → " + l1 + " › " + l2, { master: true });
        toast("계정을 수정했습니다");
        return;
      }
      if (!l3) return err("소분류 이름을 넣으세요. (소분류를 없애려면 분류 관리에서 지웁니다)");
      var move = m !== hit.mid;
      if (move && why) return err("다른 중분류로 옮길 수 없습니다 — " + why + ". 그 연도에서 [계획 변경]을 연 뒤 하세요.");
      if (move && m && isLeafMid(m)) return err("'" + l2 + "' 은(는) 소분류가 없는 중분류(계정)입니다. 먼저 그 중분류에 소분류를 만드세요.");
      var target = m || null;
      var dupe = (target || { kids: [] }).kids.filter(function (s) { return s.name === l3 && s !== hit.leaf; })[0];
      if (dupe) return err("'" + l2 + " › " + l3 + "' 은(는) 이미 있습니다.");
      var news = [];
      if (!t) news.push("대분류 <b>" + esc(l1) + "</b>");
      if (!m) news.push("중분류 <b>" + esc(l2) + "</b>");
      if (news.length && !confirmed) {
        $("aConfirm").hidden = false;
        $("aConfirm").innerHTML = "분류에 새로 만듭니다: " + news.join(" · ") + "<br>신설할까요? <small>(아래 버튼을 한 번 더 누르면 만듭니다)</small>";
        confirmed = true;
        dlg.el.querySelector("[data-ok]").textContent = "신설하고 저장";
        return false;
      }
      change(function () {
        var cur = findLeaf(id), top = topBy(l1) || pushTop(l1), mid = midBy(top, l2) || pushMid(top, l2);
        cur.sub.name = l3;
        if (cur.mid !== mid) { cur.mid.kids.splice(cur.mid.kids.indexOf(cur.sub), 1); mid.kids.push(cur.sub); }
      }, "계정 수정: " + leafPath(hit) + " → " + l1 + " › " + l2 + " › " + l3, { master: true });
      toast("계정을 수정했습니다");
    }

    ["aL1", "aL2", "aL3"].forEach(function (k) {
      $(k).addEventListener("input", function () {
        refreshLists();
        if (confirmed) { confirmed = false; $("aConfirm").hidden = true; dlg.el.querySelector("[data-ok]").textContent = edit ? "저장" : "추가"; }
      });
    });
    refreshLists();
    setTimeout(function () { (edit ? (hit.sub ? $("aL3") : $("aL2")) : (v.l1 ? $("aL2") : $("aL1"))).focus(); }, 40);
  }
  function pushTop(name) { var t = { id: newId("G"), name: name, kids: [] }; S.cat.push(t); return t; }
  function pushMid(top, name) { var m = { id: newId("M"), name: name, use: true, dz: [], kids: [] }; top.kids.push(m); return m; }

  function delAcc() {
    var hit = findLeaf(UI.sel), r = rowBy(UI.sel);
    if (!hit || !r) { toast("삭제할 계정을 먼저 선택하세요"); return; }
    var c = r._c || Calc.compute(r, S.settings), why = lockReason(r.id);
    var path = r.l1 + " › " + rowLabel(r);
    if (why) {
      openDialog({
        title: "계정 삭제", width: 480, okText: null, cancelText: "닫기",
        body: '<div class="mdl-pad msg"><b>' + esc(path) + '</b><br><span class="em">🔒 ' + esc(why) + ".</span><br>마감된 계획의 계정은 지우거나 '사용 안 함'으로 바꿀 수 없습니다. 그 연도에서 <b>[계획 변경]</b>을 연 뒤에 하세요.</div>"
      });
      return;
    }
    var ids = visibleIds(), i = ids.indexOf(r.id), next = ids[i + 1] || ids[i - 1] || null;
    var lastSub = hit.sub && hit.mid.kids.length === 1;
    openDialog({
      title: "계정 삭제", width: 500,
      body: '<div class="mdl-pad msg"><b>' + esc(path) + "</b><br>" +
        (c.missing || r.out ? "" : '<span class="em">' + S.year + "년 계획액 " + Calc.fmtWon(c.plan) + "원</span>이 있습니다.<br>") +
        (hit.leaf.dz.length ? "연결된 더존 과목: " + esc(hit.leaf.dz.map(dzText).join(", ")) + "<br>" : "") +
        "• <b>사용 안 함</b>: 분류에는 남기고 계획 표에서만 숨깁니다. 입력값과 더존 연결도 남습니다. (계정 추가에서 다시 사용 가능)<br>" +
        "• <b>삭제</b>: 분류에서 지웁니다. <span class=\"em\">모든 연도</span>의 계획에서 빠지고, 더존 연결도 풀립니다." +
        (lastSub ? "<br>마지막 소분류라서 지우면 <b>" + esc(hit.mid.name) + "</b> 이(가) 다시 계정이 되고, 더존 연결은 그쪽으로 돌아갑니다." : "") +
        "<br>어느 쪽이든 Ctrl+Z 로 되돌릴 수 있습니다.</div>",
      extra: '<button class="btn" id="dHide">사용 안 함</button>', okText: "삭제", danger: true,
      onOk: function () {
        change(function () {
          var x = findLeaf(r.id);
          if (x.sub) {
            x.mid.kids.splice(x.mid.kids.indexOf(x.sub), 1);
            if (!x.mid.kids.length) { x.mid.dz = x.sub.dz; next = x.mid.id; }
          } else x.top.kids.splice(x.top.kids.indexOf(x.mid), 1);
          delete S.plan[r.id]; UI.sel = next;
        }, "계정 삭제: " + path + (c.missing || r.out ? "" : " (계획액 " + Calc.fmtWon(c.plan) + "원)"), { master: true });
        toast("삭제했습니다 (Ctrl+Z 로 되돌리기)");
      }
    });
    $("dHide").addEventListener("click", function () {
      closeDialog();
      change(function () { findLeaf(r.id).leaf.use = false; UI.sel = next; }, "계정 사용 안 함: " + path, { master: true });
      toast("'" + r.name + "' 을(를) 사용 안 함으로 바꿨습니다");
    });
  }

  /* ---------- 표에서 바로 고치기 (엑셀처럼) ----------
     계획 칸 = 산출 입력 팝업 · 1~12월 칸 = 금액 바로 입력 · 비고 칸 = 메모 바로 입력
     칸을 고르면 그 칸 위에 보이지 않는 입력칸(#cellEd)을 올려 두고 포커스 → 한글(조합 입력)도 첫 글자부터 받음 */
  var EDIT_COLS = ["plan", "m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "note"];
  var editing = null;
  function curTd() { return UI.cell ? $("tbl").querySelector("td.cur") : null; }
  function placeEd() {
    var ed = $("cellEd"), td = curTd();
    if (!td || dlg) { ed.hidden = true; return; }
    var r = td.getBoundingClientRect(), box = $("tbl").getBoundingClientRect();
    if (r.bottom < box.top + 20 || r.top > box.bottom - 10 || r.right < box.left || r.left > box.right) { ed.style.left = "-9999px"; return; }
    ed.hidden = false;
    var w = Math.max(r.width, UI.cell.k === "note" ? 300 : 110);
    ed.style.left = Math.min(r.left, innerWidth - w - 4) + "px"; ed.style.top = r.top + "px";
    ed.style.width = w + "px"; ed.style.height = r.height + "px";
    ed.classList.toggle("num", UI.cell.k !== "note");
    if (document.activeElement !== ed && !document.activeElement.closest(".mdl,#calc,#ctx,#fpop") && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) ed.focus({ preventScroll: true });
  }
  function setCell(id, k, scroll) {
    if (editing) commitEdit($("cellEd").value, 0, 0);
    UI.cell = k ? { id: id, k: k } : null;
    select(id, scroll);
    markCell();
    if (scroll && UI.cell) { var td = curTd(); if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" }); placeEd(); }
  }
  function moveCell(dx, dy) {
    var ids = visibleIds(), i = ids.indexOf(UI.sel);
    if (i < 0) return;
    var j = Math.max(0, Math.min(ids.length - 1, i + dy));
    if (!UI.cell) { if (ids[j]) select(ids[j], true); return; }
    var c = EDIT_COLS.indexOf(UI.cell.k), nc = Math.max(0, Math.min(EDIT_COLS.length - 1, c + dx));
    setCell(ids[j], EDIT_COLS[nc], true);
  }
  function canEditCell(r, k) {
    if (k === "note") return true; // 메모는 마감 뒤에도 씀
    if (r.out) { toast("'" + r.name + "' 은(는) 계획 외 계정이라 계획을 넣지 않습니다", false, 3000); return false; }
    return !guardClosed("월 금액을 바꾸려면");
  }
  // keep: 지금 입력칸 값(새로 친 글자)으로 시작. 아니면 칸의 원래 값으로 시작 (더블클릭 · F2 · Enter)
  function startEdit(keep) {
    if (!UI.cell || editing) return;
    var r = rowBy(UI.cell.id), k = UI.cell.k, ed = $("cellEd");
    if (!r) return;
    if (k === "plan") { ed.value = ""; openPlan(r.id); return; }
    if (!canEditCell(r, k)) { ed.value = ""; return; }
    var isM = k !== "note";
    if (!keep) { ed.value = isM ? (r._c.missing ? "" : Calc.fmtWon(r._c.months[+k.slice(1)])) : r.memo; }
    editing = { id: r.id, k: k };
    ed.classList.add("on");
    ed.placeholder = isM ? "" : "메모 — 산출근거 뒤에 붙습니다";
    placeEd();
    ed.focus({ preventScroll: true });
    if (!keep) ed.select(); else ed.setSelectionRange(ed.value.length, ed.value.length);
  }
  function stopEdit() { editing = null; var ed = $("cellEd"); ed.classList.remove("on"); ed.value = ""; ed.placeholder = ""; }
  function commitEdit(val, dx, dy) {
    var ed = editing;
    if (!ed) return;
    stopEdit();
    var r = rowBy(ed.id);
    if (!r) { renderAll(); return; }
    if (ed.k === "note") {
      val = String(val).trim();
      if (val !== r.memo) change(function () { var p = clone(planFor(r.id)); p.memo = val; setPlan(r.id, p); }, rowLabel(r) + " 메모: " + (val || "(지움)"));
    } else {
      var mi = +ed.k.slice(1), n = String(val).trim() === "" ? 0 : Calc.num(val);
      if (String(val).trim() !== "" && !isFinite(parseFloat(String(val).replace(/[,\s원]/g, "")))) toast("숫자를 넣으세요", true);
      else if (r._c.missing || n !== r._c.months[mi]) setMonth(r, mi, n);
    }
    if (dx || dy) moveCell(dx, dy); else { markCell(); placeEd(); }
  }
  // 월 금액을 직접 고치면 그 계정은 수기 분할, 확정 계획액 = 월 합계 (수기 방식이면 연간 금액도 같이)
  function setMonth(r, mi, n) {
    var before = r._c.missing ? 0 : r._c.months[mi];
    change(function () {
      var p = clone(planFor(r.id));
      if (!p.meth) { p.meth = "수기"; p.a = 0; p.split = "수기"; p.sv = new Array(12).fill(0); }
      else if (p.split !== "수기") { p.sv = Calc.compute(r, S.settings).months.slice(); p.split = "수기"; }
      p.sv[mi] = n;
      if (p.meth === "수기") p.a = p.sv.reduce(function (x, y) { return x + Calc.num(y); }, 0);
      setPlan(r.id, p);
    }, rowLabel(r) + " " + (mi + 1) + "월: " + Calc.fmtWon(before) + " → " + Calc.fmtWon(n) + "원");
  }
  function clearCell() {
    var r = rowBy(UI.cell.id), k = UI.cell.k;
    if (!r || k === "plan") return;
    if (!canEditCell(r, k)) return;
    if (k === "note") { if (r.memo) change(function () { var p = clone(planFor(r.id)); p.memo = ""; setPlan(r.id, p); }, rowLabel(r) + " 메모 지움"); }
    else if (!r._c.missing) setMonth(r, +k.slice(1), 0);
  }
  function bindCellEd() {
    var ed = $("cellEd");
    ed.addEventListener("compositionstart", function () { if (!editing) startEdit(true); });
    ed.addEventListener("input", function () {
      if (editing || !UI.cell) return;
      if (UI.cell.k !== "note" && !/^[0-9\-.,]*$/.test(ed.value)) { ed.value = ""; return; }
      startEdit(true);
    });
    ed.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중
      var k = e.key, ctl = e.ctrlKey || e.metaKey;
      if (editing) {
        if (k === "Enter") { e.preventDefault(); commitEdit(ed.value, 0, e.shiftKey ? -1 : 1); }
        else if (k === "Tab") { e.preventDefault(); commitEdit(ed.value, e.shiftKey ? -1 : 1, 0); }
        else if (k === "Escape") { e.preventDefault(); stopEdit(); placeEd(); }
        else if ((k === "ArrowUp" || k === "ArrowDown") && editing.k !== "note") { e.preventDefault(); commitEdit(ed.value, 0, k === "ArrowUp" ? -1 : 1); }
        return;
      }
      if (ctl && k.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if (ctl && k.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (ctl && k.toLowerCase() === "f") { e.preventDefault(); $("search").focus(); $("search").select(); return; }
      if (ctl && k.toLowerCase() === "s") { e.preventDefault(); doSave(); return; }
      if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); moveCell(0, k === "ArrowDown" ? 1 : -1); }
      else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); moveCell(k === "ArrowLeft" ? -1 : 1, 0); }
      else if (k === "Tab") { e.preventDefault(); moveCell(e.shiftKey ? -1 : 1, 0); }
      else if (k === "Enter" || k === "F2") { e.preventDefault(); startEdit(false); }
      else if (k === "Delete" || k === "Backspace") { e.preventDefault(); clearCell(); }
      else if (k === "Escape") { e.preventDefault(); closeCtx(); if (Object.keys(UI.multi).length) { UI.multi = {}; renderAll(); } else { UI.cell = null; markCell(); ed.blur(); } }
    });
    ed.addEventListener("blur", function () { if (editing) setTimeout(function () { if (editing && document.activeElement !== ed) commitEdit(ed.value, 0, 0); }, 0); });
    $("tbl").addEventListener("scroll", function () { if (UI.cell) placeEd(); });
    window.addEventListener("resize", function () { if (UI.cell) placeEd(); });
  }

  /* ---------- 여러 줄 선택 ---------- */
  function toggleMulti(id) { if (UI.multi[id]) delete UI.multi[id]; else UI.multi[id] = true; renderAll(); }
  function rangeMulti(id) {
    var ids = visibleIds(), a = ids.indexOf(UI.sel), b = ids.indexOf(id);
    if (a < 0) a = b;
    if (a > b) { var t = a; a = b; b = t; }
    for (var i = a; i <= b; i++) UI.multi[ids[i]] = true;
    renderAll();
  }
  function selectGroup(name) {
    S.rows.forEach(function (r) { if (r.l1 === name && visible(r)) UI.multi[r.id] = true; });
    renderAll();
  }

  /* ---------- 우클릭 메뉴 (정렬 · 필터 · 틀 고정 · 일괄 적용) ---------- */
  function closeCtx() { $("ctx").hidden = true; $("fpop").hidden = true; }
  function place(el, x, y) {
    el.hidden = false;
    el.style.left = "0px"; el.style.top = "0px";
    var w = el.offsetWidth, hh = el.offsetHeight;
    el.style.left = Math.max(4, Math.min(x, innerWidth - w - 8)) + "px";
    el.style.top = Math.max(4, Math.min(y, innerHeight - hh - 8)) + "px";
  }
  function openCtx(e) {
    var cell = e.target.closest("th,td");
    if (!cell || !cell.closest("#tbl")) return;
    e.preventDefault();
    var k = cell.getAttribute("data-k"), tr = cell.closest("tr"), id = tr && tr.classList.contains("acc") ? tr.getAttribute("data-id") : null;
    var grp = tr && tr.classList.contains("grp") ? tr.getAttribute("data-grp") : null;
    if (!k) return;
    if (id && !UI.multi[id]) { if (UI.cell && UI.cell.id !== id || !UI.cell) setCell(id, EDIT_COLS.indexOf(k) >= 0 ? k : null); }
    var m = Object.keys(UI.multi).length, items = [];
    var it = function (act, label, dis) { items.push('<div class="ctx-i' + (dis ? " dis" : "") + '" data-c="' + act + '">' + label + "</div>"); };
    items.push('<div class="ctx-h">' + esc(colName(k)) + " 열</div>");
    it("sort:1", "▲ 오름차순 정렬"); it("sort:-1", "▼ 내림차순 정렬");
    if (UI.sort) it("sort:0", "정렬 해제");
    it("filter", "⏷ 필터…" + (UI.filters[k] ? " (적용 중)" : ""));
    if (UI.filters[k]) it("unfilter", "이 열 필터 해제");
    it("freeze", "📌 틀 고정 — " + esc(colName(k)) + " 열까지", k === "note");
    if (UI.freeze && UI.freeze !== "acc") it("unfreeze", "틀 고정 해제");
    items.push('<div class="ctx-sep"></div>');
    if (grp) it("selgrp:" + grp, "이 대분류 계정 모두 선택");
    if (id && !m) it("selone:" + id, "이 계정 선택 (Ctrl+클릭으로 여러 개)");
    it("bulk", "⚙ 일괄 적용…" + (m ? " (" + m + "개 선택)" : " (보이는 계정)"));
    if (m) it("unsel", "선택 해제");
    $("ctx").innerHTML = items.join("");
    $("ctx").setAttribute("data-k", k);
    $("fpop").hidden = true;
    place($("ctx"), e.clientX, e.clientY);
  }
  function ctxAct(c, k, x, y) {
    closeCtx();
    var p = c.split(":");
    if (p[0] === "sort") { UI.sort = +p[1] ? { k: k, dir: +p[1] } : null; renderAll(); }
    else if (p[0] === "filter") filterPop(k, x, y);
    else if (p[0] === "unfilter") { delete UI.filters[k]; renderAll(); }
    else if (p[0] === "freeze") { UI.freeze = k; saveView(); renderAll(); }
    else if (p[0] === "unfreeze") { UI.freeze = "acc"; saveView(); renderAll(); }
    else if (p[0] === "selgrp") selectGroup(c.slice(7));
    else if (p[0] === "selone") toggleMulti(c.slice(7));
    else if (p[0] === "unsel") { UI.multi = {}; renderAll(); }
    else if (p[0] === "bulk") bulkDialog();
  }
  function saveView() { try { localStorage.setItem("budget.freeze", UI.freeze || "acc"); } catch (e) { /* 저장소 막힘 */ } }

  function filterPop(k, x, y) {
    var f = UI.filters[k] || {}, h = '<div class="fp-h">' + esc(colName(k)) + " 필터</div>";
    var opt = function (v, label, on) { return '<label class="fp-o"><input type="radio" name="fpOp" value="' + v + '"' + (on ? " checked" : "") + "> " + label + "</label>"; };
    if (k === "acc") {
      var names = []; S.rows.forEach(function (r) { if (names.indexOf(r.l1) < 0) names.push(r.l1); });
      h += '<input class="inp plain" id="fpText" placeholder="계정 · 더존 과목 글자 포함" value="' + esc(f.text || "") + '">' +
        '<div class="fp-tools"><a data-fp="all">모두</a> · <a data-fp="none">모두 해제</a></div><div class="fp-list">' + names.map(function (n) {
          return '<label class="fp-o"><input type="checkbox" class="fpG" value="' + esc(n) + '"' + (!f.groups || f.groups.indexOf(n) >= 0 ? " checked" : "") + "> " + esc(n) + "</label>";
        }).join("") + "</div>";
    } else if (k === "note") {
      h += opt("has", "메모 있음", f.op === "has") + opt("empty", "메모 없음", f.op === "empty") + opt("contains", "글자 포함", !f.op || f.op === "contains") +
        '<input class="inp plain" id="fpText" placeholder="찾을 글자" value="' + esc(f.text || "") + '">';
    } else if (k === "yoy") {
      h += opt("abs", "변동 ± 이상", !f.op || f.op === "abs") + opt("up", "증가 이상", f.op === "up") + opt("down", "감소 이상", f.op === "down") + opt("new", "신규 (전년 0)", f.op === "new") +
        '<div class="fp-v"><input class="inp num" id="fpV" value="' + esc(f.v !== undefined ? f.v : 10) + '"> %</div>';
    } else {
      h += opt("nonzero", "0 아님", !f.op || f.op === "nonzero") + opt("zero", "0", f.op === "zero") + opt("pos", "양수", f.op === "pos") + opt("neg", "음수 (△)", f.op === "neg") +
        opt("gte", "이상", f.op === "gte") + opt("lte", "이하", f.op === "lte") +
        '<div class="fp-v"><input class="inp num" id="fpV" value="' + esc(f.v ? Calc.fmtWon(f.v) : "") + '" placeholder="금액 (원)"> 원</div>';
    }
    h += '<div class="fp-b"><button class="btn sm" data-fp="clear">해제</button><button class="btn sm primary" data-fp="ok">적용</button></div>';
    var el = $("fpop");
    el.innerHTML = h;
    el.setAttribute("data-k", k);
    place(el, x, y);
    var first = el.querySelector("input:not([type=radio]):not([type=checkbox])");
    if (first) first.focus();
  }
  function filterApply(k) {
    var el = $("fpop"), op = (el.querySelector('input[name="fpOp"]:checked') || {}).value, f = {};
    if (k === "acc") {
      var all = el.querySelectorAll(".fpG"), on = Array.prototype.filter.call(all, function (x) { return x.checked; }).map(function (x) { return x.value; });
      if (on.length < all.length) f.groups = on;
      var tx = $("fpText").value.trim(); if (tx) f.text = tx;
      if (!f.groups && !f.text) f = null;
    } else if (k === "note") { f.op = op; f.text = $("fpText").value.trim(); if (op === "contains" && !f.text) f = null; }
    else { f.op = op; f.v = Calc.num($("fpV").value); if ((op === "gte" || op === "lte") && $("fpV").value.trim() === "") f = null; }
    if (f) UI.filters[k] = f; else delete UI.filters[k];
    closeCtx(); renderAll();
  }

  /* ---------- 일괄 적용 ---------- */
  function bulkDialog() {
    if (!S.year || guardClosed("일괄 적용하려면")) return;
    var picked = Object.keys(UI.multi).filter(function (id) { return rowBy(id); });
    var vis = S.rows.filter(visible).map(function (r) { return r.id; });
    var groups = []; S.rows.forEach(function (r) { if (groups.indexOf(r.l1) < 0) groups.push(r.l1); });
    var target = picked.length ? "pick" : "vis";
    function targets() {
      var t = target === "pick" ? picked : target === "vis" ? vis : S.rows.filter(function (r) { return r.l1 === $("bkGrp").value; }).map(function (r) { return r.id; });
      var only = $("bkOnly").checked;
      return t.map(rowBy).filter(function (r) { return r && !r.out && (!only || !r.meth); });
    }
    function opt(name, v, label, on) { return '<label class="bk-o"><input type="radio" name="' + name + '" value="' + v + '"' + (on ? " checked" : "") + "> " + label + "</label>"; }
    openDialog({
      title: "일괄 적용", crumb: S.year + "년 사업비 계획", width: 640,
      body: '<div class="mdl-pad">' +
        '<div class="bk-sec"><b>대상</b>' + opt("bkT", "pick", "선택한 계정 " + picked.length + "개", target === "pick").replace("<input", picked.length ? "<input" : "<input disabled") +
        opt("bkT", "vis", "지금 표에 보이는 계정 " + vis.length + "개" + (filtering() ? " (필터 결과)" : ""), target === "vis") +
        opt("bkT", "grp", '대분류 <select class="inp plain" id="bkGrp" style="width:160px;display:inline-block">' + groups.map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("") + "</select>", false) +
        '<label class="bk-o"><input type="checkbox" id="bkOnly"> 아직 입력 안 한 계정만</label></div>' +
        '<div class="bk-sec"><b>산출 방식</b>' + opt("bkM", "", "그대로", true) +
        opt("bkM", "%증감", '%증감 <input class="inp num" id="bkPct" value="0" style="width:70px;display:inline-block"> %', false) +
        opt("bkM", "절대증감", '절대증감 <input class="inp num" id="bkAbs" value="" placeholder="원" style="width:140px;display:inline-block"> 원', false) + "</div>" +
        '<div class="bk-sec"><b>월 분할</b>' + opt("bkS", "", "그대로", true) + opt("bkS", "균등", "균등", false) + opt("bkS", "작년처럼", "작년처럼 (전년 월별 실적 비율 — 없는 계정은 그대로)", false) + "</div>" +
        '<div class="bk-sec"><b>메모</b>' + opt("bkN", "", "그대로", true) + opt("bkN", "add", "뒤에 붙이기", false) + opt("bkN", "set", "바꾸기", false) +
        '<input class="inp plain" id="bkMemo" placeholder="메모 내용"></div>' +
        '<div class="bk-prev" id="bkPrev"></div></div>',
      okText: "적용",
      onOk: function () {
        var list = targets(), M = val("bkM"), Sp = val("bkS"), N = val("bkN"), memo = $("bkMemo").value.trim();
        if (!list.length) { toast("적용할 계정이 없습니다", true); return false; }
        if (!M && !Sp && !N) { toast("바꿀 항목을 고르세요", true); return false; }
        var res = calcBulk(list, M, Sp, N, memo);
        change(function () { res.forEach(function (x) { setPlan(x.id, x.p); }); },
          "일괄 적용 " + list.length + "개: " + [M ? M + (M === "%증감" ? " " + $("bkPct").value + "%" : " " + $("bkAbs").value) : "", Sp ? "분할 " + Sp : "", N ? "메모" : ""].filter(Boolean).join(", "));
        toast(list.length + "개 계정에 적용했습니다 (Ctrl+Z 로 되돌리기)");
      }
    });
    function val(n) { return (document.querySelector('input[name="' + n + '"]:checked') || {}).value || ""; }
    function calcBulk(list, M, Sp, N, memo) {
      return list.map(function (r) {
        var p = clone(planFor(r.id));
        if (M === "%증감") { p.meth = "%증감"; p.a = Calc.num($("bkPct").value) / 100; }
        else if (M === "절대증감") { p.meth = "절대증감"; p.a = Calc.num($("bkAbs").value); }
        if (Sp === "균등") p.split = "균등";
        else if (Sp === "작년처럼") { var rt = Calc.ratiosFrom(p.pm); if (rt) { p.split = "비율"; p.sv = rt; } }
        if (N === "add" && memo) p.memo = p.memo ? p.memo + " " + memo : memo;
        else if (N === "set") p.memo = memo;
        return { id: r.id, p: p, before: r._c.missing ? 0 : r._c.plan, after: p.meth ? Calc.compute(Object.assign({}, r, p), S.settings).plan : 0 };
      });
    }
    function preview() {
      target = val("bkT") || target;
      var list = targets(), res = calcBulk(list, val("bkM"), val("bkS"), val("bkN"), $("bkMemo").value.trim());
      var b = 0, a = 0; res.forEach(function (x) { b += x.before; a += x.after; });
      var noLast = val("bkS") === "작년처럼" ? list.filter(function (r) { return !Calc.ratiosFrom(r.pm); }).length : 0;
      $("bkPrev").innerHTML = "대상 <b>" + list.length + "개</b> · 계획 합계 " + Calc.fmtWon(b) + "원 → <b>" + Calc.fmtWon(a) + "원</b> (" + (a - b >= 0 ? "+" : "") + Calc.fmtWon(a - b) + ")" +
        (noLast ? '<br><span class="em">전년 월별 실적이 없는 ' + noLast + "개는 분할을 그대로 둡니다</span>" : "");
    }
    dlg.el.addEventListener("input", preview);
    dlg.el.addEventListener("change", preview);
    preview();
  }

  /* ---------- 계산기 (리본 오른쪽 끝) ----------
     열어 둔 채로 표의 금액 칸을 누르면 그 금액(원)이 들어감 */
  var CK = { acc: null, op: "", cur: "0", fresh: true, tape: [] };
  function calcOpen() { return !$("calc").hidden; }
  function calcToggle() {
    var el = $("calc");
    el.hidden = !el.hidden;
    $("btnCalc").classList.toggle("on", !el.hidden);
    if (!el.hidden) { calcDraw(); el.focus(); toast("계산기: 표의 금액 칸을 누르면 그 금액이 들어갑니다", false, 2500); }
  }
  function calcNum() { return parseFloat(CK.cur) || 0; }
  function calcFmt(v) {
    if (!isFinite(v)) return "오류";
    var r = Math.round(v * 1e6) / 1e6, p = String(r).split(".");
    return (r < 0 ? "-" : "") + Math.abs(parseInt(p[0], 10) || 0).toLocaleString("ko-KR") + (p[1] ? "." + p[1] : "");
  }
  function calcRun(a, op, b) { return op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : op === "÷" ? (b ? a / b : NaN) : b; }
  function calcKey(k) {
    if (/^[0-9]$/.test(k) || k === "00") {
      if (CK.fresh) { CK.cur = k === "00" ? "0" : k; CK.fresh = false; }
      else CK.cur = CK.cur === "0" ? (k === "00" ? "0" : k) : CK.cur + k;
    } else if (k === ".") { if (CK.fresh) { CK.cur = "0."; CK.fresh = false; } else if (CK.cur.indexOf(".") < 0) CK.cur += "."; }
    else if (k === "←") { if (!CK.fresh) CK.cur = CK.cur.length > 1 ? CK.cur.slice(0, -1) : "0"; }
    else if (k === "CE") { CK.cur = "0"; CK.fresh = true; }
    else if (k === "C") { CK.acc = null; CK.op = ""; CK.cur = "0"; CK.fresh = true; }
    else if (k === "±") CK.cur = String(-calcNum());
    else if (k === "%") { CK.cur = String(CK.acc !== null && (CK.op === "+" || CK.op === "−") ? CK.acc * calcNum() / 100 : calcNum() / 100); CK.fresh = true; }
    else if ("+−×÷".indexOf(k) >= 0) {
      if (CK.acc !== null && !CK.fresh) CK.acc = calcRun(CK.acc, CK.op, calcNum());
      else if (CK.acc === null) CK.acc = calcNum();
      CK.op = k; CK.fresh = true;
      CK.cur = String(CK.acc);
    } else if (k === "=") {
      if (CK.acc === null) return calcDraw();
      var b = calcNum(), res = calcRun(CK.acc, CK.op, b);
      CK.tape.push(calcFmt(CK.acc) + " " + CK.op + " " + calcFmt(b) + " = " + calcFmt(res));
      CK.acc = null; CK.op = ""; CK.cur = String(res); CK.fresh = true;
    }
    calcDraw();
  }
  function calcPick(label, v) {
    CK.cur = String(Math.round(v)); CK.fresh = false;
    CK.tape.push(label + ": " + calcFmt(v));
    calcDraw();
    CK.fresh = true;
  }
  function calcDraw() {
    if (CK.tape.length > 40) CK.tape = CK.tape.slice(-40);
    $("ckTape").innerHTML = CK.tape.map(function (t) { return "<div>" + esc(t) + "</div>"; }).join("");
    $("ckTape").scrollTop = 1e6;
    $("ckExpr").textContent = CK.acc !== null ? calcFmt(CK.acc) + " " + CK.op : "";
    var v = calcNum();
    $("ckVal").textContent = calcFmt(v);
    $("ckKor").textContent = isFinite(v) && Math.abs(v) >= 1 ? Calc.hangulWon(v) : "";
  }
  function calcCopy() {
    var t = String(Math.round(calcNum() * 1e6) / 1e6);
    var done = function () { toast("복사했습니다: " + calcFmt(calcNum())); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
    function fallback() { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); }
  }
  // 표 칸 → 계산기
  function calcPickCell(td) {
    var k = td.getAttribute("data-k"), tr = td.closest("tr"), v = 0, label = "";
    if (!k || k === "acc" || k === "yoy" || k === "note") return false;
    if (tr.classList.contains("acc")) { var r = rowBy(tr.getAttribute("data-id")); if (!r) return false; v = colVal(r, k); label = r.name; }
    else if (tr.classList.contains("grp")) { var g = LAST.groups.filter(function (x) { return x.name === tr.getAttribute("data-grp"); })[0]; if (!g) return false; v = groupVal(g, k); label = g.name + " 소계"; }
    else if (tr.classList.contains("total")) { var t = LAST.tot; v = k === "prev" ? t.prev : k === "plan" ? t.plan : k === "before" ? t.before : t.m[+k.slice(1)]; label = "합계"; }
    calcPick(label + " · " + colName(k), v);
    return true;
  }
  function bindCalc() {
    var el = $("calc");
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ck]");
      if (b) { calcKey(b.getAttribute("data-ck")); el.focus(); }
      if (e.target.closest("#ckCopy")) calcCopy();
      if (e.target.closest("#ckClose")) calcToggle();
      if (e.target.closest("#ckClr")) { CK.tape = []; calcDraw(); }
    });
    el.addEventListener("keydown", function (e) {
      var m = { "+": "+", "-": "−", "*": "×", "/": "÷", "Enter": "=", "=": "=", "Backspace": "←", "Escape": "C", "Delete": "CE", "%": "%", ".": ".", ",": "." }[e.key];
      if (/^[0-9]$/.test(e.key)) m = e.key;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); calcCopy(); return; }
      if (m) { e.preventDefault(); e.stopPropagation(); calcKey(m); }
    });
    // 제목 줄을 잡고 끌어 옮기기
    var hd = el.querySelector(".ck-h"), drag = null;
    hd.addEventListener("mousedown", function (e) { if (e.target.closest("button")) return; var r = el.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top }; e.preventDefault(); });
    document.addEventListener("mousemove", function (e) {
      if (!drag) return;
      el.style.left = Math.max(0, Math.min(innerWidth - 60, e.clientX - drag.x)) + "px";
      el.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - drag.y)) + "px";
      el.style.right = "auto";
    });
    document.addEventListener("mouseup", function () { drag = null; });
  }

  /* ---------- 리본 묶음 끌어서 순서 바꾸기 (같은 탭 안, 이 PC에 기억) ---------- */
  var RB_DEFAULT = {};
  function rbKey(rb) { return "budget.rb." + rb.id; }
  function rbOrder(rb) { return Array.prototype.map.call(rb.querySelectorAll(":scope > .rgrp"), function (g) { return g.getAttribute("data-g"); }); }
  function rbApply(rb, order) {
    order.forEach(function (name) { var g = rb.querySelector(':scope > .rgrp[data-g="' + name + '"]'); if (g) rb.appendChild(g); });
  }
  function initRibbons() {
    document.querySelectorAll(".ribbon").forEach(function (rb) {
      var gs = rb.querySelectorAll(":scope > .rgrp");
      if (gs.length < 2) return;
      gs.forEach(function (g) {
        var n = g.querySelector(".gname");
        g.setAttribute("data-g", n ? n.textContent.trim() : "");
        var grip = document.createElement("span");
        grip.className = "rgrip"; grip.title = "끌어서 이 묶음 위치 바꾸기"; grip.textContent = "⋮⋮";
        g.appendChild(grip);
        grip.addEventListener("mousedown", function () { g.draggable = true; });
        g.addEventListener("dragstart", function (e) { if (!g.draggable) return; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "rb"); g.classList.add("dragging"); rb._drag = g; });
        g.addEventListener("dragend", function () { g.draggable = false; g.classList.remove("dragging"); rb._drag = null; rb.querySelectorAll(".drop-l,.drop-r").forEach(function (x) { x.classList.remove("drop-l", "drop-r"); }); });
      });
      RB_DEFAULT[rb.id] = rbOrder(rb);
      try { var saved = JSON.parse(localStorage.getItem(rbKey(rb)) || "null"); if (saved) rbApply(rb, saved); } catch (e) { /* 저장소 막힘 */ }
      rb.addEventListener("dragover", function (e) {
        if (!rb._drag) return;
        var g = e.target.closest(".rgrp");
        rb.querySelectorAll(".drop-l,.drop-r").forEach(function (x) { x.classList.remove("drop-l", "drop-r"); });
        if (!g || g === rb._drag || g.parentNode !== rb) return;
        e.preventDefault();
        var r = g.getBoundingClientRect();
        g.classList.add(e.clientX < r.left + r.width / 2 ? "drop-l" : "drop-r");
      });
      rb.addEventListener("drop", function (e) {
        if (!rb._drag) return;
        var g = e.target.closest(".rgrp");
        if (!g || g === rb._drag) return;
        e.preventDefault();
        rb.insertBefore(rb._drag, g.classList.contains("drop-l") ? g : g.nextSibling);
        try { localStorage.setItem(rbKey(rb), JSON.stringify(rbOrder(rb))); } catch (x) { /* 저장소 막힘 */ }
        toast("리본 배치를 바꿨습니다 (설정 › 리본 배치 처음대로)");
      });
    });
  }
  function ribbonReset() {
    document.querySelectorAll(".ribbon").forEach(function (rb) {
      if (!RB_DEFAULT[rb.id]) return;
      rbApply(rb, RB_DEFAULT[rb.id]);
      try { localStorage.removeItem(rbKey(rb)); } catch (e) { /* 저장소 막힘 */ }
    });
    toast("리본 배치를 처음대로 돌렸습니다");
  }

  /* ---------- 요약 띠 접기 · 높이 조절 ---------- */
  function initStrip() {
    var st = { h: 0, shut: false };
    try { st = JSON.parse(localStorage.getItem("budget.strip") || "null") || st; } catch (e) { /* 저장소 막힘 */ }
    var strip = $("strip"), keep = function () { try { localStorage.setItem("budget.strip", JSON.stringify(st)); } catch (e) { /* 저장소 막힘 */ } };
    var apply = function () {
      document.body.classList.toggle("strip-shut", st.shut);
      strip.style.height = !st.shut && st.h ? st.h + "px" : "";
      document.documentElement.style.setProperty("--barH", (st.h ? Math.max(18, st.h - 34) : 54) + "px");
      $("stripBtn").textContent = st.shut ? "▾ 요약 펴기" : "▴ 요약 접기";
    };
    $("stripBtn").addEventListener("click", function () { st.shut = !st.shut; keep(); apply(); });
    var grip = $("stripGrip"), y0 = 0, h0 = 0, on = false;
    grip.addEventListener("mousedown", function (e) { if (st.shut) return; on = true; y0 = e.clientY; h0 = strip.offsetHeight; e.preventDefault(); document.body.classList.add("resizing"); });
    document.addEventListener("mousemove", function (e) { if (!on) return; st.h = Math.max(46, Math.min(260, h0 + e.clientY - y0)); apply(); });
    document.addEventListener("mouseup", function () { if (on) { on = false; document.body.classList.remove("resizing"); keep(); } });
    grip.addEventListener("dblclick", function () { st.h = 0; keep(); apply(); });
    apply();
  }

  /* ---------- 표에서 줄 끌어 순서 바꾸기 (같은 상위 안에서) ---------- */
  function siblings(a, b) { return !!(a && b && (a.sub ? b.sub && a.mid === b.mid : !b.sub && a.top === b.top)); }
  var drag = null;
  function bindTableDrag() {
    var tbl = $("tbl");
    tbl.addEventListener("dragstart", function (e) {
      var gr = e.target.closest && e.target.closest("tr.grp");
      if (gr) { drag = { grp: gr.getAttribute("data-grp") }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", drag.grp); gr.classList.add("dragging"); return; }
      var tr = e.target.closest && e.target.closest("tr.acc");
      if (!tr) return;
      drag = { id: tr.getAttribute("data-id") };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", drag.id);
      tr.classList.add("dragging");
    });
    tbl.addEventListener("dragend", function () {
      drag = null;
      tbl.querySelectorAll(".dragging,.drop-before,.drop-after,.drop-no").forEach(function (x) { x.classList.remove("dragging", "drop-before", "drop-after", "drop-no"); });
    });
    tbl.addEventListener("dragover", function (e) {
      if (!drag) return;
      if (drag.grp) {
        var g2 = e.target.closest("tr.grp");
        tbl.querySelectorAll(".drop-before,.drop-after").forEach(function (x) { x.classList.remove("drop-before", "drop-after"); });
        if (!g2 || g2.getAttribute("data-grp") === drag.grp) return;
        e.preventDefault();
        var rc = g2.getBoundingClientRect();
        g2.classList.add(e.clientY < rc.top + rc.height / 2 ? "drop-before" : "drop-after");
        return;
      }
      var tr = e.target.closest("tr.acc");
      tbl.querySelectorAll(".drop-before,.drop-after,.drop-no").forEach(function (x) { x.classList.remove("drop-before", "drop-after", "drop-no"); });
      if (!tr || tr.getAttribute("data-id") === drag.id) return;
      if (!siblings(findLeaf(drag.id), findLeaf(tr.getAttribute("data-id")))) { tr.classList.add("drop-no"); return; }
      e.preventDefault();
      var rect = tr.getBoundingClientRect();
      tr.classList.add(e.clientY < rect.top + rect.height / 2 ? "drop-before" : "drop-after");
    });
    tbl.addEventListener("drop", function (e) {
      if (!drag) return;
      if (drag.grp) {
        var g3 = e.target.closest("tr.grp");
        if (!g3) return;
        e.preventDefault();
        var name = drag.grp, target = g3.getAttribute("data-grp"), bef = g3.classList.contains("drop-before");
        if (name === target) return;
        change(function () {
          var t1 = topBy(name), t2 = topBy(target);
          S.cat.splice(S.cat.indexOf(t1), 1);
          S.cat.splice(S.cat.indexOf(t2) + (bef ? 0 : 1), 0, t1);
        }, "대분류 순서 변경: " + name, { master: true });
        return;
      }
      var tr = e.target.closest("tr.acc");
      if (!tr) return;
      e.preventDefault();
      var before = tr.classList.contains("drop-before"), targetId = tr.getAttribute("data-id"), id = drag.id;
      var a = findLeaf(id), b = findLeaf(targetId);
      if (!siblings(a, b)) return;
      change(function () {
        var x = findLeaf(id), y = findLeaf(targetId);
        var kids = x.sub ? x.mid.kids : x.top.kids, node = x.sub || x.mid, tnode = y.sub || y.mid;
        kids.splice(kids.indexOf(node), 1);
        kids.splice(kids.indexOf(tnode) + (before ? 0 : 1), 0, node);
        UI.sel = id;
      }, "순서 변경: " + leafPath(a), { master: true });
    });
  }

  /* ---------- 분류 관리 ----------
     4칸: 대분류 | 중분류 | 소분류(선택) | 더존 과목 연결
     opts.cat: 이 분류표로 시작 (버전 복사), opts.kind / opts.memo: 저장할 때 버전 구분 · 메모 */
  function catDialog(opts) {
    opts = opts || {};
    if (!S.year && !Store.connected()) { toast("먼저 데이터 폴더를 연결하세요"); return; }
    var W = clone(opts.cat || S.cat);
    ensureIds(W);
    var kind = opts.kind || "분류 관리";
    var selT = W[0] || null, selM = selT && selT.kids[0] || null, selS = selM && selM.kids[0] || null;
    var amounts = {};
    S.rows.forEach(function (r) { if (r._c && !r._c.missing) amounts[r.id] = r._c.plan; });
    var planMoves = {}; // 계정 ID → 계획 입력값을 넘겨받을 이전 계정 ID
    var dragC = null, pendingFn = null, srch = { q: "", hits: [], i: -1 };
    var known = knownDz();

    function cnt(t) { var n = 0; t.kids.forEach(function (m) { n += isLeafMid(m) ? 1 : m.kids.length; }); return n; }
    function curLeaf() { return selM ? (isLeafMid(selM) ? selM : selS) : null; }
    function dzTag(x) { return x.dz.length ? '<span class="tag dz" title="' + esc(x.dz.map(dzText).join(", ")) + '">더존 ' + x.dz.length + "</span>" : '<span class="tag none">연결 없음</span>'; }
    function item(lv, x, i, on) {
      var leaf = lv === 3 || (lv === 2 && isLeafMid(x)), extra = "";
      if (lv === 1) extra = '<span class="ci-cnt" title="계정 수">' + cnt(x) + "</span>";
      else if (lv === 2 && !leaf) extra = '<span class="tag sub">소분류 ' + x.kids.length + "</span>";
      else extra = dzTag(x);
      if (leaf) extra += '<label class="ci-use" title="끄면 계획 표에서 숨김"><input type="checkbox" data-f="use"' + (x.use === false ? "" : " checked") + ">사용</label>" +
        '<span class="ci-amt">' + (amounts[x.id] ? u(amounts[x.id]) : "") + "</span>";
      var lockT = leaf && lockReason(x.id) ? '<span class="ci-lock" title="' + esc(lockReason(x.id)) + ' — 옮기기 · 삭제 · 사용 안 함 불가">🔒</span>' : "";
      return '<div class="ci' + (on ? " on" : "") + (leaf && x.use === false ? " off" : "") + '" draggable="true" data-lv="' + lv + '" data-i="' + i + '">' +
        '<span class="grip">⋮⋮</span><input class="ci-no" data-f="no" value="' + (i + 1) + '" title="순번 (숫자를 바꾸고 Enter)">' +
        '<input class="ci-name" data-f="name" value="' + esc(x.name) + '" placeholder="' + (lv === 1 ? "대분류" : lv === 2 ? "중분류" : "소분류") + ' 이름">' + lockT + extra +
        '<button class="ci-del" data-f="del" title="삭제">✕</button></div>';
    }
    function list(lv) {
      if (lv === 1) return W;
      if (lv === 2) return selT ? selT.kids : null;
      return selM && !isLeafMid(selM) ? selM.kids : null;
    }
    function unlinked() { var o = []; eachLeaf(W, function (t, m, s, lf) { if (lf.use !== false && !lf.dz.length) o.push({ t: t, m: m, s: s }); }); return o; }
    function dzCount() { var n = 0; eachLeaf(W, function (t, m, s, lf) { n += lf.dz.length; }); return n; }

    function render(fromLv) {
      fromLv = fromLv || 1;
      [1, 2].forEach(function (lv) {
        if (lv < fromLv) return;
        var L = list(lv), col = $("cmCol" + lv);
        col.querySelector(".cm-h").innerHTML = (lv === 1 ? "대분류" : "중분류") + '<span class="cm-n">' + (lv === 2 && selT ? esc(selT.name || "(이름 없음)") + " · " : "") + (L ? L.length : 0) + "</span>";
        col.querySelector(".cm-list").innerHTML = !L ? '<div class="cm-empty">왼쪽에서 대분류를 고르세요</div>' :
          (L.length ? L.map(function (x, i) { return item(lv, x, i, (lv === 1 && x === selT) || (lv === 2 && x === selM)); }).join("") : '<div class="cm-empty">아직 없습니다. 아래 [추가]를 누르세요</div>');
        col.querySelector(".cm-add").disabled = !L;
      });
      var c3 = $("cmCol3"), L3 = list(3);
      if (fromLv <= 3) {
      c3.querySelector(".cm-h").innerHTML = "소분류" + '<span class="cm-n">' + (selM ? esc(selM.name || "(이름 없음)") + " · " + (L3 ? L3.length : 0) : "선택 사항") + "</span>";
      if (!selM) c3.querySelector(".cm-list").innerHTML = '<div class="cm-empty">중분류를 고르세요</div>';
      else if (!L3) c3.querySelector(".cm-list").innerHTML = '<div class="cm-none"><b>소분류 없음</b><p>‘' + esc(selM.name || "(이름 없음)") + '’ 은(는) 소분류 없이 씁니다.<br>더존 과목이 <b>중분류에 바로</b> 연결됩니다.</p>' +
        '<button class="btn" data-add="3">＋ 소분류 추가</button><p class="s">더 잘게 나눌 때만 추가하세요.<br>추가하면 연결된 더존 과목과 계획은 첫 소분류로 옮겨집니다.</p></div>';
      else c3.querySelector(".cm-list").innerHTML = L3.map(function (x, i) { return item(3, x, i, x === selS); }).join("");
      c3.querySelector(".cm-add").hidden = !L3;
      }
      renderLink();
      var ul = unlinked().length;
      $("cmUnl").textContent = "연결 없는 칸 " + ul;
      $("cmUnl").hidden = !ul;
      var lv = latestVer();
      $("cmMsg").innerHTML = "대분류 " + W.length + " · 계정 " + leafCount(W) + " · 더존 과목 " + dzCount() +
        ' <span class="l">· 저장하면 <b>v' + (lv ? lv.v + 1 : 1) + "</b>로 기록됩니다 · 순번은 ⋮⋮ 끌기 또는 번호 고치기</span>";
    }

    function renderLink() {
      var c4 = $("cmCol4"), lf = curLeaf(), h = "";
      var path = selT && selM ? esc(selT.name) + " › " + esc(selM.name) + (lf && lf !== selM ? " › " + esc(lf.name) : "") : "";
      c4.querySelector(".cm-h").innerHTML = '더존 과목 연결<span class="cm-n">' + path + "</span>";
      if (!selM) h = '<div class="cm-empty">중분류를 고르세요</div>';
      else if (!lf) h = '<div class="lk-path">소분류가 있는 중분류입니다.<br>더존 과목은 <b>소분류</b>에 연결합니다. 소분류를 고르세요.</div>';
      else {
        var sibs = lf !== selM ? selM.kids.filter(function (s) { return s !== lf; }) : [];
        h = '<div class="lk-path">연결 위치 <b>' + (lf === selM ? "중분류" : "소분류") + "</b> · 이 칸에 들어가는 더존 과목</div>" +
          (lf.dz.length ? lf.dz.map(function (d, i) {
            return '<div class="lk" data-k="' + i + '"><span class="lk-t">더존</span><input class="lk-code" data-f="dzc" value="' + esc(d.code) + '" placeholder="코드">' +
              '<input class="lk-name" data-f="dzn" value="' + esc(d.name) + '" placeholder="과목명">' +
              (sibs.length ? '<select class="lk-mv" data-f="dzmv" title="다른 소분류로 옮기기"><option value="">옮기기…</option>' + sibs.map(function (s) { return '<option value="' + esc(s.id) + '">→ ' + esc(s.name || "(이름 없음)") + "</option>"; }).join("") + "</select>" : "") +
              '<button class="ci-del" data-f="dzdel" title="연결 해제">✕</button></div>';
          }).join("") : '<div class="cm-empty">연결된 더존 과목이 없습니다.<br>계획만 세우는 칸이면 그대로 두세요.</div>') +
          '<div class="lk-add"><input class="inp plain" id="lkNew" list="lkList" autocomplete="off" placeholder="코드나 과목명 (예: 81110 또는 당직비)"><button class="btn" id="lkAdd">연결</button></div>' +
          '<div class="lk-hint">· 코드나 이름 하나만 넣어도 더존 계정과목표에서 나머지를 채웁니다.<br>· 이미 다른 칸에 연결된 과목이면 이쪽으로 옮길지 묻습니다.<br>· 띄어쓰기는 무시하고 비교합니다.</div>';
      }
      c4.querySelector(".cm-list").innerHTML = h;
    }

    function at(el) { var c = el.closest(".ci"); return c ? { lv: +c.getAttribute("data-lv"), i: +c.getAttribute("data-i"), el: c } : null; }
    function move(L, from, to) { to = Math.max(0, Math.min(L.length - 1, to)); var x = L.splice(from, 1)[0]; L.splice(to, 0, x); }
    function say(html, err) { $("cmMsg").innerHTML = err ? '<span class="em">⚠ ' + html + "</span>" : html; }
    function ask(html, yes, fn, danger) {
      pendingFn = fn;
      $("cmAsk").innerHTML = html + ' <button class="btn ' + (danger === false ? "primary" : "danger") + '" id="cmYes">' + yes + '</button> <button class="btn" id="cmNo">그대로 두기</button>';
      $("cmAsk").hidden = false;
      $("cmYes").addEventListener("click", function () { var f = pendingFn; pendingFn = null; $("cmAsk").hidden = true; f(); render(); });
      $("cmNo").addEventListener("click", function () { pendingFn = null; $("cmAsk").hidden = true; });
    }
    function dirty() { return diffCat(S.cat, W).length > 0; }

    // 소분류 없는 중분류를 처음 나눔: 더존 연결 · 계획은 첫 소분류로
    function split(m) {
      var why = lockReason(m.id);
      if (why) { say("'" + esc(m.name) + "' 을(를) 소분류로 나눌 수 없습니다 — " + esc(why) + ". 그 연도에서 [계획 변경]을 연 뒤 하세요.", true); return; }
      var doIt = function () {
        var s = { id: newId("A"), name: "", use: m.use !== false, dz: m.dz };
        m.dz = []; m.kids = [s];
        if (planMoves[m.id] === s.id) delete planMoves[m.id]; else planMoves[s.id] = m.id;
        selS = s;
        render();
        setTimeout(function () { var el = $("cmCol3").querySelector(".ci.on .ci-name"); if (el) el.focus(); }, 0);
        say("소분류를 만들었습니다. 이름을 넣으세요. 더존 과목 " + s.dz.length + "개와 계획은 이 소분류로 옮겼습니다 (다른 소분류로는 오른쪽 [옮기기])");
      };
      if (m.dz.length || amounts[m.id]) ask("‘<b>" + esc(m.name) + "</b>’ 을(를) 소분류로 나눕니다. 연결된 더존 과목 " + m.dz.length + "개" + (amounts[m.id] ? "와 계획 " + u(amounts[m.id], true) + unitName() : "") + "은(는) 첫 소분류로 옮겨집니다.", "나누기", doIt, false);
      else doIt();
    }

    openDialog({
      title: "분류 관리", crumb: "설정 · 모든 연도 공통 (data\\" + Store.MASTER + ")" + (opts.memo ? " · " + opts.memo : ""), width: 1240, cls: "mdl-cat", enterOk: false,
      body: '<div class="cm-tools">' +
        '<button class="btn sm" id="cmDown"><b class="ic">⇩</b> 양식 다운</button><button class="btn sm" id="cmUp"><b class="ic">⇧</b> 양식 업로드</button><span class="sep"></span>' +
        '<button class="btn sm" id="cmVer"><b class="ic">🕘</b> 버전 이력 <span class="ver">v' + (latestVer() ? latestVer().v : 0) + "</span></button>" +
        (anyLock() ? '<span class="cm-lock" title="금액 있는 계정은 다른 분류로 옮기기 · 삭제 · 사용 안 함이 안 됩니다. 이름 · 순서 · 더존 연결은 바꿀 수 있습니다.">🔒 마감된 계획이 있습니다 — 🔒 표시 계정은 옮기기 · 삭제 불가' + (isClosed() ? " · 새 계정은 ‘계획 외’" : "") + "</span>" : "") +
        '<input class="search" id="cmSearch" placeholder="분류 · 더존 과목 찾기 (Enter = 다음)"><span class="chip warn" id="cmUnl" title="더존 과목이 하나도 연결되지 않은 계정 — 누르면 차례로 이동"></span></div>' +
        '<div class="cm-wrap4">' + [1, 2, 3].map(function (lv) {
          return '<div class="cm-col" id="cmCol' + lv + '"><div class="cm-h"></div><div class="cm-list" data-lv="' + lv + '"></div>' +
            '<button class="btn cm-add" data-add="' + lv + '">＋ ' + (lv === 1 ? "대분류" : lv === 2 ? "중분류" : "소분류") + " 추가</button></div>";
        }).join("") + '<div class="cm-col link" id="cmCol4"><div class="cm-h"></div><div class="cm-list"></div></div></div>' +
        '<div class="cm-ask" id="cmAsk" hidden></div><datalist id="lkList">' + known.map(function (d) { return '<option value="' + esc(dzText(d)) + '">'; }).join("") + "</datalist>",
      footLeft: '<span class="cm-msg" id="cmMsg"></span><input class="inp plain" id="cmMemo" placeholder="변경 메모 (선택)" value="' + esc(opts.memo || "") + '" style="width:220px">',
      okText: "저장", focus: false,
      onOk: function () { return save(); }
    });
    var box = dlg.el;
    render();

    function save() {
      // 이름 · 중복 확인
      var err = null, seen = {}, dzSeen = {};
      W.forEach(function (t, ti) {
        if (err) return;
        if (!t.name.trim()) err = ["대분류 " + (ti + 1) + "번 이름이 비어 있습니다", t];
        else if (seen[t.name.trim()]) err = ["대분류 '" + t.name + "' 이(가) 두 번 있습니다", t];
        seen[t.name.trim()] = 1;
        var s2 = {};
        t.kids.forEach(function (m, mi) {
          if (err) return;
          if (!m.name.trim()) err = [t.name + " › 중분류 " + (mi + 1) + "번 이름이 비어 있습니다", t, m];
          else if (s2[m.name.trim()]) err = [t.name + " › 중분류 '" + m.name + "' 이(가) 두 번 있습니다", t, m];
          s2[m.name.trim()] = 1;
          var s3 = {};
          m.kids.forEach(function (s, si) {
            if (err) return;
            if (!s.name.trim()) err = [t.name + " › " + m.name + " › 소분류 " + (si + 1) + "번 이름이 비어 있습니다", t, m, s];
            else if (s3[s.name.trim()]) err = [t.name + " › " + m.name + " › '" + s.name + "' 이(가) 두 번 있습니다", t, m, s];
            s3[s.name.trim()] = 1;
          });
        });
      });
      if (!err) eachLeaf(W, function (t, m, s, lf) {
        lf.dz.forEach(function (d) {
          if (err) return;
          if (!d.code && !nm(d.name)) return;
          var keys = [d.code ? "C" + d.code : null, nm(d.name) ? "N" + nm(d.name) : null];
          keys.forEach(function (k) {
            if (!k || err) return;
            if (dzSeen[k] && dzSeen[k] !== lf) err = ["더존 과목 " + dzText(d) + " 이(가) 두 칸에 연결돼 있습니다", t, m, s];
            dzSeen[k] = lf;
          });
        });
      });
      // 마감된 계획에 금액이 있는 계정: 그대로 있어야 함 (같은 상위, 계정 그대로, 사용)
      if (!err) {
        var oldIdx = {};
        eachLeaf(S.cat, function (t, m, s, lf) { oldIdx[lf.id] = s ? m.id : t.id; });
        var newIdx = {};
        eachLeaf(W, function (t, m, s, lf) { newIdx[lf.id] = { parent: s ? m.id : t.id, use: lf.use !== false, t: t, m: m, s: s }; });
        Object.keys(oldIdx).some(function (id) {
          var why = lockReason(id);
          if (!why) return false;
          var h = findLeaf(id), n = newIdx[id], name = h ? leafPath(h) : id;
          if (!n) err = ["'" + name + "' 은(는) 지울 수 없습니다 — " + why];
          else if (n.parent !== oldIdx[id]) err = ["'" + name + "' 은(는) 다른 분류로 옮길 수 없습니다 — " + why, n.t, n.m, n.s];
          else if (!n.use) err = ["'" + name + "' 은(는) 사용 안 함으로 바꿀 수 없습니다 — " + why, n.t, n.m, n.s];
          return !!err;
        });
        if (err) err[0] += ". 그 연도에서 [계획 변경]을 연 뒤 하세요";
      }
      if (err) {
        if (err[1]) { selT = err[1]; selM = err[2] || selT.kids[0] || null; selS = err[3] || (selM && selM.kids[0]) || null; }
        render(); say(esc(err[0]), true); return false;
      }
      W.forEach(function (t) { t.name = t.name.trim(); t.kids.forEach(function (m) { m.name = m.name.trim(); m.kids.forEach(function (s) { s.name = s.name.trim(); }); }); });
      eachLeaf(W, function (t, m, s, lf) { lf.dz = lf.dz.filter(function (d) { return d.code || nm(d.name); }).map(function (d) { return { code: String(d.code || "").trim(), name: String(d.name || "").trim() }; }); });
      var d = diffCat(S.cat, W);
      if (!d.length) { toast("바뀐 것이 없습니다"); return; }
      var oldLeaves = leafIds(S.cat), newLeaves = leafIds(W);
      var gone = Object.keys(oldLeaves).filter(function (id) { return !newLeaves[id]; });
      var fresh = Object.keys(newLeaves).filter(function (id) { return !oldLeaves[id] && !planMoves[id]; });
      var memo = $("cmMemo").value.trim();
      change(function () {
        var moved = {};
        Object.keys(planMoves).forEach(function (nid) { var src = planMoves[nid]; if (S.plan[src] && newLeaves[nid]) moved[nid] = S.plan[src]; });
        S.cat = W;
        gone.forEach(function (id) { delete S.plan[id]; });
        Object.keys(moved).forEach(function (nid) { S.plan[nid] = moved[nid]; });
        if (isClosed()) fresh.forEach(function (id) { if (!S.plan[id]) { var b = Calc.blankPlan(); b.out = true; S.plan[id] = b; } });
        if (UI.sel && !findLeaf(UI.sel)) UI.sel = null;
      }, "분류 저장 (" + summarize(d) + ")" + (memo ? " — " + memo : ""), { master: true, verKind: kind, verMemo: memo });
      toast("분류를 저장했습니다 — v" + latestVer().v);
    }

    /* 도구 줄 */
    $("cmDown").addEventListener("click", function () {
      var lv = latestVer(), name = "분류관리_양식_v" + (lv ? lv.v : 0) + (dirty() ? "_저장전" : "") + ".xlsx";
      Store.downloadTemplate(W, name);
      say("양식을 내려받았습니다 — " + esc(name) + " (고친 뒤 [양식 업로드])");
    });
    $("cmUp").addEventListener("click", function () {
      var fi = document.createElement("input");
      fi.type = "file"; fi.accept = ".xlsx,.xls";
      fi.addEventListener("change", function () {
        var f = fi.files[0];
        if (!f) return;
        Store.readAnyFile(f).then(function (sheets) { uploaded(f.name, Store.parseTemplate(sheets)); }, function (e) { say("파일을 읽지 못했습니다: " + esc(e && e.message || e), true); });
      });
      fi.click();
    });
    function uploaded(fname, res) {
      if (res.errors.length || !res.cat.length) {
        $("cmAsk").hidden = false;
        $("cmAsk").innerHTML = "<b>" + esc(fname) + "</b> 을(를) 올릴 수 없습니다:<div class=\"listbox\">" + (res.errors.length ? res.errors.map(esc).join("<br>") : "분류가 한 줄도 없습니다") + '</div><button class="btn" id="cmNo">닫기</button>';
        $("cmNo").addEventListener("click", function () { $("cmAsk").hidden = true; });
        return;
      }
      adoptIds(res.cat, W);
      ensureIds(res.cat);
      var dup = null, seenK = {};
      eachLeaf(res.cat, function (t, m, s, lf) { lf.dz.forEach(function (d) { [d.code ? "C" + d.code : "", nm(d.name) ? "N" + nm(d.name) : ""].forEach(function (k) { if (k && seenK[k] && seenK[k] !== lf && !dup) dup = dzText(d); if (k) seenK[k] = lf; }); }); });
      var midDz = null;
      res.cat.forEach(function (t) { t.kids.forEach(function (m) { if (!isLeafMid(m) && m.dz.length && !midDz) midDz = t.name + " › " + m.name; }); });
      if (dup || midDz) {
        $("cmAsk").hidden = false;
        $("cmAsk").innerHTML = "<b>" + esc(fname) + "</b> 을(를) 올릴 수 없습니다: " + (dup ? "더존 과목 <b>" + esc(dup) + "</b> 이(가) 두 칸에 있습니다." : "<b>" + esc(midDz) + "</b> 은(는) 소분류가 있는데 소분류 없이 더존 과목을 적은 줄이 있습니다.") + ' <button class="btn" id="cmNo">닫기</button>';
        $("cmNo").addEventListener("click", function () { $("cmAsk").hidden = true; });
        return;
      }
      var d = diffCat(W, res.cat);
      if (!d.length) { say(esc(fname) + " — 지금 분류와 같습니다"); return; }
      $("cmAsk").hidden = false;
      $("cmAsk").innerHTML = "<b>" + esc(fname) + "</b> (" + res.rows + "줄) — " + esc(summarize(d)) +
        '<div class="listbox diffbox">' + diffTable(d) + "</div>" +
        '<button class="btn primary" id="cmYes">적용</button> <button class="btn" id="cmNo">취소</button> <small>적용한 뒤 [저장]해야 반영됩니다</small>';
      $("cmYes").addEventListener("click", function () {
        $("cmAsk").hidden = true;
        W = res.cat; planMoves = {}; kind = "양식 업로드";
        selT = W[0] || null; selM = selT && selT.kids[0] || null; selS = selM && selM.kids[0] || null;
        if (!$("cmMemo").value.trim()) $("cmMemo").value = "양식 업로드: " + fname;
        render();
        say("양식 내용을 불러왔습니다 — 확인하고 [저장]하세요");
      });
      $("cmNo").addEventListener("click", function () { $("cmAsk").hidden = true; });
    }
    $("cmVer").addEventListener("click", function () {
      if (dirty()) ask("저장하지 않은 변경이 있습니다. 버리고 버전 이력을 열까요?", "버리고 열기", verDialog);
      else verDialog();
    });
    $("cmUnl").addEventListener("click", function () {
      var L = unlinked();
      if (!L.length) return;
      var cur = curLeaf(), i = 0;
      L.forEach(function (x, k) { if ((x.s || x.m) === cur) i = k + 1; });
      var x = L[i % L.length];
      selT = x.t; selM = x.m; selS = x.s || (x.m.kids[0] || null);
      render();
      var el = box.querySelector(".ci.on[data-lv='" + (x.s ? 3 : 2) + "']");
      if (el) el.scrollIntoView({ block: "nearest" });
    });
    $("cmSearch").addEventListener("input", function () {
      var q = nm(this.value).toLowerCase();
      srch = { q: q, hits: [], i: -1 };
      if (!q) { say(""); render(); return; }
      W.forEach(function (t) {
        if (nm(t.name).toLowerCase().indexOf(q) >= 0) srch.hits.push({ t: t });
        t.kids.forEach(function (m) {
          var hay = function (x) { return (nm(x.name) + " " + x.dz.map(function (d) { return d.code + nm(d.name); }).join(" ")).toLowerCase(); };
          if (hay(m).indexOf(q) >= 0) srch.hits.push({ t: t, m: m });
          m.kids.forEach(function (s) { if (hay(s).indexOf(q) >= 0) srch.hits.push({ t: t, m: m, s: s }); });
        });
      });
      say(srch.hits.length ? "찾음 " + srch.hits.length + "건 · Enter = 다음" : "찾는 분류 · 더존 과목이 없습니다", !srch.hits.length);
      if (srch.hits.length) next();
    });
    $("cmSearch").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); next(); } });
    function next() {
      if (!srch.hits.length) return;
      srch.i = (srch.i + 1) % srch.hits.length;
      var x = srch.hits[srch.i];
      selT = x.t; selM = x.m || x.t.kids[0] || null; selS = x.s || (selM && selM.kids[0]) || null;
      render();
      say("찾음 " + (srch.i + 1) + " / " + srch.hits.length + " · Enter = 다음");
      ["1", "2", "3"].forEach(function (lv) { var el = box.querySelector(".ci.on[data-lv='" + lv + "']"); if (el) el.scrollIntoView({ block: "nearest" }); });
    }

    /* 더존 과목 연결 칸 */
    function addLink() {
      var lf = curLeaf(), d = parseDz($("lkNew").value);
      if (!lf || !d) return;
      completeDz(d);
      if (lf.dz.some(function (x) { return dzSame(x, d); })) { say(esc(dzText(d)) + " 은(는) 이미 이 칸에 연결돼 있습니다", true); return; }
      var hit = findDz(W, d, lf);
      var put = function () {
        if (hit) hit.leaf.dz.splice(hit.leaf.dz.indexOf(hit.dz), 1);
        lf.dz.push(d);
        render();
        say("연결했습니다: " + esc(dzText(d)) + (hit ? " (‘" + esc(leafPath(hit)) + "’ 에서 옮김)" : ""));
        var n = $("lkNew"); if (n) n.focus();
      };
      if (hit) ask(esc(dzText(d)) + " 은(는) 이미 <b>" + esc(leafPath(hit)) + "</b> 에 연결돼 있습니다. 이쪽으로 옮길까요?", "이쪽으로 옮기기", put, false);
      else put();
    }
    box.addEventListener("click", function (e) {
      if (e.target.id === "lkAdd") { addLink(); return; }
      var lk = e.target.closest(".lk");
      if (lk && e.target.getAttribute("data-f") === "dzdel") {
        var lf = curLeaf(), k = +lk.getAttribute("data-k"), d = lf.dz[k];
        lf.dz.splice(k, 1); render(); say("연결을 풀었습니다: " + esc(dzText(d)));
        return;
      }
      var add = e.target.closest("[data-add]");
      if (add) {
        var lv = +add.getAttribute("data-add");
        if (lv === 3 && selM && isLeafMid(selM)) { split(selM); return; }
        var L = list(lv);
        if (!L) return;
        var x = lv === 1 ? { id: newId("G"), name: "", kids: [] } : lv === 2 ? { id: newId("M"), name: "", use: true, dz: [], kids: [] } : { id: newId("A"), name: "", use: true, dz: [] };
        L.push(x);
        if (lv === 1) { selT = x; selM = null; selS = null; } else if (lv === 2) { selM = x; selS = null; } else selS = x;
        render();
        var el = $("cmCol" + lv).querySelector('.ci[data-i="' + (L.length - 1) + '"] .ci-name');
        if (el) { el.focus(); el.scrollIntoView({ block: "nearest" }); }
        return;
      }
      var p = at(e.target);
      if (!p) return;
      var L2 = list(p.lv), x2 = L2[p.i];
      if (e.target.getAttribute("data-f") === "del") { del(p, L2, x2); return; }
      if (/INPUT|LABEL/.test(e.target.tagName)) return;
      pickItem(p, x2);
    });
    function del(p, L2, x2) {
      var why = lockReasonNode(x2, p.lv);
      if (why) { say("'" + esc(x2.name) + "' 은(는) 지울 수 없습니다 — " + esc(why) + ". 그 연도에서 [계획 변경]을 연 뒤 하세요.", true); return; }
      var n = p.lv === 1 ? cnt(x2) : p.lv === 2 && !isLeafMid(x2) ? x2.kids.length : 0, amt = 0, links = 0;
      var leaves = p.lv === 1 ? [] : p.lv === 2 ? (isLeafMid(x2) ? [x2] : x2.kids) : [x2];
      if (p.lv === 1) x2.kids.forEach(function (m) { if (isLeafMid(m)) leaves.push(m); else leaves = leaves.concat(m.kids); });
      leaves.forEach(function (lf) { amt += amounts[lf.id] || 0; links += lf.dz.length; });
      var lastSub = p.lv === 3 && selM.kids.length === 1;
      var doDel = function () {
        L2.splice(p.i, 1);
        if (lastSub) { // 마지막 소분류: 중분류가 다시 계정. 연결 · 계획은 중분류로
          selM.dz = x2.dz;
          if (planMoves[x2.id] === selM.id) delete planMoves[x2.id]; else planMoves[selM.id] = x2.id;
        }
        if (x2 === selT) { selT = W[0] || null; selM = selT && selT.kids[0] || null; selS = selM && selM.kids[0] || null; }
        if (x2 === selM) { selM = selT && selT.kids[0] || null; selS = selM && selM.kids[0] || null; }
        if (x2 === selS) selS = selM && selM.kids[0] || null;
      };
      if (lastSub) ask("마지막 소분류 <b>" + esc(x2.name || "(이름 없음)") + "</b> 를 지웁니다. ‘" + esc(selM.name) + "’ 이(가) 다시 계정이 되고, 더존 연결 " + x2.dz.length + "개" + (amounts[x2.id] ? "와 계획" : "") + "은(는) 중분류로 돌아갑니다.", "지우기", doDel);
      else if (n || amt || links) ask("<b>" + esc(x2.name || "(이름 없음)") + "</b>" + (n ? " 과(와) 아래 " + n + "개" : "") + "를 지웁니다." +
        (links ? " 더존 연결 " + links + "개가 풀립니다." : "") + (amt ? ' <span class="em">' + S.year + "년 계획액 " + u(amt, true) + unitName() + "</span>도 빠집니다." : "") + " (저장 전까지는 [취소]로 되돌릴 수 있음)", "지우기", doDel);
      else { doDel(); render(); }
    }
    box.addEventListener("focusin", function (e) {
      var p = at(e.target);
      if (!p) return;
      var x = list(p.lv)[p.i];
      if ((p.lv === 1 && x === selT) || (p.lv === 2 && x === selM) || (p.lv === 3 && x === selS)) return;
      pickItem(p, x, true);
    });
    function pickItem(p, x, keepFocus) {
      if (p.lv === 1) { selT = x; selM = x.kids[0] || null; selS = selM && selM.kids[0] || null; }
      else if (p.lv === 2) { selM = x; selS = x.kids[0] || null; }
      else selS = x;
      if (keepFocus) { // 입력 중인 칸은 다시 그리지 않음
        $("cmCol" + p.lv).querySelectorAll(".ci").forEach(function (el) { el.classList.toggle("on", el === p.el); });
        render(p.lv + 1);
      } else render();
    }
    box.addEventListener("input", function (e) {
      var f = e.target.getAttribute("data-f");
      var lk = e.target.closest(".lk");
      if (lk && (f === "dzc" || f === "dzn")) {
        var d = curLeaf().dz[+lk.getAttribute("data-k")];
        if (f === "dzc") d.code = e.target.value.trim(); else d.name = e.target.value;
        return;
      }
      var p = at(e.target);
      if (!p || f !== "name") return;
      list(p.lv)[p.i].name = e.target.value;
      if (p.lv < 3) {
        var hd = $("cmCol" + (p.lv + 1)).querySelector(".cm-n");
        var x = list(p.lv)[p.i];
        if (hd && ((p.lv === 1 && x === selT) || (p.lv === 2 && x === selM))) hd.textContent = (x.name || "(이름 없음)") + " · " + (p.lv === 1 ? x.kids.length : x.kids.length);
      }
    });
    box.addEventListener("change", function (e) {
      var f = e.target.getAttribute("data-f");
      if (f === "dzmv") {
        var lf = curLeaf(), k = +e.target.closest(".lk").getAttribute("data-k"), to = selM.kids.filter(function (s) { return s.id === e.target.value; })[0];
        if (!to) return;
        var d = lf.dz.splice(k, 1)[0];
        to.dz.push(d);
        render(); say(esc(dzText(d)) + " 을(를) ‘" + esc(to.name) + "’ 로 옮겼습니다");
        return;
      }
      var p = at(e.target);
      if (!p || !f) return;
      var L = list(p.lv);
      if (f === "use") {
        var why = !e.target.checked && lockReason(L[p.i].id);
        if (why) { e.target.checked = true; say("사용 안 함으로 바꿀 수 없습니다 — " + esc(why), true); return; }
        L[p.i].use = e.target.checked; render();
      }
      if (f === "no") { var n = parseInt(e.target.value, 10); if (n >= 1) move(L, p.i, n - 1); render(); }
    });
    box.addEventListener("keydown", function (e) {
      if (e.target.id === "lkNew" && e.key === "Enter") { e.preventDefault(); addLink(); return; }
      if (e.key === "Enter" && e.target.getAttribute("data-f") === "no") { e.preventDefault(); e.target.blur(); }
      else if (e.key === "Enter" && e.target.getAttribute("data-f") === "name") {
        e.preventDefault();
        var p = at(e.target); if (p) { var b = $("cmCol" + p.lv).querySelector(".cm-add"); if (b && !b.hidden) b.click(); }
      }
    });
    // 끌어서 순서 바꾸기 / 다른 상위로 옮기기
    box.addEventListener("dragstart", function (e) {
      var p = at(e.target);
      if (!p || /INPUT/.test(e.target.tagName)) return;
      dragC = p;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "x");
      p.el.classList.add("dragging");
    });
    box.addEventListener("dragend", function () {
      dragC = null;
      box.querySelectorAll(".dragging,.drop-before,.drop-after,.drop-into").forEach(function (x) { x.classList.remove("dragging", "drop-before", "drop-after", "drop-into"); });
    });
    box.addEventListener("dragover", function (e) {
      if (!dragC) return;
      var p = at(e.target);
      box.querySelectorAll(".drop-before,.drop-after,.drop-into").forEach(function (x) { x.classList.remove("drop-before", "drop-after", "drop-into"); });
      if (!p) return;
      if (p.lv === dragC.lv && p.i !== dragC.i) {
        e.preventDefault();
        var r = p.el.getBoundingClientRect();
        p.el.classList.add(e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after");
      } else if (p.lv === dragC.lv - 1) {
        var parent = list(p.lv)[p.i], cur = dragC.lv === 2 ? selT : selM;
        if (parent !== cur) { e.preventDefault(); p.el.classList.add("drop-into"); }
      }
    });
    box.addEventListener("drop", function (e) {
      if (!dragC) return;
      var p = at(e.target);
      if (!p) return;
      e.preventDefault();
      var src = list(dragC.lv), x = src[dragC.i];
      if (p.lv === dragC.lv) {
        var before = p.el.classList.contains("drop-before"), target = src[p.i];
        src.splice(dragC.i, 1);
        src.splice(src.indexOf(target) + (before ? 0 : 1), 0, x);
      } else if (p.lv === dragC.lv - 1) {
        var parent = list(p.lv)[p.i], why = lockReasonNode(x, dragC.lv);
        if (why) { say("'" + esc(x.name) + "' 은(는) 다른 분류로 옮길 수 없습니다 — " + esc(why), true); dragC = null; return; }
        if (dragC.lv === 3 && isLeafMid(parent)) { say("'" + esc(parent.name) + "' 은(는) 소분류가 없는 중분류입니다. 먼저 [＋ 소분류 추가]로 나눈 뒤 옮기세요", true); dragC = null; return; }
        if (parent.kids.some(function (k) { return k.name === x.name; })) { say(esc(parent.name) + " 에 같은 이름 '" + esc(x.name) + "' 이(가) 있어 옮기지 않았습니다", true); dragC = null; return; }
        src.splice(dragC.i, 1);
        parent.kids.push(x);
        if (x === selM) { selM = selT && selT.kids[0] || null; selS = selM && selM.kids[0] || null; }
        if (x === selS) selS = selM && selM.kids[0] || null;
        dragC = null;
        render();
        say("'" + esc(x.name) + "' 을(를) " + esc(parent.name) + " (으)로 옮겼습니다");
        return;
      }
      dragC = null;
      render();
    });
  }

  // 업로드한 분류에 지금 분류의 ID 를 이어 붙임 (이름이 같으면 같은 것, 아니면 더존 코드로)
  function adoptIds(nc, oc) {
    var oT = {}, oM = {}, oMn = {}, oS = {}, used = {};
    oc.forEach(function (t) {
      oT[t.name] = t;
      t.kids.forEach(function (m) {
        oM[t.name + "\u0001" + m.name] = m;
        (oMn[m.name] = oMn[m.name] || []).push(m);
        m.kids.forEach(function (s) { oS[t.name + "\u0001" + m.name + "\u0001" + s.name] = s; });
      });
    });
    var take = function (x, o) { if (o && !used[o.id]) { x.id = o.id; used[o.id] = 1; return true; } return false; };
    nc.forEach(function (t) {
      take(t, oT[t.name]);
      t.kids.forEach(function (m) {
        if (!take(m, oM[t.name + "\u0001" + m.name])) { var c = oMn[m.name] || []; if (c.length === 1) take(m, c[0]); }
        m.kids.forEach(function (s) { take(s, oS[t.name + "\u0001" + m.name + "\u0001" + s.name]); });
      });
    });
    // 남은 계정: 더존 코드가 겹치는 이전 계정
    var oldByCode = {};
    eachLeaf(oc, function (t, m, s, lf) { lf.dz.forEach(function (d) { if (d.code) oldByCode[d.code] = lf; }); });
    eachLeaf(nc, function (t, m, s, lf) {
      if (lf.id) return;
      lf.dz.some(function (d) { var o = d.code && oldByCode[d.code]; return o && take(lf, o); });
    });
    // 중분류가 계정 ↔ 소분류가 생김 처럼 같은 ID 가 다른 칸이 된 경우는 새 ID
    var seenIds = {};
    nc.forEach(function (t) { t.kids.forEach(function (m) { [m].concat(m.kids).forEach(function (x) { if (x.id && seenIds[x.id]) x.id = ""; if (x.id) seenIds[x.id] = 1; }); }); });
  }

  function diffTable(d) {
    return '<table class="maptbl dif"><tr><th>구분</th><th>항목</th><th>바뀌기 전</th><th>바뀐 후</th></tr>' + d.map(function (x) {
      return '<tr><td class="t-' + ({ "추가": "add", "연결": "add", "삭제": "del", "해제": "del" }[x.k] || "chg") + '">' + esc(x.k) + "</td><td>" + esc(x.what) + "</td><td>" + (esc(x.before) || '<span class="mute">-</span>') + "</td><td>" + (esc(x.after) || '<span class="mute">-</span>') + "</td></tr>";
    }).join("") + "</table>";
  }

  /* ---------- 분류 버전 이력 (되돌리기 없음 — 그때 분류표를 복사해서 편집만) ---------- */
  function verDialog() {
    var list = S.ver.list.slice().reverse();
    if (!list.length) { toast("아직 버전 기록이 없습니다"); return; }
    var sel = list[0].v, full = false;
    function prevOf(v) { var p = null; S.ver.list.forEach(function (x) { if (x.v < v) p = x; }); return p; }
    function body() {
      var x = S.ver.list.filter(function (y) { return y.v === sel; })[0], p = prevOf(sel), snap = S.ver.snaps[sel];
      var h = '<div class="vh-title"><b>v' + x.v + "</b> " + (p ? "에서 바뀐 것 <span class=\"l\">v" + p.v + " → v" + x.v + " · " + esc(x.t) + "</span>" : "<span class=\"l\">처음 기록 · " + esc(x.t) + "</span>") + "</div>";
      if (full || !p) {
        var rows = [];
        if (snap) eachLeaf(snap, function (t, m, s, lf) { rows.push("<tr><td>" + esc(t.name) + "</td><td>" + esc(m.name) + "</td><td>" + esc(s ? s.name : "") + "</td><td>" + esc(lf.dz.map(dzText).join(", ")) + "</td><td>" + (lf.use === false ? "N" : "") + "</td></tr>"); });
        h += '<div class="vh-sub">v' + x.v + " 전체 분류표 · " + esc(snap ? catCounts(snap) : "") + "</div>" +
          '<div class="vh-scroll"><table class="maptbl"><tr><th>대분류</th><th>중분류</th><th>소분류</th><th>더존 과목</th><th>사용 안 함</th></tr>' + rows.join("") + "</table></div>";
      } else {
        var d = diffCat(S.ver.snaps[p.v] || [], snap || []);
        h += '<div class="vh-scroll">' + (d.length ? diffTable(d) : '<div class="cm-empty">바뀐 것이 없습니다</div>') + "</div>";
      }
      h += '<div class="vh-btns">' + (p ? '<button class="btn" id="vhFull">' + (full ? "바뀐 것만 보기" : "이 버전 전체 보기") + "</button>" : "") +
        '<button class="btn" id="vhDown">이 버전 양식 다운</button><span style="flex:1"></span>' +
        '<button class="btn primary" id="vhCopy"' + (sel === latestVer().v ? ' disabled title="지금 분류와 같습니다"' : "") + ">이 버전 복사해서 편집</button></div>" +
        '<div class="vh-tip">되돌리기는 없습니다. <b>복사해서 편집</b>은 v' + x.v + " 때 분류표를 분류 관리 화면에 불러올 뿐이고, 확인 후 [저장]해야 <b>새 버전</b>(v" + (latestVer().v + 1) + ")이 됩니다. 지난 버전 기록과 계획 입력값은 그대로 남습니다.</div>";
      return h;
    }
    function listHtml() {
      return list.map(function (x) {
        return '<div class="vi' + (x.v === sel ? " on" : "") + '" data-v="' + x.v + '"><div><b>v' + x.v + "</b>" + (x === list[0] ? '<span class="cur">현재</span>' : "") + '<span class="d">' + esc(x.t.slice(0, 16)) + "</span></div>" +
          '<div class="s">' + esc(x.kind) + " · " + esc(x.sum) + "</div>" + (x.memo ? '<div class="m">' + esc(x.memo) + "</div>" : "") + "</div>";
      }).join("");
    }
    function draw() {
      $("vhList").innerHTML = listHtml();
      $("vhBody").innerHTML = body();
      var f = $("vhFull"); if (f) f.addEventListener("click", function () { full = !full; draw(); });
      $("vhDown").addEventListener("click", function () { Store.downloadTemplate(S.ver.snaps[sel] || [], "분류관리_양식_v" + sel + ".xlsx"); toast("v" + sel + " 양식을 내려받았습니다"); });
      $("vhCopy").addEventListener("click", function () {
        if (sel === latestVer().v) return;
        catDialog({ cat: S.ver.snaps[sel], kind: "버전 복사", memo: "v" + sel + " 분류표를 복사해서 편집" });
        $("cmMsg").innerHTML = "v" + sel + " 분류표를 불러왔습니다 — 확인하고 [저장]하면 v" + (latestVer().v + 1) + " 이 됩니다";
      });
    }
    openDialog({
      title: "분류 버전 이력", crumb: "분류 관리 › 저장할 때마다 기록 · 모두 " + list.length + "개", width: 1060, okText: null, cancelText: "닫기",
      body: '<div class="vh"><div class="vh-list" id="vhList"></div><div class="vh-body" id="vhBody"></div></div>'
    });
    $("vhList").addEventListener("click", function (e) {
      var it = e.target.closest(".vi");
      if (!it) return;
      sel = +it.getAttribute("data-v"); full = false; draw();
    });
    draw();
  }

  /* ---------- 계획 마감 · 변경 ---------- */
  function snapNow() {
    var snap = {}, total = 0;
    S.rows.forEach(function (r) {
      var c = r._c || Calc.compute(r, S.settings);
      var e = clone(planFor(r.id));
      e.l1 = r.l1; e.l2 = r.l2; e.l3 = r.l3; e.plan = c.plan; e.months = c.months.slice();
      snap[r.id] = e; total += c.plan;
    });
    return { snap: snap, total: total };
  }
  function lockDone(msg) {
    clearUndo();
    addLog(msg);
    keepYearLock();
    deriveRows(); renderAll(); scheduleSave();
    toast(msg, false, 3000);
  }
  // 마감 전 검증: 목록을 보고 확인 체크해야 마감. 비율 합 오류는 고쳐야 함
  function closePlan() {
    if (!S.year || isClosed()) return;
    var R = LAST, open = isChanging(), cur = curRound(), n = open ? cur.n : 0, base = lastClosed();
    var rows = S.rows.filter(function (r) { return !r.out; }), t = R.tot.plan;
    var big = function (r) { return !r._c.missing && (r._c.yoy === Infinity || (isFinite(r._c.yoy) && Math.abs(r._c.yoy) >= 0.3)); };
    var items = [
      { k: "ratio", lv: "stop", title: "월 비율 합이 100%가 아님", tip: "고쳐야 마감할 수 있습니다", list: rows.filter(function (r) { return r._c.check; }) },
      { k: "miss", lv: "need", title: "입력 필요 (산출 방식 없음)", tip: "0원으로 마감하려면 아래에 체크", list: rows.filter(function (r) { return r._c.missing; }) },
      { k: "manual", lv: "warn", title: "월 금액을 직접 고쳐 산출 금액과 다름", list: rows.filter(function (r) { return r._c.manualDiff && r.meth !== "수기"; }), val: function (r) { return "산출 대비 " + (r._c.manualDiff > 0 ? "+" : "△") + Calc.fmtWon(Math.abs(r._c.manualDiff)); } },
      { k: "big", lv: "warn", title: "전년 대비 ±30% 이상 변동", list: rows.filter(big), val: function (r) { return Calc.fmtPct(r._c.yoy) + (r.memo ? " · " + r.memo : " · 메모 없음"); } },
      { k: "new", lv: "info", title: "전년 실적 없음 (신규 계획)", list: rows.filter(function (r) { return !Calc.num(r.prev) && !r._c.missing && r._c.plan; }) },
      { k: "nodz", lv: "info", title: "더존 과목 연결 없음 (실적이 안 들어옴)", list: rows.filter(function (r) { return !r.dz.length; }) }
    ];
    var monthOk = rows.every(function (r) { return Math.round(r._c.months.reduce(function (x, y) { return x + y; }, 0) - r._c.plan) === 0; });
    var stop = items[0].list.length, miss = items[1].list.length;
    var icon = { stop: "✖", need: "!", warn: "⚠", info: "ℹ" };
    var body = '<div class="mdl-pad"><div class="ck-sum"><div><span>' + S.year + "년 계획 " + roundLabel(n) + '</span><b>' + Calc.fmtWon(t) + "원</b></div>" +
      "<div><span>전년 대비</span><b>" + (Calc.fmtPct(R.tot.prev ? t / R.tot.prev - 1 : NaN) || "-") + "</b></div>" +
      (base ? "<div><span>" + roundLabel(base.n) + " 대비</span><b>" + (t - base.total >= 0 ? "+" : "") + Calc.fmtWon(t - base.total) + "원</b><small>바뀐 계정 " + R.changed + "개</small></div>" : "") +
      "<div><span>계정</span><b>" + rows.length + "개</b>" + (R.outs ? "<small>계획 외 " + R.outs + "개 제외</small>" : "") + "</div></div>" +
      '<div class="vk"><div class="vk-i ok"><span class="vk-ic">✓</span><b>월 합계 = 확정 계획액</b><span class="vk-n">' + (monthOk ? "모두 맞음" : "확인 필요") + "</span></div>" +
      items.map(function (x, i) {
        var lv = x.list.length ? x.lv : "ok";
        return '<div class="vk-i ' + lv + '" data-i="' + i + '"><span class="vk-ic">' + (x.list.length ? icon[x.lv] : "✓") + "</span><b>" + x.title + '</b><span class="vk-n">' + (x.list.length ? x.list.length + "개" : "없음") + "</span>" +
          (x.list.length ? '<button class="btn sm" data-vk="' + i + '">보기 ▾</button>' : "") + (x.list.length && x.tip ? '<span class="vk-tip">' + x.tip + "</span>" : "") +
          '<div class="vk-list" hidden>' + x.list.map(function (r) {
            return '<a data-go="' + esc(r.id) + '">' + esc(r.l1 + " › " + rowLabel(r)) + (x.val ? ' <small>' + esc(x.val(r)) + "</small>" : "") + "</a>";
          }).join("") + "</div></div>";
      }).join("") + "</div>" +
      (miss ? '<label class="vk-c"><input type="checkbox" id="vkZero"> 입력 필요 ' + miss + "개 계정은 <b>0원</b>으로 마감합니다</label>" : "") +
      (open ? '<div class="f-row" style="margin-top:8px"><label>변경 사유</label><input class="inp plain" id="lkReason" value="' + esc(cur.reason) + '" placeholder="선택 — 예: 하반기 인원 충원"></div>' : "") +
      '<label class="vk-c"><input type="checkbox" id="vkOk"> 위 검증 내용을 확인했습니다. 마감하면 계획 금액 · 산출 방식 · 전년 실적 · 반올림 설정을 바꿀 수 없고, 금액 있는 계정은 분류에서 옮기거나 지울 수 없습니다 (바꾸려면 [계획 변경]).</label>' +
      (stop ? '<div class="pv-warn">✖ 월 비율 합이 100%가 아닌 계정을 먼저 고치세요.</div>' : "") + "</div>";
    openDialog({
      title: (open ? roundLabel(n) + " 마감" : "계획 마감") + " — 검증", crumb: S.year + "년 사업비 계획 · 항목을 누르면 그 계정으로 갑니다", width: 720, body: body,
      okText: open ? "변경 마감" : "마감", focus: false, enterOk: false,
      onOk: function () {
        if (stop || !$("vkOk").checked || (miss && !$("vkZero").checked)) return false;
        var s = snapNow(), now = Store.stamp();
        if (open) { cur.closedAt = now; cur.snap = s.snap; cur.total = s.total; cur.reason = $("lkReason").value.trim(); }
        else S.lock.rounds.push({ n: 0, closedAt: now, openedAt: "", reason: "", total: s.total, snap: s.snap });
        S.lock.state = "closed";
        lockDone(S.year + "년 계획 " + roundLabel(n) + " 마감 — 합계 " + Calc.fmtWon(s.total) + "원");
      }
    });
    var ok = dlg.el.querySelector("[data-ok]");
    var sync = function () { ok.disabled = !!(stop || !$("vkOk").checked || (miss && !$("vkZero").checked)); };
    dlg.el.addEventListener("change", sync);
    sync();
    dlg.el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-vk]");
      if (b) { var l = b.parentNode.querySelector(".vk-list"); l.hidden = !l.hidden; b.textContent = l.hidden ? "보기 ▾" : "접기 ▴"; return; }
      var go = e.target.closest("[data-go]");
      if (go) {
        var id = go.getAttribute("data-go"), r = rowBy(id);
        closeDialog();
        UI.nav = { t: "", m: "", s: "" }; UI.filters = {}; UI.onlyWarn = false; UI.search = ""; $("search").value = "";
        if (r) delete UI.collapsed[r.l1];
        renderAll();
        setCell(id, "plan", true);
        toast("계정으로 이동했습니다 — 고친 뒤 다시 [" + (open ? "변경 마감" : "계획 마감") + "]");
      }
    });
  }
  function openChange() {
    if (!isClosed()) return;
    var base = lastClosed(), n = base.n + 1;
    openDialog({
      title: "계획 변경", crumb: S.year + "년 사업비 계획 › " + roundLabel(n), width: 540,
      body: '<div class="mdl-pad msg">마감된 <b>' + roundLabel(base.n) + "</b> 계획을 열어 <b>" + roundLabel(n) + "</b>을 시작합니다.<br>" +
        "전체 계정이 열립니다. 고치는 동안 표에 <b>‘변경 전’</b> 열(" + roundLabel(base.n) + " 금액)이 함께 보이고, 바뀐 계정에는 <span class=\"flag chgf\">변경</span> 표시가 붙습니다.<br>" +
        "다 고친 뒤 <b>[변경 마감]</b>을 누르면 " + roundLabel(n) + "으로 기록됩니다. 그만두려면 <b>[변경 취소]</b>." +
        '<div class="f-row" style="margin-top:10px"><label>변경 사유</label><input class="inp plain" id="lkReason" placeholder="선택 — 예: 하반기 인원 충원"></div></div>',
      okText: roundLabel(n) + " 시작",
      onOk: function () {
        var reason = $("lkReason").value.trim();
        S.lock.rounds.push({ n: n, closedAt: "", openedAt: Store.stamp(), reason: reason, total: 0, snap: {} });
        S.lock.state = "open";
        lockDone(S.year + "년 계획 " + roundLabel(n) + " 시작" + (reason ? " — 사유: " + reason : ""));
      }
    });
  }
  function cancelChange() {
    if (!isChanging()) return;
    var cur = curRound(), base = lastClosed();
    openDialog({
      title: "변경 취소", crumb: S.year + "년 사업비 계획 › " + roundLabel(cur.n), width: 500, danger: true,
      body: '<div class="mdl-pad msg"><b>' + roundLabel(cur.n) + "</b>에서 고친 계획을 모두 버리고 <b>" + roundLabel(base.n) + "</b> 마감 상태로 돌아갑니다.<br>" +
        "계획 입력값만 되돌아가고, 그동안 바꾼 분류(추가 · 이동 · 더존 연결)는 그대로 남습니다.</div>",
      okText: "변경 버리기",
      onOk: function () {
        Object.keys(S.plan).forEach(function (id) {
          if (base.snap[id]) return;
          var p = S.plan[id], b = Calc.blankPlan();
          b.prev = p.prev; if (p.out) b.out = true;
          S.plan[id] = b;
        });
        Object.keys(base.snap).forEach(function (id) {
          var e = base.snap[id];
          setPlan(id, { prev: e.prev, meth: e.meth, a: e.a, b: e.b, c: e.c, t: e.t, auto: e.auto, split: e.split, sv: e.sv, memo: e.memo, out: !!e.out });
        });
        S.lock.rounds.pop();
        S.lock.state = "closed";
        lockDone(roundLabel(cur.n) + " 취소 — " + roundLabel(base.n) + " 마감 상태로 돌아감");
      }
    });
  }
  function roundsDialog() {
    var rs = S.lock.rounds;
    if (!rs.length) { toast("아직 마감한 적이 없습니다"); return; }
    var sel = rs[rs.length - 1].n;
    function amounts(rd) {
      if (rd.closedAt) return rd.snap;
      var o = {}; S.rows.forEach(function (r) { o[r.id] = { l1: r.l1, l2: r.l2, l3: r.l3, plan: r._c.plan }; }); return o;
    }
    function body() {
      var i = rs.map(function (r) { return r.n; }).indexOf(sel), rd = rs[i], pv = i > 0 ? rs[i - 1] : null;
      var a = amounts(rd), b = pv ? pv.snap : null, rows = [];
      var ids = Object.keys(a);
      if (b) Object.keys(b).forEach(function (id) { if (!a[id]) ids.push(id); });
      ids.forEach(function (id) {
        var x = a[id] || b[id], na = a[id] ? a[id].plan : 0, nb = b && b[id] ? b[id].plan : 0;
        if (b && Math.round(na - nb) === 0) return;
        rows.push("<tr><td>" + esc(x.l1 + " › " + (x.l3 ? x.l2 + " › " + x.l3 : x.l2)) + "</td>" + (b ? '<td class="n">' + Calc.fmtWon(nb) + "</td>" : "") +
          '<td class="n">' + Calc.fmtWon(na) + "</td>" + (b ? '<td class="n">' + (na - nb >= 0 ? "+" : "") + Calc.fmtWon(na - nb) + "</td>" : "") + "</tr>");
      });
      var tot = 0; Object.keys(a).forEach(function (id) { tot += a[id].plan; });
      return '<div class="vh-title"><b>' + roundLabel(rd.n) + "</b> <span class=\"l\">" + (rd.closedAt ? esc(rd.closedAt) + " 마감" : "변경 중 (아직 마감 안 함)") + (rd.reason ? " · 사유: " + esc(rd.reason) : "") + "</span></div>" +
        '<div class="vh-sub">합계 <b>' + Calc.fmtWon(tot) + "원</b>" + (pv ? " · " + roundLabel(pv.n) + " " + Calc.fmtWon(pv.total) + "원 대비 " + (tot - pv.total >= 0 ? "+" : "") + Calc.fmtWon(tot - pv.total) + "원 · 바뀐 계정 " + rows.length + "개" : " · 계정 " + rows.length + "개") + "</div>" +
        '<div class="vh-scroll"><table class="maptbl"><tr><th>계정</th>' + (pv ? "<th>" + roundLabel(pv.n) + "</th>" : "") + "<th>" + roundLabel(rd.n) + "</th>" + (pv ? "<th>차이</th>" : "") + "</tr>" +
        (rows.length ? rows.join("") : '<tr><td colspan="4" class="mute">바뀐 계정이 없습니다</td></tr>') + "</table></div>";
    }
    function draw() {
      $("rdList").innerHTML = rs.slice().reverse().map(function (r) {
        return '<div class="vi' + (r.n === sel ? " on" : "") + '" data-n="' + r.n + '"><div><b>' + roundLabel(r.n) + "</b>" + (!r.closedAt ? '<span class="cur">변경 중</span>' : "") + '<span class="d">' + esc((r.closedAt || r.openedAt).slice(0, 16)) + "</span></div>" +
          '<div class="s">' + (r.closedAt ? "합계 " + Calc.fmtWon(r.total) + "원" : "시작 " + esc(r.openedAt.slice(0, 16))) + "</div>" + (r.reason ? '<div class="m">' + esc(r.reason) + "</div>" : "") + "</div>";
      }).join("");
      $("rdBody").innerHTML = body();
    }
    openDialog({
      title: "계획 변경 기록", crumb: S.year + "년 사업비 계획 · 계획 대비 실적은 마지막 마감본(최종 변경안) 기준", width: 900, okText: null, cancelText: "닫기",
      body: '<div class="vh"><div class="vh-list" id="rdList"></div><div class="vh-body" id="rdBody"></div></div>'
    });
    $("rdList").addEventListener("click", function (e) { var it = e.target.closest(".vi"); if (!it) return; sel = +it.getAttribute("data-n"); draw(); });
    draw();
  }

  /* ---------- 연도 ---------- */
  function fillYearSelect() {
    $("selYear").innerHTML = S.years.map(function (y) { return '<option value="' + y + '"' + (y === S.year ? " selected" : "") + ">" + y + "년</option>"; }).join("") +
      '<option value="new">＋ 새 연도…</option>';
  }

  // 0.1 판 파일(코드로 연결)을 분류 ID 로 옮김. 분류에 없으면 새로 만듦
  function adoptLegacy(legacy) {
    var plan = {};
    legacy.slice().sort(function (a, b) { return a.code.localeCompare(b.code, "ko", { numeric: true }); }).forEach(function (x) {
      var hit = null;
      eachLeaf(S.cat, function (t, m, s, lf) { if (!hit && x.code && lf.dz.some(function (d) { return d.code === x.code; })) hit = lf; });
      if (!hit) eachLeaf(S.cat, function (t, m, s, lf) { if (!hit && s && s.name === x.l3 && m.name === x.l2) hit = lf; });
      if (!hit) {
        var top = topBy(x.l1 || "(대분류 없음)") || pushTop(x.l1 || "(대분류 없음)"), mid = midBy(top, x.l2 || "(중분류 없음)") || pushMid(top, x.l2 || "(중분류 없음)");
        hit = { id: newId("A"), name: x.l3 || x.code, use: true, dz: x.code ? [{ code: x.code, name: "" }] : [] };
        mid.kids.push(hit);
        masterDirty = true;
      }
      plan[hit.id] = x.entry;
    });
    return plan;
  }

  // 분류가 바뀌어 계정이 아니게 된 ID 의 입력값 (예: 다른 연도에서 중분류를 소분류로 나눔) → 첫 소분류로
  function adoptOrphans() {
    var leaves = leafIds(S.cat), moved = [];
    Object.keys(S.plan).forEach(function (id) {
      if (leaves[id]) return;
      S.cat.forEach(function (t) {
        t.kids.forEach(function (m) {
          if (m.id !== id || isLeafMid(m)) return;
          var first = m.kids[0];
          if (!S.plan[first.id] || !S.plan[first.id].meth) { S.plan[first.id] = S.plan[id]; moved.push(m.name + " → " + first.name); }
        });
      });
      delete S.plan[id];
    });
    return moved;
  }

  function loadYear(y) {
    return Store.load(y).then(function (st) {
      keepYearLock();
      S.year = st.year; S.settings = st.settings; S.log = st.log; S.lock = st.lock;
      var converted = false;
      if (st.legacy) { S.plan = adoptLegacy(st.legacy); converted = true; }
      else S.plan = st.plan;
      X = blankX(y); PREVX = null; XJN = null; XU.upto = 0; XU.sel = null;
      var moved = adoptOrphans();
      if (moved.length) { addLog("소분류로 나뉜 계정의 입력값을 첫 소분류로 옮김: " + moved.join(", ")); converted = true; }
      undoStack = []; redoStack = [];
      deriveRows();
      UI.sel = S.rows.length ? S.rows[0].id : null;
      UI.nav = { t: "", m: "", s: "" }; UI.collapsed = {};
      try { localStorage.setItem("budget.lastYear", String(y)); } catch (e) { /* 저장소 막힘 */ }
      syncSettingSelects();
      fillYearSelect();
      renderAll();
      setSave("ok", st.savedAt ? "마지막 저장 " + st.savedAt.slice(5, 16) : "불러옴");
      loadExecFor(y);
      if (st.legacy) {
        addLog("0.1 판 파일을 새 형식(분류 ID)으로 바꿈");
        toast("이전 형식 파일을 새 형식으로 바꿨습니다 (분류는 " + Store.MASTER + ")", false, 4000);
      }
      if (converted || masterDirty) scheduleSave();
    }, function (e) {
      toast(y + "년 파일을 읽지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }

  // 이 연도 집행 자료 + 전년 집행 메모 (다음 해 계획에서 참고)
  function loadExecFor(y) {
    return Promise.all([Store.loadExec(y).catch(function () { return null; }), Store.loadExec(y - 1).catch(function () { return null; })]).then(function (r) {
      if (S.year !== y) return;
      X = r[0] || blankX(y); PREVX = r[1];
      if (MODE === "exec") renderAll();
    });
  }
  function switchYear(y) { return flushSave().then(function () { return loadYear(y); }); }

  /* 새 연도: 전년 '실적'(집행)을 전년 실적으로 가져옴 (전년 계획을 복사하지 않음)
     집행이 연중이면 연말 예상(1~M월 집행 + 남은 달 계획) 또는 있는 달만 */
  function baseYearInfo(y0) {
    var ex = S.year === y0 && X && X.year === y0 ? Promise.resolve(X) : Store.loadExec(y0).catch(function () { return null; });
    var pl = S.year === y0 ? Promise.resolve({ lock: S.lock, plan: S.plan, settings: S.settings }) : Store.load(y0).catch(function () { return null; });
    return Promise.all([ex, pl]).then(function (r) {
      var x = r[0], st = r[1], acts = {}, pmon = {}, M = x ? x.month : 0;
      if (x && x.lines.length) {
        var ix = dzIndex();
        x.lines.forEach(function (l) { if (ix.excluded(l)) return; var id = ix.leaf(l); if (id) (acts[id] = acts[id] || new Array(12).fill(0))[l.m - 1] += l.amt; });
      }
      if (st) {
        var rd = null;
        (st.lock && st.lock.rounds || []).forEach(function (q) { if (q.closedAt) rd = q; });
        if (rd) Object.keys(rd.snap).forEach(function (id) { pmon[id] = rd.snap[id].months.slice(); });
        else Object.keys(st.plan || {}).forEach(function (id) { var e = st.plan[id]; if (e.meth) pmon[id] = Calc.compute(e, st.settings).months; });
      }
      return { y0: y0, M: M, acts: acts, pmon: pmon, hasPlan: !!st, label: rd ? Store.roundLabel(rd.n) : "계획" };
    });
  }
  function newYearDialog() {
    var def = S.years.length ? Math.max.apply(null, S.years) + 1 : new Date().getFullYear() + 1;
    var info = null, mode = "act", how = "fc";
    function opts() {
      var y0 = info ? info.y0 : def - 1, M = info ? info.M : 0, ok = M > 0;
      var o = function (v, title, sub, dis) {
        return '<label class="opt' + (v === mode ? " on" : "") + '"' + (dis ? ' style="opacity:.45;pointer-events:none"' : "") + '><input type="radio" name="nyMode" value="' + v + '"' + (v === mode ? " checked" : "") + (dis ? " disabled" : "") + "><div><b>" + title + "</b><small>" + sub + "</small></div></label>";
      };
      return o("act", y0 + "년 실적으로 시작 (추천)", ok ? y0 + "년 집행 1~" + M + "월(더존 분개장)을 <b>전년 실적</b>으로 넣습니다. 산출 방식은 비워 두고 새로 잡습니다." +
          (M < 12 ? '<span class="ny-how"><label><input type="radio" name="nyHow" value="fc"' + (how === "fc" ? " checked" : "") + "> 연말 예상 = 1~" + M + "월 집행 + " + (M + 1) + "~12월 " + (info.hasPlan ? y0 + "년 " + info.label : "계획") + "</label>" +
            '<label><input type="radio" name="nyHow" value="act"' + (how === "act" ? " checked" : "") + "> 집행 있는 달만 (1~" + M + "월)</label></span>" : "") :
          y0 + "년 집행 자료가 없습니다. 빈 계획으로 만든 뒤 [전년 실적 가져오기]로 더존 손익 파일을 넣으세요.", !ok) +
        o("empty", "빈 계획으로 시작", "분류(계정)는 그대로 쓰고 계획 입력값 · 전년 실적을 비웁니다. 전년 실적은 [전년 실적 가져오기]로 넣을 수 있습니다." + (leafCount(S.cat) ? "" : " 분류가 아직 없으면 만든 뒤 분류 관리가 열립니다."));
    }
    function load() {
      var y = parseInt($("nyYear").value, 10);
      if (!(y >= 2000 && y <= 2100)) return;
      baseYearInfo(y - 1).then(function (r) { info = r; if (!r.M && mode === "act") mode = "empty"; else if (r.M) mode = mode || "act"; $("nyOpts").innerHTML = opts(); });
    }
    openDialog({
      title: "새 연도 만들기", width: 560,
      body: '<div class="mdl-pad"><div class="f-row"><label>계획 연도</label><input class="inp num" id="nyYear" data-kind="int" value="' + def + '" style="width:120px"></div><div id="nyOpts">' + opts() + '</div><div class="pv-warn" id="nyErr"></div></div>',
      okText: "만들기",
      onOk: function () {
        var y = parseInt($("nyYear").value, 10);
        var m = (document.querySelector('input[name="nyMode"]:checked') || {}).value;
        how = (document.querySelector('input[name="nyHow"]:checked') || {}).value || "act";
        if (!(y >= 2000 && y <= 2100)) { $("nyErr").textContent = "2000 ~ 2100 사이 연도를 넣으세요."; return false; }
        if (S.years.indexOf(y) >= 0) { $("nyErr").textContent = y + "년 파일이 이미 있습니다. 연도 목록에서 고르세요."; return false; }
        if (m === "act" && (!info || info.y0 !== y - 1 || !info.M)) { $("nyErr").textContent = (y - 1) + "년 집행 자료가 없습니다."; return false; }
        createYear(y, m, m === "act" ? { info: info, how: how } : null);
      }
    });
    $("nyYear").addEventListener("change", load);
    dlg.el.addEventListener("change", function (e) {
      if (e.target.name === "nyMode") { mode = e.target.value; document.querySelectorAll("#nyOpts .opt").forEach(function (o) { o.classList.toggle("on", o.querySelector("input").checked); }); }
      if (e.target.name === "nyHow") how = e.target.value;
    });
    load();
  }

  function createYear(y, mode, base) {
    flushSave().then(function () {
      var plan = {}, note = "";
      if (base) {
        var I = base.info, M = I.M;
        eachLeaf(S.cat, function (t, m, s, lf) {
          var a = I.acts[lf.id] || new Array(12).fill(0), pm = a.slice(), pl = I.pmon[lf.id] || new Array(12).fill(0);
          for (var i = M; i < 12; i++) pm[i] = base.how === "fc" ? pl[i] : 0;
          var p = Calc.blankPlan();
          p.pm = pm; p.prev = pm.reduce(function (x, v) { return x + v; }, 0);
          if (p.prev || a.some(function (v) { return v; })) plan[lf.id] = p;
        });
        note = " (전년 실적 = " + I.y0 + "년 " + (base.how === "fc" && M < 12 ? "1~" + M + "월 집행 + " + (M + 1) + "~12월 " + I.label + " = 연말 예상" : "1~" + M + "월 집행") + ")";
      }
      keepYearLock();
      S.year = y; S.plan = plan; S.lock = { state: "draft", rounds: [] };
      X = blankX(y); PREVX = null; XJN = null;
      S.log = [{ t: Store.stamp(), m: y + "년 파일 만듦" + note }];
      undoStack = []; redoStack = [];
      deriveRows();
      UI.sel = S.rows.length ? S.rows[0].id : null;
      var m = masterDirty;
      masterDirty = false;
      return (m ? Store.saveMaster(S.cat, S.ver, S.exclude) : Promise.resolve()).then(function () { return Store.save(S); });
    }).then(function () { return Store.listYears(); }).then(function (ys) {
      S.years = ys; fillYearSelect(); syncSettingSelects(); loadExecFor(y); setMode("plan"); renderAll();
      setSave("ok", "자동 저장됨 " + Store.stamp().slice(11, 16));
      toast(y + "년 파일을 만들었습니다 — data\\" + Store.fileName(y) + (base ? " · 전년 실적을 넣었습니다. 산출 방식은 [일괄 적용]으로 한 번에 넣을 수 있습니다" : ""), false, 5000);
      if (!leafCount(S.cat)) setTimeout(catDialog, 300);
    }).catch(function (e) { toast("새 연도를 만들지 못했습니다: " + (e && e.message || e), true, 6000); });
  }

  /* ---------- 계획 전체 양식 다운 · 업로드 ---------- */
  var PT_HEAD = ["ID", "대분류", "중분류", "소분류", "더존코드", "전년실적", "산출방식", "증감률(%)", "금액·단가(원)", "인원·수량", "개월", "총액(원)", "자동칸", "분할"]
    .concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return m + "월"; })).concat(["메모"]);
  var AUTO_NAME = { a: "월액", b: "인원", c: "개월", t: "" };
  function planTplDown() {
    var wb = XLSX.utils.book_new(), aoa = [PT_HEAD];
    S.rows.forEach(function (r) {
      var pct = r.meth === "%증감", qty = Calc.isQty(r.meth);
      aoa.push([r.id, r.l1, r.l2, r.l3, r.dz.map(function (d) { return d.code; }).filter(Boolean).join(","), r.prev || "", r.meth, pct ? Math.round(Calc.num(r.a) * 100000) / 1000 : "", pct ? "" : r.a || "",
        qty ? r.b || "" : "", qty ? r.c || "" : "", qty && r.auto !== "t" ? r.t || "" : "", qty && r.auto && r.auto !== "t" ? (r.meth === "단가×수량" ? { a: "단가", b: "수량", c: "개월" } : AUTO_NAME)[r.auto] : "", r.meth ? r.split : ""]
        .concat(r.sv.map(function (v) { return !r.meth || r.split === "균등" ? "" : r.split === "비율" ? Math.round(Calc.num(v) * 100000) / 1000 : v || ""; })).concat([r.memo]));
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [7, 12, 20, 14, 10, 14, 10, 9, 14, 9, 6, 14, 8, 7].concat(new Array(12).fill(11)).concat([28]).map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, "계획");
    var ref = [["대분류", "중분류", "소분류", "확정계획액"].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return m + "월"; }))];
    S.rows.forEach(function (r) { var c = Calc.compute(r, S.settings); ref.push([r.l1, r.l2, r.l3, c.plan].concat(c.months)); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ref), "참고_월별계획");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["작성 방법"],
      ["• '계획' 시트만 읽습니다. 한 줄 = 계정 하나. ID 가 있으면 ID 로, 없으면 대분류 › 중분류 › 소분류 이름으로, 그래도 없으면 더존코드로 계정을 찾습니다."],
      ["• 계정을 새로 만들지는 않습니다 (분류 관리에서 먼저 만드세요). 파일에 없는 계정은 그대로 둡니다."],
      ["• 산출방식: %증감 · 절대증감 · 인원 · 단가×수량 · 수기 중 하나. 비우고 1~12월에 금액만 쓰면 '수기'(월 금액 그대로)로 들어갑니다."],
      ["• %증감 = 증감률(%) 칸 (3 = 3%). 절대증감 · 수기 = 금액·단가 칸(원). 인원 · 단가×수량 = 금액·단가 × 인원·수량 × 개월."],
      ["• 역산: 자동칸에 월액(단가) · 인원(수량) · 개월 중 하나를 쓰면 그 칸을 총액으로 계산합니다 (총액이 비면 전년 실적)."],
      ["• 분할: 균등 · 수기 · 비율. 수기면 1~12월 = 원, 비율이면 1~12월 = % (합 100)."],
      ["• 금액은 모두 원 단위. '참고_월별계획' 시트는 내려받을 때의 계산 결과(보기용)입니다."],
      ["• 올리면 바로 바뀌지 않고, 바뀌는 계정 · 합계를 먼저 보여 줍니다. [적용] 후에도 Ctrl+Z 로 되돌릴 수 있습니다."]]), "안내");
    var name = "계획양식_" + S.year + "_" + Store.stamp(null, true).slice(0, 8) + ".xlsx";
    Store.download(wb, name);
    toast("계획 양식을 내려받았습니다 — " + name);
  }
  function planTplUp() {
    if (guardClosed("계획을 올리려면")) return;
    var fi = document.createElement("input");
    fi.type = "file"; fi.accept = ".xlsx,.xls";
    fi.addEventListener("change", function () {
      var f = fi.files[0];
      if (f) Store.readAnyFile(f).then(function (sh) { planTplPreview(f.name, sh); }, function (e) { toast("파일을 읽지 못했습니다: " + (e && e.message || e), true); });
    });
    fi.click();
  }
  function planTplPreview(fname, sheets) {
    var sh = sheets.filter(function (x) { return x.name === "계획"; })[0] || sheets[0], aoa = sh.aoa, head = -1, C = {};
    for (var r0 = 0; r0 < Math.min(10, aoa.length) && head < 0; r0++) {
      var row0 = (aoa[r0] || []).map(function (v) { return nm(v); });
      if (row0.indexOf("대분류") >= 0 && row0.indexOf("산출방식") >= 0) { head = r0; PT_HEAD.forEach(function (h) { C[h] = row0.indexOf(nm(h)); }); }
    }
    if (head < 0) { toast("'대분류' · '산출방식' 머리글을 찾지 못했습니다. [계획 양식 다운]으로 받은 파일을 쓰세요", true, 5000); return; }
    var g = function (row, h) { return C[h] >= 0 ? row[C[h]] : ""; }, str = function (v) { return String(v === undefined || v === null ? "" : v).trim(); }, has = function (v) { return str(v) !== ""; };
    var leaves = leafIds(S.cat), byPath = {}, byCode = {};
    S.allRows.forEach(function (r) { byPath[nm(r.l1) + "|" + nm(r.l2) + "|" + nm(r.l3)] = r.id; r.dz.forEach(function (d) { if (d.code) byCode[d.code] = r.id; }); });
    var res = [], miss = [], errs = [], seen = {};
    aoa.slice(head + 1).forEach(function (row, i) {
      row = row || [];
      var line = head + i + 2, id = str(g(row, "ID")), l1 = str(g(row, "대분류")), l2 = str(g(row, "중분류")), l3 = str(g(row, "소분류"));
      if (!id && !l1 && !l2) return;
      if (!leaves[id]) id = byPath[nm(l1) + "|" + nm(l2) + "|" + nm(l3)] || str(g(row, "더존코드")).split(",").map(function (c) { return byCode[c.trim()]; }).filter(Boolean)[0] || "";
      if (!id) { miss.push(line + "번째 줄: " + [l1, l2, l3].filter(Boolean).join(" › ")); return; }
      if (seen[id]) { errs.push(line + "번째 줄: 같은 계정이 또 있음 (" + seen[id] + "번째 줄) — 건너뜀"); return; }
      seen[id] = line;
      var cur = rowBy(id);
      if (!cur) { miss.push(line + "번째 줄: 사용 안 함 계정"); return; }
      if (cur.out) return;
      var p = clone(planFor(id)), meth = str(g(row, "산출방식")), split = str(g(row, "분할")) || "균등";
      var ms = [], anyM = false;
      for (var m = 1; m <= 12; m++) { var v = g(row, m + "월"); if (has(v)) anyM = true; ms.push(Calc.num(v)); }
      if (has(g(row, "전년실적"))) p.prev = Calc.num(g(row, "전년실적"));
      if (meth && Calc.METHODS.indexOf(meth) < 0) { errs.push(line + "번째 줄: 산출방식 '" + meth + "' 을(를) 모름 — 건너뜀"); return; }
      if (Calc.SPLITS.indexOf(split) < 0) { errs.push(line + "번째 줄: 분할 '" + split + "' → 균등으로"); split = "균등"; }
      if (!meth && anyM) { meth = "수기"; split = "수기"; }
      p.meth = meth;
      p.a = meth === "%증감" ? Calc.num(g(row, "증감률(%)")) / 100 : meth === "수기" && !has(g(row, "금액·단가(원)")) && anyM ? ms.reduce(function (x, y) { return x + y; }, 0) : Calc.num(g(row, "금액·단가(원)"));
      p.b = Calc.num(g(row, "인원·수량")); p.c = Calc.num(g(row, "개월")) || (Calc.isQty(meth) ? 12 : 0); p.t = Calc.num(g(row, "총액(원)"));
      p.auto = { "월액": "a", "단가": "a", "인원": "b", "수량": "b", "개월": "c" }[str(g(row, "자동칸"))] || "t";
      p.split = meth ? split : "균등";
      p.sv = split === "수기" ? ms : split === "비율" ? ms.map(function (x) { return x / 100; }) : new Array(12).fill(0);
      if (has(g(row, "메모"))) p.memo = str(g(row, "메모"));
      var before = cur._c && !cur._c.missing ? cur._c.plan : 0, after = meth ? Calc.compute(Object.assign({}, cur, p), S.settings).plan : 0;
      res.push({ id: id, p: p, path: cur.l1 + " › " + rowLabel(cur), before: before, after: after, chg: JSON.stringify(planFor(id)) !== JSON.stringify(p) });
    });
    var ch = res.filter(function (x) { return x.chg; }), b = 0, a = 0;
    res.forEach(function (x) { b += x.before; a += x.after; });
    openDialog({
      title: "계획 양식 업로드 — 미리보기", crumb: fname, width: 820, okText: ch.length ? "적용 (" + ch.length + "개 계정)" : null, cancelText: ch.length ? "취소" : "닫기",
      body: '<div class="mdl-pad"><div class="ck-sum"><div><span>읽은 계정</span><b>' + res.length + "개</b></div><div><span>바뀌는 계정</span><b>" + ch.length + "개</b></div><div><span>계획 합계</span><b>" +
        Calc.fmtWon(b) + " → " + Calc.fmtWon(a) + "</b><small>" + (a - b >= 0 ? "+" : "") + Calc.fmtWon(a - b) + "원</small></div><div><span>못 찾은 줄</span><b>" + miss.length + "</b></div></div>" +
        (ch.length ? '<div class="vh-scroll" style="max-height:300px"><table class="maptbl mon"><tr><th>계정</th><th>지금</th><th>올린 파일</th><th>차이</th></tr>' + ch.map(function (x) {
          return "<tr><td>" + esc(x.path) + '</td><td class="n">' + Calc.fmtWon(x.before) + '</td><td class="n">' + Calc.fmtWon(x.after) + '</td><td class="n ' + (x.after > x.before ? "up" : x.after < x.before ? "down" : "") + '">' + (x.after - x.before > 0 ? "+" : "") + Calc.fmtWon(x.after - x.before) + "</td></tr>";
        }).join("") + "</table></div>" : '<div class="cm-empty">바뀌는 계정이 없습니다</div>') +
        (miss.length || errs.length ? '<div class="listbox">' + miss.concat(errs).slice(0, 80).map(esc).join("<br>") + "</div>" : "") + "</div>",
      onOk: function () {
        change(function () { ch.forEach(function (x) { setPlan(x.id, x.p); }); }, "계획 양식 업로드: " + fname + " (" + ch.length + "개 계정)");
        toast(ch.length + "개 계정에 반영했습니다 (Ctrl+Z 로 되돌리기)");
      }
    });
  }

  /* ---------- 전년 실적 가져오기 ---------- */
  function importPrev() {
    if (!S.year || guardClosed("전년 실적을 바꾸려면")) return;
    var fi = document.createElement("input");
    fi.type = "file"; fi.accept = ".xlsx,.xls,.xlsm,.csv";
    fi.addEventListener("change", function () {
      var f = fi.files[0];
      if (!f) return;
      Store.readAnyFile(f).then(function (sheets) { importDialog(f.name, sheets); }, function (e) { toast("파일을 읽지 못했습니다: " + (e && e.message || e), true); });
    });
    fi.click();
  }

  function guessCols(aoa) {
    var best = 0, bestCnt = -1;
    for (var r = 0; r < Math.min(10, aoa.length); r++) {
      var cnt = (aoa[r] || []).filter(function (v) { return typeof v === "string" && v.trim(); }).length;
      if (cnt > bestCnt) { bestCnt = cnt; best = r; }
    }
    var head = (aoa[best] || []).map(function (v) { return nm(v); });
    var find = function (re, not) { for (var i = 0; i < head.length; i++) if (re.test(head[i]) && i !== not) return i; return -1; };
    var code = find(/코드/);
    var name = find(/계정명|과목명|계정|과목|소분류/, code);
    var amt = find(/실적|집행|금액|합계|^계$/);
    // 1월~12월 열 (더존 손익 출력) → 전년 월별 실적 (작년처럼 나누기)
    var months = {};
    head.forEach(function (h, i) { var m = /^(\d{1,2})월$/.exec(h); if (m && +m[1] >= 1 && +m[1] <= 12) months[i] = +m[1] - 1; });
    if (amt < 0) {
      var counts = head.map(function () { return 0; });
      aoa.slice(best + 1, best + 40).forEach(function (row) { (row || []).forEach(function (v, i) { if (typeof v === "number") counts[i] = (counts[i] || 0) + 1; }); });
      amt = counts.indexOf(Math.max.apply(null, counts.concat([0])));
    }
    return { head: best, code: code, name: name, amt: amt < 0 ? 1 : amt, months: months };
  }

  function importDialog(fname, sheets) {
    var si = 0, g = guessCols(sheets[0].aoa), missingMode = "keep";
    var byCode = {}, byName = {};
    S.rows.forEach(function (r) {
      r.dz.forEach(function (d) { if (d.code) byCode[d.code] = r.id; if (nm(d.name) && !byName[nm(d.name)]) byName[nm(d.name)] = r.id; });
      if (!byName[nm(r.name)]) byName[nm(r.name)] = r.id;
    });
    function colOpts(sel, aoa, headRow, allowNone) {
      var width = 0;
      aoa.slice(0, 30).forEach(function (r) { width = Math.max(width, (r || []).length); });
      var head = aoa[headRow] || [];
      var h = allowNone ? '<option value="-1"' + (sel < 0 ? " selected" : "") + ">(사용 안 함)</option>" : "";
      for (var i = 0; i < width; i++) h += '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "") + "열 " + esc(String(head[i] || "").slice(0, 14)) + "</option>";
      return h;
    }
    function analyze() {
      var aoa = sheets[si].aoa, sums = {}, msums = {}, n = 0, bad = {}, mcols = Object.keys(g.months || {});
      // 더존 손익 출력이면 'Ⅳ 판매관리비' ~ 다음 로마숫자 줄 사이만 읽음
      var body = aoa.slice(g.head + 1), nameAt = function (r) { return g.name >= 0 ? nm((r || [])[g.name]) : ""; };
      var from = body.findIndex(function (r) { return /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ].*판매관리비/.test(nameAt(r)); });
      if (from >= 0) {
        var to = body.findIndex(function (r, i) { return i > from && /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/.test(nameAt(r)); });
        body = body.slice(from + 1, to > 0 ? to : body.length);
      }
      body.forEach(function (row) {
        row = row || [];
        var code = g.code >= 0 ? String(row[g.code] === undefined ? "" : row[g.code]).trim() : "";
        var name = g.name >= 0 ? String(row[g.name] === undefined ? "" : row[g.name]).trim() : "";
        var v = row[g.amt];
        if ((!code && !name) || (typeof v !== "number" && !(String(v).trim() && isFinite(Calc.num(v))))) return;
        n++;
        var pc = parseDz(code), pn = parseDz(name);
        var ck = (pc && pc.code) || (pn && pn.code) || code, nk = nm((pn && pn.name) || (pc && !pc.code ? pc.name : ""));
        var id = (ck && byCode[ck]) || (nk && byName[nk]);
        if (!id) { if (!/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/.test(name)) bad[code || name] = 1; return; }
        sums[id] = (sums[id] || 0) + Calc.num(v);
        if (mcols.length) {
          var ms = msums[id] = msums[id] || new Array(12).fill(0);
          mcols.forEach(function (ci) { ms[g.months[ci]] += Calc.num(row[ci]); });
        }
      });
      var matched = S.rows.filter(function (r) { return sums[r.id] !== undefined; });
      var notInFile = S.rows.filter(function (r) { return sums[r.id] === undefined; });
      return { sums: sums, msums: msums, months: mcols.length, lines: n, matched: matched, notInFile: notInFile, notInPlan: Object.keys(bad) };
    }
    function body() {
      var aoa = sheets[si].aoa, A = analyze();
      var prevRows = aoa.slice(g.head, g.head + 8);
      var width = 0; prevRows.forEach(function (r) { width = Math.max(width, (r || []).length); });
      width = Math.min(width, 12);
      var tbl = '<table class="maptbl">' + prevRows.map(function (row, ri) {
        var cells = "";
        for (var i = 0; i < width; i++) {
          var v = (row || [])[i];
          cells += (ri === 0 ? "<th" : "<td") + (i === g.code || i === g.name ? ' class="hl"' : i === g.amt ? ' class="hl2"' : "") + ">" + esc(typeof v === "number" ? Calc.fmtWon(v) : v) + (ri === 0 ? "</th>" : "</td>");
        }
        return "<tr>" + cells + "</tr>";
      }).join("") + "</table>";
      return '<div class="mdl-pad">' +
        '<div class="f-row"><label>파일</label><div class="ro">' + esc(fname) + "</div></div>" +
        (sheets.length > 1 ? '<div class="f-row"><label>시트</label><select class="inp plain" id="imSheet">' + sheets.map(function (s, i) { return '<option value="' + i + '"' + (i === si ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select></div>" : "") +
        '<div class="f-row"><label>머리글 줄</label><input class="inp num" id="imHead" data-kind="int" value="' + (g.head + 1) + '" style="width:80px"></div>' +
        '<div class="f-row"><label>코드 열</label><select class="inp plain" id="imCode">' + colOpts(g.code, aoa, g.head, true) + "</select></div>" +
        '<div class="f-row"><label>계정명 열</label><select class="inp plain" id="imName">' + colOpts(g.name, aoa, g.head, true) + "</select></div>" +
        '<div class="f-row"><label>금액 열 (원)</label><select class="inp plain" id="imAmt">' + colOpts(g.amt, aoa, g.head, false) + "</select></div>" +
        tbl +
        '<div class="msg" style="margin-top:10px">읽은 줄 <b>' + A.lines + "</b> · 맞는 계정 <b>" + A.matched.length + "</b> / " + S.rows.length +
        (A.notInPlan.length ? ' · <span class="em">맞는 계정이 없는 줄 ' + A.notInPlan.length + "</span>" : "") +
        "<br>더존 코드가 같은 계정에 먼저 맞추고, 없으면 더존 과목명 · 계정명으로 맞춥니다. 같은 계정이 여러 줄이면 합산합니다." +
        (A.months ? "<br><b>월별 열 " + A.months + "개</b>를 찾았습니다 → 전년 월별 실적으로 넣어 <b>작년처럼 나누기</b>에 씁니다." : "<br>월별 열(1월~12월)이 없어 전년 월별 실적은 넣지 않습니다.") + "</div>" +
        (A.notInPlan.length ? '<div class="listbox">맞는 계정이 없음 (가져오지 않음): ' + A.notInPlan.slice(0, 60).map(esc).join(", ") + (A.notInPlan.length > 60 ? " …" : "") + "</div>" : "") +
        (A.notInFile.length ? '<div style="margin-top:8px"><div class="msg">파일에 없는 계정 ' + A.notInFile.length + "개:</div>" +
          '<label class="opt' + (missingMode === "keep" ? " on" : "") + '"><input type="radio" name="imMiss" value="keep"' + (missingMode === "keep" ? " checked" : "") + "><div><b>기존 전년 실적 그대로 두기</b></div></label>" +
          '<label class="opt' + (missingMode === "zero" ? " on" : "") + '"><input type="radio" name="imMiss" value="zero"' + (missingMode === "zero" ? " checked" : "") + "><div><b>0으로 바꾸기</b></div></label></div>" : "") +
        "</div>";
    }
    function rebuild() { dlg.el.querySelector(".mdl-body").innerHTML = body(); wire(); }
    function wire() {
      var sh = $("imSheet");
      if (sh) sh.addEventListener("change", function () { si = +sh.value; g = guessCols(sheets[si].aoa); rebuild(); });
      $("imHead").addEventListener("change", function () { g.head = Math.max(0, (parseInt($("imHead").value, 10) || 1) - 1); rebuild(); });
      $("imCode").addEventListener("change", function () { g.code = +$("imCode").value; rebuild(); });
      $("imName").addEventListener("change", function () { g.name = +$("imName").value; rebuild(); });
      $("imAmt").addEventListener("change", function () { g.amt = +$("imAmt").value; rebuild(); });
      document.querySelectorAll('input[name="imMiss"]').forEach(function (el) { el.addEventListener("change", function () { missingMode = el.value; rebuild(); }); });
    }
    openDialog({
      title: "전년 실적 가져오기", crumb: (S.year - 1) + "년 실적 → '" + (S.year - 1) + "년 실적' 칸", width: 760, body: body(), okText: "가져오기", focus: false,
      onOk: function () {
        var A = analyze();
        if (!A.matched.length) { toast("맞는 계정이 없습니다. 코드 열 · 계정명 열을 확인하세요", true); return false; }
        change(function () {
          S.rows.forEach(function (r) {
            var v = A.sums[r.id];
            if (v === undefined && missingMode !== "zero") return;
            var p = clone(planFor(r.id));
            p.prev = v === undefined ? 0 : v;
            if (A.months) p.pm = A.msums[r.id] || [];
            setPlan(r.id, p);
          });
        }, "전년 실적 가져오기: " + fname + " (" + A.matched.length + "개 계정)");
        toast(A.matched.length + "개 계정의 전년 실적을 넣었습니다");
      }
    });
    wire();
  }

  /* ---------- 설정 선택 ---------- */
  function syncSettingSelects() {
    var fill = function (id, list, val) {
      $(id).innerHTML = list.map(function (x) { return "<option" + (x === val ? " selected" : "") + ">" + x + "</option>"; }).join("");
    };
    fill("selDisp", Object.keys(Calc.DISP_UNITS), S.settings.dispUnit);
    fill("selDispX", Object.keys(Calc.DISP_UNITS), S.settings.dispUnit);
    fill("selRnd", Object.keys(Calc.RND_UNITS), S.settings.rndUnit);
    fill("selMode", Calc.RND_MODES, S.settings.rndMode);
  }

  /* ---------- 폴더 연결 화면 ---------- */
  function cover(title, text, buttons) {
    $("cover").hidden = false;
    $("coverTitle").textContent = title;
    $("coverText").innerHTML = text;
    var b = $("coverBtns");
    b.innerHTML = "";
    buttons.forEach(function (x) {
      var el = document.createElement("button");
      el.className = "btn" + (x.primary ? " primary" : "");
      el.textContent = x.label;
      el.addEventListener("click", x.fn);
      b.appendChild(el);
    });
  }
  function hideCover() { $("cover").hidden = true; }

  function askFolder() {
    Store.pick().then(openFolder, function (e) {
      if (e && e.name === "AbortError") return;
      toast("폴더를 연결하지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }

  function openFolder() {
    $("folderInfo").innerHTML = "연결된 폴더: <b>" + esc(Store.folderName()) + "</b><br>data · backup 폴더를 사용합니다";
    return Promise.all([Store.loadMaster(), Store.listYears()]).then(function (res) {
      var mst = res[0];
      masterDirty = false;
      if (mst) {
        S.cat = mst.cat; S.ver = mst.ver; S.exclude = mst.exclude || [];
        ensureIds(S.cat);
        if (!S.ver.list.length) addVersion(mst.legacy ? "이전 형식" : "처음 기록", mst.legacy ? "이전 형식(대·중·소 필수)의 분류를 가져옴" : "");
      } else {
        S.cat = baseCat(); S.ver = { list: [], snaps: {} };
        ensureIds(S.cat);
        addVersion("기본 탑재", "내부 자료 작성용 서식 + 더존 계정과목표 코드");
      }
      S.years = res[1];
      fillYearSelect();
      return loadYearLocks().then(function () {
        if (!S.years.length) {
          cover("아직 계획 파일이 없습니다", "연결한 폴더 <code>" + esc(Store.folderName()) + "</code> 의 data 폴더에 사업비 계획 파일이 없습니다.<br>" +
            "분류는 " + (mst ? "기준정보.xlsx 의 분류" : "<b>기본 분류</b>(내부 자료 작성용 서식)") + " — " + esc(catCounts(S.cat)) + " 가 들어 있습니다.<br>새 연도를 만들어 시작하거나, <b>2026년 테스트 데이터</b>(가짜 금액, 마감 · 변경까지)로 둘러보세요.", [
            { label: "새 연도 만들기", primary: true, fn: function () { hideCover(); newYearDialog(); } },
            { label: "2026년 테스트 데이터로 시작", fn: function () { hideCover(); makeTest2026(); } },
            { label: "다른 폴더 고르기", fn: askFolder }
          ]);
          return;
        }
        hideCover();
        var last = 0;
        try { last = parseInt(localStorage.getItem("budget.lastYear"), 10); } catch (e) { last = 0; }
        return loadYear(S.years.indexOf(last) >= 0 ? last : S.years[S.years.length - 1]).then(function () { if (S.year) setMode("exec"); }); // 켜면 집행 화면부터
      });
    }).catch(function (e) {
      toast("폴더를 읽지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }

  /* ---------- 2026년 테스트(더미) 데이터 ----------
     2026년 계획(전년 = 2025 실적, 원안 마감 + 1차 변경 마감) + 더존 손익 원데이터 양식 더미(2026년 1~12월)
     → 2027년 새 연도를 만들고 [전년 실적 가져오기]로 그 파일을 넣어 보며 테스트 */
  var TEST_PL = "2026_손익_1-12월_테스트.xls";
  function testDataDialog() {
    if (!Store.connected()) { toast("먼저 데이터 폴더를 연결하세요"); return; }
    var has = S.years.indexOf(2026) >= 0;
    openDialog({
      title: "2026년 테스트 데이터", width: 560, danger: has,
      body: '<div class="mdl-pad msg">테스트용 <b>가짜 금액</b>으로 아래를 만듭니다.<br>' +
        "• <b>data\\" + Store.fileName(2026) + "</b> — 2026년 계획 (전년 실적 = 2025년 더미, <b>원안 마감 + 1차 변경 마감</b>)<br>" +
        "• <b>더존원본\\" + TEST_PL + "</b> — 더존 손익 원데이터 양식 (판관비 · 매출 · 영업외 · 법인세, 2026년 1~12월)<br>" +
        "• <b>더존원본\\2026\\</b> 분개장 · 손익 <b>3월 · 4월</b> — 집행은 <b>3월까지 반영</b>해 둠 (메모 2개 포함)<br>" +
        "&nbsp;&nbsp;[더존 자료 읽기]를 누르면 4월 파일이 들어가고, 4월 파일엔 3월 전표 2건이 바뀌어 있어 ‘지난 달 수정’이 뜸<br><br>" +
        "2027년 새 연도를 만들면 2026년 실적(1~3월 집행 + 4~12월 계획)으로 시작합니다. 빈 계획으로 만들고 <b>[전년 실적 가져오기]</b>로 위 손익 파일을 넣어 볼 수도 있습니다." +
        (has ? '<br><br><span class="em">이미 2026년 파일이 있습니다. 덮어씁니다 (이전 파일은 backup 폴더에 보관).</span>' : "") + "</div>",
      okText: has ? "덮어쓰고 만들기" : "만들기",
      onOk: function () { flushSave().then(makeTest2026); }
    });
  }
  // 테스트: 3월 파일까지 집행에 반영해 둠 (4월 파일은 [더존 자료 읽기]로 직접 반영해 보기)
  function testExecTo3() {
    var path = "더존원본/2026";
    return Store.listFiles(path).then(function (files) {
      var pick = function (n) { return files.filter(function (f) { return f.name === n; })[0]; };
      var fj = pick("분개장_03월.xls"), fp = pick("손익_03월.xls");
      return Promise.all([Store.readDouzone(path, fj), Store.readDouzone(path, fp)]);
    }).then(function (r) {
      var jn = r[0], pl = r[1], now = Store.stamp();
      X = blankX(2026); PREVX = null; XU.upto = 0; XU.sel = null;
      X.lines = jn.jn.lines; XJN = { name: jn.name, all: jn.jn.all };
      X.month = 3; X.at = now; X.src = { jn: jn.name, pl: pl.name };
      X.files = [jn, pl].map(function (f) { return { name: f.name, type: f.kind, month: f.month, size: f.size, mtime: f.mtime, at: now }; });
      var ids = {};
      eachLeaf(S.cat, function (t, m, s, lf) { if (!ids.gy && /경조금/.test(lf.name)) ids.gy = lf.id; if (!ids.pay && lf.name === "직원급여") ids.pay = lf.id; });
      if (ids.pay) X.memos["c|" + ids.pay + "|3"] = { text: "3월 성과급 일부 선지급 (경리 확인)", at: now.slice(0, 16), label: "직원급여 › 직원급여 3월" };
      if (ids.gy) X.memos["c|" + ids.gy + "|2"] = { text: "2월 조의금 2건", at: now.slice(0, 16), label: "복리후생비 › 경조금 2월" };
      xLog("반영: 3월까지 (" + jn.name + " + " + pl.name + ") · 테스트 데이터");
      return Store.saveExec(X, xRows(true).map(function (q) { return { id: q.id, l1: q.l1, l2: q.l2, l3: q.l3, m: q.act }; }), true);
    });
  }
  function makeTest2026() {
    if (!leafCount(S.cat)) { S.cat = baseCat(); ensureIds(S.cat); addVersion("기본 탑재", "테스트 데이터용"); }
    var list = TestData.items(S.cat), a25 = TestData.byLeaf(list, 2025);
    keepYearLock();
    S.year = 2026;
    S.settings = { dispUnit: "천원", rndUnit: "천원", rndMode: "반올림" };
    S.lock = { state: "draft", rounds: [] };
    S.plan = {};
    var k = 0, rates = [0.03, 0.02, 0, 0.05, -0.03, 0.04, 0.03];
    eachLeaf(S.cat, function (t, m, s, lf) {
      var pm = a25[lf.id] || new Array(12).fill(0), prev = pm.reduce(function (x, y) { return x + y; }, 0), p = Calc.blankPlan(), rt = Calc.ratiosFrom(pm);
      k++;
      p.prev = prev; p.pm = pm.slice();
      if (t.name === "임원보수") { p.meth = "인원"; p.b = 6; p.c = 12; p.a = Math.round(prev * 1.03 / 72 / 10000) * 10000; p.memo = "임원 6명"; }
      else if (/임차,관리비/.test(lf.name)) { p.meth = "단가×수량"; p.a = Math.round(prev / 12 * 1.02 / 10000) * 10000; p.b = 1; p.c = 12; p.memo = "월 임차료 2% 인상"; }
      else if (t.name === "직원급여") { p.meth = "%증감"; p.a = 0.035; if (rt && Math.max.apply(null, rt) > 0.15) { p.split = "비율"; p.sv = rt; } }
      else {
        p.meth = "%증감"; p.a = rates[k % rates.length];
        if (rt && Math.max.apply(null, rt) > 0.15) { p.split = "비율"; p.sv = rt; p.memo = "전년 월 패턴"; }
      }
      S.plan[lf.id] = p;
    });
    deriveRows();
    var s0 = snapNow();
    S.lock.rounds.push({ n: 0, closedAt: "2025-12-19 17:30:00", openedAt: "", reason: "", total: s0.total, snap: s0.snap });
    // 1차 변경: 인원 충원 · 지점 임차료 인상 · 외부위탁교육 축소
    eachLeaf(S.cat, function (t, m, s, lf) {
      var p = S.plan[lf.id];
      if (t.name === "직원급여" && lf.name === "직원급여") { p.a = 0.045; p.memo = "하반기 충원 3명 반영"; }
      if (/임차,관리비\(지점\)/.test(lf.name)) { p.a = Math.round(p.a * 1.05 / 10000) * 10000; p.memo = "지점 2곳 임차료 인상"; }
      if (/외부위탁교육/.test(lf.name)) { p.meth = "%증감"; p.a = -0.2; p.memo = "외부 교육 축소"; }
    });
    deriveRows();
    var s1 = snapNow();
    S.lock.rounds.push({ n: 1, closedAt: "2026-06-30 18:10:00", openedAt: "2026-06-24 09:20:00", reason: "하반기 인원 충원 · 지점 임차료 인상", total: s1.total, snap: s1.snap });
    S.lock.state = "closed";
    S.log = [{ t: Store.stamp(), m: "2026년 테스트 데이터 만듦 (원안 마감 + 1차 변경 마감, 금액은 가짜)" }];
    clearUndo();
    deriveRows();
    UI.sel = S.rows.length ? S.rows[0].id : null;
    syncSettingSelects();
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(TestData.profitLoss(list, 2026, 12)), "Sheet1_1");
    var mm = masterDirty;
    masterDirty = false;
    (mm ? Store.saveMaster(S.cat, S.ver, S.exclude) : Promise.resolve())
      .then(function () { return Store.save(S); })
      .then(function () { return Store.writeBook("더존원본", TEST_PL, wb, "biff8"); })
      .then(function () {
        // 집행 테스트용: 3월 · 4월 분개장 + 손익 (4월 파일에는 3월 전표 2건이 바뀌어 있음 → 지난 달 수정)
        var book = function (aoa) { var w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(aoa), "Sheet1_1"); return w; };
        // 지난 판 테스트 데이터(8월 · 9월 파일)가 남아 있으면 그쪽이 최신으로 읽히므로 지움
        var old = ["분개장_08월.xls", "손익_08월.xls", "분개장_09월.xls", "손익_09월.xls"];
        return old.reduce(function (p, n) { return p.then(function () { return Store.removeFile("더존원본/2026", n); }); }, Promise.resolve()).then(function () { return [3, 4].reduce(function (p, m) {
          return p.then(function () {
            var j = TestData.journal(list, 2026, m), mm = ("0" + m).slice(-2);
            return Store.writeBook("더존원본/2026", "분개장_" + mm + "월.xls", book(j.aoa), "biff8")
              .then(function () { return Store.writeBook("더존원본/2026", "손익_" + mm + "월.xls", book(TestData.profitLoss(list, 2026, m, j.amounts)), "biff8"); });
          });
        }, Promise.resolve()); });
      })
      .then(function () { return testExecTo3(); })
      .then(function () { return Store.listYears(); })
      .then(function (ys) {
        S.years = ys; fillYearSelect(); keepYearLock(); setMode("exec"); renderAll();
        setSave("ok", "자동 저장됨 " + Store.stamp().slice(11, 16));
        toast("2026년 테스트 데이터를 만들었습니다 — 집행은 3월까지 반영돼 있고, [더존 자료 읽기]를 누르면 4월 파일이 들어갑니다 (3월 수정 2건)", false, 7000);
      }).catch(function (e) { toast("테스트 데이터를 만들지 못했습니다: " + (e && e.message || e), true, 6000); });
  }

  /* ======================================================================
     집행 화면
     X : 이 연도 집행 자료 (data\집행_연도.xlsx) — 판관비 분개장 줄(lines) · 반영 월 · 지난 달 수정 · 메모 · 문제 · 기록
     집행 금액 = 분개장 판관비 줄(차변 − 대변)을 분류의 더존 코드로 계정에 모아서 계산 (늘 다시 계산 → 분류를 바꾸면 바로 반영)
     ====================================================================== */
  var MODE = "plan";
  var X = null, PREVX = null, XJN = null; // XJN: 반영한 분개장 전체 줄 (전표 전체 보기용, 필요할 때 읽음)
  var XU = { view: "all", agg: "month", cmp: "plan", upto: 0, sort: null, quick: "", freeze: "acc", sel: null };
  var xTimer = null, xLinesDirty = false, XL = null;
  function ensureX() { if (!X || X.year !== S.year) { X = blankX(S.year); XJN = null; } return X; }
  function blankX(y) { return { year: y, month: 0, at: "", src: { jn: "", pl: "" }, files: [], alerts: [], memos: {}, problems: [], log: [], lines: [] }; }
  function xPath(y) { return "더존원본/" + (y || S.year); }
  function xLog(m) { X.log.push({ t: Store.stamp(), m: m }); if (X.log.length > 2000) X.log.shift(); }
  function xSave(lines) {
    if (lines) xLinesDirty = true;
    clearTimeout(xTimer);
    setSave("saving", "저장 대기…");
    xTimer = setTimeout(function () {
      var rows = xRows(true).map(function (r) { return { id: r.id, l1: r.l1, l2: r.l2, l3: r.l3, m: r.act }; }), ld = xLinesDirty;
      xLinesDirty = false;
      Store.saveExec(X, rows, ld).then(function (t) { setSave("ok", "자동 저장됨 " + t.slice(11, 16)); },
        function (e) { xLinesDirty = xLinesDirty || ld; setSave("error", "저장 실패"); toast("집행 자료를 저장하지 못했습니다 (" + (e && e.name || e) + ")", true, 6000); });
    }, 500);
  }

  // 더존 코드 · 과목명 → 계정 ID (분류의 더존 연결)
  function dzIndex() {
    var byCode = {}, byName = {};
    eachLeaf(S.cat, function (t, m, s, lf) { lf.dz.forEach(function (d) { if (d.code) byCode[d.code] = lf.id; if (nm(d.name)) byName[nm(d.name)] = lf.id; }); });
    var ex = {};
    (S.exclude || []).forEach(function (d) { if (d.code) ex["C" + d.code] = 1; if (nm(d.name)) ex["N" + nm(d.name)] = 1; });
    return {
      leaf: function (l) { return byCode[l.code] || (!l.code && byName[nm(l.name)]) || byName[nm(l.name)] || null; },
      excluded: function (l) { return !!(ex["C" + l.code] || ex["N" + nm(l.name)]); }
    };
  }
  // X.lines → {acts: {id:[12]}, un: {code:{code,name,m:[12],n}}, ex: [12]}
  function xCompute() {
    var ix = dzIndex(), acts = {}, un = {}, ex = new Array(12).fill(0);
    (X ? X.lines : []).forEach(function (l) {
      var mi = l.m - 1;
      if (mi < 0 || mi > 11) return;
      if (ix.excluded(l)) { ex[mi] += l.amt; return; }
      var id = ix.leaf(l);
      if (id) { (acts[id] = acts[id] || new Array(12).fill(0))[mi] += l.amt; return; }
      var k = l.code || l.name, u = un[k] = un[k] || { code: l.code, name: l.name, m: new Array(12).fill(0), n: 0 };
      u.m[mi] += l.amt; u.n++;
    });
    return { acts: acts, un: un, ex: ex };
  }
  // 계획 월 금액: 마지막 마감본(최종 변경안), 마감 전이면 지금 계획
  function planBase() { var lc = lastClosed(); return lc ? { label: roundLabel(lc.n), snap: lc.snap } : { label: "작성 중 계획", snap: null }; }
  function planMonthsOf(id, base) {
    if (base.snap) { var e = base.snap[id]; return e ? e.months.slice() : new Array(12).fill(0); }
    var r = rowBy(id); return r && r._c && !r._c.missing ? r._c.months.slice() : new Array(12).fill(0);
  }
  function sum12(a, upto) { var t = 0; for (var i = 0; i < (upto || 12); i++) t += a[i] || 0; return t; }
  var CMP = { plan: "계획", prev: "전년 같은 달", avg: "올해 월평균" };

  // 집행 표 줄
  function xRows(all) {
    var C = xCompute(), base = planBase(), M = X ? X.month : 0, out = [];
    eachLeaf(S.cat, function (t, m, s, lf) {
      var act = C.acts[lf.id] || new Array(12).fill(0), p = planFor(lf.id);
      if (lf.use === false && !sum12(act) && !all) return;
      var plan = planMonthsOf(lf.id, base), avg = M ? sum12(act, M) / M : 0;
      var cmp = XU.cmp === "prev" ? (p.pm && p.pm.length === 12 ? p.pm.slice() : new Array(12).fill(0)) : XU.cmp === "avg" ? new Array(12).fill(Math.round(avg)) : plan;
      out.push({ id: lf.id, l1: t.name, l2: m.name, l3: s ? s.name : "", name: lf.name, dz: lf.dz, out: !!p.out, plan: plan, act: act, cmp: cmp, memo: p.memo });
    });
    XL = { C: C, base: base, M: M };
    return out;
  }
  function xUpto() { return XU.upto || (X ? X.month : 0) || 12; }
  function rowAlerts(id) { return X ? X.alerts.filter(function (a) { return a.leaf === id && a.state !== "정상"; }) : []; }
  function dcls(d, b) {
    if (!d) return "";
    if (!b) return d > 0 ? "r2" : "b2";
    var r = d / Math.abs(b);
    return r >= 0.3 ? "r2" : r >= 0.1 ? "r1" : r <= -0.3 ? "b2" : r <= -0.1 ? "b1" : "";
  }
  function sgn(v) { return v > 0 ? "+" + u(v) : u(v); }
  function xVisible(r) {
    if (UI.nav.t && r.l1 !== UI.nav.t) return false;
    if (UI.nav.m && r.l2 !== UI.nav.m) return false;
    if (UI.nav.s && r.l3 !== UI.nav.s) return false;
    if (UI.search) {
      var hay = [r.l1, r.l2, r.l3].concat(r.dz.map(dzText)).join(" ").toLowerCase();
      if (hay.indexOf(UI.search.toLowerCase()) < 0) return false;
    }
    var U = xUpto();
    if (XU.quick === "over" && !(sum12(r.act, U) - sum12(r.cmp, U) > 0)) return false;
    if (XU.quick === "warn" && !rowAlerts(r.id).length) return false;
    if (XU.quick === "memo" && !Object.keys(X ? X.memos : {}).some(function (k) { return k.indexOf("c|" + r.id + "|") === 0; })) return false;
    if (XU.quick === "fc" && !(xForecast(r) > sum12(r.plan) && sum12(r.plan))) return false;
    return true;
  }
  // 연말 예상: 누계 집행 + 남은 달 계획 / 최근 3개월 평균 중 큰 쪽
  function xForecast(r) {
    var M = X ? X.month : 0;
    if (!M) return sum12(r.plan);
    var done = sum12(r.act, M), rest = 0, recent = 0, n = 0;
    for (var i = M; i < 12; i++) rest += r.plan[i];
    for (var j = Math.max(0, M - 3); j < M; j++) { recent += r.act[j]; n++; }
    return done + Math.max(rest, n ? recent / n * (12 - M) : 0);
  }

  function renderExec() {
    ensureX();
    var rows = xRows(false), U = xUpto(), M = X ? X.month : 0, base = XL.base;
    $("execPill").textContent = "계획 기준: " + base.label;
    renderXStrip(rows, U);
    renderXMonths();
    $("xAlertN").textContent = X ? X.alerts.filter(function (a) { return a.state !== "정상"; }).length || "" : "";
    $("xAlertN").hidden = !$("xAlertN").textContent;
    // 도구 줄
    document.querySelectorAll("#xTools [data-xv]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-xv") === XU.view); });
    document.querySelectorAll("#xTools [data-xa]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-xa") === XU.agg); });
    $("xCmp").value = XU.cmp; $("xCmp").classList.toggle("on", XU.cmp !== "plan");
    $("xUpto").innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return '<option value="' + m + '"' + (m === U ? " selected" : "") + ">" + m + "월까지</option>"; }).join("");
    $("xUpto").parentNode.hidden = XU.agg !== "cum";
    var cnt = { over: 0, warn: 0, memo: 0, fc: 0 };
    rows.forEach(function (r) {
      if (sum12(r.act, U) - sum12(r.cmp, U) > 0) cnt.over++;
      if (rowAlerts(r.id).length) cnt.warn++;
      if (Object.keys(X.memos).some(function (k) { return k.indexOf("c|" + r.id + "|") === 0; })) cnt.memo++;
      if (sum12(r.plan) && xForecast(r) > sum12(r.plan)) cnt.fc++;
    });
    $("xQuick").innerHTML = [["over", "초과 " + cnt.over], ["warn", "⚠ 수정 " + cnt.warn], ["memo", "메모 " + cnt.memo], ["fc", "연말 초과 예상 " + cnt.fc]].map(function (q) {
      return '<span class="chip' + (q[0] !== "memo" ? " warn" : "") + (XU.quick === q[0] ? " on" : "") + '" data-xq="' + q[0] + '">' + q[1] + "</span>";
    }).join("");
    renderXTable(rows, U, M);
    var un = Object.keys(XL.C.un).length;
    $("stCount").textContent = "집행 계정 " + rows.filter(function (r) { return sum12(r.act); }).length + (M ? " · " + M + "월까지 반영" : " · 아직 반영 전") + (un ? " · 미연결 " + un : "");
    $("stSum").textContent = M ? "집행 누계: " + u(rows.reduce(function (a, r) { return a + sum12(r.act, M); }, 0), true) + " " + unitName() : "";
  }

  function renderXMonths() {
    var M = X ? X.month : 0, h = "";
    var alertM = {};
    (X ? X.alerts : []).forEach(function (a) { if (a.state !== "정상") alertM[a.m] = 1; });
    for (var m = 1; m <= 12; m++) {
      var c = m <= M ? (alertM[m] ? "chg" : "ok") : "no";
      h += '<div class="ms ' + c + '" title="' + (m <= M ? X.src.jn + " · " + X.at : "아직 없음") + '"><b>' + m + "월</b>" + (c === "ok" ? "✓" : c === "chg" ? "⚠ 수정" : "-") + "</div>";
    }
    $("xMstat").innerHTML = h;
  }

  function renderXStrip(rows, U) {
    var M = X ? X.month : 0, act = 0, cmp = 0, yp = 0, ma = 0, mc = 0, over = 0, outs = 0, fc = 0;
    rows.forEach(function (r) {
      act += sum12(r.act, U); cmp += sum12(r.cmp, U); yp += sum12(r.plan);
      if (M) { ma += r.act[M - 1]; mc += r.cmp[M - 1]; }
      if (sum12(r.act, U) > sum12(r.cmp, U)) over++;
      if (r.out && sum12(r.act)) outs++;
      if (sum12(r.plan) && xForecast(r) > sum12(r.plan)) fc++;
    });
    var cl = CMP[XU.cmp], d = act - cmp, un = Object.keys(XL.C.un).length, al = X.alerts.filter(function (a) { return a.state !== "정상"; }).length;
    var nx = rows.filter(function (r) { return sum12(r.plan); }).length;
    $("kpis").innerHTML = !M ? [
      '<div class="kpi kpi-plan"><div class="k-label">연간 계획 · ' + esc(XL.base.label) + '</div><div class="k-value">' + u(yp, true) + "<small>" + unitName() + '</small></div><div class="k-sub">계획 있는 계정 ' + nx + " / " + rows.length + "</div></div>",
      '<div class="kpi"><div class="k-label">집행</div><div class="k-value">-</div><div class="k-sub">아직 반영한 더존 자료가 없습니다 — <button class="btn sm" data-act="xRead">더존 자료 읽기</button></div></div>'
    ].join("") : [
      '<div class="kpi kpi-plan"><div class="k-label">1~' + U + '월 집행 누계</div><div class="k-value">' + u(act, true) + "<small>" + unitName() + '</small></div><div class="k-sub">연간 계획 ' + u(yp, true) + " 의 " + (yp ? (act / yp * 100).toFixed(1) : "-") + "%</div></div>",
      '<div class="kpi"><div class="k-label">누계 ' + cl + ' 대비</div><div class="k-value ' + (d > 0 ? "up" : d < 0 ? "down" : "") + '">' + (cmp ? (d >= 0 ? "+" : "−") + Math.abs(d / cmp * 100).toFixed(1) + "%" : "-") + '</div><div class="k-sub">' + cl + " " + u(cmp, true) + " · " + (d >= 0 ? "초과 " : "절감 ") + u(Math.abs(d), true) + "</div></div>",
      '<div class="kpi"><div class="k-label">' + M + '월 집행</div><div class="k-value">' + u(ma, true) + "<small>" + unitName() + '</small></div><div class="k-sub">' + M + "월 " + cl + " " + u(mc, true) + " · " + (mc ? (ma >= mc ? "+" : "−") + Math.abs((ma - mc) / mc * 100).toFixed(1) + "%" : "") + "</div></div>",
      '<div class="kpi"><div class="k-label">확인할 것</div><div class="k-value" style="color:var(--up)">' + (over + al + un + fc) + '</div><div class="k-sub">초과 ' + over + " · 연말 초과 예상 " + fc + " · 수정 알림 " + al + " · 미연결 " + un + (outs ? " · 계획 외 " + outs : "") + "</div></div>"
    ].join("");
    // 대분류별 집행률
    var g = {}, order = [];
    rows.forEach(function (r) { if (!g[r.l1]) { g[r.l1] = { a: 0, p: 0 }; order.push(r.l1); } g[r.l1].a += sum12(r.act, U); g[r.l1].p += sum12(r.plan); });
    order.sort(function (a, b) { return g[b].a - g[a].a; });
    $("stripH1").textContent = "대분류별 집행률 (연간 계획 대비)";
    $("cats").innerHTML = order.slice(0, 6).map(function (n) {
      var r = g[n].p ? g[n].a / g[n].p : 0;
      return '<div class="cat" title="' + esc(n) + " " + u(g[n].a, true) + " / " + u(g[n].p, true) + '"><span class="cat-n">' + esc(n) + '</span><span class="cat-bar"><i style="width:' + Math.min(100, r * 100).toFixed(1) + "%" + (r > U / 12 + 0.05 ? ";background:#E8776B" : "") + '"></i></span><span class="cat-v">' + (r * 100).toFixed(1) + "%</span></div>";
    }).join("") + (order.length > 6 ? '<div class="cat"><span class="cat-n">외 ' + (order.length - 6) + "개</span></div>" : "");
    var am = new Array(12).fill(0), pm = new Array(12).fill(0);
    rows.forEach(function (r) { for (var i = 0; i < 12; i++) { am[i] += r.act[i]; pm[i] += r.cmp[i]; } });
    var mx = Math.max.apply(null, am.concat(pm).concat([1]));
    $("stripH2").textContent = "월별 집행 (막대) · " + cl + " (선)";
    $("months").innerHTML = '<div class="mbars xbars">' + am.map(function (v, i) {
      var none = i >= M;
      return '<div class="mb" title="' + (i + 1) + "월 집행 " + u(v, true) + " / " + cl + " " + u(pm[i], true) + '"><i class="' + (none ? "none" : v > pm[i] ? "over" : "") + '" style="height:' + ((none ? pm[i] : Math.max(0, v)) / mx * 100).toFixed(1) + '%"></i><s style="bottom:calc(' + (pm[i] / mx * 100).toFixed(1) + '% + 11px)"></s><span>' + (i + 1) + "</span></div>";
    }).join("") + "</div>";
  }

  function xKeys() {
    var U = xUpto(), ks = [];
    if (XU.agg === "cum") return ["cc", "ca", "cd", "cr", "yp", "rate", "left", "fc"];
    for (var m = 1; m <= 12; m++) {
      if (XU.view === "all" || XU.view === "plan") ks.push("c" + m);
      if (XU.view === "all" || XU.view === "act") ks.push("a" + m);
      if (XU.view === "all" || XU.view === "diff") ks.push("d" + m);
    }
    if (XU.view === "all" || XU.view === "plan") ks.push("ct");
    if (XU.view === "all" || XU.view === "act") ks.push("at");
    if (XU.view === "all" || XU.view === "diff") ks.push("dt");
    ks.push("rate");
    return ks;
  }
  // 칸 값: {v, cls, txt}
  function xCell(o, k, U, M) {
    var c = k.charAt(0), m = parseInt(k.slice(1), 10);
    var cumC = sum12(o.cmp, U), cumA = sum12(o.act, U), yp = sum12(o.plan);
    if (!M && /^(at|ca|dt|cd|cr)$/.test(k)) return { v: null };
    if (k === "rate") return { v: yp && M ? sum12(o.act, M) / yp : NaN, pct: true };
    if (k === "yp") return { v: yp };
    if (k === "left") return { v: yp - cumA };
    if (k === "fc") return { v: o.fc, warn: yp && o.fc > yp };
    if (k === "ct" || k === "cc") return { v: cumC, pl: true };
    if (k === "at" || k === "ca") return { v: cumA, act: true, m: 0 };
    if (k === "dt" || k === "cd") return { v: cumA - cumC, diff: cumC };
    if (k === "cr") return { v: cumC ? (cumA - cumC) / Math.abs(cumC) : NaN, pct: true, sign: true };
    if (c === "c") return { v: o.cmp[m - 1], pl: true };
    if (c === "a") return { v: m <= M ? o.act[m - 1] : null, act: true, m: m };
    if (c === "d") return { v: m <= M ? o.act[m - 1] - o.cmp[m - 1] : null, diff: o.cmp[m - 1] };
    return { v: 0 };
  }
  function xKeyName(k) {
    var n = { cc: CMP[XU.cmp], ca: "집행", cd: "증감", cr: "증감률", yp: "연간 계획", rate: "집행률", left: "잔여 예산", fc: "연말 예상", ct: CMP[XU.cmp], at: "집행", dt: "증감" }[k];
    if (n) return n;
    return { c: XU.cmp === "plan" ? "계획" : XU.cmp === "prev" ? "전년" : "평균", a: "집행", d: "증감" }[k.charAt(0)];
  }
  function renderXTable(rows, U, M) {
    var el = $("tblX"), ks = xKeys(), sub = XU.view === "all" ? 3 : 1, cum = XU.agg === "cum", starts = {}, seenB = {};
    ks.forEach(function (k) { var b = /^[cad]\d/.test(k) ? k.slice(1) : /t$/.test(k) ? "t" : k === "cc" ? "c" : k; if (!seenB[b]) { seenB[b] = 1; if (/^[cad]\d|t$|^cc$/.test(k)) starts[k] = 1; } });
    if (!rows.length) {
      el.innerHTML = '<div class="empty"><b>계정이 없습니다.</b><br>[분류 관리]에서 분류를 만들거나 [사업비 계획]에서 계정을 추가하세요.<br><br>아직 반영한 더존 자료가 없다면 ' +
        '더존에서 받은 <b>분개장</b>과 <b>재무제표(손익)</b> 파일을 <code>(연결한 폴더)\\' + xPath().replace("/", "\\") + "\\</code> 에 넣고<br>[더존 자료 읽기]를 누르세요." +
        '<br><br><button class="btn primary" data-act="xRead">더존 자료 읽기</button></div>';
      return;
    }
    // 묶음 · 정렬
    var groups = [], gi = {};
    rows.forEach(function (r) {
      r.fc = xForecast(r);
      if (!(r.l1 in gi)) { gi[r.l1] = groups.length; groups.push({ name: r.l1, rows: [] }); }
      groups[gi[r.l1]].rows.push(r);
    });
    var agg = function (list) {
      var o = { plan: new Array(12).fill(0), act: new Array(12).fill(0), cmp: new Array(12).fill(0), fc: 0 };
      list.forEach(function (r) { for (var i = 0; i < 12; i++) { o.plan[i] += r.plan[i]; o.act[i] += r.act[i]; o.cmp[i] += r.cmp[i]; } o.fc += r.fc; });
      return o;
    };
    var sk = XU.sort && XU.sort.k, sd = XU.sort ? XU.sort.dir : 1, sv = function (o) { var c = xCell(o, sk, U, M); return c.v === null || isNaN(c.v) ? NaN : c.v; };
    var h = ['<table class="plan xt"><thead><tr><th class="c-acc" rowspan="' + (sub > 1 && !cum ? 2 : 1) + '" data-k="acc">계정</th><th rowspan="' + (sub > 1 && !cum ? 2 : 1) + '" data-k="yp">연간 계획</th>'];
    var mark = function (k) { return sk === k ? '<span class="sorti">' + (sd > 0 ? "▲" : "▼") + "</span>" : ""; };
    if (cum) ks.forEach(function (k) { if (k !== "yp") h.push('<th data-k="' + k + '"' + (starts[k] ? ' class="mstart"' : "") + ">" + (k === "cc" || k === "ca" ? xKeyName(k) + "<br><small>1~" + U + "월</small>" : xKeyName(k)) + mark(k) + "</th>"); });
    else if (sub > 1) {
      for (var m = 1; m <= 12; m++) h.push('<th class="mh mstart' + (m > M ? " fut" : "") + '" colspan="3">' + m + "월</th>");
      h.push('<th class="mh mstart" colspan="3">' + (M ? "누계 (1~" + M + "월)" : "연간 (집행 반영 전)") + '</th><th rowspan="2" data-k="rate">집행률' + mark("rate") + "</th></tr><tr>");
      ks.forEach(function (k) { if (k !== "rate") h.push('<th class="sub' + (starts[k] ? " mstart" : "") + '" data-k="' + k + '">' + xKeyName(k) + mark(k) + "</th>"); });
    } else ks.forEach(function (k) { h.push('<th data-k="' + k + '"' + (starts[k] ? ' class="mstart"' : "") + ">" + (/^[cad]\d/.test(k) ? k.slice(1) + "월" : xKeyName(k) + (/t$/.test(k) ? "<br><small>누계</small>" : "")) + mark(k) + "</th>"); });
    h.push("</tr></thead><tbody>");
    if (sk) groups.sort(function (a, b) { return sd * cmpVal(sv(agg(a.rows)), sv(agg(b.rows))); });
    var cellHtml = function (o, k, row) {
      var c = xCell(o, k, U, M), cls = "num", txt;
      if (c.v === null) return '<td class="num fut" data-k="' + k + '"></td>';
      if (c.pct) txt = isNaN(c.v) ? "-" : (c.sign && c.v > 0 ? "+" : "") + (c.v * 100).toFixed(1) + "%";
      else if (c.diff !== undefined) { txt = c.v ? sgn(c.v) : "-"; cls += " " + dcls(c.v, c.diff); }
      else txt = u(c.v);
      if (c.pl) cls += " pl";
      if (starts[k]) cls += " mstart";
      if (c.act) {
        cls += " lnk";
        if (row) {
          var mk = "c|" + o.id + "|" + (c.m || 0), memo = X.memos[mk];
          if (memo) cls += " hasmemo";
          if (c.m && rowAlerts(o.id).some(function (a) { return a.m === c.m; })) cls += " chgd";
          return '<td class="' + cls + '" data-k="' + k + '"' + (memo ? ' data-memo="' + esc(memo.text) + '"' : "") + ">" + txt + "</td>";
        }
      }
      if (c.warn) { cls += " r1"; txt += " ⚠"; }
      if (k === "rate" && !isNaN(c.v) && M) cls += c.v > M / 12 + 0.05 ? " r1" : "";
      return '<td class="' + cls + '" data-k="' + k + '">' + txt + "</td>";
    };
    var keysAll = ["yp"].concat(cum ? ks.filter(function (k) { return k !== "yp"; }) : ks);
    var shown = 0;
    groups.forEach(function (g) {
      var list = g.rows.filter(xVisible);
      if (!list.length) return;
      if (sk) list.sort(function (a, b) { return sd * cmpVal(sv(a), sv(b)); });
      var ga = agg(g.rows), shut = !!UI.collapsed["x|" + g.name] && !UI.search;
      h.push('<tr class="grp" data-grp="' + esc(g.name) + '"><td class="c-acc" data-k="acc"><span class="caret">' + (shut ? "▸" : "▾") + "</span>" + esc(g.name) + '<span class="cnt">' + g.rows.length + "</span></td>" +
        keysAll.map(function (k) { return cellHtml(ga, k, false); }).join("") + "</tr>");
      if (shut) return;
      list.forEach(function (r) {
        shown++;
        var al = rowAlerts(r.id).length;
        h.push('<tr class="acc' + (r.out ? " out" : "") + (XU.sel === r.id ? " is-sel" : "") + '" data-id="' + esc(r.id) + '"><td class="c-acc" data-k="acc"><span class="grip off"></span>' +
          (r.l3 ? '<span class="l2">' + esc(r.l2) + ' ›</span><span class="l3">' + esc(r.l3) + "</span>" : '<span class="l3">' + esc(r.l2) + "</span>") +
          (r.dz.length ? '<span class="erp" title="더존: ' + esc(r.dz.map(dzText).join(", ")) + '">' + esc(dzShort(r.dz)) + "</span>" : "") +
          (r.out ? '<span class="flag outf">계획 외</span>' : "") +
          (al ? '<span class="warnico" data-xwarn="' + esc(r.id) + '" title="지난 달 수정 ' + al + '건 — 누르면 확인">⚠</span>' : "") + "</td>" +
          keysAll.map(function (k) { return cellHtml(r, k, true); }).join("") + "</tr>");
      });
    });
    // 미연결 더존 과목 (분류에 없음)
    var un = XL.C.un, uk = Object.keys(un);
    if (uk.length) {
      h.push('<tr class="grp unl"><td class="c-acc" data-k="acc">⚠ 미연결 더존 과목 <span class="cnt">' + uk.length + '</span> <button class="btn sm" data-act="xRead">정리</button></td>' + keysAll.map(function () { return "<td></td>"; }).join("") + "</tr>");
      uk.forEach(function (k) {
        var x = un[k], o = { act: x.m, cmp: new Array(12).fill(0), plan: new Array(12).fill(0), fc: sum12(x.m) };
        h.push('<tr class="acc unl"><td class="c-acc"><span class="l3">' + esc(dzText(x)) + '</span><span class="cnt">' + x.n + "줄</span></td>" + keysAll.map(function (kk) { var c = xCell(o, kk, U, M); return '<td class="num">' + (c.act && c.v !== null ? u(c.v) : "") + "</td>"; }).join("") + "</tr>");
      });
    }
    var tot = agg(rows.filter(xVisible));
    h.push('<tr class="total"><td class="c-acc" data-k="acc">합계</td>' + keysAll.map(function (k) { return cellHtml(tot, k, false); }).join("") + "</tr></tbody></table>");
    if (!shown) h.push('<div class="empty">조건에 맞는 계정이 없습니다.</div>');
    var top = el.scrollTop, left = el.scrollLeft;
    el.innerHTML = h.join("");
    // 머리글 2줄: 아랫줄(계획 · 집행 · 증감)은 윗줄 바로 밑에 고정 (안 하면 스크롤할 때 윗줄 위로 올라가 집행률 칸과 어긋남)
    var hr = el.querySelectorAll("thead tr");
    if (hr.length > 1) { var h1 = hr[0].getBoundingClientRect().height; hr[1].querySelectorAll("th").forEach(function (th) { th.style.top = h1 + "px"; }); }
    el.scrollTop = top; el.scrollLeft = left;
    xFreeze();
  }
  function xFreeze() {
    if (!XU.freeze || XU.freeze === "acc") return;
    var ths = $("tblX").querySelectorAll("thead tr:first-child th"), left = 0;
    for (var i = 0; i < ths.length; i++) {
      var k = ths[i].getAttribute("data-k");
      if (!k) break;
      if (k !== "acc") {
        $("tblX").querySelectorAll('[data-k="' + k + '"]').forEach(function (c) { c.classList.add("fz"); c.style.left = left + "px"; });
      }
      left += ths[i].offsetWidth;
      if (k === XU.freeze) { $("tblX").querySelectorAll('[data-k="' + k + '"]').forEach(function (c) { c.classList.add("fz-last"); }); break; }
    }
  }

  /* 화면 바꾸기: 사업비 계획 ↔ 집행 */
  function setMode(m) {
    if (m === MODE) return;
    if (m === "exec" && !S.year) { toast("먼저 연도를 여세요"); return; }
    if (editing) commitEdit($("cellEd").value, 0, 0);
    MODE = m;
    document.body.classList.toggle("mode-exec", m === "exec");
    document.querySelectorAll(".sheets [data-sheet]").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-sheet") === m); });
    var tab = m === "exec" ? "exec" : "plan";
    document.querySelectorAll("#rtabs a").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-tab") === tab); });
    ["file", "plan", "exec", "set", "help"].forEach(function (t) { $("rb-" + t).hidden = t !== tab; });
    UI.cell = null; markCell();
    $("fRef").textContent = "-"; $("fVal").innerHTML = ""; $("stSel").textContent = "";
    if (m === "exec") { $("stripH1").textContent = ""; renderAll(); if (XU.sel) xFbar(XU.sel); else $("fVal").innerHTML = '<span class="mute">집행 칸을 누르면 내역 · 우클릭하면 메모</span>'; }
    else { $("stripH1").textContent = "대분류별 구성비"; $("stripH2").textContent = "월별 계획"; renderAll(); }
  }

  /* ---------- 더존 자료 읽기: 파일 확인 → 미연결 → 지난 달 수정 → 대조 검증 · 반영 ---------- */
  function lineKey(l) { return l.d + "|" + l.no + "|" + l.code + "|" + l.amt + "|" + l.memo; }
  function xRead() {
    if (!S.year) return;
    ensureX();
    var path = xPath();
    toast("더존원본\\" + S.year + " 폴더를 읽는 중…", false, 1500);
    Store.listFiles(path).then(function (files) {
      if (!files.length) {
        openDialog({ title: "더존 자료 읽기", width: 560, okText: null, cancelText: "닫기",
          body: '<div class="mdl-pad msg">폴더에 파일이 없습니다: <b>(연결한 폴더)\\' + path.replace("/", "\\") + "\\</b><br>더존에서 받은 <b>분개장</b>과 <b>재무제표(손익)</b>를 이 폴더에 넣으세요.<br>파일 이름에 월이 들어가면 됩니다 (예: 분개장_09월.xls · 손익_09월.xls). 종류는 머리글로 알아서 구분합니다.</div>" });
        return;
      }
      // 이미 아는 파일(이름 · 크기 · 수정시각 같음)은 다시 읽지 않음
      var known = {};
      X.files.forEach(function (f) { known[f.name] = f; });
      var jobs = files.map(function (f) {
        var k = known[f.name];
        if (k && k.size === f.size && k.mtime === f.mtime && k.type) return Promise.resolve({ name: f.name, size: f.size, mtime: f.mtime, kind: k.type, month: k.month, cached: true });
        return Store.readDouzone(path, f).catch(function (e) { return { name: f.name, kind: "", month: 0, err: String(e && e.message || e) }; });
      });
      return Promise.all(jobs).then(function (res) { readDialog(path, res); });
    }).catch(function (e) { toast("폴더를 읽지 못했습니다: " + (e && e.message || e), true, 6000); });
  }

  function readDialog(path, res) {
    var pairs = {};
    res.forEach(function (f) { if ((f.kind === "jn" || f.kind === "pl") && f.month) { var p = pairs[f.month] = pairs[f.month] || {}; if (!p[f.kind] || f.mtime > p[f.kind].mtime) p[f.kind] = f; } });
    var full = Object.keys(pairs).map(Number).filter(function (m) { return pairs[m].jn && pairs[m].pl; }).sort(function (a, b) { return a - b; });
    var T = full.length ? full[full.length - 1] : 0;
    var same = T && T === X.month && pairs[T].jn.cached && pairs[T].pl.cached && pairs[T].jn.name === X.src.jn && pairs[T].pl.name === X.src.pl;
    var stale = T && T < X.month;
    var st = { step: 1, T: T, jn: null, pl: null, base: null, baseMonth: 0, un: [], alerts: [], checks: null, ok: false };
    var kindName = { jn: "분개장", pl: "재무제표(손익)" };

    function fileRows() {
      return res.slice().sort(function (a, b) { return (a.month - b.month) || a.name.localeCompare(b.name); }).map(function (f) {
        var use = T && pairs[T] && (pairs[T].jn === f || pairs[T].pl === f);
        var stt = f.err ? '<span class="st bad">읽지 못함</span>' : !f.kind ? '<span class="st bad">더존 양식 아님 · 건너뜀</span>' : !f.month ? '<span class="st bad">월을 모름 · 건너뜀</span>' :
          use ? (same ? '<span class="st same">반영됨</span>' : '<span class="st new">반영할 파일</span>') : '<span class="st same">' + (X.files.some(function (k) { return k.name === f.name; }) ? "반영됨 · 지난번" : "지난 달") + "</span>";
        var info = f.jn ? f.jn.minD + " ~ " + f.jn.maxD + " · " + f.jn.rows.toLocaleString() + "줄 · 판관비 " + f.jn.lines.length.toLocaleString() + "줄" : f.pl ? "1월 ~ " + f.pl.upto + "월 · 판관비 과목 " + Object.keys(f.pl.items).length : f.cached ? "(지난번에 읽음)" : "";
        return "<tr" + (use && !same ? "" : ' class="dim"') + "><td>" + (use ? "<b>" + esc(f.name) + "</b>" : esc(f.name)) + "</td><td>" + (kindName[f.kind] || "-") + "</td><td>" + (f.month ? f.month + "월" : "-") + "</td><td>" + esc(info) + "</td><td>" + stt + "</td></tr>";
      }).join("");
    }
    function stepsBar() {
      var names = ["파일 확인", "미연결 계정", "지난 달 수정", "대조 검증 · 반영"];
      return '<div class="steps">' + names.map(function (n, i) { return '<span class="' + (st.step === i + 1 ? "on" : st.step > i + 1 ? "done" : "") + '">' + (i + 1) + " " + n + "</span>"; }).join("<i>›</i>") + "</div>";
    }
    function body() {
      var h = stepsBar() + '<div class="mdl-pad">';
      if (st.step === 1) {
        h += '<table class="maptbl mon"><tr><th>파일</th><th>종류</th><th>월</th><th>내용</th><th>상태</th></tr>' + fileRows() + "</table>";
        if (!T) h += '<div class="confirm">같은 달 <b>분개장</b>과 <b>재무제표(손익)</b>가 둘 다 있어야 반영합니다. ' + (Object.keys(pairs).length ? "짝이 맞지 않는 달: " + Object.keys(pairs).map(function (m) { return m + "월(" + (pairs[m].jn ? "손익 없음" : "분개장 없음") + ")"; }).join(", ") : "") + "</div>";
        else if (same) h += '<div class="confirm">새 자료가 없습니다. ' + T + "월까지 이미 반영돼 있습니다.</div>";
        else if (stale) h += '<div class="confirm">폴더의 최신 자료(' + T + "월)가 이미 반영한 " + X.month + "월보다 앞섭니다. 더 최신 파일을 넣으세요.</div>";
        else h += '<div class="pv-note">반영할 달: <b>' + T + "월</b> (분개장 " + esc(pairs[T].jn.name) + " + 손익 " + esc(pairs[T].pl.name) + ")" +
          (X.month ? " · 지난번 " + X.month + "월 (" + esc(X.src.jn) + ") 과 비교해서 지난 달 수정을 찾습니다." : full.length > 1 ? " · 그 전 달 파일(" + full[full.length - 2] + "월)과 비교해서 지난 달 수정을 찾습니다." : "") + "</div>";
      } else if (st.step === 2) {
        h += '<div class="lead2">분류에 연결되지 않은 판관비 더존 과목입니다. 어디에 넣을지 정하세요. (분류 관리에 저장되고 새 버전으로 기록)</div>' + st.un.map(function (u0, i) {
          var g = (window.DZ_ACCOUNTS || []).filter(function (a) { return a[0] === u0.code; })[0], grpName = g ? g[2] : "", top = S.cat.filter(function (t) { return nm(t.name) === nm(grpName) || nm(grpName).indexOf(nm(t.name)) === 0 || nm(t.name).indexOf(nm(grpName).replace(/금$/, "")) === 0; })[0];
          u0.top = u0.top || (top ? top.name : S.cat[0] ? S.cat[0].name : "");
          u0.mode = u0.mode || "new";
          var leaves = []; eachLeaf(S.cat, function (t, m, s, lf) { leaves.push([lf.id, t.name + " › " + m.name + (s ? " › " + s.name : "")]); });
          return '<div class="um" data-u="' + i + '"><div class="um-h"><b>' + esc(dzText(u0)) + '</b><span class="um-a">1~' + st.T + "월 <b>" + Calc.fmtWon(sum12(u0.m)) + "</b> · " + u0.n + "줄</span></div>" +
            (grpName ? '<div class="sugg">💡 더존 묶음 계정 <b>' + esc(grpName) + "</b> → <b>" + esc(u0.top) + "</b> 대분류에 새 중분류 ‘" + esc(u0.name) + "’ (추천)</div>" : "") +
            '<div class="seg um-seg">' + [["exist", "기존 칸에 넣기"], ["new", "새 칸 만들기"], ["ex", "제외 (집행에 안 넣음)"]].map(function (o) { return '<button data-um="' + o[0] + '" class="' + (u0.mode === o[0] ? "on" : "") + '">' + o[1] + "</button>"; }).join("") + "</div>" +
            (u0.mode === "exist" ? '<div class="um-pick"><label>계정 <select class="inp plain" data-uf="leaf" style="width:360px">' + leaves.map(function (l) { return '<option value="' + esc(l[0]) + '"' + (u0.leaf === l[0] ? " selected" : "") + ">" + esc(l[1]) + "</option>"; }).join("") + "</select></label></div>" :
              u0.mode === "new" ? '<div class="um-pick"><label>대분류 <select class="inp plain" data-uf="top">' + S.cat.map(function (t) { return '<option' + (t.name === u0.top ? " selected" : "") + ">" + esc(t.name) + "</option>"; }).join("") + '</select></label><label>새 중분류 이름 <input class="inp" data-uf="mid" value="' + esc(u0.mid || u0.name) + '" style="width:200px"></label></div>' : "") + "</div>";
        }).join("") + (isClosed() ? '<div class="pv-note">' + S.year + "년 계획이 마감돼 있어 새 칸은 <b>계획 외</b>로 들어갑니다.</div>" : "");
      } else if (st.step === 3) {
        h += '<div class="lead2">' + esc(st.baseName) + " (지난번 " + st.baseMonth + "월) 와 " + esc(st.jn.name) + " 의 <b>1~" + st.baseMonth + "월</b>을 전표 단위로 비교했습니다. 반영하면 지난 달 금액은 이번 파일 기준으로 바뀌고, 계정 옆에 ⚠ 표시가 붙습니다 (정상 처리하면 사라짐).</div>" +
          '<table class="maptbl mon"><tr><th>월</th><th>계정</th><th>지난번</th><th>이번</th><th>차이</th><th>바뀐 전표</th></tr>' + st.alerts.map(function (a) {
            var add = a.changes.filter(function (c) { return c.k === "추가"; }).length, del = a.changes.filter(function (c) { return c.k === "삭제"; }).length, chg = a.changes.filter(function (c) { return c.k === "금액 바뀜"; }).length;
            return "<tr><td>" + a.m + "월</td><td>" + esc(a.path) + '</td><td class="n">' + Calc.fmtWon(a.before) + '</td><td class="n">' + Calc.fmtWon(a.after) + '</td><td class="n ' + (a.after > a.before ? "up" : "down") + '">' + (a.after - a.before > 0 ? "+" : "") + Calc.fmtWon(a.after - a.before) + "</td><td>" + (add ? "추가 " + add + "건 " : "") + (chg ? "금액 바뀜 " + chg + "건 " : "") + (del ? "삭제 " + del + "건" : "") + "</td></tr>";
          }).join("") + "</table>";
      } else {
        var c = st.checks;
        h += '<div class="vk">' + c.items.map(function (x) {
          return '<div class="vk-i ' + (x.ok ? "ok" : "stop") + '"><span class="vk-ic">' + (x.ok ? "✓" : "✖") + "</span><b>" + esc(x.title) + '</b><span class="vk-n">' + esc(x.note) + "</span>" +
            (x.list && x.list.length ? '<div class="vk-list">' + x.list.slice(0, 40).map(function (t) { return "<a>" + esc(t) + "</a>"; }).join("") + (x.list.length > 40 ? "<a>… 외 " + (x.list.length - 40) + "</a>" : "") + "</div>" : "") + "</div>";
        }).join("") + "</div>" +
          (st.ok ? '<div class="pv-note" style="margin-top:8px">반영: ' + st.T + "월까지 · 판관비 " + Calc.fmtWon(c.total) + "원" + (st.alerts.length ? " · 지난 달 수정 " + st.alerts.length + "건" : "") + "</div>" :
            '<div class="confirm" style="margin-top:10px">✖ 가 있어 <b>반영하지 않습니다</b>. 집행은 지난번 그대로 두고 <b>문제 로그</b>에 남깁니다. 더존에서 다시 받아 넣은 뒤 다시 읽으세요.</div>');
      }
      return h + "</div>";
    }
    function foot() {
      var f = $("modal").querySelector(".mdl-foot"), ok = f.querySelector("[data-ok]");
      ok.disabled = false;
      if (st.step === 1) { ok.textContent = "다음 ›"; ok.disabled = !T || same || stale; }
      else if (st.step === 2) ok.textContent = "정하고 다음 ›";
      else if (st.step === 3) ok.textContent = "확인하고 다음 ›";
      else ok.textContent = st.ok ? "집행에 반영" : "문제 로그에 남기고 닫기";
    }
    function draw() { dlg.el.querySelector(".mdl-body").innerHTML = body(); foot(); }
    function next() {
      if (st.step === 1) return loadPair().then(function () { st.un = unmapped(); st.step = st.un.length ? 2 : 3; if (st.step === 3) prepAlerts(); });
      if (st.step === 2) { applyUnmapped(); prepAlerts(); return Promise.resolve(); }
      if (st.step === 3) { st.step = 4; runChecks(); return Promise.resolve(); }
      if (st.ok) commit(); else fail();
      return Promise.resolve("close");
    }
    function loadPair() {
      var p = pairs[T], need = [];
      [["jn", p.jn], ["pl", p.pl]].forEach(function (x) { if (!x[1][x[0]]) need.push(Store.readDouzone(path, x[1]).then(function (r) { x[1][x[0]] = r[x[0]]; })); });
      // 비교 기준: 지난번 반영 내역, 없으면 그 전 달 파일
      if (!X.lines.length && full.length > 1) {
        var bm = full[full.length - 2], bf = pairs[bm].jn;
        need.push((bf.jn ? Promise.resolve(bf) : Store.readDouzone(path, bf)).then(function (r) { st.base = r.jn.lines; st.baseMonth = bm; st.baseName = bf.name; }));
      }
      return Promise.all(need).then(function () {
        st.jn = { name: p.jn.name, size: p.jn.size, mtime: p.jn.mtime, d: p.jn.jn }; st.pl = { name: p.pl.name, size: p.pl.size, mtime: p.pl.mtime, d: p.pl.pl };
        if (X.lines.length) { st.base = X.lines; st.baseMonth = X.month; st.baseName = X.src.jn; }
      });
    }
    function unmapped() {
      var ix = dzIndex(), u0 = {};
      st.jn.d.lines.forEach(function (l) {
        if (ix.excluded(l) || ix.leaf(l)) return;
        var k = l.code || l.name, x = u0[k] = u0[k] || { code: l.code, name: l.name, m: new Array(12).fill(0), n: 0 };
        x.m[l.m - 1] += l.amt; x.n++;
      });
      return Object.keys(u0).map(function (k) { return u0[k]; });
    }
    function applyUnmapped() {
      if (!st.un.length) { st.step = 3; return; }
      var memo = st.T + "월 더존 자료 읽기 중 정리";
      change(function () {
        st.un.forEach(function (x) {
          var d = { code: x.code, name: x.name };
          if (x.mode === "ex") { S.exclude.push(d); return; }
          if (x.mode === "exist") { var h = findLeaf(x.leaf); if (h) h.leaf.dz.push(d); return; }
          var top = topBy(x.top) || pushTop(x.top), name = (x.mid || x.name).trim(), mid = midBy(top, name);
          if (!mid) mid = pushMid(top, name);
          var lf = isLeafMid(mid) ? mid : mid.kids[0];
          lf.dz.push(d);
          if (isClosed() && !S.plan[lf.id]) { var b = Calc.blankPlan(); b.out = true; S.plan[lf.id] = b; }
        });
      }, "더존 미연결 과목 정리 " + st.un.length + "개", { master: true, verKind: "집행 읽기", verMemo: memo });
      st.step = 3;
    }
    function prepAlerts() {
      st.alerts = [];
      if (!st.base || !st.baseMonth) { st.step = 4; runChecks(); return; }
      var ix = dzIndex(), agg = function (lines) {
        var o = {};
        lines.forEach(function (l) { if (l.m > st.baseMonth || ix.excluded(l)) return; var id = ix.leaf(l) || "?" + (l.code || l.name), k = id + "|" + l.m; (o[k] = o[k] || { id: id, m: l.m, sum: 0, keys: {} }).sum += l.amt; o[k].keys[lineKey(l)] = (o[k].keys[lineKey(l)] || []).concat([l]); });
        return o;
      };
      var A = agg(st.base), B = agg(st.jn.d.lines);
      Object.keys(Object.assign({}, A, B)).forEach(function (k) {
        var a = A[k] || { sum: 0, keys: {} }, b = B[k] || { sum: 0, keys: {} }, x = A[k] || B[k];
        var changes = [];
        Object.keys(Object.assign({}, a.keys, b.keys)).forEach(function (lk) {
          var na = (a.keys[lk] || []).length, nb = (b.keys[lk] || []).length, l = (b.keys[lk] || a.keys[lk])[0];
          for (var i = 0; i < Math.abs(nb - na); i++) changes.push({ k: nb > na ? "추가" : "삭제", d: l.d, no: l.no, memo: l.memo, ptn: l.ptn, amt: l.amt, code: l.code, name: l.name });
        });
        if (!changes.length && Math.round(a.sum - b.sum) === 0) return;
        // 같은 전표(일자 · 번호)의 추가 + 삭제는 '금액 바뀜' 한 줄로
        var dels = changes.filter(function (c) { return c.k === "삭제"; });
        changes = changes.filter(function (c) {
          if (c.k !== "추가") return c.k !== "삭제" || !c._used;
          var d = dels.filter(function (x) { return !x._used && x.d === c.d && x.no === c.no; })[0];
          if (!d) return true;
          d._used = true; c.k = "금액 바뀜"; c.before = d.amt; c.memo = c.memo || d.memo;
          return true;
        }).filter(function (c) { return !c._used; });
        var h = findLeaf(x.id);
        st.alerts.push({ id: "A" + Date.now().toString(36) + st.alerts.length, at: "", file: st.jn.name, m: x.m, leaf: x.id, path: h ? leafPath(h) : x.id.slice(1), before: a.sum, after: b.sum, changes: changes, state: "미처리", doneAt: "", reason: "" });
      });
      st.alerts.sort(function (p, q) { return (p.m - q.m) || p.path.localeCompare(q.path); });
      if (!st.alerts.length) { st.step = 4; runChecks(); } else st.step = 3;
    }
    function runChecks() {
      var jn = st.jn.d, pl = st.pl.d, items = [], T0 = st.T, ix = dzIndex();
      var hasTot = jn.totDr !== null;
      items.push({ title: "분개장 합계 줄: 차변 합 = 대변 합", ok: !hasTot || Math.round(jn.totDr - jn.totCr) === 0, note: hasTot ? Calc.fmtWon(jn.totDr) + " / " + Calc.fmtWon(jn.totCr) : "합계 줄 없음" });
      items.push({ title: "읽은 줄 합 = 분개장 합계 줄", ok: !hasTot || (Math.round(jn.drSum - jn.totDr) === 0 && Math.round(jn.crSum - jn.totCr) === 0), note: Calc.fmtWon(jn.drSum) + " / " + Calc.fmtWon(jn.crSum) });
      items.push({ title: "분개장 기간 = 1월 ~ " + T0 + "월", ok: jn.maxD.slice(5, 7) <= ("0" + T0).slice(-2) && jn.minD.slice(0, 4) === String(S.year), note: jn.minD + " ~ " + jn.maxD });
      var jm = new Array(12).fill(0), byName = {};
      jn.lines.forEach(function (l) { jm[l.m - 1] += l.amt; var k = nm(l.name), a = byName[k] = byName[k] || new Array(12).fill(0); a[l.m - 1] += l.amt; });
      var badM = [];
      for (var m = 1; m <= T0; m++) if (Math.round(jm[m - 1] - pl.total[m - 1]) !== 0) badM.push(m + "월: 분개장 " + Calc.fmtWon(jm[m - 1]) + " / 손익 " + Calc.fmtWon(pl.total[m - 1]));
      items.push({ title: "판관비 합계: 분개장 = 손익 ‘Ⅳ 판매관리비’ (1~" + T0 + "월 각 달)", ok: pl.has && !badM.length, note: !pl.has ? "손익에 판매관리비 줄이 없음" : badM.length ? badM.length + "달 다름" : T0 + "개월 모두 맞음", list: badM });
      var badA = [], names = Object.keys(Object.assign({}, byName, pl.items));
      names.forEach(function (k) {
        var a = byName[k] || new Array(12).fill(0), b = pl.items[k] || new Array(12).fill(0);
        for (var mm = 1; mm <= T0; mm++) if (Math.round(a[mm - 1] - b[mm - 1]) !== 0) badA.push(mm + "월 · " + k + " — 분개장 " + Calc.fmtWon(a[mm - 1]) + " / 손익 " + Calc.fmtWon(b[mm - 1]) + " / 차이 " + Calc.fmtWon(a[mm - 1] - b[mm - 1]));
      });
      items.push({ title: "계정 · 월별: 분개장 합 = 손익 과목 금액", ok: !badA.length, note: badA.length ? badA.length + "곳 다름" : "모두 맞음", list: badA });
      var mapped = 0, ex = 0, total = 0, un = 0;
      jn.lines.forEach(function (l) { total += l.amt; if (ix.excluded(l)) ex += l.amt; else if (ix.leaf(l)) mapped += l.amt; else un += l.amt; });
      items.push({ title: "계정에 넣은 금액 + 제외 = 판관비 합계", ok: Math.round(mapped + ex - total) === 0, note: Calc.fmtWon(mapped) + " + " + Calc.fmtWon(ex) + " = " + Calc.fmtWon(total) + (un ? " (미연결 " + Calc.fmtWon(un) + ")" : "") });
      st.checks = { items: items, total: total };
      st.ok = items.every(function (x) { return x.ok; });
    }
    function commit() {
      var now = Store.stamp();
      X.lines = st.jn.d.lines;
      XJN = { name: st.jn.name, all: st.jn.d.all };
      X.month = st.T; X.at = now; X.src = { jn: st.jn.name, pl: st.pl.name };
      res.forEach(function (f) {
        if (!f.kind || !f.month) return;
        X.files = X.files.filter(function (k) { return k.name !== f.name; });
        X.files.push({ name: f.name, type: f.kind, month: f.month, size: f.size, mtime: f.mtime, at: (f === pairs[st.T].jn || f === pairs[st.T].pl) ? now : "" });
      });
      st.alerts.forEach(function (a) { a.at = now; X.alerts.push(a); });
      xLog("반영: " + st.T + "월까지 (" + st.jn.name + " + " + st.pl.name + ") · 판관비 " + Calc.fmtWon(st.checks.total) + "원" + (st.alerts.length ? " · 지난 달 수정 " + st.alerts.length + "건" : ""));
      xSave(true);
      renderAll();
      toast(st.T + "월까지 집행을 반영했습니다" + (st.alerts.length ? " — 지난 달 수정 " + st.alerts.length + "건은 ⚠ 표시를 눌러 확인하세요" : ""), false, 5000);
    }
    function fail() {
      var bad = st.checks.items.filter(function (x) { return !x.ok; });
      X.problems.push({ at: Store.stamp(), file: st.jn.name + " · " + st.pl.name, text: bad.map(function (x) { return x.title + " — " + x.note + (x.list && x.list.length ? " (" + x.list.slice(0, 5).join("; ") + (x.list.length > 5 ? " …" : "") + ")" : ""); }).join(" / ") });
      xLog("반영 안 함 (대조 불일치): " + st.jn.name + " · " + st.pl.name);
      xSave(false);
      renderAll();
      toast("대조가 맞지 않아 반영하지 않았습니다 — [반영 기록]의 문제 로그를 보세요", true, 6000);
    }

    openDialog({
      title: "더존 자료 읽기", crumb: "집행 › (연결한 폴더)\\" + path.replace("/", "\\"), width: 1000, body: "", okText: "다음 ›", focus: false, enterOk: false,
      onOk: function () {
        next().then(function (r) { if (r === "close") closeDialog(); else draw(); }, function (e) { toast("파일을 읽지 못했습니다: " + (e && e.message || e), true, 6000); });
        return false;
      }
    });
    dlg.el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-um]");
      if (b) { var u0 = st.un[+b.closest("[data-u]").getAttribute("data-u")]; u0.mode = b.getAttribute("data-um"); if (u0.mode === "exist" && !u0.leaf) { var f0 = null; eachLeaf(S.cat, function (t, m, s, lf) { if (!f0 && t.name === u0.top) f0 = lf.id; }); u0.leaf = f0; } draw(); }
    });
    dlg.el.addEventListener("change", function (e) {
      var f = e.target.getAttribute("data-uf");
      if (!f) return;
      var u0 = st.un[+e.target.closest("[data-u]").getAttribute("data-u")];
      if (f === "leaf") u0.leaf = e.target.value; else if (f === "top") u0.top = e.target.value; else u0.mid = e.target.value;
    });
    dlg.el.addEventListener("input", function (e) { if (e.target.getAttribute("data-uf") === "mid") st.un[+e.target.closest("[data-u]").getAttribute("data-u")].mid = e.target.value; });
    draw();
  }

  /* ---------- 내역 팝업 (영향도 · 묶기 · 정렬 · 중복 의심 · 메모 · 전표 전체) ----------
     scope: {ids:[계정 ID], months:[월], title} */
  function xLinesFor(ids, months) {
    var ix = dzIndex(), set = {}, ms = {};
    ids.forEach(function (i) { set[i] = 1; });
    months.forEach(function (m) { ms[m] = 1; });
    return X.lines.filter(function (l) { return ms[l.m] && !ix.excluded(l) && set[ix.leaf(l)]; });
  }
  function lineMemoKey(l) { return "l|" + lineKey(l); }
  function detailDialog(scope) {
    var lines = xLinesFor(scope.ids, scope.months), rows = xRows(true).filter(function (r) { return scope.ids.indexOf(r.id) >= 0; });
    var sumM = function (k) { var t = 0; rows.forEach(function (r) { scope.months.forEach(function (m) { t += r[k][m - 1]; }); }); return t; };
    var act = lines.reduce(function (a, l) { return a + l.amt; }, 0), plan = sumM("plan"), prev = 0, M = X.month;
    rows.forEach(function (r) { var p = planFor(r.id); if (p.pm && p.pm.length === 12) scope.months.forEach(function (m) { prev += p.pm[m - 1]; }); });
    var others = [], oth = 0;
    for (var m = 1; m <= M; m++) if (scope.months.indexOf(m) < 0) others.push(m);
    rows.forEach(function (r) { others.forEach(function (mm) { oth += r.act[mm - 1]; }); });
    var usual = others.length ? oth / others.length * scope.months.length : 0, diff = act - plan;
    var V = { group: "line", sort: "amt-", q: "" };
    // 중복 의심: 같은 금액 · 같은 거래처 · 같은 계정 · 7일 안
    var dup = {};
    lines.forEach(function (a, i) {
      lines.forEach(function (b, j) {
        if (j <= i || a.amt !== b.amt || a.code !== b.code || (a.ptn || "") !== (b.ptn || "") || a.no === b.no && a.d === b.d) return;
        if (Math.abs(new Date(a.d) - new Date(b.d)) <= 7 * 864e5) { dup[i] = 1; dup[j] = 1; }
      });
    });
    lines.forEach(function (l, i) { l._i = i; });
    function head() {
      var h = '<div class="imp">' +
        '<div class="imp-k"><span>' + (scope.months.length > 1 ? "집행 (" + scope.months[0] + "~" + scope.months[scope.months.length - 1] + "월)" : "집행") + "</span><b>" + Calc.fmtWon(act) + "</b><small>" + lines.length + "줄</small></div>" +
        '<div class="imp-k"><span>계획</span><b>' + Calc.fmtWon(plan) + '</b><small class="' + (diff > 0 ? "upc" : "dnc") + '">' + (diff > 0 ? "초과 +" : diff < 0 ? "절감 " : "") + (diff ? Calc.fmtWon(diff) + (plan ? " (" + (diff / plan * 100 > 0 ? "+" : "") + (diff / plan * 100).toFixed(1) + "%)" : "") : "계획과 같음") + "</small></div>" +
        '<div class="imp-k"><span>평소 (다른 달 평균)</span><b>' + (others.length ? Calc.fmtWon(usual) : "-") + "</b><small>" + (usual ? "이번 " + (act / usual).toFixed(1) + "배" : "") + "</small></div>" +
        '<div class="imp-k"><span>전년 같은 달</span><b>' + (prev ? Calc.fmtWon(prev) : "-") + "</b><small>" + (prev ? (act >= prev ? "+" : "") + ((act - prev) / prev * 100).toFixed(1) + "%" : "전년 월별 실적 없음") + "</small></div>";
      if (diff > 0) {
        var srt = lines.slice().sort(function (a, b) { return b.amt - a.amt; }), cum = 0, top = [];
        for (var i = 0; i < srt.length && cum < diff; i++) { cum += srt[i].amt; top.push(srt[i]); }
        h += '<div class="imp-bar"><div class="ib">초과분 +' + Calc.fmtWon(diff) + " — 큰 전표 " + top.length + "건이 설명</div>" + top.slice(0, 3).map(function (l, k) {
          var c = 0; for (var j = 0; j <= k; j++) c += top[j].amt;
          return '<div class="ib"><i style="width:' + Math.min(100, c / diff * 100).toFixed(1) + '%"></i>' + Math.round(Math.min(1, c / diff) * 100) + "% · " + esc(l.memo || l.name) + " " + Calc.fmtWon(l.amt) + "</div>";
        }).join("") + "</div>";
      }
      return h + "</div>";
    }
    function list() {
      var q = V.q.toLowerCase(), ls = lines.filter(function (l) { return !q || (l.memo + " " + l.ptn + " " + l.no + " " + l.d + " " + Calc.fmtWon(l.amt)).toLowerCase().indexOf(q) >= 0; });
      var srt = { "amt-": function (a, b) { return b.amt - a.amt; }, "amt+": function (a, b) { return a.amt - b.amt; }, "d+": function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : +a.no - +b.no; }, "d-": function (a, b) { return a.d > b.d ? -1 : a.d < b.d ? 1 : +b.no - +a.no; }, "ptn": function (a, b) { return (a.ptn || "").localeCompare(b.ptn || "", "ko") || b.amt - a.amt; } }[V.sort];
      var expl = {};
      if (diff > 0) { var cum = 0; lines.slice().sort(function (a, b) { return b.amt - a.amt; }).forEach(function (l) { if (cum < diff) { expl[l._i] = Math.min(l.amt, diff - cum) / diff; cum += l.amt; } }); }
      var multiAcc = scope.ids.length > 1, multiM = scope.months.length > 1, h;
      if (V.group !== "line") {
        var g = {}, key = V.group === "ptn" ? function (l) { return l.ptn || "(거래처 없음)"; } : function (l) { return (l.memo || "(적요 없음)").replace(/\s*\(.*\)$/, "").replace(/\d+/g, "#"); };
        ls.forEach(function (l) { var k = key(l), x = g[k] = g[k] || { k: k, n: 0, amt: 0 }; x.n++; x.amt += l.amt; });
        var gl = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.amt - a.amt; });
        h = '<table class="ov jl"><tr><th>' + (V.group === "ptn" ? "거래처" : "적요 (비슷한 것끼리)") + '</th><th>건수</th><th>금액</th><th>비중</th></tr>' + gl.map(function (x) {
          return "<tr><td>" + esc(x.k) + '</td><td class="n">' + x.n + '</td><td class="n"><b>' + Calc.fmtWon(x.amt) + '</b></td><td class="share"><span class="sbar g" style="width:' + (act ? Math.max(0, x.amt / act * 140) : 0) + 'px"></span>' + (act ? (x.amt / act * 100).toFixed(1) : "0") + "%</td></tr>";
        }).join("") + "</table>";
        return h;
      }
      ls.sort(srt);
      var cum2 = 0;
      h = '<table class="ov jl"><tr><th data-s="">순위</th><th data-s="d">일자</th><th>번호</th>' + (multiAcc ? "<th>계정</th>" : "") + '<th>적요</th><th data-s="ptn">거래처</th><th data-s="amt">금액</th><th>이 달 비중</th><th>누적 비중</th><th>영향</th><th>결의</th><th>PJT</th></tr>' +
        ls.map(function (l, i) {
          cum2 += l.amt;
          var mk = X.memos[lineMemoKey(l)], ex = expl[l._i];
          return '<tr class="' + (ex ? "top" : "") + '" data-li="' + l._i + '"><td>' + (i + 1) + "</td><td>" + l.d.replace(/-/g, "/") + "</td><td>" + esc(l.no) + "</td>" + (multiAcc ? "<td>" + esc(l.name) + "</td>" : "") +
            "<td" + (mk ? ' class="hasmemo" data-memo="' + esc(mk.text) + '"' : "") + ">" + esc(l.memo) + (dup[l._i] ? ' <span class="dup" title="같은 금액 · 같은 거래처 · 7일 안에 또 있음">중복?</span>' : "") + "</td><td>" + esc(l.ptn) + '</td><td class="n"><b>' + Calc.fmtWon(l.amt) + "</b></td>" +
            '<td class="share"><span class="sbar g" style="width:' + (act ? Math.max(0, l.amt / act * 100) : 0) + 'px"></span>' + (act ? (l.amt / act * 100).toFixed(1) : "0") + '%</td><td class="share"><span class="sbar g" style="width:' + (act ? Math.max(0, Math.min(1, cum2 / act) * 100) : 0) + 'px"></span>' + (act ? (cum2 / act * 100).toFixed(1) : "0") + "%</td>" +
            "<td>" + (ex ? '<span class="dup expl">초과 설명 ' + Math.round(ex * 100) + "%</span>" : "") + "</td><td>" + esc(l.gj) + "</td><td>" + esc(l.pjt) + "</td></tr>";
        }).join("") +
        '<tr class="tot"><td colspan="' + (multiAcc ? 6 : 5) + '">합계 · ' + ls.length + "줄" + (ls.length !== lines.length ? " (찾기 결과)" : "") + '</td><td class="n">' + Calc.fmtWon(ls.reduce(function (a, l) { return a + l.amt; }, 0)) + '</td><td colspan="5">' + (diff > 0 ? "계획 대비 초과 +" + Calc.fmtWon(diff) : "") + "</td></tr></table>";
      return h;
    }
    function draw() {
      $("dtHead").innerHTML = head();
      $("dtList").innerHTML = list();
      document.querySelectorAll("#dtTools [data-dg]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-dg") === V.group); });
      $("dtDup").textContent = "중복 의심 " + Object.keys(dup).length; $("dtDup").hidden = !Object.keys(dup).length;
    }
    var title = scope.title + " — 집행 " + Calc.fmtWon(act) + (plan ? " · 계획 " + Calc.fmtWon(plan) + " · " + (diff > 0 ? "초과 +" : "절감 ") + Calc.fmtWon(Math.abs(diff)) : "");
    openDialog({
      title: title, crumb: "집행 › 내역 · 원본 " + X.src.jn, width: 1240, okText: null, cancelText: "닫기", cls: "mdl-dt", enterOk: false,
      body: '<div id="dtHead"></div><div class="ov-tools" id="dtTools"><div class="seg vseg2"><button data-dg="line">전표별</button><button data-dg="ptn">거래처별 묶기</button><button data-dg="memo">적요별 묶기</button></div>' +
        '<label>정렬 <select class="inp plain" id="dtSort" style="width:140px"><option value="amt-">금액 큰 순</option><option value="amt+">금액 작은 순</option><option value="d+">일자 ▲</option><option value="d-">일자 ▼</option><option value="ptn">거래처</option></select></label>' +
        '<input class="search" id="dtQ" placeholder="적요 · 거래처 · 번호 · 금액 찾기" style="width:230px"><span class="chip warn" id="dtDup"></span>' +
        '<span class="dt-tip">줄 우클릭 = 메모 · 더블클릭 = 그 전표 전체</span></div><div class="dt-list" id="dtList"></div>',
      extra: '<button class="btn" id="dtXls">엑셀로</button>'
    });
    $("dtTools").addEventListener("click", function (e) { var b = e.target.closest("[data-dg]"); if (b) { V.group = b.getAttribute("data-dg"); draw(); } });
    $("dtSort").addEventListener("change", function () { V.sort = this.value; draw(); });
    $("dtQ").addEventListener("input", function () { V.q = this.value.trim(); draw(); });
    $("dtList").addEventListener("click", function (e) {
      var th = e.target.closest("th[data-s]");
      if (!th) return;
      var s0 = th.getAttribute("data-s");
      V.sort = s0 === "amt" ? (V.sort === "amt-" ? "amt+" : "amt-") : s0 === "d" ? (V.sort === "d+" ? "d-" : "d+") : s0 === "ptn" ? "ptn" : "amt-";
      $("dtSort").value = V.sort; draw();
    });
    $("dtList").addEventListener("contextmenu", function (e) {
      var tr = e.target.closest("tr[data-li]");
      if (!tr) return;
      e.preventDefault();
      var l = lines[+tr.getAttribute("data-li")];
      memoEdit(lineMemoKey(l), l.d.replace(/-/g, "/") + " #" + l.no + " · " + l.name + " " + Calc.fmtWon(l.amt) + "원", e.clientX, e.clientY, draw);
    });
    $("dtList").addEventListener("dblclick", function (e) {
      var tr = e.target.closest("tr[data-li]");
      if (tr) voucherView(lines[+tr.getAttribute("data-li")]);
    });
    $("dtXls").addEventListener("click", function () {
      var wb = XLSX.utils.book_new(), aoa = [["일자", "번호", "계정코드", "계정과목", "금액", "적요", "거래처", "결의", "PJT", "메모"]];
      lines.slice().sort(function (a, b) { return b.amt - a.amt; }).forEach(function (l) { var mk = X.memos[lineMemoKey(l)]; aoa.push([l.d, l.no, l.code, l.name, l.amt, l.memo, l.ptn, l.gj, l.pjt, mk ? mk.text : ""]); });
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [11, 6, 8, 22, 13, 32, 16, 16, 10, 30].map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, "내역");
      Store.download(wb, "집행내역_" + S.year + "_" + scope.title.replace(/[\\/:*?"<>|›]/g, "_").replace(/\s+/g, "") + ".xlsx");
    });
    draw();
  }
  // 전표 전체 (대변 계정까지): 반영한 분개장 원본에서
  function voucherView(l) {
    var show = function (all) {
      var ls = all.filter(function (x) { return x.d === l.d && x.no === l.no; });
      var h = '<table class="ov jl"><tr><th>일자</th><th>번호</th><th>계정</th><th>차변</th><th>대변</th><th>적요</th><th>거래처</th><th>결의</th></tr>' + ls.map(function (x) {
        return "<tr" + (lineKey(x) === lineKey(l) ? ' class="top"' : "") + "><td>" + x.d.replace(/-/g, "/") + "</td><td>" + esc(x.no) + "</td><td>" + esc(dzText({ code: x.code, name: x.name })) + '</td><td class="n">' + (x.amt > 0 ? Calc.fmtWon(x.amt) : "") + '</td><td class="n">' + (x.amt < 0 ? Calc.fmtWon(-x.amt) : "") + "</td><td>" + esc(x.memo) + "</td><td>" + esc(x.ptn) + "</td><td>" + esc(x.gj) + "</td></tr>";
      }).join("") + "</table>";
      var pop = $("vchPop");
      pop.innerHTML = '<div class="vch-h">전표 ' + l.d.replace(/-/g, "/") + " #" + esc(l.no) + ' <button class="btn sm" id="vchX">닫기</button></div>' + h;
      pop.hidden = false;
      $("vchX").addEventListener("click", function () { pop.hidden = true; });
    };
    if (XJN && XJN.name === X.src.jn) return show(XJN.all);
    toast("원본 분개장을 읽는 중…", false, 1500);
    Store.listFiles(xPath()).then(function (fs) {
      var f = fs.filter(function (x) { return x.name === X.src.jn; })[0];
      if (!f) throw new Error("원본 파일이 폴더에 없습니다: " + X.src.jn);
      return Store.readDouzone(xPath(), f);
    }).then(function (r) { XJN = { name: X.src.jn, all: r.jn.all }; show(XJN.all); }, function (e) { toast(String(e && e.message || e), true, 5000); });
  }

  /* ---------- 메모 (집행 칸 · 전표 줄) — 마우스를 올리면 보임 ---------- */
  function memoEdit(key, label, x, y, after) {
    var ed = $("memoEd"), cur = X.memos[key];
    ed.innerHTML = '<div class="me-h">✎ ' + esc(label) + '</div><textarea id="meText" rows="4" placeholder="이슈 · 특이점 메모">' + esc(cur ? cur.text : "") + '</textarea><div class="me-b">' +
      (cur ? '<span class="me-at">' + esc(cur.at) + '</span><button class="btn sm danger" id="meDel">지우기</button>' : "") + '<button class="btn sm" id="meNo">취소</button><button class="btn sm primary" id="meOk">저장</button></div>';
    ed.hidden = false;
    ed.style.left = Math.max(8, Math.min(x, innerWidth - 340)) + "px";
    ed.style.top = Math.max(8, Math.min(y, innerHeight - 200)) + "px";
    var close = function () { ed.hidden = true; };
    $("meText").focus();
    $("meNo").addEventListener("click", close);
    $("meOk").addEventListener("click", function () {
      var t = $("meText").value.trim();
      if (t) X.memos[key] = { text: t, at: Store.stamp().slice(0, 16), label: label }; else delete X.memos[key];
      xLog("메모 " + (t ? "저장" : "지움") + ": " + label);
      close(); xSave(false); renderAll(); if (after) after();
    });
    if (cur) $("meDel").addEventListener("click", function () { delete X.memos[key]; xLog("메모 지움: " + label); close(); xSave(false); renderAll(); if (after) after(); });
    $("meText").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("meOk").click(); if (e.key === "Escape") { e.stopPropagation(); close(); } });
  }
  function bindMemoTip() {
    var tip = $("memoTip");
    document.addEventListener("mouseover", function (e) {
      var c = e.target.closest && e.target.closest("[data-memo]");
      if (!c) { tip.hidden = true; return; }
      tip.textContent = c.getAttribute("data-memo");
      var r = c.getBoundingClientRect();
      tip.hidden = false;
      tip.style.left = Math.min(r.right + 6, innerWidth - 300) + "px";
      tip.style.top = Math.max(4, r.top - 4) + "px";
    });
  }
  function memoList() {
    var ks = Object.keys(X.memos);
    if (!ks.length) { toast("아직 메모가 없습니다 — 집행 칸이나 내역 줄을 우클릭해서 메모를 남기세요"); return; }
    var rows = ks.map(function (k) { var m = X.memos[k]; return { k: k, label: m.label || k, text: m.text, at: m.at }; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    openDialog({
      title: "메모 모아보기 · " + rows.length + "개", crumb: "집행 › 칸 메모와 전표 줄 메모", width: 900, okText: null, cancelText: "닫기",
      body: '<div class="mdl-pad"><table class="maptbl mon"><tr><th>위치</th><th>메모</th><th>일시</th></tr>' + rows.map(function (r) {
        return '<tr data-mk="' + esc(r.k) + '" class="clk"><td>' + esc(r.label) + "</td><td>" + esc(r.text) + "</td><td>" + esc(r.at) + "</td></tr>";
      }).join("") + "</table><div class=\"pv-note\">줄을 누르면 그 내역으로 갑니다.</div></div>",
      extra: '<button class="btn" id="mlXls">엑셀로</button>'
    });
    dlg.el.addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-mk]");
      if (!tr) return;
      var k = tr.getAttribute("data-mk"), p = k.split("|");
      closeDialog();
      if (p[0] === "c") { var h = findLeaf(p[1]); if (h) detailDialog({ ids: [p[1]], months: +p[2] ? [+p[2]] : range(xUpto()), title: (+p[2] ? p[2] + "월 " : "") + leafPath(h) }); }
      else {
        var l = X.lines.filter(function (x) { return "l|" + lineKey(x) === k; })[0], ix = dzIndex(), id = l && ix.leaf(l), hh = id && findLeaf(id);
        if (hh) detailDialog({ ids: [id], months: [l.m], title: l.m + "월 " + leafPath(hh) });
      }
    });
    $("mlXls").addEventListener("click", function () {
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["위치", "메모", "일시"]].concat(rows.map(function (r) { return [r.label, r.text, r.at]; }))), "메모");
      Store.download(wb, "집행메모_" + S.year + ".xlsx");
    });
  }
  function range(n) { var o = []; for (var i = 1; i <= n; i++) o.push(i); return o; }

  /* ---------- 지난 달 수정 — 정상 처리 (사유 선택) ---------- */
  function alertsDialog(onlyLeaf) {
    var list = X.alerts.filter(function (a) { return !onlyLeaf || a.leaf === onlyLeaf; });
    if (!list.length) { toast("지난 달 수정 기록이 없습니다"); return; }
    var sel = (list.filter(function (a) { return a.state !== "정상"; })[0] || list[0]).id;
    function draw() {
      var a = X.alerts.filter(function (x) { return x.id === sel; })[0];
      $("alList").innerHTML = list.slice().sort(function (p, q) { return (p.state === "정상") - (q.state === "정상") || (p.at < q.at ? 1 : -1); }).map(function (x) {
        return '<div class="vi' + (x.id === sel ? " on" : "") + (x.state === "정상" ? " done" : "") + '" data-al="' + x.id + '"><div><b>' + x.m + "월</b>" + (x.state === "정상" ? '<span class="cur">정상</span>' : '<span class="cur warn">⚠ 미처리</span>') + '<span class="d">' + esc(x.at.slice(0, 16)) + '</span></div><div class="s">' + esc(x.path) + '</div><div class="m">' + (x.after - x.before > 0 ? "+" : "") + Calc.fmtWon(x.after - x.before) + "</div></div>";
      }).join("");
      $("alBody").innerHTML = '<div class="vh-title"><b>' + a.m + "월 · " + esc(a.path) + '</b> <span class="l">' + esc(a.file) + " 에서 발견 · " + esc(a.at) + "</span></div>" +
        '<div class="vh-sub">지난번 <b>' + Calc.fmtWon(a.before) + "</b> → 이번 <b>" + Calc.fmtWon(a.after) + "</b> (" + (a.after - a.before > 0 ? "+" : "") + Calc.fmtWon(a.after - a.before) + ")</div>" +
        '<div class="vh-scroll"><table class="maptbl mon"><tr><th>구분</th><th>일자 · 번호</th><th>적요</th><th>거래처</th><th>금액</th></tr>' + (a.changes.length ? a.changes.map(function (c) {
          return '<tr class="' + (c.k === "삭제" ? "delr" : "addr") + '"><td><span class="st ' + (c.k === "삭제" ? "bad" : "new") + '">' + c.k + "</span></td><td>" + esc(c.d.replace(/-/g, "/")) + " · " + esc(c.no) + "</td><td>" + esc(c.memo) + "</td><td>" + esc(c.ptn) + '</td><td class="n">' + (c.before !== undefined ? Calc.fmtWon(c.before) + " → " : "") + Calc.fmtWon(c.amt) + "</td></tr>";
        }).join("") : '<tr><td colspan="5" class="mute">전표는 같고 분류 연결이 바뀌어 금액이 달라졌습니다</td></tr>') + "</table></div>" +
        (a.state === "정상" ? '<div class="vh-tip">✓ ' + esc(a.doneAt) + " 정상 처리" + (a.reason ? " — 사유: " + esc(a.reason) : "") + "</div>" :
          '<div class="f-row" style="margin-top:10px"><label>사유 (선택)</label><input class="inp plain" id="alReason" placeholder="예: 7월 누락분 8월 마감 후 추가 기표 — 경리 확인"></div>' +
          '<div class="vh-btns"><span style="flex:1"></span><button class="btn" id="alDetail">' + a.m + '월 내역 보기</button><button class="btn primary" id="alOk">정상 처리</button></div>');
      var ok = $("alOk");
      if (ok) ok.addEventListener("click", function () {
        a.state = "정상"; a.doneAt = Store.stamp(); a.reason = $("alReason").value.trim();
        xLog("지난 달 수정 정상 처리: " + a.m + "월 " + a.path + (a.reason ? " — " + a.reason : ""));
        xSave(false); renderAll();
        var nx = list.filter(function (x) { return x.state !== "정상"; })[0];
        if (nx) sel = nx.id;
        draw();
        toast("정상 처리했습니다");
      });
      var dt = $("alDetail");
      if (dt) dt.addEventListener("click", function () { var h = findLeaf(a.leaf); closeDialog(); if (h) detailDialog({ ids: [a.leaf], months: [a.m], title: a.m + "월 " + leafPath(h) }); });
    }
    openDialog({ title: "지난 달 수정" + (onlyLeaf ? "" : " · 미처리 " + X.alerts.filter(function (x) { return x.state !== "정상"; }).length), crumb: "집행 › 이전 파일과 바뀐 전표", width: 1060, okText: null, cancelText: "닫기",
      body: '<div class="vh"><div class="vh-list" id="alList"></div><div class="vh-body" id="alBody"></div></div>' });
    $("alList").addEventListener("click", function (e) { var it = e.target.closest("[data-al]"); if (it) { sel = it.getAttribute("data-al"); draw(); } });
    draw();
  }

  /* ---------- 반영 기록 · 문제 로그 ---------- */
  function xLogDialog() {
    var rows = X.log.map(function (l) { return { t: l.t, k: /반영 안 함/.test(l.m) ? "문제" : /정상 처리/.test(l.m) ? "정상 처리" : /^반영/.test(l.m) ? "반영" : "기록", m: l.m }; })
      .concat(X.problems.map(function (p) { return { t: p.at, k: "문제 상세", m: p.file + " — " + p.text }; })).sort(function (a, b) { return a.t < b.t ? 1 : -1; });
    openDialog({ title: "반영 기록 · 문제 로그", crumb: "집행 › data\\" + Store.execName(S.year), width: 980, okText: null, cancelText: "닫기",
      body: '<div class="mdl-pad"><table class="maptbl mon"><tr><th>일시</th><th>구분</th><th>내용</th></tr>' + (rows.length ? rows.map(function (r) {
        return "<tr" + (/문제/.test(r.k) ? ' class="bad"' : "") + "><td>" + esc(r.t) + '</td><td><span class="st ' + (/문제/.test(r.k) ? "bad" : r.k === "반영" ? "new" : "same") + '">' + r.k + "</span></td><td>" + esc(r.m) + "</td></tr>";
      }).join("") : '<tr><td colspan="3" class="mute">기록이 없습니다</td></tr>') + "</table></div>" });
  }

  /* ---------- 분개장 전체 검색 (계정 상관없이) ---------- */
  function xSearchDialog() {
    var V = { q: "", f: "all", open: null };
    function result() {
      var q = V.q.toLowerCase().replace(/,/g, "");
      if (!q) return '<div class="cm-empty">거래처 · 적요 · 금액 · 전표번호로 찾습니다 (판관비 전표만)</div>';
      var ix = dzIndex(), g = {};
      X.lines.forEach(function (l) {
        var hay = V.f === "ptn" ? l.ptn : V.f === "memo" ? l.memo : V.f === "amt" ? String(Math.abs(l.amt)) : l.ptn + " " + l.memo + " " + Math.abs(l.amt) + " " + l.no + " " + l.name;
        if (String(hay).toLowerCase().indexOf(q) < 0) return;
        var id = ix.leaf(l) || "?", k = id + "|" + l.code, x = g[k] = g[k] || { id: id, code: l.code, name: l.name, n: 0, amt: 0, ls: [] };
        x.n++; x.amt += l.amt; x.ls.push(l);
      });
      var gl = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.amt - a.amt; });
      if (!gl.length) return '<div class="cm-empty">찾는 전표가 없습니다</div>';
      var tot = gl.reduce(function (a, x) { return a + x.amt; }, 0), cnt = gl.reduce(function (a, x) { return a + x.n; }, 0);
      return '<div class="vh-sub">' + cnt + "줄 · " + Calc.fmtWon(tot) + "원 · 계정 " + gl.length + '개</div><table class="maptbl mon"><tr><th>계정</th><th>건수</th><th>금액</th><th></th></tr>' + gl.map(function (x, i) {
        var h = findLeaf(x.id);
        return '<tr class="clk" data-sg="' + i + '"><td>' + esc(h ? leafPath(h) : "(미연결) " + dzText(x)) + '</td><td class="n">' + x.n + '</td><td class="n"><b>' + Calc.fmtWon(x.amt) + "</b></td><td>" + (V.open === i ? "▴" : "▾") + "</td></tr>" +
          (V.open === i ? '<tr><td colspan="4"><table class="ov jl">' + x.ls.sort(function (a, b) { return a.d < b.d ? -1 : 1; }).map(function (l) {
            return '<tr class="clk" data-sl="' + esc(x.id) + "|" + l.m + '"><td>' + l.d.replace(/-/g, "/") + "</td><td>" + esc(l.no) + "</td><td>" + esc(l.memo) + "</td><td>" + esc(l.ptn) + '</td><td class="n">' + Calc.fmtWon(l.amt) + "</td></tr>";
          }).join("") + "</table></td></tr>" : "");
      }).join("") + "</table>";
    }
    openDialog({ title: "분개장 검색", crumb: "집행 › 1~" + X.month + "월 판관비 전표 " + X.lines.length.toLocaleString() + "줄", width: 900, okText: null, cancelText: "닫기",
      body: '<div class="ov-tools"><input class="search" id="sqQ" placeholder="예: ○○상사 · 조의금 · 500000" style="width:280px"><div class="seg vseg2" id="sqF"><button data-f="all" class="on">전체</button><button data-f="ptn">거래처</button><button data-f="memo">적요</button><button data-f="amt">금액</button></div></div><div class="mdl-pad" id="sqR"></div>' });
    var draw = function () { $("sqR").innerHTML = result(); };
    $("sqQ").addEventListener("input", function () { V.q = this.value.trim(); V.open = null; draw(); });
    $("sqF").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (!b) return; V.f = b.getAttribute("data-f"); this.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); draw(); });
    $("sqR").addEventListener("click", function (e) {
      var l = e.target.closest("[data-sl]");
      if (l) { var p = l.getAttribute("data-sl").split("|"), h = findLeaf(p[0]); if (h) { closeDialog(); detailDialog({ ids: [p[0]], months: [+p[1]], title: p[1] + "월 " + leafPath(h) }); } return; }
      var g = e.target.closest("[data-sg]");
      if (g) { var i = +g.getAttribute("data-sg"); V.open = V.open === i ? null : i; draw(); }
    });
    $("sqQ").focus();
    draw();
  }

  /* ---------- 집행 표 클릭 · 우클릭 ---------- */
  function xScopeOf(td) {
    var k = td.getAttribute("data-k"), tr = td.closest("tr"), M = X.month, U = xUpto();
    if (!M || !k || !/^a\d|^at$|^ca$/.test(k)) return null;
    var months = /^a\d/.test(k) ? [+k.slice(1)] : range(XU.agg === "cum" ? U : M);
    if (/^a\d/.test(k) && months[0] > M) return null;
    var ids, title;
    if (tr.classList.contains("acc") && tr.getAttribute("data-id")) { var h = findLeaf(tr.getAttribute("data-id")); ids = [h.leaf.id]; title = leafPath(h); }
    else if (tr.classList.contains("grp")) { var g = tr.getAttribute("data-grp"); ids = xRows(true).filter(function (r) { return r.l1 === g; }).map(function (r) { return r.id; }); title = g + " (대분류 전체)"; }
    else if (tr.classList.contains("total")) { ids = xRows(true).filter(xVisible).map(function (r) { return r.id; }); title = "합계"; }
    else return null;
    return { ids: ids, months: months, title: (months.length === 1 ? months[0] + "월 " : "1~" + months[months.length - 1] + "월 ") + title };
  }
  function bindExec() {
    var t = $("tblX");
    t.addEventListener("click", function (e) {
      var w = e.target.closest("[data-xwarn]");
      if (w) { alertsDialog(w.getAttribute("data-xwarn")); return; }
      var td = e.target.closest("td");
      if (!td) return;
      if (calcOpen() && td.classList.contains("num")) { var v = Calc.num(td.textContent.replace(/△/, "-").replace(/[^\d.\-]/g, "")) * (Calc.DISP_UNITS[S.settings.dispUnit] || [1])[0]; calcPick(td.closest("tr").querySelector(".c-acc").textContent.replace(/⋮⋮|⚠/g, "").trim() + " · " + xKeyName(td.getAttribute("data-k") || ""), v); $("calc").focus(); return; }
      var tr = td.closest("tr");
      if (tr.classList.contains("grp") && td.getAttribute("data-k") === "acc") { var n = "x|" + tr.getAttribute("data-grp"); UI.collapsed[n] = !UI.collapsed[n]; renderAll(); return; }
      if (tr.classList.contains("acc") && tr.getAttribute("data-id")) { XU.sel = tr.getAttribute("data-id"); t.querySelectorAll("tr.is-sel").forEach(function (x) { x.classList.remove("is-sel"); }); tr.classList.add("is-sel"); xFbar(tr.getAttribute("data-id")); }
      var sc = xScopeOf(td);
      if (sc) detailDialog(sc);
    });
    t.addEventListener("contextmenu", function (e) {
      var cell = e.target.closest("th,td");
      if (!cell) return;
      e.preventDefault();
      var k = cell.getAttribute("data-k"), sc = cell.tagName === "TD" ? xScopeOf(cell) : null, items = [];
      var tr = cell.closest("tr"), id = tr && tr.classList.contains("acc") ? tr.getAttribute("data-id") : null;
      var it = function (c, label) { items.push('<div class="ctx-i" data-xc="' + c + '">' + label + "</div>"); };
      if (k) { items.push('<div class="ctx-h">' + esc(xKeyName(k) || "계정") + " 열</div>"); it("sort:1", "▲ 오름차순 정렬"); it("sort:-1", "▼ 내림차순 정렬"); if (XU.sort) it("sort:0", "정렬 해제"); it("freeze", "📌 틀 고정 — 여기까지"); if (XU.freeze !== "acc") it("unfreeze", "틀 고정 해제"); }
      if (sc && id) {
        var mk = "c|" + id + "|" + (sc.months.length === 1 ? sc.months[0] : 0);
        items.push('<div class="ctx-sep"></div>');
        it("memo", "✎ 메모 " + (X.memos[mk] ? "고치기" : "쓰기")); if (X.memos[mk]) it("unmemo", "메모 지우기");
        it("detail", "내역 보기");
      } else if (sc) { items.push('<div class="ctx-sep"></div>'); it("detail", "내역 보기"); }
      var c = $("ctx");
      c.innerHTML = items.join("");
      c._x = { k: k, sc: sc, id: id, x: e.clientX, y: e.clientY };
      place(c, e.clientX, e.clientY);
    });
    $("ctx").addEventListener("click", function (e) {
      var b = e.target.closest("[data-xc]"), x = $("ctx")._x;
      if (!b || !x) return;
      closeCtx();
      var a = b.getAttribute("data-xc");
      if (/^sort/.test(a)) { var d = +a.split(":")[1]; XU.sort = d ? { k: x.k, dir: d } : null; renderAll(); }
      else if (a === "freeze") { XU.freeze = x.k; renderAll(); }
      else if (a === "unfreeze") { XU.freeze = "acc"; renderAll(); }
      else if (a === "detail") detailDialog(x.sc);
      else if (a === "memo" || a === "unmemo") {
        var m = x.sc.months.length === 1 ? x.sc.months[0] : 0, key = "c|" + x.id + "|" + m;
        if (a === "unmemo") { delete X.memos[key]; xSave(false); renderAll(); return; }
        memoEdit(key, x.sc.title + " 집행", x.x, x.y);
      }
    });
    $("xTools").addEventListener("click", function (e) {
      var v = e.target.closest("[data-xv]"), a = e.target.closest("[data-xa]"), q = e.target.closest("[data-xq]");
      if (v) { XU.view = v.getAttribute("data-xv"); renderAll(); }
      if (a) { XU.agg = a.getAttribute("data-xa"); XU.sort = null; renderAll(); }
      if (q) { XU.quick = XU.quick === q.getAttribute("data-xq") ? "" : q.getAttribute("data-xq"); renderAll(); }
    });
    $("xCmp").addEventListener("change", function () { XU.cmp = this.value; renderAll(); });
    $("xUpto").addEventListener("change", function () { XU.upto = +this.value; renderAll(); });
    document.querySelectorAll(".sheets [data-sheet]").forEach(function (a) { a.addEventListener("click", function () { setMode(a.getAttribute("data-sheet")); }); });
    bindMemoTip();
  }
  function xFbar(id) {
    var r = xRows(true).filter(function (x) { return x.id === id; })[0], M = X.month;
    if (!r) return;
    $("fRef").textContent = r.name;
    $("fVal").innerHTML = !M ? "연간 계획 <em>" + u(sum12(r.plan), true) + "</em> " + unitName() + " · 집행은 아직 반영 전 (더존 자료 읽기)" : "1~" + M + "월 집행 <em>" + u(sum12(r.act, M), true) + "</em> / " + CMP[XU.cmp] + " " + u(sum12(r.cmp, M), true) + " · 연간 계획 " + u(sum12(r.plan), true) + " · 연말 예상 " + u(xForecast(r), true) + " " + unitName() +
      (rowAlerts(id).length ? '<span class="w">지난 달 수정 ' + rowAlerts(id).length + "건</span>" : "");
    $("stSel").textContent = "선택: " + r.l1 + " › " + rowLabel(r);
  }

  /* ---------- 이벤트 ---------- */
  function act(name) {
    var needYear = ["importPrev", "export", "addAcc", "editAcc", "delAcc", "openPlan", "toggleAll", "onlyWarn", "undo", "redo", "reload", "lockPlan", "openChange", "cancelChange", "rounds", "bulk", "planTplDown", "planTplUp"];
    if (needYear.indexOf(name) >= 0 && !S.year) { toast("먼저 데이터 폴더를 연결하고 연도를 여세요"); return; }
    switch (name) {
      case "newYear": return Store.connected() ? newYearDialog() : toast("먼저 데이터 폴더를 연결하세요");
      case "reload": return flushSave().then(function () { return Store.loadMaster(); }).then(function (mst) {
        if (mst) { S.cat = mst.cat; S.ver = mst.ver; S.exclude = mst.exclude || []; ensureIds(S.cat); }
        return loadYear(S.year);
      }).then(function () { toast("파일에서 다시 불러왔습니다"); });
      case "export": Store.exportReport(S); return toast("보고용 엑셀을 내려받았습니다");
      case "changeFolder": return flushSave().then(askFolder);
      case "catMgr": return catDialog();
      case "verHist": return verDialog();
      case "lockPlan": return closePlan();
      case "openChange": return openChange();
      case "cancelChange": return cancelChange();
      case "rounds": return roundsDialog();
      case "importPrev": return importPrev();
      case "addAcc": return accDialog(false);
      case "editAcc": return accDialog(true);
      case "delAcc": return delAcc();
      case "openPlan": return openPlan();
      case "bulk": return bulkDialog();
      case "planTplDown": return planTplDown();
      case "planTplUp": return planTplUp();
      case "calc": return calcToggle();
      case "ribbonReset": return ribbonReset();
      case "testData": return testDataDialog();
      case "xRead": return xRead();
      case "xAlerts": return alertsDialog();
      case "xMemos": return memoList();
      case "xSearch": return X && X.lines.length ? xSearchDialog() : toast("아직 반영한 더존 자료가 없습니다");
      case "xLog": return xLogDialog();
      case "toggleAll":
        var anyOpen = LAST.groups.some(function (g) { return !UI.collapsed[g.name]; });
        LAST.groups.forEach(function (g) { UI.collapsed[g.name] = anyOpen; });
        return renderAll();
      case "onlyWarn": UI.onlyWarn = !UI.onlyWarn; return renderAll();
      case "undo": return undo();
      case "redo": return redo();
    }
  }

  function bind() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("[data-act]");
      if (a && !a.disabled) { act(a.getAttribute("data-act")); return; }
      var tab = e.target.closest("#rtabs a");
      if (tab) {
        var tn = tab.getAttribute("data-tab");
        if (tn === "plan" || tn === "exec") { setMode(tn); if (MODE !== tn) return; }
        document.querySelectorAll("#rtabs a").forEach(function (x) { x.classList.toggle("on", x === tab); });
        ["file", "plan", "exec", "set", "help"].forEach(function (t) { $("rb-" + t).hidden = t !== tn; });
        return;
      }
      var soon = e.target.closest("[data-soon]");
      if (soon) { toast("'" + soon.getAttribute("data-soon") + "' 화면은 다음 단계에서 만듭니다"); return; }
      if (e.target.closest("#btnWarnChip")) { UI.onlyWarn = !UI.onlyWarn; renderAll(); return; }
      if (e.target.closest("#saveState") && saveFailed) { doSave(); return; }
    });

    var tbl = $("tbl");
    tbl.addEventListener("click", function (e) {
      var ctd = e.target.closest("td");
      if (calcOpen() && ctd && ctd.classList.contains("num") && !ctd.closest("tr.acc")) { calcPickCell(ctd); return; }
      var g = e.target.closest("tr.grp");
      if (g) { var n = g.getAttribute("data-grp"); UI.collapsed[n] = !UI.collapsed[n]; renderAll(); return; }
      var tr = e.target.closest("tr.acc");
      if (!tr) return;
      var id = tr.getAttribute("data-id"), td = e.target.closest("td"), k = td && td.getAttribute("data-k");
      if (calcOpen() && td && td.classList.contains("num")) { calcPickCell(td); select(id); $("calc").focus(); return; }
      if (e.ctrlKey || e.metaKey) { toggleMulti(id); UI.sel = id; return; }
      if (e.shiftKey) { rangeMulti(id); return; }
      if (Object.keys(UI.multi).length) { UI.multi = {}; renderAll(); }
      setCell(id, EDIT_COLS.indexOf(k) >= 0 ? k : null);
      if (k === "plan" && !calcOpen()) openPlan(id);
    });
    $("cellEd").addEventListener("dblclick", function () { if (!editing) startEdit(false); });
    tbl.addEventListener("dblclick", function (e) { if (e.target.closest("td.ed") && !editing) startEdit(false); });
    bindCellEd();
    tbl.addEventListener("contextmenu", openCtx);
    bindTableDrag();
    $("ctx").addEventListener("click", function (e) {
      var it = e.target.closest(".ctx-i");
      if (!it || it.classList.contains("dis") || !it.getAttribute("data-c")) return;
      var r = $("ctx").getBoundingClientRect();
      ctxAct(it.getAttribute("data-c"), $("ctx").getAttribute("data-k"), r.left, r.top);
    });
    $("fpop").addEventListener("click", function (e) {
      var a = e.target.closest("[data-fp]");
      if (!a) return;
      var k = $("fpop").getAttribute("data-k"), f = a.getAttribute("data-fp");
      if (f === "ok") filterApply(k);
      else if (f === "clear") { delete UI.filters[k]; closeCtx(); renderAll(); }
      else $("fpop").querySelectorAll(".fpG").forEach(function (x) { x.checked = f === "all"; });
    });
    $("fpop").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); filterApply($("fpop").getAttribute("data-k")); } });
    document.addEventListener("mousedown", function (e) { if (!e.target.closest("#ctx,#fpop")) closeCtx(); });
    $("tblState").addEventListener("click", function (e) {
      if (e.target.closest("[data-tbl-reset]")) { UI.sort = null; UI.filters = {}; UI.freeze = "acc"; saveView(); renderAll(); }
      if (e.target.closest("[data-multi-clear]")) { UI.multi = {}; renderAll(); }
    });

    $("search").addEventListener("input", function () { UI.search = this.value.trim(); renderAll(); });
    $("navT").addEventListener("change", function () { UI.nav = { t: this.value, m: "", s: "" }; renderAll(); });
    $("navM").addEventListener("change", function () { UI.nav.m = this.value; UI.nav.s = ""; renderAll(); });
    $("navS").addEventListener("change", function () { UI.nav.s = this.value; renderAll(); });
    $("selYear").addEventListener("change", function () {
      var v = this.value;
      if (v === "new") { fillYearSelect(); newYearDialog(); return; }
      switchYear(parseInt(v, 10));
    });
    [["selDisp", "dispUnit", "표시 단위"], ["selDispX", "dispUnit", "표시 단위"], ["selRnd", "rndUnit", "반올림 단위"], ["selMode", "rndMode", "반올림 방식"]].forEach(function (x) {
      $(x[0]).addEventListener("change", function () {
        var v = this.value, old = S.settings[x[1]];
        if (!S.year) return;
        if (x[1] !== "dispUnit" && guardClosed(x[2] + (x[1] === "rndMode" ? "을" : "를") + " 바꾸려면")) { this.value = old; return; }
        change(function () { S.settings[x[1]] = v; }, x[2] + ": " + old + " → " + v);
        if (x[1] === "dispUnit") { $("selDisp").value = v; $("selDispX").value = v; }
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.target.closest && e.target.closest("#calc")) return;
      if (e.target.id === "cellEd") return;
      if (dlg) {
        if (e.key === "Escape") { e.preventDefault(); closeDialog(); }
        else if (e.key === "Enter" && dlg.enterOk && !e.shiftKey && e.target.tagName !== "BUTTON" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "SELECT") {
          var ok = $("modal").querySelector("[data-ok]");
          if (ok) { e.preventDefault(); ok.click(); }
        }
        return;
      }
      if (!$("cover").hidden) return;
      if (e.target.closest && e.target.closest("#memoEd")) return;
      if (MODE === "exec") {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); $("search").focus(); $("search").select(); }
        if (e.key === "Escape") { closeCtx(); $("memoEd").hidden = true; }
        return;
      }
      var inField = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      var k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z" && !inField) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "y" && !inField) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "f") { e.preventDefault(); $("search").focus(); $("search").select(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "s") { e.preventDefault(); doSave(); return; }
      if (inField) { if (e.key === "Escape" && e.target.id === "search") { e.target.value = ""; UI.search = ""; renderAll(); e.target.blur(); } return; }
      if (e.key === "Escape") { closeCtx(); if (Object.keys(UI.multi).length) { UI.multi = {}; renderAll(); } else if (UI.cell) { UI.cell = null; markCell(); } return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); moveCell(0, e.key === "ArrowDown" ? 1 : -1); }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && UI.cell) { e.preventDefault(); moveCell(e.key === "ArrowLeft" ? -1 : 1, 0); }
      else if (e.key === "Tab" && UI.cell) { e.preventDefault(); moveCell(e.shiftKey ? -1 : 1, 0); }
      else if (e.key === "Enter" && UI.sel) { e.preventDefault(); if (UI.cell && UI.cell.k !== "plan") startEdit(false); else openPlan(); }
      else if (e.key === "Delete" && UI.sel && !UI.cell) { e.preventDefault(); delAcc(); }
    });

    window.addEventListener("beforeunload", function (e) {
      if (savePending || saving) { doSave(); e.preventDefault(); e.returnValue = ""; }
    });
  }

  /* ---------- 시작 ---------- */
  function start() {
    try { UI.freeze = localStorage.getItem("budget.freeze") || "acc"; } catch (e) { UI.freeze = "acc"; }
    initRibbons(); initStrip(); bindCalc(); bindExec();
    syncSettingSelects();
    fillYearSelect();
    bind();
    deriveRows();
    renderAll();
    setSave("off", "폴더 연결 전");
    // 자동 점검용: 주소 끝에 #opfs 를 붙이면 브라우저 내부 저장소를 폴더처럼 사용
    if (location.hash === "#opfs" && navigator.storage && navigator.storage.getDirectory) {
      navigator.storage.getDirectory().then(function (h) { Store.useHandle(h); openFolder(); });
      return;
    }
    if (!Store.supported()) {
      cover("이 브라우저는 폴더 저장을 지원하지 않습니다", "크롬(또는 엣지) 최신 버전에서 <code>index.html</code> 을 여세요.", []);
      return;
    }
    Store.restore().then(function (st) {
      if (st === "ready") return openFolder();
      if (st === "needPermission") {
        cover("데이터 폴더 사용을 허용해 주세요", "지난번에 연결한 폴더 <code>" + esc(Store.folderName()) + "</code> 를 다시 쓰려면 허용이 필요합니다.<br>버튼을 누르고 크롬 창에서 <b>[파일 수정 허용]</b>을 고르세요. (매번 묻지 않게 하려면 <b>[방문할 때마다 허용]</b>)", [
          { label: "이 폴더 계속 사용", primary: true, fn: function () { Store.grant().then(function (ok) { if (ok) openFolder(); else toast("허용되지 않았습니다", true); }); } },
          { label: "다른 폴더 고르기", fn: askFolder }
        ]);
        return;
      }
      cover("데이터 폴더를 연결하세요", "이 프로그램이 들어 있는 폴더(<code>index.html</code> 이 있는 폴더)를 고르세요.<br>그 안에 <b>data</b> 와 <b>backup</b> 폴더를 만들어 엑셀 파일로 저장합니다. 한 번 연결하면 다음부터는 자동으로 연결됩니다.", [
        { label: "폴더 연결", primary: true, fn: askFolder }
      ]);
    });
  }

  document.addEventListener("DOMContentLoaded", start);
})();
