import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AttendanceHome() {
  const nav = useNavigate();
  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">근태관리</div>
        <div style={{ width: 40 }} />
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          {[
            { icon: '📊', title: '근태현황', desc: '현황 대시보드', path: '/attendance-stats', color: '#854F0B', bg: '#FAEEDA' },
            { icon: '📋', title: '근태관리', desc: '등록/수정/종료 처리', path: '/attendance-mgmt', color: '#1A4A8A', bg: '#E8F0FB' },
          ].map(m => (
            <button key={m.path} onClick={() => nav(m.path)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '24px 10px', borderRadius: 14,
              border: `0.5px solid ${m.color}30`, background: m.bg,
              cursor: 'pointer', textAlign: 'center',
            }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>{m.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: m.color, marginBottom: 4 }}>{m.title}</div>
              <div style={{ fontSize: 11, color: m.color + '99' }}>{m.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
