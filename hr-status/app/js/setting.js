/* 설정: 조직 · 직급 · 직무 기준값 (버전 이력) · 미매칭 처리 */
var Setting = (function () {
  var $ = U.$, esc = U.esc, tabNow = "org", selOrg = null, selG = null, selJ = null, open = {}, HC = null, HCrev = -1;

  function tab(t) { tabNow = t; try { localStorage.setItem("hrs.stab", t); } catch (e) { } if (App.view === "setting") render(); }
  function init() { try { tabNow = localStorage.getItem("hrs.stab") || "org"; } catch (e) { }
    U.$$("#stabs button").forEach(function (b) { b.onclick = function () { tab(b.dataset.st); }; });
    document.addEventListener("mousedown", function (e) { if (mmPop && !mmPop.contains(e.target) && !e.target.closest("[data-mf],[data-mtg]")) mmClose(); });
    document.addEventListener("click", onClick); document.addEventListener("contextmenu", onCtx); document.addEventListener("dblclick", onDbl);
  }
  /* 최신 직원명부 인원 */
  function hc() {
    var l = M.latestFile(), s = l && M.snap(l.m), o = {}, g = {}, j = {};
    if (s) s.persons.forEach(function (p) { p.oids.forEach(function (id) { o[id] = (o[id] || 0) + 1; }); if (p.gid) g[p.gid] = (g[p.gid] || 0) + 1; if (p.jid) j[p.jid] = (j[p.jid] || 0) + 1; });
    return { o: o, g: g, j: j, file: l };
  }
  function render() {
    U.$$("#stabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.st === tabNow); });
    HC = hc();
    var el = $("#spane");
    if (tabNow === "classify") { Classify.render(el); return; }
    if (tabNow === "org") renderOrg(el);
    else if (tabNow === "grd" || tabNow === "job") renderFlat(el, tabNow);
    else if (tabNow === "merge") renderMerge(el);
    else renderMM(el);
    $("#stL").textContent = HC.file ? "인원 = " + HC.file.name : "직원명부 없음";
    $("#stR").textContent = "조직 " + M.S.org.length + " · 직급 " + M.S.grd.length + " · 직무 " + M.S.job.length;
  }
  function firstRun() {
    U.modal('<h3>기본 세팅</h3><p>최신 직원명부(<b>' + esc(M.latestFile().name) + '</b>)와 <b>조직 목록</b>으로 조직 · 직급 · 직무 기준값을 만들고, 기본 분류 기준(조직별 · 직급별 · 직무별) 3개를 만듭니다.</p>' +
      '<ul class="ul"><li>조직 레벨은 직원명부 소속6=회사, 소속5=본부, 소속4=부서·파트, 소속3=센터 로 정합니다</li><li>조직 목록에만 있고 직원명부에 없는 조직은 <b>레벨 미정</b>으로 들어갑니다</li><li>그다음 <b>미매칭</b> 탭에서 과거 직원명부의 옛 이름을 연결하면 됩니다</li></ul>' +
      '<div class="foot"><button class="btn" data-x>나중에</button><button class="btn pri" id="ok">기본 세팅 시작</button></div>', function (ov, close) {
        ov.querySelector("#ok").onclick = function () { close(); runSetup(); };
      });
  }
  function runSetup() {
    M.begin();
    M.autoSetup().then(function (r) {
      M.touch(); App.unmatched(true); App.scheduleSave(); render();
      U.toast("기본 세팅 완료: 조직 " + r.org + " · 직급 " + r.grd + " · 직무 " + r.job + (r.undecided ? " · 레벨 미정 " + r.undecided : "") + " · 미매칭 " + App.unmatched().length + "건", false, 7000);
    }, function (e) { U.toast(e.message || e, true, 7000); });
  }

  /* ════ 조직 ════ */
  function tree(pid, q) {
    var h = "";
    M.kids(pid).forEach(function (o) {
      if (o.lv === 0) return;
      var k = M.kids(o.id), show = !q || match(o, q) || sub(o, q); if (!show) return;
      h += '<li><div class="node' + (o.id === selOrg ? " sel" : "") + (o.dead ? " dead" : "") + (k.length && !open[o.id] ? " closed" : "") + '" data-oid="' + o.id + '" tabindex="0">' +
        '<span class="tw" data-tw="' + o.id + '">' + (k.length ? "▼" : "") + '</span><span class="lv lv' + o.lv + '">L' + o.lv + '</span><span class="nm">' + esc(M.nm(o)) + "</span>" +
        (o.v.length > 1 ? '<span class="vtag">v' + o.v[0].n + "</span>" : "") + (o.dead ? '<span class="vtag">폐지</span>' : "") + '<span class="hc">' + (HC.o[o.id] || 0) + "</span></div>";
      if (k.length && (open[o.id] || q)) h += "<ul>" + tree(o.id, q) + "</ul>";
      h += "</li>";
    });
    return h;
  }
  function match(o, q) { return o.v.some(function (v) { return v.nm.indexOf(q) >= 0; }); }
  function sub(o, q) { return M.kids(o.id).some(function (c) { return match(c, q) || sub(c, q); }); }
  var oq = "";
  function renderOrg(el) {
    var S = M.S;
    if (!S.org.length) { el.innerHTML = emptyBox(); return; }
    if (!selOrg || !M.byId("org", selOrg)) selOrg = S.org[0].id;
    if (!Object.keys(open).length) S.org.forEach(function (o) { if (o.lv <= 2) open[o.id] = true; });
    var und = S.org.filter(function (o) { return o.lv === 0; });
    var roots = S.org.filter(function (o) { return o.lv > 0 && (!o.p || !M.byId("org", o.p)); });
    var h = roots.map(function (r) { return r; });
    var treeHtml = "";
    h.forEach(function (o) { var tmp = o.p; o.p = null; treeHtml += ""; o.p = tmp; });
    treeHtml = rootTree(roots, oq);
    var o = M.byId("org", selOrg);
    el.innerHTML = '<div class="two"><div class="pane left"><h3>조직 구조 <small>살아 있는 조직 ' + S.org.filter(function (x) { return !x.dead; }).length + "개</small></h3>" +
      '<div class="ptool"><input class="inp" id="oq" placeholder="이름 찾기 (옛 이름 포함)" value="' + esc(oq) + '"><span class="legend"><span class="lv lv1">L1</span>회사 <span class="lv lv2">L2</span>본부 <span class="lv lv3">L3</span>부서 <span class="lv lv4">L4</span>센터</span></div>' +
      '<div class="scroll" data-blank="org"><ul class="tree">' + treeHtml + "</ul>" +
      (und.length ? '<div class="undh">레벨 미정 ' + und.length + '개 <small>조직 목록에만 있음 · 우클릭 › 수정에서 레벨 · 상위를 정하세요</small></div><ul class="tree">' + und.map(function (u) {
        return '<li><div class="node' + (u.id === selOrg ? " sel" : "") + '" data-oid="' + u.id + '" tabindex="0"><span class="tw"></span><span class="lv lv0">?</span><span class="nm">' + esc(M.nm(u)) + '</span><span class="hc">' + (HC.o[u.id] || 0) + "</span></div></li>";
      }).join("") + "</ul>" : "") +
      '</div><div class="hint">조직 우클릭 = 하위 추가 · 수정 · 폐지 · 삭제</div></div>' +
      '<div class="pane"><div class="scroll">' + orgDetail(o) + "</div></div></div>";
    var q = $("#oq"); q.oninput = function () { oq = U.norm(q.value); var pos = q.selectionStart; renderOrg(el); var n = $("#oq"); n.focus(); n.setSelectionRange(pos, pos); };
  }
  function rootTree(roots, q) {
    return roots.map(function (o) {
      var k = M.kids(o.id), show = !q || match(o, q) || sub(o, q); if (!show) return "";
      return '<li><div class="node' + (o.id === selOrg ? " sel" : "") + (o.dead ? " dead" : "") + (k.length && !open[o.id] ? " closed" : "") + '" data-oid="' + o.id + '" tabindex="0">' +
        '<span class="tw" data-tw="' + o.id + '">' + (k.length ? "▼" : "") + '</span><span class="lv lv' + o.lv + '">L' + o.lv + '</span><span class="nm">' + esc(M.nm(o)) + "</span>" +
        (o.v.length > 1 ? '<span class="vtag">v' + o.v[0].n + "</span>" : "") + (o.dead ? '<span class="vtag">폐지</span>' : "") + '<span class="hc">' + (HC.o[o.id] || 0) + "</span></div>" +
        (k.length && (open[o.id] || q) ? "<ul>" + tree(o.id, q) + "</ul>" : "") + "</li>";
    }).join("");
  }
  function verList(e, kind) {
    return '<ul class="vlist">' + e.v.map(function (v, i) {
      return '<li class="ver' + (i === 0 && !v.to && !e.dead ? " cur" : "") + '"><span class="vn">v' + v.n + '</span><span class="vb"><b>' + esc(v.nm) + (kind === "grd" && v.code ? ' <code>' + esc(v.code) + "</code>" : "") + "</b><span>" + esc(v.note || " ") + '</span></span><span class="vr">' + (v.from || "?") + " ~ " + (v.to || "현재") + "<br><code>" + esc(v.src || "") + "</code></span></li>";
    }).join("") + "</ul>";
  }
  function orgDetail(o) {
    if (!o) return "";
    var par = o.p && M.byId("org", o.p), k = M.kids(o.id);
    return '<div class="detail"><div class="dh"><span class="lv lv' + o.lv + '">' + (o.lv ? "L" + o.lv + " " : "") + M.LVN[o.lv] + "</span><h2>" + esc(M.nm(o)) + "</h2>" + (o.dead ? '<span class="pill off">폐지 · ' + (o.v[0].to || "") + "</span>" : '<span class="pill ok">사용 중</span>') +
      '<div class="acts">' + (o.lv && o.lv < 4 ? '<button class="btn sm" data-oa="add">＋ 하위</button>' : "") + '<button class="btn sm" data-oa="edit">✎ 수정</button><button class="btn sm" data-oa="del">삭제</button></div></div>' +
      '<div class="fields"><div class="fld"><label>ID</label><div class="well mono">' + o.id + '</div></div><div class="fld"><label>소속코드 (조직 목록)</label><div class="well mono">' + esc(o.code || "-") + "</div></div>" +
      '<div class="fld"><label>상위 조직</label><div class="well">' + (par ? esc(M.path(par)) : "— (최상위)") + '</div></div><div class="fld"><label>인원 (' + (HC.file ? U.fmtM(HC.file.m) : "-") + ')</label><div class="well mono">' + (HC.o[o.id] || 0) + "명</div></div></div>" +
      '<div class="sec"><h4>버전 이력 <small>과거 직원명부의 이 이름들은 모두 이 조직으로 집계</small></h4>' + verList(o, "org") + "</div>" +
      (k.length ? '<div class="sec"><h4>하위 조직 <small>' + k.length + '개</small></h4><table class="tbl"><thead><tr><th>레벨</th><th>조직명</th><th>소속코드</th><th>버전</th><th class="n">인원</th></tr></thead><tbody>' +
        k.map(function (c) { return '<tr data-oid="' + c.id + '" class="link"><td><span class="lv lv' + c.lv + '">L' + c.lv + "</span></td><td>" + esc(M.nm(c)) + (c.dead ? " (폐지)" : "") + '</td><td class="mono">' + esc(c.code || "-") + "</td><td>v" + c.v[0].n + '</td><td class="n">' + (HC.o[c.id] || 0) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "") + "</div>";
  }
  function emptyBox() {
    return '<div class="emptyset"><h2>기준값이 아직 없습니다</h2><p>' + (M.FILES.length ? "직원명부 " + M.FILES.length + "개를 읽었습니다. <b>⚙ 기본 세팅</b>을 누르면 최신 직원명부와 조직 목록으로 기준값을 만듭니다." : "먼저 <b>백데이터\\설정\\직원명부</b> 폴더에 <b>직원명부_20261030.xlsx</b> 같은 파일을 넣고 위 ↻(인력현황 화면) 또는 아래 버튼을 누르세요.") +
      '</p><button class="btn pri big" data-act="autoSetup"' + (M.FILES.length ? "" : " disabled") + '>⚙ 기본 세팅 시작</button> <button class="btn big" data-act="reload">↻ 백데이터 다시 읽기</button></div>';
  }
  function liveLv(lv, keep) { return M.S.org.filter(function (x) { return x.lv === lv && (!x.dead || x.id === keep); }); }
  function impact(o) { var past = o.v.slice(1).map(function (v) { return v.nm; }).filter(function (n, i, a) { return n !== M.nm(o) && a.indexOf(n) === i; });
    return "<ul><li>현재 인원 <b>" + (HC.o[o.id] || 0) + "명</b> · 하위 조직 " + M.desc(o) + "개</li><li>버전 " + o.v.length + "개" + (past.length ? " · 옛 이름 " + esc(past.join(", ")) : "") + "</li><li>이 조직을 쓰는 분류 기준 카드 " + usedCards("org:" + o.id) + "개</li></ul>"; }
  function usedCards(c) { var n = 0; M.S.sets.forEach(function (s) { s.rows.forEach(function (r) { r.cards.forEach(function (x) { if (x.c === c) n++; }); }); }); return n; }

  function orgAdd(par, lv) {
    lv = par ? par.lv + 1 : (lv || 1);
    U.modal("<h3>" + M.LVN[lv] + ' 추가</h3><div class="form"><label for="fNm">조직명</label><input class="inp" id="fNm">' +
      '<label for="fPar">상위 조직</label>' + (lv > 1 ? '<select class="inp" id="fPar">' + liveLv(lv - 1).map(function (x) { return '<option value="' + x.id + '"' + (par && x.id === par.id ? " selected" : "") + ">" + esc(M.nm(x)) + "</option>"; }).join("") + "</select>" : '<span class="ro">— (최상위)</span>') +
      '<label for="fCode">소속코드</label><input class="inp" id="fCode" placeholder="조직 목록의 소속코드 (없으면 비움)"><label for="fFrom">시작일</label><input class="inp" id="fFrom" type="date" value="' + U.today() + '"></div>' +
      '<div class="foot"><button class="btn" data-x>취소</button><button class="btn pri" id="ok">추가</button></div>', function (ov, close, shake) {
        ov.querySelector("#ok").onclick = function () {
          var n = U.norm(ov.querySelector("#fNm").value), p = lv > 1 ? ov.querySelector("#fPar").value : null;
          if (!n) { shake(); return; }
          if (M.S.org.some(function (x) { return !x.dead && M.nm(x) === n; })) { shake(); U.toast("같은 이름의 살아 있는 조직이 이미 있음"); return; }
          var id; App.change(function () { id = M.nid("o"); M.S.org.push({ id: id, lv: lv, p: p, code: U.norm(ov.querySelector("#fCode").value), ord: 0, dead: false, v: [{ n: 1, nm: n, from: ov.querySelector("#fFrom").value, to: "", src: "수기 등록", note: "신설" }] }); if (p) open[p] = true; }, "master", "조직 추가: " + n);
          selOrg = id; close(); render(); U.toast(n + " 추가함");
        };
      });
  }
  function orgEdit(o) {
    var lvOpts = [1, 2, 3, 4].map(function (l) { return '<option value="' + l + '"' + (o.lv === l ? " selected" : "") + ">L" + l + " " + M.LVN[l] + "</option>"; }).join("");
    U.modal("<h3>" + esc(M.nm(o)) + " 수정</h3>" +
      '<div class="warnbox"><span class="wi">⚠</span><div><b>조직을 고치면 과거 인력현황 집계가 달라질 수 있습니다</b>이 조직으로 집계되는 범위' + impact(o) + "</div></div>" +
      '<div class="choice"><label class="opt on"><input type="radio" name="em" id="em1" checked><div><b>새 버전으로 변경 (이름 변경 · 상위 이동)</b><span>지금 버전은 변경 시작일 전날로 끝나고 기록이 남음 · 과거 명부는 옛 이름 그대로 집계</span></div></label>' +
      '<label class="opt"><input type="radio" name="em" id="em2"><div><b>현재 버전 바로 고치기 (오타 정정 · 레벨 지정)</b><span>기록 없이 덮어씀 · v' + o.v[0].n + " 기간 전체에 적용</span></div></label></div>" +
      '<div class="form"><label for="fNm">조직명</label><input class="inp" id="fNm" value="' + esc(M.nm(o)) + '">' +
      '<label for="fLv">레벨</label><select class="inp" id="fLv">' + (o.lv === 0 ? '<option value="0" selected>레벨 미정</option>' : "") + lvOpts + "</select>" +
      '<label for="fPar">상위 조직</label><select class="inp" id="fPar"></select>' +
      '<label for="fCode">소속코드</label><input class="inp" id="fCode" value="' + esc(o.code || "") + '">' +
      '<label for="fFrom" id="lFrom">변경 시작일</label><input class="inp" id="fFrom" type="date" value="' + U.today() + '"></div>' +
      '<label class="chk"><input type="checkbox" id="fAck"> 위 영향 범위를 확인했습니다</label><div class="foot"><button class="btn" data-x>취소</button><button class="btn pri" id="ok" disabled>적용</button></div>',
      function (ov, close, shake) {
        var lvS = ov.querySelector("#fLv"), parS = ov.querySelector("#fPar"), ok = ov.querySelector("#ok");
        function fillPar() { var l = +lvS.value; parS.innerHTML = l <= 1 ? '<option value="">— (최상위)</option>' : liveLv(l - 1, o.p).filter(function (x) { return x.id !== o.id; }).map(function (x) { return '<option value="' + x.id + '"' + (x.id === o.p ? " selected" : "") + ">" + esc(M.path(x)) + "</option>"; }).join(""); }
        fillPar(); lvS.onchange = fillPar;
        ov.querySelector("#fAck").onchange = function () { ok.disabled = !this.checked; };
        ov.addEventListener("change", function (e) { if (e.target.name === "em") { var nv = ov.querySelector("#em1").checked; ov.querySelector("#lFrom").hidden = !nv; ov.querySelector("#fFrom").hidden = !nv; } });
        ok.onclick = function () {
          var n = U.norm(ov.querySelector("#fNm").value), lv = +lvS.value, p = parS.value || null, code = U.norm(ov.querySelector("#fCode").value), from = ov.querySelector("#fFrom").value;
          if (!n) { shake(); return; }
          var ch = []; if (n !== M.nm(o)) ch.push("이름: " + M.nm(o) + " → " + n); if (lv !== o.lv) ch.push("레벨: " + M.LVN[o.lv] + " → " + M.LVN[lv]);
          if ((p || null) !== (o.p || null)) ch.push("상위: " + (o.p ? M.nm(M.byId("org", o.p)) : "없음") + " → " + (p ? M.nm(M.byId("org", p)) : "없음")); if (code !== (o.code || "")) ch.push("코드: " + (o.code || "-") + " → " + code);
          if (!ch.length) { shake(); U.toast("바뀐 내용 없음"); return; }
          var asNew = ov.querySelector("#em1").checked;
          if (asNew && o.v[0].from && from <= o.v[0].from) { shake(); U.toast("변경 시작일은 v" + o.v[0].n + " 시작일(" + o.v[0].from + ") 뒤여야 함"); return; }
          App.change(function () {
            if (asNew) { o.v[0].to = U.prevDay(from); o.v.unshift({ n: o.v[0].n + 1, nm: n, from: from, to: "", src: "수기 수정", note: ch.join(" · ") }); }
            else { o.v[0].nm = n; o.v[0].note = (o.v[0].note ? o.v[0].note + " · " : "") + "정정 " + U.today(); }
            o.lv = lv; o.p = p; o.code = code; if (p) open[p] = true;
          }, "master", "조직 수정 " + o.id + ": " + ch.join(" · "));
          close(); U.toast((asNew ? "새 버전 추가 · " : "정정 · ") + ch.join(" · "));
        };
      });
  }
  function orgRetire(o) {
    var lk = M.kids(o.id).filter(function (c) { return !c.dead; });
    U.modal("<h3>" + esc(M.nm(o)) + " 폐지</h3>" + (lk.length ? '<div class="warnbox bad"><span class="wi">⛔</span><div><b>살아 있는 하위 조직이 ' + lk.length + "개 있어 폐지할 수 없습니다</b>먼저 다른 상위로 옮기거나 폐지하세요.</div></div><div class=\"foot\"><button class=\"btn\" data-x>닫기</button></div>" :
      '<div class="warnbox"><span class="wi">⚠</span><div><b>폐지일 다음 날부터 현재 기준에서 빠집니다</b>버전 이력은 남아 과거 명부는 그대로 집계됩니다.' + impact(o) + '</div></div><div class="form"><label for="fTo">폐지일</label><input class="inp" id="fTo" type="date" value="' + U.today() + '"></div>' +
      '<label class="chk"><input type="checkbox" id="fAck"> 위 영향 범위를 확인했습니다</label><div class="foot"><button class="btn" data-x>취소</button><button class="btn danger" id="ok" disabled>폐지</button></div>'),
      function (ov, close) {
        var ok = ov.querySelector("#ok"); if (!ok) return;
        ov.querySelector("#fAck").onchange = function () { ok.disabled = !this.checked; };
        ok.onclick = function () { var to = ov.querySelector("#fTo").value; App.change(function () { o.dead = true; o.v[0].to = to; }, "master", "조직 폐지: " + M.nm(o) + " (" + to + ")"); close(); U.toast(M.nm(o) + " 폐지 처리함"); };
      });
  }
  function orgDel(o) {
    var k = M.desc(o);
    U.modal("<h3>" + esc(M.nm(o)) + " 삭제</h3>" + (k ? '<div class="warnbox bad"><span class="wi">⛔</span><div><b>하위 조직이 ' + k + "개 있어 삭제할 수 없습니다</b>조직이 없어진 거라면 삭제 대신 폐지 처리를 쓰세요.</div></div><div class=\"foot\"><button class=\"btn\" data-x>닫기</button><button class=\"btn\" id=\"toRet\">폐지 처리로</button></div>" :
      '<div class="warnbox bad"><span class="wi">⛔</span><div><b>삭제하면 되돌리기(Ctrl+Z) 말고는 복구할 수 없습니다</b>버전 이력이 지워지고, 이 조직 이름들은 다시 미매칭으로 나오며, 분류 기준에서 이 조직 카드도 빠집니다.' + impact(o) + "</div></div>" +
      '<p>실제로 없어진 조직이면 <b>폐지 처리</b>가 맞습니다. 잘못 만든 조직일 때만 삭제하세요.</p><div class="form"><label for="fCf">확인 입력</label><input class="inp" id="fCf" placeholder="' + esc(M.nm(o)) + ' 입력" autocomplete="off"></div>' +
      '<div class="foot"><button class="btn" data-x>취소</button><button class="btn" id="toRet">폐지 처리로</button><button class="btn danger" id="ok" disabled>삭제</button></div>'),
      function (ov, close) {
        ov.querySelector("#toRet").onclick = function () { close(); orgRetire(o); };
        var ok = ov.querySelector("#ok"); if (!ok) return;
        ov.querySelector("#fCf").oninput = function () { ok.disabled = U.norm(this.value) !== M.nm(o); };
        ok.onclick = function () {
          App.change(function () { M.S.org.splice(M.S.org.indexOf(o), 1); dropCards("org:" + o.id); }, "master", "조직 삭제: " + M.nm(o));
          selOrg = o.p; close(); U.toast(M.nm(o) + " 삭제");
        };
      });
  }
  function dropCards(c) { M.S.sets.forEach(function (s) { s.rows.forEach(function (r) { r.cards = r.cards.filter(function (x) { return x.c !== c; }); }); }); }
  function orgMenu(o, x, y) {
    var nx = o.lv && o.lv < 4 ? M.LVN[o.lv + 1] : "";
    U.menu(x, y, '<span class="lv lv' + o.lv + '">' + (o.lv ? "L" + o.lv : "?") + "</span>" + esc(M.nm(o)), [
      { ic: "＋", t: nx ? nx + " 추가 (하위)" : "하위 추가", dis: !o.lv ? "레벨 먼저" : o.lv >= 4 ? "센터 아래 없음" : o.dead ? "폐지됨" : "", fn: function () { orgAdd(o); } },
      { ic: "＋", t: (M.LVN[o.lv] || "조직") + " 추가 (같은 레벨)", dis: o.lv <= 1 ? "회사·미정" : "", fn: function () { orgAdd(o.p && M.byId("org", o.p), o.lv); } }, "-",
      { ic: "✎", t: "수정 (이름 · 레벨 · 상위 · 코드)", fn: function () { orgEdit(o); } },
      { ic: "⊘", t: "폐지 처리", dis: o.dead ? "이미 폐지" : "", fn: function () { orgRetire(o); } }, "-",
      { ic: "✕", t: "삭제", danger: true, fn: function () { orgDel(o); } }]);
  }

  /* ════ 직급 · 직무 ════ */
  function renderFlat(el, kind) {
    var L = M.S[kind], name = kind === "grd" ? "직급" : "직무", hcm = kind === "grd" ? HC.g : HC.j;
    if (!L.length) { el.innerHTML = emptyBox(); return; }
    var sel = kind === "grd" ? selG : selJ; var it = M.byId(kind, sel) || L[0]; if (kind === "grd") selG = it.id; else selJ = it.id;
    var max = Math.max.apply(null, L.map(function (x) { return hcm[x.id] || 0; }).concat([1]));
    el.innerHTML = '<div class="two"><div class="pane left"><h3>' + name + " 목록 <small>" + L.length + '개</small></h3><div class="scroll" data-blank="' + kind + '"><ul class="tree">' +
      L.map(function (x) { return '<li><div class="node' + (x === it ? " sel" : "") + (x.dead ? " dead" : "") + '" data-fid="' + x.id + '" tabindex="0"><span class="tw"></span>' + (kind === "grd" ? '<span class="code">' + esc(x.v[0].code || "") + "</span>" : "") +
        '<span class="nm">' + esc(M.nm(x)) + "</span>" + (x.v.length > 1 ? '<span class="vtag">v' + x.v[0].n + "</span>" : "") + (x.dead ? '<span class="vtag">폐지</span>' : "") + '<span class="hc">' + (hcm[x.id] || 0) + "</span></div></li>"; }).join("") +
      '</ul><div style="min-height:120px"></div></div><div class="hint">항목 우클릭 = 수정 · 폐지 · 삭제 · 순서 / 빈칸 우클릭 = 추가</div></div>' +
      '<div class="pane"><div class="scroll"><div class="detail"><div class="dh"><h2>' + esc(M.nm(it)) + "</h2>" + (it.dead ? '<span class="pill off">폐지 · ' + (it.v[0].to || "") + "</span>" : '<span class="pill ok">사용 중</span>') +
      '<div class="acts"><button class="btn sm" data-fa="add">＋ 추가</button><button class="btn sm" data-fa="up">▲</button><button class="btn sm" data-fa="dn">▼</button><button class="btn sm" data-fa="edit">✎ 수정</button><button class="btn sm" data-fa="del">삭제</button></div></div>' +
      '<div class="fields"><div class="fld"><label>ID</label><div class="well mono">' + it.id + "</div></div>" + (kind === "grd" ? '<div class="fld"><label>직급코드</label><div class="well mono">' + esc(it.v[0].code || "-") + "</div></div>" : "") +
      '<div class="fld"><label>인원 (' + (HC.file ? U.fmtM(HC.file.m) : "-") + ')</label><div class="well mono">' + (hcm[it.id] || 0) + '명</div></div><div class="fld"><label>순번</label><div class="well mono">' + (L.indexOf(it) + 1) + "</div></div></div>" +
      '<div class="sec"><h4>버전 이력 <small>레벨 없음 · 이름' + (kind === "grd" ? " · 코드" : "") + "과 기간</small></h4>" + verList(it, kind) + "</div>" +
      '<div class="sec"><h4>현재 인원 분포</h4><table class="tbl"><thead><tr><th>' + name + '</th><th class="n">인원</th><th>비중</th></tr></thead><tbody>' +
      L.filter(function (x) { return hcm[x.id]; }).map(function (x) { return "<tr><td>" + esc(M.nm(x)) + '</td><td class="n">' + hcm[x.id] + '</td><td><span class="bar" style="width:' + Math.max(2, Math.round(hcm[x.id] / max * 160)) + 'px"></span></td></tr>'; }).join("") + "</tbody></table></div></div></div></div></div>";
  }
  function flatAdd(kind) {
    var g = kind === "grd", name = g ? "직급" : "직무";
    U.modal("<h3>" + name + ' 추가</h3><div class="form"><label for="fNm">' + name + '명</label><input class="inp" id="fNm">' + (g ? '<label for="fCode">직급코드</label><input class="inp" id="fCode">' : "") +
      '<label for="fFrom">시작일</label><input class="inp" id="fFrom" type="date" value="' + U.today() + '"></div><div class="foot"><button class="btn" data-x>취소</button><button class="btn pri" id="ok">추가</button></div>',
      function (ov, close, shake) {
        ov.querySelector("#ok").onclick = function () {
          var n = U.norm(ov.querySelector("#fNm").value); if (!n) { shake(); return; }
          if (M.S[kind].some(function (x) { return M.nm(x) === n && !x.dead; })) { shake(); U.toast("같은 이름이 이미 있음"); return; }
          var id; App.change(function () { id = M.nid(g ? "g" : "j"); M.S[kind].push({ id: id, ord: 0, dead: false, v: [{ n: 1, nm: n, code: g ? U.norm(ov.querySelector("#fCode").value) : "", from: ov.querySelector("#fFrom").value, to: "", src: "수기 등록", note: "신설" }] }); }, "master", name + " 추가: " + n);
          if (g) selG = id; else selJ = id; close(); render(); U.toast(n + " 추가함");
        };
      });
  }
  function flatEdit(kind, it) {
    var g = kind === "grd", name = g ? "직급" : "직무";
    U.modal("<h3>" + esc(M.nm(it)) + " 수정</h3>" + '<div class="warnbox"><span class="wi">⚠</span><div><b>현재 인원 ' + ((g ? HC.g : HC.j)[it.id] || 0) + "명 · 분류 기준 카드 " + usedCards((g ? "grd:" : "job:") + it.id) + "개에 영향</b></div></div>" +
      '<div class="choice"><label class="opt on"><input type="radio" name="em" id="em1" checked><div><b>새 버전으로 변경</b><span>지금 이름은 시작일 전날로 끝나고 기록이 남음</span></div></label><label class="opt"><input type="radio" name="em" id="em2"><div><b>현재 버전 바로 고치기 (오타 정정)</b><span>기록 없이 덮어씀</span></div></label></div>' +
      '<div class="form"><label for="fNm">' + name + '명</label><input class="inp" id="fNm" value="' + esc(M.nm(it)) + '">' + (g ? '<label for="fCode">직급코드</label><input class="inp" id="fCode" value="' + esc(it.v[0].code || "") + '">' : "") +
      '<label for="fFrom" id="lFrom">변경 시작일</label><input class="inp" id="fFrom" type="date" value="' + U.today() + '"></div><div class="foot"><button class="btn" data-x>취소</button><button class="btn pri" id="ok">적용</button></div>',
      function (ov, close, shake) {
        ov.addEventListener("change", function (e) { if (e.target.name === "em") { var nv = ov.querySelector("#em1").checked; ov.querySelector("#lFrom").hidden = !nv; ov.querySelector("#fFrom").hidden = !nv; } });
        ov.querySelector("#ok").onclick = function () {
          var n = U.norm(ov.querySelector("#fNm").value), code = g ? U.norm(ov.querySelector("#fCode").value) : "", from = ov.querySelector("#fFrom").value;
          if (!n || (n === M.nm(it) && (!g || code === (it.v[0].code || "")))) { shake(); U.toast("바뀐 내용 없음"); return; }
          var asNew = ov.querySelector("#em1").checked;
          if (asNew && it.v[0].from && from <= it.v[0].from) { shake(); U.toast("변경 시작일은 현재 버전 시작일 뒤여야 함"); return; }
          var old = M.nm(it);
          App.change(function () {
            if (asNew) { it.v[0].to = U.prevDay(from); it.v.unshift({ n: it.v[0].n + 1, nm: n, code: code, from: from, to: "", src: "수기 수정", note: old !== n ? old + " → " + n : "코드 변경" }); }
            else { it.v[0].nm = n; if (g) it.v[0].code = code; }
          }, "master", name + " 수정: " + old + " → " + n);
          close(); U.toast(name + " 수정함");
        };
      });
  }
  function flatRetire(kind, it) {
    U.modal("<h3>" + esc(M.nm(it)) + ' 폐지</h3><p>폐지일 다음 날부터 현재 기준에서 빠집니다. 버전 이력은 남습니다.</p><div class="form"><label for="fTo">폐지일</label><input class="inp" id="fTo" type="date" value="' + U.today() + '"></div><div class="foot"><button class="btn" data-x>취소</button><button class="btn danger" id="ok">폐지</button></div>',
      function (ov, close) { ov.querySelector("#ok").onclick = function () { var to = ov.querySelector("#fTo").value; App.change(function () { it.dead = true; it.v[0].to = to; }, "master", "폐지: " + M.nm(it)); close(); }; });
  }
  function flatDel(kind, it) {
    var hcN = (kind === "grd" ? HC.g : HC.j)[it.id] || 0;
    U.modal("<h3>" + esc(M.nm(it)) + ' 삭제</h3><div class="warnbox bad"><span class="wi">⛔</span><div><b>삭제하면 버전 이력이 지워집니다</b>현재 ' + hcN + "명 · 버전 " + it.v.length + "개. 과거 명부에서 이 이름은 다시 미매칭으로 나오고, 분류 기준에서 이 카드도 빠집니다.</div></div>" +
      (hcN ? "<p>지금 쓰는 값입니다. 없어진 거라면 폐지 처리가 맞습니다.</p>" : "") + '<div class="foot"><button class="btn" data-x>취소</button><button class="btn" id="toRet">폐지 처리로</button><button class="btn danger" id="ok">삭제</button></div>',
      function (ov, close) {
        ov.querySelector("#toRet").onclick = function () { close(); flatRetire(kind, it); };
        ov.querySelector("#ok").onclick = function () { App.change(function () { M.S[kind].splice(M.S[kind].indexOf(it), 1); dropCards(kind + ":" + it.id); }, "master", "삭제: " + M.nm(it)); close(); };
      });
  }
  function flatMove(kind, it, d) { var L = M.S[kind], i = L.indexOf(it), j = i + d; if (j < 0 || j >= L.length) return; App.change(function () { L.splice(i, 1); L.splice(j, 0, it); }, "master"); }
  function flatMenu(kind, it, x, y) {
    U.menu(x, y, esc((kind === "grd" ? "직급" : "직무") + " · " + M.nm(it)), [
      { ic: "✎", t: "수정", fn: function () { flatEdit(kind, it); } }, { ic: "▲", t: "위로", fn: function () { flatMove(kind, it, -1); } }, { ic: "▼", t: "아래로", fn: function () { flatMove(kind, it, 1); } },
      { ic: "⊘", t: "폐지 처리", dis: it.dead ? "이미 폐지" : "", fn: function () { flatRetire(kind, it); } }, { ic: "✕", t: "삭제", danger: true, fn: function () { flatDel(kind, it); } }, "-",
      { ic: "＋", t: (kind === "grd" ? "직급" : "직무") + " 추가", fn: function () { flatAdd(kind); } }]);
  }

  /* ════ 명부 통합: 직원명부 여러 개를 파일 하나로 → 다음부터 통합파일 + 새 명부만 읽음 ════ */
  function renderMerge(el) {
    var mi = M.MINFO, F = M.FILES, fr = mi ? mi.fresh : F.map(function (f) { return f.name; });
    var card = function (t, v, s, cls) { return '<div class="mgc' + (cls ? " " + cls : "") + '"><span>' + t + "</span><b>" + v + "</b><em>" + s + "</em></div>"; };
    var h = '<div class="mgw"><div class="mgcards">' +
      card("직원명부 폴더", F.length + "개", F.length ? U.fmtM(F[0].m) + " ~ " + U.fmtM(F[F.length - 1].m) : "파일 없음") +
      (mi && !mi.bad ? card("통합파일", mi.n + "개", mi.at + " 만듦 · " + (mi.bytes / 1048576).toFixed(1) + "MB", "ok") : card("통합파일", mi && mi.bad ? "읽기 실패" : "없음", mi && mi.bad ? "다시 만들어야 함" : "아직 안 만듦", "bad")) +
      card("이번에 원본에서 읽음", fr.length + "개", mi && !mi.bad ? (fr.length ? "통합파일에 없는 명부" : "모두 통합파일에서 읽음") : "통합파일이 없어 전부", fr.length && mi && !mi.bad ? "warn" : "") + "</div>" +
      '<p class="mgp">열 때 <b>통합파일 1개 + 통합파일에 없는 명부</b>만 읽습니다. 새 명부를 넣고 몇 달 쌓이면 <b>[다시 만들기]</b>로 합쳐 두면 됩니다.<br>' +
      '위치: <b>백데이터\\통합\\' + M.MERGE + '</b> · 원본 직원명부는 건드리지 않고 읽기만 합니다 · 이미 넣은 명부 파일을 고치면(크기 · 수정 시각이 달라지면) 그 파일은 자동으로 원본에서 다시 읽습니다.</p>' +
      '<div class="mgb"><button class="btn pri" data-act="mgBuild"' + (F.length ? "" : " disabled") + ">" + (mi && !mi.bad ? "⟳ 통합파일 다시 만들기" + (fr.length ? " (원본 " + fr.length + "개 포함)" : "") : "⊕ 통합파일 만들기 (" + F.length + "개)") + "</button>" +
      (mi ? '<button class="btn" data-act="mgDrop">통합파일 지우기</button>' : "") + "</div>";
    if (mi && !mi.bad && fr.length) h += '<div class="mgl"><div class="fsub">통합파일에 없는 명부 ' + fr.length + "개 (새로 넣었거나 고친 파일)</div>" + fr.map(function (n) { return '<span class="mono">' + esc(n) + "</span>"; }).join("") + "</div>";
    if (mi && mi.gone && mi.gone.length) h += '<div class="mgl"><div class="fsub">통합파일에는 있는데 폴더에 없는 명부 ' + mi.gone.length + "개 (안 씀 · 다시 만들면 빠짐)</div>" + mi.gone.map(function (n) { return '<span class="mono">' + esc(n) + "</span>"; }).join("") + "</div>";
    el.innerHTML = h + "</div>";
  }
  async function mgBuild(btn) {
    btn.disabled = true; btn.textContent = "만드는 중…";
    try { var r = await M.buildMerge(); App.render(); U.toast("통합파일을 만들었습니다 · 명부 " + r.n + "개 · " + (r.bytes / 1048576).toFixed(1) + "MB · 다음부터 이 파일로 빠르게 엽니다", false, 6000); }
    catch (e) { App.render(); U.toast("통합파일을 만들지 못했습니다: " + (e.message || e), true, 8000); }
  }

  /* ════ 미매칭: 줄마다 연결 대상(추천) + 확정 · 폐지 · 신설 / 체크해서 한 번에 / 정렬 · 필터 ════ */
  var mmKind = "all", mmS = null, mmF = {}, mmQ = "", mmSel = {}, mmPick = {}, mmLastI = -1, mmPop = null;
  var MK = { org: "조직", grd: "직급", job: "직무" };
  function fdMap() { var o = {}; M.FILES.forEach(function (f) { o[f.name] = f.date; }); return o; }
  function tgt(u) { return mmPick[u.k] !== undefined ? mmPick[u.k] : u.sug ? u.sug.id : ""; }
  function mmCols(fd) {
    return [
      { k: "kind", t: "구분", v: function (u) { return MK[u.kind]; } },
      { k: "lv", t: "레벨", v: function (u) { return u.kind === "org" ? "L" + u.lv + " " + M.LVN[u.lv] : "-"; } },
      { k: "nm", t: "옛 이름", v: function (u) { return u.nm; } },
      { k: "up", t: "그때 상위", v: function (u) { return u.up || "-"; } },
      { k: "first", t: "처음", v: function (u) { return U.fmtM((fd[u.first] || "").slice(0, 7)); } },
      { k: "last", t: "마지막", v: function (u) { return U.fmtM((fd[u.last] || "").slice(0, 7)); } },
      { k: "nFiles", t: "명부 수", num: 1, v: function (u) { return u.nFiles; } },
      { k: "n", t: "인원", num: 1, v: function (u) { return u.n; } },
      { k: "tg", t: "연결 대상", v: function (u) { var id = tgt(u); return id ? M.nm(M.byId(u.kind, id)) : "(없음)"; } },
      { k: "pct", t: "추천 %", num: 1, v: function (u) { return u.sug && tgt(u) === u.sug.id ? u.sug.pct : 0; } }];
  }
  /* 조건(구분 · 찾기 · 열 필터)을 거친 줄. skip = 이 열 필터는 빼고 */
  function mmRows(all, cols, skip) {
    var q = U.norm(mmQ);
    var r = all.filter(function (u) {
      if (mmKind !== "all" && u.kind !== mmKind) return false;
      if (q && (u.nm + " " + (u.up || "") + " " + cols[8].v(u)).indexOf(q) < 0) return false;
      for (var i = 0; i < cols.length; i++) { var c = cols[i], f = mmF[c.k]; if (f && c.k !== skip && !f[String(c.v(u))]) return false; }
      return true;
    });
    if (mmS) { var c = cols.filter(function (x) { return x.k === mmS.k; })[0];
      if (c) r.sort(function (a, b) { var x = c.v(a), y = c.v(b); return (c.num ? x - y : String(x).localeCompare(String(y), "ko")) * mmS.dir; }); }
    return r;
  }
  function renderMM(el) {
    var all = App.unmatched(), fd = fdMap(), cols = mmCols(fd), rows = mmRows(all, cols);
    var keys = {}; all.forEach(function (u) { keys[u.k] = 1; }); Object.keys(mmSel).forEach(function (k) { if (!keys[k]) delete mmSel[k]; });
    var selN = Object.keys(mmSel).length, nF = Object.keys(mmF).length + (mmQ ? 1 : 0);
    var allOn = rows.length && rows.every(function (u) { return mmSel[u.k]; });
    var h = '<div class="mmw"><div class="mmh"><div class="seg" id="mmk">' + ["all", "org", "grd", "job"].map(function (k) { var n = k === "all" ? all.length : all.filter(function (u) { return u.kind === k; }).length; return '<button data-mk="' + k + '"' + (mmKind === k ? ' class="on"' : "") + ">" + (k === "all" ? "전체" : MK[k]) + " " + n + "</button>"; }).join("") + "</div>" +
      '<input class="srch" id="mmq" placeholder="이름 · 상위 · 대상 찾기" value="' + esc(mmQ) + '">' +
      (nF || mmS ? '<button class="fchip" data-act="mmClr" title="정렬 · 필터 모두 해제">' + (nF ? "필터 " + nF + "개" : "") + (nF && mmS ? " · " : "") + (mmS ? "정렬" : "") + " 적용 중 ✕</button>" : "") +
      '<span class="fs">' + rows.length + " / " + all.length + "건 표시</span><span style=\"flex:1\"></span>" +
      '<button class="btn sm" data-act="mmPick80" title="보이는 줄 중 추천 80% 이상을 체크">추천 80%↑ 체크</button>' +
      '<button class="btn sm" data-act="mmXls" title="보이는 목록을 엑셀로">⇩ 엑셀</button></div>' +
      '<div class="mmbulk' + (selN ? " on" : "") + '"><b>' + selN + "건 선택</b>" +
      '<button class="btn sm pri" data-mb="1">✓ 확정 (각 줄 연결 대상으로)</button><button class="btn sm" data-mb="2">⊘ 폐지로 등록</button><button class="btn sm" data-mb="3">＋ 신설 (사용 중)</button>' +
      '<span class="fs">Shift+클릭 = 범위 선택 · 대상 ▾ 를 바꾸면 그 대상으로 확정</span><span style="flex:1"></span><button class="btn sm" data-act="mmNone">선택 해제</button></div>';
    if (!all.length) h += '<div class="emptyset"><h2>✓ 미매칭 없음</h2><p>모든 직원명부의 조직 · 직급 · 직무 이름이 기준값과 맞습니다.</p></div>';
    else h += '<div class="tblw2"><table class="tbl mmt"><thead><tr><th class="ck"><input type="checkbox" data-mmall' + (allOn ? " checked" : "") + ' title="보이는 줄 모두 선택"></th>' +
      cols.map(function (c) { return '<th class="mmth' + (c.num ? " n" : "") + '"><span data-ms="' + c.k + '">' + c.t + (mmS && mmS.k === c.k ? (mmS.dir > 0 ? " ▲" : " ▼") : "") + '</span><button class="fb' + (mmF[c.k] ? " on" : "") + '" data-mf="' + c.k + '" title="정렬 · 필터">▾</button></th>'; }).join("") +
      "<th>처리</th></tr></thead><tbody>" +
      rows.map(function (u) {
        var i = all.indexOf(u), id = tgt(u), t = id && M.byId(u.kind, id), on = !!mmSel[u.k], ps = t && u.kind === "org" && t.p ? M.path(M.byId("org", t.p)) : "";
        return '<tr class="' + (on ? "sel" : "") + '"><td class="ck"><input type="checkbox" data-mck="' + i + '"' + (on ? " checked" : "") + "></td>" +
          "<td>" + MK[u.kind] + "</td><td>" + (u.kind === "org" ? '<span class="lv lv' + u.lv + '">L' + u.lv + "</span>" : "-") + "</td><td><b>" + esc(u.nm) + "</b>" + (u.code ? " <code>" + esc(u.code) + "</code>" : "") + "</td><td>" + esc(u.up || "-") +
          '</td><td class="mono">' + cols[4].v(u) + '</td><td class="mono">' + cols[5].v(u) + '</td><td class="n">' + u.nFiles + '</td><td class="n">' + u.n + "</td>" +
          '<td><button class="tgb' + (t ? "" : " none") + (mmPick[u.k] !== undefined ? " chg" : "") + '" data-mtg="' + i + '" title="' + esc(t ? (u.kind === "org" ? M.path(t) : M.nm(t)) : "") + '">' + (t ? "→ <b>" + esc(M.nm(t)) + "</b>" + (ps ? ' <span class="fs">' + esc(ps) + "</span>" : "") : "대상 고르기") + " ▾</button></td>" +
          '<td class="n">' + (u.sug && id === u.sug.id ? u.sug.pct + "%" : mmPick[u.k] !== undefined && id ? '<span class="fs">직접</span>' : "-") + "</td>" +
          '<td class="acts"><button class="btn sm pri" data-mdo="1|' + i + '"' + (t ? "" : ' disabled title="연결 대상을 먼저 고르세요"') + '>확정</button><button class="btn sm" data-mdo="2|' + i + '">폐지</button><button class="btn sm" data-mdo="3|' + i + '">신설</button></td></tr>';
      }).join("") + (rows.length ? "" : '<tr><td colspan="12" class="fs" style="text-align:center;padding:20px">조건에 맞는 줄이 없습니다</td></tr>') + "</tbody></table></div>";
    el.innerHTML = h + "</div>";
    var qi = el.querySelector("#mmq");
    if (qi) qi.oninput = function () { mmQ = qi.value; var p = qi.selectionStart; render(); var n = $("#mmq"); if (n) { n.focus(); n.setSelectionRange(p, p); } };
  }
  function mmClose() { if (mmPop) { mmPop.remove(); mmPop = null; } }
  function mmPlace(pop, btn) { document.body.appendChild(pop); var b = btn.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(b.left, innerWidth - pop.offsetWidth - 8)) + "px"; pop.style.top = Math.max(8, Math.min(b.bottom + 4, innerHeight - pop.offsetHeight - 8)) + "px"; }
  /* 열 머리 ▾ : 정렬 + 값 고르기 (엑셀 필터처럼) */
  function mmFilterPop(k, btn) {
    mmClose(); var all = App.unmatched(), cols = mmCols(fdMap()), c = cols.filter(function (x) { return x.k === k; })[0];
    var base = mmRows(all, cols, k), cnt = {};
    base.forEach(function (u) { var v = String(c.v(u)); cnt[v] = (cnt[v] || 0) + 1; });
    var vals = Object.keys(cnt).sort(function (a, b) { return c.num ? a - b : a.localeCompare(b, "ko"); }), cur = mmF[k];
    var p = mmPop = document.createElement("div"); p.className = "fpop";
    p.innerHTML = '<div class="fh">' + c.t + '</div><button class="fi" data-s="1">↑ ' + (c.num ? "작은 값부터" : "가나다순") + '</button><button class="fi" data-s="-1">↓ ' + (c.num ? "큰 값부터" : "가나다 역순") + "</button>" + (mmS ? '<button class="fi" data-s="0">↺ 정렬 해제</button>' : "") +
      '<hr><input class="fsrch" placeholder="값 찾기"><label class="fc all"><input type="checkbox" data-all>(모두 선택)</label><div class="flist">' +
      vals.map(function (v) { return '<label class="fc" data-v="' + esc(v) + '"><input type="checkbox" data-val="' + esc(v) + '"' + (!cur || cur[v] ? " checked" : "") + ">" + esc(v) + ' <span class="fnote" style="margin-left:auto">' + cnt[v] + "</span></label>"; }).join("") + "</div>" +
      '<div class="fft"><button class="btn sm" data-fclr>이 열 필터 지우기</button><span style="flex:1"></span><button class="btn sm" data-fno>취소</button><button class="btn sm pri" data-fok>확인</button></div>';
    mmPlace(p, btn);
    var boxes = U.$$("[data-val]", p), am = p.querySelector("[data-all]"), sr = p.querySelector(".fsrch");
    function vis(x) { return x.closest(".fc").style.display !== "none"; }
    function sync() { var v = boxes.filter(vis); am.checked = v.length && v.every(function (x) { return x.checked; }); }
    sync(); am.onchange = function () { boxes.forEach(function (x) { if (vis(x)) x.checked = am.checked; }); };
    boxes.forEach(function (x) { x.onchange = sync; });
    sr.oninput = function () { var q = U.norm(sr.value); U.$$(".flist .fc", p).forEach(function (l) { l.style.display = !q || l.dataset.v.indexOf(q) >= 0 ? "" : "none"; }); sync(); };
    U.$$("[data-s]", p).forEach(function (x) { x.onclick = function () { var d = +x.dataset.s; mmS = d ? { k: k, dir: d } : null; mmClose(); render(); }; });
    p.querySelector("[data-fno]").onclick = mmClose;
    p.querySelector("[data-fclr]").onclick = function () { delete mmF[k]; if (mmS && mmS.k === k) mmS = null; mmClose(); render(); };
    p.querySelector("[data-fok]").onclick = function () {
      var q = sr.value.trim(), ok = {}, n = 0;
      boxes.forEach(function (x) { if (x.checked && (!q || vis(x))) { ok[x.dataset.val] = 1; n++; } });
      if (!n) { U.toast("값을 하나 이상 고르세요"); return; }
      if (n === vals.length) delete mmF[k]; else mmF[k] = ok;
      mmClose(); render();
    };
  }
  /* 연결 대상 ▾ : 바꾸기 */
  function mmTgtPop(u, btn) {
    mmClose();
    var cands = M.S[u.kind].filter(function (x) { return u.kind !== "org" || x.lv === u.lv || x.lv === 0; });
    var lab = function (c) { return u.kind === "org" ? M.path(c) : M.nm(c) + (c.v[0].code ? " (" + c.v[0].code + ")" : ""); };
    var others = Object.keys(mmSel).filter(function (k) { return k !== u.k && k.split("|")[0] === u.kind; }).length;
    var p = mmPop = document.createElement("div"); p.className = "fpop mmpk";
    p.innerHTML = '<div class="fh">' + esc(u.nm) + " → 연결 대상</div>" + (u.sug ? '<p class="fnote">추천: ' + esc(M.nm(M.byId(u.kind, u.sug.id))) + " (다음 명부에서 " + u.sug.pct + "%)</p>" : "") +
      '<input class="fsrch" placeholder="' + MK[u.kind] + ' 이름 찾기"><div class="flist">' +
      cands.map(function (c) { return '<button class="fi' + (c.id === tgt(u) ? " on" : "") + '" data-c="' + c.id + '" data-v="' + esc(lab(c)) + '">' + esc(lab(c)) + (c.dead ? ' <span class="fnote">폐지</span>' : "") + (u.sug && u.sug.id === c.id ? ' <span class="fnote">추천</span>' : "") + "</button>"; }).join("") + "</div>" +
      (others && mmSel[u.k] ? '<label class="fc"><input type="checkbox" id="mmAllSel">선택한 ' + MK[u.kind] + " " + (others + 1) + "건 모두 이 대상으로</label>" : "") +
      '<div class="fft">' + (mmPick[u.k] !== undefined && u.sug ? '<button class="btn sm" data-reset>추천으로 되돌리기</button>' : "") + '<span style="flex:1"></span><button class="btn sm" data-fno>닫기</button></div>';
    mmPlace(p, btn);
    var sr = p.querySelector(".fsrch"); sr.focus();
    sr.oninput = function () { var q = U.norm(sr.value); U.$$(".flist .fi", p).forEach(function (l) { l.style.display = !q || l.dataset.v.indexOf(q) >= 0 ? "" : "none"; }); };
    U.$$("[data-c]", p).forEach(function (b) { b.onclick = function () {
      var id = b.dataset.c, ch = p.querySelector("#mmAllSel");
      if (ch && ch.checked) Object.keys(mmSel).forEach(function (k) { if (k.split("|")[0] === u.kind) mmPick[k] = id; });
      mmPick[u.k] = id; mmClose(); render(); }; });
    p.querySelector("[data-fno]").onclick = mmClose;
    var rs = p.querySelector("[data-reset]"); if (rs) rs.onclick = function () { delete mmPick[u.k]; mmClose(); render(); };
  }
  function fileDate(fn) { var f = M.FILES.filter(function (x) { return x.name === fn; })[0]; return f ? f.date : ""; }
  /* 한 건 반영 (App.change 안에서 부름) */
  function applyMM(u, how, tg) {
    var from = fileDate(u.first), to = fileDate(u.last);
    if (how === 1) {
      var e = M.byId(u.kind, tg);
      e.v.push({ n: 0, nm: u.nm, code: u.code || "", from: firstDay(from), to: to, src: u.first + " ~ " + u.last, note: "미매칭 연결 " + U.today() });
      e.v.sort(function (a, b) { return (a.from || "") < (b.from || "") ? -1 : 1; }); e.v.forEach(function (v, i) { v.n = i + 1; }); e.v.reverse();
      if (e.lv === 0 && u.kind === "org") e.lv = u.lv;
    } else {
      var k = u.kind === "org" ? "o" : u.kind === "grd" ? "g" : "j";
      var ne = { id: M.nid(k), ord: 0, dead: how === 2, v: [{ n: 1, nm: u.nm, code: u.code || "", from: firstDay(from), to: how === 2 ? to : "", src: u.first + " ~ " + u.last, note: how === 2 ? "미매칭 → 폐지 등록" : "미매칭 → 신규 등록" }] };
      if (u.kind === "org") { ne.lv = u.lv; ne.p = u.up ? M.findOrg(u.up, to) : null; ne.code = ""; }
      M.S[u.kind].push(ne);
    }
    delete mmSel[u.k]; delete mmPick[u.k];
    M.touch(); /* 같은 묶음 안에서 방금 만든 상위 조직도 찾게 */
  }
  var HOW = { 1: "확정", 2: "폐지 등록", 3: "신설" };
  function resolveMM(u, how) {
    var tg = tgt(u); if (how === 1 && !tg) { U.toast("연결 대상을 먼저 고르세요", true); return; }
    var tn = how === 1 ? M.nm(M.byId(u.kind, tg)) : "";
    App.change(function () { applyMM(u, how, tg); }, "master", "미매칭 " + HOW[how] + ": " + u.nm + (tn ? " → " + tn : ""));
    U.toast(u.nm + (how === 1 ? " → " + tn + " 옛 이름으로 연결" : how === 2 ? " 폐지로 등록" : " 신설") + " · 남은 미매칭 " + App.unmatched().length + "건 · Ctrl+Z 되돌리기");
  }
  function bulkMM(how) {
    var all = App.unmatched(), sel = all.filter(function (u) { return mmSel[u.k]; });
    if (!sel.length) return;
    var go = how === 1 ? sel.filter(function (u) { return tgt(u); }) : sel, skip = sel.length - go.length;
    if (!go.length) { U.toast("선택한 줄에 연결 대상이 없습니다", true); return; }
    go.sort(function (a, b) { return (a.lv || 0) - (b.lv || 0); }); /* 신설 때 상위 먼저 */
    U.confirmBox(HOW[how] + " " + go.length + "건", go.slice(0, 10).map(function (u) { return esc(u.nm) + (how === 1 ? " → <b>" + esc(M.nm(M.byId(u.kind, tgt(u)))) + "</b>" : ""); }).join("<br>") + (go.length > 10 ? "<br>… 외 " + (go.length - 10) + "건" : "") +
      (skip ? '<br><br><span style="color:var(--bad)">연결 대상이 없는 ' + skip + "건은 건너뜀 (체크 유지)</span>" : "") + "<br><br>Ctrl+Z 한 번으로 모두 되돌릴 수 있습니다.", HOW[how], how !== 1, function () {
        var tgs = go.map(tgt);
        App.change(function () { go.forEach(function (u, i) { applyMM(u, how, tgs[i]); }); }, "master", "미매칭 " + HOW[how] + " " + go.length + "건 한 번에");
        U.toast(go.length + "건 " + HOW[how] + " · 남은 미매칭 " + App.unmatched().length + "건", false, 5000);
      });
  }
  function mmXls() {
    var all = App.unmatched(), cols = mmCols(fdMap()), rows = mmRows(all, cols);
    var aoa = [cols.map(function (c) { return c.t; }).concat(["연결 대상 경로", "처음 명부", "마지막 명부"])].concat(rows.map(function (u) { var t = tgt(u) && M.byId(u.kind, tgt(u)); return cols.map(function (c) { return c.v(u); }).concat([t ? (u.kind === "org" ? M.path(t) : M.nm(t)) : "", u.first, u.last]); }));
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "미매칭");
    U.download(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })), "미매칭_" + U.stamp() + ".xlsx"); U.toast("보이는 " + rows.length + "건을 엑셀로 내려받았습니다");
  }
  function mmClick(e) {
    var t, all;
    if ((t = e.target.closest("[data-mk]"))) { mmKind = t.dataset.mk; render(); return true; }
    if ((t = e.target.closest("[data-mf]"))) { e.stopPropagation(); mmFilterPop(t.dataset.mf, t); return true; }
    if ((t = e.target.closest("[data-ms]"))) { var k = t.dataset.ms; mmS = mmS && mmS.k === k ? (mmS.dir > 0 ? { k: k, dir: -1 } : null) : { k: k, dir: 1 }; render(); return true; }
    if ((t = e.target.closest("[data-mtg]"))) { e.stopPropagation(); mmTgtPop(App.unmatched()[+t.dataset.mtg], t); return true; }
    if ((t = e.target.closest("[data-mdo]"))) { var a = t.dataset.mdo.split("|"); resolveMM(App.unmatched()[+a[1]], +a[0]); return true; }
    if ((t = e.target.closest("[data-mb]"))) { bulkMM(+t.dataset.mb); return true; }
    if ((t = e.target.closest("[data-mmall]"))) { all = App.unmatched(); var vr = mmRows(all, mmCols(fdMap())); vr.forEach(function (u) { if (t.checked) mmSel[u.k] = 1; else delete mmSel[u.k]; }); render(); return true; }
    if ((t = e.target.closest("[data-mck]"))) {
      all = App.unmatched(); var i = +t.dataset.mck, u = all[i], on = t.checked;
      if (e.shiftKey && mmLastI >= 0) { var vr2 = mmRows(all, mmCols(fdMap())), a1 = vr2.indexOf(all[mmLastI]), b1 = vr2.indexOf(u);
        if (a1 >= 0 && b1 >= 0) vr2.slice(Math.min(a1, b1), Math.max(a1, b1) + 1).forEach(function (x) { if (on) mmSel[x.k] = 1; else delete mmSel[x.k]; }); }
      if (on) mmSel[u.k] = 1; else delete mmSel[u.k];
      mmLastI = i; render(); return true;
    }
    if ((t = e.target.closest("[data-act='mmClr']"))) { mmF = {}; mmS = null; mmQ = ""; render(); return true; }
    if ((t = e.target.closest("[data-act='mmNone']"))) { mmSel = {}; render(); return true; }
    if ((t = e.target.closest("[data-act='mmPick80']"))) { all = App.unmatched(); var n = 0; mmRows(all, mmCols(fdMap())).forEach(function (u) { if (u.sug && tgt(u) === u.sug.id && u.sug.pct >= 80) { mmSel[u.k] = 1; n++; } }); render(); U.toast("추천 80% 이상 " + n + "건 체크 · 위 [✓ 확정] 을 누르면 반영"); return true; }
    if ((t = e.target.closest("[data-act='mmXls']"))) { mmXls(); return true; }
    return false;
  }
  function firstDay(d) { return d ? d.slice(0, 8) + "01" : ""; }

  /* ── 백업 복원 ── */
  function restoreDlg() {
    M.backups().then(function (list) {
      U.modal('<h3>백업에서 되돌리기</h3><p>backup 폴더의 기준정보 파일입니다. 고른 파일로 설정(기준값 · 분류 기준 · 메모)을 되돌립니다. 지금 파일은 먼저 <b>기준정보_되돌리기전_…</b> 으로 보관됩니다.</p>' +
        (list.length ? '<div class="list"><table class="tbl"><thead><tr><th>시각</th><th>종류</th><th class="n">조직</th><th class="n">직급</th><th class="n">직무</th><th class="n">분류 기준 · 줄</th><th></th></tr></thead><tbody>' + list.map(function (b) {
          var n = b.name, k = /업데이트전/.test(n) ? "프로그램 업데이트 직전" : /변환전/.test(n) ? "형식 변환 직전" : /되돌리기전/.test(n) ? "되돌리기 직전" : /일별/.test(n) ? "그날 첫 저장 전" : "30분 자동", c = b.cnt, st = b.stamp;
          var when = st.length >= 8 ? st.slice(0, 4) + "." + st.slice(4, 6) + "." + st.slice(6, 8) + (st.slice(8) !== "0000" ? " " + st.slice(8, 10) + ":" + st.slice(10, 12) : "") : "-";
          return '<tr title="' + esc(n) + '"><td class="mono">' + when + "</td><td>" + k + "</td>" + (c ? '<td class="n">' + c.org + '</td><td class="n">' + c.grd + '</td><td class="n">' + c.job + '</td><td class="n">' + c.sets + " · " + c.rows + "</td>" : '<td colspan="4" class="fs">읽지 못함</td>') +
            '<td><button class="btn sm" data-rs="' + esc(n) + '"' + (c && (c.org || c.sets) ? "" : ' title="비어 있는 백업"') + ">이걸로 되돌리기</button></td></tr>"; }).join("") + "</tbody></table></div>" : "<p>아직 백업이 없습니다.</p>") +
        '<div class="foot"><button class="btn" data-x>닫기</button></div>', function (ov, close) {
          U.$$("[data-rs]", ov).forEach(function (b) { b.onclick = function () { var n = b.dataset.rs; close(); U.confirmBox("되돌리기", "<b>" + esc(n) + "</b> 으로 되돌립니다. 지금 파일은 보관됩니다.", "되돌리기", true, function () { App.restoreFrom(n); }); }; });
        }, "wide");
    });
  }

  /* ── 이벤트 ── */
  function onClick(e) {
    if (App.view !== "setting") return;
    var t;
    if ((t = e.target.closest("[data-act='autoSetup']"))) { if (M.S.org.length) U.confirmBox("기본 세팅 다시 하기", "지금 기준값(조직 · 직급 · 직무)을 <b>지우고</b> 최신 직원명부로 다시 만듭니다. 미매칭 연결 · 수기 수정은 사라집니다. (Ctrl+Z 로 되돌릴 수 있음)", "다시 만들기", true, runSetup); else firstRun(); return; }
    if ((t = e.target.closest("[data-act='rescan']"))) { App.unmatched(true); render(); U.toast("미매칭 " + App.unmatched().length + "건"); return; }
    if ((t = e.target.closest("[data-act='undo']"))) { App.undo(); return; }
    if ((t = e.target.closest("[data-act='redo']"))) { App.redo(); return; }
    if ((t = e.target.closest("[data-act='reload']"))) { App.reload(); return; }
    if ((t = e.target.closest("[data-act='restore']"))) { restoreDlg(); return; }
    if ((t = e.target.closest("[data-act='exportMaster']"))) { U.download(M.exportMaster(), "기준정보_" + U.stamp() + ".xlsx"); U.toast("기준값을 엑셀로 내려받았습니다"); return; }
    if ((t = e.target.closest("[data-act='mgBuild']"))) { mgBuild(t); return; }
    if ((t = e.target.closest("[data-act='mgDrop']"))) { U.confirmBox("통합파일 지우기", "백데이터\\통합\\" + M.MERGE + " 를 지웁니다. 원본 직원명부는 그대로이고, 다음에 열 때 원본을 전부 다시 읽습니다.", "지우기", true, async function () { await M.dropMerge(); App.render(); U.toast("통합파일을 지웠습니다"); }); return; }
    if (tabNow === "classify") return;
    if ((t = e.target.closest("[data-tw]"))) { e.stopPropagation(); open[t.dataset.tw] = !open[t.dataset.tw]; render(); return; }
    if ((t = e.target.closest("[data-oid]"))) { selOrg = t.dataset.oid; render(); return; }
    if ((t = e.target.closest("[data-oa]"))) { var o = M.byId("org", selOrg); if (t.dataset.oa === "add") orgAdd(o); else if (t.dataset.oa === "edit") orgEdit(o); else orgDel(o); return; }
    if ((t = e.target.closest("[data-fid]"))) { if (tabNow === "grd") selG = t.dataset.fid; else selJ = t.dataset.fid; render(); return; }
    if ((t = e.target.closest("[data-fa]"))) { var it = M.byId(tabNow, tabNow === "grd" ? selG : selJ), a = t.dataset.fa;
      if (a === "add") flatAdd(tabNow); else if (a === "edit") flatEdit(tabNow, it); else if (a === "del") flatDel(tabNow, it); else flatMove(tabNow, it, a === "up" ? -1 : 1); return; }
    if (tabNow === "mm" && mmClick(e)) return;
  }
  function onCtx(e) {
    if (App.view !== "setting" || tabNow === "classify") return;
    var n = e.target.closest("[data-oid].node"), f = e.target.closest("[data-fid]"), blank = e.target.closest("[data-blank]");
    if (!n && !f && !blank) return;
    e.preventDefault();
    if (n) { n.classList.add("ctxon"); orgMenu(M.byId("org", n.dataset.oid), e.clientX, e.clientY); }
    else if (f) { f.classList.add("ctxon"); flatMenu(tabNow, M.byId(tabNow, f.dataset.fid), e.clientX, e.clientY); }
    else if (tabNow === "org") U.menu(e.clientX, e.clientY, "조직", [{ ic: "＋", t: "회사(L1) 추가", fn: function () { orgAdd(null, 1); } }, { ic: "＋", t: "본부(L2) 추가", fn: function () { var top = M.S.org.filter(function (o) { return o.lv === 1; })[0]; orgAdd(top || null, 2); } }]);
    else U.menu(e.clientX, e.clientY, tabNow === "grd" ? "직급" : "직무", [{ ic: "＋", t: "추가", fn: function () { flatAdd(tabNow); } }]);
  }
  function onDbl(e) { if (App.view !== "setting") return; var n = e.target.closest("[data-oid].node"); if (n) orgEdit(M.byId("org", n.dataset.oid)); }

  return { init: init, render: render, tab: tab, firstRun: firstRun };
})();
