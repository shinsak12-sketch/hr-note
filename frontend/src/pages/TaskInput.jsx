import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const STATUSES = ['시작전', '진행중', '일부완료', '완료', '보류'];
const EMPTY = {
  instruction_date: new Date().toISOString().split('T')[0],
  content: '', due_date: '', status: '시작전', note: ''
};

export default function TaskInput() {
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [assignees, setAssignees] = useState(['']);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) {
      api.getTask(id).then(task => {
        setForm({
          instruction_date: task.instruction_date?.split?.('T')[0] || task.instruction_date || '',
          content: task.content || '',
          due_date: task.due_date?.split?.('T')[0] || task.due_date || '',
          status: task.status || '시작전',
          note: task.note || '',
        });
        // 담당자 파싱
        try {
          const parsed = JSON.parse(task.assignee);
          setAssignees(Array.isArray(parsed) ? parsed : [task.assignee]);
        } catch {
          setAssignees(task.assignee ? [task.assignee] : ['']);
        }
      });
    }
  }, [id]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function addAssignee() {
    if (assignees.length < 5) setAssignees(a => [...a, '']);
  }

  function removeAssignee(idx) {
    if (assignees.length === 1) return;
    setAssignees(a => a.filter((_, i) => i !== idx));
  }

  function updateAssignee(idx, val) {
    setAssignees(a => a.map((v, i) => i === idx ? val : v));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const validAssignees = assignees.filter(a => a.trim());
    if (!form.instruction_date || !form.content || validAssignees.length === 0) {
      setError('필수 항목을 모두 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      const body = { ...form, assignee: JSON.stringify(validAssignees) };
      if (isEdit) {
        await api.updateTask(id, body);
        setToast('수정되었습니다.');
        setTimeout(() => nav(`/tasks/${id}`, { replace: true }), 1200);
      } else {
        await api.createTask(body);
        setToast('등록되었습니다.');
        setTimeout(() => nav('/tasks-app', { replace: true }), 1200);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">{isEdit ? '업무지시 수정' : '업무지시 등록'}</div>
        <div style={{ width: 40 }} />
      </div>

      <form onSubmit={handleSubmit} className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">지시일자 <span className="req">*</span></label>
          <input type="date" value={form.instruction_date} onChange={e => setF('instruction_date', e.target.value)} />
        </div>

        {/* 담당자 다중입력 */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>담당자 <span className="req">*</span> <span className="opt">(최대 5명)</span></label>
            {assignees.length < 5 && (
              <button type="button" onClick={addAssignee} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 6,
                background: '#E8F0FB', color: '#1A4A8A',
                border: 'none', cursor: 'pointer', fontWeight: 600,
              }}>+ 추가</button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {assignees.map((a, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8 }}>
                <input type="text" placeholder={`담당자 ${idx + 1}`}
                  value={a} onChange={e => updateAssignee(idx, e.target.value)}
                  style={{ flex: 1 }} />
                {assignees.length > 1 && (
                  <button type="button" onClick={() => removeAssignee(idx)} style={{
                    width: 36, height: 40, borderRadius: 8, border: '0.5px solid var(--border)',
                    background: '#FCEBEB', color: '#A32D2D', cursor: 'pointer', fontSize: 16, flexShrink: 0,
                  }}>×</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">업무내용 <span className="req">*</span></label>
          <textarea placeholder="업무지시 내용을 입력하세요" value={form.content}
            onChange={e => setF('content', e.target.value)} style={{ height: 120 }} />
        </div>
        <div className="form-group">
          <label className="form-label">진행상태 <span className="req">*</span></label>
          <select value={form.status} onChange={e => setF('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">마감기한 <span className="opt">(선택)</span></label>
          <input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">비고 <span className="opt">(선택)</span></label>
          <textarea placeholder="추가 메모" value={form.note}
            onChange={e => setF('note', e.target.value)} style={{ height: 80 }} />
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <button className="btn-primary" type="submit" disabled={loading}
          style={{ background: '#1A4A8A', marginBottom: 8 }}>
          {loading ? '저장 중...' : (isEdit ? '수정 완료' : '등록')}
        </button>
      </form>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
