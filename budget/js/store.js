/* 데이터 폴더 연결 + 엑셀 파일 읽기/쓰기 + 백업 */
(function (root) {
  "use strict";

  var DB_NAME = "budget-app", DB_STORE = "kv", KEY_DIR = "dataDir";
  var BACKUP_KEEP = 30;              // 연도별 백업 보관 개수
  var BACKUP_EVERY_MS = 30 * 60000;  // 같은 연도는 30분에 한 번만 백업
  var PREFIX = "사업비계획_";   // data 파일 이름 앞부분
  var FORMAT_VER = 1;

  var dir = null;            // 사용자가 고른 프로그램 폴더
  var lastBackup = {};       // 연도 → 마지막 백업 시각

  /* ---------- IndexedDB (폴더 핸들 기억) ---------- */
  function idb() {
    return new Promise(function (ok, fail) {
      var q = indexedDB.open(DB_NAME, 1);
      q.onupgradeneeded = function () { q.result.createObjectStore(DB_STORE); };
      q.onsuccess = function () { ok(q.result); };
      q.onerror = function () { fail(q.error); };
    });
  }
  function idbGet(k) {
    return idb().then(function (db) {
      return new Promise(function (ok, fail) {
        var t = db.transaction(DB_STORE).objectStore(DB_STORE).get(k);
        t.onsuccess = function () { ok(t.result); };
        t.onerror = function () { fail(t.error); };
      });
    });
  }
  function idbSet(k, v) {
    return idb().then(function (db) {
      return new Promise(function (ok, fail) {
        var t = db.transaction(DB_STORE, "readwrite");
        t.objectStore(DB_STORE).put(v, k);
        t.oncomplete = function () { ok(); };
        t.onerror = function () { fail(t.error); };
      });
    });
  }

  /* ---------- 폴더 연결 ---------- */
  function supported() { return typeof root.showDirectoryPicker === "function"; }

  // 결과: "ready" | "needPermission" | "none"
  function restore() {
    return idbGet(KEY_DIR).then(function (h) {
      if (!h) return "none";
      dir = h;
      return h.queryPermission({ mode: "readwrite" }).then(function (p) {
        return p === "granted" ? "ready" : "needPermission";
      });
    }).catch(function () { return "none"; });
  }

  // 반드시 버튼 클릭 안에서 호출
  function grant() {
    if (!dir) return Promise.resolve(false);
    return dir.requestPermission({ mode: "readwrite" }).then(function (p) { return p === "granted"; });
  }

  function pick() {
    return root.showDirectoryPicker({ id: "budget-app", mode: "readwrite" }).then(function (h) {
      dir = h;
      return idbSet(KEY_DIR, h).then(function () { return h.name; });
    });
  }

  // 테스트용: 브라우저 내부 저장소(OPFS)를 폴더처럼 사용
  function useHandle(h, prefix) { dir = h; if (prefix) PREFIX = prefix; }

  function folderName() { return dir ? dir.name : ""; }

  function sub(name) { return dir.getDirectoryHandle(name, { create: true }); }

  function listYears() {
    return sub("data").then(function (d) {
      var years = [];
      var it = d.values();
      function step() {
        return it.next().then(function (r) {
          if (r.done) return years.sort();
          var m = r.value.kind === "file" && new RegExp("^" + PREFIX + "(\\d{4})\\.xlsx$").exec(r.value.name);
          if (m) years.push(parseInt(m[1], 10));
          return step();
        });
      }
      return step();
    });
  }

  function fileName(y) { return PREFIX + y + ".xlsx"; }

  function readFile(folder, name) {
    return sub(folder).then(function (d) { return d.getFileHandle(name); })
      .then(function (fh) { return fh.getFile(); })
      .then(function (f) { return f.arrayBuffer(); });
  }

  function writeFile(folder, name, data) {
    return sub(folder).then(function (d) { return d.getFileHandle(name, { create: true }); })
      .then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(data).then(function () { return w.close(); }); });
  }

  /* ---------- 엑셀 ↔ 데이터 ---------- */
  function rowsOf(wb, sheet) {
    var ws = wb.Sheets[sheet];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: "" });
  }

  function load(year) {
    return readFile("data", fileName(year)).then(function (buf) {
      var wb = XLSX.read(buf, { type: "array" });
      var info = {};
      rowsOf(wb, "정보").forEach(function (r) { info[String(r["항목"]).trim()] = r["값"]; });
      var accounts = rowsOf(wb, "계정").filter(function (r) { return String(r["코드"]).trim(); });
      var planRows = {};
      rowsOf(wb, "계획").forEach(function (r) { planRows[String(r["코드"]).trim()] = r; });
      var rows = accounts.map(function (a) {
        var code = String(a["코드"]).trim();
        var r = Calc.blankRow({ code: code, l1: String(a["대분류"] || ""), l2: String(a["중분류"] || ""), l3: String(a["소분류"] || "") });
        var p = planRows[code];
        if (p) {
          r.prev = Calc.num(p["전년실적"]);
          r.meth = Calc.METHODS.indexOf(String(p["산출방식"])) >= 0 ? String(p["산출방식"]) : "";
          r.a = r.meth === "%증감" ? Calc.num(p["증감률"]) : Calc.num(p["금액단가"]);
          r.b = Calc.num(p["인원수량"]);
          r.c = Calc.num(p["개월"]);
          r.split = Calc.SPLITS.indexOf(String(p["분할"])) >= 0 ? String(p["분할"]) : "균등";
          for (var i = 0; i < 12; i++) r.sv[i] = Calc.num(p["분할" + (i + 1) + "월"]);
          r.memo = String(p["메모"] || "");
        }
        return r;
      });
      var log = rowsOf(wb, "이력").map(function (r) { return { t: String(r["시각"]), m: String(r["내용"]) }; });
      return {
        year: year,
        settings: {
          dispUnit: Calc.DISP_UNITS[info["표시단위"]] ? info["표시단위"] : "천원",
          rndUnit: Calc.RND_UNITS[info["반올림단위"]] ? info["반올림단위"] : "천원",
          rndMode: Calc.RND_MODES.indexOf(info["반올림방식"]) >= 0 ? info["반올림방식"] : "반올림"
        },
        rows: rows, log: log, savedAt: String(info["저장시각"] || "")
      };
    });
  }

  function stamp(d, forFile) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    if (forFile) return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function sheet(aoa, widths, numCols, fmt) {
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths.map(function (w) { return { wch: w }; });
    if (numCols) {
      var range = XLSX.utils.decode_range(ws["!ref"]);
      for (var R = 1; R <= range.e.r; R++) numCols.forEach(function (C) {
        var cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.t === "n") cell.z = fmt || "#,##0";
      });
    }
    return ws;
  }

  function buildWorkbook(state) {
    var wb = XLSX.utils.book_new();
    var s = state.settings, now = stamp();
    XLSX.utils.book_append_sheet(wb, sheet([
      ["항목", "값"], ["연도", state.year], ["저장시각", now], ["프로그램", "사업비 관리 프로그램"],
      ["형식버전", FORMAT_VER], ["표시단위", s.dispUnit], ["반올림단위", s.rndUnit], ["반올림방식", s.rndMode],
      ["계정 수", state.rows.length]
    ], [12, 24]), "정보");

    var groups = Calc.groupRows(state.rows), ordered = [];
    groups.forEach(function (g) { ordered = ordered.concat(g.rows); });

    XLSX.utils.book_append_sheet(wb, sheet([["코드", "대분류", "중분류", "소분류"]].concat(
      ordered.map(function (r) { return [String(r.code), r.l1, r.l2, r.l3]; })), [8, 12, 12, 18]), "계정");

    var ph = ["코드", "소분류", "전년실적", "산출방식", "증감률", "금액단가", "인원수량", "개월", "분할"];
    for (var i = 1; i <= 12; i++) ph.push("분할" + i + "월");
    ph.push("메모");
    XLSX.utils.book_append_sheet(wb, sheet([ph].concat(ordered.map(function (r) {
      var isPct = r.meth === "%증감";
      return [String(r.code), r.l3, r.prev, r.meth, isPct ? r.a : "", isPct ? "" : r.a, r.b || "", r.c || "", r.split]
        .concat(r.sv.map(function (v) { return v || ""; })).concat([r.memo]);
    })), [8, 16, 14, 10, 8, 14, 8, 6, 6].concat(new Array(12).fill(10)).concat([24]), [2, 5]), "계획");

    var mh = ["코드", "대분류", "중분류", "소분류", "전년실적", "확정계획액", "증감률"];
    for (i = 1; i <= 12; i++) mh.push(i + "월");
    mh.push("산출근거", "메모");
    XLSX.utils.book_append_sheet(wb, sheet([mh].concat(ordered.map(function (r) {
      var c = Calc.compute(r, s);
      return [String(r.code), r.l1, r.l2, r.l3, r.prev, c.plan, isFinite(c.yoy) ? Math.round(c.yoy * 10000) / 10000 : ""]
        .concat(c.months).concat([Calc.basisText(r, s), r.memo]);
    })), [8, 12, 12, 18, 14, 14, 8].concat(new Array(12).fill(12)).concat([34, 24]), [4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]), "월별계획");

    XLSX.utils.book_append_sheet(wb, sheet([["시각", "내용"]].concat(state.log.slice(-2000).map(function (l) { return [l.t, l.m]; })), [20, 80]), "이력");
    return wb;
  }

  function toBytes(wb) { return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })); }

  /* ---------- 저장 (백업 포함) ---------- */
  function backupIfDue(year, force) {
    var now = Date.now();
    if (!force && lastBackup[year] && now - lastBackup[year] < BACKUP_EVERY_MS) return Promise.resolve(false);
    return readFile("data", fileName(year)).then(function (buf) {
      var name = PREFIX + year + "_" + stamp(null, true) + ".xlsx";
      return writeFile("backup", name, buf).then(function () {
        lastBackup[year] = now;
        return prune(year).then(function () { return true; });
      });
    }, function () { return false; }); // 아직 파일이 없으면 백업할 것도 없음
  }

  function prune(year) {
    return sub("backup").then(function (d) {
      var names = [], it = d.values(), pre = PREFIX + year + "_";
      function step() {
        return it.next().then(function (r) {
          if (r.done) return;
          if (r.value.kind === "file" && r.value.name.indexOf(pre) === 0) names.push(r.value.name);
          return step();
        });
      }
      return step().then(function () {
        names.sort();
        var del = names.slice(0, Math.max(0, names.length - BACKUP_KEEP));
        return Promise.all(del.map(function (n) { return d.removeEntry(n); }));
      });
    });
  }

  function save(state, opts) {
    opts = opts || {};
    var bytes = toBytes(buildWorkbook(state));
    return backupIfDue(state.year, opts.forceBackup).then(function () {
      return writeFile("data", fileName(state.year), bytes);
    }).then(function () { return stamp(); });
  }

  function exists(year) {
    return sub("data").then(function (d) { return d.getFileHandle(fileName(year)); })
      .then(function () { return true; }, function () { return false; });
  }

  /* ---------- 보고용 내보내기 (다운로드) ---------- */
  function exportReport(state) {
    var s = state.settings, wb = XLSX.utils.book_new();
    var head = ["구분", "코드", "계정", (state.year - 1) + "년 실적", state.year + "년 계획", "증감액", "증감률"];
    for (var i = 1; i <= 12; i++) head.push(i + "월");
    head.push("산출근거", "메모");
    var aoa = [[state.year + "년 사업비 계획 (단위: 원)"], [], head];
    var tot = { prev: 0, plan: 0, m: new Array(12).fill(0) };
    Calc.groupRows(state.rows).forEach(function (g) {
      var gs = { prev: 0, plan: 0, m: new Array(12).fill(0) }, lines = [];
      g.rows.forEach(function (r) {
        var c = Calc.compute(r, s);
        gs.prev += r.prev; gs.plan += c.plan;
        c.months.forEach(function (v, k) { gs.m[k] += v; });
        lines.push(["", String(r.code), r.l3, r.prev, c.plan, c.plan - r.prev, isFinite(c.yoy) ? Math.round(c.yoy * 10000) / 10000 : ""]
          .concat(c.months).concat([Calc.basisText(r, s), r.memo]));
      });
      aoa.push([g.name + " 소계", "", "", gs.prev, gs.plan, gs.plan - gs.prev, gs.prev ? Math.round((gs.plan / gs.prev - 1) * 10000) / 10000 : ""].concat(gs.m));
      aoa = aoa.concat(lines);
      tot.prev += gs.prev; tot.plan += gs.plan;
      gs.m.forEach(function (v, k) { tot.m[k] += v; });
    });
    aoa.push(["합계", "", "", tot.prev, tot.plan, tot.plan - tot.prev, tot.prev ? Math.round((tot.plan / tot.prev - 1) * 10000) / 10000 : ""].concat(tot.m));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var range = XLSX.utils.decode_range(ws["!ref"]);
    for (var R = 3; R <= range.e.r; R++) for (var C = 3; C <= 18; C++) {
      var cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.t === "n") cell.z = C === 6 ? "0.0%" : "#,##0";
    }
    ws["!cols"] = [14, 8, 18, 14, 14, 13, 8].map(function (w) { return { wch: w }; })
      .concat(new Array(12).fill({ wch: 12 })).concat([{ wch: 34 }, { wch: 24 }]);
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
    XLSX.utils.book_append_sheet(wb, ws, "사업비계획");
    var name = "사업비계획_" + state.year + "_보고용_" + stamp(null, true).slice(0, 8) + ".xlsx";
    var blob = new Blob([toBytes(wb)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return name;
  }

  /* ---------- 다른 엑셀 읽기 (전년 실적 가져오기) ---------- */
  function readAnyFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: "array" });
      return wb.SheetNames.map(function (n) {
        return { name: n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true }) };
      });
    });
  }

  root.Store = {
    supported: supported, restore: restore, grant: grant, pick: pick, useHandle: useHandle, folderName: folderName,
    listYears: listYears, load: load, save: save, exists: exists, fileName: fileName,
    exportReport: exportReport, readAnyFile: readAnyFile, stamp: stamp
  };
})(this);
