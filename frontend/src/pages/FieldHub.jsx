import React from 'react';
import { useNavigate } from 'react-router-dom';

const CARDS = [
  { icon: '👶', title: '육아휴직 계산', desc: '육아휴직 기간 및 잔여일 계산', color: '#3B6D11', bg: '#EAF3DE', path: '/field/parental-leave' },
  { icon: '🤰', title: '출산전후휴가 계산', desc: '출산전후휴가 일정 및 기간 계산', color: '#5C3D8F', bg: '#F0EBF8', path: '/field/maternity' },
  { icon: '🤱', title: '임신중 단축근무 계산', desc: '단축근무 대상기간 계산', color: '#1A4A8A', bg: '#E8F0FB', path: '/field/pregnancy' },
  { icon: '📋', title: '휴가·휴직 잔여기간', desc: '질병·난임·가족돌봄 잔여일 계산', color: '#A32D2D', bg: '#FCEBEB', path: '/field/leave' },
  { icon: '📍', title: '사무실 주소', desc: '전국 사무소 주소 및 지도', color: '#854F0B', bg: '#FAEEDA', path: '/field/office' },
];

export default function FieldHub() {
  const nav = useNavigate();
  return (
    <div className="container">
      <div className="header">
        <div style={{ width: 40 }} />
        <div className="header-title">HR 현장 지원</div>
        <div style={{ width: 40 }} />
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4, textAlign: 'center' }}>
          현장 관리자를 위한 HR 계산기 및 사무실 주소 안내
        </div>
        {CARDS.map((c, i) => (
          <button key={i} onClick={() => nav(c.path)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderRadius: 14, border: `0.5px solid ${c.color}30`, background: c.bg, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{c.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: c.color, marginBottom: 3 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: c.color + '99' }}>{c.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
