import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function IssueHome() {
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api.getSummary().then(setSummary).catch(() => {});
  }, []);

  const t = summary?.totals || {};
  const top3 = summary?.top3 || [];

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">이슈관리</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 이슈 현황 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>이슈 현황</div>
          <div className="stat-grid">
            {[
              { val: t.total, label: '전체 이슈', color: 'var(--text)' },
              { val: t.high, label: '심각도 상', color: 'var(--red)', dot: 'var(--red)' },
              { val: t.mid, label: '심각도 중', color: 'var(--amber)', dot: '#EF9F27' },
              { val: t.low, label: '심각도 하', color: 'var(--green)', dot: 'var(--green-mid)' },
            ].map(({ val, label, color, dot }) => (
              <div key={label} className="stat-card">
                <div className="stat-val" style={{ color }}>{val ?? '-'}</div>
                <div className="stat-lbl">
                  {dot && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: dot, marginRight: 4 }}></span>}
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TOP 3 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>이슈 많은 직원 TOP 3</div>
          <div className="detail-section">
            {top3.length === 0 && <div className="center-msg" style={{ padding: 20 }}>데이터 없음</div>}
            {top3.map((emp, i) => (
              <div key={emp.emp_no} className="detail-row" style={{ cursor: 'pointer' }}
                onClick={() => emp.latest_issue_id ? nav(`/issues/${emp.latest_issue_id}`) : nav(`/emp?q=${emp.emp_no}`)}>
                <div style={{ width: 24, fontWeight: 600, color: 'var(--text2)', fontSize: 13 }}>{i + 1}</div>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'var(--green-light)', color: 'var(--green)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 600, fontSize: 13, marginRight: 10, flexShrink: 0
                }}>{emp.emp_name?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{emp.emp_name}</span>
                    {emp.latest_issue_type && (
                      <span className="badge badge-type" style={{ fontSize: 10 }}>{emp.latest_issue_type}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{[emp.department, emp.rank].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="badge badge-low">{emp.issue_count}건</span>
              </div>
            ))}
          </div>
        </section>

        {/* 메뉴 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>메뉴</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '👥', title: '직원별 조회', desc: '사번 또는 성명으로 검색', path: '/emp' },
              { icon: '🔍', title: '이슈별 조회', desc: '구분코드 또는 심각도 필터', path: '/issues' },
              { icon: '📊', title: '이슈 스코어링', desc: '직원별 위험도 분석', path: '/scoring' },
              { icon: '✏️', title: '이슈 입력', desc: '새 이슈 등록', path: '/issues/new' },
            ].map(m => (
              <button key={m.path} onClick={() => nav(m.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 12,
                  border: '0.5px solid var(--border)', background: 'var(--bg)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: 'var(--green-light)', fontSize: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>{m.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{m.desc}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
