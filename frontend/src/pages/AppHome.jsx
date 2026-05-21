import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../utils/usePermission.js';

const MAIN_APPS = [
  { id: 'tasks',   icon: '📌', title: '업무지시',   desc: '대표님 업무지시 현황 관리', path: '/tasks-app',   color: '#1A4A8A', bg: '#E8F0FB', menuKey: 'tasks' },
  { id: 'issues',  icon: '📋', title: '직원관리',   desc: '직원 이슈 기록 및 관리',   path: '/issues-app',  color: '#3B6D11', bg: '#EAF3DE', menuKey: 'issues' },
  { id: 'general', icon: '🏛️', title: '총무지원',   desc: '사택·자산·수선 관리',       path: '/general-app', color: '#2D6A6A', bg: '#E6F4F4', menuKey: 'general' },
  { id: 'calc',    icon: '🧮', title: 'HR계산기',   desc: '육아휴직·임금 등 계산',     path: '/hr-calc',     color: '#7B2D8B', bg: '#F5E8F8', menuKey: null },
];

const UTILITY_APPS = [
  { id: 'memos',   icon: '📝', title: '메모장',     desc: '현장·회의·수행 메모',       path: '/memos-app',   color: '#5C3D8F', bg: '#F0EBF8', menuKey: 'memos' },
  { id: 'offices', icon: '🏢', title: '사무실 주소', desc: '조직별 사무실 정보',        path: '/offices-app', color: '#5A4A00', bg: '#FFF9E6', menuKey: 'offices' },
];

export default function AppHome() {
  const nav = useNavigate();
  const { hasAccess } = usePermission();
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

      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>
          안녕하세요, <strong style={{ color: 'var(--text)' }}>{user.name}</strong>님
          {user.work_type && (
            <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--bg2)', color: 'var(--text2)' }}>
              {user.work_type}
            </span>
          )}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>어떤 업무를 하실건가요?</div>
      </div>

      {/* 메인 앱 (2x2) */}
      <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {MAIN_APPS.map(app => {
          const accessible = app.menuKey ? hasAccess(app.menuKey) : true;
          return (
            <button key={app.id} onClick={() => nav(app.path)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '18px 16px', borderRadius: 16,
                border: `0.5px solid ${accessible ? app.color + '30' : 'var(--border)'}`,
                background: accessible ? app.bg : 'var(--bg2)',
                cursor: 'pointer', textAlign: 'left', minHeight: 120,
                opacity: accessible ? 1 : 0.45,
              }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{accessible ? app.icon : '🔒'}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: accessible ? app.color : 'var(--text2)', marginBottom: 3 }}>{app.title}</div>
              <div style={{ fontSize: 11, color: accessible ? app.color + '99' : 'var(--text2)', lineHeight: 1.4 }}>
                {accessible ? app.desc : '접근 권한 없음'}
              </div>
            </button>
          );
        })}
      </div>

      {/* 편의기능 */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>편의기능</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {UTILITY_APPS.map(app => {
            const accessible = app.menuKey ? hasAccess(app.menuKey) : true;
            return (
              <button key={app.id} onClick={() => nav(app.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 12,
                  border: `0.5px solid ${accessible ? app.color + '30' : 'var(--border)'}`,
                  background: accessible ? app.bg : 'var(--bg2)',
                  cursor: 'pointer', textAlign: 'left',
                  opacity: accessible ? 1 : 0.45,
                }}>
                <span style={{ fontSize: 20 }}>{accessible ? app.icon : '🔒'}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: accessible ? app.color : 'var(--text2)' }}>{app.title}</div>
                  <div style={{ fontSize: 10, color: accessible ? app.color + '99' : 'var(--text2)' }}>{app.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
