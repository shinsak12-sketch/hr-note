import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function HousingStats() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHousingStats({}).then(data => { setStats(data); setLoading(false); });
  }, []);

  if (loading) return <div className="app-container"><div className="center-msg">불러오는 중...</div></div>;

  const list = stats?.list || [];
  const expiring = stats?.expiring || [];

  // 부서별 집계
  const byDept = list.reduce((acc, r) => {
    const k = r.office_dept || r.headquarters || '미분류';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const deptEntries = Object.entries(byDept).sort((a, b) => b[1] - a[1]);
  const maxDept = Math.max(...deptEntries.map(e => e[1]), 1);

  // 만료 현황
  const exp60  = expiring.filter(r => r.days_left <= 60).length;
  const exp90  = expiring.filter(r => r.days_left > 60 && r.days_left <= 90).length;
  const exp180 = expiring.filter(r => r.days_left > 90 && r.days_left <= 180).length;
  const normal = list.length - exp60 - exp90 - exp180;

  // TOP10 장기 사용자 (계약시작일 기준)
  const top10 = [...list]
    .filter(r => r.contract_start)
    .sort((a, b) => new Date(a.contract_start) - new Date(b.contract_start))
    .slice(0, 10)
    .map(r => {
      const start = new Date(r.contract_start);
      const now = new Date();
      const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
      const years = Math.floor(months / 12);
      const rem = months % 12;
      return { ...r, durationStr: years > 0 ? `${years}년 ${rem}개월` : `${rem}개월`, months };
    });

  const RANK_COLORS = ['#A32D2D', '#854F0B', '#5A4A00'];

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">사택 현황</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ① 핵심 지표 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📊 현황 요약</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { label: '사택 수', val: `${list.length}건`, color: '#2D6A6A', bg: '#E6F4F4' },
              { label: '보증금 총합', val: stats.deposit_sum ? `${Number(stats.deposit_sum).toLocaleString()}만` : '-', color: '#1A4A8A', bg: '#E8F0FB' },
              { label: '월세 총합', val: stats.rent_sum ? `${Number(stats.rent_sum).toLocaleString()}만` : '-', color: '#3B6D11', bg: '#EAF3DE' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: s.color, marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ② 부서별 막대 그래프 */}
        {deptEntries.length > 0 && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📂 부서별 사택 수</div>
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deptEntries.map(([dept, cnt]) => (
                <div key={dept}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{dept}</span>
                    <span style={{ fontWeight: 700, color: '#2D6A6A' }}>{cnt}건</span>
                  </div>
                  <div style={{ background: 'var(--bg2)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 6, background: '#2D6A6A',
                      width: `${(cnt / maxDept) * 100}%`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ③ 만료 현황 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📅 계약 만료 현황</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              { label: '🔴 D-60', val: exp60, color: '#A32D2D', bg: '#FCEBEB', filter: '🔴 D-60' },
              { label: '🟠 D-90', val: exp90, color: '#854F0B', bg: '#FAEEDA', filter: '🟠 D-90' },
              { label: '🟡 D-180', val: exp180, color: '#7A6B00', bg: '#FFFBE6', filter: '🟡 D-180' },
              { label: '✅ 정상', val: normal, color: '#3B6D11', bg: '#EAF3DE', filter: null },
            ].map(s => (
              <button key={s.label} onClick={() => s.filter && nav('/housing-list')}
                style={{
                  background: s.bg, borderRadius: 10, padding: '10px 6px', textAlign: 'center',
                  border: 'none', cursor: s.filter ? 'pointer' : 'default', fontFamily: 'inherit',
                }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: s.color, marginTop: 2 }}>{s.label}</div>
              </button>
            ))}
          </div>
        </section>

        {/* ④ 장기 사용자 TOP 10 */}
        {top10.length > 0 && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>⏱️ 장기 사용자 TOP {top10.length}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {top10.map((r, idx) => {
                const rankColor = RANK_COLORS[idx] || 'var(--text2)';
                const isMedal = idx < 3;
                return (
                  <div key={r.id} style={{
                    background: 'var(--bg)',
                    border: `0.5px solid ${isMedal ? rankColor + '30' : 'var(--border)'}`,
                    borderLeft: `4px solid ${isMedal ? rankColor : 'var(--border)'}`,
                    borderRadius: 12, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: isMedal ? rankColor : 'var(--bg2)',
                      color: isMedal ? '#fff' : 'var(--text2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                    }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {r.emp_name}
                        <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400, marginLeft: 6 }}>· {r.emp_no}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>🏢 {r.org_name || '-'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isMedal ? rankColor : 'var(--text)' }}>{r.durationStr}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>({r.contract_start?.split?.('T')[0]}~)</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
