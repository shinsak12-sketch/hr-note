import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { BottomNav, IssueCard } from '../components/Common.jsx';

export default function IssueList() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    issue_type: '',
    severity: searchParams.get('severity') || '',
    date_from: '',
    date_to: ''
  });

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      const p = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const data = await api.getIssues(p);
      setIssues(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filters); }, []);

  function setF(k, v) {
    const next = { ...filters, [k]: v };
    setFilters(next);
    load(next);
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">이슈별 조회</div>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => api.exportExcel()}>엑셀</button>
      </div>

      <div className="search-bar" style={{ flexWrap: 'wrap', gap: 6 }}>
        <select value={filters.issue_type} onChange={e => setF('issue_type', e.target.value)} style={{ flex: 1, minWidth: 100 }}>
          <option value="">전체 구분</option>
          {['질병','노무','사고','사건','기타'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filters.severity} onChange={e => setF('severity', e.target.value)} style={{ flex: 1, minWidth: 100 }}>
          <option value="">전체 심각도</option>
          {['상','중','하'].map(s => <option key={s}>{s}</option>)}
        </select>
        <input type="date" value={filters.date_from} onChange={e => setF('date_from', e.target.value)}
          style={{ flex: 1, minWidth: 120, fontSize: 12 }} />
        <input type="date" value={filters.date_to} onChange={e => setF('date_to', e.target.value)}
          style={{ flex: 1, minWidth: 120, fontSize: 12 }} />
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && issues.length === 0 && <div className="center-msg">이슈가 없습니다.</div>}
        {issues.map(issue => (
          <IssueCard key={issue.id} issue={issue} onClick={() => nav(`/issues/${issue.id}`)} />
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
