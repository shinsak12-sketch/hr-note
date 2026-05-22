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

      <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>신청할 항목을 선택해주세요.</div>

        {/* 사택 신청 */}
        <button onClick={() => nav('/dbsonsa/new')} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '20px 20px', borderRadius: 16,
          background: '#E8F0FB', border: '0.5px solid #1A4A8A30',
          cursor: 'pointer', textAlign: 'left', width: '100%',
        }}>
          <div style={{ fontSize: 38 }}>🏠</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1A4A8A', marginBottom: 4 }}>사택 신청</div>
            <div style={{ fontSize: 12, color: '#1A4A8A99', lineHeight: 1.5 }}>
              연고지 기준 50km 초과 시<br/>사택 지원 신청
            </div>
          </div>
        </button>

        {/* 신청 현황 조회 */}
        <button onClick={() => nav('/dbsonsa/status')} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '20px 20px', borderRadius: 16,
          background: 'var(--bg)', border: '0.5px solid var(--border)',
          cursor: 'pointer', textAlign: 'left', width: '100%',
        }}>
          <div style={{ fontSize: 38 }}>🔍</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>사택 신청 현황 조회</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              사번과 비밀번호로<br/>내 신청 현황 확인
            </div>
          </div>
        </button>

        {/* 장비변경 신고 */}
        <button onClick={() => nav('/dbsonsa/asset')} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '20px 20px', borderRadius: 16,
          background: '#FFF9E6', border: '0.5px solid #5A4A0030',
          cursor: 'pointer', textAlign: 'left', width: '100%',
        }}>
          <div style={{ fontSize: 38 }}>💻</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#5A4A00', marginBottom: 4 }}>장비 변경 신고</div>
            <div style={{ fontSize: 12, color: '#5A4A0099', lineHeight: 1.5 }}>
              노트북·모니터 등<br/>자산 변경 신고
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
