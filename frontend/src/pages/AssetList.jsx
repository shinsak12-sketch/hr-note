import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const ASSET_TYPES = ['노트북', '모니터', '데스크탑', '아이패드'];
const TYPE_ICONS = { '노트북': '💻', '모니터': '🖥️', '데스크탑': '🖨️', '아이패드': '📱' };

export default function AssetList() {
  const nav = useNavigate();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await api.getAssets();
    setAssets(data); setLoading(false);
  }

  async function handleUpload(file) {
    setUploading(true);
    try {
      const res = await api.uploadAssetExcel(file);
      setToast(`✅ ${res.success}건 등록 완료!`);
      setUploadFile(null); setMenuOpen(false); load();
    } catch (e) {
      setToast('❌ ' + e.message);
    } finally { setUploading(false); }
  }

  const filtered = assets.filter(a => {
    const matchType = !typeFilter || a.asset_type === typeFilter;
    const matchSearch = !search ||
      a.asset_no?.includes(search) || a.emp_name?.includes(search) ||
      a.emp_no?.includes(search) || a.org_name?.includes(search);
    return matchType && matchSearch;
  });

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/asset-mgmt')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">자산 목록</div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)', padding: '4px 8px' }}>⋮</button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 100, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 200, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>📤 자산 일괄 등록</div>
              <button onClick={() => api.downloadAssetTemplate()} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg2)', color: 'var(--text)', border: '0.5px solid var(--border)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 양식 다운로드</button>
              <input type="file" accept=".xlsx,.xls" onChange={e => setUploadFile(e.target.files[0])} style={{ fontSize: 12 }} />
              {uploadFile && (
                <button onClick={() => handleUpload(uploadFile)} disabled={uploading} style={{ padding: '8px 12px', borderRadius: 8, background: '#3B6D11', color: '#EAF3DE', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {uploading ? '업로드 중...' : '📤 업로드'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input type="text" placeholder="🔍 자산번호, 이름, 사번, 조직명 검색"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          <button onClick={() => setTypeFilter('')} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', background: !typeFilter ? '#5A4A00' : 'var(--bg2)', color: !typeFilter ? '#FFF9E6' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>전체</button>
          {ASSET_TYPES.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', background: typeFilter === t ? '#5A4A00' : 'var(--bg2)', color: typeFilter === t ? '#FFF9E6' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              {TYPE_ICONS[t]} {t}
            </button>
          ))}
        </div>
        {(search || typeFilter) && <div style={{ fontSize: 12, color: 'var(--text2)' }}>검색 결과: {filtered.length}건</div>}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">자산이 없습니다.</div>}
        {filtered.map(a => (
          <div key={a.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{TYPE_ICONS[a.asset_type] || '📦'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.asset_no}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{a.asset_type}</div>
                </div>
              </div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                background: a.status === '사용중' ? '#EAF3DE' : a.status === '보관중' ? '#E8F0FB' : '#FCEBEB',
                color: a.status === '사용중' ? '#3B6D11' : a.status === '보관중' ? '#1A4A8A' : '#A32D2D',
              }}>{a.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
              {a.emp_name && <div>👤 {a.emp_name} · {a.emp_no}</div>}
              {a.org_name && <div>🏢 {a.org_name}</div>}
              {a.note && <div>📝 {a.note}</div>}
            </div>
          </div>
        ))}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
