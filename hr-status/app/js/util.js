/* 공통 도구: 화면 조각 · 팝업 · 메뉴 · 월 계산 */
var U = (function () {
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) { return String(s === undefined || s === null ? "" : s).replace(/\s+/g, " ").trim(); }
  /* 마스킹된 자료에 나오는 '#2' 같은 자리표시도 빈칸으로 봄 */
  function blank(s) { var v = norm(s); return !v || /^#\d*$/.test(v); }

  var tt;
  function toast(m, bad, ms) {
    var t = $("#toast"); t.textContent = m; t.classList.toggle("bad", !!bad); t.classList.add("on");
    clearTimeout(tt); tt = setTimeout(function () { t.classList.remove("on"); }, ms || 2200);
  }

  /* 팝업: html, ready(ov, close) */
  function modal(html, ready, cls) {
    var ov = document.createElement("div"); ov.className = "ov";
    ov.innerHTML = '<div class="dlg ' + (cls || "") + '" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(ov);
    var d = ov.firstChild;
    function close() { ov.remove(); }
    function shake() { d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake"); }
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) shake(); });
    $$("[data-x]", ov).forEach(function (b) { b.onclick = close; });
    $$(".opt", ov).forEach(function (o) {
      o.addEventListener("click", function () {
        $$(".opt", ov).forEach(function (x) { x.classList.toggle("on", x === o); });
        var r = o.querySelector("input"); if (r) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    });
    if (ready) ready(ov, close, shake);
    var f = ov.querySelector("input:not([type=radio]):not([type=checkbox]),select,textarea"); if (f) f.focus();
    return ov;
  }
  function confirmBox(title, text, okText, danger, ok) {
    modal("<h3>" + esc(title) + "</h3><p>" + text + '</p><div class="foot"><button class="btn" data-x>취소</button><button class="btn ' + (danger ? "danger" : "pri") + '" id="ok">' + esc(okText) + "</button></div>",
      function (ov, close) { ov.querySelector("#ok").onclick = function () { close(); ok(); }; });
  }
  function nameBox(title, label, val, ok) {
    modal("<h3>" + esc(title) + '</h3><div class="field"><label for="nb">' + esc(label) + '</label><input class="inp" id="nb" value="' + esc(val) + '"></div><div class="foot"><button class="btn" data-x>취소</button><button class="btn pri" id="ok">확인</button></div>',
      function (ov, close) {
        function go() { var v = norm(ov.querySelector("#nb").value); if (!v) return; close(); ok(v); }
        ov.querySelector("#ok").onclick = go; ov.querySelector("#nb").onkeydown = function (e) { if (e.key === "Enter") go(); };
        ov.querySelector("#nb").select();
      });
  }

  /* 우클릭 메뉴: items = [{ic,t,fn,dis,danger,kb} | "-"] */
  var ctx = null;
  function closeCtx() { if (ctx) { ctx.remove(); ctx = null; } $$(".ctxon").forEach(function (n) { n.classList.remove("ctxon"); }); }
  function menu(x, y, head, items) {
    closeCtx();
    ctx = document.createElement("div"); ctx.className = "ctx";
    ctx.innerHTML = (head ? '<div class="hd">' + head + "</div>" : "") + items.map(function (it, i) {
      if (it === "-") return "<hr>";
      return '<button data-ci="' + i + '"' + (it.dis ? " disabled" : "") + ' class="' + (it.danger ? "danger" : "") + '"><span class="i">' + (it.ic || "") + "</span>" + esc(it.t) +
        '<span class="kb">' + esc(it.dis && typeof it.dis === "string" ? it.dis : it.kb || "") + "</span></button>";
    }).join("");
    document.body.appendChild(ctx);
    ctx.style.left = Math.max(8, Math.min(x, innerWidth - ctx.offsetWidth - 8)) + "px";
    ctx.style.top = Math.max(8, Math.min(y, innerHeight - ctx.offsetHeight - 8)) + "px";
    ctx.addEventListener("click", function (e) { var b = e.target.closest("[data-ci]"); if (!b || b.disabled) return; var it = items[+b.dataset.ci]; closeCtx(); it.fn(); });
  }
  document.addEventListener("mousedown", function (e) { if (ctx && !e.target.closest(".ctx")) closeCtx(); });
  window.addEventListener("resize", closeCtx);

  /* 월 */
  function ym(m, d) { var y = +m.slice(0, 4), mo = +m.slice(5) + d; while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; } return y + "-" + (mo < 10 ? "0" : "") + mo; }
  function fmtM(m) { return m ? m.slice(0, 4) + "." + m.slice(5) : "-"; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function stamp(d) { d = d || new Date(); return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) + "_" + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2); }
  function prevDay(d) { var t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); }
  function dateStr(v) {
    if (v === undefined || v === null || v === "") return "";
    if (v instanceof Date) return v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2) + "-" + ("0" + v.getDate()).slice(-2);
    if (typeof v === "number" && v > 20000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    var s = norm(v).replace(/[./]/g, "-"); var m = /^(\d{4})-?(\d{1,2})-?(\d{1,2})/.exec(s);
    return m ? m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2) : s;
  }
  function download(bytes, name) {
    var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function copyText(txt, done) {
    function fb() { var ta = document.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = 0; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { } ta.remove(); done(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fb); else fb();
  }
  function colL(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  return { $: $, $$: $$, esc: esc, norm: norm, blank: blank, toast: toast, modal: modal, confirmBox: confirmBox, nameBox: nameBox,
    menu: menu, closeCtx: closeCtx, ym: ym, fmtM: fmtM, today: today, stamp: stamp, prevDay: prevDay, dateStr: dateStr,
    download: download, copyText: copyText, colL: colL };
})();
