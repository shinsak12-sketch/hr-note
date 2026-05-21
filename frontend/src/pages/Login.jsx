import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function Login() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(form);
      localStorage.setItem('hr_token', data.token);
      localStorage.setItem('hr_user', JSON.stringify(data.user));
      nav('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'var(--green-light)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px', fontSize: 28
        }}>📋</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>HR노트</div>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>직원 이슈 관리 시스템</div>
      </div>

      <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">사번</label>
          <input
            type="text" placeholder="사번 입력"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            autoCapitalize="none"
          />
        </div>
        <div className="form-group">
          <label className="form-label">비밀번호</label>
          <input
            type="password" placeholder="비밀번호 입력"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center' }}>{error}</div>}
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
        <button type="button"
          onClick={() => nav('/request')}
          style={{
            width: '100%', height: 44, borderRadius: 10,
            background: 'var(--bg2)', color: 'var(--text2)',
            border: '0.5px solid var(--border)', fontSize: 15,
            cursor: 'pointer', fontFamily: 'inherit'
          }}>
          계정 신청
        </button>
      </form>
    </div>
  );
}
