import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { BottomNav, IssueCard } from '../components/Common.jsx';

export default function EmpList() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (q) => {
    setLoading(true);
    try {
      const p = {};
      if (q) {
        if (/^\d/.test(q)) p.emp_no = q;
        else p.emp_name = q;
      }
      const data = await api.getIssues(p);
      setIssues(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(query); }, []);

  function handleSearch(e) {
    e.preventDefault();
    load(query);
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/issues-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">직원별 조회</div>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => api.exportExcel()}>엑셀</button>
      </div>

      <form className="search-bar" onSubmit={handleSearch}>
        <input
          type="text" placeholder="사번 또는 성명 검색"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoCapitalize="none"
        />
        <button type="submit" className="btn-secondary">검색</button>
      </form>

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
