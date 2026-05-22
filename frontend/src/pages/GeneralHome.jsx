import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function GeneralHome() {
  const nav = useNavigate();

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

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 사택 섹션 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>🏠 사택</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { icon: '📊', title: '사택현황', desc: '현황 대시보드', path: '/housing-stats', color: '#2D6A6A', bg: '#E6F4F4' },
              { icon: '📋', title: '신청관리', desc: '신청 접수/결재', path: '/housing-mgmt', color: '#1A4A8A', bg: '#E8F0FB' },
              { icon: '🏠', title: '사택관리', desc: '계약/만료 관리', path: '/housing-list', color: '#3B6D11', bg: '#EAF3DE' },
            ].map(m => (
              <button key={m.path} onClick={() => nav(m.path)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '16px 8px', borderRadius: 14,
                  border: `0.5px solid ${m.color}30`,
                  background: m.bg, cursor: 'pointer', textAlign: 'center',
                }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{m.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: m.color, marginBottom: 3 }}>{m.title}</div>
                <div style={{ fontSize: 10, color: m.color + '99', lineHeight: 1.4 }}>{m.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* 자산/수선 섹션 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>기타</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: '💻', title: '자산 관리', desc: '직원별 장비 현황 관리', path: '/asset-mgmt', color: '#5A4A00', bg: '#FFF9E6', disabled: false },
              { icon: '🔧', title: '수선 관리', desc: '시설/장비 수선 요청 처리', path: null, color: '#5C3D8F', bg: '#F0EBF8', disabled: true },
            ].map(m => (
              <div key={m.title} onClick={() => !m.disabled && m.path && nav(m.path)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 12,
                border: `0.5px solid ${m.disabled ? 'var(--border)' : m.color + '30'}`,
                background: m.disabled ? 'var(--bg2)' : m.bg,
                opacity: m.disabled ? 0.5 : 1,
                cursor: m.disabled ? 'default' : 'pointer',
              }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: m.disabled ? 'var(--border)' : m.color + '20', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{m.icon}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: m.disabled ? 'var(--text2)' : m.color }}>
                    {m.title} {m.disabled && <span style={{ fontSize: 11, fontWeight: 400 }}>(준비중)</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{m.desc}</div>
                </div>
                {!m.disabled && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" style={{ marginLeft: 'auto' }}>
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
