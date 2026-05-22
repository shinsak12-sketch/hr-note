import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const REPAIR_TYPES = ['사무실', '장비', '기타'];

export default function RepairRequest() {
  const nav = useNavigate();
  const [offices, setOffices] = useState([]);
  const [form, setForm] = useState({
    emp_no: '', emp_name: '', office_id: '', repair_type: '',
    reason: '', request_date: new Date().toISOString().split('T')[0],
    password: '', password_confirm: ''
  });
  const [officeSearch, setOfficeSearch] = useState('');
  const [showOfficeList, setShowOfficeList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.getOffices().then(setOffices); }, []);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const filteredOffices = officeSearch
    ? offices.filter(o => o.org_name.includes(officeSearch) || o.headquarters.includes(officeSearch))
    : offices;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.emp_name || !form.repair_type || !form.reason || !form.request_date || !form.password) {
      setError('필수 항목을 모두 입력하세요.'); return;
    }
    if (form.password !== form.password_confirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    setSubmitting(true);
    try {
      await api.submitRepair(form);
      setDone(true);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  if (done) return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>수선 요청 완료!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 32 }}>
          수선 요청이 접수되었습니다.<br/>담당자 확인 후 처리됩니다.
        </div>
        <button onClick={() => nav('/dbsonsa')} className="btn-primary" style={{ background: '#5C3D8F' }}>홈으로</button>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/dbsonsa')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">🔧 수선 요청</div>
        <div style={{ width: 40 }} />
      </div>

      <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingBottom: 40 }}>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>① 신청자 정보</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">사번 <span className="opt">(선택)</span></label>
            <input type="text" placeholder="사번" value={form.emp_no} onChange={e => setF('emp_no', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">성명 <span className="req">*</span></label>
            <input type="text" placeholder="성명" value={form.emp_name} onChange={e => setF('emp_name', e.target.value)} />
          </div>
        </div>

        {/* 소속 검색 */}
        <div className="form-group">
          <label className="form-label">소속 <span className="opt">(선택)</span></label>
          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="센터명 검색"
              value={officeSearch || (form.office_id ? (offices.find(o => o.id == form.office_id)?.org_name || '') : '')}
              onChange={e => { setOfficeSearch(e.target.value); setF('office_id', ''); setShowOfficeList(true); }}
              onFocus={() => setShowOfficeList(true)} />
            {showOfficeList && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                {filteredOffices.slice(0, 20).map(o => (
                  <div key={o.id} onClick={() => { setF('office_id', String(o.id)); setOfficeSearch(''); setShowOfficeList(false); }}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '0.5px solid var(--border)' }}>
                    <span style={{ fontWeight: 600 }}>{o.org_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{o.headquarters}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {form.office_id && !showOfficeList && (
            <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 4 }}>✓ {offices.find(o => o.id == form.office_id)?.org_name}</div>
          )}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>② 수선 내용</div>
        <div className="form-group">
          <label className="form-label">수선 구분 <span className="req">*</span></label>
          <div style={{ display: 'flex', gap: 8 }}>
            {REPAIR_TYPES.map(t => (
              <button key={t} type="button" onClick={() => setF('repair_type', t)} style={{
                flex: 1, height: 40, borderRadius: 8,
                border: `2px solid ${form.repair_type === t ? '#5C3D8F' : 'var(--border)'}`,
                background: form.repair_type === t ? '#F0EBF8' : 'var(--bg)',
                color: form.repair_type === t ? '#5C3D8F' : 'var(--text2)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">요청일자 <span className="req">*</span></label>
          <input type="date" value={form.request_date} onChange={e => setF('request_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">수선 요청 사유 <span className="req">*</span></label>
          <textarea placeholder="수선이 필요한 내용을 상세히 입력해주세요" value={form.reason}
            onChange={e => setF('reason', e.target.value)} style={{ height: 100 }} />
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>③ 조회용 비밀번호</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">비밀번호 <span className="req">*</span></label>
            <input type="password" placeholder="현황 조회용" value={form.password} onChange={e => setF('password', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">비밀번호 확인 <span className="req">*</span></label>
            <input type="password" placeholder="다시 입력" value={form.password_confirm} onChange={e => setF('password_confirm', e.target.value)} />
          </div>
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={submitting} style={{
          width: '100%', height: 46, borderRadius: 10,
          background: '#5C3D8F', color: '#fff',
          border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
        }}>{submitting ? '제출 중...' : '🔧 수선 요청 제출'}</button>
      </form>
    </div>
  );
}
