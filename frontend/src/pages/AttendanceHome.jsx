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
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text2)', marginTop: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🕐</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>근태관리</div>
        <div style={{ fontSize: 13 }}>기능 개발 예정입니다.</div>
      </div>
    </div>
  );
}
