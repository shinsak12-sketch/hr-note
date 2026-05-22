import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function HousingLanding() {
  const nav = useNavigate();

  return (
    <div className="app-container">
      <div className="header">
        <div style={{ width: 40 }} />
        <div style={{ fontSize: 16, fontWeight: 700 }}>DB손사 지원 신청</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>신청할 항목을 선택해주세요.</div>

        {/* 사택 */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>🏠 사택</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => nav('/dbsonsa/new')} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px 10px', borderRadius: 14,
            background: '#E8F0FB', border: '0.5px solid #1A4A8A30',
            cursor: 'pointer', textAlign: 'center', minHeight: 110,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1A4A8A', marginBottom: 3 }}>사택 신청</div>
            <div style={{ fontSize: 11, color: '#1A4A8A99', lineHeight: 1.4 }}>신규 사택 신청</div>
          </button>

          <button onClick={() => nav('/dbsonsa/status')} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px 10px', borderRadius: 14,
            background: 'var(--bg)', border: '0.5px solid var(--border)',
            cursor: 'pointer', textAlign: 'center', minHeight: 110,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>신청 현황 조회</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 }}>내 신청 확인</div>
          </button>
        </div>

        {/* 장비 */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginTop: 8, marginBottom: 4 }}>💻 장비</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => nav('/dbsonsa/asset')} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px 10px', borderRadius: 14,
            background: '#FFF9E6', border: '0.5px solid #5A4A0030',
            cursor: 'pointer', textAlign: 'center', minHeight: 110,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔄</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#5A4A00', marginBottom: 3 }}>장비 변경 신고</div>
            <div style={{ fontSize: 11, color: '#5A4A0099', lineHeight: 1.4 }}>자산 변경 신고</div>
          </button>
        </div>
      </div>
    </div>
  );
}
