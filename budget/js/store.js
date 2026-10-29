/* 데이터 폴더 연결 + 엑셀 파일 읽기/쓰기 + 백업
   data\기준정보.xlsx        : 분류(대·중·소) + 더존 과목 연결 + 버전 이력 — 모든 연도 공통
   data\사업비계획_연도.xlsx  : 연도별 계획 (계정은 기준정보의 ID 로 연결) + 마감 · 변경 차수 */
(function (root) {
  "use strict";

  var DB_NAME = "budget-app", DB_STORE = "kv", KEY_DIR = "dataDir";
  var BACKUP_KEEP = 30;              // 파일별 백업 보관 개수
  var BACKUP_EVERY_MS = 30 * 60000;  // 같은 파일은 30분에 한 번만 백업
  var PREFIX = "사업비계획_";
  var MASTER = "기준정보.xlsx";
  var FORMAT_VER = 3;

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

  /* ---------- 기준정보 (분류 + 더존 연결 + 버전 이력) ----------
     분류 트리: [{id, name, kids:[{id, name, use, dz, kids:[{id, name, use, dz}]}]}] — 배열 순서가 곧 순번
     소분류가 없는 중분류는 그 자체가 계정, 소분류가 있으면 소분류가 계정. dz = 연결된 더존 과목 [{code, name}] */
  var CAT_HEAD = ["대순번", "대분류", "중순번", "중분류", "소순번", "소분류", "더존코드", "더존과목", "사용", "대ID", "중ID", "소ID"];

  function catRows(cat) {
    var out = [];
    function put(ti, t, mi, m, si, s, lf) {
      var base = [ti + 1, t.name, m ? mi + 1 : "", m ? m.name : "", s ? si + 1 : "", s ? s.name : ""];
      var tail = [lf ? (lf.use === false ? "N" : "Y") : "", t.id, m ? m.id : "", s ? s.id : ""];
      var dz = lf && lf.dz && lf.dz.length ? lf.dz : [null];
      dz.forEach(function (d) { out.push(base.concat([d ? d.code || "" : "", d ? d.name || "" : ""]).concat(tail)); });
    }
    cat.forEach(function (t, ti) {
      if (!t.kids.length) put(ti, t, 0, null, 0, null, null);
      t.kids.forEach(function (m, mi) {
        if (!m.kids || !m.kids.length) put(ti, t, mi, m, 0, null, m);
        else m.kids.forEach(function (x, si) { put(ti, t, mi, m, si, x, x); });
      });
    });
    return out;
  }

  // 표 → 분류 트리. 이전 형식(형식버전 2: ID · ERP코드, 소분류 필수)도 읽음
  function parseCat(rows) {
    rows = rows.slice().sort(function (a, b) {
      return (Calc.num(a["대순번"]) - Calc.num(b["대순번"])) || (Calc.num(a["중순번"]) - Calc.num(b["중순번"])) || (Calc.num(a["소순번"]) - Calc.num(b["소순번"]));
    });
    var legacy = rows.length && rows[0]["소ID"] === undefined;
    var cat = [], tops = {}, mids = {}, subs = {};
    rows.forEach(function (r) {
      var t = str(r["대분류"]), m = str(r["중분류"]), s = str(r["소분류"]);
      if (!t) return;
      if (!tops[t]) { tops[t] = { id: legacy ? "" : str(r["대ID"]), name: t, kids: [] }; cat.push(tops[t]); }
      if (!m) return;
      var mk = t + "\u0001" + m;
      if (!mids[mk]) { mids[mk] = { id: legacy ? "" : str(r["중ID"]), name: m, use: true, dz: [], kids: [] }; tops[t].kids.push(mids[mk]); }
      var mid = mids[mk], leaf = mid;
      if (s) {
        var sk = mk + "\u0001" + s;
        if (!subs[sk]) { subs[sk] = { id: legacy ? str(r["ID"]) : str(r["소ID"]), name: s, use: true, dz: [] }; mid.kids.push(subs[sk]); }
        leaf = subs[sk];
      }
      leaf.use = str(r["사용"]) !== "N";
      var code = legacy ? str(r["ERP코드"]) : str(r["더존코드"]), name = legacy ? "" : str(r["더존과목"]);
      if ((code || name) && !leaf.dz.some(function (d) { return d.code === code && d.name === name; })) leaf.dz.push({ code: code, name: name });
    });
    return { cat: cat, legacy: legacy };
  }

  // 결과: {cat, ver:{list:[{v,t,kind,sum,memo}], snaps:{v: cat}}, legacy} | null (파일 없음)
  function loadMaster() {
    return readFile("data", MASTER).then(function (buf) {
      var wb = XLSX.read(buf, { type: "array" });
      var p = parseCat(rowsOf(wb, "분류"));
      var list = rowsOf(wb, "버전").map(function (r) {
        return { v: Calc.num(r["버전"]), t: str(r["일시"]), kind: str(r["구분"]), sum: str(r["요약"]), memo: str(r["메모"]) };
      }).filter(function (x) { return x.v > 0; });
      var byV = {}, snaps = {};
      rowsOf(wb, "버전내용").forEach(function (r) { var v = Calc.num(r["버전"]); (byV[v] = byV[v] || []).push(r); });
      Object.keys(byV).forEach(function (v) { snaps[v] = parseCat(byV[v]).cat; });
      return { cat: p.cat, ver: { list: list, snaps: snaps }, legacy: p.legacy };
    }, function (e) {
      if (e && e.name === "NotFoundError") return null;
      throw e;
    });
  }

  function masterWorkbook(cat, ver) {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet([CAT_HEAD].concat(catRows(cat)), [7, 14, 7, 20, 7, 16, 9, 22, 6, 7, 7, 7]), "분류");
    var list = ver && ver.list || [];
    XLSX.utils.book_append_sheet(wb, sheet([["버전", "일시", "구분", "요약", "메모"]].concat(list.map(function (x) { return [x.v, x.t, x.kind, x.sum, x.memo]; })), [6, 20, 14, 40, 40]), "버전");
    var all = [["버전"].concat(CAT_HEAD)];
    list.forEach(function (x) { var c = ver.snaps[x.v]; if (c) catRows(c).forEach(function (r) { all.push([x.v].concat(r)); }); });
    XLSX.utils.book_append_sheet(wb, sheet(all, [6, 7, 14, 7, 20, 7, 16, 9, 22, 6, 7, 7, 7]), "버전내용");
    XLSX.utils.book_append_sheet(wb, sheet([["항목", "값"], ["저장시각", stamp()], ["프로그램", "사업비 관리 프로그램"], ["형식버전", FORMAT_VER],
      ["설명", "대분류 · 중분류 · 소분류(선택)와 순번, 더존 과목 연결입니다. 한 줄 = 더존 과목 하나. ID 열은 연도별 계획 파일과 연결되므로 바꾸지 마세요."],
      ["버전", "분류를 저장할 때마다 '버전' 시트에 기록되고, 그때의 분류 전체가 '버전내용' 시트에 남습니다."]], [10, 80]), "정보");
    return wb;
  }

  function saveMaster(cat, ver) {
    var bytes = toBytes(masterWorkbook(cat, ver));
    return backupIfDue(MASTER).then(function () { return writeFile("data", MASTER, bytes); });
  }

  /* ---------- 분류 양식 (다운 / 업로드) ---------- */
  var TPL_HEAD = ["대분류", "중분류", "소분류", "더존코드", "더존과목명", "사용"];
  function templateWorkbook(cat) {
    var wb = XLSX.utils.book_new(), aoa = [TPL_HEAD];
    catRows(cat).forEach(function (r) { aoa.push([r[1], r[3], r[5], r[6], r[7], r[8]]); });
    var ws = sheet(aoa, [14, 24, 16, 10, 26, 6]);
    ws["!autofilter"] = { ref: "A1:F" + aoa.length };
    XLSX.utils.book_append_sheet(wb, ws, "분류");
    XLSX.utils.book_append_sheet(wb, sheet([["작성 방법"],
      ["• 한 줄 = 더존 과목 하나입니다. 한 칸(중분류 또는 소분류)에 더존 과목이 여러 개면 같은 분류를 여러 줄 적습니다."],
      ["• 소분류는 선택입니다. 비워 두면 중분류가 계정이 되고, 적으면 소분류가 계정이 됩니다."],
      ["• 더존 과목은 계정(가장 아래 칸)에 연결합니다. 소분류가 있는 중분류에는 소분류 없이 더존 과목을 적을 수 없습니다."],
      ["• 순서(순번)는 줄 순서대로 정해집니다. 엑셀에서 줄을 옮기면 순서가 바뀝니다."],
      ["• 대분류 · 중분류 칸을 비우면 위 줄과 같은 것으로 봅니다 (셀 병합해도 됨)."],
      ["• 더존 과목이 없는 줄도 됩니다 (계획만 세우는 칸). 같은 더존 과목(코드나 이름)이 두 군데 있으면 올릴 수 없습니다."],
      ["• 사용: Y 또는 비움 = 사용, N = 사용 안 함 (계획 표에서 숨김)."],
      ["• 업로드하면 바로 바뀌지 않고, 바뀌는 내용을 먼저 보여줍니다. 확인 후 [적용] → [저장] 하면 새 버전이 됩니다."]], [100]), "안내");
    return wb;
  }
  function downloadTemplate(cat, name) { download(templateWorkbook(cat), name); return name; }

  // 업로드한 양식 → {cat, errors:[...], rows: 읽은 줄 수}
  function parseTemplate(sheets) {
    var errors = [], sh = sheets.filter(function (x) { return x.name === "분류"; })[0] || sheets[0];
    var aoa = sh ? sh.aoa : [], head = -1, col = {};
    for (var r = 0; r < Math.min(15, aoa.length) && head < 0; r++) {
      var row = (aoa[r] || []).map(function (v) { return str(v).replace(/\s+/g, ""); });
      if (row.indexOf("대분류") >= 0 && row.indexOf("중분류") >= 0) {
        head = r;
        TPL_HEAD.forEach(function (h) { col[h] = row.indexOf(h); });
        if (col["더존과목명"] < 0) col["더존과목명"] = row.indexOf("더존과목");
      }
    }
    if (head < 0) return { cat: [], errors: ["'대분류' · '중분류' 머리글이 있는 줄을 찾지 못했습니다. [양식 다운]으로 받은 파일을 쓰세요."], rows: 0 };
    var get = function (row, h) { return col[h] >= 0 ? str(row[col[h]]) : ""; };
    var lastT = "", lastM = "", list = [], n = 0;
    aoa.slice(head + 1).forEach(function (row, i) {
      row = row || [];
      var t = get(row, "대분류"), m = get(row, "중분류"), s = get(row, "소분류"), code = get(row, "더존코드"), name = get(row, "더존과목명"), use = get(row, "사용").toUpperCase();
      if (!t && !m && !s && !code && !name) return;
      n++;
      if (!t) t = lastT;
      if (!m && (s || code || name)) m = lastM;
      if (!t) { errors.push((head + i + 2) + "번째 줄: 대분류가 없습니다"); return; }
      if (t !== lastT) lastM = "";
      lastT = t; if (m) lastM = m;
      list.push({ "대분류": t, "중분류": m, "소분류": s, "더존코드": code.replace(/^\[|\]$/g, ""), "더존과목": name, "사용": use === "N" ? "N" : "Y", "대순번": list.length, "중순번": 0, "소순번": 0, "소ID": "" });
    });
    // 줄 순서 = 순번
    var cat = parseCat(list).cat;
    return { cat: cat, errors: errors, rows: n };
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
    var i;
    for (i = 0; i < 12; i++) e.sv[i] = Calc.num(p["분할" + (i + 1) + "월"]);
    e.memo = str(p["메모"]);
    e.t = Calc.num(p["총액"]);
    e.auto = { "월액": "a", "단가": "a", "인원": "b", "수량": "b", "개월": "c" }[str(p["역산"])] || "t";
    var pm = [], has = false;
    for (i = 1; i <= 12; i++) { var v = p["전년" + i + "월"]; if (v !== undefined && v !== "") has = true; pm.push(Calc.num(v)); }
    e.pm = has ? pm : [];
    if (str(p["계획외"]) === "Y") e.out = true;
    return e;
  }

  // 결과: {year, settings, plan:{ID:입력값}, legacy:[{code,l1,l2,l3,entry}]|null, lock, log, savedAt}
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
      // 계획 마감 · 변경 차수
      var rounds = rowsOf(wb, "차수").map(function (r) {
        return { n: Calc.num(r["차수"]), closedAt: str(r["마감일시"]), openedAt: str(r["변경시작"]), reason: str(r["사유"]), total: Calc.num(r["합계"]), snap: {} };
      });
      rowsOf(wb, "마감본").forEach(function (r) {
        var rd = rounds.filter(function (x) { return x.n === Calc.num(r["차수"]); })[0];
        if (!rd) return;
        var e = planOf(r);
        e.l1 = str(r["대분류"]); e.l2 = str(r["중분류"]); e.l3 = str(r["소분류"]);
        e.plan = Calc.num(r["확정계획액"]);
        e.months = [];
        for (var i = 1; i <= 12; i++) e.months.push(Calc.num(r[i + "월"]));
        rd.snap[str(r["ID"])] = e;
      });
      var last = rounds[rounds.length - 1];
      var lock = { state: !last ? "draft" : last.closedAt ? "closed" : "open", rounds: rounds };
      var log = rowsOf(wb, "이력").map(function (r) { return { t: str(r["시각"]), m: str(r["내용"]) }; });
      return {
        year: year,
        settings: {
          dispUnit: Calc.DISP_UNITS[info["표시단위"]] ? info["표시단위"] : "천원",
          rndUnit: Calc.RND_UNITS[info["반올림단위"]] ? info["반올림단위"] : "천원",
          rndMode: Calc.RND_MODES.indexOf(info["반올림방식"]) >= 0 ? info["반올림방식"] : "반올림"
        },
        plan: plan, legacy: legacy, lock: lock, log: log, savedAt: str(info["저장시각"])
      };
    });
  }

  var PLAN_HEAD = (function () {
    var h = ["ID", "대분류", "중분류", "소분류", "더존코드", "전년실적", "산출방식", "증감률", "금액단가", "인원수량", "개월", "분할"];
    for (var i = 1; i <= 12; i++) h.push("분할" + i + "월");
    h = h.concat(["메모", "계획외", "사용", "총액", "역산"]);
    for (i = 1; i <= 12; i++) h.push("전년" + i + "월");
    return h;
  })();
  function planCells(id, l1, l2, l3, dz, e, use) {
    var isPct = e.meth === "%증감";
    return [id, l1, l2, l3, dz, e.prev, e.meth, isPct ? e.a : "", isPct ? "" : e.a, e.b || "", e.c || "", e.split]
      .concat(e.sv.map(function (v) { return v || ""; })).concat([e.memo, e.out ? "Y" : "", use === false ? "N" : "Y", e.t || "",
        Calc.isQty(e.meth) && e.auto && e.auto !== "t" ? { a: e.meth === "인원" ? "월액" : "단가", b: e.meth === "인원" ? "인원" : "수량", c: "개월" }[e.auto] : ""])
      .concat(e.pm && e.pm.length === 12 ? e.pm : new Array(12).fill(""));
  }

  // state.allRows: 분류 순서대로 모든 계정(사용 안 함 포함) [{id,l1,l2,l3,dz,use, ...입력값}]
  // state.rows: 계획 표에 보이는 계정 (사용 중)
  function buildWorkbook(state) {
    var wb = XLSX.utils.book_new();
    var s = state.settings, rows = state.rows, all = state.allRows || rows, lock = state.lock || { state: "draft", rounds: [] };
    var stName = { draft: "작성 중", closed: "마감", open: "변경 중" }[lock.state];
    XLSX.utils.book_append_sheet(wb, sheet([
      ["항목", "값"], ["연도", state.year], ["저장시각", stamp()], ["프로그램", "사업비 관리 프로그램"],
      ["형식버전", FORMAT_VER], ["표시단위", s.dispUnit], ["반올림단위", s.rndUnit], ["반올림방식", s.rndMode],
      ["계정 수", rows.length], ["계획 상태", stName + (lock.rounds.length ? " (" + roundLabel(lock.rounds[lock.rounds.length - 1].n) + ")" : "")],
      ["설명", "계정 분류와 순번은 기준정보.xlsx 에 있습니다. ID 열은 바꾸지 마세요. 마감본 시트는 마감할 때의 계획 그대로입니다."]
    ], [12, 60]), "정보");

    var dzText = function (r) { return (r.dz || []).map(function (d) { return d.code || d.name; }).join(","); };
    XLSX.utils.book_append_sheet(wb, sheet([PLAN_HEAD].concat(all.map(function (r) {
      return planCells(r.id, r.l1, r.l2, r.l3, dzText(r), r, r.use);
    })), [8, 12, 16, 14, 12, 14, 10, 8, 14, 8, 6, 6].concat(new Array(12).fill(10)).concat([24, 6, 5]), [5, 8]), "계획");

    var mh = ["대분류", "중분류", "소분류", "더존코드", "전년실적", "확정계획액", "증감률"];
    for (var i = 1; i <= 12; i++) mh.push(i + "월");
    mh.push("산출근거", "메모", "계획외");
    XLSX.utils.book_append_sheet(wb, sheet([mh].concat(rows.map(function (r) {
      var c = Calc.compute(r, s);
      return [r.l1, r.l2, r.l3, dzText(r), r.prev, c.plan, isFinite(c.yoy) ? Math.round(c.yoy * 10000) / 10000 : ""]
        .concat(c.months).concat([Calc.basisText(r, s), r.memo, r.out ? "Y" : ""]);
    })), [12, 16, 14, 12, 14, 14, 8].concat(new Array(12).fill(12)).concat([34, 24, 6]), [4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]), "월별계획");

    XLSX.utils.book_append_sheet(wb, sheet([["차수", "구분", "마감일시", "변경시작", "사유", "합계"]].concat(lock.rounds.map(function (r) {
      return [r.n, roundLabel(r.n), r.closedAt, r.openedAt, r.reason, r.total];
    })), [6, 10, 20, 20, 40, 16], [5]), "차수");
    var sh = ["차수", "확정계획액"];
    for (i = 1; i <= 12; i++) sh.push(i + "월");
    var snapRows = [sh.concat(PLAN_HEAD)];
    lock.rounds.forEach(function (rd) {
      Object.keys(rd.snap).forEach(function (id) {
        var e = rd.snap[id];
        snapRows.push([rd.n, e.plan].concat(e.months).concat(planCells(id, e.l1, e.l2, e.l3, "", e, true)));
      });
    });
    XLSX.utils.book_append_sheet(wb, sheet(snapRows, [6, 14].concat(new Array(12).fill(12)).concat([8, 12, 16, 14]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19]), "마감본");

    XLSX.utils.book_append_sheet(wb, sheet([["시각", "내용"]].concat(state.log.slice(-2000).map(function (l) { return [l.t, l.m]; })), [20, 80]), "이력");
    return wb;
  }
  function roundLabel(n) { return n === 0 ? "원안" : n + "차 변경"; }

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
    var head = ["대분류", "중분류", "소분류", (state.year - 1) + "년 실적", state.year + "년 계획", "증감액", "증감률"];
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
    download(wb, name);
    return name;
  }

  function download(wb, name) {
    var blob = new Blob([toBytes(wb)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
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
    fileName: fileName, MASTER: MASTER, exportReport: exportReport, readAnyFile: readAnyFile, stamp: stamp,
    downloadTemplate: downloadTemplate, parseTemplate: parseTemplate, roundLabel: roundLabel
  };
})(this);
