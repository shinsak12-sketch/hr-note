/* 사업비 관리 프로그램 — 사업비 계획 화면 */
(function () {
  "use strict";

  // 화면 분할: 칸마다 같은 id 의 요소가 있음 → 지금 칸(CUR) 안에서 먼저 찾고, 없으면 문서 전체 (리본 · 제목 · 상태 줄 등)
  var CUR = null;
  var $ = function (id) { if (CUR) { var e = CUR.querySelector("#" + id); if (e) return e; } return document.getElementById(id); };
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
    lock: { state: "draft", rounds: [] }, ver: { list: [], snaps: {} }, exclude: [], fmt: {}
  };
  var UI = { sel: null, collapsed: {}, nav: { t: "", m: "", s: "" }, onlyWarn: false, search: "", cell: null, sort: null, filters: {}, freeze: "acc", multi: {}, pagg: "month", cols: {}, hide: {}, itemOpen: {} };
  var undoStack = [], redoStack = [];
  var saveTimer = null, savePending = false, masterDirty = false;
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
        prev: p.prev, meth: p.meth, a: p.a, b: p.b, c: p.c, t: p.t || 0, auto: p.auto || "t", split: p.split, sv: p.sv.slice(), memo: p.memo, pm: (p.pm || []).slice(), items: clone(p.items || []) };
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
    var items = d.items !== undefined ? d.items : old && old.items || [];
    S.plan[id] = { prev: d.prev, meth: d.meth, a: d.a, b: d.b, c: d.c, t: d.t || 0, auto: d.auto || "t", split: d.split, sv: d.sv.slice(), memo: d.memo, pm: pm.slice(), items: clone(items) };
    if (out) S.plan[id].out = true;
  }
  function rowLabel(r) { return r.l3 ? r.l2 + " › " + r.l3 : r.l2; }

  function u(v, keepZero) { return Calc.fmtUnit(v, S.settings.dispUnit, keepZero); }
  function unitName() { return S.settings.dispUnit; }

  /* ---------- 변경 · 실행 취소 · 자동 저장 ---------- */
  /* 실행 취소 · 다시 실행 — 계획과 집행(메모 · 서식 · 정상 처리 · 확정 항목 지정 · 줄 순서) 같이, 연도마다 최근 100번
     기록 하나 = {s: 그 전 상태, label: 무엇을, t: 언제}. 더존 자료 반영은 되돌리지 않음 (지난 달 수정은 ID 로 상태만 되돌림) */
  function snapshot() {
    var x = X && X.year === S.year ? { memos: X.memos, pins: X.pins, rules: X.rules, fmt: X.fmt, al: X.alerts.map(function (a) { return [a.id, a.state, a.doneAt, a.reason]; }) } : null;
    return JSON.stringify({ cat: S.cat, plan: S.plan, settings: S.settings, fmt: S.fmt, x: x });
  }
  function restoreSnap(s0) {
    var o = JSON.parse(s0);
    if (JSON.stringify(o.cat) !== JSON.stringify(S.cat)) masterDirty = true;
    S.cat = o.cat; S.plan = o.plan; S.settings = o.settings; S.fmt = o.fmt || {};
    if (o.x && X && X.year === S.year) {
      X.memos = o.x.memos || {}; X.pins = o.x.pins || {}; X.rules = o.x.rules || []; X.fmt = o.x.fmt || {};
      var st = {}; (o.x.al || []).forEach(function (a) { st[a[0]] = a; });
      X.alerts.forEach(function (a) { var q = st[a.id]; if (q) { a.state = q[1]; a.doneAt = q[2]; a.reason = q[3]; } });
      xSave(false);
    }
  }
  function pushUndo(label) {
    undoStack.push({ s: snapshot(), label: label || "변경", t: Store.stamp().slice(5, 16) });
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  // opts.master: 분류(기준정보)도 바뀌는 변경 → 분류 버전 기록 (opts.verKind, opts.verMemo)
  function change(fn, logMsg, opts) {
    opts = opts || {};
    pushUndo(logMsg);
    fn();
    if (opts.master) { masterDirty = true; addVersion(opts.verKind || "계획 화면", opts.verMemo !== undefined ? opts.verMemo : logMsg); }
    if (logMsg) addLog(logMsg);
    deriveRows();
    renderAll();
    scheduleSave();
  }
  // 집행 쪽 변경 (되돌릴 수 있게)
  function xChange(fn, logMsg) {
    pushUndo(logMsg);
    fn();
    if (logMsg) xLog(logMsg);
    xSave(false);
    renderAll();
    renderUndo();
  }
  function stepUndo(from, to, verb) {
    var e = from.pop();
    to.push({ s: snapshot(), label: e.label, t: e.t });
    restoreSnap(e.s);
    return e;
  }
  function undo(n) {
    n = Math.min(n || 1, undoStack.length);
    if (!n) return;
    var last;
    for (var i = 0; i < n; i++) last = stepUndo(undoStack, redoStack);
    if (masterDirty) addVersion("계획 화면", "실행 취소");
    addLog("실행 취소" + (n > 1 ? " " + n + "번" : "") + ": " + last.label);
    deriveRows(); renderAll(); scheduleSave(); renderUndo();
    toast("실행 취소" + (n > 1 ? " " + n + "번" : "") + ": " + last.label);
  }
  function redo(n) {
    n = Math.min(n || 1, redoStack.length);
    if (!n) return;
    var last;
    for (var i = 0; i < n; i++) last = stepUndo(redoStack, undoStack);
    if (masterDirty) addVersion("계획 화면", "다시 실행");
    addLog("다시 실행" + (n > 1 ? " " + n + "번" : "") + ": " + last.label);
    deriveRows(); renderAll(); scheduleSave(); renderUndo();
    toast("다시 실행" + (n > 1 ? " " + n + "번" : "") + ": " + last.label);
  }
  function renderUndo() {
    ["btnUndo", "btnUndoX"].forEach(function (k) { var b = document.getElementById(k); if (b) { b.disabled = !undoStack.length; b.title = undoStack.length ? "실행 취소: " + undoStack[undoStack.length - 1].label + " (Ctrl+Z)" : "실행 취소할 것이 없습니다"; } });
    ["btnRedo", "btnRedoX"].forEach(function (k) { var b = document.getElementById(k); if (b) { b.disabled = !redoStack.length; b.title = redoStack.length ? "다시 실행: " + redoStack[redoStack.length - 1].label + " (Ctrl+Y)" : "다시 실행할 것이 없습니다"; } });
  }
  // 기록 목록: 줄을 누르면 그 시점까지 한 번에
  function undoList(which) {
    var redoMode = which === "redo";
    var draw = function () {
      var list = (redoMode ? redoStack : undoStack).slice().reverse();
      $("ulBody").innerHTML = list.length ? '<div class="ul-list">' + list.map(function (e, i) {
        return '<div class="ul-i" data-ul="' + (i + 1) + '"><span class="ul-n">' + (i + 1) + '</span><span class="ul-t">' + esc(e.t) + "</span>" + esc(e.label) + "</div>";
      }).join("") + "</div>" : '<div class="cm-empty">' + (redoMode ? "다시 실행할 것이 없습니다" : "실행 취소할 것이 없습니다") + "</div>";
      dlg.el.querySelectorAll("[data-ulm]").forEach(function (b) { b.classList.toggle("on", (b.getAttribute("data-ulm") === "redo") === redoMode); });
    };
    openDialog({ title: "실행 취소 기록", key: "undolist", crumb: (S.year || "") + "년 · 최근 100번 · 연도를 바꾸거나 계획을 마감하면 기록이 비워집니다", width: 620, okText: null, cancelText: "닫기", enterOk: false,
      body: '<div class="ov-tools"><div class="seg vseg2"><button data-ulm="undo">실행 취소 (' + undoStack.length + ')</button><button data-ulm="redo">다시 실행 (' + redoStack.length + ')</button></div><span class="mute">줄을 누르면 위에서부터 그 줄까지 한 번에 되돌립니다</span></div><div class="mdl-pad ul-wrap" id="ulBody"></div>' });
    dlg.el.addEventListener("click", function (e) {
      var m = e.target.closest("[data-ulm]");
      if (m) { redoMode = m.getAttribute("data-ulm") === "redo"; draw(); return; }
      var it = e.target.closest("[data-ul]");
      if (!it) return;
      var n = +it.getAttribute("data-ul");
      closeDialog();
      if (redoMode) redo(n); else undo(n);
    });
    dlg.el.addEventListener("mouseover", function (e) {
      var it = e.target.closest("[data-ul]");
      dlg.el.querySelectorAll(".ul-i").forEach(function (x) { x.classList.toggle("upto", !!it && +x.getAttribute("data-ul") <= +it.getAttribute("data-ul")); });
    });
    draw();
  }
  function clearUndo() { undoStack = []; redoStack = []; renderUndo(); }
  function addLog(m) {
    S.log.push({ t: Store.stamp(), m: m });
    if (S.log.length > 2000) S.log.shift();
  }

  /* ---------- 저장 ----------
     1) 고치면 바로 (0.7초 모아서) 2) 5분마다 (열린 모든 연도) 3) [💾 저장] · Ctrl+S = 바로
     저장할 내용은 부르는 순간 고정되고, 같은 파일 쓰기는 차례대로 (Store) → 연도를 바꿔도 엉뚱한 연도에 저장되지 않음
     파일마다 상태(SVS)를 두고, 실패하면 제목 줄 표시를 눌러 다시 (밖에서 바뀜 · 권한 · 보기 전용은 따로 안내) */
  var SVS = {}, AUTO_EVERY = 5 * 60000;
  function scheduleSave() {
    if (!S.year && !masterDirty) return;
    savePending = true;
    renderSave();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 700);
    renderOthers();
  }
  // 지금 칸의 계획(+분류)을 저장 — 내용은 지금 이 순간 것으로
  function doSave() {
    clearTimeout(saveTimer);
    var st = S, wasMaster = masterDirty, jobs = [];
    savePending = false; masterDirty = false;
    if (wasMaster) jobs.push(svRun(Store.MASTER, function () { return Store.saveMaster(st.cat, st.ver, st.exclude); }, function () { masterDirty = true; scheduleSave(); }));
    if (st.year) jobs.push(svRun(Store.fileName(st.year), function () { return Store.save(st); }, function () { return withYear(st.year, function () { scheduleSave(); }); }));
    renderSave();
    return Promise.all(jobs);
  }
  // 파일 하나 저장 + 상태 (retry: 다시 저장할 때 부를 것)
  function svRun(name, fn, retry) {
    var sv = SVS[name] = SVS[name] || {};
    sv.st = "saving"; sv.retry = retry;
    renderSave();
    var job;
    try { job = fn(); } catch (e) { job = Promise.reject(e); }
    return job.then(function () { sv.st = "ok"; sv.at = Store.stamp(); sv.err = null; renderSave(); return true; },
      function (e) { sv.st = "err"; sv.err = e; renderSave(); svFail(name, e); return false; });
  }
  function svFail(name, e) {
    var n = e && e.name;
    if (n === "ReadOnly") return;
    if (n === "ExternalChange") { if (!dlg) externalDialog(name, e); return; }
    if (n === "NotAllowedError" || n === "SecurityError") { toast("폴더 사용 허용이 풀렸습니다 — 제목 줄의 빨간 표시를 눌러 다시 허용하세요", true, 7000); return; }
    toast("data\\" + name + " 을(를) 저장하지 못했습니다. 엑셀에서 열어 두었다면 닫고 제목 줄의 빨간 표시를 누르세요 (" + (n || e) + ")", true, 7000);
  }
  // 프로그램 밖에서 data 파일이 바뀜 → 다시 불러오기 / 덮어쓰기
  function externalDialog(name, e) {
    var at = e && e.at ? Store.stamp(new Date(e.at)).slice(5, 16) : "";
    openDialog({
      title: "파일이 프로그램 밖에서 바뀌었습니다", key: "external", width: 560, danger: true, okText: "덮어쓰기 (프로그램 내용으로 저장)", cancelText: "나중에",
      body: '<div class="mdl-pad msg"><b>data\\' + esc(name) + "</b> 이(가) " + (at ? at + " 에 " : "") + "프로그램이 아닌 곳(엑셀 등)에서 바뀌었습니다.<br>그대로 저장하면 밖에서 고친 내용이 지워집니다.<br><br>" +
        "• <b>다시 불러오기</b>: 밖에서 고친 파일을 읽어 옵니다 (프로그램에서 아직 저장 안 된 것은 버림)<br>• <b>덮어쓰기</b>: 지금 프로그램 내용으로 저장합니다 (밖에서 고친 파일은 backup 폴더에 남김)</div>",
      extra: '<button class="btn" id="exReload">다시 불러오기</button>',
      onOk: function () { var sv = SVS[name]; Store.acceptExternal(name).then(function () { if (sv && sv.retry) sv.retry(); }); toast("덮어써서 저장합니다"); }
    });
    $("exReload").addEventListener("click", function () {
      closeDialog();
      SVS[name] = { st: "ok", at: Store.stamp() };
      Store.acceptExternal(name).then(function () {
        if (name === Store.MASTER) return Store.loadMaster().then(function (mst) { if (mst) { S.cat = mst.cat; S.ver = mst.ver; S.exclude = mst.exclude || []; ensureIds(S.cat); } return loadYear(S.year); });
        var m = /(\d{4})/.exec(name), y = m ? +m[1] : S.year;
        return withYear(y, function () { savePending = false; clearTimeout(saveTimer); return /^집행/.test(name) ? (delete XQ[y], loadExecFor(y)) : loadYear(y); });
      }).then(function () { renderSave(); toast("밖에서 바뀐 파일을 다시 읽었습니다"); });
    });
  }
  // 그 연도를 띄운 칸에서 실행 (없으면 지금 칸)
  function withYear(y, fn) { var p = PANES.filter(function (q) { return (q === ACT ? S.year : q.year) === y; })[0]; return withPane(p || ACT, fn); }
  // 기다리는 것 · 쓰는 중인 것 모두 끝날 때까지
  function flushSave() {
    var a = savePending || masterDirty ? doSave() : null, b = xFlush();
    return Promise.all([a, b]).then(function () { return Store.idle(); });
  }
  // 저장 버튼 · Ctrl+S · 5분마다: 열린 모든 연도의 계획 · 집행 + 분류
  function saveAll(why) {
    if (Store.readOnly()) { if (why === "button") toast("다른 창에서 열려 있어 이 창은 보기 전용입니다", true, 4000); return Promise.resolve(false); }
    if (!Store.connected()) return Promise.resolve(false);
    var done = {}, jobs = [];
    masterDirty = masterDirty || why === "button";
    PANES.forEach(function (p) {
      withPane(p, function () {
        if (!S.year && !masterDirty) return;
        if (S.year && done[S.year]) return;
        done[S.year] = 1;
        jobs.push(doSave());
        if (X && X.year === S.year && (X.month || X.lines.length || Object.keys(X.memos).length)) { xSave(false, true); jobs.push(xFlush()); }
      });
    });
    return Promise.all(jobs).then(function () { return Store.idle(); }).then(function () {
      var bad = Object.keys(SVS).filter(function (k) { return SVS[k].st === "err"; });
      if (why === "button") toast(bad.length ? "저장하지 못한 파일이 있습니다: " + bad.join(", ") : "저장했습니다 " + Store.stamp().slice(11, 16), !!bad.length, bad.length ? 6000 : 2000);
      return !bad.length;
    });
  }
  function hasUnsaved() { return savePending || masterDirty || Object.keys(XQ).length > 0 || Object.keys(SVS).some(function (k) { return SVS[k].st === "saving" || SVS[k].st === "err"; }); }
  // 다시 저장: 실패한 파일 모두 (권한이 풀렸으면 먼저 허용)
  function retrySaves() {
    var bad = Object.keys(SVS).filter(function (k) { return SVS[k].st === "err"; });
    var perm = bad.some(function (k) { var n = SVS[k].err && SVS[k].err.name; return n === "NotAllowedError" || n === "SecurityError"; });
    var ext = bad.filter(function (k) { return SVS[k].err && SVS[k].err.name === "ExternalChange"; })[0];
    if (ext) { externalDialog(ext, SVS[ext].err); return; }
    (perm ? Store.grant() : Promise.resolve(true)).then(function (ok) {
      if (!ok) { toast("허용되지 않았습니다", true); return; }
      bad.forEach(function (k) { if (SVS[k].retry) SVS[k].retry(); });
    });
  }
  function renderSave() {
    var ks = Object.keys(SVS), bad = ks.filter(function (k) { return SVS[k].st === "err"; }), busy = savePending || Object.keys(XQ).length || ks.some(function (k) { return SVS[k].st === "saving"; });
    var last = ks.map(function (k) { return SVS[k].at || ""; }).sort().pop();
    if (Store.readOnly()) setSave("off", "보기 전용 — 다른 창에서 열려 있음");
    else if (bad.length) {
      var e0 = SVS[bad[0]].err || {}, why = e0.name === "ExternalChange" ? "밖에서 바뀜" : e0.name === "NotAllowedError" || e0.name === "SecurityError" ? "권한 필요" : "저장 실패";
      setSave("error", why + " (" + bad.map(function (k) { return k.replace(/\.xlsx$/, ""); }).join(", ") + ") — 눌러서 다시");
    } else if (busy) setSave("saving", "저장 중…");
    else if (last) setSave("ok", "저장됨 " + last.slice(11, 16));
    else if (Store.connected()) setSave("ok", "자동 저장 켜짐");
    $("saveState").title = ks.length ? ks.map(function (k) { var v = SVS[k]; return k + " : " + (v.st === "ok" ? "저장됨 " + (v.at || "").slice(11, 19) : v.st === "saving" ? "저장 중" : "실패 — " + ((v.err && (v.err.message || v.err.name)) || "")); }).join("\n") : "";
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

  /* 화면 전체 자료를 새로 띄우기 전에 (연도 바꾸기 · 다시 불러오기 · 새 연도 · 테스트 데이터 · 폴더 바꾸기)
     저장 안 된 것이 있으면 묻기: 저장하고 계속 / 저장 안 하고 계속 / 취소 */
  function askSave(next, what) {
    if (!hasUnsaved()) return flushSave().then(next);
    return new Promise(function (res) {
      var choice = null;
      openDialog({
        title: "지금까지 작업을 저장할까요?", key: "asksave", width: 520, okText: "저장하고 계속",
        body: '<div class="mdl-pad msg">' + esc(what || "다른 자료를 불러옵니다") + ".<br>아직 저장되지 않은 작업이 있습니다.</div>",
        extra: '<button class="btn danger" id="asNo">저장 안 하고 계속</button>',
        onOk: function () { choice = "save"; },
        onClose: function () {
          if (choice === "save") flushSave().then(function () {
            if (Object.keys(SVS).some(function (k) { return SVS[k].st === "err"; })) { toast("저장하지 못해 멈췄습니다 — 제목 줄 표시를 확인하세요", true, 5000); return res(); }
            res(next());
          });
          else if (choice === "drop") { clearTimeout(saveTimer); savePending = false; masterDirty = false; XQ = {}; clearTimeout(xTimer); Object.keys(SVS).forEach(function (k) { if (SVS[k].st === "err") SVS[k] = { st: "ok", at: SVS[k].at }; }); renderSave(); res(next()); }
          else res();
        }
      });
      $("asNo").addEventListener("click", function () { choice = "drop"; closeDialog(); });
    });
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
  function renderAll() { renderPane(); }
  function renderPane() {
    LAST = computeAll();
    if (MODE === "exec") { renderExec(); renderNav(LAST); renderLock(); paneHead(); $("fileName").textContent = S.year ? "— " + Store.execName(S.year) : ""; return; }
    renderTable(LAST); renderSummary(LAST); renderNav(LAST); renderBars(); renderStatus(LAST); renderLock(); renderTools(); paneHead();
    $("fileName").textContent = S.year ? "— " + Store.fileName(S.year) : "";
    renderUndo();
    $("btnWarn").classList.toggle("on", UI.onlyWarn);
    $("pAgg").querySelectorAll("[data-pa]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-pa") === UI.pagg); });
    var anyOpen = LAST.groups.some(function (g) { return !UI.collapsed[g.name]; });
    $("foldText").textContent = anyOpen ? "모두 접기" : "모두 펼치기";
  }

  // 칸 머리 (분할했을 때): 연도 목록
  function paneHead() {
    if (!CUR) return;
    var sel = CUR.querySelector(".pane-year");
    if (sel) sel.innerHTML = S.years.map(function (y) { return '<option value="' + y + '"' + (y === S.year ? " selected" : "") + ">" + y + "년</option>"; }).join("");
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

  /* 표 열: acc 계정 · prev 전년 · plan 계획 · before 변경 전 · yoy 증감률 · m0~m11 월 (분기 q1~q4 · 반기 h1 h2) · note 비고
     보기(UI.pagg: 월별 · 분기 · 반기)마다 열 순서(UI.cols) · 숨김(UI.hide)을 따로 기억. 계정 열은 늘 맨 왼쪽 */
  var PERIODS = { month: range0(12).map(function (i) { return "m" + i; }), q: ["q1", "q2", "q3", "q4"], h: ["h1", "h2"] };
  function range0(n) { var o = []; for (var i = 0; i < n; i++) o.push(i); return o; }
  function pBlocksDef(agg) { return ["prev", "plan", "before", "yoy"].concat(PERIODS[agg] || PERIODS.month).concat(["note"]); }
  function orderOf(def, saved) {
    var o = (saved || []).filter(function (b) { return def.indexOf(b) >= 0; });
    def.forEach(function (b, i) { if (o.indexOf(b) < 0) { var prevB = def[i - 1], at = prevB ? o.indexOf(prevB) + 1 : 0; o.splice(at, 0, b); } });
    return o;
  }
  function pBlocks() { return orderOf(pBlocksDef(UI.pagg), UI.cols[UI.pagg]); }
  function tableCols() {
    var hide = UI.hide[UI.pagg] || {};
    return ["acc"].concat(pBlocks().filter(function (b) { return !hide[b] && (b !== "before" || isChanging()); }));
  }
  function editCols() { return tableCols().filter(function (k) { return k === "plan" || k === "note" || /^m\d/.test(k); }); }
  // 분기 · 반기 · 월 열 → 달 번호(0~11)
  function idxOf(k) {
    if (/^m\d/.test(k)) return [+k.slice(1)];
    if (/^q\d/.test(k)) { var q = +k.slice(1); return [3 * q - 3, 3 * q - 2, 3 * q - 1]; }
    if (/^h\d/.test(k)) return k === "h1" ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
    return range0(12);
  }
  function sumIdx(a, ix) { var t = 0; ix.forEach(function (i) { t += Calc.num(a[i]); }); return t; }
  var COL_NAME = { acc: "계정", prev: "전년 실적", plan: "계획", before: "변경 전", yoy: "증감률", note: "비고", q1: "1분기", q2: "2분기", q3: "3분기", q4: "4분기", h1: "상반기", h2: "하반기" };
  function colName(k) { return COL_NAME[k] || (+k.slice(1) + 1) + "월"; }
  function colVal(r, k) {
    var c = r._c;
    if (k === "acc") return r.l1 + " " + rowLabel(r);
    if (k === "prev") return Calc.num(r.prev);
    if (k === "plan") return r.out || c.missing ? 0 : c.plan;
    if (k === "before") return r._before || 0;
    if (k === "yoy") return c.missing || r.out ? NaN : c.yoy;
    if (k === "note") return r.memo;
    return c.missing ? 0 : sumIdx(c.months, idxOf(k));
  }
  function groupVal(g, k) {
    if (k === "acc" || k === "note") return g.name;
    if (k === "prev") return g.prev;
    if (k === "plan") return g.plan;
    if (k === "before") return g.before;
    if (k === "yoy") return g.prev ? g.plan / g.prev - 1 : NaN;
    return sumIdx(g.m, idxOf(k));
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

  function itemTag(it, r) {
    var when = it.how === "일시" ? it.mo + "월" : it.how === "직접" ? "달마다" : it.how;
    var cd = it.cond || {}, z = (r && r.dz || []).filter(function (x) { return x.code === it.code; })[0];
    return when + (it.code ? " · " + (z ? z.name || it.code : it.code) : "") + (cd.memo ? " · 적요 '" + cd.memo + "'" : "") + (cd.ptn ? " · 거래처 '" + cd.ptn + "'" : "");
  }
  // 계정 이름 칸: 소분류가 있으면 '중분류 ›' 를 눌러 중분류 분석, 계정 이름을 눌러 그 계정 분석
  function accName(r) {
    return r.l3 ? '<span class="l2 anl" data-an="m" title="누르면 ' + esc(r.l2) + ' 분석">' + esc(r.l2) + ' ›</span><span class="l3 anl" data-an="leaf" title="누르면 ' + esc(r.l3) + ' 분석">' + esc(r.l3) + "</span>"
      : '<span class="l3 anl" data-an="leaf" title="누르면 ' + esc(r.l2) + ' 분석">' + esc(r.l2) + "</span>";
  }
  function accCell(r, k, closed) {
    var c = r._c;
    if (k === "prev") return '<td class="num" data-k="prev">' + u(r.prev) + "</td>";
    if (k === "plan") return '<td class="num plan-v" data-k="plan" title="' + (r.out ? "계획 외 계정" : closed ? "마감됨 — 클릭하면 산출 내용 보기" : "클릭해서 산출 입력") + '">' +
      (r.out ? '<span class="outv">-</span>' : c.missing ? '<span class="need">입력 필요</span>' :
        '<span class="pv">' + u(c.plan) + '</span><span class="badge ' + ({ "균등": "b-eq", "수기": "b-man", "비율": "b-rat" }[r.split]) + '">' + esc(r.split) + "</span>") + "</td>";
    if (k === "before") return '<td class="num c-before" data-k="before">' + u(r._before) + "</td>";
    if (k === "yoy") return c.missing ? '<td class="num" data-k="yoy"></td>' : yoyCell(c.yoy);
    if (k === "note") return '<td class="c-note ed" data-k="note">' + (r.memo ? '<span class="memo">' + esc(r.memo) + "</span>" : "") + "</td>";
    if (/^m\d/.test(k)) {
      var i = +k.slice(1), v = c.months[i];
      return '<td class="num m ed' + (v === 0 && !c.missing ? " zero" : "") + (i === c.fixMonth && r.split !== "수기" ? " fixm" : "") + '" data-k="' + k + '">' + (c.missing ? "" : u(v)) + "</td>";
    }
    return '<td class="num qsum" data-k="' + k + '">' + (c.missing ? "" : u(sumIdx(c.months, idxOf(k)))) + "</td>";
  }
  function renderTable(R) {
    var el = $("tbl");
    if (!S.year) { el.innerHTML = ""; return; }
    if (!S.rows.length) {
      el.innerHTML = '<div class="empty"><b>계획에 올릴 계정이 없습니다.</b><br>' +
        (leafCount(S.cat) ? "분류의 계정이 모두 '사용 안 함'입니다.<br>" : "먼저 <b>설정 › 분류 관리</b>에서 대분류 · 중분류를 등록하세요. 중분류(소분류를 만들면 소분류)가 계획 줄이 됩니다.<br>") +
        '<button class="btn primary" data-act="catMgr">분류 관리 열기</button> <button class="btn" data-act="addAcc">＋ 계정 추가</button></div>';
      return;
    }
    var y = S.year, h = [], closed = isClosed(), sk = UI.sort && UI.sort.k, sd = UI.sort ? UI.sort.dir : 1, cols = tableCols().slice(1);
    var mark = function (k) { return (sk === k ? '<span class="sorti">' + (sd > 0 ? "▲" : "▼") + "</span>" : "") + (UI.filters[k] ? '<span class="filti" title="필터 적용 중">⏷</span>' : ""); };
    var thName = function (k) {
      if (k === "prev") return (y - 1) + "년 실적";
      if (k === "plan") return y + "년 계획";
      if (k === "before") return "변경 전<br><small>" + roundLabel(R.base.n) + "</small>";
      return esc(colName(k));
    };
    var per = function (k) { return /^[mqh]\d/.test(k) || k === "plan"; };
    h.push('<table class="plan"><thead><tr><th class="c-acc" data-k="acc">계정' + mark("acc") + "</th>" + cols.map(function (k) {
      return '<th data-k="' + k + '" data-b="' + k + '" draggable="true" class="' + (k === "before" ? "c-before " : "") + (per(k) ? "per" : "") + '"' + (k === "note" ? ' style="min-width:260px"' : "") +
        (per(k) ? ' title="누르면 ' + (k === "plan" ? "연간" : colName(k)) + ' 계획 분석 · 끌어서 열 순서 바꾸기"' : ' title="끌어서 열 순서 바꾸기 · 우클릭 = 정렬 · 필터 · 숨기기"') + ">" + thName(k) + mark(k) + "</th>";
    }).join("") + "</tr></thead><tbody>");
    // 칸 그리기 (k: 열, r: 계정 줄 | g: 묶음 · 합계)
    var grpCell = function (g, k) {
      if (k === "yoy") return yoyCell(g.prev ? g.plan / g.prev - 1 : NaN);
      if (k === "note") return '<td data-k="note"></td>';
      return '<td class="num' + (k === "before" ? " c-before" : "") + '" data-k="' + k + '">' + u(groupVal(g, k)) + "</td>";
    };
    var shown = 0, filtered = filtering(), noDrag = filtered || !!UI.sort;
    var t0 = R.tot;
    h.push('<tr class="total ttop"><td class="c-acc" data-k="acc">합계' + (filtered ? ' <span class="cnt">(전체 기준)</span>' : "") + "</td>" +
      cols.map(function (k) { return grpCell({ name: "", prev: t0.prev, plan: t0.plan, before: t0.before, m: t0.m }, k); }).join("") + "</tr>");
    var groups = R.groups.slice();
    if (UI.sort) groups.sort(function (a, b) { return sd * cmpVal(groupVal(a, sk), groupVal(b, sk)); });
    groups.forEach(function (g) {
      var rows = g.rows.filter(visible);
      if (!rows.length) return;
      if (UI.sort) rows.sort(function (a, b) { return sd * cmpVal(colVal(a, sk), colVal(b, sk)); });
      var shut = !!UI.collapsed[g.name] && !UI.search && !UI.onlyWarn;
      h.push('<tr class="grp" data-grp="' + esc(g.name) + '"><td class="c-acc" data-k="acc">' + (noDrag ? "" : '<span class="grip ggrip" draggable="true" title="끌어서 대분류 순서 바꾸기">⋮⋮</span>') + '<span class="caret" title="접기 · 펴기">' + (shut ? "▸" : "▾") + '</span><span class="gname" data-an="t" title="누르면 ' + esc(g.name) + ' 분석">' + esc(g.name) + "</span>" +
        '<span class="cnt">' + g.rows.length + "</span></td>" + cols.map(function (k) { return grpCell(g, k); }).join("") + "</tr>");
      if (shut) return;
      rows.forEach(function (r) {
        shown++;
        var c = r._c, sel = UI.sel === r.id, miss = c.missing && !r.out;
        var diffFlag = c.manualDiff && r.meth !== "수기" ? '<span class="flag infof" title="월 금액을 직접 고쳐서 산출 금액과 다릅니다">산출 대비 ' + (c.manualDiff > 0 ? "+" : "△") + u(Math.abs(c.manualDiff), true) + "</span>" : "";
        h.push('<tr class="acc' + (miss ? " missing" : "") + (r.out ? " out" : "") + (r._chg ? " chg" : "") + (sel ? " is-sel" : "") + (UI.multi[r.id] ? " is-multi" : "") + '" data-id="' + esc(r.id) + '">' +
          '<td class="c-acc" data-k="acc">' + (noDrag ? '<span class="grip off"></span>' : '<span class="grip" draggable="true" title="끌어서 순서 바꾸기">⋮⋮</span>') +
          accName(r) + (r.items.length ? '<span class="itg" data-itg="1" title="확정 항목 보기 · 접기">' + (UI.itemOpen[r.id] ? "▾" : "▸") + " 항목 " + r.items.length + "</span>" : "") +
          (r.dz.length ? '<span class="erp" title="더존: ' + esc(r.dz.map(dzText).join(", ")) + '">' + esc(dzShort(r.dz)) + "</span>" : "") +
          (r.out ? '<span class="flag outf" title="마감 뒤에 생긴 계정 — 계획 없이 실적만 들어갑니다">계획 외</span>' : "") +
          (r._chg ? '<span class="flag chgf">변경</span>' : "") + diffFlag +
          (c.check && !r.out ? '<span class="flag" title="' + esc(c.check) + '">분할 확인</span>' : "") + "</td>" +
          cols.map(function (k) { return accCell(r, k, closed); }).join("") + "</tr>");
        if (r.items.length && UI.itemOpen[r.id] && !c.missing) {
          var subs = r.items.map(function (it) { return { name: it.name, iid: it.id, tag: itemTag(it, r), m: Calc.itemMonths(it) }; });
          subs.push({ name: "나머지", iid: "_rest", tag: "확정 항목 외", m: c.months.map(function (v, i) { return v - c.items[i]; }), rest: true });
          subs.forEach(function (x) {
            var tot = sum12(x.m);
            h.push('<tr class="itm' + (x.rest ? " rest" : "") + '" data-of="' + esc(r.id) + '" data-iid="' + esc(x.iid) + '"><td class="c-acc" data-k="acc"><span class="grip off"></span><span class="itn">└ ' + esc(x.name) + '</span><span class="itt">' + esc(x.tag) + "</span></td>" + cols.map(function (k) {
              if (k === "plan") return '<td class="num" data-k="plan">' + u(tot) + "</td>";
              if (/^m\d/.test(k)) return '<td class="num" data-k="' + k + '">' + u(x.m[+k.slice(1)]) + "</td>";
              if (/^[qh]\d/.test(k)) return '<td class="num" data-k="' + k + '">' + u(sumIdx(x.m, idxOf(k))) + "</td>";
              return '<td data-k="' + k + '"></td>';
            }).join("") + "</tr>");
          });
        }
      });
    });
    h.push("</tbody></table>");
    if (!shown && filtered) h.push('<div class="empty">조건에 맞는 계정이 없습니다.</div>');
    var top = el.scrollTop, left = el.scrollLeft;
    el.innerHTML = h.join("");
    stickTotal(el);
    fmtPaint(el, S.fmt, "plan");
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

  /* 요약 띠 (2줄) — 그래프는 나중에 대시보드로. 계정 이름을 누르면 그 계정으로, 확인 필요를 누르면 걸러보기 */
  function sumSeg(label, html) { return '<span class="sg"><em>' + label + "</em>" + html + "</span>"; }
  function sumAcc(r, d, base) { return '<a class="sa" data-sel="' + esc(r.id) + '" title="' + esc(r.l1 + " › " + rowLabel(r)) + '">' + esc(r.name) + '</a> <b class="' + (d > 0 ? "upc" : "dnc") + '">' + (base ? pctTxt(d / base, true) : "") + "</b> <small>(" + dTxt(d) + ")</small>"; }
  function renderSummary(R) {
    var t = R.tot, y = S.year, d = t.plan - t.prev, n = S.rows.length - R.outs, done = n - R.missing, lc = lastClosed(), o0 = S.lock.rounds.length ? S.lock.rounds[0] : null;
    if (!y) { $("kpis").innerHTML = ""; return; }
    var st = isClosed() ? "🔒 " + roundLabel(lc.n) + " 마감 (" + lc.closedAt.slice(5, 10) + ")" : isChanging() ? "✎ " + roundLabel(curRound().n) + " 중" : "작성 중 (마감 전)";
    var vsOrig = o0 && o0.total !== undefined ? t.plan - o0.total : null;
    var isum = 0, icnt = 0; S.rows.forEach(function (r) { if (r.items.length && r._c && !r._c.missing) { icnt += r.items.length; isum += r._c.itemSum || 0; } });
    var ch = S.rows.filter(function (r) { return !r.out && r._c && !r._c.missing; }).map(function (r) { return { r: r, d: r._c.plan - Calc.num(r.prev), b: Calc.num(r.prev) }; });
    var ups = ch.filter(function (x) { return x.d > 0; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 3), dns = ch.filter(function (x) { return x.d < 0; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 3);
    var w = R.missing + R.checks;
    $("kpis").innerHTML = '<div class="sl">' +
      sumSeg(y + "년 계획", "<b class=\"big\">" + u(t.plan, true) + "</b> · 전년 실적 대비 <b class=\"" + (d > 0 ? "upc" : d < 0 ? "dnc" : "") + "\">" + (t.prev ? pctTxt(d / t.prev, true) : "-") + "</b> <small>(" + dTxt(d) + ")</small>") +
      sumSeg("상태", esc(st) + (vsOrig !== null && Math.round(vsOrig) ? " · 원안 대비 <b>" + (o0.total ? pctTxt(vsOrig / o0.total, true) : "") + "</b> <small>(" + dTxt(vsOrig) + ")</small>" : "")) +
      (icnt ? sumSeg("확정 항목", icnt + "개 · " + u(isum, true)) : "") + '<span class="su">단위: ' + unitName() + "</span></div>" +
      '<div class="sl">' + sumSeg("입력", "완료 <b>" + done + " / " + n + "</b>" + (w ? ' · <a class="sa warn" data-sw="warn">확인 필요 ' + w + "</a>" : " · 확인 필요 없음") + (R.outs ? " · 계획 외 " + R.outs : "") + (R.base ? " · 변경 " + R.changed : "")) +
      sumSeg("많이 늘어난 계정", ups.length ? ups.map(function (x) { return sumAcc(x.r, x.d, x.b); }).join(" · ") : "-") +
      sumSeg("많이 줄어든 계정", dns.length ? dns.map(function (x) { return sumAcc(x.r, x.d, x.b); }).join(" · ") : "-") + "</div>";
  }
  function renderBars() { /* 그래프는 대시보드로 옮김 */ }

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
    if (UI.sel !== id) linkSel(id);
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
    dlg = { el: m.querySelector(".mdl"), onOk: o.onOk, onClose: o.onClose, enterOk: o.enterOk !== false, onResize: o.onResize };
    winFrame(dlg.el, ".mdl-head", o.key || o.cls || String(o.title).replace(/[\d,.\s]+/g, "").slice(0, 16), function () { if (dlg && dlg.onResize) dlg.onResize(); });
    m.querySelectorAll("[data-x]").forEach(function (b) { b.addEventListener("click", closeDialog); });
    var ok = m.querySelector("[data-ok]");
    if (ok) ok.addEventListener("click", function () { if (!dlg.onOk || dlg.onOk() !== false) { if (dlg) dlg._ok = true; closeDialog(); } });
    var first = m.querySelector("input:not([type=radio]):not([type=checkbox]):not([type=file]),select");
    if (first && o.focus !== false) setTimeout(function () { first.focus(); if (first.select) first.select(); }, 30);
    return dlg;
  }
  /* 팝업 이동 · 크기 조절: 제목 줄 끌기 = 이동, 가장자리 · 모서리 끌기 = 크기, 제목 줄 더블클릭 = 최대화/원래대로
     팝업 종류(key)마다 마지막 위치 · 크기를 기억 */
  function winFrame(el, headSel, key, onResize) {
    var head = el.querySelector(headSel), lsKey = "budget.dlg." + key;
    ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach(function (k) { var h = document.createElement("i"); h.className = "mdl-rz rz-" + k; h.setAttribute("data-rz", k); el.appendChild(h); });
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(lsKey) || "null"); } catch (e) { saved = null; }
    var pin = function (r) {
      var W = window.innerWidth, H = window.innerHeight;
      r.w = Math.max(320, Math.min(r.w, W - 8)); r.h = Math.max(160, Math.min(r.h, H - 8));
      r.x = Math.max(4 - r.w + 120, Math.min(r.x, W - 120)); r.y = Math.max(0, Math.min(r.y, H - 40));
      el.style.transform = "none"; el.style.left = r.x + "px"; el.style.top = r.y + "px"; el.style.width = r.w + "px"; el.style.height = r.h + "px"; el.style.maxHeight = "none";
      el.classList.add("sized");
      return r;
    };
    var rect = function () { var b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    var keep = function () { try { localStorage.setItem(lsKey, JSON.stringify(rect())); } catch (e) { /* 저장소 막힘 */ } if (onResize) onResize(); };
    if (saved && saved.w) pin(saved);
    var max = null;
    head.addEventListener("dblclick", function (e) {
      if (e.target.closest("button")) return;
      if (max) { pin(max); max = null; el.classList.remove("maxed"); }
      else { max = rect(); pin({ x: 4, y: 4, w: window.innerWidth - 8, h: window.innerHeight - 8 }); el.classList.add("maxed"); }
      keep();
    });
    if (el._wfDown) el.removeEventListener("mousedown", el._wfDown); // 같은 창을 다시 쓰는 경우 (전표 보기)
    el.addEventListener("mousedown", el._wfDown = function (e) {
      var rz = e.target.getAttribute && e.target.getAttribute("data-rz"), mv = !rz && e.target.closest(headSel) && !e.target.closest("button,input,select,a");
      if (!rz && !mv) return;
      e.preventDefault();
      var r0 = pin(rect()), x0 = e.clientX, y0 = e.clientY;
      el.classList.add(rz ? "resizing" : "moving");
      var onMove = function (ev) {
        var dx = ev.clientX - x0, dy = ev.clientY - y0, r = { x: r0.x, y: r0.y, w: r0.w, h: r0.h };
        if (!rz) { r.x += dx; r.y += dy; }
        else {
          if (rz.indexOf("e") >= 0) r.w += dx;
          if (rz.indexOf("s") >= 0) r.h += dy;
          if (rz.indexOf("w") >= 0) { r.w -= dx; r.x += dx; if (r.w < 320) { r.x -= 320 - r.w; } }
          if (rz.indexOf("n") >= 0) { r.h -= dy; r.y += dy; if (r.h < 160) { r.y -= 160 - r.h; } }
        }
        pin(r);
      };
      var onUp = function () {
        document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
        el.classList.remove("resizing", "moving"); max = null; el.classList.remove("maxed");
        keep();
      };
      document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    });
  }
  function closeDialog() {
    if (!dlg) return;
    // 고친 것이 있으면 버릴지 묻기 (확인 버튼으로 닫을 때는 묻지 않음)
    if (dlg.confirmClose && !dlg._ok && dlg.confirmClose() && !window.confirm("고친 내용이 있습니다. 저장하지 않고 닫을까요?")) return;
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
    if (ro && !r.meth && !(r.items || []).length) { toast("🔒 마감된 계획입니다. 이 계정은 입력 없이 0원으로 마감됐습니다. 바꾸려면 [계획 변경]을 여세요", false, 4000); return; }
    var d = { prev: r.prev, meth: r.meth, a: r.a, b: r.b, c: r.c, t: r.t, auto: r.auto || "t", split: r.split, sv: r.sv.slice(), memo: r.memo, pm: r.pm.slice(), items: clone(r.items || []) };
    if (!d.meth && !d.items.length) { d.meth = "%증감"; d.a = 0; }
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
      readItems();
    }
    /* 확정 항목: 총액에서 굵직하게 확정된 것만 떼어 둠 (더존 과목 = 이 계정에 연결된 코드만) → 집행 때 그 과목(+조건) 전표로 비교 */
    function itemsHtml() {
      var dzOpt = function (cur) {
        return (r.dz.length ? "" : '<option value="">(연결된 더존 과목 없음)</option>') + r.dz.map(function (z) { return '<option value="' + esc(z.code) + '"' + (z.code === cur ? " selected" : "") + ">" + esc(dzText(z)) + "</option>"; }).join("");
      };
      var IM = Calc.itemsMonths(d.items), isum = IM.reduce(function (a, b) { return a + b; }, 0), c = Calc.compute(d, S.settings);
      var h = '<div class="pi-h"><b>확정 항목</b><span class="mute">총액에서 굵직하게 정해진 것만 따로 넣어 두면, 집행 때 그 더존 과목(+조건) 전표와 바로 비교합니다. 나머지는 위 분할 방식대로 나눕니다.</span>' +
        (ro ? "" : '<button class="btn sm" id="piAdd">＋ 확정 항목</button>' + (PREVX && PREVX.lines.length ? '<button class="btn sm" id="piSug">' + PREVX.year + "년 분개장에서 추천</button>" : "")) + "</div>";
      if (!d.items.length) return h + '<div class="pi-empty">없음 — 예) 장애인고용부담금 1월 4천만원 확정 → [＋ 확정 항목]</div><div id="piSugBox"></div>';
      h += '<table class="pi-t"><tr><th>항목 이름</th><th>더존 과목</th><th>시기</th><th>월</th><th>금액 (원)</th><th>연간</th><th>적요에 이 글자</th><th>거래처에 이 글자</th><th></th></tr>' + d.items.map(function (it, i) {
        var ms = Calc.itemMonths(it), tot = ms.reduce(function (a, b) { return a + b; }, 0);
        var row = '<tr data-it="' + i + '"><td><input class="inp plain" data-f="name" value="' + esc(it.name) + '" placeholder="예: 장애인고용부담금"></td><td><select class="inp plain" data-f="code">' + dzOpt(it.code) + "</select></td>" +
          '<td><select class="inp plain" data-f="how">' + Calc.ITEM_HOWS.map(function (x) { return "<option" + (x === it.how ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></td>" +
          "<td>" + (it.how === "일시" ? '<select class="inp plain" data-f="mo">' + range(12).map(function (m) { return '<option value="' + m + '"' + (m === +it.mo ? " selected" : "") + ">" + m + "월</option>"; }).join("") + "</select>" : '<span class="mute">' + ({ "매월": "1~12월", "분기": "3·6·9·12월", "반기": "6·12월", "직접": "아래" }[it.how] || "") + "</span>") + "</td>" +
          "<td>" + (it.how === "직접" ? '<span class="mute">달마다</span>' : '<input class="inp num" data-f="amt" data-kind="won" value="' + esc(fmtInput(it.amt, "won")) + '">') + '</td><td class="n"><b>' + Calc.fmtWon(tot) + "</b></td>" +
          '<td><input class="inp plain" data-f="cm" value="' + esc((it.cond || {}).memo || "") + '" placeholder="(선택)"></td><td><input class="inp plain" data-f="cp" value="' + esc((it.cond || {}).ptn || "") + '" placeholder="(선택)"></td>' +
          '<td><button class="btn sm danger" data-del="' + i + '" title="지우기">✕</button></td></tr>';
        if (it.how === "직접") row += '<tr class="pi-dir" data-it="' + i + '"><td colspan="9"><div class="pi-mg">' + range(12).map(function (m) { return "<label><span>" + m + '월</span><input class="inp num" data-f="m' + (m - 1) + '" data-kind="won" value="' + esc(fmtInput(it.months && it.months[m - 1], "won")) + '"></label>'; }).join("") + "</div></td></tr>";
        if (r.dz.length === 1 && !(it.cond && (it.cond.memo || it.cond.ptn))) row += '<tr class="pi-warn"><td colspan="9">⚠ 이 계정에 연결된 더존 과목이 하나라 조건이 없으면 이 계정 전표가 모두 이 항목으로 잡힙니다 — 적요나 거래처 글자를 넣으세요</td></tr>';
        return row;
      }).join("") + "</table>";
      var rest = c.plan - isum;
      h += '<div class="pi-sum">확정 항목 합 <b>' + Calc.fmtWon(isum) + "</b>원 · 나머지 <b" + (rest < 0 ? ' class="bad"' : "") + ">" + Calc.fmtWon(rest) + "</b>원 (" + (d.meth ? esc(d.split) + " 분할" : "산출 방식 없음 → 확정 계획액 = 항목 합") + ")" +
        (ro ? "" : ' <button class="btn sm" id="piSet">총액 = 항목 합으로</button>') + "</div><div id=\"piSugBox\"></div>";
      return h;
    }
    function readItems() {
      var box = $("pItems");
      if (!box) return;
      box.querySelectorAll("tr[data-it]").forEach(function (tr) {
        var it = d.items[+tr.getAttribute("data-it")];
        if (!it) return;
        tr.querySelectorAll("[data-f]").forEach(function (el) {
          var f = el.getAttribute("data-f");
          if (f === "name") it.name = el.value.trim();
          else if (f === "code") it.code = el.value;
          else if (f === "how") it.how = el.value;
          else if (f === "mo") it.mo = +el.value;
          else if (f === "amt") it.amt = readInput(el);
          else if (f === "cm") { it.cond = it.cond || {}; it.cond.memo = el.value.trim(); }
          else if (f === "cp") { it.cond = it.cond || {}; it.cond.ptn = el.value.trim(); }
          else if (/^m\d+$/.test(f)) { it.months = it.months || new Array(12).fill(0); it.months[+f.slice(1)] = readInput(el); }
        });
      });
    }
    function buildItems() {
      var box = $("pItems");
      box.innerHTML = itemsHtml();
      wireInputs(box, function () { readItems(); preview(); refreshItemSums(); });
      box.querySelectorAll("input.inp.plain").forEach(function (el) { el.addEventListener("input", function () { readItems(); preview(); }); });
      box.querySelectorAll("select").forEach(function (el) {
        el.addEventListener("change", function () {
          readItems();
          var it = d.items[+el.closest("tr").getAttribute("data-it")];
          if (el.getAttribute("data-f") === "how" && it.how === "직접") it.months = Calc.itemMonths(Object.assign({}, it, { how: it.how === "직접" ? "일시" : it.how }));
          buildItems(); preview();
        });
      });
      if (ro) box.querySelectorAll("input,select,button").forEach(function (x) { x.disabled = true; });
    }
    function refreshItemSums() {
      $("pItems").querySelectorAll("tr[data-it]:not(.pi-dir)").forEach(function (tr) {
        var it = d.items[+tr.getAttribute("data-it")], cell = tr.querySelector("td.n b");
        if (it && cell) cell.textContent = Calc.fmtWon(Calc.itemMonths(it).reduce(function (a, b) { return a + b; }, 0));
      });
      var c = Calc.compute(d, S.settings), sm = $("pItems").querySelector(".pi-sum");
      if (sm) { var isum = c.itemSum, rest = c.plan - isum; sm.querySelector("b").textContent = Calc.fmtWon(isum); sm.querySelectorAll("b")[1].textContent = Calc.fmtWon(rest); sm.querySelectorAll("b")[1].className = rest < 0 ? "bad" : ""; }
    }
    function newItemId() { var n = 1, ids = d.items.map(function (x) { return x.id; }); while (ids.indexOf("I" + n) >= 0) n++; return "I" + n; }
    // 작년 분개장(같은 계정 전표)에서 비슷한 적요끼리 묶어 확정 항목 후보로
    function suggestItems() {
      var ix = dzIndex(), g = {}, tot = 0;
      PREVX.lines.forEach(function (l) {
        if (ix.leaf(l) !== r.id) return;
        tot += l.amt;
        var key = (l.memo || "").replace(/\s*\(.*\)\s*$/, "").replace(/[0-9#]+/g, "").trim() || "(적요 없음)", x = g[key + "|" + l.code] = g[key + "|" + l.code] || { memo: key, code: l.code, ms: new Array(12).fill(0), n: 0, amt: 0 };
        x.ms[l.m - 1] += l.amt; x.n++; x.amt += l.amt;
      });
      var list = Object.keys(g).map(function (k) { return g[k]; }).filter(function (x) { return tot && x.amt >= tot * 0.05 && x.memo !== "(적요 없음)"; }).sort(function (a, b) { return b.amt - a.amt; }).slice(0, 8);
      var box = $("piSugBox");
      if (!list.length) { box.innerHTML = '<div class="pi-empty">' + PREVX.year + "년 분개장에 이 계정의 굵직한 전표 묶음이 없습니다 (계정 실적의 5% 이상)</div>"; return; }
      box.innerHTML = '<div class="pi-sug"><b>' + PREVX.year + "년 분개장 묶음</b> — 누르면 확정 항목으로 넣습니다 (금액은 작년 실적, 고쳐서 쓰세요)" + list.map(function (x, i) {
        var ms = x.ms.map(function (v, k) { return v ? k + 1 : 0; }).filter(Boolean);
        return '<div class="pi-s" data-sg="' + i + '"><b>' + esc(x.memo) + "</b> · " + esc(dzText({ code: x.code, name: (r.dz.filter(function (z) { return z.code === x.code; })[0] || {}).name })) + " · " + ms.map(function (m) { return m + "월"; }).join(" ") + " · <b>" + Calc.fmtWon(x.amt) + "</b>원 (" + x.n + "건)</div>";
      }).join("") + "</div>";
      box.querySelectorAll("[data-sg]").forEach(function (el) {
        el.addEventListener("click", function () {
          readItems();
          var x = list[+el.getAttribute("data-sg")], ms = x.ms.map(function (v, k) { return v ? k + 1 : 0; }).filter(Boolean), it = { id: newItemId(), name: x.memo, code: r.dz.some(function (z) { return z.code === x.code; }) ? x.code : (r.dz[0] || {}).code || "", cond: { memo: x.memo, ptn: "" }, memo: PREVX.year + "년 분개장에서" };
          if (ms.length === 1) { it.how = "일시"; it.mo = ms[0]; it.amt = Math.round(x.amt); }
          else if (ms.length === 12) { it.how = "매월"; it.amt = Math.round(x.amt / 12); }
          else if (ms.join() === "3,6,9,12") { it.how = "분기"; it.amt = Math.round(x.amt / 4); }
          else if (ms.join() === "6,12") { it.how = "반기"; it.amt = Math.round(x.amt / 2); }
          else { it.how = "직접"; it.months = x.ms.map(Math.round); }
          d.items.push(it);
          buildItems(); preview();
        });
      });
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
        (c.check ? '<div class="pv-warn">⚠ ' + (/비율 합/.test(c.check) ? "월 비율의 합이 100%가 아닙니다 (" + (c.svSum * 100).toFixed(1) + "%)" : esc(c.check)) + "</div>" : "") +
        (c.itemSum ? '<div class="pv-info">확정 항목 ' + d.items.length + "개 " + Calc.fmtWon(c.itemSum) + "원 · 나머지 " + Calc.fmtWon(c.plan - c.itemSum) + "원</div>" : "") +
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
      title: r.name, crumb: r.l1 + (r.l3 ? " › " + r.l2 : "") + (r.dz.length ? " · 더존 " + r.dz.map(dzText).join(", ") : ""), width: 1060,
      body: '<div class="split2"><div class="mdl-pad" id="pLeft"></div><div class="mdl-pad preview" id="pPreview"></div></div><div class="mdl-pad pitems" id="pItems"></div>', key: "plan",
      footLeft: ro ? '<span class="l">🔒 마감된 계획 — 보기만 됩니다. 바꾸려면 [계획 변경]을 여세요</span>' : '<span class="l">Enter 확인 · Esc 취소</span>',
      extra: r.meth && !ro ? '<button class="btn danger" id="pClear">입력 지우기</button>' : "",
      okText: ro ? null : "확인", cancelText: ro ? "닫기" : null,
      onOk: function () {
        readAll($("pLeft"));
        d.items = d.items.filter(function (it) { return Calc.itemMonths(it).some(function (v) { return v; }); }).map(function (it) { if (!it.name) it.name = dzText({ code: it.code, name: (r.dz.filter(function (z) { return z.code === it.code; })[0] || {}).name }) || "확정 항목"; return it; });
        var c = Calc.compute(d, S.settings), before = r._c ? r._c.plan : 0;
        change(function () { setPlan(r.id, d); },
          rowLabel(r) + " 산출 입력: " + (r.meth ? Calc.fmtWon(before) + " → " : "") + Calc.fmtWon(c.plan) + "원 (" + d.meth + ", " + d.split + ")");
      }
    });
    build();
    buildItems();
    var init0 = JSON.stringify(d);
    dlg.confirmClose = function () { if (ro) return false; readAll($("pLeft")); return JSON.stringify(d) !== init0; };
    $("pItems").addEventListener("click", function (e) {
      if (ro) return;
      var del = e.target.closest("[data-del]");
      if (e.target.id === "piAdd") { readItems(); d.items.push({ id: newItemId(), name: "", code: (r.dz[0] || {}).code || "", how: "일시", mo: 1, amt: 0, cond: { memo: "", ptn: "" }, memo: "" }); buildItems(); preview(); var ins = $("pItems").querySelectorAll('[data-f="name"]'); if (ins.length) ins[ins.length - 1].focus(); }
      else if (e.target.id === "piSug") suggestItems();
      else if (e.target.id === "piSet") { readItems(); var c = Calc.compute(d, S.settings); d.meth = "수기"; d.a = c.itemSum; if (d.split === "수기") d.split = "균등"; build(); buildItems(); }
      else if (del) { readItems(); d.items.splice(+del.getAttribute("data-del"), 1); buildItems(); preview(); }
    });
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
      dlg._ok = true; closeDialog();
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
    var EC = editCols(), c = EC.indexOf(UI.cell.k), nc = Math.max(0, Math.min(EC.length - 1, c + dx));
    setCell(ids[j], EC[nc], true);
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
      if (ctl && /^[biu]$/i.test(k) && FS) { e.preventDefault(); fmtApply(k.toLowerCase()); return; }
      if (ctl && k.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
      if (ctl && k.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (ctl && k.toLowerCase() === "f") { e.preventDefault(); $("search").focus(); $("search").select(); return; }
      if (ctl && k.toLowerCase() === "s") { e.preventDefault(); saveAll("button"); return; }
      if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); moveCell(0, k === "ArrowDown" ? 1 : -1); }
      else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); moveCell(k === "ArrowLeft" ? -1 : 1, 0); }
      else if (k === "Tab") { e.preventDefault(); moveCell(e.shiftKey ? -1 : 1, 0); }
      else if (k === "Enter" || k === "F2") { e.preventDefault(); startEdit(false); }
      else if (k === "Delete" || k === "Backspace") { e.preventDefault(); clearCell(); }
      else if (k === "Escape") { e.preventDefault(); closeCtx(); if (Object.keys(UI.multi).length) { UI.multi = {}; renderAll(); } else { UI.cell = null; markCell(); ed.blur(); } }
    });
    ed.addEventListener("blur", function () { if (editing) setTimeout(function () { if (editing && document.activeElement !== ed) commitEdit(ed.value, 0, 0); }, 0); });
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
  function closeCtx() { $("ctx").hidden = true; $("fpop").hidden = true; $("fpop").classList.remove("wide"); }
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
    if (id && !UI.multi[id]) { if (UI.cell && UI.cell.id !== id || !UI.cell) setCell(id, editCols().indexOf(k) >= 0 ? k : null); }
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
    if (k !== "acc") it("colhide", "🙈 이 열 숨기기");
    it("colpop", "열 보이기 · 숨기기…");
    it("colreset", "↺ 열 순서 · 숨김 처음대로");
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
    else if (p[0] === "colhide") { colHide("plan")[k] = 1; if (UI.sort && UI.sort.k === k) UI.sort = null; if (UI.freeze === k) UI.freeze = "acc"; if (UI.cell && UI.cell.k === k) UI.cell = null; saveViews(); renderAll(); }
    else if (p[0] === "colpop") colPop("plan", x, y);
    else if (p[0] === "colreset") colReset("plan");
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
    var all = rbOrder(rb);
    order.forEach(function (name) { var g = rb.querySelector(':scope > .rgrp[data-g="' + name + '"]'); if (g) rb.appendChild(g); });
    all.forEach(function (name) { if (order.indexOf(name) < 0) { var g = rb.querySelector(':scope > .rgrp[data-g="' + name + '"]'); if (g) rb.appendChild(g); } });
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
    var main = !PANES.length || ACT === PANES[0], st = main ? { h: 0, shut: false } : ACT.strip, pane = CUR;
    // 요약 띠 높이: 기본은 내용에 딱 맞게 (예전 판에서 늘려 둔 높이는 쓰지 않음)
    if (main) try { st = JSON.parse(localStorage.getItem("budget.strip2") || "null") || st; } catch (e) { /* 저장소 막힘 */ }
    var strip = $("strip"), keep = function () { if (main) try { localStorage.setItem("budget.strip2", JSON.stringify(st)); } catch (e) { /* 저장소 막힘 */ } };
    var apply = function () {
      pane.classList.toggle("strip-shut", st.shut);
      strip.style.height = !st.shut && st.h ? Math.min(st.h, 90) + "px" : "";
      pane.style.setProperty("--barH", (st.h ? Math.max(18, st.h - 34) : 54) + "px");
      pane.querySelector("#stripBtn").textContent = st.shut ? "▾ 요약 펴기" : "▴ 요약 접기";
    };
    var sb = $("stripBtn");
    sb.addEventListener("click", function () { st.shut = !st.shut; keep(); apply(); });
    var grip = $("stripGrip"), y0 = 0, h0 = 0, on = false;
    grip.addEventListener("mousedown", function (e) { if (st.shut) return; on = true; y0 = e.clientY; h0 = strip.offsetHeight; e.preventDefault(); document.body.classList.add("resizing"); });
    document.addEventListener("mousemove", function (e) { if (!on) return; st.h = Math.max(30, Math.min(90, h0 + e.clientY - y0)); apply(); });
    document.addEventListener("mouseup", function () { if (on) { on = false; document.body.classList.remove("resizing"); keep(); } });
    grip.addEventListener("dblclick", function () { st.h = 0; keep(); apply(); });
    apply();
  }

  /* ---------- 표에서 줄 끌어 순서 바꾸기 (같은 상위 안에서) ---------- */
  function siblings(a, b) { return !!(a && b && (a.sub ? b.sub && a.mid === b.mid : !b.sub && a.top === b.top)); }
  var drag = null;
  function bindTableDrag(tbl) {
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

  /* ---------- 칸 서식 (배경 · 글씨색 · 굵게 · 기울임 · 밑줄 · 크기) ----------
     칸을 누르거나 끌어서 고른 뒤 리본 [서식] 또는 Ctrl+B · I · U. 계획 화면 서식은 계획 파일, 집행 화면 서식은 집행 파일에 저장 */
  var FS = null, fsDrag = false, fmtDown = null;
  function rowKeyOf(tr) {
    if (!tr) return null;
    if (tr.classList.contains("unl")) return null;
    if (tr.classList.contains("itm")) return "i:" + tr.getAttribute("data-of") + "#" + (tr.getAttribute("data-iid") || (tr.classList.contains("rest") ? "_rest" : tr.querySelector(".itn").textContent.replace(/^└\s*/, "")));
    if (tr.classList.contains("acc")) return tr.getAttribute("data-id");
    if (tr.classList.contains("grp")) return "g:" + tr.getAttribute("data-grp");
    if (tr.classList.contains("total")) return "tot";
    return null;
  }
  function fmtGrid(tbl) {
    var rows = Array.prototype.filter.call(tbl.querySelectorAll("tbody tr"), function (tr) { return rowKeyOf(tr); });
    var head = tbl.querySelector("tbody tr.grp") || rows[0], cols = head ? Array.prototype.map.call(head.querySelectorAll("td[data-k]"), function (td) { return td.getAttribute("data-k"); }) : [];
    return { rows: rows, cols: cols };
  }
  function fmtKeys() {
    if (!FS) return [];
    var tbl = $(FS.scr === "plan" ? "tbl" : "tblX"), G = fmtGrid(tbl), ks = [];
    var ra = G.rows.map(rowKeyOf), r0 = ra.indexOf(FS.a.r), r1 = ra.indexOf(FS.b.r), c0 = G.cols.indexOf(FS.a.c), c1 = G.cols.indexOf(FS.b.c);
    if (r0 < 0 || r1 < 0 || c0 < 0 || c1 < 0) return FS.a.r && FS.a.c ? [FS.a.r + "|" + FS.a.c] : [];
    for (var i = Math.min(r0, r1); i <= Math.max(r0, r1); i++) for (var j = Math.min(c0, c1); j <= Math.max(c0, c1); j++) ks.push(ra[i] + "|" + G.cols[j]);
    return ks;
  }
  function fmtPaint(tbl, fmt, scr) {
    var G = fmtGrid(tbl), sel = {};
    if (FS && FS.scr === scr) fmtKeys().forEach(function (k) { sel[k] = 1; });
    G.rows.forEach(function (tr) {
      var rk = rowKeyOf(tr);
      tr.querySelectorAll("td[data-k]").forEach(function (td) {
        var k = rk + "|" + td.getAttribute("data-k"), f = fmt && fmt[k];
        td.style.background = f && f.bg ? f.bg : ""; td.style.color = f && f.fg ? f.fg : "";
        td.style.fontWeight = f && f.b ? "700" : ""; td.style.fontStyle = f && f.i ? "italic" : ""; td.style.textDecoration = f && f.u ? "underline" : "";
        td.style.fontSize = f && f.fs ? f.fs + "px" : "";
        td.classList.toggle("fsel", !!sel[k]);
      });
    });
  }
  function fmtRepaint() { if (MODE === "exec") fmtPaint($("tblX"), X && X.fmt, "exec"); else fmtPaint($("tbl"), S.fmt, "plan"); }
  function fmtApply(prop, val) {
    var scr = MODE === "exec" ? "exec" : "plan", ks = FS && FS.scr === scr ? fmtKeys() : [];
    if (!ks.length) { toast("먼저 서식을 바꿀 칸을 누르거나 끌어서 고르세요"); return; }
    if (scr === "exec" && !X) return;
    var map = clone((scr === "plan" ? S.fmt : X.fmt) || {});
    var all = ks.every(function (k) { return map[k] && map[k][prop]; });
    ks.forEach(function (k) {
      var f = map[k] || {};
      if (prop === "clear") f = {};
      else if (prop === "b" || prop === "i" || prop === "u") { if (all) delete f[prop]; else f[prop] = 1; }
      else if (val) f[prop] = val; else delete f[prop];
      if (Object.keys(f).length) map[k] = f; else delete map[k];
    });
    var what = { b: "굵게", i: "기울임", u: "밑줄", fs: "글씨 크기", fg: "글씨색", bg: "배경색", clear: "서식 지우기" }[prop] + " · " + ks.length + "칸";
    if (scr === "plan") change(function () { S.fmt = map; }, "서식: " + what);
    else xChange(function () { X.fmt = map; }, "서식 (집행): " + what);
  }
  // 색상표: 회색 6단계 + 10가지 색 × 밝기 5단계 + 최근 쓴 색 + 직접 고르기
  var FMT_GRAY = ["#FFFFFF", "#F1F3F4", "#DADCE0", "#9AA0A6", "#5F6368", "#000000"];
  var FMT_HUES = [
    ["빨강", ["#FDE7E5", "#F6AEA9", "#EA4335", "#C5221F", "#8C1D18"]], ["주황", ["#FEEFE3", "#FBC68F", "#FA7B17", "#D56E0C", "#9C4A00"]],
    ["노랑", ["#FEF7E0", "#FDE293", "#FBBC04", "#F29900", "#B06000"]], ["연두", ["#F1F8E1", "#D2E9A6", "#9BCB4C", "#6E9E2E", "#47701C"]],
    ["초록", ["#E6F4EA", "#A8DAB5", "#34A853", "#188038", "#0D652D"]], ["청록", ["#E4F7FB", "#A1E4F0", "#24C1E0", "#129EAF", "#007B83"]],
    ["하늘", ["#E8F0FE", "#AECBFA", "#4285F4", "#1967D2", "#174EA6"]], ["파랑", ["#E8EAF6", "#9FA8DA", "#3F51B5", "#283593", "#1A237E"]],
    ["보라", ["#F3E8FD", "#D7AEFB", "#A142F4", "#8430CE", "#681DA8"]], ["분홍", ["#FDE7F3", "#FDCFE8", "#F439A0", "#C92786", "#9C166B"]]
  ];
  function fmtLast(prop, v) {
    var k = "budget.fmtLast." + prop;
    try { if (v !== undefined) localStorage.setItem(k, v); return localStorage.getItem(k) || (prop === "bg" ? "#FEF7E0" : "#EA4335"); } catch (e) { return prop === "bg" ? "#FEF7E0" : "#EA4335"; }
  }
  function fmtRecent(c) {
    var a = [];
    try { a = JSON.parse(localStorage.getItem("budget.fmtRecent") || "[]") || []; } catch (e) { a = []; }
    if (c) { a = [c].concat(a.filter(function (x) { return x !== c; })).slice(0, 10); try { localStorage.setItem("budget.fmtRecent", JSON.stringify(a)); } catch (e) { /* 저장소 막힘 */ } }
    return a;
  }
  function fmtPick(prop, c) {
    if (c) { fmtLast(prop, c); fmtRecent(c); }
    document.querySelectorAll('[data-fmt="' + prop + '"] i').forEach(function (i) { i.style.background = fmtLast(prop); });
    fmtApply(prop, c);
  }
  function fmtPalette(prop, x, y) {
    var el = $("fpop"), sw = function (c, t) { return '<button class="sw" data-sw="' + c + '" style="background:' + c + '" title="' + (t || c) + '"></button>'; };
    var rec = fmtRecent();
    el.innerHTML = '<div class="fp-h">' + (prop === "bg" ? "배경색" : "글씨색") + '</div><div class="fpal-top"><button class="sw none" data-sw="" title="없음 (기본)">✕ 없음</button>' + sw("#FFFFFF", "흰색") + sw("#000000", "검정") + "</div>" +
      '<div class="fpal-lb">회색</div><div class="fpal g6">' + FMT_GRAY.map(function (c) { return sw(c); }).join("") + "</div>" +
      '<div class="fpal-lb">색 (위 = 연함 → 아래 = 진함)</div><div class="fpal g10">' + [0, 1, 2, 3, 4].map(function (lv) { return FMT_HUES.map(function (h) { return sw(h[1][lv], h[0] + " " + (lv + 1) + "단계 " + h[1][lv]); }).join(""); }).join("") + "</div>" +
      (rec.length ? '<div class="fpal-lb">최근 쓴 색</div><div class="fpal g10">' + rec.map(function (c) { return sw(c); }).join("") + "</div>" : "") +
      '<div class="fpal-lb">직접 고르기</div><div class="fpal-c"><input type="color" id="fpCol" value="' + fmtLast(prop) + '"><input class="inp plain" id="fpHex" value="' + fmtLast(prop) + '" placeholder="#RRGGBB"><button class="btn sm primary" id="fpHexOk">적용</button></div>';
    el._sw = prop; el._cv = null;
    el.classList.add("wide");
    place(el, x, y);
    $("fpCol").addEventListener("input", function () { $("fpHex").value = this.value.toUpperCase(); });
    $("fpHexOk").addEventListener("click", function () {
      var v = $("fpHex").value.trim();
      if (!/^#?[0-9a-f]{6}$/i.test(v)) { toast("#RRGGBB 형식으로 넣으세요 (예: #1E7B4F)", true); return; }
      if (v[0] !== "#") v = "#" + v;
      el._sw = null; closeCtx(); fmtPick(prop, v.toUpperCase());
    });
  }
  function bindFmt() {
    var down = function (e, tblId) {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var tbl = $(tblId), td = e.target.closest && e.target.closest("td");
      if (e.target.id === "cellEd") td = document.elementsFromPoint(e.clientX, e.clientY).filter(function (x) { return x.tagName === "TD" && x.closest("#" + tblId); })[0];
      if (!td || !td.closest("#" + tblId) || !td.getAttribute("data-k") || e.target.closest(".grip,.caret,.itg,[data-xwarn],button,a,select,input:not(#cellEd)")) return;
      var rk = rowKeyOf(td.closest("tr"));
      if (!rk) return;
      FS = { scr: tblId === "tbl" ? "plan" : "exec", a: { r: rk, c: td.getAttribute("data-k") }, b: { r: rk, c: td.getAttribute("data-k") } };
      fsDrag = true; tbl.classList.add("fsdrag");
      fmtRepaint();
    };
    fmtDown = down;
    $("cellEd").addEventListener("mousedown", function (e) { if (!editing) down(e, "tbl"); });
    document.addEventListener("mousemove", function (e) {
      if (!fsDrag || !FS || !(e.buttons & 1)) return;
      var tblId = FS.scr === "plan" ? "tbl" : "tblX", td = document.elementsFromPoint(e.clientX, e.clientY).filter(function (x) { return x.tagName === "TD" && x.closest("#" + tblId); })[0];
      if (!td || !td.getAttribute("data-k")) return;
      var rk = rowKeyOf(td.closest("tr"));
      if (!rk || (FS.b.r === rk && FS.b.c === td.getAttribute("data-k"))) return;
      FS.b = { r: rk, c: td.getAttribute("data-k") };
      e.preventDefault();
      fmtRepaint();
      var n = fmtKeys().length;
      $("stSel").textContent = n > 1 ? n + "칸 선택 (리본 [서식] · Ctrl+B · I · U)" : $("stSel").textContent;
    });
    document.addEventListener("mouseup", function () { if (fsDrag) { fsDrag = false; $("tbl").classList.remove("fsdrag"); $("tblX").classList.remove("fsdrag"); } });
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-fmt]");
      if (!b || b.tagName === "SELECT") return;
      var f = b.getAttribute("data-fmt");
      if (f === "fgm" || f === "bgm") { var r = b.getBoundingClientRect(); fmtPalette(f.slice(0, 2), r.left - 30, r.bottom + 2); return; }
      if (f === "fg" || f === "bg") { fmtPick(f, fmtLast(f)); return; }
      fmtApply(f);
    });
    document.addEventListener("change", function (e) { var sl = e.target.closest && e.target.closest("select[data-fmt]"); if (sl) { fmtApply("fs", +sl.value || 0); sl.value = ""; } });
    $("fpop").addEventListener("click", function (e) { var sw = e.target.closest("[data-sw]"), el = $("fpop"); if (!sw || !el._sw) return; var p = el._sw; el._sw = null; closeCtx(); fmtPick(p, sw.getAttribute("data-sw")); });
    ["fg", "bg"].forEach(function (p) { document.querySelectorAll('[data-fmt="' + p + '"] i').forEach(function (i) { i.style.background = fmtLast(p); }); });
  }

  /* ---------- 표 열 순서 · 숨기기 (머리글 끌기 · 우클릭) — 보기(월별 · 분기 · 반기 · 누계)마다 기억 ---------- */
  function colBlocks(scr) { return scr === "plan" ? pBlocks() : xBlocks(); }
  function colHide(scr) { var H = scr === "plan" ? UI.hide : XU.hide, a = scr === "plan" ? UI.pagg : XU.agg; return H[a] = H[a] || {}; }
  function colSet(scr, order) { if (scr === "plan") UI.cols[UI.pagg] = order; else XU.cols[XU.agg] = order; saveViews(); renderAll(); }
  function colLabel(scr, b) { return scr === "plan" ? (b === "plan" ? "계획" : colName(b)) : blkName(b, xUpto(), X ? X.month : 0).replace(/ · 진행 중$/, ""); }
  function colReset(scr) {
    if (scr === "plan") { delete UI.cols[UI.pagg]; delete UI.hide[UI.pagg]; } else { delete XU.cols[XU.agg]; delete XU.hide[XU.agg]; }
    saveViews(); renderAll(); toast("열 순서 · 숨김을 처음대로 돌렸습니다");
  }
  function saveViews() {
    try { localStorage.setItem("budget.views", JSON.stringify({ p: { agg: UI.pagg, cols: UI.cols, hide: UI.hide }, x: { agg: XU.agg, cols: XU.cols, hide: XU.hide, view: XU.view } })); } catch (e) { /* 저장소 막힘 */ }
  }
  function loadViews() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem("budget.views") || "null"); } catch (e) { v = null; }
    if (!v) return;
    if (v.p) { UI.pagg = PERIODS[v.p.agg] ? v.p.agg : "month"; UI.cols = v.p.cols || {}; UI.hide = v.p.hide || {}; }
    if (v.x) { XU.agg = XBLK[v.x.agg] ? v.x.agg : "month"; XU.cols = v.x.cols || {}; XU.hide = v.x.hide || {}; XU.view = v.x.view || "all"; }
  }
  // 열 보이기 · 숨기기 목록 (체크)
  function colPop(scr, x, y) {
    var hide = colHide(scr), el = $("fpop");
    el.innerHTML = '<div class="fp-h">열 보이기 · 숨기기</div><div class="fp-list">' + colBlocks(scr).filter(function (b) { return scr !== "plan" || b !== "before" || isChanging(); }).map(function (b) {
      return '<label class="fp-o"><input type="checkbox" class="cvB" value="' + b + '"' + (hide[b] ? "" : " checked") + "> " + esc(colLabel(scr, b)) + "</label>";
    }).join("") + '</div><div class="fp-b"><button class="btn sm" data-cv="reset">순서 · 숨김 처음대로</button><button class="btn sm primary" data-cv="ok">적용</button></div>';
    el.setAttribute("data-k", "");
    el._cv = scr;
    place(el, x, y);
  }
  function bindColDrag(tbl, scr) {
    var cd = null;
    var clear = function () { tbl.querySelectorAll(".col-drop-l,.col-drop-r,.col-dragging").forEach(function (x) { x.classList.remove("col-drop-l", "col-drop-r", "col-dragging"); }); };
    tbl.addEventListener("dragstart", function (e) {
      var th = e.target.closest && e.target.closest("th[data-b]");
      if (!th) return;
      cd = { b: th.getAttribute("data-b") };
      e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", cd.b);
      th.classList.add("col-dragging");
    });
    tbl.addEventListener("dragend", function () { cd = null; clear(); });
    tbl.addEventListener("dragover", function (e) {
      if (!cd) return;
      var th = e.target.closest("th[data-b]");
      tbl.querySelectorAll(".col-drop-l,.col-drop-r").forEach(function (x) { x.classList.remove("col-drop-l", "col-drop-r"); });
      if (!th || th.getAttribute("data-b") === cd.b) return;
      e.preventDefault();
      var r = th.getBoundingClientRect();
      th.classList.add(e.clientX < r.left + r.width / 2 ? "col-drop-l" : "col-drop-r");
    });
    tbl.addEventListener("drop", function (e) {
      if (!cd) return;
      var th = e.target.closest("th[data-b]");
      if (!th) return;
      e.preventDefault();
      var tb = th.getAttribute("data-b"), before = th.classList.contains("col-drop-l"), o = colBlocks(scr).slice();
      if (tb === cd.b) return;
      o.splice(o.indexOf(cd.b), 1);
      o.splice(o.indexOf(tb) + (before ? 0 : 1), 0, cd.b);
      var moved = cd.b;
      cd = null; clear();
      colSet(scr, o);
      toast("'" + colLabel(scr, moved) + "' 열을 옮겼습니다 (우클릭 › 열 순서 처음대로)");
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
    var h = S.years.map(function (y) { return '<option value="' + y + '"' + (y === S.year ? " selected" : "") + ">" + y + "년</option>"; }).join("") + '<option value="new">＋ 새 연도…</option>';
    $("selYear").innerHTML = h; $("selYearX").innerHTML = h;
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

  // 켰을 때 상태: 이번에 처음 여는 연도 파일은 읽기 전에 그대로 보관 (켰을 때로 되돌리기)
  var START = { files: {}, at: "" };
  function keepStart(names) {
    var todo = names.filter(function (n) { return !(n in START.files); });
    todo.forEach(function (n) { START.files[n] = null; });
    return Promise.all(todo.map(function (n) { return Store.readRaw(n).then(function (b) { START.files[n] = b; }); }));
  }
  function loadYear(y) {
    var me = ACT;
    return keepStart([Store.fileName(y), Store.execName(y), Store.execLinesName(y)]).then(function () { return Store.load(y); }).then(function (st) { return withPane(me, function () { return loadYearApply(y, st); }); }, function (e) {
      toast(y + "년 파일을 읽지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }
  function loadYearApply(y, st) {
    {
      keepYearLock();
      S.year = st.year; S.settings = st.settings; S.log = st.log; S.lock = st.lock; S.fmt = st.fmt || {};
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
      if (Store.readOnly() || Object.keys(SVS).length) renderSave(); else setSave("ok", st.savedAt ? "마지막 저장 " + st.savedAt.slice(5, 16) : "불러옴");
      loadExecFor(y);
      if (st.legacy) {
        addLog("0.1 판 파일을 새 형식(분류 ID)으로 바꿈");
        toast("이전 형식 파일을 새 형식으로 바꿨습니다 (분류는 " + Store.MASTER + ")", false, 4000);
      }
      if (converted || masterDirty) scheduleSave();
    }
  }

  // 이 연도 집행 자료 + 전년 집행 메모 (다음 해 계획에서 참고)
  function loadExecFor(y) {
    var me = ACT;
    return Promise.all([Store.loadExec(y).catch(function () { return null; }), Store.loadExec(y - 1).catch(function () { return null; })]).then(function (r) { return withPane(me, function () {
      if (S.year !== y) return;
      X = r[0] || blankX(y); PREVX = r[1];
      X.pins = X.pins || {}; X.rules = X.rules || []; X.fmt = X.fmt || {};
      if (MODE === "exec") renderAll();
      if (me === ACT) refreshChrome();
      renderOthers();
    }); });
  }
  function switchYear(y) { var me = ACT; return askSave(function () { return withPane(me, function () { detachS(); return loadYear(y); }); }, y + "년을 불러옵니다").then(function () { savePanes(); fillYearSelect(); paneHead(); }); }

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
      baseYearInfo(y - 1).then(function (r) { var box = $("nyOpts"); if (!box || parseInt($("nyYear").value, 10) !== y) return; info = r; if (!r.M && mode === "act") mode = "empty"; else if (r.M) mode = mode || "act"; box.innerHTML = opts(); }); // 팝업이 닫혔거나 연도를 또 바꿨으면 버림
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
        var base0 = m === "act" ? { info: info, how: how } : null;
        setTimeout(function () { askSave(function () { createYear(y, m, base0); }, y + "년 파일을 만듭니다"); }, 0);
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
    BUSY++;
    flushSave().then(function () {
      detachS();
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
      S.year = y; S.plan = plan; S.lock = { state: "draft", rounds: [] }; S.fmt = {};
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
      renderSave();
      toast(y + "년 파일을 만들었습니다 — data\\" + Store.fileName(y) + (base ? " · 전년 실적을 넣었습니다. 산출 방식은 [일괄 적용]으로 한 번에 넣을 수 있습니다" : ""), false, 5000);
      if (!leafCount(S.cat)) setTimeout(catDialog, 300);
      BUSY--; savePanes(); renderOthers();
    }).catch(function (e) { BUSY--; toast("새 연도를 만들지 못했습니다: " + (e && e.message || e), true, 6000); });
  }

  /* ---------- 계획 전체 양식 다운 · 업로드 ---------- */
  var PT_HEAD = ["ID", "대분류", "중분류", "소분류", "더존코드", "전년실적", "산출방식", "증감률(%)", "금액·단가(원)", "인원·수량", "개월", "총액(원)", "자동칸", "분할"]
    .concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return m + "월"; })).concat(["메모"]);
  var AUTO_NAME = { a: "월액", b: "인원", c: "개월", t: "" };
  var PI_HEAD = ["ID", "대분류", "중분류", "소분류", "항목", "더존코드", "시기", "월", "금액(원)"].concat(range(12).map(function (m) { return m + "월"; })).concat(["적요조건", "거래처조건", "메모"]);
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
    var ia = [PI_HEAD];
    S.rows.forEach(function (r) { r.items.forEach(function (it) { ia.push([r.id, r.l1, r.l2, r.l3, it.name, it.code, it.how, it.how === "일시" ? it.mo : "", it.how === "직접" ? "" : it.amt || ""].concat(range(12).map(function (m) { return it.how === "직접" ? (it.months && it.months[m - 1]) || "" : ""; })).concat([(it.cond || {}).memo || "", (it.cond || {}).ptn || "", it.memo || ""])); }); });
    var wi = XLSX.utils.aoa_to_sheet(ia);
    wi["!cols"] = [7, 12, 18, 14, 22, 9, 6, 4, 14].concat(new Array(12).fill(10)).concat([16, 16, 20]).map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, wi, "확정항목");
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
      ["• '확정항목' 시트: 한 줄 = 확정 항목 하나 (계정 총액에서 굵직하게 정해진 것). 시기 = 일시(월 칸) · 매월 · 분기 · 반기 (금액 칸) · 직접 (1~12월 칸)."],
      ["  더존코드는 그 계정에 연결된 코드, 적요조건 · 거래처조건은 같은 코드 안에서 나눌 때만. 이 시트가 있으면 '계획' 시트에 있는 계정의 확정 항목을 이 시트 내용으로 바꿉니다 (줄이 없으면 그 계정 항목은 지움)."],
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
    // 확정항목 시트 (있으면 계정별 항목을 통째로 바꿈)
    var ish = sheets.filter(function (x) { return x.name === "확정항목"; })[0], IT = null;
    if (ish) {
      IT = {};
      var ia = ish.aoa, ih = -1, IC = {};
      for (var q0 = 0; q0 < Math.min(10, ia.length) && ih < 0; q0++) { var rq = (ia[q0] || []).map(function (v) { return nm(v); }); if (rq.indexOf("항목") >= 0 && rq.indexOf("시기") >= 0) { ih = q0; PI_HEAD.forEach(function (hh) { IC[hh] = rq.indexOf(nm(hh)); }); } }
      if (ih >= 0) ia.slice(ih + 1).forEach(function (row, i) {
        row = row || [];
        var gi = function (hh) { return IC[hh] >= 0 ? row[IC[hh]] : ""; }, id = str(gi("ID")), l1 = str(gi("대분류")), l2 = str(gi("중분류")), l3 = str(gi("소분류")), name = str(gi("항목"));
        if (!id && !l1 && !name) return;
        if (!leaves[id]) id = byPath[nm(l1) + "|" + nm(l2) + "|" + nm(l3)] || "";
        if (!id) { miss.push("확정항목 " + (ih + i + 2) + "번째 줄: 계정을 못 찾음 (" + [l1, l2, l3].filter(Boolean).join(" › ") + ")"); return; }
        var how = Calc.ITEM_HOWS.indexOf(str(gi("시기"))) >= 0 ? str(gi("시기")) : "일시", leafR = S.allRows.filter(function (x) { return x.id === id; })[0], code = str(gi("더존코드"));
        if (code && leafR && !leafR.dz.some(function (z) { return z.code === code; })) errs.push("확정항목 " + (ih + i + 2) + "번째 줄: 더존코드 " + code + " 은(는) 이 계정에 연결돼 있지 않음 — 비움");
        var it = { id: "", name: name, code: code && leafR && leafR.dz.some(function (z) { return z.code === code; }) ? code : "", how: how, mo: Calc.num(gi("월")) || 1, amt: Calc.num(gi("금액(원)")), months: range(12).map(function (m) { return Calc.num(gi(m + "월")); }), cond: { memo: str(gi("적요조건")), ptn: str(gi("거래처조건")) }, memo: str(gi("메모")) };
        var list = IT[id] = IT[id] || [];
        it.id = "I" + (list.length + 1);
        list.push(it);
      });
    }
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
      if (IT) p.items = IT[id] || [];
      var before = cur._c && !cur._c.missing ? cur._c.plan : 0, after = meth || (p.items && p.items.length) ? Calc.compute(Object.assign({}, cur, p), S.settings).plan : 0;
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
    Store.pick().then(function () {
      return Store.isProgramFolder().then(function (bad) {
        if (!bad) return openFolder();
        cover("프로그램 폴더를 고르셨습니다", "<code>" + esc(Store.folderName()) + "</code> 는 프로그램(<code>index.html</code>)이 들어 있는 폴더입니다.<br>프로그램을 새 버전으로 바꿀 때 이 폴더는 통째로 교체되므로, 자료는 <b>storage</b> 폴더(프로그램 폴더 옆)에 두세요.", [
          { label: "storage 폴더 고르기", primary: true, fn: askFolder },
          { label: "그래도 이 폴더 사용", fn: function () { hideCover(); openFolder(); } }
        ]);
      });
    }, function (e) {
      if (e && e.name === "AbortError") return;
      toast("폴더를 연결하지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }

  // 제목 줄 캐릭터 그림을 다른 곳에도 (안내 팝업 등)
  function mascotSvg(cls) { var m = document.getElementById("mascot"); return m ? m.outerHTML.replace(' id="mascot"', "").replace('class="mascot"', 'class="mascot ' + (cls || "") + '"') : ""; }

  /* ---------- 이스터에그: 제목 줄 캐릭터를 누르면 화면 가운데에 나와서 놀다 감 ---------- */
  var eggTimer = null;
  function eggLines() {
    var a = ["오늘도 예산 지키는 중! 💰", "집행률 확인하셨나요? 👀", "더존 자료는 매달 잊지 말기! 📥", "Ctrl+Z 는 100번까지 돼요 😉", "저장은 제가 알아서 할게요 💾", "칸을 끌어서 색칠해 보세요 🎨", "분류 이름을 누르면 분석이 나와요 📊", "화면 분할도 해 보셨어요? ⊞"];
    try {
      if (X && X.month) {
        var rows = xRows(false), yp = 0, fc = 0, pa = 0;
        rows.forEach(function (r) { yp += sum12(r.plan); fc += xForecast(r); pa += sum12(r.act, X.month); });
        a.push("벌써 " + X.month + "월까지 왔네요! ⏳");
        a.push(fc > yp ? "연말 초과 예상이에요… 조심조심 😰" : "이대로면 연말에 계획 안이에요 👍");
        if (yp) a.push("올해 계획의 " + Math.round(pa / yp * 100) + "%를 썼어요 📈");
      }
      var h = new Date().getHours();
      a.push(h < 12 ? "좋은 아침이에요 ☀️" : h < 18 ? "오후도 힘내요 ☕" : "늦게까지 수고 많아요 🌙");
    } catch (e) { /* 자료가 없어도 그냥 인사 */ }
    return a;
  }
  function eggShow() {
    var box = $("egg");
    clearTimeout(eggTimer);
    var acts = ["jump", "dance", "coins", "spin", "wave"], act = acts[Math.floor(Math.random() * acts.length)], lines = eggLines();
    box.hidden = false;
    box.className = "egg on " + act;
    $("eggSay").textContent = lines[Math.floor(Math.random() * lines.length)];
    if (act === "coins") {
      $("eggCoins").innerHTML = range(12).map(function (i) { return '<i style="left:' + (8 + Math.random() * 84).toFixed(0) + "%;animation-delay:" + (Math.random() * 0.8).toFixed(2) + 's">💰</i>'; }).join("");
    } else $("eggCoins").innerHTML = "";
    eggTimer = setTimeout(eggHide, 5200);
    if (!box.dataset.b) {
      box.dataset.b = 1;
      box.addEventListener("click", function (e) { if (!e.target.closest("#eggBody")) eggHide(); }); // 빈 바탕을 누르면 바로 들어감 (캐릭터는 한 번 더)
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) eggHide(); });
    }
  }
  function eggHide() {
    var box = $("egg");
    if (box.hidden || box.classList.contains("bye")) return;
    clearTimeout(eggTimer);
    box.classList.add("bye");
    eggTimer = setTimeout(function () { box.hidden = true; box.className = "egg"; }, 450);
  }

  /* ---------- 매월 첫 실행: 지난 달 더존 자료가 아직이면 안내 (그 달에 한 번) ---------- */
  function monthRemind() {
    if (Store.readOnly() || dlg || !S.years.length) return;
    if (location.hash === "#opfs" && !localStorage.getItem("budget.remindTest")) return; // 자동 점검 중에는 끔
    var now = new Date(), ty = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), tm = now.getMonth() === 0 ? 12 : now.getMonth();
    var key = "budget.remind." + now.getFullYear() + "-" + (now.getMonth() + 1);
    try { if (localStorage.getItem(key)) return; } catch (e) { return; }
    if (S.years.indexOf(ty) < 0) return;
    var get = S.year === ty && X && X.year === ty ? Promise.resolve(X) : Store.loadExec(ty).catch(function () { return null; });
    get.then(function (x) {
      var m = x ? x.month : 0;
      if (m >= tm || dlg) return;
      try { localStorage.setItem(key, "1"); } catch (e) { /* 저장소 막힘 */ }
      var mm = (tm < 10 ? "0" : "") + tm;
      openDialog({
        title: tm + "월 더존 자료를 넣어 주세요", key: "remind", width: 600, okText: "지금 읽기", cancelText: "나중에",
        body: '<div class="mdl-pad msg remind"><div class="rm-ico">' + mascotSvg("rm-mascot") + '<span class="rm-bub">자료 주세요!</span></div><div><b>' + ty + "년 " + tm + "월</b> 마감 자료가 아직 반영되지 않았습니다 " + (m ? "(지금 " + m + "월까지 반영)" : "(아직 반영 없음)") + ".<br><br>" +
          "① 더존에서 <b>1/1 ~ " + tm + "월 말 누계</b>로 <b>분개장</b>과 <b>재무제표(손익)</b>를 받습니다<br>" +
          "② <b>(연결한 폴더)\\더존원본\\" + ty + "\\</b> 에 넣습니다 — 파일 이름에 월을 넣으세요 (예: 분개장_" + mm + "월.xls · 손익_" + mm + "월.xls)<br>" +
          "③ 집행 화면 <b>[더존 자료 읽기]</b><br><br><span class=\"mute\">이 안내는 매월 처음 켤 때 한 번만 나옵니다.</span></div></div>",
        onOk: function () {
          setTimeout(function () {
            var go = function () { setMode("exec"); xRead(); };
            if (S.year !== ty) switchYear(ty).then(go); else go();
          }, 0);
        }
      });
    });
  }

  /* ---------- 켰을 때로 되돌리기: 이번에 켰을 때(처음 연) 파일 그대로 — 지금 파일은 backup 에 먼저 남김 ---------- */
  function restoreStart() {
    var names = Object.keys(START.files).filter(function (n) { return START.files[n]; });
    if (!names.length) { toast("되돌릴 것이 없습니다"); return; }
    if (Store.readOnly()) { toast("보기 전용 창에서는 되돌릴 수 없습니다", true); return; }
    openDialog({
      title: "켰을 때로 되돌리기", key: "restore", width: 600, danger: true, okText: "되돌리기",
      body: '<div class="mdl-pad msg">이번에 프로그램을 켰을 때(<b>' + esc(START.at.slice(5, 16)) + "</b> 부터 처음 연 시점)의 파일로 되돌립니다.<br><br>" +
        names.map(function (n) { return "• data\\" + esc(n); }).join("<br>") +
        '<br><br>지금 파일은 먼저 <b>backup</b> 폴더에 남깁니다. 실행 취소 기록은 비워집니다.<br><span class="mute">켜고 나서 새로 만든 파일(새 연도 등)은 그대로 둡니다.</span></div>',
      onOk: function () {
        BUSY++;
        clearTimeout(saveTimer); savePending = false; masterDirty = false; XQ = {}; clearTimeout(xTimer);
        Store.idle().then(function () {
          return names.reduce(function (p, n) { return p.then(function () { return Store.writeRaw(n, START.files[n]); }); }, Promise.resolve());
        }).then(function () { return Store.loadMaster(); }).then(function (mst) {
          if (mst) { S.cat = mst.cat; S.ver = mst.ver; S.exclude = mst.exclude || []; ensureIds(S.cat); }
          YD = {};
          return PANES.reduce(function (p, q) { return p.then(function () { return withPane(q, function () { var y = S.year; if (!y) return; S.year = null; return loadYear(y); }); }); }, Promise.resolve());
        }).then(function () {
          SVS = {}; BUSY--; renderAll(); renderOthers(); renderSave();
          toast("켰을 때 상태로 되돌렸습니다 (지금 것은 backup 폴더에)", false, 5000);
        }).catch(function (e) { BUSY--; toast("되돌리지 못했습니다: " + (e && (e.message || e.name) || e), true, 6000); });
      }
    });
  }

  /* ---------- 같은 프로그램 창이 둘이면: 나중 창은 보기 전용 (서로 덮어쓰지 않게) ----------
     localStorage 에 '쓰는 창' 표시를 2초마다 새로 고침. 5초 넘게 소식 없으면 끝난 창으로 봄 */
  var WIN_ID = Math.random().toString(36).slice(2), ownTimer = null, autoTimer = null;
  function owner() { try { return JSON.parse(localStorage.getItem("budget.owner") || "null"); } catch (e) { return null; } }
  function claimOwner() { try { localStorage.setItem("budget.owner", JSON.stringify({ id: WIN_ID, ts: Date.now() })); } catch (e) { /* 저장소 막힘 */ } }
  function startOwner() {
    var o = owner();
    if (o && o.id !== WIN_ID && Date.now() - o.ts < 5000) setReadOnly(true); else { claimOwner(); setReadOnly(false); }
    clearInterval(ownTimer);
    ownTimer = setInterval(function () {
      var cur = owner();
      if (!Store.readOnly()) { if (cur && cur.id !== WIN_ID && Date.now() - cur.ts < 5000) setReadOnly(true); else claimOwner(); }
      else if (!cur || Date.now() - cur.ts > 5000) { claimOwner(); setReadOnly(false); toast("다른 창이 닫혀서 이 창에서 저장할 수 있게 됐습니다 — [다시 불러오기]로 최신 내용을 읽으세요", false, 6000); }
    }, 2000);
    window.addEventListener("pagehide", function () { var cur = owner(); if (cur && cur.id === WIN_ID) try { localStorage.removeItem("budget.owner"); } catch (e) { /* 저장소 막힘 */ } });
  }
  function setReadOnly(b) {
    Store.setReadOnly(b);
    $("roBanner").hidden = !b;
    document.body.classList.toggle("readonly", b);
    renderSave();
  }
  function takeOwner() {
    claimOwner(); setReadOnly(false);
    toast("이 창에서 저장합니다. 다른 창은 보기 전용이 됩니다 — 최신 내용을 읽으려면 [다시 불러오기]", false, 6000);
  }
  function openFolder() {
    startOwner();
    clearInterval(autoTimer);
    autoTimer = setInterval(function () { if (!dlg && !BUSY) saveAll("auto"); }, AUTO_EVERY);
    $("folderInfo").innerHTML = "연결된 폴더: <b>" + esc(Store.folderName()) + "</b><br>data · backup 폴더를 사용합니다";
    START.at = START.at || Store.stamp();
    return keepStart([Store.MASTER]).then(function () { return Promise.all([Store.loadMaster(), Store.listYears()]); }).then(function (res) {
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
        // 새 폴더: 기본 분류를 바로 기준정보.xlsx 로 저장 (안 하면 '저장할까요?'에서 안 함을 고를 때 분류 파일이 안 생김)
        if (!Store.readOnly()) { masterDirty = true; doSave(); }
      }
      S.years = res[1];
      fillYearSelect();
      return loadYearLocks().then(function () {
        if (!S.years.length) {
          cover("아직 계획 파일이 없습니다", "연결한 폴더 <code>" + esc(Store.folderName()) + "</code> 의 data 폴더에 사업비 계획 파일이 없습니다.<br>" +
            "분류는 " + (mst ? "기준정보.xlsx 의 분류" : "<b>기본 분류</b>(내부 자료 작성용 서식)") + " — " + esc(catCounts(S.cat)) + " 가 들어 있습니다.<br>" + (HAS_TEST ? "새 연도를 만들어 시작하거나, <b>2026년 테스트 데이터</b>(가짜 금액, 마감 · 변경까지)로 둘러보세요." : "<b>[새 연도 만들기]</b>로 시작하세요. 전년 실적은 만들 때 더존 손익 파일로 넣을 수 있습니다."), [
            { label: "새 연도 만들기", primary: true, fn: function () { hideCover(); newYearDialog(); } },
            HAS_TEST ? { label: "2026년 테스트 데이터로 시작", fn: function () { hideCover(); makeTest2026(); } } : null,
            { label: "다른 폴더 고르기", fn: askFolder }
          ].filter(Boolean));
          return;
        }
        hideCover();
        var last = 0;
        try { last = parseInt(localStorage.getItem("budget.lastYear"), 10); } catch (e) { last = 0; }
        try { PANE_SAVED = JSON.parse(localStorage.getItem("budget.panes") || "null"); } catch (e) { PANE_SAVED = null; }
        if (PANE_SAVED && PANE_SAVED.panes && PANE_SAVED.panes.length > 1 && S.years.indexOf(PANE_SAVED.panes[0].year) >= 0) last = PANE_SAVED.panes[0].year;
        return loadYear(S.years.indexOf(last) >= 0 ? last : S.years[S.years.length - 1]).then(function () { if (S.year) setMode(PANE_SAVED && PANE_SAVED.panes && PANE_SAVED.panes.length > 1 && PANE_SAVED.panes[0].mode === "plan" ? "plan" : "exec"); restorePanes(); setTimeout(monthRemind, 800); }); // 켜면 집행 화면부터 (분할은 지난번 그대로)
      });
    }).catch(function (e) {
      if (e && e.name === "NewerFormat") {
        clearInterval(autoTimer); Store.setReadOnly(true);
        cover("프로그램을 새 버전으로 바꿔 주세요", esc(e.message) + ".<br>지금 쓰는 프로그램이 자료보다 옛날 버전입니다. 자료를 지키기 위해 열지 않았습니다.<br>최신 <b>program</b> 폴더로 바꾼 뒤 다시 여세요. (자료 폴더는 그대로 두면 됩니다)", [
          { label: "다른 폴더 고르기", fn: askFolder }
        ]);
        return;
      }
      cover("폴더를 읽지 못했습니다", esc(e && e.message || String(e)) + "<br>폴더를 옮겼거나 지웠다면 다시 골라 주세요.", [
        { label: "폴더 다시 고르기", primary: true, fn: askFolder }
      ]);
    });
  }

  /* ---------- 2026년 테스트(더미) 데이터 ----------
     2026년 계획(전년 = 2025 실적, 원안 마감 + 1차 변경 마감) + 더존 손익 원데이터 양식 더미(2026년 1~12월)
     → 2027년 새 연도를 만들고 [전년 실적 가져오기]로 그 파일을 넣어 보며 테스트 */
  var APP_VER = "1.0.1"; // 프로그램 버전 (배포할 때마다 올림 · 설명서 · 첫 화면에 표시)
  var TEST_PL = "2026_손익_1-12월_테스트.xls";
  var HAS_TEST = typeof TestData !== "undefined"; // 배포판에는 testdata.js 가 없음 → 테스트 기능 숨김
  function testDataDialog() {
    if (!HAS_TEST) return;
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
      onOk: function () { setTimeout(function () { askSave(makeTest2026, "2026년 테스트 데이터를 만듭니다"); }, 0); }
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
      X.fmt = {};
      if (ids.pay) { X.fmt[ids.pay + "|a3"] = { bg: "#FAD2CF", b: 1 }; X.fmt[ids.pay + "|acc"] = { fg: "#B31412", b: 1, fs: 13 }; }
      if (ids.gy) X.fmt[ids.gy + "|d3"] = { bg: "#FFF2B3", i: 1 };
      if (ids.gy) X.memos["c|" + ids.gy + "|2"] = { text: "2월 조의금 2건", at: now.slice(0, 16), label: "복리후생비 › 경조금 2월" };
      xLog("반영: 3월까지 (" + jn.name + " + " + pl.name + ") · 테스트 데이터");
      return Store.saveExec(X, xRows(true).map(function (q) { return { id: q.id, l1: q.l1, l2: q.l2, l3: q.l3, m: q.act }; }), true);
    });
  }
  function makeTest2026() {
    BUSY++;
    detachS();
    if (!leafCount(S.cat)) { S.cat = baseCat(); ensureIds(S.cat); addVersion("기본 탑재", "테스트 데이터용"); }
    var list = TestData.items(S.cat), a25 = TestData.byLeaf(list, 2025);
    keepYearLock();
    S.year = 2026;
    S.settings = { dispUnit: "천원", rndUnit: "천원", rndMode: "반올림" };
    S.lock = { state: "draft", rounds: [] };
    S.plan = {}; S.fmt = {};
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
    // 확정 항목 · 계획 외 (분석 테스트용): 시기 차이 · 금액 차이 · 미집행 · 정상
    var act26 = function (code) { var it = list.filter(function (x) { return x.code === code; })[0]; return it ? TestData.months(it, 2026) : new Array(12).fill(0); };
    var r3 = function (v) { return Math.round(v / 1000) * 1000; };
    var addItems = function (re, items) { eachLeaf(S.cat, function (t, m, s, lf) { if (re.test(lf.name) && S.plan[lf.id] && !S.plan[lf.id].items.length) S.plan[lf.id].items = items; }); };
    addItems(/^직원급여$/, [{ id: "I1", name: "상반기 성과급", code: "80301", how: "일시", mo: 4, amt: r3(act26("80301")[2]), cond: { memo: "", ptn: "" }, memo: "4월 지급 예정이었으나 3월 지급 (시기 차이 테스트)" }]);
    addItems(/장애인고용부담금/, [{ id: "I1", name: "장애인고용부담금 신고 납부", code: "81702", how: "일시", mo: 1, amt: r3(act26("81702")[0] * 0.8), cond: { memo: "", ptn: "" }, memo: "금액 차이 테스트" }]);
    var gy = act26("81102"), gyY = gy.reduce(function (x, y) { return x + y; }, 0);
    addItems(/^경조금$/, [{ id: "I1", name: "조의금", code: "81102", how: "매월", amt: r3(gyY * 0.3 / 12), cond: { memo: "조의금", ptn: "" }, memo: "" }, { id: "I2", name: "축의금", code: "81102", how: "매월", amt: r3(gyY * 0.25 / 12), cond: { memo: "축의금", ptn: "" }, memo: "" }]);
    addItems(/회계감사수수료/, [{ id: "I1", name: "회계감사 수수료", code: "83104", how: "일시", mo: 2, amt: 8000000, cond: { memo: "감사", ptn: "" }, memo: "미집행 테스트 (적요에 '감사' 전표 없음)" }]);
    var rent = act26("81902");
    addItems(/임차,관리비\(지점\)/, [{ id: "I1", name: "지점 임차료", code: "81902", how: "매월", amt: r3(rent[0] * 0.55), cond: { memo: "임차료", ptn: "" }, memo: "" }]);
    eachLeaf(S.cat, function (t, m, s, lf) { if (lf.name === "차량시세" && S.plan[lf.id]) { var e = Calc.blankPlan(); e.prev = S.plan[lf.id].prev; e.pm = S.plan[lf.id].pm; e.out = true; S.plan[lf.id] = e; } });
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
    // 칸 서식 예시 (계획 화면)
    var fid = {}; eachLeaf(S.cat, function (t, m, s, lf) { if (!fid[lf.name]) fid[lf.name] = lf.id; });
    S.fmt = {};
    if (fid["직원급여"]) { S.fmt[fid["직원급여"] + "|plan"] = { bg: "#FFF2B3", b: 1 }; S.fmt[fid["직원급여"] + "|note"] = { fg: "#D93025", b: 1 }; }
    if (fid["학자금"]) { S.fmt[fid["학자금"] + "|m2"] = { bg: "#FDE7E5", fg: "#B31412", b: 1 }; S.fmt[fid["학자금"] + "|m8"] = { bg: "#FDE7E5", fg: "#B31412", b: 1 }; }
    S.fmt["g:복리후생비|acc"] = { fg: "#1A73E8", u: 1 };
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
        renderSave();
        toast("2026년 테스트 데이터를 만들었습니다 — 집행은 3월까지 반영돼 있고, [더존 자료 읽기]를 누르면 4월 파일이 들어갑니다 (3월 수정 2건)", false, 7000);
        BUSY--; savePanes(); renderOthers();
      }).catch(function (e) { BUSY--; toast("테스트 데이터를 만들지 못했습니다: " + (e && e.message || e), true, 6000); });
  }

  /* ======================================================================
     집행 화면
     X : 이 연도 집행 자료 (data\집행_연도.xlsx) — 판관비 분개장 줄(lines) · 반영 월 · 지난 달 수정 · 메모 · 문제 · 기록
     집행 금액 = 분개장 판관비 줄(차변 − 대변)을 분류의 더존 코드로 계정에 모아서 계산 (늘 다시 계산 → 분류를 바꾸면 바로 반영)
     ====================================================================== */
  var MODE = "plan";
  var X = null, PREVX = null, XJN = null; // XJN: 반영한 분개장 전체 줄 (전표 전체 보기용, 필요할 때 읽음)
  var XU = { view: "all", agg: "month", cmp: "plan", upto: 0, sort: null, quick: "", freeze: "acc", sel: null, cols: {}, hide: {}, itemOpen: {} };
  var xTimer = null, XL = null;
  function ensureX() { if (!X || X.year !== S.year) { X = blankX(S.year); XJN = null; } return X; }
  function blankX(y) { return { year: y, month: 0, at: "", src: { jn: "", pl: "" }, files: [], alerts: [], memos: {}, problems: [], log: [], lines: [], pins: {}, rules: [], fmt: {} }; }
  function xPath(y) { return "더존원본/" + (y || S.year); }
  function xLog(m) { X.log.push({ t: Store.stamp(), m: m }); if (X.log.length > 2000) X.log.shift(); }
  // 집행 저장: 연도마다 기다리는 내용(XQ)을 두고 0.5초 모아서. 내용(X · 보기용 집행 표)은 부르는 순간 것으로 고정
  var XQ = {};
  function xSave(lines, now) {
    if (!X || !X.year) return;
    var q = XQ[X.year] = XQ[X.year] || { lines: false };
    q.X = X; q.lines = q.lines || !!lines;
    q.rows = xRows(true).map(function (r) { return { id: r.id, l1: r.l1, l2: r.l2, l3: r.l3, m: r.act }; });
    clearTimeout(xTimer);
    renderSave();
    if (!now) xTimer = setTimeout(xFlush, 500);
    renderOthers();
  }
  function xFlush() {
    clearTimeout(xTimer);
    var ys = Object.keys(XQ);
    if (!ys.length) return Promise.resolve();
    return Promise.all(ys.map(function (y) {
      var q = XQ[y]; delete XQ[y];
      return svRun(Store.execName(y), function () { return Store.saveExec(q.X, q.rows, q.lines); }, function () { if (!XQ[y]) XQ[y] = q; else XQ[y].lines = XQ[y].lines || q.lines; xFlush(); });
    }));
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
  // 확정 항목 (계획 기준본: 마지막 마감본, 마감 전이면 지금 계획)
  function itemsOf(id, base) {
    base = base || planBase();
    var e = base.snap ? base.snap[id] : planFor(id);
    return e && e.items ? e.items : [];
  }
  function hasTxt(a, b) { return String(a || "").toLowerCase().indexOf(String(b).toLowerCase()) >= 0; }
  // 전표 줄 → 확정 항목 ID (null = 나머지). 순서: 직접 지정 > 규칙 > 항목 조건 (더존 코드 + 적요 · 거래처 글자)
  function lineItem(l, id, items) {
    if (!items.length) return null;
    var has = function (iid) { return iid === "rest" || items.some(function (it) { return it.id === iid; }); };
    var pin = X && X.pins && X.pins[lineKey(l)];
    if (pin && has(pin)) return pin === "rest" ? null : pin;
    var rs = (X && X.rules || []).filter(function (q) { return q.leaf === id && has(q.item) && (q.memo || q.ptn) && (!q.memo || hasTxt(l.memo, q.memo)) && (!q.ptn || hasTxt(l.ptn, q.ptn)); });
    if (rs.length) return rs[rs.length - 1].item === "rest" ? null : rs[rs.length - 1].item;
    var best = null, bs = -1;
    items.forEach(function (it) {
      var c = it.cond || {}, hc = !!(c.memo || c.ptn);
      if (it.code && it.code !== l.code) return;
      if (!it.code && !hc) return;
      if (c.memo && !hasTxt(l.memo, c.memo)) return;
      if (c.ptn && !hasTxt(l.ptn, c.ptn)) return;
      var sc = (it.code ? 1 : 0) + (hc ? 2 : 0);
      if (sc > bs) { bs = sc; best = it.id; }
    });
    return best;
  }
  // X.lines → {acts: {id:[12]}, cnt: {id:[12] 전표 건수}, un: {code:{code,name,m:[12],n}}, ex: [12], items: {id: {항목ID|_rest: [12]}}}
  function xCompute() {
    var ix = dzIndex(), acts = {}, cnt = {}, un = {}, ex = new Array(12).fill(0), base = planBase(), imap = {}, iacts = {}, icnt = {};
    (X ? X.lines : []).forEach(function (l) {
      var mi = l.m - 1;
      if (mi < 0 || mi > 11) return;
      if (ix.excluded(l)) { ex[mi] += l.amt; return; }
      var id = ix.leaf(l);
      if (id) {
        (acts[id] = acts[id] || new Array(12).fill(0))[mi] += l.amt;
        (cnt[id] = cnt[id] || new Array(12).fill(0))[mi]++;
        var its = imap[id] || (imap[id] = itemsOf(id, base));
        if (its.length) { var iid = lineItem(l, id, its) || "_rest", o = iacts[id] = iacts[id] || {}, oc = icnt[id] = icnt[id] || {}; (o[iid] = o[iid] || new Array(12).fill(0))[mi] += l.amt; (oc[iid] = oc[iid] || new Array(12).fill(0))[mi]++; }
        return;
      }
      var k = l.code || l.name, u = un[k] = un[k] || { code: l.code, name: l.name, m: new Array(12).fill(0), n: 0 };
      u.m[mi] += l.amt; u.n++;
    });
    return { acts: acts, cnt: cnt, un: un, ex: ex, items: iacts, icnt: icnt };
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
      out.push({ id: lf.id, l1: t.name, l2: m.name, l3: s ? s.name : "", name: lf.name, dz: lf.dz, out: !!p.out, plan: plan, act: act, n: C.cnt[lf.id] || new Array(12).fill(0), cmp: cmp, memo: p.memo, items: itemsOf(lf.id, base), itemActs: C.items[lf.id] || {}, itemCnt: C.icnt[lf.id] || {} });
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
    $("xTools").querySelectorAll("[data-xv]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-xv") === XU.view); });
    $("xTools").querySelectorAll("[data-xa]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-xa") === XU.agg); });
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
    xStatus(rows, M);
  }
  function xStatus(rows, M) {
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
    var M = X ? X.month : 0, sm = function (a, f, t) { var v = 0; for (var i = f; i <= t; i++) v += a[i - 1] || 0; return v; };
    var yp = 0, pa = 0, pp = 0, ma = 0, mp = 0, prevM = 0, prevOk = 0, fc = 0, over = 0, un = Object.keys(XL.C.un).length, al = X.alerts.filter(function (a) { return a.state !== "정상"; }).length, judged = 0;
    rows.forEach(function (r) {
      yp += sum12(r.plan); fc += xForecast(r);
      if (!M) return;
      pa += sm(r.act, 1, M); pp += sm(r.plan, 1, M); ma += r.act[M - 1]; mp += r.plan[M - 1];
      var pm = planFor(r.id).pm; if (pm && pm.length === 12) { prevM += pm[M - 1]; prevOk++; }
      if (sm(r.act, 1, M) - sm(r.plan, 1, M) > 0) over++;
      if (r.items.length) itemSubs(r).forEach(function (o) { if (o.judge) judged++; });
    });
    if (!M) {
      $("kpis").innerHTML = '<div class="sl">' + sumSeg("연간 계획", "<b class=\"big\">" + u(yp, true) + "</b> · " + esc(XL.base.label) + " 기준 · 계획 있는 계정 " + rows.filter(function (r) { return sum12(r.plan); }).length + " / " + rows.length) + '<span class="su">단위: ' + unitName() + "</span></div>" +
        '<div class="sl">' + sumSeg("집행", '아직 반영한 더존 자료가 없습니다 <button class="btn sm" data-act="xRead">더존 자료 읽기</button>') + "</div>";
      return;
    }
    var d = pa - pp, rate = yp ? pa / yp : NaN, pace = M / 12, dm = ma - mp;
    var tops = rows.map(function (r) { return { r: r, d: r.act[M - 1] - r.plan[M - 1], b: r.plan[M - 1] }; }).filter(function (x) { return x.d > 0; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 3);
    var paceTxt = !isFinite(rate) ? "" : rate > pace + 0.05 ? '<b class="upc">빠름</b>' : rate < pace - 0.05 ? '<b class="dnc">느림</b>' : "적정";
    var chips = [["over", "초과 " + over], ["warn", "지난 달 수정 " + al]].map(function (c) { return '<a class="sa warn" data-sq="' + c[0] + '">' + c[1] + "</a>"; }).join(" · ") + (judged ? " · 항목 판정 " + judged : "") + (un ? ' · <a class="sa warn" data-act="xRead">미연결 ' + un + "</a>" : "");
    $("kpis").innerHTML = '<div class="sl"><span class="sh">누계 1~' + M + "월</span>" +
      sumSeg("집행", "<b class=\"big\">" + u(pa, true) + "</b> · 계획 " + u(pp, true) + " · 계획 대비 <b class=\"" + (d > 0 ? "upc" : d < 0 ? "dnc" : "") + "\">" + (pp ? pctTxt(d / pp, true) : "-") + "</b> <small>(" + (d > 0 ? "초과 " : d < 0 ? "절감 " : "") + u(Math.abs(d), true) + ")</small>") +
      sumSeg("연간 집행률", "<b>" + pctTxt(rate) + "</b> · 시간 " + pctTxt(pace) + " 지남 → " + paceTxt) +
      sumSeg("연말 예상", "<b>" + u(fc, true) + "</b> · 연간 계획 " + u(yp, true) + (fc > yp ? ' · <b class="upc">초과 예상 ' + u(fc - yp, true) + "</b>" : " · 계획 안")) + '<span class="su">단위: ' + unitName() + "</span></div>" +
      '<div class="sl"><span class="sh">이번 달 ' + M + "월</span>" +
      sumSeg("집행", "<b class=\"big\">" + u(ma, true) + "</b> · 계획 대비 <b class=\"" + (dm > 0 ? "upc" : dm < 0 ? "dnc" : "") + "\">" + (mp ? pctTxt(dm / mp, true) : "-") + "</b> <small>(" + dTxt(dm) + ")</small>" + (prevOk && prevM ? " · 전년 " + M + "월 대비 <b>" + pctTxt(ma / prevM - 1, true) + "</b>" : "")) +
      sumSeg("많이 넘은 계정", tops.length ? tops.map(function (x) { return sumAcc(x.r, x.d, x.b); }).join(" · ") : "없음") +
      sumSeg("확인할 것", chips) + "</div>";
  }

  /* ---------- 집행 표 열 (묶음 단위) ----------
     묶음: yp 연간 계획 · t 누계 · rate 집행률 · m1~m12 월 · q1~q4 분기 · h1 h2 반기 (월 · 분기 · 반기 · 누계 묶음 = 계획 · 집행 · 증감 3칸)
     누계 보기: yp · cc 비교 누계 · ca 집행 누계 · cd 증감 · cr 증감률 · rate · left 잔여 예산 · fc 연말 예상
     칸 키: 월 c3 a3 d3 · 누계 ct at dt · 분기 cq2 aq2 dq2 · 반기 ch1 ah1 dh1 */
  var XBLK = {
    month: ["yp", "t", "rate"].concat(range(12).map(function (m) { return "m" + m; })),
    q: ["yp", "t", "rate", "q1", "q2", "q3", "q4"],
    h: ["yp", "t", "rate", "h1", "h2"],
    cum: ["yp", "cc", "ca", "cd", "cr", "rate", "left", "fc"]
  };
  function isTri(b) { return /^(m\d+|q\d|h\d|t)$/.test(b); }
  function xBlocks() { return orderOf(XBLK[XU.agg] || XBLK.month, XU.cols[XU.agg]); }
  function xShown() { var hd = XU.hide[XU.agg] || {}; return xBlocks().filter(function (b) { return !hd[b]; }); }
  // 묶음의 달 (1~12). 누계 = 1~기준 월
  function blkMonths(b, U) {
    if (/^m\d/.test(b)) return [+b.slice(1)];
    if (/^q\d/.test(b)) { var q = +b.slice(1); return [3 * q - 2, 3 * q - 1, 3 * q]; }
    if (b === "h1") return [1, 2, 3, 4, 5, 6];
    if (b === "h2") return [7, 8, 9, 10, 11, 12];
    return range(U || xUpto());
  }
  function xKey(s, b) { return s + (/^m\d/.test(b) ? b.slice(1) : b); }
  function parseXK(k) {
    var m = /^([cad])(\d+)$/.exec(k);
    if (m) return { s: m[1], b: "m" + m[2] };
    m = /^([cad])(t|q\d|h\d)$/.exec(k);
    return m ? { s: m[1], b: m[2] } : null;
  }
  function subsOf() { return XU.view === "all" ? ["c", "a", "d"] : XU.view === "plan" ? ["c"] : XU.view === "act" ? ["a"] : ["d"]; }
  function xKeys() {
    var ks = [];
    xShown().forEach(function (b) { if (isTri(b) && XU.agg !== "cum") subsOf().forEach(function (s) { ks.push(xKey(s, b)); }); else ks.push(b); });
    return ks;
  }
  function blkName(b, U, M) {
    if (/^m\d/.test(b)) return b.slice(1) + "월";
    if (b === "t") return M ? "누계 (1~" + (U || M) + "월)" : "연간 (집행 반영 전)";
    var n = { q1: "1분기", q2: "2분기", q3: "3분기", q4: "4분기", h1: "상반기", h2: "하반기", yp: "연간 계획", rate: "집행률", left: "잔여 예산", fc: "연말 예상", cc: CMP[XU.cmp], ca: "집행", cd: "증감", cr: "증감률" }[b] || b;
    if (/^[qh]\d/.test(b) && M) { var ms = blkMonths(b), dn = ms.filter(function (x) { return x <= M; }).length; if (dn && dn < ms.length) n += " · 진행 중"; }
    return n;
  }
  // 칸 값: {v, pl(계획 칸), act(집행 칸, ms 집행한 달), diff(증감 기준), pct, warn}
  function xCell(o, k, U, M) {
    var yp = sum12(o.plan), p = parseXK(k);
    if (p) {
      var ms = blkMonths(p.b, U), done = ms.filter(function (m) { return m <= M; });
      var sm = function (a, list) { var t = 0; list.forEach(function (m) { t += a[m - 1] || 0; }); return t; };
      if (p.s === "c") return { v: sm(o.cmp, ms), pl: true };
      if (p.s === "a") return { v: done.length ? sm(o.act, done) : null, act: true, ms: done, b: p.b };
      var cd = sm(o.cmp, done);
      return { v: done.length ? sm(o.act, done) - cd : null, diff: cd };
    }
    var cumC = sum12(o.cmp, U), cumA = sum12(o.act, U);
    if (!M && /^(ca|cd|cr)$/.test(k)) return { v: null };
    if (k === "rate") return { v: yp && M ? sum12(o.act, M) / yp : NaN, pct: true };
    if (k === "yp") return { v: yp };
    if (k === "left") return { v: yp - cumA };
    if (k === "fc") return { v: o.fc, warn: yp && o.fc > yp };
    if (k === "cc") return { v: cumC, pl: true };
    if (k === "ca") return { v: cumA, act: true, ms: range(Math.min(U, M)), b: "t" };
    if (k === "cd") return { v: cumA - cumC, diff: cumC };
    if (k === "cr") return { v: cumC ? (cumA - cumC) / Math.abs(cumC) : NaN, pct: true, sign: true };
    return { v: 0 };
  }
  function xKeyName(k) {
    var p = parseXK(k);
    if (p) return blkName(p.b, xUpto(), X ? X.month : 0) + " " + { c: XU.cmp === "plan" ? "계획" : XU.cmp === "prev" ? "전년" : "평균", a: "집행", d: "증감" }[p.s];
    return blkName(k, xUpto(), X ? X.month : 0);
  }
  var HLM = null; // 강조한 전표가 있는 계정|월
  function hlMap() {
    HLM = null;
    var ks = Object.keys(X.fmt || {}).filter(function (k) { return k.indexOf("L|") === 0; });
    if (!ks.length) return;
    var want = {}; ks.forEach(function (k) { want[k.slice(2).split("|").slice(0, 5).join("|")] = 1; });
    var ix = dzIndex(); HLM = {};
    X.lines.forEach(function (l) { if (want[lineKey(l)]) { var id = ix.leaf(l); if (id) HLM[id + "|" + l.m] = 1; } });
  }
  function renderXTable(rows, U, M) {
    hlMap();
    var el = $("tblX"), cum = XU.agg === "cum", blocks = xShown(), subs = subsOf(), two = !cum && subs.length > 1 && blocks.some(isTri);
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
      var o = { plan: new Array(12).fill(0), act: new Array(12).fill(0), cmp: new Array(12).fill(0), n: new Array(12).fill(0), fc: 0 };
      list.forEach(function (r) { for (var i = 0; i < 12; i++) { o.plan[i] += r.plan[i]; o.act[i] += r.act[i]; o.cmp[i] += r.cmp[i]; o.n[i] += r.n[i]; } o.fc += r.fc; });
      return o;
    };
    var sk = XU.sort && XU.sort.k, sd = XU.sort ? XU.sort.dir : 1, sv = function (o) { var c = xCell(o, sk, U, M); return c.v === null || isNaN(c.v) ? NaN : c.v; };
    var mark = function (k) { return sk === k ? '<span class="sorti">' + (sd > 0 ? "▲" : "▼") + "</span>" : ""; };
    var per = function (b) { return isTri(b) || b === "yp" || b === "cc" || b === "ca"; };
    var tip = function (b) { return per(b) ? ' title="누르면 ' + esc(blkName(b, U, M)) + ' 분석 · 끌어서 열 순서 바꾸기 · 우클릭 = 정렬 · 숨기기"' : ' title="끌어서 열 순서 바꾸기 · 우클릭 = 정렬 · 숨기기"'; };
    var fut = function (b) { return M && isTri(b) && blkMonths(b, U).every(function (m) { return m > M; }); };
    var noDrag = !!(XU.sort || UI.search || XU.quick || UI.nav.t);
    var h = ['<table class="plan xt"><thead><tr><th class="c-acc" rowspan="' + (two ? 2 : 1) + '" data-k="acc">계정</th>'];
    blocks.forEach(function (b) {
      var cls = "mstart" + (per(b) ? " per" : "") + (fut(b) ? " fut" : "");
      if (isTri(b) && !cum) {
        if (two) h.push('<th class="mh ' + cls + '" colspan="' + subs.length + '" data-b="' + b + '" draggable="true"' + tip(b) + ">" + esc(blkName(b, U, M)) + "</th>");
        else { var k1 = xKey(subs[0], b); h.push('<th class="' + cls + '" data-k="' + k1 + '" data-b="' + b + '" draggable="true"' + tip(b) + ">" + esc(blkName(b, U, M)) + (subs[0] !== "c" || XU.view !== "plan" ? "" : "") + mark(k1) + "</th>"); }
      } else h.push('<th class="' + cls + '" rowspan="' + (two ? 2 : 1) + '" data-k="' + b + '" data-b="' + b + '" draggable="true"' + tip(b) + ">" + esc(blkName(b, U, M)) + (b === "cc" || b === "ca" ? "<br><small>1~" + U + "월</small>" : "") + mark(b) + "</th>");
    });
    h.push("</tr>");
    if (two) {
      h.push("<tr>");
      blocks.forEach(function (b) { if (isTri(b)) subs.forEach(function (s, i) { var k = xKey(s, b); h.push('<th class="sub' + (i === 0 ? " mstart" : "") + '" data-k="' + k + '">' + { c: XU.cmp === "plan" ? "계획" : XU.cmp === "prev" ? "전년" : "평균", a: "집행", d: "증감" }[s] + mark(k) + "</th>"); }); });
      h.push("</tr>");
    }
    h.push("</thead><tbody>");
    var ks = xKeys(), starts = {};
    blocks.forEach(function (b) { if (isTri(b) && !cum) starts[xKey(subs[0], b)] = 1; else starts[b] = 1; });
    if (sk) groups.sort(function (a, b) { return sd * cmpVal(sv(agg(a.rows)), sv(agg(b.rows))); });
    var totalRow = function () { var tot = agg(rows.filter(xVisible)); return '<tr class="total ttop"><td class="c-acc" data-k="acc">합계</td>' + ks.map(function (k) { return cellHtml(tot, k, false); }).join("") + "</tr>"; };
    var cellHtml = function (o, k, row) {
      var c = xCell(o, k, U, M), cls = "num", txt;
      if (c.v === null) return '<td class="num fut' + (starts[k] ? " mstart" : "") + '" data-k="' + k + '"></td>';
      if (c.pct) txt = isNaN(c.v) ? "-" : (c.sign && c.v > 0 ? "+" : "") + (c.v * 100).toFixed(1) + "%";
      else if (c.diff !== undefined) { txt = c.v ? sgn(c.v) : "-"; cls += " " + dcls(c.v, c.diff); }
      else txt = u(c.v);
      if (c.pl) cls += " pl";
      if (starts[k]) cls += " mstart";
      if (c.act) {
        cls += " lnk";
        var nt = cntTxt(o, c.ms);
        if (row) {
          var mk = X.memos[memoKeyOf(o.id, c.b)];
          if (mk) cls += " hasmemo";
          if (HLM && c.ms && c.ms.some(function (m) { return HLM[o.id + "|" + m]; })) cls += " hlmark";
          if (c.ms && rowAlerts(o.id).some(function (a) { return c.ms.indexOf(a.m) >= 0; })) cls += " chgd";
          return '<td class="' + cls + '" data-k="' + k + '"' + (mk ? ' data-memo="' + esc("[" + nt + "] " + mk.text) + '"' : ' title="' + nt + ' · 누르면 내역"') + ">" + txt + "</td>";
        }
        return '<td class="' + cls + '" data-k="' + k + '" title="' + nt + '">' + txt + "</td>";
      }
      if (c.warn) { cls += " r1"; txt += " ⚠"; }
      if (k === "rate" && !isNaN(c.v) && M) {
        var hot = c.v > M / 12 + 0.05;
        return '<td class="' + cls + ' ratec" data-k="rate" title="연간 계획 대비 집행 ' + txt + " · 시간 " + Math.round(M / 12 * 100) + '% 지남"><div class="rbar"><i class="' + (hot ? "hot" : "") + '" style="width:' + Math.max(0, Math.min(100, c.v * 100)).toFixed(1) + '%"></i><s style="left:' + (M / 12 * 100).toFixed(1) + '%"></s></div><span>' + txt + "</span></td>";
      }
      return '<td class="' + cls + '" data-k="' + k + '">' + txt + "</td>";
    };
    var shown = 0;
    h.push(totalRow());
    groups.forEach(function (g) {
      var list = g.rows.filter(xVisible);
      if (!list.length) return;
      if (sk) list.sort(function (a, b) { return sd * cmpVal(sv(a), sv(b)); });
      var ga = agg(g.rows), shut = !!UI.collapsed["x|" + g.name] && !UI.search;
      h.push('<tr class="grp" data-grp="' + esc(g.name) + '"><td class="c-acc" data-k="acc">' + (noDrag ? "" : '<span class="grip ggrip" draggable="true" title="끌어서 대분류 순서 바꾸기">⋮⋮</span>') +
        '<span class="caret" title="접기 · 펴기">' + (shut ? "▸" : "▾") + '</span><span class="gname" data-an="t" title="누르면 ' + esc(g.name) + ' 분석">' + esc(g.name) + '</span><span class="cnt">' + g.rows.length + "</span></td>" +
        ks.map(function (k) { return cellHtml(ga, k, false); }).join("") + "</tr>");
      if (shut) return;
      list.forEach(function (r) {
        shown++;
        var al = rowAlerts(r.id).length;
        h.push('<tr class="acc' + (r.out ? " out" : "") + (XU.sel === r.id ? " is-sel" : "") + '" data-id="' + esc(r.id) + '"><td class="c-acc" data-k="acc">' + (noDrag ? '<span class="grip off"></span>' : '<span class="grip" draggable="true" title="끌어서 순서 바꾸기 (같은 상위 안)">⋮⋮</span>') +
          accName(r) + (r.items.length ? '<span class="itg" data-itg="1" title="확정 항목 보기 · 접기">' + (XU.itemOpen[r.id] ? "▾" : "▸") + " 항목 " + r.items.length + "</span>" : "") +
          (r.dz.length ? '<span class="erp" title="더존: ' + esc(r.dz.map(dzText).join(", ")) + '">' + esc(dzShort(r.dz)) + "</span>" : "") +
          (r.out ? '<span class="flag outf">계획 외</span>' : "") +
          (al ? '<span class="warnico" data-xwarn="' + esc(r.id) + '" title="지난 달 수정 ' + al + '건 — 누르면 확인">⚠</span>' : "") + "</td>" +
          ks.map(function (k) { return cellHtml(r, k, true); }).join("") + "</tr>");
        if (r.items.length && XU.itemOpen[r.id]) itemSubs(r).forEach(function (o) {
          h.push('<tr class="itm' + (o.iid === "_rest" ? " rest" : "") + '" data-of="' + esc(r.id) + '" data-iid="' + esc(o.iid) + '"><td class="c-acc" data-k="acc"><span class="grip off"></span><span class="itn">└ ' + esc(o.name) + '</span><span class="itt">' + esc(o.tag) + "</span>" +
            (o.judge ? '<span class="flag ' + o.judge.cls + '" title="' + esc(o.judge.t) + '">' + o.judge.k + "</span>" : "") + "</td>" + ks.map(function (k) { return cellHtml(o, k, false); }).join("") + "</tr>");
        });
      });
    });
    // 미연결 더존 과목 (분류에 없음)
    var un = XL.C.un, uk = Object.keys(un);
    if (uk.length) {
      h.push('<tr class="grp unl"><td class="c-acc" data-k="acc">⚠ 미연결 더존 과목 <span class="cnt">' + uk.length + '</span> <button class="btn sm" data-act="xRead">정리</button></td>' + ks.map(function () { return "<td></td>"; }).join("") + "</tr>");
      uk.forEach(function (k) {
        var x = un[k], o = { act: x.m, cmp: new Array(12).fill(0), plan: new Array(12).fill(0), fc: sum12(x.m) };
        h.push('<tr class="acc unl"><td class="c-acc"><span class="l3">' + esc(dzText(x)) + '</span><span class="cnt">' + x.n + "줄</span></td>" + ks.map(function (kk) { var c = xCell(o, kk, U, M); return '<td class="num">' + (c.act && c.v !== null ? u(c.v) : "") + "</td>"; }).join("") + "</tr>");
      });
    }
    h.push("</tbody></table>");
    if (!shown) h.push('<div class="empty">조건에 맞는 계정이 없습니다.</div>');
    var top = el.scrollTop, left = el.scrollLeft;
    el.innerHTML = h.join("");
    // 머리글 2줄: 아랫줄(계획 · 집행 · 증감)은 윗줄 바로 밑에 고정 (안 하면 스크롤할 때 윗줄 위로 올라가 집행률 칸과 어긋남)
    var hr = el.querySelectorAll("thead tr");
    if (hr.length > 1) { var h1 = hr[0].getBoundingClientRect().height; hr[1].querySelectorAll("th").forEach(function (th) { th.style.top = h1 + "px"; }); }
    stickTotal(el);
    el.scrollTop = top; el.scrollLeft = left;
    fmtPaint(el, X.fmt, "exec");
    xFreeze();
  }
  // 확정 항목 줄 (계정 아래): 항목마다 계획 · 집행 + 나머지
  // 집행 칸 툴팁: 전표 건수 (한 달이면 그 달, 여러 달이면 기간)
  function cntTxt(o, ms) {
    if (!o.n || !ms || !ms.length) return "전표 0건";
    var t = 0; ms.forEach(function (m) { t += o.n[m - 1] || 0; });
    return "전표 " + t.toLocaleString() + "건" + (ms.length > 1 ? " (" + ms[0] + "~" + ms[ms.length - 1] + "월)" : " (" + ms[0] + "월)");
  }
  function itemSubs(r) {
    var M = X ? X.month : 0, z = new Array(12).fill(0), out = [], ip = new Array(12).fill(0);
    r.items.forEach(function (it) {
      var pl = Calc.itemMonths(it), ac = r.itemActs[it.id] || z;
      pl.forEach(function (v, i) { ip[i] += v; });
      var o = { id: r.id, iid: it.id, name: it.name, tag: itemTag(it, r), plan: pl, act: ac, n: r.itemCnt[it.id] || z, cmp: XU.cmp === "plan" ? pl : z };
      o.fc = xForecast(o); o.judge = itemJudge(pl, ac, M);
      out.push(o);
    });
    var rp = r.plan.map(function (v, i) { return v - ip[i]; }), ra = r.itemActs._rest || z, ro = { id: r.id, iid: "_rest", name: "나머지", tag: "확정 항목 외", plan: rp, act: ra, n: r.itemCnt._rest || z, cmp: XU.cmp === "plan" ? rp : z };
    ro.fc = xForecast(ro);
    out.push(ro);
    return out;
  }
  // 확정 항목 판정: 미집행 · 시기 차이 · 금액 차이 (1~반영 월 기준)
  function itemJudge(pl, ac, M) {
    if (!M) return null;
    var cfg = anaCfg(), sm = function (a, f, t) { var s0 = 0; for (var i = f; i <= t; i++) s0 += a[i - 1] || 0; return s0; };
    var planY = sm(pl, 1, M), actY = sm(ac, 1, M), restPlan = sm(pl, M + 1, 12);
    var pm = range(12).filter(function (m) { return pl[m - 1]; }), am = range(M).filter(function (m) { return ac[m - 1]; });
    var mt = function (list) { return list.map(function (m) { return m + "월"; }).join("·"); };
    if (planY >= cfg.min && !actY) return { k: "미집행", cls: "warnf", t: mt(pm.filter(function (m) { return m <= M; })) + " 계획 " + Calc.fmtWon(planY) + "원인데 집행 없음" };
    if (!planY && actY >= cfg.min) return { k: "시기 차이", cls: "infof", t: "계획은 " + (pm.length ? mt(pm) : "없음") + "인데 " + mt(am) + "에 " + Calc.fmtWon(actY) + "원 집행 (앞당김)" };
    if (planY && Math.abs(actY - planY) >= cfg.min) {
      if (actY > planY && restPlan > 0 && actY - planY <= restPlan * 1.02) return { k: "시기 차이", cls: "infof", t: "1~" + M + "월 계획보다 " + Calc.fmtWon(actY - planY) + "원 많지만 뒤 달 계획분(" + Calc.fmtWon(restPlan) + "원) 앞당김으로 보임" };
      return { k: "금액 차이", cls: "chgf", t: "1~" + M + "월 계획 " + Calc.fmtWon(planY) + "원 → 집행 " + Calc.fmtWon(actY) + "원 (" + (actY > planY ? "+" : "") + Calc.fmtWon(actY - planY) + ")" };
    }
    if (planY && actY && mt(pm.filter(function (m) { return m <= M; })) !== mt(am)) return { k: "시기 차이", cls: "infof", t: "계획 " + mt(pm.filter(function (m) { return m <= M; })) + " → 집행 " + mt(am) + " (금액은 비슷)" };
    return null;
  }
  // 합계 줄을 머리글 바로 밑에 고정
  function stickTotal(el) {
    var tr = el.querySelector("tr.total.ttop"), th = el.querySelector("thead");
    if (!tr || !th) return;
    var hh = th.getBoundingClientRect().height;
    tr.querySelectorAll("td").forEach(function (td) { td.style.top = hh + "px"; });
  }
  // 칸 메모 키: 월 = c|ID|월번호, 분기 · 반기 · 누계 = c|ID|q2 · h1 · t (예전 0 = 누계)
  function memoKeyOf(id, b) { return "c|" + id + "|" + (/^m\d/.test(b) ? b.slice(1) : b === "t" && X && X.memos["c|" + id + "|0"] ? "0" : b); }
  // 틀 고정: 계정 열부터 XU.freeze 칸까지 (묶음 머리글은 그 칸들이 다 고정되면 같이)
  function xFreeze() {
    if (!XU.freeze || XU.freeze === "acc") return;
    var t = $("tblX"), tr = t.querySelector("tbody tr.grp") || t.querySelector("tbody tr");
    if (!tr) return;
    var tds = tr.children, left = 0, lefts = {}, order = [];
    for (var i = 0; i < tds.length; i++) {
      var k = tds[i].getAttribute("data-k");
      if (!k) break;
      lefts[k] = left; order.push(k); left += tds[i].offsetWidth;
      if (k === XU.freeze) break;
    }
    if (order[order.length - 1] !== XU.freeze) return;
    order.forEach(function (k) {
      if (k === "acc") return;
      t.querySelectorAll('[data-k="' + k + '"]').forEach(function (c) { c.classList.add("fz"); c.style.left = lefts[k] + "px"; if (k === XU.freeze) c.classList.add("fz-last"); });
    });
    t.querySelectorAll("th.mh[data-b]").forEach(function (th) {
      var b = th.getAttribute("data-b"), first = xKey(subsOf()[0], b), last = xKey(subsOf()[subsOf().length - 1], b);
      if (lefts[first] !== undefined && order.indexOf(last) >= 0) { th.classList.add("fz"); th.style.left = lefts[first] + "px"; }
    });
  }

  /* ======================================================================
     분석 팝업
     · 분류 분석 (분류 이름 클릭): 대분류 · 중분류 · 계정 — 집행 화면은 계획 대비 집행, 계획 화면은 전년 실적 대비 계획
     · 기간 분석 (머리글 클릭): 월 · 분기 · 반기 · 누계 · 연간 — 전체 계정
     팝업 위 기간 바로 기간을 바꾸고, 하위 분류를 누르면 그 분류로 내려감 (◀ 뒤로)
     ====================================================================== */
  var ANA_DEF = { spike: 50, big: 50, plan: 30, min: 100000 };
  function anaCfg() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem("budget.ana") || "{}") || {}; } catch (e) { c = {}; }
    Object.keys(ANA_DEF).forEach(function (k) { if (!(Calc.num(c[k]) > 0)) c[k] = ANA_DEF[k]; });
    return c;
  }
  function anaCfgDialog(after) {
    var c = anaCfg();
    var f = function (k, label, unit, tip) { return '<div class="f-row"><label>' + label + '</label><div class="withunit"><input class="inp num" id="ac_' + k + '" value="' + (k === "min" ? Calc.fmtWon(c[k]) : c[k]) + '"><small>' + unit + "</small></div><span class=\"mute\" style=\"margin-left:8px\">" + tip + "</span></div>"; };
    openDialog({
      title: "분석 기준값", key: "anacfg", width: 620, okText: "저장",
      body: '<div class="mdl-pad">' + f("spike", "튀는 달", "% 이상", "그 계정 다른 달 평균보다 ± 이만큼") + f("big", "큰 단건", "% 이상", "전표 한 건이 그 달 집행에서 차지하는 비중") +
        f("plan", "계획 큰 증감", "% 이상", "계획이 전년 실적보다 ± 이만큼") + f("min", "최소 금액", "원", "이 금액보다 작은 차이 · 전표는 확인 포인트에서 뺌") +
        '<div class="pv-note">확인 포인트는 이 기준으로 자동으로 찾습니다. 이 PC에 저장됩니다.</div></div>',
      onOk: function () {
        var o = {};
        Object.keys(ANA_DEF).forEach(function (k) { o[k] = Calc.num($("ac_" + k).value) || ANA_DEF[k]; });
        try { localStorage.setItem("budget.ana", JSON.stringify(o)); } catch (e) { /* 저장소 막힘 */ }
        toast("분석 기준값을 저장했습니다");
        if (after) setTimeout(after, 0);
      }
    });
  }

  // 분석 대상 (분류 노드) → {lv, label, path, ids, kids:[{label, node}]}
  function anaScope(scr, node) {
    var used = {};
    (scr === "plan" ? S.rows : xRows(true)).forEach(function (r) { used[r.id] = 1; });
    var leavesOf = function (n) { var o = []; if (n.kids && n.kids.length) n.kids.forEach(function (k) { o = o.concat(leavesOf(k)); }); else if (used[n.id]) o.push(n.id); return o; };
    if (node.lv === "all") return { lv: "all", label: "전체", path: "전체", ids: Object.keys(used).filter(function (id) { return findLeaf(id); }).sort(function (a, b) { return leafOrder(a) - leafOrder(b); }),
      kids: S.cat.map(function (t) { return { label: t.name, node: { lv: "t", name: t.name } }; }) };
    if (node.lv === "t") {
      var t = topBy(node.name);
      if (!t) return null;
      return { lv: "t", label: t.name, path: t.name, ids: leavesOf(t), kids: t.kids.map(function (m) { return { label: m.name, node: isLeafMid(m) ? { lv: "leaf", id: m.id } : { lv: "m", id: m.kids[0] && m.kids[0].id, mid: m.id } }; }) };
    }
    var h = findLeaf(node.id);
    if (!h && node.mid) S.cat.forEach(function (t) { t.kids.forEach(function (m) { if (m.id === node.mid && m.kids && m.kids[0]) h = findLeaf(m.kids[0].id); }); });
    if (!h) return null;
    if (node.lv === "m" && h.sub) return { lv: "m", label: h.mid.name, path: h.top.name + " › " + h.mid.name, ids: leavesOf(h.mid), up: { lv: "t", name: h.top.name }, kids: h.mid.kids.map(function (x) { return { label: x.name, node: { lv: "leaf", id: x.id } }; }) };
    return { lv: "leaf", label: h.leaf.name, path: leafPath(h), ids: [h.leaf.id], up: h.sub ? { lv: "m", id: h.leaf.id } : { lv: "t", name: h.top.name }, kids: [], leaf: h.leaf };
  }
  var LEAF_ORD = null;
  function leafOrder(id) { if (!LEAF_ORD) { LEAF_ORD = {}; var n = 0; eachLeaf(S.cat, function (t, m, s, lf) { LEAF_ORD[lf.id] = n++; }); setTimeout(function () { LEAF_ORD = null; }, 0); } return LEAF_ORD[id] === undefined ? 1e9 : LEAF_ORD[id]; }

  // 기간 {k, label, months}: m3 · q2 · h1 · cum(1~N) · y(연간) · c:a-b (직접)
  function anaPer(k, M) {
    var mm;
    if (/^m\d+$/.test(k)) return { k: k, label: k.slice(1) + "월", months: [+k.slice(1)] };
    if (/^q\d$/.test(k)) { var q = +k.slice(1); return { k: k, label: q + "분기", months: [3 * q - 2, 3 * q - 1, 3 * q] }; }
    if (k === "h1") return { k: k, label: "상반기", months: range(6) };
    if (k === "h2") return { k: k, label: "하반기", months: [7, 8, 9, 10, 11, 12] };
    if ((mm = /^c:(\d+)-(\d+)$/.exec(k))) { var a = Math.max(1, Math.min(12, +mm[1])), b = Math.max(a, Math.min(12, +mm[2])), o = []; for (var i = a; i <= b; i++) o.push(i); return { k: k, label: a + "~" + b + "월", months: o }; }
    if (k === "cum" && M) return { k: k, label: "누계 1~" + M + "월", months: range(M) };
    return { k: "y", label: "연간", months: range(12) };
  }
  function prevPer(per) {
    var mm = /^([mqh])(\d+)$/.exec(per.k);
    if (!mm || +mm[2] <= 1) return null;
    return anaPer(mm[1] + (+mm[2] - 1));
  }
  function anaNode(scr, node) {
    if (!S.year) return;
    var M = X ? X.month : 0;
    var k = scr === "plan" ? "y" : XU.agg === "q" && M ? "q" + Math.ceil(M / 3) : XU.agg === "h" && M ? "h" + (M > 6 ? 2 : 1) : M ? "cum" : "y";
    anaOpen({ scr: scr, node: node, per: k, stack: [] });
  }
  function anaPeriod(scr, key) {
    if (!S.year) return;
    var k = key;
    if (scr === "plan") k = /^m\d+$/.test(key) ? "m" + (+key.slice(1) + 1) : key === "plan" ? "y" : key;
    else k = key === "t" || key === "cc" || key === "ca" ? "cum" : key === "yp" ? "y" : key;
    anaOpen({ scr: scr, node: { lv: "all" }, per: k, stack: [] });
  }

  /* ---------- 차트 (SVG) ---------- */
  function svgMonths(o) {
    // o: {bars:[12|null], barCls:fn(i), lines:[{v:[12], cls, dash, label}], hi:{m:1}, w, h, title}
    var W = o.w || 520, H = o.h || 190, L = 52, R = 10, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
    var vals = [0];
    (o.bars || []).forEach(function (v) { if (v !== null) vals.push(v); });
    (o.lines || []).forEach(function (l) { l.v.forEach(function (v) { if (v !== null) vals.push(v); }); });
    var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    if (mx === mn) mx = mn + 1;
    var y = function (v) { return T + ih - (v - mn) / (mx - mn) * ih; }, bw = iw / 12;
    var g = ['<svg class="ana-svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">'];
    for (var t = 0; t <= 4; t++) { var v = mn + (mx - mn) * t / 4, yy = y(v); g.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="gl"/><text x="' + (L - 4) + '" y="' + (yy + 3) + '" class="ax" text-anchor="end">' + u(v, true) + "</text>"); }
    if (mn < 0) g.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" class="zl"/>');
    for (var i = 0; i < 12; i++) {
      var x = L + bw * i;
      if (o.hi && o.hi[i + 1]) g.push('<rect x="' + x + '" y="' + T + '" width="' + bw + '" height="' + ih + '" class="hi"/>');
      g.push('<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" class="ax" text-anchor="middle">' + (i + 1) + "</text>");
      var bv = o.bars ? o.bars[i] : null;
      if (bv !== null && bv !== undefined) {
        var y0 = y(Math.max(0, mn)), y1 = y(bv);
        g.push('<rect x="' + (x + bw * 0.18) + '" y="' + Math.min(y0, y1) + '" width="' + (bw * 0.64) + '" height="' + Math.max(1, Math.abs(y1 - y0)) + '" class="bar ' + (o.barCls ? o.barCls(i) : "") + '"><title>' + (i + 1) + "월 " + esc(o.barLabel || "집행") + " " + u(bv, true) + " " + unitName() + "</title></rect>");
      }
    }
    (o.lines || []).forEach(function (l) {
      var pts = [];
      l.v.forEach(function (v, i) { if (v !== null && v !== undefined) pts.push((L + bw * i + bw / 2) + "," + y(v)); });
      if (pts.length) g.push('<polyline points="' + pts.join(" ") + '" class="ln ' + (l.cls || "") + '"' + (l.dash ? ' stroke-dasharray="4 3"' : "") + "/>");
      l.v.forEach(function (v, i) { if (v !== null && v !== undefined) g.push('<circle cx="' + (L + bw * i + bw / 2) + '" cy="' + y(v) + '" r="2.4" class="pt ' + (l.cls || "") + '"><title>' + (i + 1) + "월 " + esc(l.label) + " " + u(v, true) + " " + unitName() + "</title></circle>"); });
    });
    g.push("</svg>");
    return g.join("");
  }
  // 계단식 (계획 → 하위별 증감 → 집행)
  function svgWaterfall(start, steps, end, labels) {
    var n = steps.length + 2, W = Math.max(520, n * 74), H = 220, L = 56, R = 10, T = 16, B = 48, iw = W - L - R, ih = H - T - B, bw = iw / n;
    // 세로축: 증감이 잘 보이게 시작 · 끝 막대는 잘라서 그림 (0부터 아님)
    var run = start, rmin = Math.min(start, end), rmax = Math.max(start, end);
    steps.forEach(function (s) { run += s.v; rmin = Math.min(rmin, run); rmax = Math.max(rmax, run); });
    var span = Math.max(rmax - rmin, Math.abs(rmax) * 0.002, 1), lo = rmin - span * 1.4, hi = rmax + span * 0.25, cutAxis = lo > 0;
    if (rmin <= 0 || lo < 0) { lo = Math.min(0, rmin - span * 0.1); cutAxis = false; }
    var y = function (v) { return T + ih - (v - lo) / (hi - lo) * ih; };
    var g = ['<svg class="ana-svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">'];
    var cut = function (s) { s = String(s); return s.length > 7 ? s.slice(0, 6) + "…" : s; };
    var put = function (i, a, b, cls, label, val, txt) {
      var x = L + bw * i + bw * 0.15, ya = y(a), yb = y(b);
      g.push('<rect x="' + x + '" y="' + Math.min(ya, yb) + '" width="' + bw * 0.7 + '" height="' + Math.max(1, Math.abs(yb - ya)) + '" class="wf ' + cls + '"><title>' + esc(label) + " " + txt + "</title></rect>");
      g.push('<text x="' + (x + bw * 0.35) + '" y="' + (Math.min(ya, yb) - 3) + '" class="wv" text-anchor="middle">' + txt + "</text>");
      g.push('<text x="' + (x + bw * 0.35) + '" y="' + (H - B + 14) + '" class="ax" text-anchor="middle">' + esc(cut(label)) + "<title>" + esc(label) + "</title></text>");
    };
    put(0, lo, start, "base", labels[0], start, u(start, true));
    run = start;
    steps.forEach(function (s, i) { put(i + 1, run, run + s.v, s.v >= 0 ? "up" : "dn", s.label, s.v, (s.v >= 0 ? "+" : "") + u(s.v, true)); run += s.v; });
    put(n - 1, lo, end, "end", labels[1], end, u(end, true));
    if (cutAxis) g.push('<text x="' + (L - 4) + '" y="' + (H - B - 2) + '" class="ax" text-anchor="end">≈</text><text x="' + (W - R) + '" y="' + (T - 4) + '" class="ax" text-anchor="end">세로축 0부터 아님 (차이를 크게 보이려고)</text>');
    g.push("</svg>");
    return '<div class="wf-wrap">' + g.join("") + "</div>";
  }
  function pctTxt(v, sign) { return isFinite(v) ? (sign && v > 0 ? "+" : "") + (v * 100).toFixed(1) + "%" : "-"; }
  function dTxt(v) { return v ? (v > 0 ? "+" : "") + u(v, true) : "-"; }
  function dCls(v, base) { var c = dcls(v, base); return c ? " " + c : ""; }

  /* ---------- 분석 팝업 ---------- */
  function anaOpen(st) {
    var sc = anaScope(st.scr, st.node);
    if (!sc) { toast("분석할 분류를 찾지 못했습니다"); return; }
    if (st.scr === "exec") ensureX();
    var M = X ? X.month : 0, per = anaPer(st.per, M), body = st.scr === "plan" ? anaPlanBody(sc, per) : anaExecBody(sc, per, M);
    var perBar = function () {
      var o = function (k, label) { return '<button data-ap="' + k + '"' + (per.k === k ? ' class="on"' : "") + ">" + label + "</button>"; };
      var sel = function (pfx, n, nm, cur) {
        var on = new RegExp("^" + pfx + "\\d+$").test(per.k);
        return '<select class="inp plain ap-sel' + (on ? " on" : "") + '" data-aps="' + pfx + '"><option value="">' + nm + "</option>" + range(n).map(function (i) { var k = pfx + i, lb = pfx === "m" ? i + "월" : pfx === "q" ? i + "분기" : i === 1 ? "상반기" : "하반기"; return '<option value="' + k + '"' + (per.k === k ? " selected" : "") + ">" + lb + "</option>"; }).join("") + "</select>";
      };
      var cm = /^c:(\d+)-(\d+)$/.exec(per.k) || [0, 1, M || 12];
      return '<div class="ap-bar">' + sel("m", 12, "월", per.k) + sel("q", 4, "분기", per.k) + sel("h", 2, "반기", per.k) + (st.scr === "exec" && M ? o("cum", "누계 1~" + M + "월") : "") + o("y", "연간") +
        '<span class="ap-c">직접 <select class="inp plain" id="apA">' + range(12).map(function (i) { return "<option" + (i === +cm[1] ? " selected" : "") + ">" + i + "</option>"; }).join("") + '</select>월 ~ <select class="inp plain" id="apB">' + range(12).map(function (i) { return "<option" + (i === +cm[2] ? " selected" : "") + ">" + i + "</option>"; }).join("") + '</select>월 <button class="btn sm" id="apGo">보기</button></span></div>';
    };
    var crumb = (st.scr === "plan" ? "계획 분석" : "집행 분석") + " › " + sc.path;
    openDialog({
      title: sc.label + " · " + per.label + (st.scr === "plan" ? " 계획 분석" : " 집행 분석"), crumb: crumb, key: "ana", width: 1260, okText: null, cancelText: "닫기", cls: "mdl-ana", enterOk: false,
      body: '<div class="ap-top">' + (st.stack.length ? '<button class="btn sm" id="apBack">◀ 뒤로</button>' : "") + (sc.up ? '<button class="btn sm" id="apUp">▲ 상위 분류</button>' : "") + perBar() + "</div>" + '<div class="ana-body" id="anaBody">' + body.html + "</div>",
      extra: '<button class="btn" id="apCfg">기준값…</button><button class="btn" id="apXls">엑셀로</button>'
    });
    var go = function (patch) { var n = { scr: st.scr, node: st.node, per: st.per, stack: st.stack.concat([{ node: st.node, per: st.per }]) }; Object.keys(patch).forEach(function (k) { n[k] = patch[k]; }); anaOpen(n); };
    var setPer = function (k) { anaOpen({ scr: st.scr, node: st.node, per: k, stack: st.stack }); };
    dlg.el.querySelectorAll("[data-ap]").forEach(function (b) { b.addEventListener("click", function () { setPer(b.getAttribute("data-ap")); }); });
    dlg.el.querySelectorAll("[data-aps]").forEach(function (sl) { sl.addEventListener("change", function () { if (sl.value) setPer(sl.value); }); });
    $("apGo").addEventListener("click", function () { setPer("c:" + $("apA").value + "-" + $("apB").value); });
    if ($("apBack")) $("apBack").addEventListener("click", function () { var p = st.stack[st.stack.length - 1]; anaOpen({ scr: st.scr, node: p.node, per: p.per, stack: st.stack.slice(0, -1) }); });
    if ($("apUp")) $("apUp").addEventListener("click", function () { go({ node: sc.up }); });
    $("apCfg").addEventListener("click", function () { anaCfgDialog(function () { anaOpen(st); }); });
    $("apXls").addEventListener("click", function () { anaXls(sc, per, body.xls, st.scr); });
    $("anaBody").addEventListener("click", function (e) {
      var a = e.target.closest("[data-go]");
      if (a) { var nd = JSON.parse(a.getAttribute("data-go")); go({ node: nd }); return; }
      var d = e.target.closest("[data-dt]");
      if (d && st.scr === "exec") { var p = JSON.parse(d.getAttribute("data-dt")), h = findLeaf(p.id), ms = p.ms.filter(function (m) { return m <= M; }); if (h && ms.length) detailDialog({ ids: [p.id], months: ms, title: (ms.length === 1 ? ms[0] + "월 " : ms[0] + "~" + ms[ms.length - 1] + "월 ") + leafPath(h) }); return; }
      var di = e.target.closest("[data-dti]");
      if (di && st.scr === "exec") { var q = JSON.parse(di.getAttribute("data-dti")), hq = findLeaf(q.id); if (hq && q.ms.length) detailDialog({ ids: [q.id], months: q.ms, item: q.item, title: (q.ms.length === 1 ? q.ms[0] + "월 " : q.ms[0] + "~" + q.ms[q.ms.length - 1] + "월 ") + leafPath(hq) + " › " + q.name }); return; }
      var pl = e.target.closest("[data-pl]");
      if (pl && st.scr === "plan") { closeDialog(); select(pl.getAttribute("data-pl"), true); openPlan(pl.getAttribute("data-pl")); return; }
      var tb = e.target.closest("[data-tab]");
      if (tb) { var box = tb.closest(".ana-tabs"); box.querySelectorAll("[data-tab]").forEach(function (x) { x.classList.toggle("on", x === tb); }); box.parentNode.querySelectorAll("[data-pane]").forEach(function (x) { x.hidden = x.getAttribute("data-pane") !== tb.getAttribute("data-tab"); }); }
    });
    $("anaBody").addEventListener("dblclick", function (e) { var v = e.target.closest("[data-vch]"); if (v && st.scr === "exec") voucherView(X.lines[+v.getAttribute("data-vch")]); });
  }
  function anaXls(sc, per, sheets, scr) {
    var wb = XLSX.utils.book_new();
    sheets.forEach(function (s) {
      var ws = XLSX.utils.aoa_to_sheet(s.aoa);
      ws["!cols"] = s.aoa[0].map(function (h, i) { return { wch: i === 0 ? 30 : 14 }; });
      XLSX.utils.book_append_sheet(wb, ws, s.name);
    });
    Store.download(wb, (scr === "plan" ? "계획분석_" : "집행분석_") + S.year + "_" + sc.label.replace(/[\\/:*?"<>|›]/g, "_") + "_" + per.label.replace(/\s+/g, "") + ".xlsx");
  }
  function anaCard(label, value, sub, cls) { return '<div class="ak' + (cls ? " " + cls : "") + '"><span>' + label + "</span><b>" + value + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; }
  function anaSec(title, html, wide) { return '<section class="as' + (wide ? " wide" : "") + '"><h4>' + title + "</h4>" + html + "</section>"; }

  /* ----- 집행 분석 ----- */
  function anaExecBody(sc, per, M) {
    var cfg = anaCfg(), P = per.months, done = P.filter(function (m) { return m <= M; }), all = xRows(true), byId = {};
    all.forEach(function (r) { r.fc = xForecast(r); byId[r.id] = r; });
    var sm = function (a, ms) { var t = 0; ms.forEach(function (m) { t += a[m - 1] || 0; }); return t; };
    var pmOf = function (id) { var p = planFor(id); return p.pm && p.pm.length === 12 ? p.pm : null; };
    var agg = function (ids) {
      var o = { plan: 0, planDone: 0, act: 0, prev: 0, prevN: 0, yplan: 0, ytd: 0, fc: 0, prevYtd: 0, prevYear: 0, months: new Array(12).fill(0), pmon: new Array(12).fill(0), prevMon: new Array(12).fill(0), n: 0 };
      ids.forEach(function (id) {
        var r = byId[id]; if (!r) return;
        o.n++; o.plan += sm(r.plan, P); o.planDone += sm(r.plan, done); o.act += sm(r.act, done); o.yplan += sum12(r.plan); o.ytd += sum12(r.act, M); o.fc += r.fc;
        for (var i = 0; i < 12; i++) { o.months[i] += r.act[i]; o.pmon[i] += r.plan[i]; }
        var pm = pmOf(id); if (pm) { o.prevN++; o.prev += sm(pm, done); o.prevYtd += sum12(pm, M); o.prevYear += sum12(pm); for (var j = 0; j < 12; j++) o.prevMon[j] += pm[j]; }
      });
      o.diff = o.act - o.planDone;
      return o;
    };
    var A = agg(sc.ids), xls = [], html = [];
    if (!M) return { html: '<div class="cm-empty">아직 반영한 집행이 없습니다. [더존 자료 읽기]로 반영하면 분석할 수 있습니다.<br>지금은 계획만 있습니다: ' + per.label + " 계획 " + u(A.plan, true) + " " + unitName() + "</div>", xls: [] };
    // 1. 요약
    var rate = A.yplan ? A.ytd / A.yplan : NaN, pace = M / 12, pp = per.k === "y" || per.k === "cum" ? null : prevPer(per), PA = pp ? (function () { var t = 0; sc.ids.forEach(function (id) { var r = byId[id]; if (r) t += sm(r.act, pp.months.filter(function (m) { return m <= M; })); }); return t; })() : null;
    var cards = [
      anaCard(per.label + " 계획", u(A.plan, true), done.length < P.length ? "지난 달만 " + u(A.planDone, true) : ""),
      anaCard(per.label + " 집행", u(A.act, true), done.length ? (done.length < P.length ? done[done.length - 1] + "월까지" : "") : "아직 집행 전"),
      anaCard("계획 대비", A.planDone ? pctTxt(A.diff / A.planDone, true) : "-", (A.diff > 0 ? "초과 " : A.diff < 0 ? "절감 " : "") + (A.diff ? u(Math.abs(A.diff), true) : "계획과 같음"), A.diff > 0 ? "up" : A.diff < 0 ? "dn" : ""),
      anaCard("연간 집행률", pctTxt(rate), "시간 " + pctTxt(pace) + " 지남 · " + (!isFinite(rate) ? "" : rate > pace + 0.05 ? "<b class=\"upc\">빠름</b>" : rate < pace - 0.05 ? "<b class=\"dnc\">느림</b>" : "적정")),
      anaCard("전년 같은 기간", A.prevN ? u(A.prev, true) : "-", A.prevN && A.prev ? "올해 " + pctTxt(A.act / A.prev - 1, true) : "전년 월별 실적 없음"),
      pp ? anaCard("직전 기간 (" + pp.label + ")", u(PA, true), PA ? "이번 " + pctTxt(A.act / PA - 1, true) : "") : "",
      anaCard("연말 예상", u(A.fc, true), "연간 계획 " + u(A.yplan, true) + (A.fc > A.yplan ? ' · <b class="upc">초과 예상 ' + u(A.fc - A.yplan, true) + "</b>" : ""), A.fc > A.yplan ? "up" : "")
    ];
    html.push('<div class="ak-row">' + cards.join("") + '<div class="ak-unit">단위: ' + unitName() + "</div></div>");
    xls.push({ name: "요약", aoa: [["항목", "금액(원)", "비고"], [per.label + " 계획", A.plan, ""], [per.label + " 집행", A.act, done.length + "개월"], ["계획 대비 증감", A.diff, A.planDone ? Math.round(A.diff / A.planDone * 1000) / 10 + "%" : ""], ["연간 계획", A.yplan, ""], ["1~" + M + "월 집행", A.ytd, "집행률 " + (isFinite(rate) ? Math.round(rate * 1000) / 10 + "%" : "-")], ["전년 같은 기간", A.prev, ""], ["연말 예상", A.fc, ""]] });
    // 2. 월별 추이 · 누계
    var hi = {}; P.forEach(function (m) { hi[m] = 1; });
    var bars = A.months.map(function (v, i) { return i < M ? v : null; });
    var cumA = [], cumP = [], ca = 0, cp = 0;
    for (var i = 0; i < 12; i++) { cp += A.pmon[i]; cumP.push(cp); if (i < M) { ca += A.months[i]; cumA.push(ca); } else cumA.push(null); }
    html.push('<div class="as-grid">' + anaSec("월별 추이 <small>막대 집행 · 선 계획 · 점선 전년</small>", svgMonths({ bars: bars, barCls: function (i) { return A.months[i] > A.pmon[i] ? "over" : ""; }, hi: hi, lines: [{ v: A.pmon, cls: "pl", label: "계획" }].concat(A.prevN ? [{ v: A.prevMon, cls: "pv", dash: true, label: "전년" }] : []), w: 560 })) +
      anaSec("누계 <small>선 집행 누계 · 계획 누계 · 연간 계획</small>", svgMonths({ lines: [{ v: cumP, cls: "pl", label: "계획 누계" }, { v: cumA, cls: "ac", label: "집행 누계" }, { v: new Array(12).fill(A.yplan), cls: "lim", dash: true, label: "연간 계획" }], w: 560 })) + "</div>");
    // 3. 증감 원인 (계단식) + 4. 하위 표
    var kids = sc.kids.map(function (k) { var s2 = anaScope("exec", k.node); return s2 && s2.ids.length ? { label: k.label, node: k.node, sc: s2, a: agg(s2.ids) } : null; }).filter(Boolean);
    var stepsOf = function (list) {
      var st = list.filter(function (k) { return Math.round(k.a.diff); }).sort(function (a, b) { return Math.abs(b.a.diff) - Math.abs(a.a.diff); }), top = st.slice(0, 8), rest = st.slice(8).reduce(function (t, k) { return t + k.a.diff; }, 0);
      var out = top.map(function (k) { return { label: k.label, v: k.a.diff }; });
      if (Math.round(rest)) out.push({ label: "그 밖 " + (st.length - 8), v: rest });
      return out;
    };
    if (done.length) {
      if (kids.length > 1) html.push(anaSec("증감 원인 — 어느 분류가 차이를 만들었나 <small>계획(" + (done.length < P.length ? "지난 달" : per.label) + ") → 하위별 증감 → 집행</small>", svgWaterfall(A.planDone, stepsOf(kids), A.act, ["계획", "집행"]), true));
      else if (sc.lv === "leaf" && done.length > 1) html.push(anaSec("월별 증감 <small>계획 → 달마다 증감 → 집행</small>", svgWaterfall(A.planDone, done.map(function (m) { var r = byId[sc.ids[0]]; return { label: m + "월", v: r.act[m - 1] - r.plan[m - 1] }; }), A.act, ["계획", "집행"]), true));
    }
    if (sc.lv === "leaf" && byId[sc.ids[0]] && byId[sc.ids[0]].items.length) html.push(itemExecSection(byId[sc.ids[0]], P, done, M));
    if (kids.length) {
      var tdiff = A.diff || 1;
      var rowsH = kids.map(function (k) {
        var a = k.a, st = [];
        if (a.diff > 0 && a.diff >= cfg.min) st.push('<span class="st bad">초과</span>');
        if (a.planDone > 0 && !a.act) st.push('<span class="st same">미집행</span>');
        if (!a.yplan && a.ytd) st.push('<span class="st new">계획 없음</span>');
        if (a.fc > a.yplan && a.yplan) st.push('<span class="st warn">연말 초과 예상</span>');
        var isLeaf = k.node.lv === "leaf";
        return '<tr><td><a class="lk" data-go="' + esc(JSON.stringify(k.node)) + '">' + esc(k.label) + "</a>" + (isLeaf ? ' <a class="mini" data-dt="' + esc(JSON.stringify({ id: k.node.id, ms: done })) + '" title="내역 보기">내역</a>' : ' <span class="mute">' + a.n + "</span>") + '</td><td class="n">' + u(a.plan, true) + '</td><td class="n"><b>' + (done.length ? u(a.act, true) : "-") + '</b></td><td class="n' + dCls(a.diff, a.planDone) + '">' + dTxt(a.diff) + '</td><td class="n">' + (a.planDone ? pctTxt(a.diff / a.planDone, true) : "-") +
          '</td><td class="n">' + (A.diff ? '<span class="cbar' + (a.diff * A.diff < 0 ? " neg" : "") + '" style="width:' + Math.min(60, Math.abs(a.diff / tdiff) * 60) + 'px"></span>' + pctTxt(a.diff / tdiff) : "-") + '</td><td class="n">' + (a.yplan ? pctTxt(a.ytd / a.yplan) : "-") + '</td><td class="n">' + u(a.fc, true) + '</td><td class="n">' + u(a.yplan, true) + '</td><td class="n">' + (a.prevN && a.prev ? pctTxt(a.act / a.prev - 1, true) : "-") + "</td><td>" + st.join(" ") + "</td></tr>";
      }).join("");
      html.push(anaSec("하위 분류 <small>이름을 누르면 그 분류로 · 기여도 = 이 분류 증감에서 차지하는 몫</small>", '<div class="as-scroll"><table class="maptbl mon ana-t"><tr><th>분류</th><th>' + per.label + " 계획</th><th>집행</th><th>증감</th><th>증감률</th><th>기여도</th><th>연간 집행률</th><th>연말 예상</th><th>연간 계획</th><th>전년 대비</th><th>상태</th></tr>" + rowsH + "</table></div>", true));
      xls.push({ name: "하위분류", aoa: [["분류", "기간 계획", "집행", "증감", "연간 집행률", "연말 예상", "연간 계획", "전년 같은 기간"]].concat(kids.map(function (k) { return [k.label, k.a.plan, k.a.act, k.a.diff, k.a.yplan ? Math.round(k.a.ytd / k.a.yplan * 1000) / 10 + "%" : "", Math.round(k.a.fc), k.a.yplan, k.a.prev]; })) });
    }
    // 많이 쓴 · 덜 쓴 계정 (계정이 여러 개일 때)
    if (sc.ids.length > 3 && done.length) {
      var lv = sc.ids.map(function (id) { var r = byId[id], a = sm(r.act, done), p = sm(r.plan, done); return { id: id, r: r, d: a - p, a: a, p: p }; });
      var lt = function (list) { return '<table class="maptbl mon ana-t"><tr><th>계정</th><th>계획</th><th>집행</th><th>증감</th></tr>' + list.map(function (x) { return '<tr><td><a class="lk" data-dt="' + esc(JSON.stringify({ id: x.id, ms: done })) + '">' + esc(x.r.l1 + " › " + rowLabel(x.r)) + '</a></td><td class="n">' + u(x.p, true) + '</td><td class="n">' + u(x.a, true) + '</td><td class="n' + dCls(x.d, x.p) + '">' + dTxt(x.d) + "</td></tr>"; }).join("") + "</table>"; };
      var ups = lv.filter(function (x) { return x.d > 0; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 10), dns = lv.filter(function (x) { return x.d < 0; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 10);
      html.push('<div class="as-grid">' + anaSec("많이 쓴 계정 (계획보다)", ups.length ? lt(ups) : '<div class="mute">없음</div>') + anaSec("덜 쓴 계정 (계획보다)", dns.length ? lt(dns) : '<div class="mute">없음</div>') + "</div>");
    }
    // 색깔표 (하위 × 월 증감)
    if (kids.length > 1 && M > 1) {
      var hm = '<div class="as-scroll"><table class="maptbl mon heat"><tr><th>분류</th>' + range(M).map(function (m) { return "<th" + (hi[m] ? ' class="hi"' : "") + ">" + m + "월</th>"; }).join("") + "</tr>" + kids.map(function (k) {
        return "<tr><td>" + esc(k.label) + "</td>" + range(M).map(function (m) {
          var d = 0, p = 0; k.sc.ids.forEach(function (id) { var r = byId[id]; if (r) { d += r.act[m - 1] - r.plan[m - 1]; p += r.plan[m - 1]; } });
          return '<td class="n' + dCls(d, p) + '" title="' + esc(k.label) + " " + m + "월 계획 " + u(p, true) + " · 증감 " + dTxt(d) + '">' + (d ? dTxt(d) : "") + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</table></div>";
      html.push(anaSec("언제 어디서 튀었나 — 하위 × 월 증감 <small>빨강 = 계획보다 많이 · 파랑 = 덜</small>", hm, true));
    }
    // 5. 확인 포인트
    var lines = xLinesFor(sc.ids, done), pts = [];
    sc.ids.forEach(function (id) {
      var r = byId[id]; if (!r) return;
      var path = r.l1 + " › " + rowLabel(r);
      // 튀는 달: 평소(다른 달 평균)와도, 그 달 계획과도 ±spike% 이상 다른 달 (계획에 잡힌 계절 변동은 빼고) — 계정마다 가장 큰 것 하나
      var sp = null;
      done.forEach(function (m) {
        var others = range(M).filter(function (x) { return x !== m; }), avg = others.length ? sm(r.act, others) / others.length : 0, v = r.act[m - 1], pmv = r.plan[m - 1];
        if (others.length < 2 || !(avg > 0) || Math.abs(v - avg) < cfg.min || Math.abs(v / avg - 1) * 100 < cfg.spike) return;
        if (pmv && (Math.abs(v - pmv) < cfg.min || Math.abs(v / pmv - 1) * 100 < cfg.spike)) return;
        if (!sp || Math.abs(v - avg) > sp.sev) sp = { k: "튀는 달", sev: Math.abs(v - avg), id: id, ms: [m], t: path + " " + m + "월 " + u(v, true) + " — 평소(다른 달 평균) " + u(avg, true) + "의 " + (v / avg).toFixed(1) + "배 · 그 달 계획 " + u(pmv, true) };
      });
      if (sp) pts.push(sp);
      var pd = sm(r.plan, done), ad = sm(r.act, done);
      if (pd >= cfg.min && !ad) pts.push({ k: "미집행", sev: pd, id: id, ms: done, t: path + " — " + per.label + " 계획 " + u(pd, true) + " 인데 집행 없음" });
      if (!sum12(r.plan) && ad >= cfg.min) pts.push({ k: r.out ? "계획 외" : "계획 없음", sev: ad, id: id, ms: done, t: path + " — 계획 없이 " + u(ad, true) + " 집행" });
      rowAlerts(id).forEach(function (al) { if (P.indexOf(al.m) >= 0) pts.push({ k: "지난 달 수정", sev: Math.abs(al.after - al.before) + 1e12, id: id, ms: [al.m], t: path + " " + al.m + "월 " + (al.after - al.before > 0 ? "+" : "") + u(al.after - al.before, true) + " (미처리)" }); });
    });
    // 큰 단건: 그 달 집행의 big% 이상 + 그 계정 평소 전표(중앙값)의 3배 이상 + 최소 금액 (계정마다 가장 큰 것 하나)
    var ix = dzIndex(), monTot = {}, med = {}, bigSeen = {};
    lines.forEach(function (l) { var k = ix.leaf(l) + "|" + l.m; monTot[k] = (monTot[k] || 0) + l.amt; });
    X.lines.forEach(function (l) { if (l.amt > 0) { var id0 = ix.leaf(l); if (id0) (med[id0] = med[id0] || []).push(l.amt); } });
    Object.keys(med).forEach(function (k) { var a = med[k].sort(function (x, y) { return x - y; }); med[k] = a[Math.floor(a.length / 2)]; });
    lines.slice().sort(function (a, b) { return b.amt - a.amt; }).forEach(function (l) {
      var id = ix.leaf(l), t = monTot[id + "|" + l.m];
      if (bigSeen[id] || !(t > 0) || l.amt < cfg.min || l.amt / t * 100 < cfg.big || !(med[id] && l.amt >= med[id] * 3)) return;
      if (lines.filter(function (x) { return ix.leaf(x) === id && x.m === l.m; }).length > 1) {
        bigSeen[id] = 1;
        var h = findLeaf(id); pts.push({ k: "큰 단건", sev: l.amt, id: id, ms: [l.m], li: X.lines.indexOf(l), t: (h ? leafPath(h) : "") + " " + l.m + "월 — " + (l.memo || "(적요 없음)") + " " + u(l.amt, true) + " (그 달의 " + Math.round(l.amt / t * 100) + "%)" });
      }
    });
    // 중복 의심: 같은 계정 코드 · 금액 · 거래처끼리 묶고, 묶음 안에서 7일 안 (전표가 많아도 빠르게)
    var dg = {};
    lines.forEach(function (l) { if (l.amt >= cfg.min) (dg[l.code + "|" + l.amt + "|" + (l.ptn || "")] = dg[l.code + "|" + l.amt + "|" + (l.ptn || "")] || []).push(l); });
    Object.keys(dg).forEach(function (k) {
      var g = dg[k];
      if (g.length < 2) return;
      g.sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
      for (var i = 1; i < g.length; i++) {
        var a = g[i - 1], b = g[i];
        if (a.no === b.no && a.d === b.d) continue;
        if (Math.abs(new Date(a.d) - new Date(b.d)) <= 7 * 864e5) { var id2 = ix.leaf(a), h2 = findLeaf(id2); pts.push({ k: "중복 의심", sev: a.amt, id: id2, ms: [a.m, b.m], t: (h2 ? leafPath(h2) : "") + " — " + a.d.slice(5) + " · " + b.d.slice(5) + " 같은 금액 " + u(a.amt, true) + (a.ptn ? " · " + a.ptn : "") }); break; }
      }
    });
    itemPoints(sc.ids, done, P, M).forEach(function (p) { pts.push(p); });
    var order = { "지난 달 수정": 0, "금액 차이": 1, "항목 미집행": 2, "시기 차이": 3, "중복 의심": 4, "큰 단건": 5, "튀는 달": 6, "계획 외": 7, "계획 없음": 8, "미집행": 9 };
    pts.sort(function (a, b) { return (order[a.k] - order[b.k]) || b.sev - a.sev; });
    html.push(anaSec("확인 포인트 " + (pts.length ? '<span class="cnt">' + pts.length + "</span>" : "") + ' <small>기준: 튀는 달 ±' + cfg.spike + "% · 큰 단건 " + cfg.big + "% · 최소 " + u(cfg.min, true) + " " + unitName() + "</small>",
      pts.length ? '<div class="pts">' + pts.slice(0, 60).map(function (p) { return '<div class="pt" data-dt="' + esc(JSON.stringify({ id: p.id, ms: p.ms })) + '"><span class="pk k' + (order[p.k] || 0) + '">' + p.k + "</span>" + esc(p.t) + "</div>"; }).join("") + (pts.length > 60 ? '<div class="mute">외 ' + (pts.length - 60) + "건 (엑셀로 받으면 모두)</div>" : "") + "</div>" : '<div class="mute">기준에 걸리는 것이 없습니다.</div>', true));
    xls.push({ name: "확인포인트", aoa: [["구분", "내용"]].concat(pts.map(function (p) { return [p.k, p.t]; })) });
    // 6. 거래처 · 적요 상위 · 7. 큰 전표
    if (lines.length) {
      var early = {}; X.lines.forEach(function (l) { if (l.m < done[0]) early[l.ptn] = 1; });
      var grp = function (key) { var g = {}; lines.forEach(function (l) { var k = key(l), x = g[k] = g[k] || { k: k, n: 0, amt: 0, m: {} }; x.n++; x.amt += l.amt; x.m[l.m] = (x.m[l.m] || 0) + l.amt; }); return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.amt - a.amt; }); };
      var tot = lines.reduce(function (a, l) { return a + l.amt; }, 0);
      var gt = function (list, nm, isPtn) {
        return '<table class="maptbl mon ana-t"><tr><th>' + nm + "</th><th>건수</th><th>금액</th><th>비중</th></tr>" + list.slice(0, 10).map(function (x) {
          return "<tr><td>" + esc(x.k) + (isPtn && x.k && x.k !== "-" && !early[x.k] && done[0] > 1 ? ' <span class="st new">새 거래처</span>' : "") + '</td><td class="n">' + x.n + '</td><td class="n">' + u(x.amt, true) + '</td><td class="share"><span class="sbar g" style="width:' + (tot ? Math.max(0, x.amt / tot * 120) : 0) + 'px"></span>' + (tot ? (x.amt / tot * 100).toFixed(1) : "0") + "%</td></tr>";
        }).join("") + "</table>";
      };
      var gp = grp(function (l) { return l.ptn || "(거래처 없음)"; }), gm = grp(function (l) { return (l.memo || "(적요 없음)").replace(/\s*\(.*\)$/, "").replace(/\d+/g, "#"); });
      var big = lines.slice().sort(function (a, b) { return b.amt - a.amt; }).slice(0, 10);
      html.push('<div class="as-grid3">' + anaSec("거래처 상위 10", gt(gp, "거래처", true)) + anaSec("적요 상위 10 <small>비슷한 것끼리</small>", gt(gm, "적요", false)) +
        anaSec("큰 전표 10건 <small>더블클릭 = 전표</small>", '<table class="maptbl mon ana-t"><tr><th>일자</th><th>적요</th><th>금액</th></tr>' + big.map(function (l) { return '<tr class="clk" data-vch="' + X.lines.indexOf(l) + '"><td>' + l.d.slice(5).replace(/-/g, "/") + "</td><td>" + esc(l.memo) + (sc.ids.length > 1 ? ' <span class="mute">' + esc(l.name) + "</span>" : "") + '</td><td class="n">' + u(l.amt, true) + "</td></tr>"; }).join("") + "</table>") + "</div>");
      xls.push({ name: "거래처", aoa: [["거래처", "건수", "금액"]].concat(gp.map(function (x) { return [x.k, x.n, x.amt]; })) });
      xls.push({ name: "큰전표", aoa: [["일자", "번호", "계정", "적요", "거래처", "금액"]].concat(lines.slice().sort(function (a, b) { return b.amt - a.amt; }).slice(0, 200).map(function (l) { return [l.d, l.no, l.name, l.memo, l.ptn, l.amt]; })) });
    }
    // 8. 연말 예상 3가지
    var restPlan = 0, recent = 0, rn = 0;
    for (var q = M; q < 12; q++) restPlan += A.pmon[q];
    for (var w = Math.max(0, M - 3); w < M; w++) { recent += A.months[w]; rn++; }
    var f1 = A.ytd + restPlan, f2 = A.ytd + (rn ? recent / rn * (12 - M) : 0), f3 = A.prevYtd ? A.ytd / A.prevYtd * A.prevYear : null;
    var fc = function (nm, v, how) { return "<tr><td>" + nm + '</td><td class="n"><b>' + (v === null ? "-" : u(v, true)) + '</b></td><td class="n' + (v !== null ? dCls(v - A.yplan, A.yplan) : "") + '">' + (v === null ? "-" : dTxt(v - A.yplan)) + '</td><td class="mute">' + how + "</td></tr>"; };
    html.push('<div class="as-grid">' + anaSec("연말 예상 3가지 <small>연간 계획 " + u(A.yplan, true) + "</small>", '<table class="maptbl mon ana-t"><tr><th>방법</th><th>연말 예상</th><th>계획 대비</th><th>계산</th></tr>' +
      fc("남은 달 계획대로", f1, "1~" + M + "월 집행 + " + (M + 1) + "~12월 계획") + fc("최근 3개월 평균으로", f2, "1~" + M + "월 집행 + 최근 " + rn + "개월 평균 × " + (12 - M)) + fc("전년 패턴대로", f3, f3 === null ? "전년 월별 실적 없음" : "올해 집행 ÷ 전년 1~" + M + "월 × 전년 연간") + "</table>") +
      anaSec("메모 · 알림", anaMemos(sc.ids, P)) + "</div>");
    return { html: html.join(""), xls: xls };
  }
  function anaMemos(ids, P) {
    var set = {}, ix = dzIndex(), out = [];
    ids.forEach(function (i) { set[i] = 1; });
    Object.keys(X.memos).forEach(function (k) {
      var p = k.split("|"), m = X.memos[k];
      if (p[0] === "c" && set[p[1]]) out.push({ at: m.at, t: m.label || "", x: m.text });
      if (p[0] === "l") { var l = X.lines.filter(function (x) { return "l|" + lineKey(x) === k; })[0]; if (l && set[ix.leaf(l)] && P.indexOf(l.m) >= 0) out.push({ at: m.at, t: m.label || "", x: m.text }); }
    });
    X.alerts.forEach(function (a) { if (set[a.leaf] && P.indexOf(a.m) >= 0) out.push({ at: a.at, t: a.m + "월 " + a.path + " 지난 달 수정 " + (a.state === "정상" ? "(정상 처리" + (a.reason ? ": " + a.reason : "") + ")" : "(미처리)"), x: (a.after - a.before > 0 ? "+" : "") + Calc.fmtWon(a.after - a.before) + "원" }); });
    if (!out.length) return '<div class="mute">이 분류 · 기간의 메모와 알림이 없습니다.</div>';
    return '<div class="pts">' + out.sort(function (a, b) { return a.at < b.at ? 1 : -1; }).map(function (o) { return '<div class="pt"><span class="pk">' + esc(String(o.at).slice(0, 10)) + "</span><b>" + esc(o.t) + "</b> " + esc(o.x) + "</div>"; }).join("") + "</div>";
  }

  /* ----- 계획 분석 (전년 실적 대비) ----- */
  function anaPlanBody(sc, per) {
    var cfg = anaCfg(), P = per.months, byId = {};
    S.rows.forEach(function (r) { byId[r.id] = r; });
    var prevM = function (r) { return r.pm && r.pm.length === 12 ? r.pm : null; };
    var sm = function (a, ms) { var t = 0; ms.forEach(function (m) { t += Calc.num(a[m - 1]); }); return t; };
    var base0 = S.lock.rounds.length ? S.lock.rounds[0] : null, lc = lastClosed();
    var agg = function (ids) {
      var o = { plan: 0, prev: 0, prevOk: true, n: 0, miss: 0, months: new Array(12).fill(0), pmon: new Array(12).fill(0), orig: 0, meth: {} };
      ids.forEach(function (id) {
        var r = byId[id]; if (!r || r.out) return;
        var c = r._c; o.n++; if (c.missing) o.miss++;
        o.plan += c.missing ? 0 : sm(c.months, P);
        for (var i = 0; i < 12; i++) o.months[i] += c.missing ? 0 : c.months[i];
        var pm = prevM(r);
        if (pm) { o.prev += sm(pm, P); for (var j = 0; j < 12; j++) o.pmon[j] += pm[j]; }
        else if (P.length === 12) o.prev += Calc.num(r.prev); else if (Calc.num(r.prev)) { o.prev += Calc.num(r.prev) * P.length / 12; o.prevOk = false; }
        if (base0 && base0.snap[id]) o.orig += sm(base0.snap[id].months, P);
        var mk = c.missing ? "입력 필요" : r.meth; o.meth[mk] = (o.meth[mk] || 0) + (c.missing ? 0 : sm(c.months, P));
      });
      o.diff = o.plan - o.prev;
      return o;
    };
    var A = agg(sc.ids), html = [], xls = [];
    var cards = [
      anaCard(per.label + " 계획", u(A.plan, true), A.n + "개 계정" + (A.miss ? ' · <b class="upc">입력 필요 ' + A.miss + "</b>" : "")),
      anaCard((S.year - 1) + "년 실적", u(A.prev, true), A.prevOk ? "" : "월별 실적이 없는 계정은 연간 ÷ 12로 계산"),
      anaCard("전년 대비", A.prev ? pctTxt(A.diff / A.prev, true) : "-", A.diff ? (A.diff > 0 ? "증가 " : "감소 ") + u(Math.abs(A.diff), true) : "같음", A.diff > 0 ? "up" : A.diff < 0 ? "dn" : ""),
      base0 ? anaCard("원안 → " + (lc ? roundLabel(lc.n) : "지금"), u(A.orig, true) + " → " + u(A.plan, true), A.plan - A.orig ? (A.plan - A.orig > 0 ? "+" : "") + u(A.plan - A.orig, true) : "변경 없음") : anaCard("계획 상태", isClosed() ? "마감" : isChanging() ? "변경 중" : "작성 중", ""),
      anaCard("전체 계획에서", pctTxt(LAST.tot.plan ? A.plan / (P.length === 12 ? LAST.tot.plan : sumIdx(LAST.tot.m, P.map(function (m) { return m - 1; }))) : NaN), "구성비")
    ];
    html.push('<div class="ak-row">' + cards.join("") + '<div class="ak-unit">단위: ' + unitName() + "</div></div>");
    xls.push({ name: "요약", aoa: [["항목", "금액(원)"], [per.label + " 계획", A.plan], [(S.year - 1) + "년 실적", A.prev], ["증감", A.diff], ["원안", A.orig]] });
    var hi = {}; P.forEach(function (m) { hi[m] = 1; });
    var kids = sc.kids.map(function (k) { var s2 = anaScope("plan", k.node); return s2 && s2.ids.length ? { label: k.label, node: k.node, sc: s2, a: agg(s2.ids) } : null; }).filter(Boolean);
    var meths = Object.keys(A.meth).sort(function (a, b) { return A.meth[b] - A.meth[a]; }), mt = A.plan || 1;
    html.push('<div class="as-grid">' + anaSec("월별 계획 <small>막대 계획 · 점선 전년 실적</small>", svgMonths({ bars: A.months, barLabel: "계획", barCls: function () { return "plan"; }, hi: hi, lines: [{ v: A.pmon, cls: "pv", dash: true, label: "전년" }], w: 560 })) +
      anaSec("산출 방식별 금액", '<div class="mbox">' + meths.map(function (m) { return '<div class="mrow"><span class="mn">' + esc(m) + '</span><span class="mb2"><i style="width:' + Math.max(0, A.meth[m] / mt * 100).toFixed(1) + '%"></i></span><span class="mv">' + u(A.meth[m], true) + " · " + pctTxt(A.meth[m] / mt) + "</span></div>"; }).join("") +
        '</div><table class="maptbl mon ana-t" style="margin-top:8px"><tr><th></th><th>1분기</th><th>2분기</th><th>3분기</th><th>4분기</th></tr><tr><td>계획</td>' + [1, 2, 3, 4].map(function (q) { return '<td class="n">' + u(sum12(A.months.slice(3 * q - 3, 3 * q)), true) + "</td>"; }).join("") + "</tr><tr><td>전년</td>" + [1, 2, 3, 4].map(function (q) { return '<td class="n">' + u(sum12(A.pmon.slice(3 * q - 3, 3 * q)), true) + "</td>"; }).join("") + "</tr></table>") + "</div>");
    if (kids.length > 1) {
      var steps = kids.filter(function (k) { return Math.round(k.a.diff); }).sort(function (a, b) { return Math.abs(b.a.diff) - Math.abs(a.a.diff); });
      var top = steps.slice(0, 8).map(function (k) { return { label: k.label, v: k.a.diff }; }), rest = steps.slice(8).reduce(function (t, k) { return t + k.a.diff; }, 0);
      if (Math.round(rest)) top.push({ label: "그 밖 " + (steps.length - 8), v: rest });
      html.push(anaSec("전년 대비 증감 원인 <small>" + (S.year - 1) + "년 실적 → 하위별 증감 → " + S.year + "년 계획</small>", svgWaterfall(A.prev, top, A.plan, ["전년 실적", "계획"]), true));
    }
    if (kids.length) {
      var td = A.diff || 1;
      html.push(anaSec("하위 분류 <small>이름을 누르면 그 분류로 · 계정은 [산출]을 누르면 산출 입력</small>", '<div class="as-scroll"><table class="maptbl mon ana-t"><tr><th>분류</th><th>전년 실적</th><th>' + per.label + " 계획</th><th>증감</th><th>증감률</th><th>기여도</th><th>구성비</th><th>산출</th></tr>" + kids.map(function (k) {
        var a = k.a, r = k.node.lv === "leaf" ? byId[k.node.id] : null;
        return '<tr><td><a class="lk" data-go="' + esc(JSON.stringify(k.node)) + '">' + esc(k.label) + "</a>" + (r ? ' <a class="mini" data-pl="' + esc(r.id) + '">산출</a>' : ' <span class="mute">' + a.n + "</span>") + '</td><td class="n">' + u(a.prev, true) + '</td><td class="n"><b>' + u(a.plan, true) + '</b></td><td class="n' + dCls(a.diff, a.prev) + '">' + dTxt(a.diff) + '</td><td class="n">' + (a.prev ? pctTxt(a.diff / a.prev, true) : a.plan ? "신규" : "-") +
          '</td><td class="n">' + (A.diff ? '<span class="cbar' + (a.diff * A.diff < 0 ? " neg" : "") + '" style="width:' + Math.min(60, Math.abs(a.diff / td) * 60) + 'px"></span>' + pctTxt(a.diff / td) : "-") + '</td><td class="n">' + (A.plan ? pctTxt(a.plan / A.plan) : "-") + '</td><td class="mute">' + (r ? (r._c.missing ? '<span class="st bad">입력 필요</span>' : esc(Calc.basisText(r, S.settings))) : "") + "</td></tr>";
      }).join("") + "</table></div>", true));
      xls.push({ name: "하위분류", aoa: [["분류", "전년 실적", "계획", "증감", "구성비"]].concat(kids.map(function (k) { return [k.label, Math.round(k.a.prev), k.a.plan, Math.round(k.a.diff), A.plan ? Math.round(k.a.plan / A.plan * 1000) / 10 + "%" : ""]; })) });
    } else if (sc.lv === "leaf") {
      var r0 = byId[sc.ids[0]];
      if (r0) html.push(anaSec("산출 근거", '<div class="pts"><div class="pt">' + (r0._c.missing ? '<span class="st bad">입력 필요</span>' : esc(Calc.basisText(r0, S.settings)) + " = <b>" + u(r0._c.plan, true) + "</b> " + unitName() + " · " + esc(r0.split) + " 분할") + (r0.memo ? " · 메모: " + esc(r0.memo) : "") + ' <a class="mini" data-pl="' + esc(r0.id) + '">산출 입력 열기</a></div></div>' + itemPlanList(r0.id), true));
    }
    // 확인 포인트
    var pts = [];
    sc.ids.forEach(function (id) {
      var r = byId[id]; if (!r || r.out) return;
      var c = r._c, path = r.l1 + " › " + rowLabel(r), pv = Calc.num(r.prev);
      if (c.missing) { pts.push({ k: "입력 필요", id: id, sev: pv + 1e15, t: path }); return; }
      if (pv && !c.plan) pts.push({ k: "계획 0", id: id, sev: pv, t: path + " — 전년 " + u(pv, true) + " 인데 계획 0" });
      if (!pv && c.plan >= cfg.min) pts.push({ k: "신규", id: id, sev: c.plan, t: path + " — 전년 실적 없이 " + u(c.plan, true) });
      if (pv && c.plan && Math.abs(c.plan / pv - 1) * 100 >= cfg.plan && Math.abs(c.plan - pv) >= cfg.min) pts.push({ k: "큰 증감", id: id, sev: Math.abs(c.plan - pv), t: path + " — 전년 대비 " + pctTxt(c.plan / pv - 1, true) + " (" + dTxt(c.plan - pv) + ")" + (r.memo ? "" : " · 비고 없음") });
      if (r.split === "수기" && c.manualDiff) pts.push({ k: "월 수기", id: id, sev: Math.abs(c.manualDiff), t: path + " — 월 금액을 직접 고쳐 산출과 " + dTxt(c.manualDiff) + " 차이" });
      var mx = Math.max.apply(null, c.months);
      if (c.plan >= cfg.min * 12 && mx / c.plan >= 0.4 && r.split !== "수기") { var mi = c.months.indexOf(mx); pts.push({ k: "월 편중", id: id, sev: mx, t: path + " — " + (mi + 1) + "월에 " + pctTxt(mx / c.plan) + " 몰림" }); }
      if (c.check) pts.push({ k: "분할 확인", id: id, sev: c.plan, t: path + " — " + c.check });
    });
    var po = { "입력 필요": 0, "분할 확인": 1, "큰 증감": 2, "계획 0": 3, "신규": 4, "월 수기": 5, "월 편중": 6 };
    pts.sort(function (a, b) { return (po[a.k] - po[b.k]) || b.sev - a.sev; });
    html.push(anaSec("확인 포인트 " + (pts.length ? '<span class="cnt">' + pts.length + "</span>" : "") + " <small>기준: 전년 대비 ±" + cfg.plan + "% · 최소 " + u(cfg.min, true) + " " + unitName() + "</small>",
      pts.length ? '<div class="pts">' + pts.slice(0, 60).map(function (p) { return '<div class="pt" data-pl="' + esc(p.id) + '"><span class="pk k' + (po[p.k] || 0) + '">' + p.k + "</span>" + esc(p.t) + "</div>"; }).join("") + "</div>" : '<div class="mute">기준에 걸리는 것이 없습니다.</div>', true));
    xls.push({ name: "확인포인트", aoa: [["구분", "내용"]].concat(pts.map(function (p) { return [p.k, p.t]; })) });
    // 변경 이력
    if (S.lock.rounds.length) {
      var rt = S.lock.rounds.map(function (rd) { var t = 0; sc.ids.forEach(function (id) { var e = rd.snap[id]; if (e) t += sm(e.months, P); }); return { rd: rd, t: t }; });
      html.push(anaSec("변경 이력 <small>마감할 때마다 이 분류 금액</small>", '<table class="maptbl mon ana-t"><tr><th>차수</th><th>마감</th><th>금액</th><th>직전 대비</th><th>사유</th></tr>' + rt.map(function (x, i) {
        var d = i ? x.t - rt[i - 1].t : 0;
        return "<tr><td>" + roundLabel(x.rd.n) + "</td><td>" + esc((x.rd.closedAt || "변경 중").slice(0, 16)) + '</td><td class="n">' + u(x.t, true) + '</td><td class="n' + (i ? dCls(d, rt[i - 1].t) : "") + '">' + (i ? dTxt(d) : "") + "</td><td>" + esc(x.rd.reason || "") + "</td></tr>";
      }).join("") + (isChanging() ? '<tr><td>지금</td><td>변경 중</td><td class="n">' + u(A.plan, true) + '</td><td class="n">' + dTxt(A.plan - rt[rt.length - 1].t) + "</td><td></td></tr>" : "") + "</table>", true));
    }
    return { html: html.join(""), xls: xls };
  }
  /* 분석 — 확정 항목 */
  // 확인 포인트: 항목 미집행 · 시기 차이 · 금액 차이 (기간 P 에 계획이나 집행이 있는 항목만)
  function itemPoints(ids, done, P, M) {
    var set = {}, out = [];
    ids.forEach(function (i) { set[i] = 1; });
    xRows(true).forEach(function (r) {
      if (!set[r.id] || !r.items.length) return;
      itemSubs(r).forEach(function (o) {
        if (o.iid === "_rest" || !o.judge) return;
        if (!P.some(function (m) { return o.plan[m - 1] || o.act[m - 1]; })) return;
        var k = o.judge.k === "미집행" ? "항목 미집행" : o.judge.k;
        out.push({ k: k, sev: Math.abs(sum12(o.act, M) - sum12(o.plan, M)) + 1, id: r.id, ms: done.length ? done : P, t: r.l1 + " › " + rowLabel(r) + " › " + o.name + " — " + o.judge.t });
      });
    });
    return out;
  }
  // 집행 분석 (계정 하나): 확정 항목별 계획 · 집행
  function itemExecSection(r, P, done, M) {
    var subs = itemSubs(r), sm = function (a, ms) { var t = 0; ms.forEach(function (m) { t += a[m - 1] || 0; }); return t; };
    return anaSec("확정 항목별 <small>기간 " + (done.length ? done[0] + "~" + done[done.length - 1] + "월" : "-") + " · 판정은 1~" + M + "월 기준 · 이름을 누르면 그 항목 전표</small>", '<table class="maptbl mon ana-t"><tr><th>항목</th><th>시기 · 조건</th><th>기간 계획</th><th>집행</th><th>증감</th><th>연간 계획</th><th>1~' + M + "월 집행</th><th>판정</th></tr>" + subs.map(function (o) {
      var pd = sm(o.plan, done), ad = sm(o.act, done);
      return '<tr><td><a class="lk" data-dti="' + esc(JSON.stringify({ id: r.id, item: o.iid, ms: done, name: o.name })) + '">' + esc(o.name) + '</a></td><td class="mute">' + esc(o.tag) + '</td><td class="n">' + u(sm(o.plan, P), true) + '</td><td class="n"><b>' + u(ad, true) + '</b></td><td class="n' + dCls(ad - pd, pd) + '">' + dTxt(ad - pd) + '</td><td class="n">' + u(sum12(o.plan), true) + '</td><td class="n">' + u(sum12(o.act, M), true) + "</td><td>" + (o.judge ? '<span class="flag ' + o.judge.cls + '">' + o.judge.k + "</span> " + esc(o.judge.t) : o.iid === "_rest" ? "" : '<span class="mute">정상</span>') + "</td></tr>";
    }).join("") + "</table>", true);
  }
  // 계획 분석 (계정 하나): 확정 항목 목록
  function itemPlanList(id) {
    var r = rowBy(id);
    if (!r || !r.items.length) return "";
    var IM = Calc.itemsMonths(r.items), isum = sum12(IM);
    return '<table class="maptbl mon ana-t" style="margin-top:8px"><tr><th>확정 항목</th><th>시기 · 조건</th><th>연간</th>' + range(12).map(function (m) { return "<th>" + m + "월</th>"; }).join("") + "</tr>" + r.items.map(function (it) {
      var ms = Calc.itemMonths(it);
      return "<tr><td>" + esc(it.name) + '</td><td class="mute">' + esc(itemTag(it, r)) + '</td><td class="n"><b>' + u(sum12(ms), true) + "</b></td>" + ms.map(function (v) { return '<td class="n">' + (v ? u(v, true) : "") + "</td>"; }).join("") + "</tr>";
    }).join("") + "<tr><td>나머지</td><td class=\"mute\">" + esc(r.split) + ' 분할</td><td class="n"><b>' + u(r._c.plan - isum, true) + "</b></td>" + r._c.months.map(function (v, i) { return '<td class="n">' + u(v - IM[i], true) + "</td>"; }).join("") + "</tr></table>";
  }
  /* 화면 바꾸기: 사업비 계획 ↔ 집행 */
  function setMode(m) {
    if (m === MODE) return;
    if (m === "exec" && !S.year) { toast("먼저 연도를 여세요"); return; }
    if (editing) commitEdit($("cellEd").value, 0, 0);
    MODE = m;
    document.body.classList.toggle("mode-exec", m === "exec");
    if (CUR) CUR.classList.toggle("mode-exec", m === "exec");
    if (ACT) { ACT.mode = m; if (!PANE_SAVED) savePanes(); }
    (CUR || document).querySelectorAll(".sheets [data-sheet]").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-sheet") === m); });
    var tab = m === "exec" ? "exec" : "plan";
    document.querySelectorAll("#rtabs a").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-tab") === tab); });
    ["file", "plan", "exec", "set", "help"].forEach(function (t) { $("rb-" + t).hidden = t !== tab; });
    UI.cell = null; markCell();
    $("fRef").textContent = "-"; $("fVal").innerHTML = ""; $("stSel").textContent = "";
    if (m === "exec") { renderAll(); if (XU.sel) xFbar(XU.sel); else $("fVal").innerHTML = '<span class="mute">집행 칸을 누르면 내역 · 우클릭하면 메모</span>'; }
    else renderAll();
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
  function xLinesFor(ids, months, item) {
    var ix = dzIndex(), set = {}, ms = {}, its = item ? itemsOf(ids[0]) : null;
    ids.forEach(function (i) { set[i] = 1; });
    months.forEach(function (m) { ms[m] = 1; });
    return X.lines.filter(function (l) { return ms[l.m] && !ix.excluded(l) && set[ix.leaf(l)] && (!item || (lineItem(l, ids[0], its) || "_rest") === item); });
  }
  function lineMemoKey(l) { return "l|" + lineKey(l); }
  /* 전표 줄 강조 (내역 팝업 · 분개장 검색): 줄 전체 L|전표키 · 칸 L|전표키|열 — 집행 서식(X.fmt)에 같이 저장 */
  var HL_COLORS = ["#FFF2B3", "#FDE7E5", "#F6AEA9", "#E6F4EA", "#A8DAB5", "#E8F0FE", "#AECBFA", "#F3E8FD", "#FEEFE3", "#DADCE0"];
  function hlStyle(f) { return f ? (f.bg ? "background:" + f.bg + ";" : "") + (f.fg ? "color:" + f.fg + ";" : "") + (f.b ? "font-weight:700;" : "") : ""; }
  function hlRow(l) { return X.fmt["L|" + lineKey(l)]; }
  function hlCell(l, c) { var r = X.fmt["L|" + lineKey(l)] || null, k = X.fmt["L|" + lineKey(l) + "|" + c] || null; return r && k ? Object.assign({}, r, k) : r || k; }
  function hlTd(l, c, cls, html, extra) { var f = hlCell(l, c); return '<td data-c="' + c + '"' + (cls ? ' class="' + cls + '"' : "") + (f ? ' style="' + hlStyle(f) + '"' : "") + (extra || "") + ">" + html + "</td>"; }
  function hlAny(l) { var k = "L|" + lineKey(l); return !!(X.fmt[k] || Object.keys(X.fmt).some(function (x) { return x.indexOf(k + "|") === 0; })); }
  function hlTools() {
    return '<span class="hl-tools" title="줄이나 칸을 누르고(Ctrl · Shift 로 여러 개) 색을 고르세요">강조 <span class="seg vseg2 hl-mode"><button data-hlm="row" class="on">줄</button><button data-hlm="cell">칸</button></span>' +
      HL_COLORS.map(function (c) { return '<button class="hsw" data-hc="' + c + '" style="background:' + c + '" title="' + c + '"></button>'; }).join("") +
      '<button class="fb" data-hb="1" title="굵게"><b>가</b></button><button class="fb" data-hfg="#D93025" title="빨간 글씨"><b style="color:#D93025">가</b></button><button class="fb" data-hx="1" title="강조 지우기">✕</button><span class="chip" data-honly="1">강조만</span></span>';
  }
  // 강조 붙이기: box = 표가 들어 있는 요소, getLine(idx) = 전표, redraw = 다시 그리기
  function bindHl(root, box, getLine, redraw, V) {
    V.hsel = {}; V.hcell = {}; V.hmode = "row"; V.honly = false; var last = null;
    box.addEventListener("click", function (e) {
      var td = e.target.closest("td[data-c]"), tr = td && td.closest("tr[data-li],tr[data-sx]");
      if (!tr || e.target.closest("select,a,button")) return;
      var i = tr.getAttribute("data-li") || tr.getAttribute("data-sx"), ck = i + "|" + td.getAttribute("data-c");
      if (e.shiftKey && last !== null) {
        var trs = Array.prototype.slice.call(box.querySelectorAll("tr[data-li],tr[data-sx]")), a = trs.findIndex(function (x) { return (x.getAttribute("data-li") || x.getAttribute("data-sx")) === last; }), b = trs.indexOf(tr);
        if (a > b) { var t0 = a; a = b; b = t0; }
        for (var q = a; q <= b; q++) V.hsel[trs[q].getAttribute("data-li") || trs[q].getAttribute("data-sx")] = 1;
      } else if (e.ctrlKey || e.metaKey) { if (V.hsel[i]) delete V.hsel[i]; else V.hsel[i] = 1; if (V.hcell[ck]) delete V.hcell[ck]; else V.hcell[ck] = 1; }
      else { V.hsel = {}; V.hsel[i] = 1; V.hcell = {}; V.hcell[ck] = 1; }
      last = i;
      hlMark(box, V);
    });
    root.addEventListener("click", function (e) {
      var m = e.target.closest("[data-hlm]");
      if (m) { V.hmode = m.getAttribute("data-hlm"); root.querySelectorAll("[data-hlm]").forEach(function (b) { b.classList.toggle("on", b === m); }); return; }
      if (e.target.closest("[data-honly]")) { V.honly = !V.honly; e.target.closest("[data-honly]").classList.toggle("on", V.honly); redraw(); return; }
      var c = e.target.closest("[data-hc],[data-hb],[data-hx],[data-hfg]");
      if (!c) return;
      var keys = V.hmode === "row" ? Object.keys(V.hsel).map(function (i) { return "L|" + lineKey(getLine(i)); }) : Object.keys(V.hcell).map(function (x) { var p = x.split("|"); return "L|" + lineKey(getLine(p[0])) + "|" + p[1]; });
      if (!keys.length) { toast("먼저 강조할 줄이나 칸을 누르세요"); return; }
      var what = c.getAttribute("data-hc") ? "색" : c.getAttribute("data-hb") ? "굵게" : c.getAttribute("data-hfg") ? "빨간 글씨" : "지우기";
      xChange(function () {
        var m2 = clone(X.fmt);
        keys.forEach(function (k) {
          var f = m2[k] || {};
          if (c.getAttribute("data-hx")) { delete m2[k]; if (V.hmode === "row") Object.keys(m2).forEach(function (x) { if (x.indexOf(k + "|") === 0) delete m2[x]; }); return; }
          if (c.getAttribute("data-hc")) f.bg = c.getAttribute("data-hc");
          if (c.getAttribute("data-hb")) { if (f.b) delete f.b; else f.b = 1; }
          if (c.getAttribute("data-hfg")) { if (f.fg) delete f.fg; else f.fg = c.getAttribute("data-hfg"); }
          if (Object.keys(f).length) m2[k] = f; else delete m2[k];
        });
        X.fmt = m2;
      }, "전표 강조 (" + (V.hmode === "row" ? "줄" : "칸") + " " + keys.length + "개 · " + what + ")");
      redraw();
    });
  }
  function hlMark(box, V) {
    box.querySelectorAll("tr[data-li],tr[data-sx]").forEach(function (tr) {
      var i = tr.getAttribute("data-li") || tr.getAttribute("data-sx");
      tr.classList.toggle("hsel", !!V.hsel[i]);
      tr.querySelectorAll("td[data-c]").forEach(function (td) { td.classList.toggle("hcsel", !!V.hcell[i + "|" + td.getAttribute("data-c")]); });
    });
  }
  function detailDialog(scope) {
    var lines = xLinesFor(scope.ids, scope.months, scope.item), rows = xRows(true).filter(function (r) { return scope.ids.indexOf(r.id) >= 0; });
    if (scope.item) rows = rows.length ? itemSubs(rows[0]).filter(function (o) { return o.iid === scope.item; }) : [];
    var its = scope.ids.length === 1 ? itemsOf(scope.ids[0]) : [], itName = function (iid) { if (!iid) return "나머지"; var it = its.filter(function (x) { return x.id === iid; })[0]; return it ? it.name : "나머지"; };
    var sumM = function (k) { var t = 0; rows.forEach(function (r) { scope.months.forEach(function (m) { t += r[k][m - 1]; }); }); return t; };
    var act = lines.reduce(function (a, l) { return a + l.amt; }, 0), plan = sumM("plan"), prev = 0, M = X.month;
    if (!scope.item) rows.forEach(function (r) { var p = planFor(r.id); if (p.pm && p.pm.length === 12) scope.months.forEach(function (m) { prev += p.pm[m - 1]; }); });
    var others = [], oth = 0;
    for (var m = 1; m <= M; m++) if (scope.months.indexOf(m) < 0) others.push(m);
    rows.forEach(function (r) { others.forEach(function (mm) { oth += r.act[mm - 1]; }); });
    var usual = others.length ? oth / others.length * scope.months.length : 0, diff = act - plan;
    var V = { group: "line", sort: "amt-", q: "" };
    // 중복 의심: 같은 금액 · 같은 거래처 · 같은 계정 · 7일 안
    var dup = {}, dg = {};
    lines.forEach(function (l, i) { var k = l.code + "|" + l.amt + "|" + (l.ptn || ""); (dg[k] = dg[k] || []).push(i); });
    Object.keys(dg).forEach(function (k) {
      var g = dg[k];
      if (g.length < 2) return;
      g.sort(function (x, y) { return lines[x].d < lines[y].d ? -1 : lines[x].d > lines[y].d ? 1 : 0; });
      for (var q = 1; q < g.length; q++) {
        var a = lines[g[q - 1]], b = lines[g[q]];
        if (!(a.no === b.no && a.d === b.d) && Math.abs(new Date(a.d) - new Date(b.d)) <= 7 * 864e5) { dup[g[q - 1]] = 1; dup[g[q]] = 1; }
      }
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
      var q = V.q.toLowerCase(), ls = lines.filter(function (l) { return (!q || (l.memo + " " + l.ptn + " " + l.no + " " + l.d + " " + Calc.fmtWon(l.amt)).toLowerCase().indexOf(q) >= 0) && (!V.honly || hlAny(l)); });
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
      h = '<table class="ov jl"><tr><th data-s="">순위</th><th data-s="d">일자</th><th>번호</th>' + (multiAcc ? "<th>계정</th>" : "") + '<th>적요</th><th data-s="ptn">거래처</th><th data-s="amt">금액</th>' + (its.length ? "<th>확정 항목</th>" : "") + '<th>이 달 비중</th><th>누적 비중</th><th>영향</th><th>결의</th><th>PJT</th></tr>' +
        ls.map(function (l, i) {
          cum2 += l.amt;
          var mk = X.memos[lineMemoKey(l)], ex = expl[l._i];
          return '<tr class="' + (ex ? "top" : "") + '" data-li="' + l._i + '">' + hlTd(l, "rk", "", i + 1) + hlTd(l, "d", "", l.d.replace(/-/g, "/")) + hlTd(l, "no", "", esc(l.no)) + (multiAcc ? hlTd(l, "acc", "", esc(l.name)) : "") +
            hlTd(l, "memo", mk ? "hasmemo" : "", esc(l.memo) + (dup[l._i] ? ' <span class="dup" title="같은 금액 · 같은 거래처 · 7일 안에 또 있음">중복?</span>' : ""), mk ? ' data-memo="' + esc(mk.text) + '"' : "") + hlTd(l, "ptn", "", esc(l.ptn)) + hlTd(l, "amt", "n", "<b>" + Calc.fmtWon(l.amt) + "</b>") + (its.length ? itemSel(l) : "") +
            '<td class="share"><span class="sbar g" style="width:' + (act ? Math.max(0, l.amt / act * 100) : 0) + 'px"></span>' + (act ? (l.amt / act * 100).toFixed(1) : "0") + '%</td><td class="share"><span class="sbar g" style="width:' + (act ? Math.max(0, Math.min(1, cum2 / act) * 100) : 0) + 'px"></span>' + (act ? (cum2 / act * 100).toFixed(1) : "0") + "%</td>" +
            "<td>" + (ex ? '<span class="dup expl">초과 설명 ' + Math.round(ex * 100) + "%</span>" : "") + "</td><td>" + esc(l.gj) + "</td><td>" + esc(l.pjt) + "</td></tr>";
        }).join("") +
        '<tr class="tot"><td colspan="' + (multiAcc ? 6 : 5) + '">합계 · ' + ls.length + "줄" + (ls.length !== lines.length ? " (찾기 결과)" : "") + '</td><td class="n">' + Calc.fmtWon(ls.reduce(function (a, l) { return a + l.amt; }, 0)) + '</td><td colspan="' + (its.length ? 6 : 5) + '">' + (diff > 0 ? "계획 대비 초과 +" + Calc.fmtWon(diff) : "") + "</td></tr></table>";
      return h;
    }
    // 확정 항목 지정: 자동(조건) / 항목 / 나머지 — '같은 적요 모두'면 규칙으로 기억
    function itemSel(l) {
      var key = lineKey(l), pin = X.pins[key] || "", auto = lineItem(Object.assign({}, l), scope.ids[0], its.filter(function () { return true; }));
      if (pin) { var keep = X.pins[key]; delete X.pins[key]; auto = lineItem(l, scope.ids[0], its); X.pins[key] = keep; }
      return '<td><select class="itsel' + (pin ? " pinned" : "") + '" data-il="' + l._i + '"><option value="">자동 → ' + esc(itName(auto)) + "</option>" + its.map(function (it) { return '<option value="' + esc(it.id) + '"' + (pin === it.id ? " selected" : "") + ">" + esc(it.name) + "</option>"; }).join("") + '<option value="rest"' + (pin === "rest" ? " selected" : "") + ">나머지</option></select></td>";
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
        (its.length ? '<label class="dt-rule"><input type="checkbox" id="dtRule"> 확정 항목을 바꿀 때 같은 적요 전표 모두 (규칙으로 기억)</label>' : "") +
        '<span class="dt-tip">줄 우클릭 = 메모 · 더블클릭 = 그 전표 전체</span></div><div class="ov-tools dt-hl" id="dtHl">' + hlTools() + '</div><div class="dt-list" id="dtList"></div>',
      extra: '<button class="btn" id="dtXls">엑셀로</button>'
    });
    $("dtTools").addEventListener("click", function (e) { var b = e.target.closest("[data-dg]"); if (b) { V.group = b.getAttribute("data-dg"); draw(); } });
    bindHl($("dtHl"), $("dtList"), function (i) { return lines[+i]; }, function () { draw(); hlMark($("dtList"), V); }, V);
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
    $("dtList").addEventListener("change", function (e) {
      var sl = e.target.closest("select.itsel");
      if (!sl) return;
      var l = lines[+sl.getAttribute("data-il")], v = sl.value, key = lineKey(l);
      if ($("dtRule") && $("dtRule").checked && v) {
        var mm = (l.memo || "").replace(/\s*\(.*\)\s*$/, "").trim();
        if (!mm) { toast("적요가 없어 규칙을 만들 수 없습니다 — 이 전표만 지정합니다"); xChange(function () { X.pins[key] = v; }, "확정 항목 지정: " + l.d + " #" + l.no + " → " + itName(v === "rest" ? null : v)); }
        else { xChange(function () { X.rules.push({ leaf: scope.ids[0], item: v, memo: mm, ptn: "", at: Store.stamp() }); delete X.pins[key]; }, "확정 항목 규칙: 적요 '" + mm + "' → " + itName(v === "rest" ? null : v)); toast("규칙 저장: 적요에 '" + mm + "' → " + itName(v === "rest" ? null : v)); }
      } else {
        xChange(function () { if (v) X.pins[key] = v; else delete X.pins[key]; }, "확정 항목 지정: " + l.d + " #" + l.no + " " + Calc.fmtWon(l.amt) + "원 → " + (v ? itName(v === "rest" ? null : v) : "자동"));
      }
      draw();
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
      pop.innerHTML = '<div class="vch-h">전표 ' + l.d.replace(/-/g, "/") + " #" + esc(l.no) + ' <button class="btn sm" id="vchX">닫기</button></div><div class="vch-b">' + h + "</div>";
      pop.hidden = false;
      winFrame(pop, ".vch-h", "voucher");
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
      close();
      if ((cur ? cur.text : "") === t) return;
      xChange(function () { if (t) X.memos[key] = { text: t, at: Store.stamp().slice(0, 16), label: label }; else delete X.memos[key]; }, "메모 " + (t ? "저장" : "지움") + ": " + label);
      if (after) after();
    });
    if (cur) $("meDel").addEventListener("click", function () { close(); xChange(function () { delete X.memos[key]; }, "메모 지움: " + label); if (after) after(); });
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
      if (p[0] === "c") {
        var h = findLeaf(p[1]), blk = +p[2] ? "m" + p[2] : p[2] === "0" ? "t" : p[2], ms = blkMonths(blk).filter(function (m) { return m <= X.month; });
        if (h && ms.length) detailDialog({ ids: [p[1]], months: ms, blk: blk, title: periodLabel(blk, ms) + " " + leafPath(h) });
      }
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
        var rs = $("alReason").value.trim();
        xChange(function () { a.state = "정상"; a.doneAt = Store.stamp(); a.reason = rs; }, "지난 달 수정 정상 처리: " + a.m + "월 " + a.path + (rs ? " — " + rs : ""));
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

  /* ---------- 분개장 검색 (계정 상관없이) — 열면 판관비 전표 전체 목록, 찾기 · 월 · 대분류로 좁히기 ---------- */
  function xSearchDialog() {
    var ix = dzIndex(), PAGE = 1000;
    var all = X.lines.map(function (l, i) {
      var id = ix.excluded(l) ? "" : ix.leaf(l) || "", h = id && findLeaf(id);
      return { l: l, i: i, id: id, path: h ? leafPath(h) : ix.excluded(l) ? "(제외 과목)" : "(미연결)", top: h ? h.top.name : "" };
    });
    var V = { q: "", f: "all", m: 0, t: "", view: "line", sort: "d+", limit: PAGE, open: null };
    var tops = []; all.forEach(function (x) { if (x.top && tops.indexOf(x.top) < 0) tops.push(x.top); });
    function pick() {
      var q = V.q.toLowerCase().replace(/,/g, "");
      return all.filter(function (x) {
        var l = x.l;
        if (V.m && l.m !== V.m) return false;
        if (V.t && x.top !== V.t) return false;
        if (V.honly && !hlAny(l)) return false;
        if (!q) return true;
        var hay = V.f === "ptn" ? l.ptn : V.f === "memo" ? l.memo : V.f === "amt" ? String(Math.abs(l.amt)) : V.f === "acc" ? x.path + " " + l.code + " " + l.name : l.ptn + " " + l.memo + " " + Math.abs(l.amt) + " " + l.no + " " + l.name + " " + x.path;
        return String(hay).toLowerCase().indexOf(q) >= 0;
      });
    }
    var SORT = {
      "d+": function (a, b) { return a.l.d < b.l.d ? -1 : a.l.d > b.l.d ? 1 : (+a.l.no - +b.l.no) || a.i - b.i; },
      "d-": function (a, b) { return a.l.d > b.l.d ? -1 : a.l.d < b.l.d ? 1 : (+b.l.no - +a.l.no) || b.i - a.i; },
      "amt-": function (a, b) { return b.l.amt - a.l.amt; }, "amt+": function (a, b) { return a.l.amt - b.l.amt; },
      "acc": function (a, b) { return a.path.localeCompare(b.path, "ko") || (a.l.d < b.l.d ? -1 : 1); },
      "ptn": function (a, b) { return (a.l.ptn || "").localeCompare(b.l.ptn || "", "ko") || b.l.amt - a.l.amt; },
      "memo": function (a, b) { return (a.l.memo || "").localeCompare(b.l.memo || "", "ko") || b.l.amt - a.l.amt; }
    };
    function lineTable(ls) {
      var mk = function (k, label) { var on = V.sort.replace(/[+-]$/, "") === k; return '<th data-s="' + k + '" class="srt' + (on ? " on" : "") + '">' + label + (on ? (/-$/.test(V.sort) ? " ▼" : " ▲") : "") + "</th>"; };
      return '<table class="ov jl sq"><tr>' + mk("d", "일자") + "<th>번호</th>" + mk("acc", "계정 (분류)") + "<th>더존 과목</th>" + mk("memo", "적요") + mk("ptn", "거래처") + mk("amt", "금액") + "</tr>" +
        ls.slice(0, V.limit).map(function (x) {
          var l = x.l, m = X.memos[lineMemoKey(l)];
          return '<tr class="clk" data-sx="' + x.i + '">' + hlTd(l, "d", "", l.d.replace(/-/g, "/")) + hlTd(l, "no", "", esc(l.no)) + hlTd(l, "acc", "", esc(x.path)) + hlTd(l, "dz", "", esc(dzText({ code: l.code, name: l.name }))) + hlTd(l, "memo", m ? "hasmemo" : "", esc(l.memo), m ? ' data-memo="' + esc(m.text) + '"' : "") + hlTd(l, "ptn", "", esc(l.ptn)) + hlTd(l, "amt", "n", Calc.fmtWon(l.amt)) + "</tr>";
        }).join("") + "</table>" + (ls.length > V.limit ? '<div class="sq-more"><button class="btn" id="sqMore">' + Math.min(PAGE, ls.length - V.limit).toLocaleString() + "줄 더 보기</button> <span class=\"mute\">" + V.limit.toLocaleString() + " / " + ls.length.toLocaleString() + "줄 표시</span></div>" : "");
    }
    function groupTable(ls) {
      var g = {};
      ls.forEach(function (x) { var k = x.id + "|" + x.l.code, y = g[k] = g[k] || { id: x.id, path: x.path, code: x.l.code, name: x.l.name, n: 0, amt: 0, ls: [] }; y.n++; y.amt += x.l.amt; y.ls.push(x); });
      var gl = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.amt - a.amt; });
      return '<table class="maptbl mon"><tr><th>계정</th><th>더존 과목</th><th>건수</th><th>금액</th><th></th></tr>' + gl.map(function (y, i) {
        return '<tr class="clk" data-sg="' + i + '"><td>' + esc(y.path) + "</td><td>" + esc(dzText(y)) + '</td><td class="n">' + y.n + '</td><td class="n"><b>' + Calc.fmtWon(y.amt) + "</b></td><td>" + (V.open === i ? "▴" : "▾") + "</td></tr>" +
          (V.open === i ? '<tr><td colspan="5">' + lineTable(y.ls.sort(SORT[V.sort])) + "</td></tr>" : "");
      }).join("") + "</table>";
    }
    function draw() {
      var ls = pick().sort(SORT[V.sort]), tot = ls.reduce(function (a, x) { return a + x.l.amt; }, 0);
      $("sqSum").innerHTML = "<b>" + ls.length.toLocaleString() + "</b>줄 · <b>" + Calc.fmtWon(tot) + "</b>원" + (ls.length !== all.length ? ' <span class="mute">(전체 ' + all.length.toLocaleString() + "줄)</span>" : "");
      $("sqR").innerHTML = !ls.length ? '<div class="cm-empty">찾는 전표가 없습니다</div>' : V.view === "line" ? lineTable(ls) : groupTable(ls);
      document.querySelectorAll("#sqV [data-v]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === V.view); });
      document.querySelectorAll("#sqF [data-f]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-f") === V.f); });
    }
    var mOpt = '<option value="0">전체 월</option>' + range(X.month).map(function (m) { return '<option value="' + m + '">' + m + "월</option>"; }).join("");
    var tOpt = '<option value="">대분류 전체</option>' + tops.map(function (t) { return '<option>' + esc(t) + "</option>"; }).join("");
    openDialog({ title: "분개장 검색", key: "xsearch", crumb: "집행 › 1~" + X.month + "월 판관비 전표 " + X.lines.length.toLocaleString() + "줄 · 원본 " + X.src.jn, width: 1180, okText: null, cancelText: "닫기", cls: "mdl-sq", enterOk: false,
      body: '<div class="ov-tools"><input class="search" id="sqQ" placeholder="찾기: 거래처 · 적요 · 금액 · 번호 · 계정" style="width:260px">' +
        '<div class="seg vseg2" id="sqF"><button data-f="all">전체</button><button data-f="acc">계정</button><button data-f="ptn">거래처</button><button data-f="memo">적요</button><button data-f="amt">금액</button></div>' +
        '<select class="inp plain" id="sqM" style="width:100px">' + mOpt + '</select><select class="inp plain" id="sqT" style="width:150px">' + tOpt + "</select>" +
        '<div class="seg vseg2" id="sqV"><button data-v="line">전표 목록</button><button data-v="grp">계정별 묶기</button></div><span class="sq-sum" id="sqSum"></span></div>' +
        '<div class="ov-tools dt-hl" id="sqHl">' + hlTools() + '</div><div class="sq-list" id="sqR"></div>',
      extra: '<span class="l">더블클릭 = 전표 전체 · 우클릭 = 메모</span><button class="btn" id="sqXls">엑셀로</button>' });
    $("sqQ").addEventListener("input", function () { V.q = this.value.trim(); V.open = null; V.limit = PAGE; draw(); });
    $("sqM").addEventListener("change", function () { V.m = +this.value; V.limit = PAGE; draw(); });
    $("sqT").addEventListener("change", function () { V.t = this.value; V.limit = PAGE; draw(); });
    $("sqF").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (b) { V.f = b.getAttribute("data-f"); draw(); } });
    $("sqV").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { V.view = b.getAttribute("data-v"); V.open = null; draw(); } });
    $("sqR").addEventListener("click", function (e) {
      if (e.target.id === "sqMore") { V.limit += PAGE; draw(); return; }
      var th = e.target.closest("th[data-s]");
      if (th) { var k = th.getAttribute("data-s"), cur = V.sort.replace(/[+-]$/, ""); V.sort = k === "d" || k === "amt" ? (cur === k ? k + (/-$/.test(V.sort) ? "+" : "-") : k + (k === "amt" ? "-" : "+")) : k; draw(); return; }
      var g = e.target.closest("[data-sg]");
      if (g) { var i = +g.getAttribute("data-sg"); V.open = V.open === i ? null : i; draw(); }
    });
    bindHl($("sqHl"), $("sqR"), function (i) { return X.lines[+i]; }, function () { draw(); hlMark($("sqR"), V); }, V);
    $("sqR").addEventListener("dblclick", function (e) { var tr = e.target.closest("[data-sx]"); if (tr) voucherView(X.lines[+tr.getAttribute("data-sx")]); });
    $("sqR").addEventListener("contextmenu", function (e) {
      var tr = e.target.closest("[data-sx]");
      if (!tr) return;
      e.preventDefault();
      var l = X.lines[+tr.getAttribute("data-sx")];
      memoEdit(lineMemoKey(l), l.d.replace(/-/g, "/") + " #" + l.no + " · " + l.name + " " + Calc.fmtWon(l.amt) + "원", e.clientX, e.clientY, draw);
    });
    $("sqXls").addEventListener("click", function () {
      var aoa = [["일자", "번호", "계정(분류)", "더존코드", "더존과목", "적요", "거래처", "금액", "결의", "PJT", "메모"]];
      pick().sort(SORT[V.sort]).forEach(function (x) { var l = x.l, m = X.memos[lineMemoKey(l)]; aoa.push([l.d, l.no, x.path, l.code, l.name, l.memo, l.ptn, l.amt, l.gj, l.pjt, m ? m.text : ""]); });
      var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [11, 6, 30, 8, 22, 32, 16, 13, 16, 10, 30].map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, "분개장");
      Store.download(wb, "분개장검색_" + S.year + ".xlsx");
    });
    $("sqQ").focus();
    draw();
  }

  /* ---------- 집행 표 클릭 · 우클릭 ---------- */
  function xScopeOf(td) {
    var k = td.getAttribute("data-k"), tr = td.closest("tr"), M = X.month, U = xUpto();
    if (!M || !k) return null;
    var p = parseXK(k), blk, months;
    if (p && p.s === "a") { blk = p.b; months = blkMonths(blk, U).filter(function (m) { return m <= M; }); }
    else if (k === "ca") { blk = "t"; months = range(Math.min(U, M)); }
    else return null;
    if (!months.length) return null;
    var ids, title;
    if (tr.classList.contains("acc") && tr.getAttribute("data-id")) { var h = findLeaf(tr.getAttribute("data-id")); ids = [h.leaf.id]; title = leafPath(h); }
    else if (tr.classList.contains("grp")) { var g = tr.getAttribute("data-grp"); ids = xRows(true).filter(function (r) { return r.l1 === g; }).map(function (r) { return r.id; }); title = g + " (대분류 전체)"; }
    else if (tr.classList.contains("total")) { ids = xRows(true).filter(xVisible).map(function (r) { return r.id; }); title = "합계"; }
    else if (tr.classList.contains("itm")) {
      var of = tr.getAttribute("data-of"), iid = tr.getAttribute("data-iid"), hh = findLeaf(of), it = itemsOf(of).filter(function (x) { return x.id === iid; })[0];
      return hh ? { ids: [of], months: months, blk: blk, item: iid, title: periodLabel(blk, months) + " " + leafPath(hh) + " › " + (it ? it.name : "나머지") } : null;
    }
    else return null;
    return { ids: ids, months: months, blk: blk, title: periodLabel(blk, months) + " " + title };
  }
  function periodLabel(blk, months) {
    if (/^m\d/.test(blk)) return blk.slice(1) + "월";
    if (/^[qh]\d/.test(blk)) return blkName(blk) + (months.length < blkMonths(blk).length ? " (" + months[months.length - 1] + "월까지)" : "");
    return "1~" + months[months.length - 1] + "월";
  }
  function bindExec() {
    $("ctx").addEventListener("click", function (e) {
      var b = e.target.closest("[data-xc]"), x = $("ctx")._x;
      if (!b || !x) return;
      closeCtx();
      var a = b.getAttribute("data-xc");
      if (/^sort/.test(a)) { var d = +a.split(":")[1]; XU.sort = d ? { k: x.k, dir: d } : null; renderAll(); }
      else if (a === "freeze") { XU.freeze = x.k; renderAll(); }
      else if (a === "unfreeze") { XU.freeze = "acc"; renderAll(); }
      else if (a === "detail") detailDialog(x.sc);
      else if (/^colhide:/.test(a)) { var hb = a.slice(8); colHide("exec")[hb] = 1; XU.sort = null; XU.freeze = "acc"; saveViews(); renderAll(); }
      else if (a === "colpop") colPop("exec", x.x, x.y);
      else if (a === "colreset") colReset("exec");
      else if (a === "memo" || a === "unmemo") {
        var key = memoKeyOf(x.id, x.sc.blk);
        if (a === "unmemo") { xChange(function () { delete X.memos[key]; }, "메모 지움: " + x.sc.title); return; }
        memoEdit(key, x.sc.title + " 집행", x.x, x.y);
      }
    });
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

  /* ======================================================================
     화면 분할 — 칸(pane)마다 화면(집행 · 계획) · 연도 · 보기 · 필터를 따로
     · 칸 상태: ui(UI) · xu(XU) · mode · fs(칸 선택) · last · xl
     · 연도 자료(YD): 같은 연도를 띄운 칸끼리 같이 씀 {S, X, PREVX, XJN, undo, redo}
     · 지금 칸(ACT)의 상태를 전역(S · UI · XU …)에 꺼내 놓고 씀 — 다른 칸을 누르면 바꿔 끼움
     ====================================================================== */
  var PANES = [], ACT = null, YD = {}, PANE_TPL = "", SPLIT = { kind: "1", sx: 50, sy: 50 }, BUSY = 0, othersTimer = null, PANE_SAVED = null;
  function freshUI() { return { sel: null, collapsed: {}, nav: { t: "", m: "", s: "" }, onlyWarn: false, search: "", cell: null, sort: null, filters: {}, freeze: "acc", multi: {}, pagg: UI.pagg, cols: clone(UI.cols), hide: clone(UI.hide), itemOpen: {} }; }
  function freshXU() { return { view: XU.view, agg: XU.agg, cmp: "plan", upto: 0, sort: null, quick: "", freeze: "acc", sel: null, cols: clone(XU.cols), hide: clone(XU.hide), itemOpen: {} }; }
  function bundle() { return { S: S, X: X, PREVX: PREVX, XJN: XJN, undo: undoStack, redo: redoStack }; }
  function ctxOut() {
    if (!ACT) return;
    ACT.ui = UI; ACT.xu = XU; ACT.mode = MODE; ACT.fs = FS; ACT.last = LAST; ACT.xl = XL; ACT.year = S.year;
    ACT.data = bundle();
    if (S.year) YD[S.year] = ACT.data;
  }
  function ctxIn(p) {
    var d = p.year && YD[p.year] ? YD[p.year] : p.data;
    if (d) {
      var sh = S;
      S = d.S; X = d.X; PREVX = d.PREVX; XJN = d.XJN; undoStack = d.undo; redoStack = d.redo;
      if (S !== sh) { S.cat = sh.cat; S.ver = sh.ver; S.exclude = sh.exclude; S.years = sh.years; }
    }
    UI = p.ui; XU = p.xu; MODE = p.mode; FS = p.fs; LAST = p.last; XL = p.xl; CUR = p.el; ACT = p;
  }
  function withPane(p, fn) {
    if (!p || p === ACT) return fn();
    var prev = ACT;
    ctxOut(); ctxIn(p);
    try { return fn(); } finally { ctxOut(); ctxIn(prev); }
  }
  // 다른 연도를 띄우기 전에: 같은 연도를 다른 칸도 쓰고 있으면 이 칸만 새 자료로
  function detachS() {
    if (PANES.length < 2 || !S.year) return;
    var sh = S;
    S = { year: null, years: sh.years, settings: clone(sh.settings), cat: sh.cat, plan: {}, rows: [], allRows: [], log: [], lock: { state: "draft", rounds: [] }, ver: sh.ver, exclude: sh.exclude, fmt: {} };
    X = null; PREVX = null; XJN = null; undoStack = []; redoStack = [];
  }
  function activatePane(p) {
    if (p === ACT) return;
    if (editing) commitEdit($("cellEd").value, 0, 0);
    if (savePending) doSave();
    if (Object.keys(XQ).length) xFlush();
    closeCtx(); $("cellEd").hidden = true;
    ctxOut(); ctxIn(p);
    refreshChrome();
  }
  // 칸을 바꾸면: 제목 · 리본 · 상태 줄 · 수식 줄을 지금 칸 기준으로 (표는 그대로)
  function refreshChrome() {
    PANES.forEach(function (q) { q.el.classList.toggle("on", q === ACT); });
    document.body.classList.toggle("mode-exec", MODE === "exec");
    var on = document.querySelector("#rtabs a.on"), tn = on && on.getAttribute("data-tab");
    if (tn === "plan" || tn === "exec") {
      var t = MODE === "exec" ? "exec" : "plan";
      document.querySelectorAll("#rtabs a").forEach(function (x) { x.classList.toggle("on", x.getAttribute("data-tab") === t); });
      ["file", "plan", "exec", "set", "help"].forEach(function (k) { $("rb-" + k).hidden = k !== t; });
    }
    fillYearSelect(); syncSettingSelects(); renderLock();
    $("fileName").textContent = S.year ? "— " + (MODE === "exec" ? Store.execName(S.year) : Store.fileName(S.year)) : "";
    renderUndo();
    if (MODE === "exec") { ensureX(); var rows = xRows(false); xStatus(rows, X.month); if (XU.sel) xFbar(XU.sel); else { $("fRef").textContent = "-"; $("fVal").innerHTML = '<span class="mute">집행 칸을 누르면 내역 · 우클릭하면 메모</span>'; $("stSel").textContent = ""; } $("execPill").textContent = "계획 기준: " + XL.base.label; }
    else { LAST = computeAll(); renderStatus(LAST); }
  }
  // 자료가 바뀌면 다른 칸도 다시 그림 (같은 연도 · 분류 공통)
  function renderOthers() {
    if (PANES.length < 2) return;
    clearTimeout(othersTimer);
    othersTimer = setTimeout(function () {
      PANES.forEach(function (p) { if (p !== ACT) withPane(p, function () { if (p.year && (YD[p.year] || p.data)) renderPane(); }); });
      refreshChrome();
    }, 30);
  }
  function bindPane() {
    var tbl = $("tbl");
    tbl.addEventListener("click", function (e) {
      var ctd = e.target.closest("td");
      if (calcOpen() && ctd && ctd.classList.contains("num") && !ctd.closest("tr.acc")) { calcPickCell(ctd); return; }
      var th = e.target.closest("th.per");
      if (th) { anaPeriod("plan", th.getAttribute("data-k")); return; }
      var g = e.target.closest("tr.grp");
      if (g) {
        var n = g.getAttribute("data-grp");
        if (e.target.closest(".caret")) { UI.collapsed[n] = !UI.collapsed[n]; renderAll(); }
        else if (e.target.closest("[data-an]")) anaNode("plan", { lv: "t", name: n });
        return;
      }
      var tr = e.target.closest("tr.acc");
      if (!tr) return;
      var id = tr.getAttribute("data-id"), td = e.target.closest("td"), k = td && td.getAttribute("data-k");
      if (e.target.closest("[data-itg]")) { UI.itemOpen[id] = !UI.itemOpen[id]; renderAll(); return; }
      var an = e.target.closest("[data-an]");
      if (an && !e.ctrlKey && !e.metaKey && !e.shiftKey && !calcOpen()) { setCell(id, null); anaNode("plan", { lv: an.getAttribute("data-an"), id: id }); return; }
      if (calcOpen() && td && td.classList.contains("num")) { calcPickCell(td); select(id); $("calc").focus(); return; }
      if (e.ctrlKey || e.metaKey) { toggleMulti(id); UI.sel = id; return; }
      if (e.shiftKey) { rangeMulti(id); return; }
      if (Object.keys(UI.multi).length) { UI.multi = {}; renderAll(); }
      setCell(id, editCols().indexOf(k) >= 0 ? k : null);
      if (k === "plan" && !calcOpen()) openPlan(id);
    });
    tbl.addEventListener("dblclick", function (e) { if (e.target.closest("td.ed") && !editing) startEdit(false); });
    tbl.addEventListener("contextmenu", openCtx);
    bindTableDrag($("tbl")); bindColDrag($("tbl"), "plan");
    $("tblState").addEventListener("click", function (e) {
      if (e.target.closest("[data-tbl-reset]")) { UI.sort = null; UI.filters = {}; UI.freeze = "acc"; saveView(); renderAll(); }
      if (e.target.closest("[data-multi-clear]")) { UI.multi = {}; renderAll(); }
    });

    $("pAgg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-pa]");
      if (!b) return;
      UI.pagg = b.getAttribute("data-pa");
      if (UI.cell && tableCols().indexOf(UI.cell.k) < 0) UI.cell = null;
      if (UI.sort && tableCols().indexOf(UI.sort.k) < 0) UI.sort = null;
      if (tableCols().indexOf(UI.freeze) < 0) UI.freeze = "acc";
      Object.keys(UI.filters).forEach(function (k) { if (tableCols().indexOf(k) < 0) delete UI.filters[k]; });
      saveViews(); renderAll();
    });
    $("search").addEventListener("input", function () { UI.search = this.value.trim(); renderAll(); });
    $("navT").addEventListener("change", function () { UI.nav = { t: this.value, m: "", s: "" }; renderAll(); });
    $("navM").addEventListener("change", function () { UI.nav.m = this.value; UI.nav.s = ""; renderAll(); });
    $("navS").addEventListener("change", function () { UI.nav.s = this.value; renderAll(); });
    var t = $("tblX");
    t.addEventListener("click", function (e) {
      var th = e.target.closest("th.per");
      if (th) { anaPeriod("exec", th.getAttribute("data-b")); return; }
      var w = e.target.closest("[data-xwarn]");
      if (w) { alertsDialog(w.getAttribute("data-xwarn")); return; }
      var td = e.target.closest("td");
      if (!td) return;
      if (calcOpen() && td.classList.contains("num")) { var v = Calc.num(td.textContent.replace(/△/, "-").replace(/[^\d.\-]/g, "")) * (Calc.DISP_UNITS[S.settings.dispUnit] || [1])[0]; calcPick(td.closest("tr").querySelector(".c-acc").textContent.replace(/⋮⋮|⚠/g, "").trim() + " · " + xKeyName(td.getAttribute("data-k") || ""), v); $("calc").focus(); return; }
      var tr = td.closest("tr");
      if (tr.classList.contains("grp") && td.getAttribute("data-k") === "acc") {
        if (e.target.closest(".caret")) { var n = "x|" + tr.getAttribute("data-grp"); UI.collapsed[n] = !UI.collapsed[n]; renderAll(); }
        else if (e.target.closest("[data-an]")) anaNode("exec", { lv: "t", name: tr.getAttribute("data-grp") });
        return;
      }
      if (tr.classList.contains("acc") && tr.getAttribute("data-id")) {
        XU.sel = tr.getAttribute("data-id"); t.querySelectorAll("tr.is-sel").forEach(function (x) { x.classList.remove("is-sel"); }); tr.classList.add("is-sel"); xFbar(tr.getAttribute("data-id")); linkSel(XU.sel);
        if (e.target.closest("[data-itg]")) { var iid0 = tr.getAttribute("data-id"); XU.itemOpen[iid0] = !XU.itemOpen[iid0]; renderAll(); return; }
        var an = e.target.closest("[data-an]");
        if (an && !tr.classList.contains("unl")) { anaNode("exec", { lv: an.getAttribute("data-an"), id: tr.getAttribute("data-id") }); return; }
      }
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
      var bk = cell.getAttribute("data-b") || (k && parseXK(k) ? parseXK(k).b : k);
      if (!k && bk) k = xKeys().filter(function (x) { var q = parseXK(x); return q && q.b === bk; }).pop();
      if (k) { items.push('<div class="ctx-h">' + esc(k === "acc" ? "계정" : xKeyName(k)) + " 열</div>"); it("sort:1", "▲ 오름차순 정렬"); it("sort:-1", "▼ 내림차순 정렬"); if (XU.sort) it("sort:0", "정렬 해제"); it("freeze", "📌 틀 고정 — 여기까지"); if (XU.freeze !== "acc") it("unfreeze", "틀 고정 해제"); }
      if (k) {
        items.push('<div class="ctx-sep"></div>');
        if (k !== "acc" && bk) it("colhide:" + bk, "🙈 이 열 숨기기" + (isTri(bk) && XU.agg !== "cum" ? " (" + esc(blkName(bk, xUpto(), X.month)) + " 묶음)" : ""));
        it("colpop", "열 보이기 · 숨기기…"); it("colreset", "↺ 열 순서 · 숨김 처음대로");
      }
      if (sc && id) {
        var mk = memoKeyOf(id, sc.blk);
        items.push('<div class="ctx-sep"></div>');
        it("memo", "✎ 메모 " + (X.memos[mk] ? "고치기" : "쓰기")); if (X.memos[mk]) it("unmemo", "메모 지우기");
        it("detail", "내역 보기");
      } else if (sc) { items.push('<div class="ctx-sep"></div>'); it("detail", "내역 보기"); }
      var c = $("ctx");
      c.innerHTML = items.join("");
      c._x = { k: k, sc: sc, id: id, x: e.clientX, y: e.clientY };
      place(c, e.clientX, e.clientY);
    });
    $("xTools").addEventListener("click", function (e) {
      var v = e.target.closest("[data-xv]"), a = e.target.closest("[data-xa]"), q = e.target.closest("[data-xq]");
      if (v) { XU.view = v.getAttribute("data-xv"); XU.freeze = "acc"; saveViews(); renderAll(); }
      if (a) { XU.agg = a.getAttribute("data-xa"); XU.sort = null; XU.freeze = "acc"; saveViews(); renderAll(); }
      if (q) { XU.quick = XU.quick === q.getAttribute("data-xq") ? "" : q.getAttribute("data-xq"); renderAll(); }
    });
    $("xCmp").addEventListener("change", function () { XU.cmp = this.value; renderAll(); });
    $("xUpto").addEventListener("change", function () { XU.upto = +this.value; renderAll(); });
    CUR.querySelectorAll(".sheets [data-sheet]").forEach(function (a) { a.addEventListener("click", function () { setMode(a.getAttribute("data-sheet")); }); });
    bindTableDrag($("tblX")); bindColDrag($("tblX"), "exec");
    $("tbl").addEventListener("scroll", function () { if (UI.cell) placeEd(); });
    $("tbl").addEventListener("mousedown", function (e) { fmtDown(e, "tbl"); });
    $("tblX").addEventListener("mousedown", function (e) { fmtDown(e, "tblX"); });
    initStrip();
    $("kpis").addEventListener("click", function (e) {
      var a = e.target.closest("[data-sel]");
      if (a) { var id = a.getAttribute("data-sel"); if (MODE === "exec") { XU.sel = id; renderAll(); var tr = $("tblX").querySelector('tr.acc[data-id="' + id + '"]'); if (tr) tr.scrollIntoView({ block: "center" }); xFbar(id); } else { UI.nav = { t: "", m: "", s: "" }; renderAll(); select(id, true); } return; }
      if (e.target.closest('[data-sw="warn"]')) { UI.onlyWarn = !UI.onlyWarn; renderAll(); return; }
      var q = e.target.closest("[data-sq]");
      if (q) { XU.quick = XU.quick === q.getAttribute("data-sq") ? "" : q.getAttribute("data-sq"); renderAll(); }
    });
    var me = CUR;
    // 칸 머리: 연도 · 선택 연동 · 닫기
    me.querySelector(".pane-year").addEventListener("change", function () { var v = parseInt(this.value, 10); if (v && v !== S.year) switchYear(v); });
    me.querySelector(".pane-lk").addEventListener("change", function () { ACT.link = this.checked; savePanes(); });
    me.querySelector(".pane-x").addEventListener("click", function () { closePane(ACT); });
    // 이 칸을 누르면 이 칸이 지금 칸이 됨 (다른 동작보다 먼저)
    ["mousedown", "contextmenu", "focusin", "dragstart", "wheel"].forEach(function (ev) {
      me.addEventListener(ev, function (e) {
        var p = PANES.filter(function (q) { return q.el === me; })[0];
        if (!p || p === ACT) return;
        if (BUSY) { e.preventDefault(); e.stopPropagation(); toast("처리 중입니다 — 잠시 뒤에 누르세요"); return; }
        activatePane(p);
      }, true);
    });
  }
  /* 칸 배치: 1 · lr(좌우) · tb(상하) · 3 · 4 — 칸 사이 경계선을 끌어 크기 조절 */
  function layoutPanes() {
    var box = $("panes"), n = PANES.length, k = n === 1 ? "1" : n === 2 ? (SPLIT.kind === "tb" ? "tb" : "lr") : n === 3 ? "3" : "4";
    box.querySelectorAll(".gut").forEach(function (g) { g.remove(); });
    box.className = "panes" + (n > 1 ? " multi" : "");
    var sx = SPLIT.sx + "%", sy = SPLIT.sy + "%", place = function (el, r, c) { el.style.gridRow = r; el.style.gridColumn = c; };
    var gut = function (dir, r, c) { var g = document.createElement("div"); g.className = "gut " + dir; g.setAttribute("data-gut", dir); place(g, r, c); box.appendChild(g); };
    if (k === "1") { box.style.gridTemplateColumns = "1fr"; box.style.gridTemplateRows = "1fr"; place(PANES[0].el, "1", "1"); }
    else if (k === "lr") { box.style.gridTemplateColumns = sx + " 6px 1fr"; box.style.gridTemplateRows = "1fr"; place(PANES[0].el, "1", "1"); place(PANES[1].el, "1", "3"); gut("v", "1", "2"); }
    else if (k === "tb") { box.style.gridTemplateColumns = "1fr"; box.style.gridTemplateRows = sy + " 6px 1fr"; place(PANES[0].el, "1", "1"); place(PANES[1].el, "3", "1"); gut("h", "2", "1"); }
    else {
      box.style.gridTemplateColumns = sx + " 6px 1fr"; box.style.gridTemplateRows = sy + " 6px 1fr";
      if (k === "3") { place(PANES[0].el, "1 / 4", "1"); place(PANES[1].el, "1", "3"); place(PANES[2].el, "3", "3"); gut("v", "1 / 4", "2"); gut("h", "2", "3"); }
      else { place(PANES[0].el, "1", "1"); place(PANES[1].el, "1", "3"); place(PANES[2].el, "3", "1"); place(PANES[3].el, "3", "3"); gut("v", "1 / 4", "2"); gut("h", "2", "1 / 4"); }
    }
    document.querySelectorAll("#splitCtl [data-split]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-split") === (n === 3 ? "" : k)); });
  }
  function addPane(mode, year) {
    var el = document.createElement("div");
    el.className = "pane";
    el.innerHTML = PANE_TPL;
    $("panes").appendChild(el);
    var prev = ACT;
    ctxOut();
    var p = { el: el, ui: freshUI(), xu: freshXU(), mode: mode || (MODE === "exec" ? "plan" : "exec"), fs: null, last: null, xl: null, year: S.year, data: bundle(), link: true, strip: { h: 0, shut: true } };
    PANES.push(p);
    ctxIn(p);
    el.classList.toggle("mode-exec", MODE === "exec");
    el.querySelectorAll(".sheets [data-sheet]").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-sheet") === MODE); });
    bindPane();
    if (S.year) renderPane();
    ctxOut(); ctxIn(prev);
    if (year && year !== p.year && S.years.indexOf(year) >= 0) { activatePane(p); switchYear(year); }
    return p;
  }
  function closePane(p) {
    if (PANES.length < 2) return;
    if (p === ACT) activatePane(PANES.filter(function (q) { return q !== p; })[0]);
    PANES.splice(PANES.indexOf(p), 1);
    p.el.remove();
    if (PANES.length === 2 && SPLIT.kind === "4") SPLIT.kind = "lr";
    layoutPanes(); savePanes(); refreshChrome();
  }
  function setSplit(kind) {
    var n = kind === "1" ? 1 : kind === "4" ? 4 : 2;
    if (!S.year && n > 1) { toast("먼저 연도를 여세요"); return; }
    if (n < PANES.length && PANES.indexOf(ACT) >= n) activatePane(PANES[0]);
    while (PANES.length > n) { var q = PANES.pop(); q.el.remove(); }
    SPLIT.kind = kind;
    while (PANES.length < n) addPane();
    layoutPanes(); savePanes(); refreshChrome();
    renderOthers();
  }
  function savePanes() {
    try { localStorage.setItem("budget.panes", JSON.stringify({ kind: SPLIT.kind, sx: SPLIT.sx, sy: SPLIT.sy, panes: PANES.map(function (p) { return { mode: p === ACT ? MODE : p.mode, year: p === ACT ? S.year : p.year, link: p.link !== false }; }) })); } catch (e) { /* 저장소 막힘 */ }
  }
  // 시작할 때 지난번 분할 그대로 (첫 칸은 이미 열린 연도)
  function restorePanes() {
    var v = PANE_SAVED;
    PANE_SAVED = null;
    if (!v || !v.panes || v.panes.length < 2 || !S.year) return;
    SPLIT.kind = v.kind || "lr"; SPLIT.sx = v.sx || 50; SPLIT.sy = v.sy || 50;
    v.panes.slice(1, 4).forEach(function (q) { var p = addPane(q.mode, q.year); p.link = q.link !== false; p.el.querySelector(".pane-lk").checked = p.link; });
    activatePane(PANES[0]);
    layoutPanes();
  }
  // 선택 연동: 한 칸에서 계정을 고르면 연동 켠 다른 칸도 그 계정으로
  function linkSel(id) {
    if (PANES.length < 2 || !id) return;
    PANES.forEach(function (p) {
      if (p === ACT || p.link === false) return;
      p.ui.sel = id; p.xu.sel = id;
      var tb = p.el.querySelector(p.mode === "exec" ? "#tblX" : "#tbl");
      if (!tb) return;
      tb.querySelectorAll("tr.is-sel").forEach(function (x) { x.classList.remove("is-sel"); });
      var tr = tb.querySelector('tr.acc[data-id="' + String(id).replace(/["\\]/g, "\\$&") + '"]');
      if (tr) { tr.classList.add("is-sel", "linked"); setTimeout(function () { tr.classList.remove("linked"); }, 900); tr.scrollIntoView({ block: "nearest" }); }
    });
  }
  function bindSplit() {
    $("splitCtl").addEventListener("click", function (e) { var b = e.target.closest("[data-split]"); if (b) setSplit(b.getAttribute("data-split")); });
    var drag0 = null;
    $("panes").addEventListener("mousedown", function (e) {
      var g = e.target.closest("[data-gut]");
      if (!g) return;
      e.preventDefault();
      drag0 = g.getAttribute("data-gut");
      document.body.classList.add("resizing");
    });
    document.addEventListener("mousemove", function (e) {
      if (!drag0) return;
      var r = $("panes").getBoundingClientRect();
      if (drag0 === "v") SPLIT.sx = Math.max(15, Math.min(85, (e.clientX - r.left) / r.width * 100));
      else SPLIT.sy = Math.max(15, Math.min(85, (e.clientY - r.top) / r.height * 100));
      layoutPanes();
    });
    document.addEventListener("mouseup", function () { if (drag0) { drag0 = null; document.body.classList.remove("resizing"); savePanes(); if (UI.cell) placeEd(); } });
  }

  /* ---------- 사용 설명서 (js/help.js) ---------- */
  function manualDialog() {
    var H = (window.HELP || []).map(function (sec) { return [sec[0], sec[1].filter(function (t) { return HAS_TEST || t.indexOf("@test ") !== 0; }).map(function (t) { return t.replace(/^@test /, ""); })]; }), cur = 0, q = "";
    var draw = function () {
      var hit = function (t) { return !q || t.replace(/<[^>]+>/g, "").toLowerCase().indexOf(q) >= 0; };
      $("mnToc").innerHTML = H.map(function (sec, i) { var n = sec[1].filter(hit).length; return '<div class="vi' + (i === cur ? " on" : "") + (q && !n ? " done" : "") + '" data-mn="' + i + '"><b>' + esc(sec[0]) + "</b>" + (q ? ' <span class="cnt">' + n + "</span>" : "") + "</div>"; }).join("");
      var list = q ? H.map(function (sec) { return [sec[0], sec[1].filter(hit)]; }).filter(function (x) { return x[1].length; }) : [H[cur]];
      $("mnBody").innerHTML = list.length ? list.map(function (sec) { return "<h3>" + esc(sec[0]) + "</h3><ul>" + sec[1].map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>"; }).join("") : '<div class="cm-empty">찾는 내용이 없습니다</div>';
    };
    openDialog({ title: "사용 설명서 · v" + APP_VER, key: "manual", crumb: "도움말", width: 1000, okText: null, cancelText: "닫기", enterOk: false,
      body: '<div class="ov-tools"><input class="search" id="mnQ" placeholder="설명서에서 찾기 (예: 확정 항목 · 분할 · 서식)" style="width:320px"></div><div class="vh mn"><div class="vh-list" id="mnToc"></div><div class="vh-body mn-body" id="mnBody"></div></div>' });
    $("mnToc").addEventListener("click", function (e) { var it = e.target.closest("[data-mn]"); if (it) { cur = +it.getAttribute("data-mn"); q = ""; $("mnQ").value = ""; draw(); } });
    $("mnQ").addEventListener("input", function () { q = this.value.trim().toLowerCase(); draw(); });
    draw();
  }

  /* ---------- 이벤트 ---------- */
  function act(name) {
    var needYear = ["importPrev", "export", "addAcc", "editAcc", "delAcc", "openPlan", "toggleAll", "onlyWarn", "undo", "redo", "undoList", "redoList", "reload", "lockPlan", "openChange", "cancelChange", "rounds", "bulk", "planTplDown", "planTplUp"];
    if (needYear.indexOf(name) >= 0 && !S.year) { toast("먼저 데이터 폴더를 연결하고 연도를 여세요"); return; }
    switch (name) {
      case "newYear": return Store.connected() ? newYearDialog() : toast("먼저 데이터 폴더를 연결하세요");
      case "reload": return askSave(function () { return Store.loadMaster().then(function (mst) {
        if (mst) { S.cat = mst.cat; S.ver = mst.ver; S.exclude = mst.exclude || []; ensureIds(S.cat); }
        return loadYear(S.year);
      }).then(function () { toast("파일에서 다시 불러왔습니다"); }); }, "파일에서 다시 불러옵니다");
      case "export": Store.exportReport(S); return toast("보고용 엑셀을 내려받았습니다");
      case "changeFolder": return askSave(askFolder, "다른 데이터 폴더로 바꿉니다");
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
      case "saveAll": return saveAll("button");
      case "restoreStart": return restoreStart();
      case "takeOwner": return takeOwner();
      case "manual": return manualDialog();
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
      case "undoList": return undoList("undo");
      case "redoList": return undoList("redo");
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
      if (e.target.closest("#saveState") && Object.keys(SVS).some(function (k) { return SVS[k].st === "err"; })) { retrySaves(); return; }
    });

    $("cellEd").addEventListener("dblclick", function () { if (!editing) startEdit(false); });
    bindCellEd();
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
    $("fpop").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cv]"), el = $("fpop"), scr = el._cv;
      if (!b || !scr) return;
      if (b.getAttribute("data-cv") === "reset") { closeCtx(); colReset(scr); return; }
      var hide = {}, any = false;
      el.querySelectorAll(".cvB").forEach(function (c) { if (!c.checked) hide[c.value] = 1; else any = true; });
      if (!any) { toast("열을 하나 이상 남겨 두세요", true); return; }
      if (scr === "plan") UI.hide[UI.pagg] = hide; else XU.hide[XU.agg] = hide;
      el._cv = null; closeCtx(); saveViews(); renderAll();
    });
    $("fpop").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); filterApply($("fpop").getAttribute("data-k")); } });
    document.addEventListener("mousedown", function (e) { if (!e.target.closest("#ctx,#fpop")) closeCtx(); });
    ["selYear", "selYearX"].forEach(function (k) {
      $(k).addEventListener("change", function () {
        var v = this.value;
        fillYearSelect();
        if (v === "new") { newYearDialog(); return; }
        switchYear(parseInt(v, 10));
      });
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
      if ((e.ctrlKey || e.metaKey) && /^[biu]$/i.test(e.key) && FS && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); fmtApply(e.key.toLowerCase()); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveAll("button"); return; }
      if (MODE === "exec") {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); $("search").focus(); $("search").select(); }
        if ((e.ctrlKey || e.metaKey) && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
        if ((e.ctrlKey || e.metaKey) && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
        if (e.key === "Escape" && FS) { FS = null; fmtRepaint(); }
        if (e.key === "Escape") { closeCtx(); $("memoEd").hidden = true; }
        return;
      }
      var inField = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      var k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z" && !inField) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "y" && !inField) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "f") { e.preventDefault(); $("search").focus(); $("search").select(); return; }

      if (inField) { if (e.key === "Escape" && e.target.id === "search") { e.target.value = ""; UI.search = ""; renderAll(); e.target.blur(); } return; }
      if (e.key === "Escape") { closeCtx(); if (Object.keys(UI.multi).length) { UI.multi = {}; renderAll(); } else if (UI.cell) { UI.cell = null; markCell(); } return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); moveCell(0, e.key === "ArrowDown" ? 1 : -1); }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && UI.cell) { e.preventDefault(); moveCell(e.key === "ArrowLeft" ? -1 : 1, 0); }
      else if (e.key === "Tab" && UI.cell) { e.preventDefault(); moveCell(e.shiftKey ? -1 : 1, 0); }
      else if (e.key === "Enter" && UI.sel) { e.preventDefault(); if (UI.cell && UI.cell.k !== "plan") startEdit(false); else openPlan(); }
      else if (e.key === "Delete" && UI.sel && !UI.cell) { e.preventDefault(); delAcc(); }
    });

    window.addEventListener("beforeunload", function (e) {
      if (hasUnsaved()) { doSave(); xFlush(); e.preventDefault(); e.returnValue = ""; }
    });
  }

  /* ---------- 시작 ---------- */
  function start() {
    try { UI.freeze = localStorage.getItem("budget.freeze") || "acc"; } catch (e) { UI.freeze = "acc"; }
    loadViews();
    var pm = document.getElementById("paneMain");
    PANE_TPL = pm.innerHTML;
    ACT = { el: pm, ui: UI, xu: XU, mode: MODE, fs: null, last: null, xl: null, year: null, data: null, link: true, strip: null };
    PANES = [ACT]; CUR = pm;
    initRibbons(); bindCalc(); bindExec(); bindFmt(); bindPane(); bindSplit();
    if (!HAS_TEST) { var tb = document.getElementById("btnTestData"); if (tb) tb.remove(); }
    var vb = document.getElementById("coverVer"); if (vb) vb.textContent = "v" + APP_VER;
    $("mascot").addEventListener("click", eggShow);
    $("eggBody").addEventListener("click", eggShow);
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
      cover("데이터 폴더를 연결하세요", "프로그램 폴더 옆의 <b>storage</b> 폴더를 고르세요. (<code>program</code> 폴더가 아니라 <code>storage</code>)<br>그 안에 <b>data</b> · <b>backup</b> 폴더를 만들어 엑셀 파일로 저장하고, 더존 파일은 <b>더존원본</b> 폴더에 넣습니다.<br>프로그램을 새 버전으로 바꿀 때는 <b>program</b> 폴더만 교체하면 되고, storage 는 건드리지 않습니다. 한 번 연결하면 다음부터는 자동으로 연결됩니다.", [
        { label: "폴더 연결", primary: true, fn: askFolder }
      ]);
    });
  }

  document.addEventListener("DOMContentLoaded", start);
})();
