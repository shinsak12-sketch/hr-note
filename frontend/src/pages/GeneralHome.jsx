import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function GeneralHome() {
  const nav = useNavigate();

  const menus = [
    { icon: '🏠', title: '사택 관리', desc: '사택 신청 접수 및 처리', path: '/housing-mgmt', color: '#1A4A8A', bg: '#E8F0FB' },
    { icon: '💻', title: '자산 관리', desc: '직원별 장비 현황 관리', path: '/asset-mgmt', color: '#5A4A00', bg: '#FFF9E6', disabled: true },
    { icon: '🔧', title: '수선 관리', desc: '시설/장비 수선 요청 처리', path: '/repair-mgmt', color: '#5C3D8F', bg: '#F0EBF8', disabled: true },
  ];

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">총무지원</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {menus.map(m => (
          <button key={m.path} onClick={() => !m.disabled && nav(m.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px', borderRadius: 14,
              border: `0.5px solid ${m.disabled ? 'var(--border)' : m.color + '30'}`,
              background: m.disabled ? 'var(--bg2)' : m.bg,
              cursor: m.disabled ? 'default' : 'pointer',
              textAlign: 'left', width: '100%',
              opacity: m.disabled ? 0.5 : 1,
            }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, fontSize: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: m.disabled ? 'var(--border)' : m.color + '20', flexShrink: 0,
            }}>{m.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: m.disabled ? 'var(--text2)' : m.color }}>
                {m.title} {m.disabled && <span style={{ fontSize: 11, fontWeight: 400 }}>(준비중)</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{m.desc}</div>
            </div>
            {!m.disabled && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
