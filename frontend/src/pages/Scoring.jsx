import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

function calcScore(issues) {
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const sevScore = { '상': 10, '중': 7, '하': 4 };
  const count = issues.length;

  let score = 0;
  for (const issue of issues) {
    const base = sevScore[issue.severity] || 0;
    const issueDate = new Date(issue.issue_date);
    const isRecent = issueDate >= oneYearAgo;
    score += base + (isRecent ? 3 : 0);
  }

  // 반복 가산
  if (count >= 5) score += 10;
  else if (count >= 3) score += 5;

  return score;
}

function getGrade(score) {
  if (score >= 25) return { label: '위험', color: '#A32D2D', bg: '#FCEBEB', emoji: '🔴' };
  if (score >= 15) return { label: '경계', color: '#854F0B', bg: '#FAEEDA', emoji: '🟠' };
  if (score >= 8)  return { label: '주의', color: '#7A6B00', bg: '#FFFBE6', emoji: '🟡' };
  return { label: '양호', color: '#3B6D11', bg: '#EAF3DE', emoji: '🟢' };
}

export default function Scoring() {
  const nav = useNavigate();
  const [scored, setScored] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('전체');

  useEffect(() => {
    async function load() {
      const issues = await api.getIssues();
      // 직원별 그룹핑
      const map = {};
      for (const issue of issues) {
        const key = issue.emp_no;
        if (!map[key]) map[key] = { emp_no: issue.emp_no, emp_name: issue.emp_name, department: issue.department, rank: issue.rank, issues: [] };
        map[key].issues.push(issue);
      }
      const result = Object.values(map).map(emp => {
        const score = calcScore(emp.issues);
        const grade = getGrade(score);
        return { ...emp, score, grade };
      }).sort((a, b) => b.score - a.score);
      setScored(result);
      setLoading(false);
    }
    load();
  }, []);

  const grades = ['전체', '🔴 위험', '🟠 경계', '🟡 주의', '🟢 양호'];
  const filtered = filter === '전체' ? scored : scored.filter(e => e.grade.emoji === filter.split(' ')[0]);

  const counts = {
    위험: scored.filter(e => e.grade.label === '위험').length,
    경계: scored.filter(e => e.grade.label === '경계').length,
    주의: scored.filter(e => e.grade.label === '주의').length,
    양호: scored.filter(e => e.grade.label === '양호').length,
  };

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/issues-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">이슈 스코어링</div>
        <div style={{ width: 40 }} />
      </div>

      {/* 등급 요약 */}
      <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: '위험', emoji: '🔴', color: '#A32D2D', bg: '#FCEBEB' },
          { label: '경계', emoji: '🟠', color: '#854F0B', bg: '#FAEEDA' },
          { label: '주의', emoji: '🟡', color: '#7A6B00', bg: '#FFFBE6' },
          { label: '양호', emoji: '🟢', color: '#3B6D11', bg: '#EAF3DE' },
        ].map(g => (
          <div key={g.label} style={{ background: g.bg, borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 18 }}>{g.emoji}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: g.color }}>{counts[g.label]}</div>
            <div style={{ fontSize: 11, color: g.color }}>{g.label}</div>
          </div>
        ))}
      </div>

      {/* 필터 탭 */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 16px 0', overflowX: 'auto' }}>
        {grades.map(g => (
          <button key={g} onClick={() => setFilter(g)} style={{
            padding: '6px 12px', borderRadius: 20, border: '0.5px solid var(--border)',
            background: filter === g ? 'var(--green)' : 'var(--bg2)',
            color: filter === g ? '#EAF3DE' : 'var(--text2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}>{g}</button>
        ))}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div className="center-msg">계산 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">해당 직원이 없습니다.</div>}
        {filtered.map((emp, idx) => (
          <div key={emp.emp_no} onClick={() => nav(`/emp?q=${emp.emp_no}`)}
            style={{
              background: 'var(--bg)', border: `0.5px solid ${emp.grade.color}40`,
              borderLeft: `4px solid ${emp.grade.color}`,
              borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: emp.grade.bg, color: emp.grade.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>{idx + 1}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{emp.emp_name}
                    <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400, marginLeft: 6 }}>· {emp.emp_no}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{[emp.department, emp.rank].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: emp.grade.color }}>{emp.score}점</div>
                <div style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: emp.grade.bg, color: emp.grade.color,
                }}>{emp.grade.emoji} {emp.grade.label}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>총 {emp.issues.length}건</span>
              {['상','중','하'].map(s => {
                const cnt = emp.issues.filter(i => i.severity === s).length;
                if (!cnt) return null;
                const cls = { '상': 'badge-high', '중': 'badge-mid', '하': 'badge-low' }[s];
                return <span key={s} className={`badge ${cls}`} style={{ fontSize: 10 }}>{s} {cnt}건</span>;
              })}
              {emp.issues.length >= 3 && (
                <span style={{ fontSize: 11, color: '#854F0B', background: '#FAEEDA', padding: '1px 6px', borderRadius: 10 }}>
                  ⚠️ 반복
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 스코어링 기준 안내 */}
      <div style={{ margin: '0 16px 80px', padding: 12, background: 'var(--bg2)', borderRadius: 10, fontSize: 11, color: 'var(--text2)', lineHeight: 1.8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>📌 스코어링 기준</div>
        심각도 상 10점 · 중 7점 · 하 4점<br/>
        1년 이내 이슈 +3점 · 3회↑반복 +5점 · 5회↑반복 +10점<br/>
        🔴위험 25↑ · 🟠경계 15~24 · 🟡주의 8~14 · 🟢양호 ~7
      </div>
    </div>
  );
}
