import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

function HamburgerMenu({ onReset, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', color: 'var(--text2)', fontSize: 18 }}>⋮</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 130 }}>
          <button onClick={() => { onReset(); setOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#854F0B', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>🔑 비번 초기화</button>
          <button onClick={() => { onDelete(); setOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#A32D2D', fontFamily: 'inherit' }}>🗑️ 삭제</button>
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE = {
  '신고접수': { color: '#1A4A8A', bg: '#E8F0FB' },
  '확인완료': { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':     { color: '#A32D2D', bg: '#FCEBEB' },
};

export default function AssetRequests() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('전체');
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    const data = await api.getAssetRequests();
    setRequests(data); setLoading(false);
  }

  async function handleStatus(id, status) {
    await api.updateAssetRequestStatus(id, { status, manager_comment: comment });
    setToast(`"${status}"로 처리되었습니다.`);
    setSelected(null); setComment(''); load();
  }

  async function handleDelete(id) {
    await api.deleteAssetRequest(id);
    setToast('삭제되었습니다.'); load();
  }

  const counts = ['신고접수','확인완료','반려'].reduce((acc,s) => ({ ...acc, [s]: requests.filter(r=>r.status===s).length }), {});
  const filtered = filter === '전체' ? requests : requests.filter(r => r.status === filter);

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">변경신고 관리</div>
        <div style={{ width: 40 }} />
      </div>

      {/* 현황 */}
      <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {['신고접수','확인완료','반려'].map(s => {
          const st = STATUS_STYLE[s];
          return (
            <div key={s} style={{ background: st.bg, borderRadius: 10, padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: st.color }}>{counts[s]||0}</div>
              <div style={{ fontSize: 10, color: st.color }}>{s}</div>
            </div>
          );
        })}
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', borderBottom: '0.5px solid var(--border)' }}>
        {['전체','신고접수','확인완료','반려'].map(s => {
          const st = STATUS_STYLE[s];
          const active = filter === s;
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '5px 12px', borderRadius: 20, border: 'none',
              background: active ? (st?.bg||'var(--bg2)') : 'var(--bg2)',
              color: active ? (st?.color||'var(--text)') : 'var(--text2)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>{s}</button>
          );
        })}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">신고 내역이 없습니다.</div>}
        {filtered.map(r => {
          const st = STATUS_STYLE[r.status] || STATUS_STYLE['신고접수'];
          return (
            <div key={r.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderLeft: `4px solid ${st.color}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
                <div>🏢 {r.org_name || '-'}</div>
                <div>💻 {r.asset_type}: {r.old_asset_no} → {r.new_asset_no}</div>
                {r.product_name && <div>📦 제품명: {r.product_name}</div>}
                <div>📅 변경일: {r.change_date?.split?.('T')[0]}</div>
                <div>📝 {r.reason}</div>
                {r.manager_comment && <div style={{ color: 'var(--text)' }}>💬 {r.manager_comment}</div>}
              </div>

              {selected === r.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea placeholder="코멘트 (선택)" value={comment} onChange={e => setComment(e.target.value)} style={{ height: 60, fontSize: 13 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleStatus(r.id, '확인완료')} style={{ flex: 1, height: 36, borderRadius: 8, background: '#EAF3DE', color: '#3B6D11', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✅ 확인완료</button>
                    <button onClick={() => handleStatus(r.id, '반려')} style={{ flex: 1, height: 36, borderRadius: 8, background: '#FCEBEB', color: '#A32D2D', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>❌ 반려</button>
                    <button onClick={() => { setSelected(null); setComment(''); }} style={{ height: 36, padding: '0 12px', borderRadius: 8, background: 'var(--bg2)', color: 'var(--text2)', border: 'none', fontSize: 13, cursor: 'pointer' }}>취소</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => { setSelected(r.id); setComment(''); }} style={{ flex: 1, height: 34, borderRadius: 8, background: '#E8F0FB', color: '#1A4A8A', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>처리</button>
                  <HamburgerMenu
                    onReset={async () => { await api.resetAssetRequestPassword(r.id); setToast('비밀번호가 1111로 초기화되었습니다.'); }}
                    onDelete={() => handleDelete(r.id)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
