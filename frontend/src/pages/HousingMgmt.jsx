import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const STATUSES = ['신청', '검토중', '승인', '반려'];
const STATUS_STYLE = {
  '신청':   { color: '#1A4A8A', bg: '#E8F0FB' },
  '검토중': { color: '#854F0B', bg: '#FAEEDA' },
  '승인':   { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':   { color: '#A32D2D', bg: '#FCEBEB' },
};

function HousingCard({ r, onStatusChange, onDelete, onResetPassword, toast }) {
  const st = STATUS_STYLE[r.status];
  const dateStr = r.created_at?.split?.('T')[0] || '';
  const [menuOpen, setMenuOpen] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [note, setNote] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  return (
    <div style={{
      background: 'var(--bg)', border: '0.5px solid var(--border)',
      borderLeft: `4px solid ${st.color}`, borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>
          <span style={{
            marginLeft: 8, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
            background: st.bg, color: st.color,
          }}>{r.status}</span>
        </div>
        {/* 햄버거 메뉴 */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 6px', color: 'var(--text2)', fontSize: 18,
          }}>⋮</button>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 50,
              background: 'var(--bg)', border: '0.5px solid var(--border)',
              borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              overflow: 'hidden', minWidth: 130,
            }}>
              {[
                { label: '✏️ 상태 변경', action: () => { setShowStatus(s => !s); setMenuOpen(false); } },
                { label: '🔑 비번 초기화', action: () => { onResetPassword(r.id); setMenuOpen(false); }, color: '#854F0B' },
                { label: '🗑️ 삭제', action: () => { onDelete(r.id); setMenuOpen(false); }, color: '#A32D2D' },
              ].map((item, i) => (
                <button key={i} onClick={item.action} style={{
                  display: 'block', width: '100%', padding: '12px 16px',
                  border: 'none', background: 'none', textAlign: 'left',
                  fontSize: 13, cursor: 'pointer', color: item.color || 'var(--text)',
                  fontFamily: 'inherit', borderBottom: i < 2 ? '0.5px solid var(--border)' : 'none',
                }}>{item.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.7 }}>
        <div>🏢 {r.org_name || '-'} ({r.headquarters})</div>
        <div>🏠 {r.home_address}</div>
        {r.distance_km && (
          <div style={{ color: parseFloat(r.distance_km) > 50 ? '#3B6D11' : '#A32D2D', fontWeight: 600 }}>
            📏 {r.distance_km} km {parseFloat(r.distance_km) > 50 ? '(신청 가능)' : '(50km 이내)'}
          </div>
        )}
        <div>📅 {dateStr}</div>
        {r.note && <div>💬 {r.note}</div>}
      </div>

      {/* 상태 변경 패널 */}
      {showStatus && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, padding: 10, background: 'var(--bg2)', borderRadius: 8 }}>
          <textarea placeholder="메모 (선택)" value={note} onChange={e => setNote(e.target.value)}
            style={{ height: 60, fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUSES.filter(s => s !== r.status).map(s => {
              const sst = STATUS_STYLE[s];
              return (
                <button key={s} onClick={() => { onStatusChange(r.id, s, note); setShowStatus(false); setNote(''); }} style={{
                  padding: '6px 12px', borderRadius: 20, border: 'none',
                  background: sst.bg, color: sst.color,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>{s}</button>
              );
            })}
            <button onClick={() => setShowStatus(false)} style={{
              padding: '6px 12px', borderRadius: 20,
              border: '0.5px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HousingMgmt() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filterStatus, setFilterStatus] = useState('전체');

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await api.getHousingRequests();
    setRequests(data);
    setLoading(false);
  }

  async function handleStatus(id, status, note) {
    await api.updateHousingStatus(id, status, note);
    setToast(`"${status}"로 변경되었습니다.`);
    load();
  }

  async function handleDelete(id) {
    await api.deleteHousingRequest(id);
    setToast('삭제되었습니다.');
    load();
  }

  async function handleResetPassword(id) {
    await api.resetHousingPassword(id);
    setToast('비밀번호가 1111로 초기화되었습니다.');
  }

  const filtered = filterStatus === '전체' ? requests : requests.filter(r => r.status === filterStatus);
  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: requests.filter(r => r.status === s).length }), {});

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">사택 신청 관리</div>
        <div style={{ width: 40 }} />
      </div>

      {/* 현황 */}
      <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
        {STATUSES.map(s => {
          const st = STATUS_STYLE[s];
          return (
            <div key={s} style={{ background: st.bg, borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: st.color }}>{counts[s] || 0}</div>
              <div style={{ fontSize: 10, color: st.color }}>{s}</div>
            </div>
          );
        })}
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', borderBottom: '0.5px solid var(--border)' }}>
        {['전체', ...STATUSES].map(s => {
          const st = STATUS_STYLE[s];
          const active = filterStatus === s;
          return (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: '5px 12px', borderRadius: 20, border: 'none',
              background: active ? (st?.bg || 'var(--bg2)') : 'var(--bg2)',
              color: active ? (st?.color || 'var(--text)') : 'var(--text2)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}>{s}</button>
          );
        })}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">신청 내역이 없습니다.</div>}
        {filtered.map(r => (
          <HousingCard key={r.id} r={r}
            onStatusChange={handleStatus}
            onDelete={handleDelete}
            onResetPassword={handleResetPassword}
          />
        ))}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
