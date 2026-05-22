import React from 'react';
import { useNavigate } from 'react-router-dom';

const CALCS = [
  { icon: '👶', title: '육아휴직 계산', desc: '육아휴직 기간 및 잔여일 계산', color: '#3B6D11', bg: '#EAF3DE', path: '/hr-calc/parental-leave' },
  { icon: '🤱', title: '임신중 단축근무 계산', desc: '단축근무 대상기간 계산', color: '#1A4A8A', bg: '#E8F0FB', path: '/hr-calc/pregnancy' },
  { icon: '📅', title: '음력/양력 변환', desc: '음력 ↔ 양력 날짜 변환', color: '#5C3D8F', bg: '#F0EBF8', path: null },
  { icon: '📊', title: '영업일수 계산', desc: '두 날짜 사이 영업일 계산', color: '#854F0B', bg: '#FAEEDA', path: null },
  { icon: '💰', title: '평균임금 계산', desc: '퇴직금 산정용 평균임금 계산', color: '#A32D2D', bg: '#FCEBEB', path: null },
];

export default function HRCalc() {
  const nav = useNavigate();

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">HR 계산기</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '12px 16px 4px', fontSize: 12, color: 'var(--text2)', background: '#F5E8F8', margin: '12px 16px', borderRadius: 8, lineHeight: 1.6 }}>
        🧮 인사 업무에 필요한 계산 도구 모음입니다.<br/>순차적으로 기능이 추가될 예정입니다.
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CALCS.map((c, i) => (
          <button key={i} onClick={() => c.path && nav(c.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px', borderRadius: 14,
              border: `0.5px solid ${c.color}30`,
              background: c.bg, cursor: c.path ? 'pointer' : 'default',
              textAlign: 'left', width: '100%', position: 'relative',
            }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, fontSize: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: c.color + '20', flexShrink: 0,
            }}>{c.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: c.color, marginBottom: 2 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: c.color + '99' }}>{c.desc}</div>
            </div>
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 10,
              background: c.color + '20', color: c.color, fontWeight: 600,
            }}>준비중</span>
          </button>
        ))}
      </div>
    </div>
  );
}
