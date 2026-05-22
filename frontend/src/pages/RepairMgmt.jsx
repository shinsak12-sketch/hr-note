import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const STATUSES = ['접수', '처리중', '완료', '반려'];
const STATUS_STYLE = {
  '접수':   { color: '#1A4A8A', bg: '#E8F0FB' },
  '처리중': { color: '#854F0B', bg: '#FAEEDA' },
  '완료':   { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':   { color: '#A32D2D', bg: '#FCEBEB' },
};
const TYPE_COLOR = { '사무실': '#2D6A6A', '장비': '#5A4A00', '기타': '#5C3D8F' };

function DirectModal({ offices, onClose, onDone }) {
  const [form, setForm] = useState({ emp_no: '', emp_name: '', office_id: '', repair_type: '사무실', reason: '', request_date: new Date().toISOString().split('T')[0] });
  const [officeSearch, setOfficeSearch] = useState('');
  const [showList, setShowList] = useState(false);
  const [saving, setSaving] = useState(false);
  const filtered = officeSearch ? offices.filter(o => o.org_name.includes(officeSearch) || o.headquarters.includes(officeSearch)) : offices;

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try { await api.addRepairDirect(form); onDone('등록되었습니다.'); }
    catch (e) { } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>✏️ 직접 입력</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <form onSubmit={handleSave} style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                onChange={e => { setOfficeSearch(e.target.value); setForm(f => ({ ...f, office_id: '' })); setShowList(true); }}
                onFocus={() => setShowList(true)} />
              {showList && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, maxHeight: 150, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                  {filtered.slice(0, 15).map(o => (
                    <div key={o.id} onClick={() => { setForm(f => ({ ...f, office_id: String(o.id) })); setOfficeSearch(''); setShowList(false); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '0.5px solid var(--border)' }}>
                      <span style={{ fontWeight: 600 }}>{o.org_name}</span><span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{o.headquarters}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">수선 구분 <span className="req">*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['사무실','장비','기타'].map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, repair_type: t }))} style={{ flex: 1, height: 36, borderRadius: 8, border: `2px solid ${form.repair_type === t ? '#5C3D8F' : 'var(--border)'}`, background: form.repair_type === t ? '#F0EBF8' : 'var(--bg)', color: form.repair_type === t ? '#5C3D8F' : 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t}</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">요청일자 <span className="req">*</span></label>
            <input type="date" value={form.request_date} onChange={e => setForm(f => ({ ...f, request_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">수선 내용 <span className="req">*</span></label>
            <textarea placeholder="수선 내용 입력" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} style={{ height: 80 }} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary" style={{ background: '#5C3D8F', marginBottom: 8 }}>
            {saving ? '저장 중...' : '등록'}
          </button>
        </form>
      </div>
    </div>
  );
}

function RepairCard({ r, offices, onRefresh, setToast }) {
  const st = STATUS_STYLE[r.status] || STATUS_STYLE['접수'];
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const [comment, setComment] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  async function handleProcess() {
    if (!newStatus) return;
    await api.updateRepairStatus(r.id, { status: newStatus, manager_comment: comment });
    setToast('처리되었습니다.');
    setShowProcess(false); setComment(''); setNewStatus('');
    onRefresh();
  }

  async function handleReset() { await api.resetRepairPassword(r.id); setToast('비밀번호가 1111로 초기화되었습니다.'); }
  async function handleDelete() { await api.deleteRepair(r.id); setToast('삭제되었습니다.'); onRefresh(); }

  const tc = TYPE_COLOR[r.repair_type] || '#5C3D8F';

  return (
    <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderLeft: `4px solid ${st.color}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
          {r.emp_no && <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>}
          {r.is_direct && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#F0EBF8', color: '#5C3D8F' }}>직접입력</span>}
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{r.status}</span>
        </div>
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--text2)', fontSize: 18 }}>⋮</button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 130 }}>
              <button onClick={() => { handleReset(); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#854F0B', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>🔑 비번 초기화</button>
              <button onClick={() => { handleDelete(); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#A32D2D', fontFamily: 'inherit' }}>🗑️ 삭제</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
        {r.org_name && <div>🏢 {r.org_name}</div>}
        <div><span style={{ fontWeight: 600, color: tc }}>【{r.repair_type}】</span> {r.reason}</div>
        <div>📅 요청일: {r.request_date?.split?.('T')[0]}</div>
        {r.manager_comment && <div style={{ color: 'var(--text)', marginTop: 4 }}>💬 {r.manager_comment}</div>}
      </div>

      {showProcess ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg2)', borderRadius: 8, padding: 10 }}>
          <textarea placeholder="코멘트 (선택)" value={comment} onChange={e => setComment(e.target.value)} style={{ height: 60, fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUSES.filter(s => s !== r.status).map(s => {
              const sst = STATUS_STYLE[s];
              return <button key={s} onClick={() => setNewStatus(s)} style={{ padding: '6px 12px', borderRadius: 20, border: `2px solid ${newStatus===s ? sst.color : 'transparent'}`, background: sst.bg, color: sst.color, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{s}</button>;
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleProcess} disabled={!newStatus} className="btn-primary" style={{ flex: 1, height: 36, background: '#5C3D8F' }}>처리</button>
            <button onClick={() => { setShowProcess(false); setComment(''); setNewStatus(''); }} style={{ height: 36, padding: '0 14px', borderRadius: 8, background: 'var(--bg)', border: '0.5px solid var(--border)', color: 'var(--text2)', cursor: 'pointer' }}>취소</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowProcess(true)} style={{ width: '100%', height: 36, borderRadius: 8, background: '#F0EBF8', color: '#5C3D8F', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>처리</button>
      )}
    </div>
  );
}

export default function RepairMgmt() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('전체');
  const [showDirect, setShowDirect] = useState(false);

  useEffect(() => { load(); api.getOffices().then(setOffices); }, []);

  async function load() {
    const data = await api.getRepairs();
    setRequests(data); setLoading(false);
  }

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: requests.filter(r => r.status === s).length }), {});
  const filtered = filter === '전체' ? requests : requests.filter(r => r.status === filter);

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">수선 관리</div>
        <button onClick={() => setShowDirect(true)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, background: '#F0EBF8', color: '#5C3D8F', border: 'none', cursor: 'pointer', fontWeight: 600 }}>✏️ 직접입력</button>
      </div>

      {/* 현황 */}
      <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
        {STATUSES.map(s => {
          const st = STATUS_STYLE[s];
          return (
            <div key={s} style={{ background: st.bg, borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: st.color }}>{counts[s]||0}</div>
              <div style={{ fontSize: 9, color: st.color }}>{s}</div>
            </div>
          );
        })}
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', borderBottom: '0.5px solid var(--border)' }}>
        {['전체', ...STATUSES].map(s => {
          const st = STATUS_STYLE[s];
          const active = filter === s;
          return (
            <button key={s} onClick={() => setFilter(s)} style={{ padding: '5px 12px', borderRadius: 20, border: 'none', background: active ? (st?.bg||'var(--bg2)') : 'var(--bg2)', color: active ? (st?.color||'var(--text)') : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>{s}</button>
          );
        })}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">수선 요청이 없습니다.</div>}
        {filtered.map(r => <RepairCard key={r.id} r={r} offices={offices} onRefresh={load} setToast={setToast} />)}
      </div>

      {showDirect && <DirectModal offices={offices} onClose={() => setShowDirect(false)} onDone={msg => { setToast(msg); setShowDirect(false); load(); }} />}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
