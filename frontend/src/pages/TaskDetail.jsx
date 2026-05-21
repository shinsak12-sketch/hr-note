import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const STATUSES = ['시작전', '진행중', '일부완료', '완료', '보류'];
const STATUS_STYLE = {
  '시작전':  { color: '#5F5E5A', bg: '#F0F0EE' },
  '진행중':  { color: '#1A4A8A', bg: '#E8F0FB' },
  '일부완료':{ color: '#854F0B', bg: '#FAEEDA' },
  '완료':    { color: '#3B6D11', bg: '#EAF3DE' },
  '보류':    { color: '#A32D2D', bg: '#FCEBEB' },
};

const EMPTY_PROGRESS = {
  progress_date: new Date().toISOString().split('T')[0],
  content: '',
};

function parseAssignees(assignee) {
  try {
    const parsed = JSON.parse(assignee);
    return Array.isArray(parsed) ? parsed : [assignee];
  } catch {
    return assignee ? [assignee] : [];
  }
}

export default function TaskDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [task, setTask] = useState(null);
  const [progress, setProgress] = useState([]);
  const [toast, setToast] = useState('');
  const [delConfirm, setDelConfirm] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [showProgressForm, setShowProgressForm] = useState(false);
  const [progressForm, setProgressForm] = useState(EMPTY_PROGRESS);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');

  useEffect(() => {
    api.getTask(id).then(setTask).catch(() => nav(-1));
    loadProgress();
  }, [id]);

  async function loadProgress() {
    const data = await api.getProgress(id);
    setProgress(data);
  }

  async function handleDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    await api.deleteTask(id);
    nav('/tasks-app', { replace: true });
  }

  async function handleStatusChange(status) {
    await api.updateTaskStatus(id, status);
    setTask(t => ({ ...t, status }));
    setChangingStatus(false);
    setToast(`"${status}"로 변경되었습니다.`);
  }

  async function handleAddProgress(e) {
    e.preventDefault();
    setProgressError('');
    if (!progressForm.progress_date || !progressForm.content) {
      setProgressError('모든 항목을 입력하세요.');
      return;
    }
    setProgressLoading(true);
    try {
      await api.addProgress(id, progressForm);
      setProgressForm(EMPTY_PROGRESS);
      setShowProgressForm(false);
      setToast('진행과정이 추가되었습니다.');
      loadProgress();
    } catch (err) {
      setProgressError(err.message);
    } finally {
      setProgressLoading(false);
    }
  }

  async function handleDeleteProgress(progressId) {
    if (!window.confirm('이 진행과정을 삭제할까요?')) return;
    await api.deleteProgress(id, progressId);
    setToast('삭제되었습니다.');
    loadProgress();
  }

  if (!task) return <div className="center-msg">불러오는 중...</div>;

  const s = STATUS_STYLE[task.status] || STATUS_STYLE['시작전'];
  const dateStr = task.instruction_date?.split?.('T')[0] || task.instruction_date || '';
  const dueStr = task.due_date?.split?.('T')[0] || task.due_date || '';
  const isOverdue = dueStr && task.status !== '완료' && new Date(dueStr) < new Date();
  const assignees = parseAssignees(task.assignee);

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">업무지시 상세</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 상태 + 변경 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: 14, fontWeight: 700, padding: '6px 16px', borderRadius: 20,
            background: s.bg, color: s.color,
          }}>{task.status}</span>
          <button onClick={() => setChangingStatus(!changingStatus)} style={{
            fontSize: 12, padding: '6px 14px', borderRadius: 8,
            background: '#1A4A8A', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
          }}>상태 변경</button>
        </div>

        {changingStatus && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STATUSES.filter(st => st !== task.status).map(st => {
              const style = STATUS_STYLE[st];
              return (
                <button key={st} onClick={() => handleStatusChange(st)} style={{
                  padding: '6px 16px', borderRadius: 20, border: 'none',
                  background: style.bg, color: style.color,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>{st}</button>
              );
            })}
          </div>
        )}

        {/* 기본 정보 */}
        <div className="detail-section">
          <div className="detail-row">
            <div className="detail-label">지시일자</div>
            <div className="detail-value">{dateStr}</div>
          </div>
          <div className="detail-row" style={{ alignItems: 'flex-start' }}>
            <div className="detail-label">담당자</div>
            <div className="detail-value">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {assignees.map((a, i) => (
                  <span key={i} style={{
                    background: '#E8F0FB', color: '#1A4A8A',
                    padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                  }}>👤 {a}</span>
                ))}
              </div>
            </div>
          </div>
          {dueStr && (
            <div className="detail-row">
              <div className="detail-label">마감기한</div>
              <div className="detail-value" style={{ color: isOverdue ? 'var(--red)' : 'var(--text)' }}>
                {isOverdue ? '⚠️ ' : '📅 '}{dueStr}
                {isOverdue && <span style={{ fontSize: 11, marginLeft: 4 }}>(기한 초과)</span>}
              </div>
            </div>
          )}
          <div className="detail-row" style={{ alignItems: 'flex-start' }}>
            <div className="detail-label">업무내용</div>
            <div className="detail-value" style={{ lineHeight: 1.6 }}>{task.content}</div>
          </div>
          {task.note && (
            <div className="detail-row" style={{ alignItems: 'flex-start' }}>
              <div className="detail-label">비고</div>
              <div className="detail-value" style={{ lineHeight: 1.6 }}>{task.note}</div>
            </div>
          )}
        </div>

        {/* 수정/삭제 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-edit" onClick={() => nav(`/tasks/${id}/edit`)}
            style={{ background: '#E8F0FB', color: '#1A4A8A' }}>✏️ 수정</button>
          <button className="btn-delete" onClick={handleDelete}>
            {delConfirm ? '⚠️ 확인 (한번 더)' : '🗑️ 삭제'}
          </button>
        </div>
        {delConfirm && (
          <div style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center' }}>
            삭제하면 복구할 수 없습니다. 다시 한번 눌러주세요.
          </div>
        )}

        {/* 진행과정 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>📝 진행과정 ({progress.length})</div>
            <button onClick={() => { setShowProgressForm(!showProgressForm); setProgressError(''); }} style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 8,
              background: '#1A4A8A', color: '#fff',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}>
              {showProgressForm ? '취소' : '+ 진행 추가'}
            </button>
          </div>

          {/* 진행 추가 폼 */}
          {showProgressForm && (
            <form onSubmit={handleAddProgress} style={{
              background: '#E8F0FB', borderRadius: 12,
              padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A4A8A', marginBottom: 2 }}>진행과정 추가</div>
              <div className="form-group">
                <label className="form-label">진행일자 <span className="req">*</span></label>
                <input type="date" value={progressForm.progress_date}
                  onChange={e => setProgressForm(f => ({ ...f, progress_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">진행내용 <span className="req">*</span></label>
                <textarea placeholder="진행 내용을 입력하세요"
                  value={progressForm.content}
                  onChange={e => setProgressForm(f => ({ ...f, content: e.target.value }))}
                  style={{ height: 90 }} />
              </div>
              {progressError && <div style={{ color: 'var(--red)', fontSize: 12 }}>{progressError}</div>}
              <button className="btn-primary" type="submit" disabled={progressLoading}
                style={{ background: '#1A4A8A' }}>
                {progressLoading ? '저장 중...' : '저장'}
              </button>
            </form>
          )}

          {/* 진행과정 목록 */}
          {progress.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: 'var(--text2)' }}>
              등록된 진행과정이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {progress.map((p, idx) => (
                <div key={p.id} style={{
                  background: 'var(--bg)', border: '0.5px solid var(--border)',
                  borderLeft: '3px solid #1A4A8A',
                  borderRadius: 12, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1A4A8A' }}>#{idx + 1}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 8 }}>
                        {p.progress_date?.split?.('T')[0] || p.progress_date}
                      </span>
                    </div>
                    <button onClick={() => handleDeleteProgress(p.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text2)' }}>
                      🗑️
                    </button>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{p.content}</div>
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
