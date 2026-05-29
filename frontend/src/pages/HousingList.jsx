import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

// ── 사택 등록/수정 모달 ──────────────────
function HousingModal({ housing, offices, onClose, onDone }) {
  const isEdit = !!housing?.id;
  const fmt = (v) => v ? String(v).split('T')[0] : '';
  const [form, setForm] = useState(housing?.id ? {
    address: housing.address || '',
    area_sqm: housing.area_sqm || '',
    org_name: housing.org_name || '',
    rent_type: housing.rent_type || '월세',
    deposit: housing.deposit || '',
    monthly_rent: housing.monthly_rent || '',
    rent_day: housing.rent_day || '',
    payment_type: housing.payment_type || '후불',
    auto_renew_years: housing.auto_renew_years || '',
    contract_start: fmt(housing.contract_start),
    initial_end: fmt(housing.initial_end),
    contract_end: fmt(housing.contract_end),
    note: housing.note || '',
  } : {
    address: '', area_sqm: '', org_name: '', rent_type: '월세',
    deposit: '', monthly_rent: '', rent_day: '', payment_type: '후불',
    auto_renew_years: '', contract_start: '', initial_end: '', contract_end: '', note: '',
  });
  const [saving, setSaving] = useState(false);
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  function searchAddress() {
    if (!window.daum?.Postcode) { alert('주소 검색 로딩 중입니다.'); return; }
    new window.daum.Postcode({ oncomplete: (d) => setF('address', d.roadAddress || d.jibunAddress) }).open();
  }

  async function handleSave() {
    if (!form.address) return;
    setSaving(true);
    try {
      if (isEdit) await api.updateHousing(housing.id, form);
      else await api.createHousing(form);
      onDone(isEdit ? '수정되었습니다.' : '등록되었습니다.');
    } catch(e) { alert(e.message); } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🏠 {isEdit ? '사택 수정' : '사택 등록'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 32 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>사택 정보</div>
          <div className="form-group">
            <label className="form-label">사택 주소 *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={form.address} readOnly style={{ flex: 1, background: 'var(--bg2)' }} placeholder="주소 검색" />
              <button onClick={searchAddress} style={{ padding: '0 12px', height: 40, borderRadius: 8, background: '#3B6D11', color: '#EAF3DE', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>🔍 검색</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">소속</label>
              <select value={form.org_name} onChange={e => setF('org_name', e.target.value)}>
                <option value="">선택</option>
                {offices.map(o => <option key={o.id} value={o.org_name}>{o.org_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">전용평수</label>
              <input type="number" value={form.area_sqm} onChange={e => setF('area_sqm', e.target.value)} step="0.1" />
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>계약 기간</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group"><label className="form-label">계약 시작일</label><input type="date" value={form.contract_start} onChange={e => setF('contract_start', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">최초 종료일</label><input type="date" value={form.initial_end} onChange={e => setF('initial_end', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group"><label className="form-label">현재 종료일</label><input type="date" value={form.contract_end} onChange={e => setF('contract_end', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">자동갱신(년)</label><input type="number" value={form.auto_renew_years} onChange={e => setF('auto_renew_years', e.target.value)} min="0" max="5" /></div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>임대 조건</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['월세','연세'].map(t => (
              <button key={t} onClick={() => setF('rent_type', t)} style={{ flex: 1, height: 38, borderRadius: 8, fontFamily: 'inherit', border: `2px solid ${form.rent_type===t?'#1A4A8A':'var(--border)'}`, background: form.rent_type===t?'#E8F0FB':'var(--bg)', color: form.rent_type===t?'#1A4A8A':'var(--text2)', fontSize: 13, fontWeight: form.rent_type===t?700:400, cursor: 'pointer' }}>{t}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group"><label className="form-label">보증금(만원)</label><input type="number" value={form.deposit} onChange={e => setF('deposit', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">{form.rent_type==='연세'?'연세':'월세'}(만원)</label><input type="number" value={form.monthly_rent} onChange={e => setF('monthly_rent', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">지급일</label>
              <select value={form.rent_day} onChange={e => setF('rent_day', e.target.value)}>
                <option value="">선택</option>
                {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}일</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">지급시기</label>
              <div style={{ display: 'flex', gap: 6, height: 40 }}>
                {['선불','후불'].map(t=>(
                  <button key={t} onClick={() => setF('payment_type', t)} style={{ flex:1, borderRadius:8, fontFamily:'inherit', border:`2px solid ${form.payment_type===t?'#854F0B':'var(--border)'}`, background:form.payment_type===t?'#FAEEDA':'var(--bg)', color:form.payment_type===t?'#854F0B':'var(--text2)', fontSize:12, fontWeight:form.payment_type===t?700:400, cursor:'pointer' }}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="form-group"><label className="form-label">비고</label><textarea value={form.note} onChange={e => setF('note', e.target.value)} style={{ height: 60 }} /></div>
          <button onClick={handleSave} disabled={!form.address||saving} className="btn-primary" style={{ background: '#2D6A6A', height: 44, marginBottom: 8 }}>
            {saving ? '저장 중...' : isEdit ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 입주자 등록 모달 ──────────────────
function ResidentModal({ housing, offices, onClose, onDone }) {
  const [form, setForm] = useState({ emp_no: '', emp_name: '', org_name: '', move_in_date: '', note: '' });
  const [saving, setSaving] = useState(false);
  function setF(k,v) { setForm(f=>({...f,[k]:v})); }
  async function handleSave() {
    if (!form.emp_no||!form.emp_name||!form.move_in_date) return;
    setSaving(true);
    try { await api.addHousingResident(housing.id, form); onDone('입주 처리되었습니다.'); }
    catch(e) { alert(e.message); } finally { setSaving(false); }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>👤 입주자 등록 — {housing.address}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', paddingBottom: 32 }}>
          {housing.emp_name && (
            <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', borderRadius: 8, padding: '8px 12px' }}>
              현재 입주자 {housing.emp_name}이 퇴거 처리됩니다.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group"><label className="form-label">사번 *</label><input value={form.emp_no} onChange={e=>setF('emp_no',e.target.value)} /></div>
            <div className="form-group"><label className="form-label">성명 *</label><input value={form.emp_name} onChange={e=>setF('emp_name',e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">소속</label>
            <select value={form.org_name} onChange={e=>setF('org_name',e.target.value)}>
              <option value="">선택</option>
              {offices.map(o=><option key={o.id} value={o.org_name}>{o.org_name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">입주일 *</label><input type="date" value={form.move_in_date} onChange={e=>setF('move_in_date',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">비고</label><textarea value={form.note} onChange={e=>setF('note',e.target.value)} style={{ height: 60 }} /></div>
          <button onClick={handleSave} disabled={!form.emp_no||!form.emp_name||!form.move_in_date||saving} className="btn-primary" style={{ marginBottom: 8 }}>
            {saving ? '처리 중...' : '입주 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────
export default function HousingList() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('전체');
  const [housingModal, setHousingModal] = useState(null);
  const [residentModal, setResidentModal] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [offices, setOffices] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    load();
    api.getOffices().then(setOffices);
    function h(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      setCardMenuOpen(null);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function load() {
    const data = await api.getHousingList();
    setList(data); setLoading(false);
  }

  async function loadDetail(id) {
    const data = await api.getHousingDetail(id);
    setDetail(data); setDetailId(id);
  }

  async function handleCheckout(housingId, residentId) {
    const date = prompt('퇴거일을 입력하세요 (YYYY-MM-DD)');
    if (!date) return;
    await api.checkoutResident(housingId, residentId, date);
    setToast('퇴거 처리되었습니다.');
    load();
    loadDetail(housingId);
  }

  async function handleDelete(id) {
    if (!window.confirm('삭제하시겠습니까?')) return;
    await api.deleteHousing(id);
    setToast('삭제되었습니다.');
    load();
  }

  async function handleUpload(file) {
    setUploading(true);
    try {
      const res = await api.uploadHousingExcel(file);
      setToast(`✅ ${res.success}건 완료${res.errors?.length ? ` (오류 ${res.errors.length}건)` : ''}`);
      load();
    } catch(e) { setToast('❌ ' + e.message); } finally { setUploading(false); }
  }

  async function handleDownloadTemplate() {
    const blob = await api.downloadHousingTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'HR노트_사택등록양식.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const [cardMenuOpen, setCardMenuOpen] = useState(null); // housing id
  const [terminateModal, setTerminateModal] = useState(null);
  const [terminateDate, setTerminateDate] = useState('');

  async function handleTerminate() {
    if (!terminateDate) return;
    await api.terminateHousing(terminateModal.id, terminateDate);
    setToast('임차종료 처리되었습니다.');
    setTerminateModal(null); setTerminateDate('');
    load();
  }

  const today = new Date();
  const filtered = list.filter(r => {
    const matchSearch = !search || r.address?.includes(search) || r.emp_name?.includes(search) || r.org_name?.includes(search);
    const matchFilter = filter === '전체' ||
      (filter === '입주중' && r.emp_name) ||
      (filter === '공실' && !r.emp_name) ||
      (filter === '만료임박' && r.contract_end && Math.ceil((new Date(r.contract_end) - today) / (1000*60*60*24)) <= 30);
    return matchSearch && matchFilter;
  });

  return (
    <div className="container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">사택 관리</div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o=>!o)} style={{ width:34, height:34, borderRadius:8, background:'var(--bg2)', border:'none', cursor:'pointer', fontSize:18, color:'var(--text2)' }}>⋮</button>
          {menuOpen && (
            <div style={{ position:'absolute', right:0, top:'110%', zIndex:100, background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', minWidth:180, padding:12, display:'flex', flexDirection:'column', gap:8 }}>
              <button onClick={() => { setHousingModal({}); setMenuOpen(false); }} style={{ padding:'8px 12px', borderRadius:8, background:'#2D6A6A', color:'#E6F4F4', border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>🏠 신규 등록</button>
              <div style={{ borderTop:'0.5px solid var(--border)', paddingTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                <button onClick={() => { handleDownloadTemplate(); setMenuOpen(false); }} style={{ padding:'8px 12px', borderRadius:8, background:'var(--bg2)', border:'0.5px solid var(--border)', fontSize:12, cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>📥 양식 다운로드</button>
                <label style={{ padding:'8px 12px', borderRadius:8, background:'#EAF3DE', color:'#3B6D11', fontSize:12, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>
                  📤 엑셀 업로드
                  <input type="file" accept=".xlsx" style={{ display:'none' }} onChange={e => { if(e.target.files[0]) handleUpload(e.target.files[0]); setMenuOpen(false); e.target.value=''; }} />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 검색 */}
      <div style={{ padding: '10px 16px 0' }}>
        <input placeholder="🔍 주소, 직원명, 소속 검색" value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }} />
      </div>

      {/* 필터 */}
      <div style={{ display:'flex', gap:6, padding:'8px 16px', overflowX:'auto', scrollbarWidth:'none' }}>
        {['전체','입주중','공실','만료임박'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding:'4px 12px', borderRadius:20, border:'none', whiteSpace:'nowrap',
            background: filter===f ? '#2D6A6A' : 'var(--bg2)',
            color: filter===f ? '#E6F4F4' : 'var(--text2)',
            fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
          }}>
            {f} <span style={{ fontSize:11, opacity:0.8 }}>
              {f==='전체' ? list.length :
               f==='입주중' ? list.filter(r=>r.emp_name).length :
               f==='공실' ? list.filter(r=>!r.emp_name).length :
               list.filter(r=>r.contract_end && Math.ceil((new Date(r.contract_end)-today)/(1000*60*60*24))<=30).length}
            </span>
          </button>
        ))}
      </div>

      {/* 카드 목록 */}
      <div style={{ padding:'0 16px 20px', display:'flex', flexDirection:'column', gap:10 }}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>불러오는 중...</div> :
         filtered.length === 0 ? <div style={{ textAlign:'center', padding:40, color:'var(--text2)' }}>데이터 없음</div> :
         filtered.map(r => {
          const daysLeft = r.contract_end ? Math.ceil((new Date(r.contract_end) - today) / (1000*60*60*24)) : null;
          const expBadge = daysLeft !== null ? (
            daysLeft < 0 ? { label:`만료 ${Math.abs(daysLeft)}일 경과`, bg:'#FCEBEB', color:'#A32D2D' } :
            daysLeft <= 30 ? { label:`D-${daysLeft}`, bg:'#FAEEDA', color:'#854F0B' } : null
          ) : null;

          return (
            <div key={r.id} style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderLeft:`4px solid ${r.emp_name ? '#00854A' : '#aaa'}`, borderRadius:12, padding:'12px 14px' }}>
              {expBadge && (
                <div style={{ marginBottom:6, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:expBadge.bg, color:expBadge.color, display:'inline-block' }}>
                  ⚠️ 계약 {expBadge.label}
                </div>
              )}

              {/* 주소 + 햄버거 */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <div style={{ fontWeight:700, fontSize:14, flex:1, marginRight:8 }}>📍 {r.address}</div>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <button onClick={() => setCardMenuOpen(cardMenuOpen===r.id ? null : r.id)}
                    style={{ width:30, height:30, borderRadius:6, background:'var(--bg2)', border:'none', cursor:'pointer', fontSize:16, color:'var(--text2)' }}>⋮</button>
                  {cardMenuOpen === r.id && (
                    <div style={{ position:'absolute', right:0, top:'110%', zIndex:50, background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', minWidth:140, overflow:'hidden' }}>
                      <button onClick={() => { setHousingModal(r); setCardMenuOpen(null); }} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', background:'none', textAlign:'left', fontSize:13, cursor:'pointer', color:'#1A4A8A', fontFamily:'inherit', borderBottom:'0.5px solid var(--border)' }}>✏️ 수정</button>
                      <button onClick={() => { setResidentModal(r); setCardMenuOpen(null); }} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', background:'none', textAlign:'left', fontSize:13, cursor:'pointer', color:'#3B6D11', fontFamily:'inherit', borderBottom:'0.5px solid var(--border)' }}>👤 입주변경</button>
                      <button onClick={() => { loadDetail(r.id); setCardMenuOpen(null); }} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', background:'none', textAlign:'left', fontSize:13, cursor:'pointer', color:'var(--text)', fontFamily:'inherit', borderBottom:'0.5px solid var(--border)' }}>📋 입주이력</button>
                      <button onClick={() => { setTerminateModal(r); setTerminateDate(''); setCardMenuOpen(null); }} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', background:'none', textAlign:'left', fontSize:13, cursor:'pointer', color:'#854F0B', fontFamily:'inherit', borderBottom:'0.5px solid var(--border)' }}>🏁 임차종료</button>
                      <button onClick={() => { handleDelete(r.id); setCardMenuOpen(null); }} style={{ display:'block', width:'100%', padding:'11px 14px', border:'none', background:'none', textAlign:'left', fontSize:13, cursor:'pointer', color:'#A32D2D', fontFamily:'inherit' }}>🗑️ 삭제</button>
                    </div>
                  )}
                </div>
              </div>

              {/* 정보 배지들 */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                {r.org_name && <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--bg2)', color:'var(--text2)' }}>{r.org_name}</span>}
                {r.area_sqm && <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--bg2)', color:'var(--text2)' }}>{r.area_sqm}평</span>}
                {r.rent_type && <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#E8F0FB', color:'#1A4A8A' }}>{r.rent_type}</span>}
                {r.auto_renew_years > 0 && <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#EAF3DE', color:'#3B6D11' }}>자동갱신 {r.auto_renew_years}년</span>}
                {r.payment_type && <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'#FAEEDA', color:'#854F0B' }}>{r.payment_type}</span>}
                {r.rent_day && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'var(--bg2)', color:'var(--text2)' }}>{r.rent_day}일 납부</span>}
              </div>

              {/* 계약 정보 */}
              <div style={{ fontSize:12, color:'var(--text2)', lineHeight:1.7, marginBottom:8 }}>
                {r.contract_start && <div>📆 {r.contract_start?.split?.('T')[0]} ~ {r.contract_end?.split?.('T')[0] || '미정'}{r.initial_end && r.initial_end !== r.contract_end && <span style={{ color:'#854F0B', marginLeft:4 }}>(최초 {r.initial_end?.split?.('T')[0]})</span>}</div>}
                {(r.deposit || r.monthly_rent) && <div>💰 보증금 {r.deposit ? Number(r.deposit).toLocaleString()+'만원' : '-'} / {r.rent_type==='연세'?'연세':'월세'} {r.monthly_rent ? Number(r.monthly_rent).toLocaleString()+'만원' : '-'}</div>}
              </div>

              {/* 현재 입주자 */}
              <div style={{ borderTop:'0.5px solid var(--border)', paddingTop:8 }}>
                {r.emp_name ? (
                  <div style={{ background:'rgba(0,133,74,0.7)', borderRadius:8, padding:'8px 12px' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#fff' }}>🏠 {r.emp_name} · {r.resident_org} · 입주 {r.move_in_date?.split?.('T')[0]}</div>
                  </div>
                ) : (
                  <div style={{ fontSize:12, color:'#aaa', textAlign:'center', padding:'4px 0' }}>공실</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 이력 모달 */}
      {detailId && detail && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--bg)', width:'100%', maxWidth:480, margin:'0 auto', borderRadius:'16px 16px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'0.5px solid var(--border)', flexShrink:0 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>📋 입주 이력</div>
              <button onClick={() => { setDetailId(null); setDetail(null); }} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>×</button>
            </div>
            <div style={{ overflowY:'auto', padding:16, paddingBottom:32 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:10 }}>📍 {detail.address}</div>
              {detail.residents?.length === 0 ? (
                <div style={{ color:'var(--text2)', fontSize:13 }}>이력 없음</div>
              ) : detail.residents?.map((res, i) => (
                <div key={res.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'0.5px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{res.emp_name} <span style={{ color:'var(--text2)', fontWeight:400 }}>({res.emp_no})</span></div>
                    <div style={{ fontSize:11, color:'var(--text2)' }}>{res.org_name} · {res.move_in_date?.split?.('T')[0]} ~ {res.move_out_date?.split?.('T')[0] || '현재'}</div>
                  </div>
                  {!res.move_out_date && (
                    <button onClick={() => handleCheckout(detailId, res.id)} style={{ fontSize:11, padding:'4px 8px', borderRadius:6, background:'#FAEEDA', color:'#854F0B', border:'none', cursor:'pointer', fontWeight:600 }}>퇴거</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 임차종료 모달 */}
      {terminateModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--bg)', width:'100%', maxWidth:480, margin:'0 auto', borderRadius:'16px 16px 0 0' }}>
            <div style={{ padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'0.5px solid var(--border)' }}>
              <div style={{ fontWeight:700, fontSize:15 }}>🏁 임차종료 — {terminateModal.address}</div>
              <button onClick={() => setTerminateModal(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>×</button>
            </div>
            <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12, paddingBottom:32 }}>
              <div className="form-group">
                <label className="form-label">종료일 *</label>
                <input type="date" value={terminateDate} onChange={e => setTerminateDate(e.target.value)} />
              </div>
              <button onClick={handleTerminate} disabled={!terminateDate} className="btn-primary" style={{ background:'#854F0B', marginBottom:8 }}>
                임차종료 처리
              </button>
            </div>
          </div>
        </div>
      )}

      {housingModal !== null && (
        <HousingModal housing={housingModal?.id ? housingModal : null} offices={offices}
          onClose={() => setHousingModal(null)}
          onDone={msg => { setToast(msg); setHousingModal(null); load(); }} />
      )}
      {residentModal && (
        <ResidentModal housing={residentModal} offices={offices} onClose={() => setResidentModal(null)}
          onDone={msg => { setToast(msg); setResidentModal(null); load(); }} />
      )}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
