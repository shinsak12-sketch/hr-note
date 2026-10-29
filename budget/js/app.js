/* 사업비 관리 프로그램 — 사업비 계획 화면 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ---------- 상태 ---------- */
  var S = { year: null, years: [], settings: { dispUnit: "천원", rndUnit: "천원", rndMode: "반올림" }, rows: [], log: [] };
  var UI = { sel: null, collapsed: {}, group: "", onlyWarn: false, search: "" };
  var undoStack = [], redoStack = [];
  var saveTimer = null, saving = false, savePending = false, saveFailed = false;

  function rowBy(code) {
    for (var i = 0; i < S.rows.length; i++) if (String(S.rows[i].code) === String(code)) return S.rows[i];
    return null;
  }
  function u(v, keepZero) { return Calc.fmtUnit(v, S.settings.dispUnit, keepZero); }
  function unitName() { return S.settings.dispUnit; }

  /* ---------- 변경 · 실행 취소 · 자동 저장 ---------- */
  function snapshot() { return JSON.stringify({ rows: S.rows, settings: S.settings }); }
  function restoreSnap(s) { var o = JSON.parse(s); S.rows = o.rows; S.settings = o.settings; }

  function change(fn, logMsg) {
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    fn();
    if (logMsg) addLog(logMsg);
    renderAll();
    scheduleSave();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restoreSnap(undoStack.pop());
    addLog("실행 취소");
    renderAll(); scheduleSave(); toast("실행 취소했습니다");
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restoreSnap(redoStack.pop());
    addLog("다시 실행");
    renderAll(); scheduleSave(); toast("다시 실행했습니다");
  }
  function addLog(m) {
    S.log.push({ t: Store.stamp(), m: m });
    if (S.log.length > 2000) S.log.shift();
  }

  function scheduleSave() {
    if (!S.year) return;
    savePending = true;
    setSave("saving", "저장 대기…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 700);
  }
  function doSave(opts) {
    clearTimeout(saveTimer);
    if (saving) { saveTimer = setTimeout(doSave, 300); return Promise.resolve(); }
    if (!S.year) return Promise.resolve();
    saving = true; savePending = false;
    setSave("saving", "저장 중…");
    return Store.save(S, opts).then(function (t) {
      saving = false; saveFailed = false;
      setSave("ok", "자동 저장됨 " + t.slice(11, 16));
      if (savePending) scheduleSave();
    }, function (e) {
      saving = false; saveFailed = true; savePending = true;
      setSave("error", "저장 실패 — 클릭해서 다시 저장");
      toast("저장하지 못했습니다. 엑셀에서 " + Store.fileName(S.year) + " 파일을 열어 두었다면 닫은 뒤 다시 저장하세요. (" + (e && e.name || e) + ")", true, 6000);
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
  }

  /* ---------- 계산 결과 묶음 ---------- */
  function computeAll() {
    var groups = Calc.groupRows(S.rows), tot = { prev: 0, plan: 0, m: new Array(12).fill(0) }, missing = 0, checks = 0;
    groups.forEach(function (g) {
      g.prev = 0; g.plan = 0; g.m = new Array(12).fill(0);
      g.rows.forEach(function (r) {
        r._c = Calc.compute(r, S.settings);
        g.prev += Calc.num(r.prev); g.plan += r._c.plan;
        r._c.months.forEach(function (v, i) { g.m[i] += v; });
        if (r._c.missing) missing++;
        if (r._c.check) checks++;
      });
      tot.prev += g.prev; tot.plan += g.plan;
      g.m.forEach(function (v, i) { tot.m[i] += v; });
    });
    return { groups: groups, tot: tot, missing: missing, checks: checks };
  }
  function needsCheck(r) { return r._c.missing || !!r._c.check; }

  function visible(r) {
    if (UI.group && (r.l1 || "(대분류 없음)") !== UI.group) return false;
    if (UI.onlyWarn && !needsCheck(r)) return false;
    if (UI.search) {
      var q = UI.search.toLowerCase();
      var hay = [r.code, r.l1, r.l2, r.l3, r.memo].join(" ").toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  /* ---------- 그리기 ---------- */
  var LAST = null;
  function renderAll() {
    LAST = computeAll();
    renderTable(LAST); renderSummary(LAST); renderChips(LAST); renderBars(); renderStatus(LAST);
    $("fileName").textContent = S.year ? "— " + Store.fileName(S.year) : "";
    $("btnUndo").disabled = !undoStack.length;
    $("btnRedo").disabled = !redoStack.length;
    $("btnWarn").classList.toggle("on", UI.onlyWarn);
    var anyOpen = LAST.groups.some(function (g) { return !UI.collapsed[g.name]; });
    $("foldText").textContent = anyOpen ? "모두 접기" : "모두 펼치기";
  }

  function yoyCell(v, extra) {
    var cls = v === Infinity ? "up" : !isFinite(v) ? "flat" : v > 0.0005 ? "up" : v < -0.0005 ? "down" : "flat";
    if (isFinite(v) && Math.abs(v) >= 0.3) cls += " big";
    return '<td class="num yoy ' + cls + '"' + (extra || "") + ">" + Calc.fmtPct(v) + "</td>";
  }

  function renderTable(R) {
    var el = $("tbl");
    if (!S.year) { el.innerHTML = ""; return; }
    if (!S.rows.length) {
      el.innerHTML = '<div class="empty"><b>계정이 없습니다.</b><br>리본의 [계정 추가]로 계정을 만들거나, [새 연도 만들기]에서 이전 연도를 이어받으세요.<br>' +
        '<button class="btn primary" data-act="addAcc">＋ 계정 추가</button></div>';
      return;
    }
    var y = S.year, h = [];
    h.push('<table class="plan"><thead><tr><th class="c-acc">계정</th><th>' + (y - 1) + "년 실적</th><th>" + y + "년 계획</th><th>증감률</th>");
    for (var i = 1; i <= 12; i++) h.push("<th>" + i + "월</th>");
    h.push('<th style="min-width:300px">비고 (산출근거 · 메모)</th></tr></thead><tbody>');
    var shown = 0;
    R.groups.forEach(function (g) {
      var rows = g.rows.filter(visible);
      if (!rows.length) return;
      var closed = !!UI.collapsed[g.name] && !UI.search && !UI.onlyWarn;
      h.push('<tr class="grp" data-grp="' + esc(g.name) + '"><td class="c-acc"><span class="caret">' + (closed ? "▸" : "▾") + "</span>" + esc(g.name) +
        '<span class="cnt">' + g.rows.length + "</span></td>" +
        '<td class="num">' + u(g.prev) + '</td><td class="num">' + u(g.plan) + "</td>" + yoyCell(g.prev ? g.plan / g.prev - 1 : NaN) +
        g.m.map(function (v) { return '<td class="num">' + u(v) + "</td>"; }).join("") + "<td></td></tr>");
      if (closed) return;
      rows.forEach(function (r) {
        shown++;
        var c = r._c, sel = String(UI.sel) === String(r.code);
        h.push('<tr class="acc' + (c.missing ? " missing" : "") + (sel ? " is-sel" : "") + '" data-code="' + esc(r.code) + '">' +
          '<td class="c-acc"><span class="code">' + esc(r.code) + '</span><span class="l2">' + esc(r.l2) + '</span><span class="l3">' + esc(r.l3) + "</span>" +
          (c.check ? '<span class="flag" title="' + esc(c.check) + '">분할 확인</span>' : "") + "</td>" +
          '<td class="num">' + u(r.prev) + "</td>" +
          '<td class="num plan-v" title="클릭해서 산출 입력">' + (c.missing ? '<span class="need">입력 필요</span>' :
            '<span class="pv">' + u(c.plan) + '</span><span class="badge ' + ({ "균등": "b-eq", "수기": "b-man", "비율": "b-rat" }[r.split]) + '">' + esc(r.split) + "</span>") + "</td>" +
          (c.missing ? '<td class="num"></td>' : yoyCell(c.yoy)) +
          c.months.map(function (v) { return '<td class="num m' + (v === 0 && !c.missing ? " zero" : "") + '">' + (c.missing ? "" : u(v)) + "</td>"; }).join("") +
          '<td class="c-note"><span class="basis">' + esc(Calc.basisText(r, S.settings)) + "</span>" + (r.memo ? '<span class="memo">' + esc(r.memo) + "</span>" : "") + "</td></tr>");
      });
    });
    var t = R.tot;
    h.push('<tr class="total"><td class="c-acc">합계' + (UI.group || UI.onlyWarn || UI.search ? ' <span class="cnt">(전체 기준)</span>' : "") + '</td><td class="num">' + u(t.prev) +
      '</td><td class="num">' + u(t.plan) + "</td>" + yoyCell(t.prev ? t.plan / t.prev - 1 : NaN) +
      t.m.map(function (v) { return '<td class="num">' + u(v) + "</td>"; }).join("") + "<td></td></tr>");
    h.push("</tbody></table>");
    if (!shown && (UI.search || UI.onlyWarn || UI.group)) h.push('<div class="empty">조건에 맞는 계정이 없습니다.</div>');
    var top = el.scrollTop, left = el.scrollLeft;
    el.innerHTML = h.join("");
    el.scrollTop = top; el.scrollLeft = left;
  }

  function renderSummary(R) {
    var t = R.tot, y = S.year, d = t.plan - t.prev, n = S.rows.length, done = n - R.missing;
    var yoy = t.prev ? t.plan / t.prev - 1 : NaN;
    var maxI = 0;
    t.m.forEach(function (v, i) { if (v > t.m[maxI]) maxI = i; });
    var k = [
      '<div class="kpi kpi-plan"><div class="k-label">' + (y || "") + '년 계획 총액</div><div class="k-value">' + u(t.plan, true) + "<small>" + unitName() + '</small></div><div class="k-sub">' + ((y || 1) - 1) + "년 실적 " + u(t.prev, true) + "</div></div>",
      '<div class="kpi"><div class="k-label">전년 대비</div><div class="k-value ' + (yoy > 0 ? "up" : yoy < 0 ? "down" : "") + '">' + (Calc.fmtPct(yoy) || "-") + '</div><div class="k-sub">증감액 ' + (d >= 0 ? "+" : "") + u(d, true) + " " + unitName() + "</div></div>",
      '<div class="kpi"><div class="k-label">입력 완료</div><div class="k-value">' + done + " / " + n + '<small>계정</small></div><div class="k-prog"><i style="width:' + (n ? done / n * 100 : 0).toFixed(1) + '%"></i></div><div class="k-sub">' +
        (R.missing ? R.missing + "개 계정 입력 필요" : "모두 입력됨") + (R.checks ? " · 분할 확인 " + R.checks : "") + "</div></div>",
      '<div class="kpi"><div class="k-label">가장 큰 달</div><div class="k-value">' + (t.plan ? (maxI + 1) + "월" : "-") + '</div><div class="k-sub">' + (t.plan ? u(t.m[maxI], true) + " " + unitName() + " (월평균 " + u(t.plan / 12, true) + ")" : "") + "</div></div>"
    ];
    $("kpis").innerHTML = k.join("");
  }

  function renderBars() {
    var R = LAST, mx = 0;
    R.groups.forEach(function (g) { if (g.plan > mx) mx = g.plan; });
    $("cats").innerHTML = R.groups.slice(0, 6).map(function (g) {
      var share = R.tot.plan ? g.plan / R.tot.plan * 100 : 0;
      return '<div class="cat" title="' + esc(g.name) + " " + u(g.plan, true) + unitName() + '"><span class="cat-n">' + esc(g.name) +
        '</span><span class="cat-bar"><i style="width:' + (mx ? g.plan / mx * 100 : 0).toFixed(1) + '%"></i></span><span class="cat-v">' + share.toFixed(1) + "%</span></div>";
    }).join("") + (R.groups.length > 6 ? '<div class="cat"><span class="cat-n">외 ' + (R.groups.length - 6) + "개</span></div>" : "");
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
    $("stCount").textContent = S.year ? "계정 " + S.rows.length + " · 입력 필요 " + R.missing + (R.checks ? " · 분할 확인 " + R.checks : "") : "";
    $("stSum").textContent = S.year ? "합계: " + u(R.tot.plan, true) + " " + unitName() : "";
    renderFbar();
  }

  function renderFbar() {
    var r = rowBy(UI.sel);
    if (!r || !r._c) { $("fRef").textContent = "-"; $("fVal").innerHTML = ""; $("stSel").textContent = ""; return; }
    var c = r._c;
    $("fRef").textContent = r.code + " " + r.l3;
    $("stSel").textContent = "선택: " + r.code + " " + r.l3;
    if (c.missing) { $("fVal").innerHTML = '<span class="w">산출 방식이 없습니다</span> — 더블클릭하거나 Enter 를 눌러 입력하세요'; return; }
    $("fVal").innerHTML = esc(Calc.basisText(r, S.settings)) + "<em>=</em>" + u(c.plan, true) + " " + unitName() +
      " · " + esc(r.split) + " 분할" + (r.memo ? " · 메모: " + esc(r.memo) : "") + (c.check ? '<span class="w">' + esc(c.check) + "</span>" : "");
  }

  function select(code, scroll) {
    UI.sel = code;
    var el = $("tbl");
    var prev = el.querySelector("tr.is-sel");
    if (prev) prev.classList.remove("is-sel");
    var tr = el.querySelector('tr.acc[data-code="' + cssEsc(code) + '"]');
    if (tr) {
      tr.classList.add("is-sel");
      if (scroll) tr.scrollIntoView({ block: "nearest" });
    }
    renderFbar();
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }
  function visibleCodes() {
    return Array.prototype.map.call($("tbl").querySelectorAll("tr.acc"), function (tr) { return tr.getAttribute("data-code"); });
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
    m.innerHTML = '<div class="mdl-back"></div><div class="mdl" role="dialog" style="width:' + (o.width || 520) + 'px">' +
      '<div class="mdl-head"><div>' + (o.crumb ? '<div class="mdl-crumb">' + esc(o.crumb) + "</div>" : "") + '<div class="mdl-title">' + esc(o.title) + "</div></div>" +
      '<button class="mdl-x" data-x="1" title="닫기 (Esc)">✕</button></div>' +
      '<div class="mdl-body">' + o.body + "</div>" +
      '<div class="mdl-foot">' + (o.footLeft || "") + (o.extra || "") +
      (o.noCancel ? "" : '<button class="btn" data-x="1">' + (o.cancelText || "취소") + "</button>") +
      (o.okText === null ? "" : '<button class="btn ' + (o.danger ? "danger" : "primary") + '" data-ok="1">' + (o.okText || "확인") + "</button>") + "</div></div>";
    dlg = { el: m.querySelector(".mdl"), onOk: o.onOk, onClose: o.onClose };
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
    return Calc.num(v) ? Calc.fmtWon(Calc.num(v)) : (v === 0 ? "" : "");
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
        var k = el.getAttribute("data-kind");
        if (k === "won" && el.value.trim() !== "") el.value = Calc.fmtWon(Calc.num(el.value));
      });
      el.addEventListener("focus", function () { setTimeout(function () { el.select(); }, 0); });
    });
  }

  /* ---------- 산출 입력 팝업 ---------- */
  function openPlan(code) {
    var r = rowBy(code || UI.sel);
    if (!r) { toast("먼저 계정을 선택하세요"); return; }
    select(r.code);
    var d = JSON.parse(JSON.stringify(r));
    delete d._c;
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
      var s = '<div class="pv-title">미리보기</div><div class="pv-total"><span>확정 계획액</span><b>' + Calc.fmtWon(c.plan) + " 원</b><small>" +
        u(c.plan, true) + " " + unitName() + " · 전년 대비 " + (Calc.fmtPct(c.yoy) || "-") + "</small></div>" +
        '<div class="pv-grid">' + c.months.map(function (v, i) { return "<div><span>" + (i + 1) + "월</span><b>" + u(v) + "</b></div>"; }).join("") + "</div>" +
        '<div class="pv-basis">' + esc(Calc.basisText(d, S.settings)) + (d.memo ? " · " + esc(d.memo) : "") + "</div>" +
        '<div class="pv-note">표 금액 단위: ' + unitName() + " · 월 금액은 " + S.settings.rndUnit + " 단위 " + S.settings.rndMode + " · 확정 계획액 = 월 금액의 합" +
        (d.split === "균등" ? "<br>산출 금액 " + Calc.fmtWon(c.base) + " 원 ÷ 12" : "") + "</div>" +
        (c.check ? '<div class="pv-warn">⚠ ' + (d.split === "비율" ? "월 비율의 합이 100%가 아닙니다 (" + (c.svSum * 100).toFixed(1) + "%)" :
          "월 금액의 합이 산출 금액과 " + Calc.fmtWon(Math.abs(c.checkDiff)) + " 원 " + (c.checkDiff > 0 ? "많습니다" : "적습니다")) + "</div>" : "");
      $("pPreview").innerHTML = s;
      var tools = $("mTools");
      if (tools) {
        if (d.split === "비율") tools.innerHTML = "월 비율 합계 <span class=\"" + (Math.abs(c.svSum - 1) < 0.0005 ? "ok" : "bad") + "\">" + (c.svSum * 100).toFixed(1) + "%</span>" +
          '<button class="btn" data-fill="even">12개월 균등</button><button class="btn" data-fill="clear">비우기</button>';
        else tools.innerHTML = "월 합계 <b>" + Calc.fmtWon(c.svSum) + "</b> / 산출 금액 " + Calc.fmtWon(c.base) +
          (Math.round(c.checkDiff) ? ' <span class="bad">차이 ' + Calc.fmtWon(c.checkDiff) + "</span>" : ' <span class="ok">일치</span>') +
          '<button class="btn" data-fill="even">산출 금액 ÷ 12</button><button class="btn" data-fill="clear">비우기</button>';
      }
      // 금액 입력 옆 단위 환산
      document.querySelectorAll(".mdl input.inp.num").forEach(function (el) {
        var hEl = document.getElementById(el.id + "_h");
        if (hEl) { var v = readInput(el); hEl.textContent = v ? "= " + u(v, true) + " " + unitName() : ""; }
      });
    }

    function build() {
      $("pLeft").innerHTML = leftHtml();
      var root = $("pLeft");
      wireInputs(root, function () { readAll(root); preview(); });
      $("pMemo").addEventListener("input", function () { readAll(root); preview(); });
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
      title: r.code + " " + r.l3, crumb: [r.l1, r.l2].filter(Boolean).join(" › "), width: 880,
      body: '<div class="split2"><div class="mdl-pad" id="pLeft"></div><div class="mdl-pad preview" id="pPreview"></div></div>',
      footLeft: '<span class="l">Enter 확인 · Esc 취소</span>',
      extra: r.meth ? '<button class="btn danger" id="pClear">입력 지우기</button>' : "",
      okText: "확인",
      onOk: function () {
        readAll($("pLeft"));
        var c = Calc.compute(d, S.settings), before = r._c ? r._c.plan : 0;
        change(function () {
          var t = rowBy(r.code);
          ["prev", "meth", "a", "b", "c", "split", "sv", "memo"].forEach(function (k) { t[k] = d[k]; });
        }, r.code + " " + r.l3 + " 산출 입력: " + (r.meth ? Calc.fmtWon(before) + " → " : "") + Calc.fmtWon(c.plan) + "원 (" + d.meth + ", " + d.split + ")");
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
      change(function () {
        var t = rowBy(r.code), keepPrev = t.prev, b = Calc.blankRow(t);
        Object.keys(b).forEach(function (k) { if (k !== "code" && k !== "l1" && k !== "l2" && k !== "l3") t[k] = b[k]; });
        t.prev = keepPrev;
      }, r.code + " " + r.l3 + " 산출 입력 지움");
      toast("입력을 지웠습니다 (Ctrl+Z 로 되돌리기)");
    });
    var a = $("pa");
    if (a) setTimeout(function () { a.focus(); }, 40);
  }

  /* ---------- 계정 추가 · 수정 · 삭제 ---------- */
  function accDialog(edit) {
    var r = edit ? rowBy(UI.sel) : null;
    if (edit && !r) { toast("수정할 계정을 먼저 선택하세요"); return; }
    var l1s = {}, l2s = {};
    S.rows.forEach(function (x) { if (x.l1) l1s[x.l1] = 1; if (x.l2) l2s[x.l2] = 1; });
    var base = r || rowBy(UI.sel) || {};
    var v = edit ? r : { code: suggestCode(base), l1: base.l1 || "", l2: base.l2 || "", l3: "" };
    openDialog({
      title: edit ? "계정 수정" : "계정 추가", width: 460,
      body: '<div class="mdl-pad">' +
        '<div class="f-row"><label>코드</label><input class="inp plain" id="aCode" value="' + esc(v.code) + '"></div>' +
        '<div class="f-row"><label>대분류</label><input class="inp plain" id="aL1" list="dl1" value="' + esc(v.l1) + '"></div>' +
        '<div class="f-row"><label>중분류</label><input class="inp plain" id="aL2" list="dl2" value="' + esc(v.l2) + '"></div>' +
        '<div class="f-row"><label>소분류 (계정명)</label><input class="inp plain" id="aL3" value="' + esc(v.l3) + '"></div>' +
        '<div class="f-row"><span></span><div class="hint">표는 코드 순서로 정렬되고, 대분류가 같은 계정끼리 소계로 묶입니다.</div></div>' +
        '<datalist id="dl1">' + Object.keys(l1s).map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>" +
        '<datalist id="dl2">' + Object.keys(l2s).map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>" +
        '<div class="pv-warn" id="aErr"></div></div>',
      okText: edit ? "저장" : "추가",
      onOk: function () {
        var code = $("aCode").value.trim(), l1 = $("aL1").value.trim(), l2 = $("aL2").value.trim(), l3 = $("aL3").value.trim();
        var err = !code ? "코드를 넣으세요." : !l1 ? "대분류를 넣으세요." : !l3 ? "소분류(계정명)를 넣으세요." :
          (rowBy(code) && (!edit || String(code) !== String(r.code))) ? "코드 " + code + " 은(는) 이미 있습니다." : "";
        if (err) { $("aErr").textContent = err; return false; }
        if (edit) {
          var old = r.code + " " + r.l3;
          change(function () { var t = rowBy(r.code); t.code = code; t.l1 = l1; t.l2 = l2; t.l3 = l3; UI.sel = code; },
            "계정 수정: " + old + " → " + code + " " + l3);
          toast("계정을 수정했습니다");
        } else {
          change(function () { S.rows.push(Calc.blankRow({ code: code, l1: l1, l2: l2, l3: l3 })); UI.sel = code; delete UI.collapsed[l1]; },
            "계정 추가: " + code + " " + l3);
          setTimeout(function () { select(code, true); }, 0);
          toast("계정을 추가했습니다. 더블클릭해서 산출 방식을 입력하세요");
        }
      }
    });
  }
  function suggestCode(base) {
    if (!base || !base.code || !/^\d+$/.test(base.code)) return "";
    var n = parseInt(base.code, 10) + 1;
    while (rowBy(String(n))) n++;
    return String(n);
  }
  function delAcc() {
    var r = rowBy(UI.sel);
    if (!r) { toast("삭제할 계정을 먼저 선택하세요"); return; }
    var c = r._c || Calc.compute(r, S.settings);
    confirmBox("계정 삭제", "<b>" + esc(r.code + " " + r.l3) + "</b> 계정을 삭제할까요?" +
      (c.missing ? "" : '<br><span class="em">계획액 ' + Calc.fmtWon(c.plan) + "원이 함께 지워집니다.</span>") +
      "<br>삭제한 뒤에도 Ctrl+Z (실행 취소)로 되돌릴 수 있습니다.", "삭제", true).then(function (ok) {
      if (!ok) return;
      var codes = visibleCodes(), i = codes.indexOf(String(r.code));
      change(function () {
        S.rows = S.rows.filter(function (x) { return String(x.code) !== String(r.code); });
        UI.sel = codes[i + 1] || codes[i - 1] || null;
      }, "계정 삭제: " + r.code + " " + r.l3 + (c.missing ? "" : " (계획액 " + Calc.fmtWon(c.plan) + "원)"));
      toast("삭제했습니다 (Ctrl+Z 로 되돌리기)");
    });
  }

  /* ---------- 연도 ---------- */
  function fillYearSelect() {
    $("selYear").innerHTML = S.years.map(function (y) { return '<option value="' + y + '"' + (y === S.year ? " selected" : "") + ">" + y + "년</option>"; }).join("") +
      '<option value="new">＋ 새 연도…</option>';
  }

  function loadYear(y) {
    return Store.load(y).then(function (st) {
      S.year = st.year; S.settings = st.settings; S.rows = st.rows; S.log = st.log;
      undoStack = []; redoStack = [];
      UI.sel = S.rows.length ? Calc.groupRows(S.rows)[0].rows[0].code : null;
      UI.group = ""; UI.collapsed = {};
      try { localStorage.setItem("budget.lastYear", String(y)); } catch (e) { /* 저장소 막힘 */ }
      syncSettingSelects();
      fillYearSelect();
      renderAll();
      setSave("ok", st.savedAt ? "마지막 저장 " + st.savedAt.slice(5, 16) : "불러옴");
    }, function (e) {
      toast(y + "년 파일을 읽지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }

  function switchYear(y) {
    return flushSave().then(function () { return loadYear(y); });
  }

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
        opt("inherit", (S.year || "") + "년 이어받기 (추천)", "계정 · 산출 방식 · 입력값 · 월 분할 · 메모를 그대로 복사합니다. 전년 실적 칸은 비우므로 [전년 실적 가져오기]로 채우세요.", !can) +
        opt("accounts", "계정만 복사", (S.year || "") + "년 계정 목록만 가져오고 계획은 비웁니다.", !can) +
        opt("empty", "빈 상태로 시작", "계정도 없는 빈 파일을 만듭니다.") +
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
      var rows = [];
      if (mode === "inherit") rows = S.rows.map(function (r) { var c = JSON.parse(JSON.stringify(r)); delete c._c; c.prev = 0; return c; });
      else if (mode === "accounts") rows = S.rows.map(function (r) { return Calc.blankRow(r); });
      S.year = y; S.rows = rows;
      S.log = [{ t: Store.stamp(), m: y + "년 파일 만듦" + (from && mode !== "empty" ? " (" + from + "년에서 " + (mode === "inherit" ? "이어받음" : "계정만 복사") + ")" : "") }];
      undoStack = []; redoStack = [];
      UI.sel = rows.length ? Calc.groupRows(rows)[0].rows[0].code : null;
      return Store.save(S, { forceBackup: false });
    }).then(function () { return Store.listYears(); }).then(function (ys) {
      S.years = ys; fillYearSelect(); renderAll();
      setSave("ok", "자동 저장됨 " + Store.stamp().slice(11, 16));
      toast(y + "년 파일을 만들었습니다 — data\\" + Store.fileName(y));
    }).catch(function (e) { toast("새 연도를 만들지 못했습니다: " + (e && e.message || e), true, 6000); });
  }

  /* ---------- 전년 실적 가져오기 ---------- */
  function importPrev() {
    if (!S.year) return;
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
    // 머리글 줄: 앞 10줄 중 글자 칸이 가장 많은 줄
    var best = 0, bestCnt = -1;
    for (var r = 0; r < Math.min(10, aoa.length); r++) {
      var cnt = (aoa[r] || []).filter(function (v) { return typeof v === "string" && v.trim(); }).length;
      if (cnt > bestCnt) { bestCnt = cnt; best = r; }
    }
    var head = (aoa[best] || []).map(function (v) { return String(v); });
    var find = function (re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; };
    var code = find(/코드/);
    var amt = find(/실적|집행|금액|합계/);
    if (amt < 0) { // 숫자가 가장 많은 열
      var counts = head.map(function () { return 0; });
      aoa.slice(best + 1, best + 40).forEach(function (row) { (row || []).forEach(function (v, i) { if (typeof v === "number") counts[i] = (counts[i] || 0) + 1; }); });
      amt = counts.indexOf(Math.max.apply(null, counts.concat([0])));
    }
    return { head: best, code: code < 0 ? 0 : code, amt: amt < 0 ? 1 : amt };
  }

  function importDialog(fname, sheets) {
    var si = 0, g = guessCols(sheets[0].aoa), missingMode = "keep";
    function colOpts(sel, aoa, headRow) {
      var width = 0;
      aoa.slice(0, 30).forEach(function (r) { width = Math.max(width, (r || []).length); });
      var head = aoa[headRow] || [];
      var h = "";
      for (var i = 0; i < width; i++) h += '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "") + "열 " + esc(String(head[i] || "").slice(0, 14)) + "</option>";
      return h;
    }
    function analyze() {
      var aoa = sheets[si].aoa, sums = {}, n = 0;
      aoa.slice(g.head + 1).forEach(function (row) {
        var code = String((row || [])[g.code] === undefined ? "" : row[g.code]).trim();
        var v = (row || [])[g.amt];
        if (!code || (typeof v !== "number" && !(String(v).trim() && isFinite(Calc.num(v))))) return;
        sums[code] = (sums[code] || 0) + Calc.num(v); n++;
      });
      var matched = S.rows.filter(function (r) { return sums[String(r.code)] !== undefined; });
      var notInFile = S.rows.filter(function (r) { return sums[String(r.code)] === undefined; });
      var notInPlan = Object.keys(sums).filter(function (k) { return !rowBy(k); });
      return { sums: sums, lines: n, matched: matched, notInFile: notInFile, notInPlan: notInPlan };
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
          cells += (ri === 0 ? "<th" : "<td") + (i === g.code ? ' class="hl"' : i === g.amt ? ' class="hl2"' : "") + ">" + esc(typeof v === "number" ? Calc.fmtWon(v) : v) + (ri === 0 ? "</th>" : "</td>");
        }
        return "<tr>" + cells + "</tr>";
      }).join("") + "</table>";
      return '<div class="mdl-pad">' +
        '<div class="f-row"><label>파일</label><div class="ro">' + esc(fname) + "</div></div>" +
        (sheets.length > 1 ? '<div class="f-row"><label>시트</label><select class="inp plain" id="imSheet">' + sheets.map(function (s, i) { return '<option value="' + i + '"' + (i === si ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select></div>" : "") +
        '<div class="f-row"><label>머리글 줄</label><input class="inp num" id="imHead" data-kind="int" value="' + (g.head + 1) + '" style="width:80px"></div>' +
        '<div class="f-row"><label>코드 열</label><select class="inp plain" id="imCode">' + colOpts(g.code, aoa, g.head) + "</select></div>" +
        '<div class="f-row"><label>금액 열 (원)</label><select class="inp plain" id="imAmt">' + colOpts(g.amt, aoa, g.head) + "</select></div>" +
        tbl +
        '<div class="msg" style="margin-top:10px">읽은 줄 <b>' + A.lines + "</b> · 맞는 계정 <b>" + A.matched.length + "</b> / " + S.rows.length +
        (A.notInPlan.length ? ' · <span class="em">계획에 없는 코드 ' + A.notInPlan.length + "</span>" : "") + "<br>같은 코드가 여러 줄이면 합산합니다.</div>" +
        (A.notInPlan.length ? '<div class="listbox">계획에 없는 코드 (가져오지 않음): ' + A.notInPlan.slice(0, 60).map(esc).join(", ") + (A.notInPlan.length > 60 ? " …" : "") + "</div>" : "") +
        (A.notInFile.length ? '<div style="margin-top:8px"><div class="msg">파일에 없는 계정 ' + A.notInFile.length + "개:</div>" +
          '<label class="opt' + (missingMode === "keep" ? " on" : "") + '"><input type="radio" name="imMiss" value="keep"' + (missingMode === "keep" ? " checked" : "") + "><div><b>기존 전년 실적 그대로 두기</b></div></label>" +
          '<label class="opt' + (missingMode === "zero" ? " on" : "") + '"><input type="radio" name="imMiss" value="zero"' + (missingMode === "zero" ? " checked" : "") + "><div><b>0으로 바꾸기</b></div></label></div>" : "") +
        "</div>";
    }
    function rebuild() {
      dlg.el.querySelector(".mdl-body").innerHTML = body();
      wire();
    }
    function wire() {
      var sh = $("imSheet");
      if (sh) sh.addEventListener("change", function () { si = +sh.value; g = guessCols(sheets[si].aoa); rebuild(); });
      $("imHead").addEventListener("change", function () { g.head = Math.max(0, (parseInt($("imHead").value, 10) || 1) - 1); rebuild(); });
      $("imCode").addEventListener("change", function () { g.code = +$("imCode").value; rebuild(); });
      $("imAmt").addEventListener("change", function () { g.amt = +$("imAmt").value; rebuild(); });
      document.querySelectorAll('input[name="imMiss"]').forEach(function (el) { el.addEventListener("change", function () { missingMode = el.value; rebuild(); }); });
    }
    openDialog({
      title: "전년 실적 가져오기", crumb: (S.year - 1) + "년 실적 → '" + (S.year - 1) + "년 실적' 칸", width: 760, body: body(), okText: "가져오기", focus: false,
      onOk: function () {
        var A = analyze();
        if (!A.matched.length) { toast("코드가 맞는 계정이 없습니다. 코드 열을 확인하세요", true); return false; }
        change(function () {
          S.rows.forEach(function (r) {
            var v = A.sums[String(r.code)];
            if (v !== undefined) r.prev = v;
            else if (missingMode === "zero") r.prev = 0;
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
    return Store.listYears().then(function (ys) {
      S.years = ys;
      if (!ys.length) {
        cover("아직 데이터가 없습니다", "연결한 폴더 <code>" + esc(Store.folderName()) + "</code> 의 data 폴더에 사업비 계획 파일이 없습니다.<br>샘플 데이터로 둘러보거나, 새 연도를 만들어 시작하세요.", [
          { label: "샘플 데이터로 시작 (2027년)", primary: true, fn: function () { hideCover(); makeSample(); } },
          { label: "새 연도 만들기", fn: function () { hideCover(); newYearDialog(); } },
          { label: "다른 폴더 고르기", fn: askFolder }
        ]);
        return;
      }
      hideCover();
      var last = 0;
      try { last = parseInt(localStorage.getItem("budget.lastYear"), 10); } catch (e) { last = 0; }
      return loadYear(ys.indexOf(last) >= 0 ? last : ys[ys.length - 1]);
    }, function (e) {
      toast("폴더를 읽지 못했습니다: " + (e && e.message || e), true, 6000);
    });
  }

  function makeSample() {
    S.year = 2027;
    S.settings = { dispUnit: "천원", rndUnit: "천원", rndMode: "반올림" };
    S.rows = SAMPLE.map(function (x) {
      var r = Calc.blankRow({ code: x[0], l1: x[1], l2: x[2], l3: x[3] });
      r.prev = x[4]; r.meth = x[5]; r.a = x[6]; r.b = x[7]; r.c = x[8]; r.split = x[9] || "균등";
      if (x[10]) r.sv = x[10].slice();
      r.memo = x[11];
      return r;
    });
    S.log = [{ t: Store.stamp(), m: "샘플 데이터로 2027년 파일 만듦" }];
    UI.sel = "1101";
    syncSettingSelects();
    Store.save(S).then(function () { return Store.listYears(); }).then(function (ys) {
      S.years = ys; fillYearSelect(); renderAll();
      setSave("ok", "자동 저장됨 " + Store.stamp().slice(11, 16));
      toast("샘플 2027년 파일을 만들었습니다 — data\\" + Store.fileName(2027));
    }).catch(function (e) { toast("샘플을 만들지 못했습니다: " + (e && e.message || e), true, 6000); });
  }

  var SAMPLE = [
    ["1101", "인건비", "급여", "기본급", 1140000000, "인원", 4300000, 23, 12, "균등", null, "신규 1명 포함"],
    ["1102", "인건비", "급여", "상여금", 236000000, "%증감", 0.03, 0, 0, "수기", [0, 0, 0, 0, 0, 121540000, 0, 0, 0, 0, 0, 121540000], "6·12월 지급"],
    ["1103", "인건비", "급여", "제수당", 118000000, "%증감", 0.03, 0, 0, "균등", null, ""],
    ["1104", "인건비", "퇴직급여", "퇴직급여", 102000000, "%증감", 0.05, 0, 0, "균등", null, ""],
    ["1105", "인건비", "4대보험", "4대보험", 131000000, "%증감", 0.04, 0, 0, "균등", null, "요율 인상"],
    ["1106", "인건비", "복리후생", "복리후생비", 39600000, "인원", 150000, 23, 12, "균등", null, ""],
    ["2101", "지급수수료", "외주", "조사 위탁수수료", 412000000, "%증감", 0.08, 0, 0, "균등", null, "위탁 물량 증가"],
    ["2102", "지급수수료", "자문", "의료자문료", 68400000, "단가×수량", 150000, 40, 12, "균등", null, "월 40건"],
    ["2103", "지급수수료", "자문", "법률자문료", 48000000, "절대증감", 6000000, 0, 0, "균등", null, "소송 1건 추가"],
    ["2104", "지급수수료", "전산", "전산 사용료", 150000000, "단가×수량", 13000000, 1, 12, "균등", null, ""],
    ["3101", "여비·차량", "여비교통", "현장출장비", 92000000, "%증감", 0.06, 0, 0, "균등", null, ""],
    ["3102", "여비·차량", "차량", "차량유지비", 46800000, "단가×수량", 450000, 9, 12, "균등", null, "업무차량 9대"],
    ["3103", "여비·차량", "차량", "유류비", 58000000, "%증감", 0.02, 0, 0, "균등", null, ""],
    ["4101", "임차·관리", "임차", "사무실 임차료", 300000000, "단가×수량", 25000000, 1, 12, "균등", null, ""],
    ["4102", "임차·관리", "관리", "관리비", 81600000, "절대증감", 2400000, 0, 0, "균등", null, ""],
    ["5101", "일반관리", "통신", "통신비", 22800000, "%증감", 0, 0, 0, "균등", null, ""],
    ["5102", "일반관리", "사무", "소모품비", 28400000, "%증감", -0.05, 0, 0, "균등", null, "전자결재 확대"],
    ["5103", "일반관리", "교육", "교육훈련비", 30500000, "수기", 36000000, 0, 0, "비율", [0, 0, .15, .10, .10, .05, 0, 0, .15, .15, .20, .10], "상·하반기 집중"],
    ["5104", "일반관리", "사무", "도서인쇄비", 6200000, "%증감", 0, 0, 0, "균등", null, ""],
    ["5105", "일반관리", "회의", "회의비", 9800000, "", 0, 0, 0, "균등", null, ""],
    ["5106", "일반관리", "홍보", "광고선전비", 15000000, "", 0, 0, 0, "균등", null, ""]
  ];

  /* ---------- 이벤트 ---------- */
  function act(name) {
    if (!S.year && ["newYear", "changeFolder"].indexOf(name) < 0) { toast("먼저 데이터 폴더를 연결하세요"); return; }
    switch (name) {
      case "newYear": return newYearDialog();
      case "reload": return flushSave().then(function () { return loadYear(S.year); }).then(function () { toast("파일에서 다시 불러왔습니다"); });
      case "export": Store.exportReport(S); return toast("보고용 엑셀을 내려받았습니다");
      case "changeFolder": return flushSave().then(askFolder);
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
        ["file", "plan", "help"].forEach(function (t) { $("rb-" + t).hidden = t !== tab.getAttribute("data-tab"); });
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
      var code = tr.getAttribute("data-code");
      select(code);
      if (e.target.closest("td.plan-v")) openPlan(code);
    });
    tbl.addEventListener("dblclick", function (e) {
      var tr = e.target.closest("tr.acc");
      if (tr && !e.target.closest("td.plan-v")) openPlan(tr.getAttribute("data-code"));
    });

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
        change(function () { S.settings[x[1]] = v; }, x[2] + ": " + old + " → " + v);
      });
    });

    document.addEventListener("keydown", function (e) {
      if (dlg) {
        if (e.key === "Escape") { e.preventDefault(); closeDialog(); }
        else if (e.key === "Enter" && !e.shiftKey && e.target.tagName !== "BUTTON" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "SELECT") {
          var ok = $("modal").querySelector("[data-ok]");
          if (ok) { e.preventDefault(); ok.click(); }
        }
        return;
      }
      if (!$("cover").hidden) return;
      var inField = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inField) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !inField) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); $("search").focus(); $("search").select(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); return; }
      if (inField) { if (e.key === "Escape" && e.target.id === "search") { e.target.value = ""; UI.search = ""; renderAll(); e.target.blur(); } return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var codes = visibleCodes(), i = codes.indexOf(String(UI.sel));
        var j = e.key === "ArrowDown" ? Math.min(codes.length - 1, i + 1) : Math.max(0, i - 1);
        if (codes[j]) select(codes[j], true);
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
