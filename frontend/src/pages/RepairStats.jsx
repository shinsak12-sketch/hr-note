import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const STATUS_STYLE = {
  '접수':   { color: '#1A4A8A', bg: '#E8F0FB' },
  '처리중': { color: '#854F0B', bg: '#FAEEDA' },
  '완료':   { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':   { color: '#A32D2D', bg: '#FCEBEB' },
};
const TYPE_COLOR = { '사무실': '#2D6A6A', '장비': '#5A4A00', '기타': '#5C3D8F' };
const TYPE_BG = { '사무실': '#E6F4F4', '장비': '#FFF9E6', '기타': '#F0EBF8' };

export default function RepairStats() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRepairs().then(data => { setRequests(data); setLoading(false); });
  }, []);

  const total = requests.length;
  const byStat = ['접수','처리중','완료','반려'].reduce((acc,s) => ({ ...acc, [s]: requests.filter(r=>r.status===s).length }), {});
  const byType = ['사무실','장비','기타'].reduce((acc,t) => ({ ...acc, [t]: requests.filter(r=>r.repair_type===t).length }), {});
  const maxType = Math.max(...Object.values(byType), 1);

  // 최근 5건
  const recent = [...requests].slice(0, 5);

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">수선 현황</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && <>
          {/* 전체 요약 */}
          <section>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📊 전체 현황</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {['접수','처리중','완료','반려'].map(s => {
                const st = STATUS_STYLE[s];
                return (
                  <div key={s} style={{ background: st.bg, borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: st.color }}>{byStat[s]||0}</div>
                    <div style={{ fontSize: 10, color: st.color, marginTop: 2 }}>{s}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 수선 구분별 */}
          <section>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>🔧 수선 구분별</div>
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['사무실','장비','기타'].map(t => (
                <div key={t}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: TYPE_COLOR[t] }}>{t}</span>
                    <span style={{ fontWeight: 700, color: TYPE_COLOR[t] }}>{byType[t]}건</span>
                  </div>
                  <div style={{ background: 'var(--bg2)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 6, background: TYPE_COLOR[t], width: `${(byType[t]/maxType)*100}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 최근 요청 */}
          {recent.length > 0 && (
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>🕐 최근 요청</div>
                <button onClick={() => nav('/repair-mgmt')} style={{ fontSize: 12, color: '#5C3D8F', background: 'none', border: 'none', cursor: 'pointer' }}>전체보기 ›</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recent.map(r => {
                  const st = STATUS_STYLE[r.status];
                  return (
                    <div key={r.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.emp_name}
                          <span style={{ fontSize: 11, color: TYPE_COLOR[r.repair_type], marginLeft: 6, fontWeight: 600 }}>【{r.repair_type}】</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 200 }}>{r.reason}</div>
                      </div>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: st.bg, color: st.color, flexShrink: 0 }}>{r.status}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {total === 0 && <div className="center-msg">수선 요청이 없습니다.</div>}
        </>}
      </div>
    </div>
  );
}
