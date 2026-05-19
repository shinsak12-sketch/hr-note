import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

export default function IssueDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [issue, setIssue] = useState(null);
  const [toast, setToast] = useState('');
  const [delConfirm, setDelConfirm] = useState(false);

  useEffect(() => {
    api.getIssue(id).then(setIssue).catch(() => nav(-1));
  }, [id]);

  async function handleDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    await api.deleteIssue(id);
    nav(-1);
  }

  if (!issue) return <div className="center-msg">불러오는 중...</div>;

  const dateStr = issue.issue_date?.split?.('T')[0] || issue.issue_date || '';
  const sevClass = { '상': 'badge-high', '중': 'badge-mid', '하': 'badge-low' }[issue.severity] || '';

  const rows = [
    { label: '사번', value: issue.emp_no },
    { label: '성명', value: issue.emp_name },
    issue.department && { label: '소속', value: issue.department },
    (issue.rank || issue.position) && { label: '직급/직책', value: [issue.rank, issue.position].filter(Boolean).join(' / ') },
    { label: '날짜', value: dateStr },
    { label: '이슈구분', value: <span className="badge badge-type">{issue.issue_type}</span> },
    { label: '심각도', value: <span className={`badge ${sevClass}`}>{issue.severity}</span> },
    issue.related_person && { label: '관련자', value: issue.related_person },
    issue.action_taken && { label: '조치사항', value: issue.action_taken },
  ].filter(Boolean);

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">이슈 상세</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="detail-section">
          {rows.map((row, i) => (
            <div key={i} className="detail-row">
              <div className="detail-label">{row.label}</div>
              <div className="detail-value">{row.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-edit" onClick={() => nav(`/issues/${id}/edit`)}>✏️ 수정</button>
          <button className="btn-delete" onClick={handleDelete}>
            {delConfirm ? '⚠️ 확인 (한번 더)' : '🗑️ 삭제'}
          </button>
        </div>
        {delConfirm && (
          <div style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>
            삭제하면 복구할 수 없습니다. 다시 한번 삭제 버튼을 누르세요.
          </div>
        )}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
