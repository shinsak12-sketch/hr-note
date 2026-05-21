import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const EMPTY = { headquarters: '', department: '', org_name: '', address: '', manager_name: '', phone: '' };

export default function OfficeInput() {
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [delConfirm, setDelConfirm] = useState(false);
  const [hqList, setHqList] = useState([]);

  useEffect(() => {
    api.getOfficeHeadquarters().then(setHqList);
    if (isEdit) {
      api.getOffice(id).then(o => setForm({
        headquarters: o.headquarters || '',
        department: o.department || '',
        org_name: o.org_name || '',
        address: o.address || '',
        manager_name: o.manager_name || '',
        phone: o.phone || '',
      }));
    }
  }, [id]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.headquarters || !form.org_name || !form.address) {
      setError('본부명, 조직명, 주소는 필수입니다.');
      return;
    }
    setLoading(true);
    try {
      if (isEdit) {
        await api.updateOffice(id, form);
        setToast('수정되었습니다.');
      } else {
        await api.createOffice(form);
        setToast('등록되었습니다.');
      }
      setTimeout(() => nav('/offices-app', { replace: true }), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    await api.deleteOffice(id);
    nav('/offices-app', { replace: true });
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">{isEdit ? '사무실 수정' : '사무실 등록'}</div>
        {isEdit && (
          <button onClick={handleDelete} style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 8,
            background: delConfirm ? '#FCEBEB' : 'var(--bg2)',
            color: delConfirm ? '#A32D2D' : 'var(--text2)',
            border: '0.5px solid var(--border)', cursor: 'pointer',
          }}>{delConfirm ? '확인?' : '삭제'}</button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* 본부명 */}
        <div className="form-group">
          <label className="form-label">본부명 <span className="req">*</span></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="예: 서울본부" value={form.headquarters}
              onChange={e => setF('headquarters', e.target.value)} style={{ flex: 1 }} />
            {hqList.length > 0 && (
              <select onChange={e => { if (e.target.value) setF('headquarters', e.target.value); }}
                style={{ flex: 1 }}>
                <option value="">기존 본부 선택</option>
                {hqList.map(h => <option key={h}>{h}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* 부서명 */}
        <div className="form-group">
          <label className="form-label">부서명 <span className="opt">(선택 — 없으면 빈칸)</span></label>
          <input type="text" placeholder="예: 인사부서 (본부 직속이면 빈칸)" value={form.department}
            onChange={e => setF('department', e.target.value)} />
        </div>

        {/* 조직명 */}
        <div className="form-group">
          <label className="form-label">조직명 <span className="req">*</span></label>
          <input type="text" placeholder="예: 강남센터, 인사팀" value={form.org_name}
            onChange={e => setF('org_name', e.target.value)} />
        </div>

        {/* 주소 */}
        <div className="form-group">
          <label className="form-label">주소 <span className="req">*</span></label>
          <textarea placeholder="도로명 주소 입력" value={form.address}
            onChange={e => setF('address', e.target.value)} style={{ height: 70 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">관리자명 <span className="opt">(선택)</span></label>
            <input type="text" placeholder="담당자" value={form.manager_name}
              onChange={e => setF('manager_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">전화번호 <span className="opt">(선택)</span></label>
            <input type="tel" placeholder="02-0000-0000" value={form.phone}
              onChange={e => setF('phone', e.target.value)} />
          </div>
        </div>

        {/* 구조 안내 */}
        <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: 10, lineHeight: 1.7 }}>
          📌 <strong>계층 구조 안내</strong><br/>
          본부 직속 → 부서명 빈칸<br/>
          부서 소속 → 부서명 입력<br/>
          예) 서울본부 › 인사부서 › 강남센터
        </div>

        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        <button className="btn-primary" type="submit" disabled={loading}
          style={{ background: '#5A4A00', marginBottom: 8 }}>
          {loading ? '저장 중...' : (isEdit ? '수정 완료' : '등록')}
        </button>
      </form>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
