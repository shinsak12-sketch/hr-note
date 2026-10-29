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
    lock: { state: "draft", rounds: [] }, ver: { list: [], snaps: {} }
  };
  var UI = { sel: null, collapsed: {}, group: "", onlyWarn: false, search: "" };
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
        prev: p.prev, meth: p.meth, a: p.a, b: p.b, c: p.c, split: p.split, sv: p.sv.slice(), memo: p.memo };
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
    S.plan[id] = { prev: d.prev, meth: d.meth, a: d.a, b: d.b, c: d.c, split: d.split, sv: d.sv.slice(), memo: d.memo };
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
    var job = (wasMaster ? Store.saveMaster(S.cat, S.ver) : Promise.resolve())
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
    if (UI.group && r.l1 !== UI.group) return false;
    if (UI.onlyWarn && !needsCheck(r)) return false;
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
    renderTable(LAST); renderSummary(LAST); renderChips(LAST); renderBars(); renderStatus(LAST); renderLock();
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
    if (isFinite(v) && Math.abs(v) >= 0.3) cls += " big";
    return '<td class="num yoy ' + cls + '">' + Calc.fmtPct(v) + "</td>";
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
    var y = S.year, h = [], showBefore = !!R.base, closed = isClosed();
    h.push('<table class="plan"><thead><tr><th class="c-acc">계정</th><th>' + (y - 1) + "년 실적</th><th>" + y + "년 계획</th>" +
      (showBefore ? '<th class="c-before">변경 전<br><small>' + roundLabel(R.base.n) + "</small></th>" : "") + "<th>증감률</th>");
    for (var i = 1; i <= 12; i++) h.push("<th>" + i + "월</th>");
    h.push('<th style="min-width:300px">비고 (산출근거 · 메모)</th></tr></thead><tbody>');
    var shown = 0, filtered = !!(UI.group || UI.onlyWarn || UI.search);
    R.groups.forEach(function (g) {
      var rows = g.rows.filter(visible);
      if (!rows.length) return;
      var shut = !!UI.collapsed[g.name] && !UI.search && !UI.onlyWarn;
      h.push('<tr class="grp" data-grp="' + esc(g.name) + '"><td class="c-acc"><span class="caret">' + (shut ? "▸" : "▾") + "</span>" + esc(g.name) +
        '<span class="cnt">' + g.rows.length + "</span></td>" +
        '<td class="num">' + u(g.prev) + '</td><td class="num">' + u(g.plan) + "</td>" +
        (showBefore ? '<td class="num c-before">' + u(g.before) + "</td>" : "") + yoyCell(g.prev ? g.plan / g.prev - 1 : NaN) +
        g.m.map(function (v) { return '<td class="num">' + u(v) + "</td>"; }).join("") + "<td></td></tr>");
      if (shut) return;
      rows.forEach(function (r) {
        shown++;
        var c = r._c, sel = UI.sel === r.id, miss = c.missing && !r.out;
        h.push('<tr class="acc' + (miss ? " missing" : "") + (r.out ? " out" : "") + (r._chg ? " chg" : "") + (sel ? " is-sel" : "") + '" data-id="' + esc(r.id) + '"' + (filtered ? "" : ' draggable="true"') + ">" +
          '<td class="c-acc">' + (filtered ? '<span class="grip off"></span>' : '<span class="grip" title="끌어서 순서 바꾸기">⋮⋮</span>') +
          (r.l3 ? '<span class="l2">' + esc(r.l2) + ' ›</span><span class="l3">' + esc(r.l3) + "</span>" : '<span class="l3">' + esc(r.l2) + "</span>") +
          (r.dz.length ? '<span class="erp" title="더존: ' + esc(r.dz.map(dzText).join(", ")) + '">' + esc(dzShort(r.dz)) + "</span>" : "") +
          (r.out ? '<span class="flag outf" title="마감 뒤에 생긴 계정 — 계획 없이 실적만 들어갑니다">계획 외</span>' : "") +
          (r._chg ? '<span class="flag chgf">변경</span>' : "") +
          (c.check && !r.out ? '<span class="flag" title="' + esc(c.check) + '">분할 확인</span>' : "") + "</td>" +
          '<td class="num">' + u(r.prev) + "</td>" +
          '<td class="num plan-v" title="' + (r.out ? "계획 외 계정" : closed ? "마감됨 — 클릭하면 산출 내용 보기" : "클릭해서 산출 입력") + '">' +
          (r.out ? '<span class="outv">-</span>' : c.missing ? '<span class="need">입력 필요</span>' :
            '<span class="pv">' + u(c.plan) + '</span><span class="badge ' + ({ "균등": "b-eq", "수기": "b-man", "비율": "b-rat" }[r.split]) + '">' + esc(r.split) + "</span>") + "</td>" +
          (showBefore ? '<td class="num c-before">' + u(r._before) + "</td>" : "") +
          (c.missing ? '<td class="num"></td>' : yoyCell(c.yoy)) +
          c.months.map(function (v) { return '<td class="num m' + (v === 0 && !c.missing ? " zero" : "") + '">' + (c.missing ? "" : u(v)) + "</td>"; }).join("") +
          '<td class="c-note"><span class="basis">' + esc(Calc.basisText(r, S.settings)) + "</span>" + (r.memo ? '<span class="memo">' + esc(r.memo) + "</span>" : "") + "</td></tr>");
      });
    });
    var t = R.tot;
    h.push('<tr class="total"><td class="c-acc">합계' + (filtered ? ' <span class="cnt">(전체 기준)</span>' : "") + '</td><td class="num">' + u(t.prev) +
      '</td><td class="num">' + u(t.plan) + "</td>" + (showBefore ? '<td class="num">' + u(t.before) + "</td>" : "") + yoyCell(t.prev ? t.plan / t.prev - 1 : NaN) +
      t.m.map(function (v) { return '<td class="num">' + u(v) + "</td>"; }).join("") + "<td></td></tr>");
    h.push("</tbody></table>");
    if (!shown && filtered) h.push('<div class="empty">조건에 맞는 계정이 없습니다.</div>');
    var top = el.scrollTop, left = el.scrollLeft;
    el.innerHTML = h.join("");
    el.scrollTop = top; el.scrollLeft = left;
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

  function renderChips(R) {
    var h = ['<span class="chip' + (!UI.group ? " on" : "") + '" data-chip="">전체</span>'];
    R.groups.forEach(function (g) { h.push('<span class="chip' + (UI.group === g.name ? " on" : "") + '" data-chip="' + esc(g.name) + '">' + esc(g.name) + "</span>"); });
    var w = R.missing + R.checks;
    if (w) h.push('<span class="chip warn' + (UI.onlyWarn ? " on" : "") + '" data-chip-warn="1">확인 필요 ' + w + "</span>");
    $("chips").innerHTML = h.join("");
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
    if (c.missing) { $("fVal").innerHTML = '<span class="w">산출 방식이 없습니다</span>' + (isClosed() ? " — 마감 때 0원으로 확정됨" : " — 더블클릭하거나 Enter 를 눌러 입력하세요"); return; }
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
    var d = { prev: r.prev, meth: r.meth, a: r.a, b: r.b, c: r.c, split: r.split, sv: r.sv.slice(), memo: r.memo };
    if (!d.meth) { d.meth = "%증감"; d.a = 0; }
    if (!(Calc.num(d.c) > 0) && (d.meth === "인원" || d.meth === "단가×수량")) d.c = 12;

    function fields() {
      switch (d.meth) {
        case "%증감": return [["증감률 (%)", "pa", d.a, { kind: "pct", noHint: true, ph: "예: 3 (=3%)" }]];
        case "절대증감": return [["증감액 (원)", "pa", d.a, { ph: "감액은 −" }]];
        case "인원": return [["인당 월액 (원)", "pa", d.a], ["인원 (명)", "pb", d.b, { kind: "int", noHint: true }], ["개월", "pc", d.c, { kind: "int", noHint: true }]];
        case "단가×수량": return [["단가 (원)", "pa", d.a], ["수량", "pb", d.b, { kind: "int", noHint: true }], ["개월", "pc", d.c, { kind: "int", noHint: true }]];
        default: return [["연간 금액 (원)", "pa", d.a]];
      }
    }

    function leftHtml() {
      var h = '<div class="f-row"><label>전년 실적</label>' + moneyInput("pPrev", d.prev) + "</div>" +
        '<div class="f-row"><label>산출 방식</label><div class="seg" id="segM">' + Calc.METHODS.map(function (m) {
          return '<button data-m="' + m + '" class="' + (m === d.meth ? "on" : "") + '">' + m + "</button>";
        }).join("") + "</div></div>";
      fields().forEach(function (f) { h += '<div class="f-row"><label>' + f[0] + "</label>" + moneyInput(f[1], f[2], f[3]) + "</div>"; });
      h += '<div class="f-row"><label>월 분할</label><div class="seg" id="segS">' + Calc.SPLITS.map(function (s) {
        return '<button data-s="' + s + '" class="' + (s === d.split ? "on" : "") + '">' + s + "</button>";
      }).join("") + "</div></div>";
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
      root.querySelectorAll("[data-sv]").forEach(function (el) { d.sv[+el.getAttribute("data-sv")] = readInput(el); });
      d.memo = $("pMemo").value;
    }

    function preview() {
      var c = Calc.compute(d, S.settings);
      $("pPreview").innerHTML = '<div class="pv-title">미리보기</div><div class="pv-total"><span>확정 계획액</span><b>' + Calc.fmtWon(c.plan) + " 원</b><small>" +
        u(c.plan, true) + " " + unitName() + " · 전년 대비 " + (Calc.fmtPct(c.yoy) || "-") + "</small></div>" +
        '<div class="pv-grid">' + c.months.map(function (v, i) { return "<div><span>" + (i + 1) + "월</span><b>" + u(v) + "</b></div>"; }).join("") + "</div>" +
        '<div class="pv-basis">' + esc(Calc.basisText(d, S.settings)) + (d.memo ? " · " + esc(d.memo) : "") + "</div>" +
        '<div class="pv-note">표 금액 단위: ' + unitName() + " · 월 금액은 " + S.settings.rndUnit + " 단위 " + S.settings.rndMode + " · 확정 계획액 = 월 금액의 합" +
        (d.split === "균등" ? "<br>산출 금액 " + Calc.fmtWon(c.base) + " 원 ÷ 12" : "") + "</div>" +
        (c.check ? '<div class="pv-warn">⚠ ' + (d.split === "비율" ? "월 비율의 합이 100%가 아닙니다 (" + (c.svSum * 100).toFixed(1) + "%)" :
          "월 금액의 합이 산출 금액과 " + Calc.fmtWon(Math.abs(c.checkDiff)) + " 원 " + (c.checkDiff > 0 ? "많습니다" : "적습니다")) + "</div>" : "");
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
        if (hEl) { var v = readInput(el); hEl.textContent = v ? "= " + u(v, true) + " " + unitName() : ""; }
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
          else { d.a = 0; d.b = 0; d.c = 12; }
          build();
          var f = $("pa"); if (f) f.focus();
        });
      });
      root.querySelectorAll("#segS button").forEach(function (b) {
        b.addEventListener("click", function () {
          readAll(root);
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
      var base = Calc.baseAmount(d);
      if (f === "clear") d.sv = new Array(12).fill(0);
      else if (d.split === "비율") d.sv = new Array(12).fill(1 / 12);
      else d.sv = new Array(12).fill(Math.round(base / 12));
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
          UI.sel = id; delete UI.collapsed[l1]; UI.group = UI.group && UI.group !== l1 ? "" : UI.group;
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

  /* ---------- 표에서 줄 끌어 순서 바꾸기 (같은 상위 안에서) ---------- */
  function siblings(a, b) { return !!(a && b && (a.sub ? b.sub && a.mid === b.mid : !b.sub && a.top === b.top)); }
  var drag = null;
  function bindTableDrag() {
    var tbl = $("tbl");
    tbl.addEventListener("dragstart", function (e) {
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
    if (!S.year && !Store.folderName()) { toast("먼저 데이터 폴더를 연결하세요"); return; }
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
  function closePlan() {
    if (!S.year || isClosed()) return;
    var R = LAST, open = isChanging(), cur = curRound(), n = open ? cur.n : 0, base = lastClosed();
    var t = R.tot.plan;
    openDialog({
      title: open ? roundLabel(n) + " 마감" : "계획 마감", crumb: S.year + "년 사업비 계획", width: 540,
      body: '<div class="mdl-pad msg"><b>' + S.year + "년 계획 " + roundLabel(n) + "</b>을 마감합니다.<br>" +
        "합계 <b>" + Calc.fmtWon(t) + "원</b>" + (base ? " (" + roundLabel(base.n) + " " + Calc.fmtWon(base.total) + "원 · 차이 " + (t - base.total >= 0 ? "+" : "") + Calc.fmtWon(t - base.total) + "원 · 바뀐 계정 " + R.changed + "개)" : "") + "<br>" +
        (R.missing ? '<span class="em">입력 필요 ' + R.missing + "개 계정은 0원으로 마감됩니다.</span><br>" : "") +
        "마감하면 계획 금액 · 산출 방식 · 전년 실적 · 반올림 설정을 바꿀 수 없고, 금액 있는 계정은 분류에서 옮기거나 지울 수 없습니다. 바꿔야 하면 <b>[계획 변경]</b>을 엽니다." +
        (open ? '<div class="f-row" style="margin-top:10px"><label>변경 사유</label><input class="inp plain" id="lkReason" value="' + esc(cur.reason) + '" placeholder="선택 — 예: 하반기 인원 충원"></div>' : "") + "</div>",
      okText: open ? "변경 마감" : "마감",
      onOk: function () {
        var s = snapNow(), now = Store.stamp();
        if (open) { cur.closedAt = now; cur.snap = s.snap; cur.total = s.total; cur.reason = $("lkReason").value.trim(); }
        else S.lock.rounds.push({ n: 0, closedAt: now, openedAt: "", reason: "", total: s.total, snap: s.snap });
        S.lock.state = "closed";
        lockDone(S.year + "년 계획 " + roundLabel(n) + " 마감 — 합계 " + Calc.fmtWon(s.total) + "원");
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
          setPlan(id, { prev: e.prev, meth: e.meth, a: e.a, b: e.b, c: e.c, split: e.split, sv: e.sv, memo: e.memo, out: !!e.out });
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
      var moved = adoptOrphans();
      if (moved.length) { addLog("소분류로 나뉜 계정의 입력값을 첫 소분류로 옮김: " + moved.join(", ")); converted = true; }
      undoStack = []; redoStack = [];
      deriveRows();
      UI.sel = S.rows.length ? S.rows[0].id : null;
      UI.group = ""; UI.collapsed = {};
      try { localStorage.setItem("budget.lastYear", String(y)); } catch (e) { /* 저장소 막힘 */ }
      syncSettingSelects();
      fillYearSelect();
      renderAll();
      setSave("ok", st.savedAt ? "마지막 저장 " + st.savedAt.slice(5, 16) : "불러옴");
      if (st.legacy) {
        addLog("0.1 판 파일을 새 형식(분류 ID)으로 바꿈");
        toast("이전 형식 파일을 새 형식으로 바꿨습니다 (분류는 " + Store.MASTER + ")", false, 4000);
      }
      if (converted || masterDirty) scheduleSave();
    }, function (e) {
      toast(y + "년 파일을 읽지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }

  function switchYear(y) { return flushSave().then(function () { return loadYear(y); }); }

  function newYearDialog() {
    var def = S.years.length ? Math.max.apply(null, S.years) + 1 : new Date().getFullYear() + 1;
    var can = !!S.year;
    var mode = can ? "inherit" : "empty";
    function opt(v, title, sub, dis) {
      return '<label class="opt' + (v === mode ? " on" : "") + '"' + (dis ? ' style="opacity:.45;pointer-events:none"' : "") + '><input type="radio" name="nyMode" value="' + v + '"' + (v === mode ? " checked" : "") + (dis ? " disabled" : "") +
        "><div><b>" + title + "</b><small>" + sub + "</small></div></label>";
    }
    openDialog({
      title: "새 연도 만들기", width: 520,
      body: '<div class="mdl-pad"><div class="f-row"><label>계획 연도</label><input class="inp num" id="nyYear" data-kind="int" value="' + def + '" style="width:120px"></div>' +
        opt("inherit", can ? S.year + "년 이어받기 (추천)" : "이전 연도 이어받기 (열린 연도가 없음)", "산출 방식 · 입력값 · 월 분할 · 메모를 그대로 복사합니다. 전년 실적 칸은 비우므로 [전년 실적 가져오기]로 채우세요.", !can) +
        opt("empty", "빈 계획으로 시작", "분류(계정)는 그대로 쓰고 계획 입력값만 비웁니다." + (leafCount(S.cat) ? "" : " 분류가 아직 없으면 만든 뒤 분류 관리가 열립니다.")) +
        '<div class="pv-warn" id="nyErr"></div></div>',
      okText: "만들기",
      onOk: function () {
        var y = parseInt($("nyYear").value, 10);
        var m = (document.querySelector('input[name="nyMode"]:checked') || {}).value;
        if (!(y >= 2000 && y <= 2100)) { $("nyErr").textContent = "2000 ~ 2100 사이 연도를 넣으세요."; return false; }
        if (S.years.indexOf(y) >= 0) { $("nyErr").textContent = y + "년 파일이 이미 있습니다. 연도 목록에서 고르세요."; return false; }
        createYear(y, m);
      }
    });
    document.querySelectorAll('input[name="nyMode"]').forEach(function (el) {
      el.addEventListener("change", function () {
        document.querySelectorAll(".opt").forEach(function (o) { o.classList.toggle("on", o.querySelector("input").checked); });
      });
    });
  }

  function createYear(y, mode) {
    var from = S.year;
    flushSave().then(function () {
      var plan = {};
      if (mode === "inherit") Object.keys(S.plan).forEach(function (id) { var p = clone(S.plan[id]); p.prev = 0; delete p.out; plan[id] = p; });
      keepYearLock();
      S.year = y; S.plan = plan; S.lock = { state: "draft", rounds: [] };
      S.log = [{ t: Store.stamp(), m: y + "년 파일 만듦" + (from && mode === "inherit" ? " (" + from + "년에서 이어받음)" : "") }];
      undoStack = []; redoStack = [];
      deriveRows();
      UI.sel = S.rows.length ? S.rows[0].id : null;
      var m = masterDirty;
      masterDirty = false;
      return (m ? Store.saveMaster(S.cat, S.ver) : Promise.resolve()).then(function () { return Store.save(S); });
    }).then(function () { return Store.listYears(); }).then(function (ys) {
      S.years = ys; fillYearSelect(); syncSettingSelects(); renderAll();
      setSave("ok", "자동 저장됨 " + Store.stamp().slice(11, 16));
      toast(y + "년 파일을 만들었습니다 — data\\" + Store.fileName(y));
      if (!leafCount(S.cat)) setTimeout(catDialog, 300);
    }).catch(function (e) { toast("새 연도를 만들지 못했습니다: " + (e && e.message || e), true, 6000); });
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
    var head = (aoa[best] || []).map(function (v) { return String(v); });
    var find = function (re, not) { for (var i = 0; i < head.length; i++) if (re.test(head[i]) && i !== not) return i; return -1; };
    var code = find(/코드/);
    var name = find(/계정명|과목명|계정|과목|소분류/, code);
    var amt = find(/실적|집행|금액|합계/);
    if (amt < 0) {
      var counts = head.map(function () { return 0; });
      aoa.slice(best + 1, best + 40).forEach(function (row) { (row || []).forEach(function (v, i) { if (typeof v === "number") counts[i] = (counts[i] || 0) + 1; }); });
      amt = counts.indexOf(Math.max.apply(null, counts.concat([0])));
    }
    return { head: best, code: code, name: name, amt: amt < 0 ? 1 : amt };
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
      var aoa = sheets[si].aoa, sums = {}, n = 0, bad = {};
      aoa.slice(g.head + 1).forEach(function (row) {
        row = row || [];
        var code = g.code >= 0 ? String(row[g.code] === undefined ? "" : row[g.code]).trim() : "";
        var name = g.name >= 0 ? String(row[g.name] === undefined ? "" : row[g.name]).trim() : "";
        var v = row[g.amt];
        if ((!code && !name) || (typeof v !== "number" && !(String(v).trim() && isFinite(Calc.num(v))))) return;
        n++;
        var pc = parseDz(code), pn = parseDz(name);
        var ck = (pc && pc.code) || (pn && pn.code) || code, nk = nm((pn && pn.name) || (pc && !pc.code ? pc.name : ""));
        var id = (ck && byCode[ck]) || (nk && byName[nk]);
        if (!id) { bad[code || name] = 1; return; }
        sums[id] = (sums[id] || 0) + Calc.num(v);
      });
      var matched = S.rows.filter(function (r) { return sums[r.id] !== undefined; });
      var notInFile = S.rows.filter(function (r) { return sums[r.id] === undefined; });
      return { sums: sums, lines: n, matched: matched, notInFile: notInFile, notInPlan: Object.keys(bad) };
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
        "<br>더존 코드가 같은 계정에 먼저 맞추고, 없으면 더존 과목명 · 계정명으로 맞춥니다. 같은 계정이 여러 줄이면 합산합니다.</div>" +
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
        S.cat = mst.cat; S.ver = mst.ver;
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
            "분류는 " + (mst ? "기준정보.xlsx 의 분류" : "<b>기본 분류</b>(내부 자료 작성용 서식)") + " — " + esc(catCounts(S.cat)) + " 가 들어 있습니다.<br>새 연도를 만들어 시작하거나, 샘플 계획으로 화면을 둘러보세요.", [
            { label: "새 연도 만들기", primary: true, fn: function () { hideCover(); newYearDialog(); } },
            { label: "샘플 계획으로 둘러보기 (2027년)", fn: function () { hideCover(); makeSample(); } },
            { label: "다른 폴더 고르기", fn: askFolder }
          ]);
          return;
        }
        hideCover();
        var last = 0;
        try { last = parseInt(localStorage.getItem("budget.lastYear"), 10); } catch (e) { last = 0; }
        return loadYear(S.years.indexOf(last) >= 0 ? last : S.years[S.years.length - 1]);
      });
    }).catch(function (e) {
      toast("폴더를 읽지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }

  // 샘플: 지금 분류(없으면 기본 분류)에 그럴듯한 금액을 넣은 2027년 계획
  function makeSample() {
    if (!leafCount(S.cat)) { S.cat = baseCat(); ensureIds(S.cat); addVersion("기본 탑재", "샘플용"); }
    keepYearLock();
    S.year = 2027;
    S.settings = { dispUnit: "천원", rndUnit: "천원", rndMode: "반올림" };
    S.lock = { state: "draft", rounds: [] };
    S.plan = {};
    var scale = { "임원보수": 1.2e9, "직원급여": 7.8e9, "상여금": 1.1e9, "잡급여": 1.6e8, "퇴직급여": 6.5e8 };
    var k = 0, rnd = function () { k++; var x = Math.sin(k * 77.7) * 10000; return x - Math.floor(x); };
    eachLeaf(S.cat, function (t, m, sub, lf) {
      var p = Calc.blankPlan(), r = rnd();
      p.prev = Math.round((scale[t.name] || 4e6 + 9.6e7 * rnd() * rnd()) * (0.85 + 0.3 * r) / 10000) * 10000;
      var pick = k % 9;
      if (pick === 4) { p.meth = "절대증감"; p.a = Math.round(p.prev * 0.05 / 100000) * 100000; }
      else if (pick === 6) { p.meth = "단가×수량"; p.a = Math.round(p.prev / 12 / 25 / 1000) * 1000; p.b = 25; p.c = 12; p.memo = "월 25건 기준"; }
      else if (pick === 7 && k % 2) { p.meth = "수기"; p.a = Math.round(p.prev * 1.1 / 100000) * 100000; p.split = "비율"; p.sv = [0, 0, .15, .1, .1, .05, 0, 0, .15, .15, .2, .1]; p.memo = "상·하반기 집중"; }
      else if (k % 23 === 5) { p.meth = ""; }
      else { p.meth = "%증감"; p.a = [0.03, 0.05, 0, -0.05, 0.08, 0.02][k % 6]; }
      S.plan[lf.id] = p;
    });
    S.log = [{ t: Store.stamp(), m: "샘플 데이터로 2027년 파일 만듦" }];
    clearUndo();
    deriveRows();
    UI.sel = S.rows.length ? S.rows[0].id : null;
    syncSettingSelects();
    var mm = masterDirty;
    masterDirty = false;
    (mm ? Store.saveMaster(S.cat, S.ver) : Promise.resolve()).then(function () { return Store.save(S); }).then(function () { return Store.listYears(); }).then(function (ys) {
      S.years = ys; fillYearSelect(); renderAll();
      setSave("ok", "자동 저장됨 " + Store.stamp().slice(11, 16));
      toast("샘플 2027년 파일을 만들었습니다 — data\\" + Store.fileName(2027));
    }).catch(function (e) { toast("샘플을 만들지 못했습니다: " + (e && e.message || e), true, 6000); });
  }

  /* ---------- 이벤트 ---------- */
  function act(name) {
    var needYear = ["importPrev", "export", "addAcc", "editAcc", "delAcc", "openPlan", "toggleAll", "onlyWarn", "undo", "redo", "reload", "lockPlan", "openChange", "cancelChange", "rounds"];
    if (needYear.indexOf(name) >= 0 && !S.year) { toast("먼저 데이터 폴더를 연결하고 연도를 여세요"); return; }
    switch (name) {
      case "newYear": return Store.folderName() ? newYearDialog() : toast("먼저 데이터 폴더를 연결하세요");
      case "reload": return flushSave().then(function () { return Store.loadMaster(); }).then(function (mst) {
        if (mst) { S.cat = mst.cat; S.ver = mst.ver; ensureIds(S.cat); }
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
        document.querySelectorAll("#rtabs a").forEach(function (x) { x.classList.toggle("on", x === tab); });
        ["file", "plan", "set", "help"].forEach(function (t) { $("rb-" + t).hidden = t !== tab.getAttribute("data-tab"); });
        return;
      }
      var soon = e.target.closest("[data-soon]");
      if (soon) { toast("'" + soon.getAttribute("data-soon") + "' 화면은 다음 단계에서 만듭니다"); return; }
      var chip = e.target.closest("[data-chip]");
      if (chip) { UI.group = chip.getAttribute("data-chip"); renderAll(); return; }
      if (e.target.closest("[data-chip-warn]")) { UI.onlyWarn = !UI.onlyWarn; renderAll(); return; }
      if (e.target.closest("#saveState") && saveFailed) { doSave(); return; }
    });

    var tbl = $("tbl");
    tbl.addEventListener("click", function (e) {
      var g = e.target.closest("tr.grp");
      if (g) { var n = g.getAttribute("data-grp"); UI.collapsed[n] = !UI.collapsed[n]; renderAll(); return; }
      var tr = e.target.closest("tr.acc");
      if (!tr) return;
      var id = tr.getAttribute("data-id");
      select(id);
      if (e.target.closest("td.plan-v")) openPlan(id);
    });
    tbl.addEventListener("dblclick", function (e) {
      var tr = e.target.closest("tr.acc");
      if (tr && !e.target.closest("td.plan-v")) openPlan(tr.getAttribute("data-id"));
    });
    bindTableDrag();

    $("search").addEventListener("input", function () { UI.search = this.value.trim(); renderAll(); });
    $("selYear").addEventListener("change", function () {
      var v = this.value;
      if (v === "new") { fillYearSelect(); newYearDialog(); return; }
      switchYear(parseInt(v, 10));
    });
    [["selDisp", "dispUnit", "표시 단위"], ["selRnd", "rndUnit", "반올림 단위"], ["selMode", "rndMode", "반올림 방식"]].forEach(function (x) {
      $(x[0]).addEventListener("change", function () {
        var v = this.value, old = S.settings[x[1]];
        if (!S.year) return;
        if (x[1] !== "dispUnit" && guardClosed(x[2] + (x[1] === "rndMode" ? "을" : "를") + " 바꾸려면")) { this.value = old; return; }
        change(function () { S.settings[x[1]] = v; }, x[2] + ": " + old + " → " + v);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (dlg) {
        if (e.key === "Escape") { e.preventDefault(); closeDialog(); }
        else if (e.key === "Enter" && dlg.enterOk && !e.shiftKey && e.target.tagName !== "BUTTON" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "SELECT") {
          var ok = $("modal").querySelector("[data-ok]");
          if (ok) { e.preventDefault(); ok.click(); }
        }
        return;
      }
      if (!$("cover").hidden) return;
      var inField = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      var k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z" && !inField) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "y" && !inField) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "f") { e.preventDefault(); $("search").focus(); $("search").select(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "s") { e.preventDefault(); doSave(); return; }
      if (inField) { if (e.key === "Escape" && e.target.id === "search") { e.target.value = ""; UI.search = ""; renderAll(); e.target.blur(); } return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var ids = visibleIds(), i = ids.indexOf(UI.sel);
        var j = e.key === "ArrowDown" ? Math.min(ids.length - 1, i + 1) : Math.max(0, i - 1);
        if (ids[j]) select(ids[j], true);
      } else if (e.key === "Enter" && UI.sel) { e.preventDefault(); openPlan(); }
      else if (e.key === "Delete" && UI.sel) { e.preventDefault(); delAcc(); }
    });

    window.addEventListener("beforeunload", function (e) {
      if (savePending || saving) { doSave(); e.preventDefault(); e.returnValue = ""; }
    });
  }

  /* ---------- 시작 ---------- */
  function start() {
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
