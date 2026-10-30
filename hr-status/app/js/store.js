/* 폴더 연결 · 파일 읽기 쓰기 (크롬 · 엣지의 폴더 접근 기능) */
var Store = (function () {
  var DB = "hr-status", KEY = "folder", dir = null;

  function idb() {
    return new Promise(function (ok, no) {
      var q = indexedDB.open(DB, 1);
      q.onupgradeneeded = function () { q.result.createObjectStore("kv"); };
      q.onsuccess = function () { ok(q.result); }; q.onerror = function () { no(q.error); };
    });
  }
  function idbGet(k) { return idb().then(function (db) { return new Promise(function (ok) { var r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ok(null); }; }); }); }
  function idbSet(k, v) { return idb().then(function (db) { return new Promise(function (ok) { var t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = ok; t.onerror = ok; }); }); }

  function supported() { return typeof window.showDirectoryPicker === "function"; }
  function restore() {
    return idbGet(KEY).then(function (h) {
      if (!h) return "none";
      dir = h;
      return h.queryPermission({ mode: "readwrite" }).then(function (p) { return p === "granted" ? "ready" : "needPermission"; });
    }).catch(function () { return "none"; });
  }
  function grant() { return dir.requestPermission({ mode: "readwrite" }).then(function (p) { return p === "granted"; }); }
  function pick() { return window.showDirectoryPicker({ id: "hr-status", mode: "readwrite" }).then(function (h) { dir = h; return idbSet(KEY, h).then(function () { return h; }); }); }
  function useHandle(h) { dir = h; }
  function name() { return dir ? dir.name : ""; }

  /* "백데이터/설정/직원명부" 같은 경로의 폴더 */
  async function sub(path, create) {
    var h = dir;
    if (!path) return h;
    var parts = path.split(/[\\/]/).filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      try { h = await h.getDirectoryHandle(parts[i], { create: !!create }); } catch (e) { if (create) throw e; return null; }
    }
    return h;
  }
  async function list(path) {
    var h = await sub(path, false), out = [];
    if (!h) return out;
    for await (var e of h.values()) if (e.kind === "file" && !/^~\$/.test(e.name)) out.push(e.name);
    return out.sort();
  }
  async function read(path, nm) {
    var h = await sub(path, false); if (!h) return null;
    try { var f = await (await h.getFileHandle(nm)).getFile(); return await f.arrayBuffer(); } catch (e) { return null; }
  }
  async function write(path, nm, bytes) {
    var h = await sub(path, true);
    var fh = await h.getFileHandle(nm, { create: true });
    var w = await fh.createWritable(); await w.write(bytes); await w.close();
  }
  async function remove(path, nm) { var h = await sub(path, false); if (h) try { await h.removeEntry(nm); } catch (e) { } }
  async function copy(fromPath, nm, toPath, newName) { var b = await read(fromPath, nm); if (b) await write(toPath, newName, new Uint8Array(b)); return !!b; }
  async function ensure(paths) { for (var i = 0; i < paths.length; i++) await sub(paths[i], true); }

  return { supported: supported, restore: restore, grant: grant, pick: pick, useHandle: useHandle, name: name,
    list: list, read: read, write: write, remove: remove, copy: copy, ensure: ensure };
})();
