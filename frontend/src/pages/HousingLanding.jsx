import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function HousingLanding() {
  const nav = useNavigate();

  const sections = [
    {
      key: 'housing',
      label: '사택',
      icon: '🏠',
      color: '#1A4A8A',
      bg: '#E8F0FB',
      items: [
        { icon: '📝', title: '사택 신청', desc: '신규 사택 신청', path: '/dbsonsa/new' },
        { icon: '🔍', title: '신청 현황 조회', desc: '내 신청 확인', path: '/dbsonsa/status' },
      ]
    },
    {
      key: 'asset',
      label: '장비',
      icon: '💻',
      color: '#5A4A00',
      bg: '#FFF9E6',
      items: [
        { icon: '🔄', title: '장비 변경 신고', desc: '자산 변경 신고', path: '/dbsonsa/asset' },
        { icon: '🔍', title: '신고 현황 조회', desc: '내 신고 확인', path: '/dbsonsa/asset-status' },
      ]
    },
    {
      key: 'repair',
      label: '수선',
      icon: '🔧',
      color: '#5C3D8F',
      bg: '#F0EBF8',
      items: [
        { icon: '🛠️', title: '수선 요청', desc: '수선 요청 신청', path: '/dbsonsa/repair' },
        { icon: '🔍', title: '요청 현황 조회', desc: '내 요청 확인', path: '/dbsonsa/repair-status' },
      ]
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F6F7FB', fontFamily: 'inherit' }}>

      {/* 헤더 */}
      <div style={{
        background: '#1A4A8A',
        padding: '40px 24px 32px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🏢</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 6 }}>HR 지원 서비스</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
          DB손사 임직원 복지 지원 신청 포털
        </div>
      </div>

      {/* 물결 구분선 */}
      <div style={{ height: 20, background: '#1A4A8A', borderRadius: '0 0 50% 50% / 0 0 20px 20px', marginBottom: 8 }} />

      <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {sections.map(sec => (
          <div key={sec.key} style={{
            background: '#fff',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
          }}>
            {/* 섹션 헤더 */}
            <div style={{
              background: sec.bg,
              padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: `1px solid ${sec.color}15`,
            }}>
              <span style={{ fontSize: 18 }}>{sec.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: sec.color }}>{sec.label}</span>
            </div>

            {/* 버튼 2개 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {sec.items.map((m, i) => (
                <button key={m.path} onClick={() => nav(m.path)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '20px 12px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderRight: i === 0 ? `0.5px solid ${sec.color}20` : 'none',
                  gap: 8,
                }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 14,
                    background: sec.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22,
                  }}>{m.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: sec.color }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{m.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* 안내 문구 */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', lineHeight: 1.7, marginTop: 4 }}>
          문의: 손사지원파트 신이삭 수석
        </div>
      </div>
    </div>
  );
}
