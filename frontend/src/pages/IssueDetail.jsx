import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const EMPTY_ACTION = {
  action_date: new Date().toISOString().split('T')[0],
  action_by: '',
  action_content: '',
};

export default function IssueDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [issue, setIssue] = useState(null);
  const [actions, setActions] = useState([]);
  const [toast, setToast] = useState('');
  const [delConfirm, setDelConfirm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState(EMPTY_ACTION);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    api.getIssue(id).then(setIssue).catch(() => nav(-1));
    loadActions();
  }, [id]);

  async function loadActions() {
    const data = await api.getActions(id);
    setActions(data);
  }

  async function handleDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    await api.deleteIssue(id);
    nav(-1);
  }

  async function handleAddAction(e) {
    e.preventDefault();
    setActionError('');
    if (!actionForm.action_date || !actionForm.action_by || !actionForm.action_content) {
      setActionError('모든 항목을 입력하세요.');
      return;
    }
    setActionLoading(true);
    try {
      await api.addAction(id, actionForm);
      setActionForm(EMPTY_ACTION);
      setShowActionForm(false);
      setToast('조치가 추가되었습니다.');
      loadActions();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteAction(actionId) {
    if (!window.confirm('이 조치 이력을 삭제할까요?')) return;
    await api.deleteAction(id, actionId);
    setToast('삭제되었습니다.');
    loadActions();
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
    issue.issue_content && { label: '이슈내용', value: issue.issue_content },
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

        {/* 기본 정보 */}
        <div className="detail-section">
          {rows.map((row, i) => (
            <div key={i} className="detail-row">
              <div className="detail-label">{row.label}</div>
              <div className="detail-value">{row.value}</div>
            </div>
          ))}
        </div>

        {/* 수정/삭제 버튼 */}
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

        {/* 조치 이력 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>📋 조치 이력 ({actions.length})</div>
            <button onClick={() => { setShowActionForm(!showActionForm); setActionError(''); }}
              style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 8,
                background: 'var(--green)', color: '#EAF3DE',
                border: 'none', cursor: 'pointer', fontWeight: 600,
              }}>
              {showActionForm ? '취소' : '+ 조치 추가'}
            </button>
          </div>

          {/* 조치 추가 폼 */}
          {showActionForm && (
            <form onSubmit={handleAddAction} style={{
              background: 'var(--green-light)', borderRadius: 12,
              padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 2 }}>새 조치 추가</div>
              <div className="form-group">
                <label className="form-label">조치일자 <span className="req">*</span></label>
                <input type="date" value={actionForm.action_date}
                  onChange={e => setActionForm(f => ({ ...f, action_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">조치자 <span className="req">*</span></label>
                <input type="text" placeholder="조치한 사람 이름"
                  value={actionForm.action_by}
                  onChange={e => setActionForm(f => ({ ...f, action_by: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">조치내용 <span className="req">*</span></label>
                <textarea placeholder="조치 내용을 입력하세요"
                  value={actionForm.action_content}
                  onChange={e => setActionForm(f => ({ ...f, action_content: e.target.value }))}
                  style={{ height: 80 }} />
              </div>
              {actionError && <div style={{ color: 'var(--red)', fontSize: 12 }}>{actionError}</div>}
              <button className="btn-primary" type="submit" disabled={actionLoading}>
                {actionLoading ? '저장 중...' : '저장'}
              </button>
            </form>
          )}

          {/* 조치 이력 목록 */}
          {actions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: 'var(--text2)' }}>
              등록된 조치 이력이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {actions.map((action, idx) => (
                <div key={action.id} style={{
                  background: 'var(--bg)', border: '0.5px solid var(--border)',
                  borderRadius: 12, padding: '12px 14px',
                  borderLeft: '3px solid var(--green)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                        #{idx + 1} 조치
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 8 }}>
                        {action.action_date?.split?.('T')[0] || action.action_date}
                      </span>
                    </div>
                    <button onClick={() => handleDeleteAction(action.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text2)' }}>
                      🗑️
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                    👤 {action.action_by}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                    {action.action_content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
