import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const TYPE_ICONS = { '노트북': '💻', '모니터': '🖥️', '데스크탑': '🖨️', '아이패드': '📱' };

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
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{TYPE_ICONS[asset.asset_type]} {asset.asset_type}{asset.product_name ? ` · ${asset.product_name}` : ''}</div>
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
          <button onClick={handleDeploy} disabled={saving || !form.emp_name} className="btn-primary" style={{ background: '#3B6D11', height: 44, fontSize: 15, marginBottom: 8 }}>
            {saving ? '처리 중...' : '📤 배포'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssetStock() {
  const nav = useNavigate();
  const [assets, setAssets] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [deployModal, setDeployModal] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => { load(); api.getOffices().then(setOffices); }, []);

  async function load() {
    const data = await api.getAssets();
    setAssets(data.filter(a => a.status === '재고'));
    setLoading(false);
  }

  const filtered = assets.filter(a => {
    const matchType = !typeFilter || a.asset_type === typeFilter;
    const matchSearch = !search || a.asset_no?.includes(search) || a.asset_type?.includes(search) || a.product_name?.includes(search);
    return matchType && matchSearch;
  });

  // 종류별 집계
  const byType = assets.reduce((acc, a) => { acc[a.asset_type] = (acc[a.asset_type] || 0) + 1; return acc; }, {});

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/asset-list')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">📦 재고 관리</div>
        <div style={{ width: 40 }} />
      </div>

      {/* 재고 요약 */}
      <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
        {['노트북','모니터','데스크탑','아이패드'].map(t => (
          <div key={t} style={{ background: 'var(--bg2)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{TYPE_ICONS[t]}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{byType[t] || 0}</div>
            <div style={{ fontSize: 9, color: 'var(--text2)' }}>{t}</div>
          </div>
        ))}
      </div>

      {/* 검색 + 필터 */}
      <div style={{ padding: '10px 16px 10px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        <input type="text" placeholder="🔍 자산번호, 제품명 검색"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          <button onClick={() => setTypeFilter('')} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', background: !typeFilter ? '#3B6D11' : 'var(--bg2)', color: !typeFilter ? '#EAF3DE' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>전체 ({assets.length})</button>
          {['노트북','모니터','데스크탑','아이패드'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '4px 12px', borderRadius: 20, border: 'none', background: typeFilter === t ? '#3B6D11' : 'var(--bg2)', color: typeFilter === t ? '#EAF3DE' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
              {TYPE_ICONS[t]} {t} ({byType[t] || 0})
            </button>
          ))}
        </div>
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 40 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">재고가 없습니다.</div>}
        {filtered.map(a => (
          <div key={a.id} style={{ background: 'var(--bg)', border: '0.5px solid #3B6D1130', borderLeft: '4px solid #3B6D11', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{TYPE_ICONS[a.asset_type] || '📦'}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.asset_no}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{a.asset_type}{a.product_name ? ` · ${a.product_name}` : ''}</div>
                </div>
              </div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: '#EAF3DE', color: '#3B6D11' }}>재고</span>
            </div>
            {a.note && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>📝 {a.note}</div>}
            <button onClick={() => setDeployModal(a)} style={{
              width: '100%', height: 36, borderRadius: 8,
              background: '#3B6D11', color: '#EAF3DE',
              border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>📤 배포</button>
          </div>
        ))}
      </div>

      {deployModal && <DeployModal asset={deployModal} offices={offices} onClose={() => setDeployModal(null)} onDone={msg => { setToast(msg); setDeployModal(null); load(); }} />}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
