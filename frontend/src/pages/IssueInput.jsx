import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const EMPTY = {
  emp_no: '', emp_name: '', department: '', rank: '', position: '',
  issue_date: new Date().toISOString().split('T')[0],
  issue_type: '', severity: '', related_person: '', action_taken: ''
};

export default function IssueInput() {
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isEdit) {
      api.getIssue(id).then(issue => {
        setForm({
          emp_no: issue.emp_no || '',
          emp_name: issue.emp_name || '',
          department: issue.department || '',
          rank: issue.rank || '',
          position: issue.position || '',
          issue_date: issue.issue_date?.split?.('T')[0] || issue.issue_date || '',
          issue_type: issue.issue_type || '',
          severity: issue.severity || '',
          related_person: issue.related_person || '',
          action_taken: issue.action_taken || '',
        });
      });
    }
  }, [id]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.emp_no || !form.emp_name || !form.issue_date || !form.issue_type || !form.severity) {
      setError('필수 항목을 모두 입력하세요.');
      return;
    }
    setLoading(true);
    try {
      if (isEdit) {
        await api.updateIssue(id, form);
        setToast('수정되었습니다.');
        setTimeout(() => nav(`/issues/${id}`, { replace: true }), 1200);
      } else {
        await api.createIssue(form);
        setToast('저장되었습니다.');
        setTimeout(() => nav(-1), 1200);
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
        <div className="header-title">{isEdit ? '이슈 수정' : '이슈 입력'}</div>
        <div style={{ width: 40 }} />
      </div>

      <form onSubmit={handleSubmit} className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">사번 <span className="req">*</span></label>
          <input type="text" placeholder="사번 입력" value={form.emp_no} onChange={e => setF('emp_no', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">성명 <span className="req">*</span></label>
          <input type="text" placeholder="성명 입력" value={form.emp_name} onChange={e => setF('emp_name', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">소속 <span className="opt">(선택)</span></label>
          <input type="text" placeholder="부서 또는 센터명" value={form.department} onChange={e => setF('department', e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">직급 <span className="opt">(선택)</span></label>
            <input type="text" placeholder="예: 대리" value={form.rank} onChange={e => setF('rank', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">직책 <span className="opt">(선택)</span></label>
            <input type="text" placeholder="예: 팀원" value={form.position} onChange={e => setF('position', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">날짜 <span className="req">*</span></label>
          <input type="date" value={form.issue_date} onChange={e => setF('issue_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">이슈구분 <span className="req">*</span></label>
          <select value={form.issue_type} onChange={e => setF('issue_type', e.target.value)}>
            <option value="">선택하세요</option>
            {['질병','노무','사고','사건','기타'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">심각도 <span className="req">*</span></label>
          <select value={form.severity} onChange={e => setF('severity', e.target.value)}>
            <option value="">선택하세요</option>
            {['상','중','하'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">관련자</label>
          <input type="text" placeholder="관련자 이름" value={form.related_person} onChange={e => setF('related_person', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">조치사항</label>
          <textarea placeholder="조치 내용을 입력하세요" value={form.action_taken} onChange={e => setF('action_taken', e.target.value)} />
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <button className="btn-primary" type="submit" disabled={loading} style={{ marginBottom: 8 }}>
          {loading ? '저장 중...' : (isEdit ? '수정 완료' : '저장')}
        </button>
      </form>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
