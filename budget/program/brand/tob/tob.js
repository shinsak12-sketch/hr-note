/*!
 * tob.js — SHIN 프로그램 공통 서명 캐릭터 '톱' (호박색 도트)
 * 의존성 없음 · 이 파일 하나만 넣으면 됨 (CSS 도 스스로 넣음)
 *
 *   <script src="tob.js"></script>
 *   Tob.svg("base", { size: 28 })            → SVG 문자열 (base | work | done | oops)
 *   Tob.mount(el, "base", 28)                → el 안에 그림
 *   Tob.favicon("base")                      → 브라우저 탭 아이콘
 *   Tob.busy(true|false)                     → data-tob-busy 칸 · 탭 아이콘을 걷는 모습으로
 *   Tob.romp(fromEl)                         → 이스터에그 (뛰어다니다 펑)
 *   Tob.signature(el, "인력관리 프로그램")     → 'Made by SHIN' 서명 줄
 *
 *   자동: <span data-tob="base" data-tob-size="28"></span> 는 켜질 때 알아서 그려짐
 *         data-tob-egg 가 붙은 톱을 누르면 이스터에그
 */
(function (root) {
  "use strict";
  var COLOR = "#EBA21E", EYE = "#1A1F1C", GREEN = "#1D7A4C", BY = "Made by SHIN";
  /* 11×11 몸통 (X = 몸 · E = 눈 자리) */
  var ROWS = ["...........", "...XXXXX...", "..XXXXXXX..", ".XXXXXXXXX.", ".XXXXXXXXX.", ".XXEXXXEXX.", ".XXEXXXEXX.", ".XXXXXXXXX.", "..XXXXXXX..", "...XXXXX...", "..........."];
  var EYES = [[3, 5], [7, 5]];
  var TEETH_A = [[4, 0], [5, 0], [6, 0], [0, 4], [10, 4]];   /* 위 · 양옆 */
  var TEETH_B = [[1, 2], [9, 2], [1, 8], [9, 8]];             /* 대각선 — A와 번갈아 보여서 도는 것처럼 */

  var CSS = "svg.tob{display:block;overflow:visible;flex:none}" +
    ".to-bob{animation:toBob 1.4s steps(1) infinite}@keyframes toBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}" +
    ".to-blink{animation:toBlink 3.6s steps(1) infinite;transform-box:fill-box;transform-origin:50% 100%}@keyframes toBlink{0%,90%,100%{transform:scaleY(1)}92%,96%{transform:scaleY(.5)}}" +
    ".to-look{animation:toLook 1.6s steps(1) infinite}@keyframes toLook{0%,100%{transform:translateX(0)}50%{transform:translateX(1px)}}" +
    ".to-sa{animation:toSa .5s steps(1) infinite}.to-sb{animation:toSb .5s steps(1) infinite}" +
    "@keyframes toSa{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}@keyframes toSb{0%,100%{transform:translateY(-1px)}50%{transform:translateY(0)}}" +
    ".to-ta{animation:toTa 1.2s steps(1) infinite}.to-tb{animation:toTb 1.2s steps(1) infinite;opacity:0}.to-ta.to-fast,.to-tb.to-fast{animation-duration:.4s}" +
    "@keyframes toTa{0%,100%{opacity:1}50%{opacity:0}}@keyframes toTb{0%,100%{opacity:0}50%{opacity:1}}" +
    ".tob-romp{position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;transform-origin:50% 100%;will-change:transform;filter:drop-shadow(0 6px 6px rgba(0,0,0,.18))}.tob-romp svg{width:100%;height:auto}" +
    ".tob-dust{position:fixed;width:6px;height:6px;z-index:2147482999;pointer-events:none;animation:tobDust .8s steps(6) forwards}.tob-dust.big{width:8px;height:8px}" +
    "@keyframes tobDust{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--dx),var(--dy));opacity:0}}" +
    ".tob-back{animation:tobBack .55s steps(5)}@keyframes tobBack{0%{transform:translateY(-14px);opacity:0}60%{transform:translateY(2px);opacity:1}100%{transform:translateY(0)}}" +
    ".tob-sig{display:inline-flex;align-items:center;gap:7px;font:600 12px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;opacity:.8}" +
    "[data-tob-egg]{cursor:pointer}" +
    "@media (prefers-reduced-motion:reduce){.to-bob,.to-blink,.to-look,.to-sa,.to-sb,.to-ta,.to-tb{animation:none}.to-tb{opacity:0}}";
  try { if (!document.getElementById("tob-css")) { var st = document.createElement("style"); st.id = "tob-css"; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); } } catch (e) { }

  function r(x, y, w, h, f) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"/>'; }
  function body(col) { var h = ""; ROWS.forEach(function (row, y) { var x = 0; while (x < row.length) { if (row[x] === ".") { x++; continue; } var s = x; while (x < row.length && row[x] !== ".") x++; h += r(s, y, x - s, 1, col); } }); return h; }

  /* 상태: base 기본 · work 계산 중(걷기 · 옆 보기 · 톱니 빠르게) · done 완료(^ ^ · 팔 듦) · oops 오류(— — · 팔 처짐) */
  function svg(state, opt) {
    opt = opt || {}; state = state || "base";
    var col = opt.color || COLOR, ey = opt.eye || EYE, an = opt.anim !== false, h = body(col);
    var ay = 7 + (state === "done" ? -1 : state === "oops" ? 1 : 0);
    h += r(-1, ay, 2, 1, col) + r(10, ay, 2, 1, col);                                      /* 팔 2칸 */
    var wk = an && state === "work";
    h += '<g class="' + (wk ? "to-sa" : "") + '">' + r(3, 10, 1, 2, col) + '</g><g class="' + (wk ? "to-sb" : "") + '">' + r(7, 10, 1, 2, col) + "</g>";  /* 다리 2칸 */
    var tp = function (L) { return L.map(function (q) { return r(q[0], q[1], 1, 1, col); }).join(""); }, fast = state === "work" ? " to-fast" : "";
    h += '<g class="' + (an ? "to-ta" + fast : "") + '">' + tp(TEETH_A) + '</g><g class="' + (an ? "to-tb" + fast : "") + '"' + (an ? "" : ' style="opacity:0"') + ">" + tp(TEETH_B) + "</g>";
    if (state === "work") h += '<g class="' + (an ? "to-look" : "") + '">' + EYES.map(function (p) { return r(p[0], p[1], 1, 2, ey); }).join("") + "</g>";
    else if (state === "done") h += EYES.map(function (p) { return r(p[0] - 1, p[1] + 1, 1, 1, ey) + r(p[0], p[1], 1, 1, ey) + r(p[0] + 1, p[1] + 1, 1, 1, ey); }).join("");
    else if (state === "oops") h += EYES.map(function (p) { return r(p[0] - 1, p[1] + 1, 2, 1, ey); }).join("");
    else h += '<g class="' + (an ? "to-blink" : "") + '">' + EYES.map(function (p) { return r(p[0], p[1], 1, 2, ey); }).join("") + "</g>";
    var sz = opt.size ? ' width="' + opt.size + '" height="' + Math.round(opt.size * 16 / 17) + '"' : "";
    return '<svg class="tob' + (opt.cls ? " " + opt.cls : "") + '" viewBox="-3 -2 17 16"' + sz + ' xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true"><g class="' + (an ? "to-bob" : "") + '">' + h + "</g></svg>";
  }
  function mount(el, state, size) { if (typeof el === "string") el = document.querySelector(el); if (el) el.innerHTML = svg(state, { size: size }); return el; }
  function favicon(state) {
    try { var s = svg(state || "base", { anim: false }).replace('class="tob"', ""), l = document.querySelector('link[rel="icon"]'); if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); } l.type = "image/svg+xml"; l.href = "data:image/svg+xml," + encodeURIComponent(s); } catch (e) { }
  }
  function busy(on) { [].forEach.call(document.querySelectorAll("[data-tob-busy]"), function (el) { el.innerHTML = svg(on ? "work" : "base", { size: +el.getAttribute("data-tob-size") || 16 }); }); favicon(on ? "work" : "base"); }
  function signature(el, name) { if (typeof el === "string") el = document.querySelector(el); if (!el) return; el.innerHTML = '<span class="tob-sig">' + svg("base", { size: 16 }) + (name ? name + " · " : "") + BY + "</span>"; }

  /* ── 이스터에그: 누르면 화면 여기저기 6~8번 뛰다가 한 바퀴 돌며 펑 · 원래 자리로 돌아옴 ── */
  var ROMP = false;
  function romp(fromEl) {
    if (ROMP) return; ROMP = true;
    var mk = fromEl && fromEl.getBoundingClientRect ? fromEl : null, st = mk ? mk.getBoundingClientRect() : { left: 20, top: 10, width: 30, height: 28 };
    var S = 52, W = innerWidth, H = innerHeight, reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var el = document.createElement("div"); el.className = "tob-romp"; el.style.width = S + "px"; document.body.appendChild(el);
    if (mk) mk.style.visibility = "hidden";
    function face(f) { el.innerHTML = svg(f, { size: S }); }
    function at(x, y, flip, sq) { el.style.transform = "translate(" + Math.round(x - S / 2) + "px," + Math.round(y - S) + "px) scale(" + (flip ? -1 : 1) * (sq ? sq[0] : 1) + "," + (sq ? sq[1] : 1) + ")"; }
    function dust(x, y, n, big) { for (var i = 0; i < n; i++) { var d = document.createElement("i"); d.className = "tob-dust" + (big ? " big" : ""); var a = Math.PI * 2 * i / n + Math.random() * .4, rr = (big ? 60 : 22) + Math.random() * (big ? 40 : 14); d.style.left = x + "px"; d.style.top = y + "px"; d.style.setProperty("--dx", Math.round(Math.cos(a) * rr) + "px"); d.style.setProperty("--dy", Math.round(Math.sin(a) * rr - (big ? 10 : 6)) + "px"); d.style.background = i % 3 ? COLOR : big ? GREEN : "#F6D58E"; document.body.appendChild(d); setTimeout(function (n2) { return function () { n2.remove(); }; }(d), 900); } }
    var x = st.left + st.width / 2, y = st.top + st.height, pts = [], n = 6 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) pts.push([60 + Math.random() * (W - 120), 140 + Math.random() * (H - 200)]);
    face("work"); at(x, y, false);
    if (reduce) { el.style.transition = "opacity .6s"; setTimeout(function () { el.style.opacity = 0; }, 600); setTimeout(end, 1300); return; }
    var k = 0;
    function hop() {
      if (k >= pts.length) return finale();
      var x0 = x, y0 = y, x1 = pts[k][0], y1 = pts[k][1], dur = 420 + Math.random() * 260, hgt = 70 + Math.random() * 120, t0 = performance.now(), flip = x1 < x0;
      face(k % 3 === 2 ? "done" : "work");
      (function step(now) { var t = Math.min(1, (now - t0) / dur), cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * hgt;
        at(cx, cy, flip, t < .12 ? [1.12, .86] : t > .9 ? [1.1, .9] : [.94, 1.08]);
        if (t < 1) requestAnimationFrame(step); else { x = x1; y = y1; at(x, y, flip, [1.15, .82]); dust(x, y - 4, 6); k++; setTimeout(hop, 90 + Math.random() * 160); } })(t0);
    }
    function finale() {
      face("done"); var t0 = performance.now(), y0 = y;
      (function up(now) { var t = Math.min(1, (now - t0) / 520), cy = y0 - Math.sin(Math.PI * t * .5) * 90; el.style.transform = "translate(" + Math.round(x - S / 2) + "px," + Math.round(cy - S) + "px) rotate(" + Math.round(t * 360) + "deg) scale(" + (1 - t * .35) + ")";
        if (t < 1) requestAnimationFrame(up); else { dust(x, cy - S / 2, 14, true); el.remove(); setTimeout(end, 650); } })(t0);
    }
    function end() { if (el.parentNode) el.remove(); if (mk) { mk.style.visibility = ""; mk.classList.add("tob-back"); setTimeout(function () { mk.classList.remove("tob-back"); }, 600); } ROMP = false; }
    setTimeout(hop, 120);
  }

  /* 자동 그리기: data-tob · data-tob-egg */
  function auto() {
    [].forEach.call(document.querySelectorAll("[data-tob]"), function (el) { if (el.querySelector("svg.tob")) return; mount(el, el.getAttribute("data-tob") || "base", +el.getAttribute("data-tob-size") || 24); });
    [].forEach.call(document.querySelectorAll("[data-tob-egg]"), function (el) { if (el._tobEgg) return; el._tobEgg = 1; el.title = el.title || BY; el.addEventListener("click", function () { romp(el); }); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();

  root.Tob = { svg: svg, mount: mount, favicon: favicon, busy: busy, romp: romp, signature: signature, auto: auto, COLOR: COLOR, GREEN: GREEN, BY: BY, ROWS: ROWS };
})(typeof window !== "undefined" ? window : this);
