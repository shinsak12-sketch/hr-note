import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function HousingLanding() {
  const nav = useNavigate();

  return (
    <div className="app-container" style={{ justifyContent: 'center' }}>
      <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🏠</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>사택 신청</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
            거주지에서 소속 센터까지<br/>
            <strong style={{ color: '#1A4A8A' }}>실제 도로거리 50km 초과</strong> 시 신청 가능합니다.
          </div>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => nav('/housing-apply/new')} style={{
            width: '100%', padding: '20px 24px', borderRadius: 14,
            background: '#1A4A8A', color: '#fff',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ fontSize: 32 }}>📝</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>신규 사택 신청</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>거리 확인 후 신청서 작성</div>
            </div>
          </button>

          <button onClick={() => nav('/housing-apply/status')} style={{
            width: '100%', padding: '20px 24px', borderRadius: 14,
            background: 'var(--bg)', color: 'var(--text)',
            border: '0.5px solid var(--border)', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ fontSize: 32 }}>🔍</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>신청 현황 조회</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>사번과 비밀번호로 내 신청 확인</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
