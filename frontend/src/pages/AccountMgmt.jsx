import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const WORK_TYPES = ['인사', '교육', '총무경리', '급여후생', '임원', '기타'];

export default function AccountMgmt() {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('hr_user') || '{}');
  const [users, setUsers] = useState([]);
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('pending'); // pending | active

  async function load() {
    const data = await api.getUsers();
    setUsers(data);
  }
  useEffect(() => { load(); }, []);

  async function handleStatus(id, status) {
    await api.updateUserStatus(id, status);
    setToast(status === 'active' ? '승인되었습니다.' : '거절되었습니다.');
    load();
  }

  const [deleteConfirm, setDeleteConfirm] = useState(null);

  async function handleDelete(id) {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }
    await api.deleteUser(id);
    setDeleteConfirm(null);
    setToast('삭제되었습니다.');
    load();
  }

  const pending = users.filter(u => u.status === 'pending');
  const active = users.filter(u => u.status === 'active');
  const shown = tab === 'pending' ? pending : active;

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

      {/* 탭 */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border)' }}>
        <button onClick={() => setTab('pending')} style={{
          flex: 1, padding: '12px 0', border: 'none', background: 'none',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          color: tab === 'pending' ? 'var(--green)' : 'var(--text2)',
          borderBottom: tab === 'pending' ? '2px solid var(--green)' : '2px solid transparent',
        }}>
          승인 대기 {pending.length > 0 && <span style={{ color: 'var(--red)' }}>({pending.length})</span>}
        </button>
        <button onClick={() => setTab('active')} style={{
          flex: 1, padding: '12px 0', border: 'none', background: 'none',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          color: tab === 'active' ? 'var(--green)' : 'var(--text2)',
          borderBottom: tab === 'active' ? '2px solid var(--green)' : '2px solid transparent',
        }}>
          활성 계정 ({active.length})
        </button>
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.length === 0 && <div className="center-msg">없습니다.</div>}
        {shown.map(u => (
          <div key={u.id} style={{
            background: 'var(--bg)', border: '0.5px solid var(--border)',
            borderRadius: 12, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>사번: {u.username} · {u.role === 'master' ? '마스터' : '일반'}</div>
                {u.work_type && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--bg2)', color: 'var(--text2)' }}>
                    {u.work_type}
                  </span>
                )}
              </div>
            </div>
            {tab === 'pending' && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>업무구분: {u.work_type || '미설정'}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-edit" onClick={() => handleStatus(u.id, 'active')}>✅ 승인</button>
                  <button className="btn-delete" onClick={() => handleStatus(u.id, 'rejected')}>❌ 거절</button>
                </div>
              </div>
            )}
            {tab === 'active' && u.role !== 'master' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select defaultValue={u.work_type || ''} onChange={async e => {
                  await api.updateUserWorkType(u.id, e.target.value);
                  setToast('업무구분이 변경되었습니다.');
                  load();
                }} style={{ flex: 1, height: 36, fontSize: 13 }}>
                  <option value="">업무구분 선택</option>
                  {WORK_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <button className="btn-delete" style={{ height: 36 }}
                  onClick={() => handleDelete(u.id)}>
                  {deleteConfirm === u.id ? '⚠️ 확인?' : '삭제'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
