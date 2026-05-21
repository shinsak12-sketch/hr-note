import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function AccountRequest() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.requestAccount(form);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>계정 신청 완료!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 32 }}>관리자 승인 후 로그인하실 수 있습니다.</div>
        <button className="btn-primary" onClick={() => nav('/login')}>로그인 화면으로</button>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/login')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">계정 신청</div>
        <div style={{ width: 40 }} />
      </div>

      <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--green-light)', padding: 12, borderRadius: 8 }}>
          계정 신청 후 관리자 승인이 완료되면 로그인할 수 있습니다.
        </div>
        <div className="form-group">
          <label className="form-label">사번 <span className="req">*</span></label>
          <input type="text" placeholder="사번 입력" value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))} autoCapitalize="none" />
        </div>
        <div className="form-group">
          <label className="form-label">이름 <span className="req">*</span></label>
          <input type="text" placeholder="이름 입력" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">비밀번호 <span className="req">*</span></label>
          <input type="password" placeholder="비밀번호 입력" value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? '신청 중...' : '계정 신청'}
        </button>
      </form>
    </div>
  );
}
