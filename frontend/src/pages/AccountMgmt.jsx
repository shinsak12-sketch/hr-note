import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

export default function AccountMgmt() {
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', name: '' });
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const data = await api.getUsers();
    setUsers(data);
  }
  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    if (!form.username || !form.password || !form.name) {
      setError('모든 항목을 입력하세요.');
      return;
    }
    try {
      await api.addUser(form);
      setForm({ username: '', password: '', name: '' });
      setToast('계정이 추가되었습니다.');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('이 계정을 삭제할까요?')) return;
    await api.deleteUser(id);
    setToast('삭제되었습니다.');
    load();
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">계정 관리</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 계정 목록 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>등록된 계정</div>
          <div className="detail-section">
            {users.map(u => (
              <div key={u.id} className="detail-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>@{u.username}</div>
                </div>
                <button className="btn-secondary" style={{ fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)' }}
                  onClick={() => handleDelete(u.id)}>삭제</button>
              </div>
            ))}
          </div>
        </section>

        {/* 계정 추가 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>계정 추가</div>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">이름</label>
              <input type="text" placeholder="표시 이름" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">아이디</label>
              <input type="text" placeholder="로그인 아이디" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} autoCapitalize="none" />
            </div>
            <div className="form-group">
              <label className="form-label">비밀번호</label>
              <input type="password" placeholder="비밀번호" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
            <button className="btn-primary" type="submit">계정 추가</button>
          </form>
        </section>
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
