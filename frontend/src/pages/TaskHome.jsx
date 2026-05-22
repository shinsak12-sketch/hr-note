import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const STATUSES = ['시작전', '진행중', '일부완료', '완료', '보류'];
const STATUS_STYLE = {
  '시작전': { color: '#5F5E5A', bg: '#F0F0EE' },
  '진행중': { color: '#1A4A8A', bg: '#E8F0FB' },
  '일부완료': { color: '#854F0B', bg: '#FAEEDA' },
  '완료':   { color: '#3B6D11', bg: '#EAF3DE' },
  '보류':   { color: '#A32D2D', bg: '#FCEBEB' },
};

function parseAssignees(assignee) {
  try {
    const parsed = JSON.parse(assignee);
    return Array.isArray(parsed) ? parsed : [assignee];
  } catch {
    return assignee ? [assignee] : [];
  }
}

function TaskCard({ task, onClick }) {
  const s = STATUS_STYLE[task.status] || STATUS_STYLE['시작전'];
  const dateStr = task.instruction_date?.split?.('T')[0] || task.instruction_date || '';
  const dueStr = task.due_date?.split?.('T')[0] || task.due_date || '';
  const isOverdue = dueStr && task.status !== '완료' && new Date(dueStr) < new Date();
  const assignees = parseAssignees(task.assignee);

  return (
    <div onClick={onClick} style={{
      background: 'var(--bg)', border: '0.5px solid var(--border)',
      borderLeft: `4px solid ${s.color}`,
      borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
          background: s.bg, color: s.color,
        }}>{task.status}</span>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>{dateStr}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6, lineHeight: 1.4 }}>
        {task.content}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          👤 {assignees.join(', ')}
        </span>
        {dueStr && (
          <span style={{ fontSize: 12, color: isOverdue ? 'var(--red)' : 'var(--text2)' }}>
            {isOverdue ? '⚠️' : '📅'} {dueStr}
          </span>
        )}
      </div>
    </div>
  );
}

export default function TaskHome() {
  const nav = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('미완료');

  useEffect(() => {
    api.getTasks().then(data => { setTasks(data); setLoading(false); });
  }, []);

  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: tasks.filter(t => t.status === s).length }), {});
  const filtered = filterStatus === '전체' ? tasks
    : filterStatus === '미완료' ? tasks.filter(t => t.status !== '완료')
    : tasks.filter(t => t.status === filterStatus);
  const incomplete = tasks.filter(t => !['완료'].includes(t.status)).length;

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">업무지시</div>
        <button onClick={() => nav('/tasks/new')} style={{
          background: '#1A4A8A', color: '#fff', border: 'none',
          borderRadius: 8, padding: '6px 12px', fontSize: 13,
          fontWeight: 600, cursor: 'pointer',
        }}>+ 등록</button>
      </div>

      {/* 현황 요약 */}
      <div style={{ padding: '16px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: '전체', val: tasks.length, color: 'var(--text)', bg: 'var(--bg2)' },
          { label: '미완료', val: incomplete, color: '#1A4A8A', bg: '#E8F0FB' },
          { label: '완료', val: counts['완료'] || 0, color: '#3B6D11', bg: '#EAF3DE' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: s.color, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 상태 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 16px', overflowX: 'auto', borderBottom: '0.5px solid var(--border)' }}>
        {['미완료', '전체', ...STATUSES].map(s => {
          const st = STATUS_STYLE[s];
          const active = filterStatus === s;
          const cnt = s === '미완료' ? incomplete : s === '전체' ? tasks.length : counts[s];
          return (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: '6px 14px', borderRadius: 20,
              border: active ? 'none' : '0.5px solid var(--border)',
              background: active ? (s === '미완료' ? '#1A4A8A' : st?.bg || '#EAF3DE') : 'var(--bg)',
              color: active ? (s === '미완료' ? '#E8F0FB' : st?.color || '#3B6D11') : 'var(--text2)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>
              {s} {cnt ? `(${cnt})` : ''}
            </button>
          );
        })}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">업무지시가 없습니다.</div>}
        {filtered.map(task => (
          <TaskCard key={task.id} task={task} onClick={() => nav(`/tasks/${task.id}`)} />
        ))}
      </div>
    </div>
  );
}
