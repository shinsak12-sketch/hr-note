import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const STATUS_STYLE = {
  '신청':   { color: '#1A4A8A', bg: '#E8F0FB' },
  '검토중': { color: '#854F0B', bg: '#FAEEDA' },
  '승인':   { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':   { color: '#A32D2D', bg: '#FCEBEB' },
};

export default function HousingStatus() {
  const nav = useNavigate();
  const [form, setForm] = useState({ emp_no: '', password: '' });
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [withdrawing, setWithdrawing] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.getMyHousingStatus(form.emp_no, form.password);
      setRequests(data);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw(id) {
    if (withdrawing !== id) {
      setWithdrawing(id);
      return;
    }
    try {
      await api.withdrawHousing(id, form.emp_no, form.password);
      setRequests(r => r.filter(req => req.id !== id));
      setWithdrawing(null);
    } catch (e) {
      setError(e.message);
      setWithdrawing(null);
    }
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/housing-apply')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">신청 현황 조회</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">사번 <span className="req">*</span></label>
            <input type="text" placeholder="신청 시 입력한 사번"
              value={form.emp_no} onChange={e => setForm(f => ({ ...f, emp_no: e.target.value }))}
              autoCapitalize="none" />
          </div>
          <div className="form-group">
            <label className="form-label">비밀번호 <span className="req">*</span></label>
            <input type="password" placeholder="신청 시 설정한 비밀번호"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}
            style={{ background: '#1A4A8A' }}>
            {loading ? '조회 중...' : '🔍 조회'}
          </button>
        </form>

        {searched && requests.length === 0 && (
          <div className="center-msg">신청 내역이 없습니다.</div>
        )}

        {requests.map(r => {
          const st = STATUS_STYLE[r.status] || STATUS_STYLE['신청'];
          const dateStr = r.created_at?.split?.('T')[0] || '';
          const canWithdraw = r.status === '신청';
          return (
            <div key={r.id} style={{
              background: 'var(--bg)', border: '0.5px solid var(--border)',
              borderLeft: `4px solid ${st.color}`, borderRadius: 12, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  background: st.bg, color: st.color,
                }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8, marginBottom: 10 }}>
                <div>🏢 {r.org_name} ({r.headquarters})</div>
                <div>🏠 {r.home_address}</div>
                {r.distance_km && <div>📏 {r.distance_km} km</div>}
                <div>📅 신청일: {dateStr}</div>
                {r.note && <div>💬 {r.note}</div>}
              </div>
              {canWithdraw && (
                <button onClick={() => handleWithdraw(r.id)} style={{
                  width: '100%', height: 38, borderRadius: 8,
                  background: withdrawing === r.id ? '#FCEBEB' : 'var(--bg2)',
                  color: withdrawing === r.id ? '#A32D2D' : 'var(--text2)',
                  border: `0.5px solid ${withdrawing === r.id ? '#A32D2D' : 'var(--border)'}`,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {withdrawing === r.id ? '⚠️ 한번 더 누르면 철회됩니다' : '신청 철회'}
                </button>
              )}
              {!canWithdraw && (
                <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '6px 0' }}>
                  처리 진행 중으로 철회가 불가합니다.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
