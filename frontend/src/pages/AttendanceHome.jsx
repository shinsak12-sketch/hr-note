import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const ALL_TYPES = ['육아휴직','질병휴직','난임휴직','가족돌봄휴직','무급휴직','명령휴직','질병휴가','출산전후휴가','육아기단축근무','임신중단축근무','근무OFF'];
const TYPE_COLORS = {
  '육아휴직':'#3B6D11','질병휴직':'#A32D2D','난임휴직':'#7B2D8B','가족돌봄휴직':'#2D6A6A',
  '무급휴직':'#854F0B','명령휴직':'#5A4A00','질병휴가':'#A32D2D','출산전후휴가':'#1A4A8A',
  '육아기단축근무':'#3B6D11','임신중단축근무':'#1A4A8A','근무OFF':'#5C3D8F',
};

export default function AttendanceHome() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedType, setSelectedType] = useState('전체');

  useEffect(() => { load(); }, [year]);

  async function load() {
    setLoading(true);
    const data = await api.getAttendanceStats({ year });
    setStats(data);
    setLoading(false);
  }

  // 그래프 데이터
  const monthlyData = stats?.monthly?.map(m => {
    const total = selectedType === '전체'
      ? ALL_TYPES.reduce((sum, t) => sum + (m[t] || 0), 0)
      : (m[selectedType] || 0);
    return { month: m.month, total };
  }) || [];
  const maxVal = Math.max(...monthlyData.map(m => m.total), 1);

  const today = new Date();
  const years = Array.from({ length: 6 }, (_, i) => today.getFullYear() - i);

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">근태 현황</div>
        <button onClick={() => nav('/attendance-mgmt')} style={{
          fontSize: 12, padding: '5px 10px', borderRadius: 8,
          background: '#FAEEDA', color: '#854F0B', border: 'none', cursor: 'pointer', fontWeight: 600,
        }}>관리 →</button>
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* 요약 카드 */}
        {stats && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📊 현재 진행 중</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {[
                { label: '휴직', val: stats.summary?.휴직||0, color: '#A32D2D', bg: '#FCEBEB' },
                { label: '휴가', val: stats.summary?.휴가||0, color: '#1A4A8A', bg: '#E8F0FB' },
                { label: '단축근무', val: stats.summary?.단축근무||0, color: '#3B6D11', bg: '#EAF3DE' },
                { label: '근무OFF', val: stats.summary?.근무OFF||0, color: '#5C3D8F', bg: '#F0EBF8' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: s.color, marginTop: 2 }}>{s.label} 중</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 월별 그래프 */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>📈 월별 인원 현황</div>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border)' }}>
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>

          {/* 종류 드롭다운 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
              style={{ flex: 1, height: 36, fontSize: 13 }}>
              <option value="전체">전체 (모든 종류)</option>
              {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* 막대 그래프 */}
          <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 12px' }}>
            {loading ? (
              <div className="center-msg">불러오는 중...</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                {monthlyData.map(m => (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{ fontSize: 9, color: 'var(--text2)', fontWeight: 600 }}>{m.total > 0 ? m.total : ''}</div>
                    <div style={{
                      width: '100%', borderRadius: '4px 4px 0 0',
                      background: m.total > 0 ? '#854F0B' : 'var(--bg2)',
                      height: `${Math.max((m.total / maxVal) * 90, m.total > 0 ? 6 : 2)}px`,
                      transition: 'height 0.3s ease',
                    }} />
                    <div style={{ fontSize: 9, color: 'var(--text2)' }}>{m.month}월</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* D-15 복직 예정자 */}
        {stats?.d15?.length > 0 && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>🔔 복직 예정 D-15 이내</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.d15.map(r => {
                const c = TYPE_COLORS[r.type] || '#854F0B';
                const isUrgent = r.days_left <= 7;
                return (
                  <div key={r.id} style={{
                    background: 'var(--bg)', border: `0.5px solid ${c}30`,
                    borderLeft: `4px solid ${c}`, borderRadius: 12, padding: '12px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.emp_name}
                        <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                        {r.org_name} · {r.type}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                        복직일: {r.return_date?.split('T')[0]}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                        background: isUrgent ? '#FCEBEB' : '#FAEEDA',
                        color: isUrgent ? '#A32D2D' : '#854F0B',
                      }}>D-{r.days_left}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {stats?.d15?.length === 0 && !loading && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>
            15일 이내 복직 예정자가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
