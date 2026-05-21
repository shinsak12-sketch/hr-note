import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const STATUSES = ['시작전', '진행중', '일부완료', '완료', '보류'];
const STATUS_STYLE = {
  '시작전': { color: '#5F5E5A', bg: '#F0F0EE' },
  '진행중': { color: '#1A4A8A', bg: '#E8F0FB' },
  '일부완료': { color: '#854F0B', bg: '#FAEEDA' },
  '완료':   { color: '#3B6D11', bg: '#EAF3DE' },
  '보류':   { color: '#A32D2D', bg: '#FCEBEB' },
};

export default function TaskDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [task, setTask] = useState(null);
  const [toast, setToast] = useState('');
  const [delConfirm, setDelConfirm] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    api.getTask(id).then(setTask).catch(() => nav(-1));
  }, [id]);

  async function handleDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    await api.deleteTask(id);
    nav('/tasks-app', { replace: true });
  }

  async function handleStatusChange(status) {
    await api.updateTaskStatus(id, status);
    setTask(t => ({ ...t, status }));
    setChangingStatus(false);
    setToast(`상태가 "${status}"로 변경되었습니다.`);
  }

  if (!task) return <div className="center-msg">불러오는 중...</div>;

  const s = STATUS_STYLE[task.status] || STATUS_STYLE['시작전'];
  const dateStr = task.instruction_date?.split?.('T')[0] || task.instruction_date || '';
  const dueStr = task.due_date?.split?.('T')[0] || task.due_date || '';
  const isOverdue = dueStr && task.status !== '완료' && new Date(dueStr) < new Date();

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

        {/* 상태 배지 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: 14, fontWeight: 700, padding: '6px 14px', borderRadius: 20,
            background: s.bg, color: s.color,
          }}>{task.status}</span>
          <button onClick={() => setChangingStatus(!changingStatus)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 8,
            background: '#1A4A8A', color: '#fff', border: 'none', cursor: 'pointer',
          }}>상태 변경</button>
        </div>

        {/* 상태 변경 버튼들 */}
        {changingStatus && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STATUSES.filter(s => s !== task.status).map(s => {
              const st = STATUS_STYLE[s];
              return (
                <button key={s} onClick={() => handleStatusChange(s)} style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none',
                  background: st.bg, color: st.color, fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>{s}</button>
              );
            })}
          </div>
        )}

        {/* 상세 정보 */}
        <div className="detail-section">
          <div className="detail-row">
            <div className="detail-label">지시일자</div>
            <div className="detail-value">{dateStr}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">담당자</div>
            <div className="detail-value">{task.assignee}</div>
          </div>
          {dueStr && (
            <div className="detail-row">
              <div className="detail-label">마감기한</div>
              <div className="detail-value" style={{ color: isOverdue ? 'var(--red)' : 'var(--text)' }}>
                {isOverdue ? '⚠️ ' : ''}{dueStr}
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
            삭제하면 복구할 수 없습니다. 다시 한번 삭제 버튼을 누르세요.
          </div>
        )}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
