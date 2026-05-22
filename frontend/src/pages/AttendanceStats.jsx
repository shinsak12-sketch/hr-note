import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const ALL_TYPES = ['육아휴직','질병휴직','난임휴직','가족돌봄휴직','무급휴직','명령휴직','질병휴가','출산전후휴가','육아기단축근무','임신중단축근무','근무OFF'];
const TYPE_COLORS = {
  '육아휴직':'#3B6D11','질병휴직':'#A32D2D','난임휴직':'#7B2D8B','가족돌봄휴직':'#2D6A6A',
  '무급휴직':'#854F0B','명령휴직':'#5A4A00','질병휴가':'#A32D2D','출산전후휴가':'#1A4A8A',
  '육아기단축근무':'#3B6D11','임신중단축근무':'#1A4A8A','근무OFF':'#5C3D8F',
};

export default function AttendanceStats() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedTypes, setSelectedTypes] = useState([...ALL_TYPES]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function h(e) { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => { load(); }, [year]);

  async function load() {
    setLoading(true);
    const data = await api.getAttendanceStats({ year });
    setStats(data);
    setLoading(false);
  }

  function toggleType(t) {
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  const monthlyData = stats?.monthly?.map(m => {
    const total = selectedTypes.reduce((sum, t) => sum + (m[t] || 0), 0);
    return { month: m.month, total };
  }) || [];
  const maxVal = Math.max(...monthlyData.map(m => m.total), 1);

  const today = new Date();
  const years = Array.from({ length: 6 }, (_, i) => today.getFullYear() - i);

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/attendance-app')}>
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

          {/* 종류 멀티선택 드롭다운 */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button onClick={() => setDropdownOpen(o => !o)} style={{
              width: '100%', height: 36, borderRadius: 8, padding: '0 12px',
              border: '0.5px solid var(--border)', background: 'var(--bg)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)',
            }}>
              <span>{selectedTypes.length === ALL_TYPES.length ? '전체 종류' : `${selectedTypes.length}개 선택`}</span>
              <span style={{ fontSize: 10 }}>▼</span>
            </button>
            {dropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--bg)', border: '0.5px solid var(--border)',
                borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                padding: 10, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 240, overflowY: 'auto',
              }}>
                <button onClick={() => setSelectedTypes(selectedTypes.length === ALL_TYPES.length ? [] : [...ALL_TYPES])}
                  style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: 'var(--bg2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--text)', marginBottom: 4 }}>
                  {selectedTypes.length === ALL_TYPES.length ? '✓ 전체 해제' : '전체 선택'}
                </button>
                {ALL_TYPES.map(t => {
                  const on = selectedTypes.includes(t);
                  const c = TYPE_COLORS[t] || '#5A4A00';
                  return (
                    <button key={t} onClick={() => toggleType(t)} style={{
                      padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: on ? c + '15' : 'transparent',
                      color: on ? c : 'var(--text2)',
                      fontSize: 12, fontWeight: on ? 700 : 400,
                      fontFamily: 'inherit', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${on ? c : 'var(--border)'}`, background: on ? c : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {on && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </span>
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
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

        {/* 종료 D-15 / 시작 D-7 알림 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>⚡ 도래 알림</div>
          {(!stats?.endingSoon?.length && !stats?.startingSoon?.length) ? (
            <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '12px 0' }}>도래 예정 인원이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats?.startingSoon?.map(r => (
                <div key={'s'+r.id} style={{ background: 'var(--bg)', border: '0.5px solid #3B6D1130', borderLeft: '4px solid #3B6D11', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.emp_name} <span style={{ fontSize: 11, color: 'var(--text2)' }}>· {r.type}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>🏢 {r.org_name} · 시작일: {r.start_date?.split('T')[0]}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#EAF3DE', color: '#3B6D11' }}>시작 D-{r.days_left}</span>
                </div>
              ))}
              {stats?.endingSoon?.map(r => (
                <div key={'e'+r.id} style={{ background: 'var(--bg)', border: '0.5px solid #854F0B30', borderLeft: '4px solid #854F0B', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.emp_name} <span style={{ fontSize: 11, color: 'var(--text2)' }}>· {r.type}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>🏢 {r.org_name} · 종료일: {r.end_date?.split('T')[0]}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FAEEDA', color: '#854F0B' }}>종료 D-{r.days_left}</span>
                </div>
              ))}
            </div>
          )}
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
