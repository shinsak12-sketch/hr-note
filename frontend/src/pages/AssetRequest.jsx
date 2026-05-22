import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const ASSET_TYPES = ['노트북', '모니터', '데스크탑', '아이패드'];
const REQUEST_TYPES = ['신규', '변경'];

export default function AssetRequest() {
  const nav = useNavigate();
  const [offices, setOffices] = useState([]);
  const [form, setForm] = useState({
    emp_no: '', emp_name: '', office_id: '',
    request_type: '', asset_type: '', new_asset_no: '', product_name: '',
    change_date: new Date().toISOString().split('T')[0],
    reason: '', password: '', password_confirm: ''
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
    const { emp_no, emp_name, request_type, asset_type, new_asset_no, change_date, reason, password, password_confirm } = form;
    if (!emp_no || !emp_name || !request_type || !asset_type || !new_asset_no || !change_date || !reason || !password) {
      setError('모든 항목을 입력하세요.'); return;
    }
    if (password !== password_confirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    setSubmitting(true);
    try {
      // old_asset_no는 빈값으로, new_asset_no를 자산번호로 사용
      await api.submitAssetRequest({ ...form, old_asset_no: '-', reason: `[${request_type}] ${reason}` });
      setDone(true);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  if (done) return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>신고 완료!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 32 }}>
          장비 변경 신고가 접수되었습니다.<br/>담당자 확인 후 처리됩니다.
        </div>
        <button onClick={() => nav('/dbsonsa')} className="btn-primary" style={{ background: '#5A4A00' }}>홈으로</button>
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
        <div className="header-title">💻 장비 변경 신고</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: '#FFF9E6', borderRadius: 8, fontSize: 12, color: '#5A4A00', lineHeight: 1.7 }}>
        📌 퇴직자 장비 인수, 장비 교체 등 자산 변경 시 신고해주세요.<br/>
        담당자 확인 후 자산 정보가 업데이트됩니다.<br/>
        <span style={{ color: '#A32D2D', fontWeight: 600 }}>※ 신규 자산은 담당자가 별도 입력합니다.</span>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingBottom: 40 }}>

        {/* 신청자 정보 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>① 신고자 정보</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">사번 <span className="req">*</span></label>
            <input type="text" placeholder="사번" value={form.emp_no} onChange={e => setF('emp_no', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">성명 <span className="req">*</span></label>
            <input type="text" placeholder="성명" value={form.emp_name} onChange={e => setF('emp_name', e.target.value)} />
          </div>
        </div>

        {/* 소속 */}
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

        {/* 장비 정보 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>② 장비 정보</div>

        {/* 신청구분 */}
        <div className="form-group">
          <label className="form-label">신청 구분 <span className="req">*</span></label>
          <div style={{ display: 'flex', gap: 8 }}>
            {REQUEST_TYPES.map(t => (
              <button key={t} type="button" onClick={() => setF('request_type', t)} style={{
                flex: 1, height: 40, borderRadius: 8,
                border: `2px solid ${form.request_type === t ? '#5A4A00' : 'var(--border)'}`,
                background: form.request_type === t ? '#FFF9E6' : 'var(--bg)',
                color: form.request_type === t ? '#5A4A00' : 'var(--text2)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>{t}</button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">자산 구분 <span className="req">*</span></label>
          <select value={form.asset_type} onChange={e => setF('asset_type', e.target.value)}>
            <option value="">선택하세요</option>
            {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">자산번호 <span className="req">*</span></label>
          <input type="text" placeholder="자산번호 입력" value={form.new_asset_no} onChange={e => setF('new_asset_no', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">제품명 <span className="opt">(선택)</span></label>
          <input type="text" placeholder="상세기재 (예: HP255 G9)" value={form.product_name} onChange={e => setF('product_name', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">변경일자 <span className="req">*</span></label>
          <input type="date" value={form.change_date} onChange={e => setF('change_date', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">변경사유 <span className="req">*</span></label>
          <textarea placeholder="예: 퇴직자 장비 인수, 장비 노후화 교체 등" value={form.reason}
            onChange={e => setF('reason', e.target.value)} style={{ height: 80 }} />
        </div>

        {/* 비밀번호 */}
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
          background: '#5A4A00', color: '#FFF9E6',
          border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
        }}>{submitting ? '제출 중...' : '📤 변경 신고 제출'}</button>
      </form>
    </div>
  );
}
