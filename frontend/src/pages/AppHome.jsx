import React from 'react';
import { useNavigate } from 'react-router-dom';

const APPS = [
  {
    id: 'tasks',
    icon: '📌',
    title: '업무지시',
    desc: '대표님 업무지시 현황 관리',
    path: '/tasks-app',
    color: '#1A4A8A',
    bg: '#E8F0FB',
  },
  {
    id: 'issues',
    icon: '📋',
    title: '직원관리',
    desc: '직원 이슈 기록 및 관리',
    path: '/issues-app',
    color: '#3B6D11',
    bg: '#EAF3DE',
  },
  {
    id: 'memos',
    icon: '📝',
    title: '메모장',
    desc: '현장·회의·수행 메모',
    path: '/memos-app',
    color: '#5C3D8F',
    bg: '#F0EBF8',
  },
  {
    id: 'offices',
    icon: '🏢',
    title: '사무실 주소',
    desc: '조직별 사무실 정보 조회',
    path: '/offices-app',
    color: '#5A4A00',
    bg: '#FFF9E6',
  },
];

export default function AppHome() {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('hr_user') || '{}');

  function logout() {
    localStorage.removeItem('hr_token');
    localStorage.removeItem('hr_user');
    nav('/login', { replace: true });
  }

  return (
    <div className="app-container">
      <div className="header">
        <div style={{ fontSize: 18, fontWeight: 700 }}>HR노트</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {user.role === 'master' && (
            <button onClick={() => nav('/settings')} className="btn-secondary" style={{ fontSize: 12 }}>설정</button>
          )}
          <button onClick={logout} className="btn-secondary" style={{ fontSize: 12 }}>로그아웃</button>
        </div>
      </div>

      <div style={{ padding: '20px 16px 8px' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          안녕하세요, <strong style={{ color: 'var(--text)' }}>{user.name}</strong>님
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>어떤 업무를 하실건가요?</div>
      </div>

      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {APPS.map(app => (
          <button key={app.id} onClick={() => nav(app.path)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '20px 16px', borderRadius: 16,
              border: `0.5px solid ${app.color}30`,
              background: app.bg, cursor: 'pointer', textAlign: 'left',
              minHeight: 130,
            }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{app.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: app.color, marginBottom: 4 }}>{app.title}</div>
            <div style={{ fontSize: 12, color: app.color + '99', lineHeight: 1.4 }}>{app.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
