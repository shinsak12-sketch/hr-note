/* 시작 · 화면 전환 · 자동 저장 */
var App = (function () {
  var $ = U.$, view = "board", ready = false, saveT = null, saving = false, pending = false, failed = false;
  var UNMATCHED = null;

  function setSave(kind, text) {
    var el = $("#saved"); el.className = "saved " + kind; $("#savedT").textContent = text;
  }
  function scheduleSave() {
    if (!ready || M.newer) return;
    pending = true; setSave("busy", "저장 대기…");
    clearTimeout(saveT); saveT = setTimeout(doSave, 700);
  }
  async function doSave() {
    clearTimeout(saveT);
    if (saving) { saveT = setTimeout(doSave, 300); return; }
    saving = true; pending = false; setSave("busy", "저장 중…");
    try {
      await M.save(); saving = false; failed = false;
      var d = new Date(); setSave("ok", "자동 저장됨 " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2));
      if (pending) scheduleSave();
    } catch (e) {
      saving = false; failed = true; pending = true;
      if (e.message === "SHRINK") {
        setSave("error", "저장 멈춤 — 확인 필요");
        U.modal('<h3>저장을 멈췄습니다</h3><div class="warnbox bad"><span class="wi">⛔</span><div><b>설정 데이터가 갑자기 많이 줄었습니다</b><ul>' + e.detail.map(function (d) { return "<li>" + U.esc(d) + "</li>"; }).join("") +
          '</ul></div></div><p>직접 지운 게 맞으면 [그대로 저장], 아니면 Ctrl+Z 로 되돌리거나 설정 › ⟲ 백업 복원을 쓰세요. 저장 전 파일은 그대로 있습니다.</p><div class="foot"><button class="btn" data-x>저장하지 않음</button><button class="btn danger" id="ok">그대로 저장</button></div>',
          function (ov, close) { ov.querySelector("#ok").onclick = function () { close(); M.allowShrink(); doSave(); }; });
        return;
      }
      setSave("error", "저장 실패 — 눌러서 다시 저장");
      U.toast("저장하지 못했습니다. 엑셀로 data\\기준정보.xlsx 를 열어 두었다면 닫고 제목 줄의 빨간 표시를 누르세요. (" + (e.message || e) + ")", true, 7000);
    }
  }

  /* 기준값 · 분류 기준 바꾸기: 실행 취소 기록 → 바꿈 → 다시 그림 → 저장 */
  function change(fn, kind, msg) {
    M.begin(); fn();
    if (kind === "sets") M.bump(); else M.touch();
    if (msg) M.log(msg);
    if (kind !== "sets") UNMATCHED = null;
    render(); scheduleSave();
  }
  function undo() { if (M.undo()) { UNMATCHED = null; render(); scheduleSave(); U.toast("실행 취소했습니다"); } else U.toast("되돌릴 것이 없습니다"); }
  function redo() { if (M.redo()) { UNMATCHED = null; render(); scheduleSave(); U.toast("다시 실행했습니다"); } else U.toast("다시 할 것이 없습니다"); }

  function unmatched(force) { if (!UNMATCHED || force) UNMATCHED = M.scanUnmatched(); return UNMATCHED; }

  function go(v) {
    if (v === "help") { help(); return; }
    if (v === "classify") { Setting.tab("classify"); v = "setting"; }
    view = v;
    U.$$(".view").forEach(function (s) { s.hidden = s.id !== "v-" + v; });
    U.$$("#menu a").forEach(function (a) { a.classList.toggle("on", a.dataset.go === v); });
    try { localStorage.setItem("hrs.view", v); } catch (e) { }
    render();
  }
  function render() {
    if (!ready) return;
    $("#stSel").textContent = ""; $("#stCond").innerHTML = "";
    if (view === "board") Board.render(true);
    else if (view === "setting") Setting.render();
    else renderMain();
    var mm = unmatchedCount(); $("#mmN").textContent = mm ? mm : "";
  }
  function unmatchedCount() { return UNMATCHED ? UNMATCHED.length : 0; }
  function renderMain() {
    var S = M.S, f = M.FILES;
    $("#mainBox").innerHTML = '<h2>메인 대시보드</h2><p>그래프 · 요약 화면은 다음 단계에서 만듭니다. 지금 읽은 자료:</p><div class="mgrid">' +
      card("직원명부", f.length + "개", f.length ? U.fmtM(f[0].m) + " ~ " + U.fmtM(f[f.length - 1].m) : "백데이터\\설정\\직원명부 비어 있음") +
      card("기준값", S.org.length + " · " + S.grd.length + " · " + S.job.length, "조직 · 직급 · 직무") +
      card("미매칭", unmatchedCount() + "건", "설정 › 미매칭에서 처리") +
      card("분류 기준", S.sets.length + "개", S.sets.map(function (s) { return s.nm; }).join(", ")) + "</div>";
    function card(a, b, c) { return '<div class="mcard"><span>' + a + "</span><b>" + b + "</b><small>" + U.esc(c) + "</small></div>"; }
  }

  function help() {
    U.modal('<h3>단축키 · 사용법</h3><div class="keys">' + [
      ["끌기", "여러 칸 선택 (열 문자 · 행 번호 누르기 = 열 · 행 전체)"], ["Ctrl + C", "선택 칸 복사 → 엑셀에 붙여넣기 (우클릭 = 머리글 포함 복사)"], ["Ctrl + A", "표 전체 선택"],
      ["머리 ▾", "정렬 · 줄 고르기 · 값 조건 · 열 숨기기"], ["Enter · 더블클릭", "그달 그 줄 명단"], ["우클릭", "칸 메뉴 (복사 · 명단 · 메모 · 정렬)"],
      ["Ctrl + F", "줄 찾기 (Enter = 다음)"], ["Ctrl + PageUp / Down", "시트 넘기기"], ["Ctrl + Z / Y", "설정 · 분류 기준 실행 취소 · 다시 실행 (최근 100번)"],
      ["Ctrl + S", "바로 저장"], ["Esc", "선택 · 팝업 닫기"], ["F1", "이 도움말"]
    ].map(function (k) { return "<kbd>" + k[0] + "</kbd><span>" + k[1] + "</span>"; }).join("") +
      '</div><p class="fs">자료: <b>백데이터\\설정\\직원명부\\직원명부_YYYYMMDD.xlsx</b> (날짜 = 기준일, 달마다 가장 늦은 날짜 파일을 그달 말 인원으로 씀) · <b>조직목록\\조직 목록.xlsx</b> · <b>발령검색\\발령검색_YYYYMMDD.xlsx</b> (인력현황 다음 단계에서 사용)</p>' +
      '<div class="foot"><button class="btn" data-x>닫기</button></div>');
  }

  /* ── 폴더 연결 ── */
  function cover(title, text, btns) {
    $("#cover").hidden = false; $("#coverTitle").textContent = title; $("#coverText").innerHTML = text;
    var b = $("#coverBtns"); b.innerHTML = "";
    btns.forEach(function (x) { var e = document.createElement("button"); e.className = "btn " + (x.primary ? "pri big" : "big"); e.textContent = x.label; e.onclick = x.fn; b.appendChild(e); });
  }
  function askFolder() { Store.pick().then(openFolder, function (e) { if (e && e.name !== "AbortError") U.toast("폴더를 연결하지 못했습니다: " + (e.message || e), true); }); }
  async function openFolder() {
    $("#cover").hidden = true; $("#folderName").textContent = "📁 " + Store.name();
    try {
      setSave("busy", "폴더 준비…");
      await Store.ensure([M.P_ROSTER, M.P_ORDERS, M.P_ORGLIST, M.P_ORGLIST + "/보관", M.P_DATA, M.P_BACKUP]);
      var ld = await M.load();
      if (ld.newer) U.toast("data\\기준정보.xlsx 가 더 새 버전 프로그램으로 저장되어 있습니다. 보기만 하고 저장하지 않습니다. 새 버전 프로그램을 쓰세요.", true, 9000);
      if (ld.updated) M.log("프로그램 " + ld.updated + " → " + M.APP_VER + " 업데이트 · 원본 backup 보관");
      if (ld.updated) U.toast("프로그램이 " + M.APP_VER + " 로 바뀌었습니다. 기존 기준정보는 backup\\기준정보_업데이트전_v" + ld.updated + "_… 로 먼저 보관했습니다.", false, 6000);
      if (ld.migrated) U.toast("이전 형식(v" + ld.from + ") 기준정보를 새 형식으로 바꿨습니다. 원본은 backup 폴더에 있습니다.", false, 6000);
      M.reset();
      var r = await M.loadAll(function (d, n) { setSave("busy", "직원명부 읽는 중 " + d + "/" + n); });
      if (r.errs.length) U.toast("읽지 못한 파일 " + r.errs.length + "개: " + r.errs[0], true, 8000);
      var ol = await M.readOrgList();
      ready = true;
      setSave(M.newer ? "error" : "ok", M.newer ? "읽기 전용 (새 형식)" : "불러옴");
      if (ol.list.changed) { M.log("조직 목록 새 내용 보관: 조직목록\\보관"); scheduleSave(); }
      if (ld.fresh || !M.S.org.length) {
        go("setting"); Setting.tab("org");
        if (!M.FILES.length) U.toast("백데이터\\설정\\직원명부 폴더에 직원명부_20261030.xlsx 같은 파일을 넣고 ↻ 다시 읽기를 누르세요", false, 9000);
        else Setting.firstRun();
        return;
      }
      unmatched(true);
      var v = "board"; try { v = localStorage.getItem("hrs.view") || "board"; } catch (e) { }
      go(v === "help" ? "board" : v);
      U.toast("직원명부 " + r.files + "개 · " + r.months + "개월 읽음");
    } catch (e) {
      setSave("error", "오류"); U.toast("폴더를 읽지 못했습니다: " + (e.message || e), true, 9000); console.error(e);
    }
  }
  async function reload() {
    if (!ready) return;
    M.reset(); M.clearCache(); M.touch();
    var r = await M.loadAll(function (d, n) { setSave("busy", "직원명부 읽는 중 " + d + "/" + n); });
    var ol = await M.readOrgList(); if (ol.list.changed) scheduleSave();
    setSave("ok", "다시 읽음"); unmatched(true); render();
    U.toast("백데이터를 다시 읽었습니다 · 직원명부 " + r.files + "개" + (r.errs.length ? " · 읽지 못한 파일 " + r.errs.length + "개" : ""));
  }

  function start() {
    U.$$("[data-go]").forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); go(a.dataset.go); }); });
    $("#saved").addEventListener("click", function () { if (ready) doSave(); });
    document.addEventListener("keydown", function (e) {
      var k = e.key.toLowerCase(), inF = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable;
      if (e.key === "F1") { e.preventDefault(); help(); return; }
      if ((e.ctrlKey || e.metaKey) && k === "s") { e.preventDefault(); if (ready) doSave(); return; }
      if (view === "setting" && !inF && !U.$(".ov") && (e.ctrlKey || e.metaKey) && (k === "z" || k === "y")) { e.preventDefault(); if (k === "z") undo(); else redo(); }
    });
    window.addEventListener("beforeunload", function (e) { if (pending || saving) { doSave(); e.preventDefault(); e.returnValue = ""; } });
    Board.init(); Setting.init();
    /* 자동 점검용: 주소 끝에 #opfs 를 붙이면 브라우저 내부 저장소를 폴더처럼 씀 */
    if (location.hash === "#opfs" && navigator.storage && navigator.storage.getDirectory) { navigator.storage.getDirectory().then(function (h) { Store.useHandle(h); openFolder(); }); return; }
    if (!Store.supported()) { cover("이 브라우저는 폴더 저장을 지원하지 않습니다", "크롬(또는 엣지) 최신 버전에서 <code>인력현황.html</code> 을 여세요.", []); return; }
    Store.restore().then(function (st) {
      if (st === "ready") return openFolder();
      if (st === "needPermission") {
        cover("데이터 폴더 사용을 허용해 주세요", "지난번에 연결한 폴더 <code>" + U.esc(Store.name()) + "</code> 를 다시 쓰려면 허용이 필요합니다.<br>버튼을 누르고 크롬 창에서 <b>[파일 수정 허용]</b>을 고르세요. (매번 묻지 않게 하려면 <b>[방문할 때마다 허용]</b>)", [
          { label: "이 폴더 계속 사용", primary: true, fn: function () { Store.grant().then(function (ok) { if (ok) openFolder(); else U.toast("허용되지 않았습니다", true); }); } },
          { label: "다른 폴더 고르기", fn: askFolder }]);
        return;
      }
      cover("프로그램 폴더를 연결하세요", "<code>인력현황.html</code> 이 들어 있는 폴더를 고르세요.<br>그 안에 <b>백데이터 · data · backup</b> 폴더를 만들고, 한 번 연결하면 다음부터 자동으로 연결됩니다.", [{ label: "폴더 연결", primary: true, fn: askFolder }]);
    });
  }

  async function restoreFrom(name) {
    try { var r = await M.restore(name); M.clearCache(); M.touch(); unmatched(true); render(); setSave("ok", "백업에서 되돌림"); U.toast(name + " 으로 되돌렸습니다 (지금 파일은 backup\\기준정보_되돌리기전_… 로 보관)", false, 6000); }
    catch (e) { U.toast(e.message || e, true, 6000); }
  }
  return { restoreFrom: restoreFrom, start: start, change: change, render: render, go: go, scheduleSave: scheduleSave, undo: undo, redo: redo, reload: reload, unmatched: unmatched, help: help, get view() { return view; } };
})();
document.addEventListener("DOMContentLoaded", App.start);
