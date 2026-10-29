/* 데이터 폴더 연결 + 엑셀 파일 읽기/쓰기 + 백업
   data\기준정보.xlsx        : 분류(대·중·소) — 모든 연도 공통
   data\사업비계획_연도.xlsx  : 연도별 계획 (계정은 기준정보의 ID 로 연결) */
(function (root) {
  "use strict";

  var DB_NAME = "budget-app", DB_STORE = "kv", KEY_DIR = "dataDir";
  var BACKUP_KEEP = 30;              // 파일별 백업 보관 개수
  var BACKUP_EVERY_MS = 30 * 60000;  // 같은 파일은 30분에 한 번만 백업
  var PREFIX = "사업비계획_";
  var MASTER = "기준정보.xlsx";
  var FORMAT_VER = 2;

  var dir = null;
  var lastBackup = {};

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

  // 자동 점검용: 브라우저 내부 저장소(OPFS)를 폴더처럼 사용
  function useHandle(h) { dir = h; }
  function folderName() { return dir ? dir.name : ""; }
  function sub(name) { return dir.getDirectoryHandle(name, { create: true }); }

  function entries(folder) {
    return sub(folder).then(function (d) {
      var out = [], it = d.values();
      function step() {
        return it.next().then(function (r) {
          if (r.done) return out;
          if (r.value.kind === "file") out.push(r.value.name);
          return step();
        });
      }
      return step();
    });
  }

  function listYears() {
    var re = new RegExp("^" + PREFIX + "(\\d{4})\\.xlsx$");
    return entries("data").then(function (names) {
      return names.map(function (n) { var m = re.exec(n); return m ? parseInt(m[1], 10) : 0; })
        .filter(Boolean).sort();
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

  /* ---------- 공통 ---------- */
  function rowsOf(wb, sheet) {
    var ws = wb.Sheets[sheet];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: "" });
  }
  function str(v) { return String(v === undefined || v === null ? "" : v).trim(); }

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
  function toBytes(wb) { return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })); }

  /* ---------- 기준정보 (분류) ----------
     분류 트리: [{id, name, kids:[{id, name, kids:[{id, name, erp, use}]}]}] — 배열 순서가 곧 순번 */
  function loadMaster() {
    return readFile("data", MASTER).then(function (buf) {
      var wb = XLSX.read(buf, { type: "array" });
      var rows = rowsOf(wb, "분류");
      rows.sort(function (a, b) {
        return (Calc.num(a["대순번"]) - Calc.num(b["대순번"])) || (Calc.num(a["중순번"]) - Calc.num(b["중순번"])) || (Calc.num(a["소순번"]) - Calc.num(b["소순번"]));
      });
      var cat = [], tops = {}, mids = {};
      rows.forEach(function (r) {
        var t = str(r["대분류"]), m = str(r["중분류"]), s = str(r["소분류"]);
        if (!t) return;
        if (!tops[t]) { tops[t] = { id: "", name: t, kids: [] }; cat.push(tops[t]); }
        if (!m) return;
        var mk = t + "\u0001" + m;
        if (!mids[mk]) { mids[mk] = { id: "", name: m, kids: [] }; tops[t].kids.push(mids[mk]); }
        if (!s) return;
        mids[mk].kids.push({ id: str(r["ID"]), name: s, erp: str(r["ERP코드"]), use: str(r["사용"]) !== "N" });
      });
      return cat;
    }, function (e) {
      if (e && e.name === "NotFoundError") return null;
      throw e;
    });
  }

  function masterWorkbook(cat) {
    var wb = XLSX.utils.book_new();
    var aoa = [["대순번", "대분류", "중순번", "중분류", "소순번", "소분류", "ERP코드", "사용", "ID"]];
    cat.forEach(function (t, ti) {
      if (!t.kids.length) aoa.push([ti + 1, t.name, "", "", "", "", "", "", ""]);
      t.kids.forEach(function (m, mi) {
        if (!m.kids.length) aoa.push([ti + 1, t.name, mi + 1, m.name, "", "", "", "", ""]);
        m.kids.forEach(function (s, si) {
          aoa.push([ti + 1, t.name, mi + 1, m.name, si + 1, s.name, s.erp || "", s.use === false ? "N" : "Y", s.id]);
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, sheet(aoa, [7, 14, 7, 14, 7, 20, 10, 6, 8]), "분류");
    XLSX.utils.book_append_sheet(wb, sheet([["항목", "값"], ["저장시각", stamp()], ["프로그램", "사업비 관리 프로그램"], ["형식버전", FORMAT_VER],
      ["설명", "대·중·소 분류와 순번입니다. 순번 숫자로 정렬되며, ID는 연도별 계획 파일과 연결되므로 바꾸지 마세요."]], [10, 70]), "정보");
    return wb;
  }

  function saveMaster(cat) {
    var bytes = toBytes(masterWorkbook(cat));
    return backupIfDue(MASTER).then(function () { return writeFile("data", MASTER, bytes); });
  }

  /* ---------- 연도 계획 ---------- */
  function planOf(p) {
    var meth = str(p["산출방식"]);
    var e = Calc.blankPlan();
    e.prev = Calc.num(p["전년실적"]);
    e.meth = Calc.METHODS.indexOf(meth) >= 0 ? meth : "";
    e.a = e.meth === "%증감" ? Calc.num(p["증감률"]) : Calc.num(p["금액단가"]);
    e.b = Calc.num(p["인원수량"]);
    e.c = Calc.num(p["개월"]);
    e.split = Calc.SPLITS.indexOf(str(p["분할"])) >= 0 ? str(p["분할"]) : "균등";
    for (var i = 0; i < 12; i++) e.sv[i] = Calc.num(p["분할" + (i + 1) + "월"]);
    e.memo = str(p["메모"]);
    return e;
  }

  // 결과: {year, settings, plan:{ID:입력값}, legacy:[{code,l1,l2,l3,entry}]|null, log, savedAt}
  function load(year) {
    return readFile("data", fileName(year)).then(function (buf) {
      var wb = XLSX.read(buf, { type: "array" });
      var info = {};
      rowsOf(wb, "정보").forEach(function (r) { info[str(r["항목"])] = r["값"]; });
      var planRows = rowsOf(wb, "계획"), plan = {}, legacy = null;
      if (planRows.length && planRows[0]["ID"] !== undefined) {
        planRows.forEach(function (r) { var id = str(r["ID"]); if (id) plan[id] = planOf(r); });
      } else {
        // 0.1 판 파일: 코드로 연결
        var byCode = {};
        planRows.forEach(function (r) { byCode[str(r["코드"])] = r; });
        legacy = rowsOf(wb, "계정").filter(function (a) { return str(a["코드"]); }).map(function (a) {
          var code = str(a["코드"]);
          return { code: code, l1: str(a["대분류"]), l2: str(a["중분류"]), l3: str(a["소분류"]), entry: byCode[code] ? planOf(byCode[code]) : Calc.blankPlan() };
        });
      }
      var log = rowsOf(wb, "이력").map(function (r) { return { t: str(r["시각"]), m: str(r["내용"]) }; });
      return {
        year: year,
        settings: {
          dispUnit: Calc.DISP_UNITS[info["표시단위"]] ? info["표시단위"] : "천원",
          rndUnit: Calc.RND_UNITS[info["반올림단위"]] ? info["반올림단위"] : "천원",
          rndMode: Calc.RND_MODES.indexOf(info["반올림방식"]) >= 0 ? info["반올림방식"] : "반올림"
        },
        plan: plan, legacy: legacy, log: log, savedAt: str(info["저장시각"])
      };
    });
  }

  // state.rows: 화면 순서대로 [{id,l1,l2,l3,erp, ...입력값}]
  function buildWorkbook(state) {
    var wb = XLSX.utils.book_new();
    var s = state.settings, rows = state.rows;
    XLSX.utils.book_append_sheet(wb, sheet([
      ["항목", "값"], ["연도", state.year], ["저장시각", stamp()], ["프로그램", "사업비 관리 프로그램"],
      ["형식버전", FORMAT_VER], ["표시단위", s.dispUnit], ["반올림단위", s.rndUnit], ["반올림방식", s.rndMode],
      ["계정 수", rows.length], ["설명", "계정 분류와 순번은 기준정보.xlsx 에 있습니다. ID 열은 바꾸지 마세요."]
    ], [12, 60]), "정보");

    var ph = ["ID", "대분류", "중분류", "소분류", "ERP코드", "전년실적", "산출방식", "증감률", "금액단가", "인원수량", "개월", "분할"];
    for (var i = 1; i <= 12; i++) ph.push("분할" + i + "월");
    ph.push("메모");
    XLSX.utils.book_append_sheet(wb, sheet([ph].concat(rows.map(function (r) {
      var isPct = r.meth === "%증감";
      return [r.id, r.l1, r.l2, r.l3, r.erp, r.prev, r.meth, isPct ? r.a : "", isPct ? "" : r.a, r.b || "", r.c || "", r.split]
        .concat(r.sv.map(function (v) { return v || ""; })).concat([r.memo]);
    })), [8, 12, 12, 18, 9, 14, 10, 8, 14, 8, 6, 6].concat(new Array(12).fill(10)).concat([24]), [5, 8]), "계획");

    var mh = ["대분류", "중분류", "소분류", "ERP코드", "전년실적", "확정계획액", "증감률"];
    for (i = 1; i <= 12; i++) mh.push(i + "월");
    mh.push("산출근거", "메모");
    XLSX.utils.book_append_sheet(wb, sheet([mh].concat(rows.map(function (r) {
      var c = Calc.compute(r, s);
      return [r.l1, r.l2, r.l3, r.erp, r.prev, c.plan, isFinite(c.yoy) ? Math.round(c.yoy * 10000) / 10000 : ""]
        .concat(c.months).concat([Calc.basisText(r, s), r.memo]);
    })), [12, 12, 18, 9, 14, 14, 8].concat(new Array(12).fill(12)).concat([34, 24]), [4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]), "월별계획");

    XLSX.utils.book_append_sheet(wb, sheet([["시각", "내용"]].concat(state.log.slice(-2000).map(function (l) { return [l.t, l.m]; })), [20, 80]), "이력");
    return wb;
  }

  /* ---------- 백업 ---------- */
  function backupIfDue(name, force) {
    var now = Date.now();
    if (!force && lastBackup[name] && now - lastBackup[name] < BACKUP_EVERY_MS) return Promise.resolve(false);
    var base = name.replace(/\.xlsx$/, "");
    return readFile("data", name).then(function (buf) {
      return writeFile("backup", base + "_" + stamp(null, true) + ".xlsx", buf).then(function () {
        lastBackup[name] = now;
        return prune(base + "_").then(function () { return true; });
      });
    }, function () { return false; }); // 아직 파일이 없으면 백업할 것도 없음
  }

  function prune(pre) {
    return entries("backup").then(function (names) {
      names = names.filter(function (n) { return n.indexOf(pre) === 0 && /^\d{8}_\d{6}\.xlsx$/.test(n.slice(pre.length)); }).sort();
      var del = names.slice(0, Math.max(0, names.length - BACKUP_KEEP));
      return sub("backup").then(function (d) { return Promise.all(del.map(function (n) { return d.removeEntry(n); })); });
    });
  }

  function save(state) {
    var bytes = toBytes(buildWorkbook(state));
    var name = fileName(state.year);
    return backupIfDue(name).then(function () { return writeFile("data", name, bytes); }).then(function () { return stamp(); });
  }

  /* ---------- 보고용 내보내기 (다운로드) ---------- */
  function exportReport(state) {
    var s = state.settings, wb = XLSX.utils.book_new();
    var head = ["구분", "중분류", "계정", (state.year - 1) + "년 실적", state.year + "년 계획", "증감액", "증감률"];
    for (var i = 1; i <= 12; i++) head.push(i + "월");
    head.push("산출근거", "메모");
    var aoa = [[state.year + "년 사업비 계획 (단위: 원)"], [], head];
    var tot = { prev: 0, plan: 0, m: new Array(12).fill(0) };
    var groups = [];
    state.rows.forEach(function (r) {
      if (!groups.length || groups[groups.length - 1].name !== r.l1) groups.push({ name: r.l1, rows: [] });
      groups[groups.length - 1].rows.push(r);
    });
    var pct = function (a, b) { return b ? Math.round((a / b - 1) * 10000) / 10000 : ""; };
    groups.forEach(function (g) {
      var gs = { prev: 0, plan: 0, m: new Array(12).fill(0) }, lines = [];
      g.rows.forEach(function (r) {
        var c = Calc.compute(r, s);
        gs.prev += r.prev; gs.plan += c.plan;
        c.months.forEach(function (v, k) { gs.m[k] += v; });
        lines.push(["", r.l2, r.l3, r.prev, c.plan, c.plan - r.prev, pct(c.plan, r.prev)].concat(c.months).concat([Calc.basisText(r, s), r.memo]));
      });
      aoa.push([g.name + " 소계", "", "", gs.prev, gs.plan, gs.plan - gs.prev, pct(gs.plan, gs.prev)].concat(gs.m));
      aoa = aoa.concat(lines);
      tot.prev += gs.prev; tot.plan += gs.plan;
      gs.m.forEach(function (v, k) { tot.m[k] += v; });
    });
    aoa.push(["합계", "", "", tot.prev, tot.plan, tot.plan - tot.prev, pct(tot.plan, tot.prev)].concat(tot.m));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var range = XLSX.utils.decode_range(ws["!ref"]);
    for (var R = 3; R <= range.e.r; R++) for (var C = 3; C <= 18; C++) {
      var cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.t === "n") cell.z = C === 6 ? "0.0%" : "#,##0";
    }
    ws["!cols"] = [14, 12, 18, 14, 14, 13, 8].map(function (w) { return { wch: w }; })
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
    listYears: listYears, load: load, save: save, loadMaster: loadMaster, saveMaster: saveMaster,
    fileName: fileName, MASTER: MASTER, exportReport: exportReport, readAnyFile: readAnyFile, stamp: stamp
  };
})(this);
