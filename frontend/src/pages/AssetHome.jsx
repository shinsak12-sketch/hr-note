import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const TYPE_ICONS = { '노트북': '💻', '모니터': '🖥️', '데스크탑': '🖨️', '아이패드': '📱' };

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
        <div className="header-title">자산 관리</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 3분할 버튼 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { icon: '📊', title: '자산현황', desc: '전체 현황', path: '/asset-stats', color: '#5A4A00', bg: '#FFF9E6' },
            { icon: '📋', title: '신청관리', desc: '변경신고 처리', path: '/asset-requests', color: '#1A4A8A', bg: '#E8F0FB' },
            { icon: '🖥️', title: '자산관리', desc: '자산 목록', path: '/asset-list', color: '#3B6D11', bg: '#EAF3DE' },
          ].map(m => (
            <button key={m.path} onClick={() => nav(m.path)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '16px 8px', borderRadius: 14,
              border: `0.5px solid ${m.color}30`, background: m.bg,
              cursor: 'pointer', textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{m.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: m.color, marginBottom: 3 }}>{m.title}</div>
              <div style={{ fontSize: 10, color: m.color + '99' }}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* 자산 종류별 현황 */}
        {!loading && stats && (
          <>
            <section>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>💻 자산 종류별 현황</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {Object.entries(stats.byType).map(([type, cnt]) => (
                  <div key={type} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 28 }}>{TYPE_ICONS[type] || '📦'}</div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{cnt}대</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{type}</div>
                    </div>
                  </div>
                ))}
                <div style={{ background: '#FFF9E6', border: '0.5px solid #5A4A0030', borderRadius: 12, padding: '14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 28 }}>📦</div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#5A4A00' }}>{stats.total}대</div>
                    <div style={{ fontSize: 12, color: '#5A4A00' }}>전체</div>
                  </div>
                </div>
              </div>
            </section>

            {/* 최근 변경 신고 */}
            {stats.recent?.length > 0 && (
              <section>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>🔔 최근 변경 신고</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.recent.map(r => (
                    <div key={r.id} onClick={() => nav('/asset-requests')}
                      style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.emp_name} · {r.asset_type}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.old_asset_no} → {r.new_asset_no}</div>
                      </div>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                        background: r.status === '확인완료' ? '#EAF3DE' : r.status === '반려' ? '#FCEBEB' : '#E8F0FB',
                        color: r.status === '확인완료' ? '#3B6D11' : r.status === '반려' ? '#A32D2D' : '#1A4A8A',
                      }}>{r.status}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
