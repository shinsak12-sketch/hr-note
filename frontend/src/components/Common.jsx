import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// ──────────────── Bottom Nav ────────────────
export function BottomNav() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const items = [
    { path: '/emp', label: '직원별', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { path: '/issues', label: '이슈별', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { path: '/issues/new', label: '이슈입력', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 5v14M5 12h14"/></svg> },
  ];

  return (
    <nav className="bottom-nav">
      {items.map(({ path, label, icon }) => (
        <button
          key={path}
          className={`nav-item ${pathname === path ? 'active' : ''}`}
          onClick={() => nav(path)}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

// ──────────────── Toast ────────────────
export function Toast({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast">{msg}</div>;
}

// ──────────────── Issue Card ────────────────
export function IssueCard({ issue, onClick }) {
  const sevClass = { '상': 'badge-high', '중': 'badge-mid', '하': 'badge-low' }[issue.severity] || '';
  const dateStr = issue.issue_date?.split?.('T')[0] || issue.issue_date || '';

  return (
    <div className="issue-card" onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>
          {issue.emp_name}
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {issue.emp_no}</span>
        </span>
        <span className={`badge ${sevClass}`}>{issue.severity}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
        <span className="badge badge-type">{issue.issue_type}</span>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>{dateStr}</span>
      </div>
      {issue.action_taken && (
        <div style={{ fontSize: 13, color: 'var(--text2)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {issue.action_taken}
        </div>
      )}
    </div>
  );
}
