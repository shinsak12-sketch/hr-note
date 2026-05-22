import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const STATUS_STYLE = {
  '신고접수': { color: '#1A4A8A', bg: '#E8F0FB' },
  '확인완료': { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':     { color: '#A32D2D', bg: '#FCEBEB' },
};

export default function AssetStatus() {
  const nav = useNavigate();
  const [form, setForm] = useState({ emp_no: '', password: '' });
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.getMyAssetRequests(form.emp_no, form.password);
      setRequests(data);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/dbsonsa')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">장비변경 신고 현황</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">사번 <span className="req">*</span></label>
            <input type="text" placeholder="신고 시 입력한 사번" value={form.emp_no} onChange={e => setForm(f => ({ ...f, emp_no: e.target.value }))} autoCapitalize="none" />
          </div>
          <div className="form-group">
            <label className="form-label">비밀번호 <span className="req">*</span></label>
            <input type="password" placeholder="신고 시 설정한 비밀번호" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading} style={{ background: '#5A4A00' }}>
            {loading ? '조회 중...' : '🔍 조회'}
          </button>
          <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8, lineHeight: 1.6 }}>
            🔑 비밀번호 분실 시 <strong style={{ color: 'var(--text)' }}>손사지원파트 신이삭 수석</strong>에게 연락 바랍니다.
          </div>
        </form>

        {searched && requests.length === 0 && <div className="center-msg">신고 내역이 없습니다.</div>}
        {requests.map(r => {
          const st = STATUS_STYLE[r.status] || STATUS_STYLE['신고접수'];
          return (
            <div key={r.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderLeft: `4px solid ${st.color}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: st.bg, color: st.color }}>{r.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
                <div>💻 {r.asset_type}: {r.old_asset_no} → {r.new_asset_no}</div>
                <div>📅 변경일: {r.change_date?.split?.('T')[0]}</div>
                <div>📝 {r.reason}</div>
              </div>
              {r.manager_comment && (
                <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px', marginTop: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text2)', fontSize: 12 }}>💬 담당자 코멘트: </span>{r.manager_comment}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
