import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const ASSET_TYPES = ['노트북', '모니터', '데스크탑', '아이패드'];
const TYPE_ICONS = { '노트북': '💻', '모니터': '🖥️', '데스크탑': '🖨️', '아이패드': '📱' };

// 수정 모달
function EditModal({ asset, offices, onClose, onDone }) {
  const [form, setForm] = useState({
    emp_no: asset.emp_no || '',
    emp_name: asset.emp_name || '',
    office_id: asset.office_id || '',
    org_name: asset.org_name || '',
    product_name: asset.product_name || '',
    status: asset.status || '사용중',
    note: asset.note || '',
  });
  const [officeSearch, setOfficeSearch] = useState('');
  const [showList, setShowList] = useState(false);
  const [saving, setSaving] = useState(false);
  const filtered = officeSearch ? offices.filter(o => o.org_name.includes(officeSearch) || o.headquarters.includes(officeSearch)) : offices;

  async function handleSave() {
    setSaving(true);
    await api.updateAsset(asset.id, form);
    setSaving(false);
    onDone('수정되었습니다.');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>✏️ 자산 수정 — {asset.asset_no}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">제품명</label>
            <input type="text" placeholder="예: HP255 G9" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">사번</label>
              <input type="text" placeholder="사번" value={form.emp_no} onChange={e => setForm(f => ({ ...f, emp_no: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">성명</label>
              <input type="text" placeholder="성명" value={form.emp_name} onChange={e => setForm(f => ({ ...f, emp_name: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">소속</label>
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="센터 검색"
                value={officeSearch || (form.office_id ? (offices.find(o => o.id == form.office_id)?.org_name || form.org_name || '') : form.org_name || '')}
                onChange={e => { setOfficeSearch(e.target.value); setForm(f => ({ ...f, office_id: '', org_name: e.target.value })); setShowList(true); }}
                onFocus={() => setShowList(true)} />
              {showList && filtered.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, maxHeight: 150, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                  {filtered.slice(0, 15).map(o => (
                    <div key={o.id} onClick={() => { setForm(f => ({ ...f, office_id: String(o.id), org_name: o.org_name })); setOfficeSearch(''); setShowList(false); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '0.5px solid var(--border)' }}>
                      <span style={{ fontWeight: 600 }}>{o.org_name}</span><span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{o.headquarters}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">상태</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {['사용중', '보관중', '재고', '폐기'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">비고</label>
            <input type="text" placeholder="비고" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ marginBottom: 8 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 배포 모달
function DeployModal({ asset, offices, onClose, onDone }) {
  const [form, setForm] = useState({ emp_no: '', emp_name: '', office_id: '', org_name: '' });
  const [officeSearch, setOfficeSearch] = useState('');
  const [showList, setShowList] = useState(false);
  const [saving, setSaving] = useState(false);
  const filtered = officeSearch ? offices.filter(o => o.org_name.includes(officeSearch) || o.headquarters.includes(officeSearch)) : offices;

  async function handleDeploy() {
    if (!form.emp_name) return;
    setSaving(true);
    await api.deployAsset(asset.id, form);
    setSaving(false);
    onDone('배포 완료되었습니다.');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>📤 배포 — {asset.asset_no}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{TYPE_ICONS[asset.asset_type]} {asset.asset_type} {asset.product_name ? `· ${asset.product_name}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">사번</label>
              <input type="text" placeholder="사번" value={form.emp_no} onChange={e => setForm(f => ({ ...f, emp_no: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">성명 <span className="req">*</span></label>
              <input type="text" placeholder="성명" value={form.emp_name} onChange={e => setForm(f => ({ ...f, emp_name: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">소속</label>
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="센터 검색"
                value={officeSearch || (form.office_id ? (offices.find(o => o.id == form.office_id)?.org_name || '') : '')}
                onChange={e => { setOfficeSearch(e.target.value); setForm(f => ({ ...f, office_id: '', org_name: e.target.value })); setShowList(true); }}
                onFocus={() => setShowList(true)} />
              {showList && filtered.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, maxHeight: 150, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                  {filtered.slice(0, 15).map(o => (
                    <div key={o.id} onClick={() => { setForm(f => ({ ...f, office_id: String(o.id), org_name: o.org_name })); setOfficeSearch(''); setShowList(false); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '0.5px solid var(--border)' }}>
                      <span style={{ fontWeight: 600 }}>{o.org_name}</span><span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{o.headquarters}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button onClick={handleDeploy} disabled={saving || !form.emp_name} className="btn-primary" style={{ background: '#3B6D11', marginBottom: 8 }}>
            {saving ? '처리 중...' : '📤 배포'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssetList() {
  const nav = useNavigate();
  const [assets, setAssets] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [retrieveConfirm, setRetrieveConfirm] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  useEffect(() => { load(); api.getOffices().then(setOffices); }, []);

  async function load() {
    const data = await api.getAssets();
    setAssets(data.filter(a => a.status !== '재고')); // 재고 제외
    setLoading(false);
  }

  async function handleRetrieve(id) {
    if (retrieveConfirm !== id) { setRetrieveConfirm(id); setTimeout(() => setRetrieveConfirm(null), 3000); return; }
    await api.retrieveAsset(id);
    setRetrieveConfirm(null);
    setToast('회수 처리되었습니다. 재고로 이동했습니다.');
    load();
  }

  async function handleUpload(file) {
    setUploading(true);
    try {
      const res = await api.uploadAssetExcel(file);
      setToast(`✅ ${res.success}건 등록 완료!`);
      setUploadFile(null); setMenuOpen(false); load();
    } catch (e) { setToast('❌ ' + e.message); }
    finally { setUploading(false); }
  }

  const filtered = assets.filter(a => {
    const matchType = !typeFilter || a.asset_type === typeFilter;
    const matchSearch = !search || a.asset_no?.includes(search) || a.emp_name?.includes(search) || a.emp_no?.includes(search) || a.org_name?.includes(search) || a.product_name?.includes(search);
    return matchType && matchSearch;
  });

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">자산 관리</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => nav('/asset-stock')} style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 8,
            background: '#EAF3DE', color: '#3B6D11',
            border: 'none', cursor: 'pointer', fontWeight: 600,
          }}>📦 재고</button>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text2)', padding: '4px 6px' }}>⋮</button>
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
      </div>

      <div style={{ padding: '10px 16px 12px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input type="text" placeholder="🔍 자산번호, 이름, 사번, 조직명, 제품명 검색"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          <button onClick={() => setTypeFilter('')} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', background: !typeFilter ? '#5A4A00' : 'var(--bg2)', color: !typeFilter ? '#FFF9E6' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>전체</button>
          {ASSET_TYPES.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', background: typeFilter === t ? '#5A4A00' : 'var(--bg2)', color: typeFilter === t ? '#FFF9E6' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              {TYPE_ICONS[t]} {t}
            </button>
          ))}
        </div>
        {(search || typeFilter) && <div style={{ fontSize: 12, color: 'var(--text2)' }}>검색 결과: {filtered.length}건</div>}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 40 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">자산이 없습니다.</div>}
        {filtered.map(a => (
          <div key={a.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{TYPE_ICONS[a.asset_type] || '📦'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.asset_no}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{a.asset_type}{a.product_name ? ` · ${a.product_name}` : ''}</div>
                </div>
              </div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                background: a.status === '사용중' ? '#EAF3DE' : a.status === '보관중' ? '#E8F0FB' : '#FCEBEB',
                color: a.status === '사용중' ? '#3B6D11' : a.status === '보관중' ? '#1A4A8A' : '#A32D2D',
              }}>{a.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
              {a.emp_name && <div>👤 {a.emp_name} · {a.emp_no}</div>}
              {a.org_name && <div>🏢 {a.org_name}</div>}
              {a.note && <div>📝 {a.note}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditModal(a)} style={{ flex: 1, height: 34, borderRadius: 8, background: '#E8F0FB', color: '#1A4A8A', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✏️ 수정</button>
              <button onClick={() => handleRetrieve(a.id)} style={{
                flex: 1, height: 34, borderRadius: 8,
                background: retrieveConfirm === a.id ? '#FCEBEB' : '#FFF9E6',
                color: retrieveConfirm === a.id ? '#A32D2D' : '#5A4A00',
                border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>{retrieveConfirm === a.id ? '⚠️ 확인?' : '📥 회수'}</button>
            </div>
          </div>
        ))}
      </div>

      {editModal && <EditModal asset={editModal} offices={offices} onClose={() => setEditModal(null)} onDone={msg => { setToast(msg); setEditModal(null); load(); }} />}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
