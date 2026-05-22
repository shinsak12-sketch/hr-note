import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

function ContractModal({ request, onClose, onDone }) {
  const [form, setForm] = useState({
    housing_address: request.housing_address || '',
    contract_start: request.contract_start?.split?.('T')[0] || '',
    contract_end: request.contract_end?.split?.('T')[0] || '',
    contract_note: request.contract_note || '',
    deposit: request.deposit || '',
    monthly_rent: request.monthly_rent || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  function searchAddress() {
    if (!window.daum?.Postcode) { alert('주소 검색 로딩 중입니다.'); return; }
    new window.daum.Postcode({
      oncomplete: (data) => setForm(f => ({ ...f, housing_address: data.roadAddress || data.jibunAddress }))
    }).open();
  }

  async function handleSave() {
    setSaving(true);
    await api.updateHousingContract(request.id, form);
    setSaving(false);
    onDone('계약정보가 저장되었습니다.');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📋 계약정보 — {request.emp_name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">사택 주소</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="주소 검색 후 자동입력" value={form.housing_address} readOnly style={{ flex: 1, background: 'var(--bg2)' }} />
              <button type="button" onClick={searchAddress} style={{ padding: '0 12px', height: 40, borderRadius: 8, background: '#3B6D11', color: '#EAF3DE', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>🔍 검색</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">계약 시작일</label>
              <input type="date" value={form.contract_start} onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">계약 만료일</label>
              <input type="date" value={form.contract_end} onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">보증금 (만원)</label>
              <input type="number" placeholder="보증금 (만원)" value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">월세 (만원)</label>
              <input type="number" placeholder="월세 (만원)" value={form.monthly_rent} onChange={e => setForm(f => ({ ...f, monthly_rent: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">계약 특이사항</label>
            <textarea placeholder="특이사항 입력" value={form.contract_note} onChange={e => setForm(f => ({ ...f, contract_note: e.target.value }))} style={{ height: 70 }} />
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ background: '#3B6D11', height: 44, fontSize: 15, marginBottom: 8 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HousingList() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [contractModal, setContractModal] = useState(null);
  const [filter, setFilter] = useState('전체');
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

  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await api.getHousingRequests();
    setRequests(data.filter(r => r.status === '승인'));
    setLoading(false);
  }

  async function handleUpload(file) {
    setUploading(true);
    try {
      const res = await api.uploadHousingExcel(file);
      setToast(`✅ ${res.success}건 등록 완료!`);
      setUploadFile(null);
      setMenuOpen(false);
      load();
    } catch (e) {
      setToast('❌ ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  function getDaysLeft(r) {
    if (!r.contract_end) return null;
    return Math.ceil((new Date(r.contract_end) - new Date()) / (1000*60*60*24));
  }

  function getExpiryStyle(d) {
    if (d === null) return null;
    if (d <= 60) return { color: '#A32D2D', bg: '#FCEBEB', badge: '🔴', label: 'D-' + d };
    if (d <= 90) return { color: '#854F0B', bg: '#FAEEDA', badge: '🟠', label: 'D-' + d };
    if (d <= 180) return { color: '#7A6B00', bg: '#FFFBE6', badge: '🟡', label: 'D-' + d };
    return null;
  }

  const sorted = [...requests].sort((a, b) => {
    const da = a.contract_end ? new Date(a.contract_end) : new Date('9999-12-31');
    const db = b.contract_end ? new Date(b.contract_end) : new Date('9999-12-31');
    return da - db;
  });

  const filtered = sorted.filter(r => {
    const matchSearch = !search || 
      r.emp_name?.includes(search) || 
      r.emp_no?.includes(search) ||
      r.org_name?.includes(search) ||
      r.housing_address?.includes(search);
    if (!matchSearch) return false;
    if (filter === '전체') return true;
    const d = getDaysLeft(r);
    if (filter === '🔴 D-60') return d !== null && d <= 60;
    if (filter === '🟠 D-90') return d !== null && d > 60 && d <= 90;
    if (filter === '🟡 D-180') return d !== null && d > 90 && d <= 180;
    if (filter === '정보없음') return !r.housing_address;
    return true;
  });

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">사택 관리</div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: 'var(--text2)', padding: '4px 8px',
          }}>⋮</button>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 100,
              background: 'var(--bg)', border: '0.5px solid var(--border)',
              borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              overflow: 'hidden', minWidth: 200, padding: 12,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>📤 기존 사택 일괄 등록</div>
              <button onClick={() => api.downloadHousingTemplate()} style={{
                padding: '8px 12px', borderRadius: 8, background: 'var(--bg2)',
                color: 'var(--text)', border: '0.5px solid var(--border)',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>📥 양식 다운로드</button>
              <input type="file" accept=".xlsx,.xls"
                onChange={e => setUploadFile(e.target.files[0])}
                style={{ fontSize: 12 }} />
              {uploadFile && (
                <button onClick={() => handleUpload(uploadFile)} disabled={uploading} style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: '#3B6D11', color: '#EAF3DE',
                  border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{uploading ? '업로드 중...' : '📤 업로드'}</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 필터 탭 */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0', overflowX: 'auto' }}>
        {['전체', '🔴 D-60', '🟠 D-90', '🟡 D-180', '정보없음'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 20, border: 'none',
            background: filter === f ? '#2D6A6A' : 'var(--bg2)',
            color: filter === f ? '#E6F4F4' : 'var(--text2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
          }}>{f}</button>
        ))}
      </div>

      {/* 검색 */}
      <div style={{ padding: '8px 16px 0', borderBottom: '0.5px solid var(--border)', paddingBottom: 10 }}>
        <input type="text" placeholder="🔍 이름, 사번, 조직명, 사택주소 검색"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }} />
        {search && (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
            검색 결과: {filtered.length}건
          </div>
        )}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">해당 사택이 없습니다.</div>}
        {filtered.map(r => {
          const d = getDaysLeft(r);
          const exp = getExpiryStyle(d);
          return (
            <div key={r.id} style={{
              background: 'var(--bg)', border: `0.5px solid ${exp ? exp.color + '30' : 'var(--border)'}`,
              borderLeft: `4px solid ${exp ? exp.color : '#2D6A6A'}`,
              borderRadius: 12, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>
                </div>
                {exp && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: exp.bg, color: exp.color }}>
                    {exp.badge} {exp.label}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
                <div>🏢 {r.org_name} ({r.headquarters})</div>
                {r.housing_address
                  ? <>
                      <div>📍 {r.housing_address}</div>
                      {r.contract_start && <div>📆 {r.contract_start?.split?.('T')[0]} ~ {r.contract_end?.split?.('T')[0]}</div>}
                      {r.deposit && <div>💰 보증금 {Number(r.deposit).toLocaleString()}만원 / 월세 {Number(r.monthly_rent).toLocaleString()}만원</div>}
                      {r.contract_note && <div>📝 {r.contract_note}</div>}
                    </>
                  : <div style={{ color: '#A32D2D' }}>⚠️ 계약정보 미입력</div>
                }
              </div>
              <button onClick={() => setContractModal(r)} style={{
                width: '100%', height: 36, borderRadius: 8,
                background: '#EAF3DE', color: '#3B6D11',
                border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>📋 계약정보 수정</button>
            </div>
          );
        })}
      </div>

      {contractModal && (
        <ContractModal request={contractModal} onClose={() => setContractModal(null)}
          onDone={msg => { setToast(msg); setContractModal(null); load(); }} />
      )}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
