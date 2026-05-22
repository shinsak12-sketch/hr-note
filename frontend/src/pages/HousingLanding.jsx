import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function HousingLanding() {
  const nav = useNavigate();

  const sections = [
    {
      label: '🏠 사택',
      items: [
        { icon: '📝', title: '사택 신청', desc: '신규 사택 신청', path: '/dbsonsa/new', color: '#1A4A8A', bg: '#E8F0FB' },
        { icon: '🔍', title: '신청 현황 조회', desc: '내 신청 확인', path: '/dbsonsa/status', color: '#2D6A6A', bg: '#E6F4F4' },
      ]
    },
    {
      label: '💻 장비',
      items: [
        { icon: '🔄', title: '장비 변경 신고', desc: '자산 변경 신고', path: '/dbsonsa/asset', color: '#5A4A00', bg: '#FFF9E6' },
        { icon: '🔍', title: '신고 현황 조회', desc: '내 신고 확인', path: '/dbsonsa/asset-status', color: '#854F0B', bg: '#FAEEDA' },
      ]
    },
    {
      label: '🔧 수선',
      items: [
        { icon: '🛠️', title: '수선 요청', desc: '수선 요청 신청', path: '/dbsonsa/repair', color: '#5C3D8F', bg: '#F0EBF8' },
        { icon: '🔍', title: '요청 현황 조회', desc: '내 요청 확인', path: '/dbsonsa/repair-status', color: '#7B2D8B', bg: '#F5E8F8' },
      ]
    },
  ];

  return (
    <div className="app-container">
      <div className="header">
        <div style={{ width: 40 }} />
        <div style={{ fontSize: 16, fontWeight: 700 }}>DB손사 지원 신청</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {sections.map(sec => (
          <section key={sec.label}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{sec.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {sec.items.map(m => (
                <button key={m.path} onClick={() => nav(m.path)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '18px 10px', borderRadius: 14,
                  background: m.bg, border: `0.5px solid ${m.color}30`,
                  cursor: 'pointer', textAlign: 'center', minHeight: 100,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{m.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: m.color, marginBottom: 3 }}>{m.title}</div>
                  <div style={{ fontSize: 10, color: m.color + '99' }}>{m.desc}</div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
