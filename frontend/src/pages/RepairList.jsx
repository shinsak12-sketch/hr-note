import React, { useEffect, useState } from 'react';
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

export default function RepairList() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    const data = await api.getRepairs();
    setRequests(data); setLoading(false);
  }

  const filtered = requests.filter(r => {
    const matchStatus = filter === '전체' || r.status === filter;
    const matchType = typeFilter === '전체' || r.repair_type === typeFilter;
    const matchSearch = !search || r.emp_name?.includes(search) || r.emp_no?.includes(search) || r.reason?.includes(search) || r.org_name?.includes(search);
    return matchStatus && matchType && matchSearch;
  });

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">수선 관리</div>
        <div style={{ width: 40 }} />
      </div>

      {/* 검색 + 필터 */}
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input type="text" placeholder="🔍 이름, 사번, 내용, 소속 검색"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {['전체', '사무실', '장비', '기타'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              padding: '4px 12px', borderRadius: 20, border: 'none',
              background: typeFilter === t ? '#5C3D8F' : 'var(--bg2)',
              color: typeFilter === t ? '#fff' : 'var(--text2)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {['전체', ...STATUSES].map(s => {
            const st = STATUS_STYLE[s];
            const active = filter === s;
            return (
              <button key={s} onClick={() => setFilter(s)} style={{
                padding: '4px 12px', borderRadius: 20, border: 'none',
                background: active ? (st?.bg || 'var(--bg2)') : 'var(--bg2)',
                color: active ? (st?.color || 'var(--text)') : 'var(--text2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>{s}</button>
            );
          })}
        </div>
        {(search || filter !== '전체' || typeFilter !== '전체') && (
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>검색 결과: {filtered.length}건</div>
        )}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 40 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">해당 수선 요청이 없습니다.</div>}
        {filtered.map(r => {
          const st = STATUS_STYLE[r.status] || STATUS_STYLE['접수'];
          const tc = TYPE_COLOR[r.repair_type] || '#5C3D8F';
          return (
            <div key={r.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderLeft: `4px solid ${st.color}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{r.emp_name}</span>
                  {r.emp_no && <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>}
                  {r.is_direct && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#F0EBF8', color: '#5C3D8F' }}>직접입력</span>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                {r.org_name && <div>🏢 {r.org_name}</div>}
                <div><span style={{ fontWeight: 600, color: tc }}>【{r.repair_type}】</span> {r.reason}</div>
                <div>📅 요청일: {r.request_date?.split?.('T')[0]}</div>
                {r.manager_comment && <div style={{ color: 'var(--text)', marginTop: 2 }}>💬 {r.manager_comment}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
