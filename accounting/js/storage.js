/* =========================================================================
   storage.js — 크롬 폴더 연결(File System Access API)
   - showDirectoryPicker 로 폴더 선택
   - IndexedDB 에 핸들 저장 → 다음 실행 시 재연결(권한만 재확인)
   - 엑셀/JSON 파일 읽기·쓰기, 연도 하위폴더 관리
   ⚠ localhost 또는 https 에서만 동작 (file:// 불가)
   ========================================================================= */

const IDB_DB="cockpit-fs", IDB_STORE="handles", IDB_KEY="root";

export function isSupported(){ return typeof window.showDirectoryPicker==="function"; }

function idb(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(IDB_DB,1);
    r.onupgradeneeded=()=>r.result.createObjectStore(IDB_STORE);
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
}
async function idbSet(k,v){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction(IDB_STORE,"readwrite");t.objectStore(IDB_STORE).put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}
async function idbGet(k){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction(IDB_STORE,"readonly");const q=t.objectStore(IDB_STORE).get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
async function idbDel(k){const db=await idb();return new Promise((res,rej)=>{const t=db.transaction(IDB_STORE,"readwrite");t.objectStore(IDB_STORE).delete(k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);});}

export class Store {
  constructor(){ this.root=null; }

  get connected(){ return !!this.root; }
  get name(){ return this.root ? this.root.name : null; }

  async pick(){
    this.root = await window.showDirectoryPicker({ mode:"readwrite", id:"cockpit-root" });
    await idbSet(IDB_KEY, this.root);
    return this.root;
  }

  /** 이전에 연결한 폴더를 조용히 복구. 권한 재요청 없이 확인만. */
  async restore(){
    try{
      const h=await idbGet(IDB_KEY);
      if(!h) return false;
      const perm=await h.queryPermission({mode:"readwrite"});
      this.root = h;
      return perm==="granted";   // prompt/denied 면 사용자가 버튼으로 재허용
    }catch(e){ return false; }
  }
  async ensurePermission(){
    if(!this.root) return false;
    if(await this.root.queryPermission({mode:"readwrite"})==="granted") return true;
    return (await this.root.requestPermission({mode:"readwrite"}))==="granted";
  }
  async forget(){ this.root=null; await idbDel(IDB_KEY); }

  // ---- 파일 I/O ----
  async _dir(path, create=false){
    let dir=this.root;
    for(const seg of path.filter(Boolean)) dir=await dir.getDirectoryHandle(seg,{create});
    return dir;
  }
  async fileExists(name, subdir=[]){
    try{ const d=await this._dir(subdir); await d.getFileHandle(name); return true; }
    catch{ return false; }
  }
  async readArrayBuffer(name, subdir=[]){
    const d=await this._dir(subdir);
    const fh=await d.getFileHandle(name);
    const f=await fh.getFile();
    return await f.arrayBuffer();
  }
  async readText(name, subdir=[]){
    try{
      const d=await this._dir(subdir);
      const fh=await d.getFileHandle(name);
      const f=await fh.getFile();
      return await f.text();
    }catch{ return null; }
  }
  async writeArrayBuffer(name, buf, subdir=[]){
    const d=await this._dir(subdir,true);
    const fh=await d.getFileHandle(name,{create:true});
    const w=await fh.createWritable(); await w.write(buf); await w.close();
  }
  async writeText(name, text, subdir=[]){
    const d=await this._dir(subdir,true);
    const fh=await d.getFileHandle(name,{create:true});
    const w=await fh.createWritable(); await w.write(text); await w.close();
  }
  async readJSON(name, subdir=[]){ const t=await this.readText(name,subdir); return t? JSON.parse(t): null; }
  async writeJSON(name, obj, subdir=[]){ await this.writeText(name, JSON.stringify(obj,null,2), subdir); }

  /** 연도 폴더의 하위 파일명 목록 */
  async listYears(){
    const out=[];
    for await (const [k,v] of this.root.entries()){
      if(v.kind==="directory" && /^20\d\d$/.test(k)) out.push(k);
    }
    return out.sort();
  }
}
