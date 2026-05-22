import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const TYPE_ICONS = { '노트북': '💻', '모니터': '🖥️', '데스크탑': '🖨️', '아이패드': '📱' };
const TYPE_COLORS = { '노트북': '#1A4A8A', '모니터': '#3B6D11', '데스크탑': '#854F0B', '아이패드': '#7B2D8B' };
const TYPE_BG = { '노트북': '#E8F0FB', '모니터': '#EAF3DE', '데스크탑': '#FAEEDA', '아이패드': '#F5E8F8' };

export default function AssetHome() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAssetStats().then(data => { setStats(data); setLoading(false); });
  }, []);

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">자산 현황</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}

        {!loading && stats && (
          <>
            {/* 전체 요약 */}
            <section>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📊 전체 현황</div>
              <div style={{ background: '#FFF9E6', border: '0.5px solid #5A4A0030', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#5A4A00' }}>{stats.total}대</div>
                <div style={{ fontSize: 13, color: '#5A4A00', marginTop: 4 }}>전체 자산</div>
              </div>
            </section>

            {/* 자산 종류별 */}
            <section>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>💻 자산 종류별 현황</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {Object.entries(stats.byType).map(([type, cnt]) => (
                  <div key={type} style={{
                    background: TYPE_BG[type] || 'var(--bg2)',
                    border: `0.5px solid ${TYPE_COLORS[type] || 'var(--border)'}20`,
                    borderRadius: 12, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ fontSize: 30 }}>{TYPE_ICONS[type] || '📦'}</div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: TYPE_COLORS[type] || 'var(--text)' }}>{cnt}대</div>
                      <div style={{ fontSize: 12, color: TYPE_COLORS[type] || 'var(--text2)' }}>{type}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 신청 현황 */}
            <section>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📋 변경신고 현황</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {[
                  { label: '신고접수', val: stats.requestCounts?.['신고접수'] || 0, color: '#1A4A8A', bg: '#E8F0FB' },
                  { label: '확인완료', val: stats.requestCounts?.['확인완료'] || 0, color: '#3B6D11', bg: '#EAF3DE' },
                  { label: '반려', val: stats.requestCounts?.['반려'] || 0, color: '#A32D2D', bg: '#FCEBEB' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: s.color, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* 최근 변경 신고 */}
            {stats.recent?.length > 0 && (
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>🔔 최근 변경 신고</div>
                  <button onClick={() => nav('/asset-requests')} style={{ fontSize: 12, color: '#1A4A8A', background: 'none', border: 'none', cursor: 'pointer' }}>전체보기 ›</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.recent.map(r => {
                    const stColor = r.status === '확인완료' ? '#3B6D11' : r.status === '반려' ? '#A32D2D' : '#1A4A8A';
                    const stBg = r.status === '확인완료' ? '#EAF3DE' : r.status === '반려' ? '#FCEBEB' : '#E8F0FB';
                    return (
                      <div key={r.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.emp_name}
                            <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{TYPE_ICONS[r.asset_type]} {r.asset_type}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{r.old_asset_no} → {r.new_asset_no}</div>
                        </div>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: stBg, color: stColor }}>{r.status}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {!loading && stats && stats.total === 0 && (
          <div className="center-msg">등록된 자산이 없습니다.<br/>자산관리에서 엑셀로 업로드해주세요.</div>
        )}
      </div>
    </div>
  );
}
