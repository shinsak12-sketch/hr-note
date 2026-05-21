import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const STATUS_STYLE = {
  '신청':   { color: '#1A4A8A', bg: '#E8F0FB' },
  '검토중': { color: '#854F0B', bg: '#FAEEDA' },
  '승인':   { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':   { color: '#A32D2D', bg: '#FCEBEB' },
};

export default function HousingApply() {
  const nav = useNavigate();
  const [offices, setOffices] = useState([]);
  const [form, setForm] = useState({ emp_no: '', emp_name: '', department: '', office_id: '', home_address: '', home_address_detail: '', password: '', password_confirm: '' });
  const [distance, setDistance] = useState(null);
  const [isException, setIsException] = useState(false);
  const [exceptionChecked, setExceptionChecked] = useState(false);
  const [officeSearch, setOfficeSearch] = useState('');
  const [showOfficeList, setShowOfficeList] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);

  const filteredOffices = officeSearch
    ? offices.filter(o => o.org_name.includes(officeSearch) || o.headquarters.includes(officeSearch))
    : offices;

  async function checkException(empNo) {
    if (!empNo) return;
    try {
      const res = await api.checkHousingException(empNo);
      setIsException(res.is_exception);
      setExceptionChecked(true);
    } catch { setIsException(false); }
  }

  useEffect(() => {
    api.getOffices().then(setOffices);
    // 카카오 주소 API 로드
    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  function searchAddress() {
    if (!window.daum?.Postcode) {
      alert('주소 검색 로딩 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        const addr = data.roadAddress || data.jibunAddress;
        setF('home_address', addr);
        setDistance(null);
        setStep(1);
      }
    }).open();
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleCheckDistance() {
    setError('');
    const fullAddress = form.home_address_detail
      ? `${form.home_address} ${form.home_address_detail}`
      : form.home_address;
    if (!fullAddress || !form.office_id) {
      setError('거주지 주소와 소속을 입력하세요.');
      return;
    }
    setChecking(true);
    try {
      const res = await api.checkDistance({ home_address: fullAddress, office_id: form.office_id });
      setDistance(res);
      setForm(f => ({ ...f, home_address: fullAddress }));
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit() {
    setError('');
    if (!form.emp_no || !form.emp_name) {
      setError('사번과 성명을 입력하세요.');
      return;
    }
    if (!form.password) {
      setError('비밀번호를 설정하세요.');
      return;
    }
    if (form.password !== form.password_confirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      await api.applyHousing({ ...form, distance_km: distance?.distance_km });
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // 소속 그룹핑

  if (step === 3) return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>신청 완료!</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 32 }}>
          사택 신청이 접수되었습니다.<br/>검토 후 담당자가 연락드립니다.
        </div>
        <button onClick={() => nav('/housing-apply')} className="btn-primary"
          style={{ background: '#1A4A8A' }}>
          홈으로 돌아가기
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/housing-apply')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🏠 사택 신청</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '12px 16px 4px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6,
        background: '#E8F0FB', margin: '0 16px', borderRadius: 8, marginTop: 12 }}>
        📌 거주지에서 소속 센터까지 <strong style={{ color: '#1A4A8A' }}>실제 도로거리 50km 초과</strong>인 경우 신청 가능합니다.
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingBottom: 40 }}>

        {/* 사택 안내 */}
        <div style={{
          background: '#FFF9E6', border: '0.5px solid #E8D84A50',
          borderRadius: 12, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5A4A00', marginBottom: 8 }}>
            📋 사택 지원 안내
          </div>
          <div style={{ fontSize: 12, color: '#5A4A00', lineHeight: 1.9 }}>
            <div>✅ <strong>지원 대상</strong>: 소속 센터까지 실제 도로거리 50km 초과 직원</div>
            <div>✅ <strong>지원 내용</strong>: 월 임차료 일부 지원 (사내 규정 기준)</div>
            <div>✅ <strong>신청 기간</strong>: 연중 수시 접수</div>
            <div>✅ <strong>처리 기간</strong>: 신청 후 영업일 기준 5일 이내</div>
            <div>✅ <strong>제출 서류</strong>: 신청 후 담당자 안내에 따라 제출</div>
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '0.5px solid #E8D84A50', color: '#854F0B' }}>
              ⚠️ 허위 신청 시 지원이 취소되며 불이익이 발생할 수 있습니다.
            </div>
          </div>
        </div>

        {/* Step 1: 기본 정보 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>① 기본 정보</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">사번 <span className="req">*</span></label>
            <input type="text" placeholder="사번"
              value={form.emp_no}
              onChange={e => { setF('emp_no', e.target.value); setExceptionChecked(false); setIsException(false); }}
              onBlur={e => checkException(e.target.value)} />
            {isException && (
              <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', padding: '6px 10px', borderRadius: 6, marginTop: 4 }}>
                ⭐ 사전 협의된 특인 대상입니다
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">성명 <span className="req">*</span></label>
            <input type="text" placeholder="성명" value={form.emp_name} onChange={e => setF('emp_name', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">소속 <span className="req">*</span></label>
          <div style={{ position: 'relative' }}>
            <input type="text"
              placeholder="센터명 또는 본부명 검색"
              value={officeSearch || (form.office_id ? (offices.find(o => o.id == form.office_id)?.org_name || '') : '')}
              onChange={e => {
                setOfficeSearch(e.target.value);
                setF('office_id', '');
                setShowOfficeList(true);
              }}
              onFocus={() => setShowOfficeList(true)}
            />
            {showOfficeList && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--bg)', border: '0.5px solid var(--border)',
                borderRadius: 8, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              }}>
                {filteredOffices.length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text2)' }}>검색 결과 없음</div>
                )}
                {filteredOffices.map(o => (
                  <div key={o.id} onClick={() => {
                    setF('office_id', String(o.id));
                    setOfficeSearch('');
                    setShowOfficeList(false);
                  }} style={{
                    padding: '12px 14px', cursor: 'pointer', fontSize: 14,
                    borderBottom: '0.5px solid var(--border)',
                    background: form.office_id == o.id ? 'var(--green-light)' : 'var(--bg)',
                  }}>
                    <span style={{ fontWeight: 600 }}>{o.org_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>{o.headquarters}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {form.office_id && !showOfficeList && (
            <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 4 }}>
              ✓ {offices.find(o => o.id == form.office_id)?.org_name} 선택됨
            </div>
          )}
        </div>

        {/* Step 2: 거주지 주소 + 거리 확인 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>② 거주지 주소 및 거리 확인</div>

        <div className="form-group">
          <label className="form-label">거주지 주소 <span className="req">*</span></label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input type="text" placeholder="주소 검색 후 자동입력"
              value={form.home_address} readOnly
              style={{ flex: 1, background: 'var(--bg2)' }} />
            <button type="button" onClick={searchAddress} style={{
              padding: '0 14px', height: 40, borderRadius: 8,
              background: '#1A4A8A', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: 13,
              fontWeight: 600, whiteSpace: 'nowrap',
            }}>🔍 주소찾기</button>
          </div>
          <input type="text" placeholder="상세주소 입력 (동/호수 등)"
            value={form.home_address_detail || ''}
            onChange={e => setF('home_address_detail', e.target.value)} />
        </div>

        <button onClick={handleCheckDistance} disabled={checking}
          style={{
            width: '100%', height: 42, borderRadius: 10,
            background: '#1A4A8A', color: '#fff',
            border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
          {checking ? '거리 계산 중...' : '🗺️ 거리 확인'}
        </button>

        {/* 거리 결과 */}
        {distance && (
          <div style={{
            padding: 16, borderRadius: 12,
            background: (distance.eligible || isException) ? '#EAF3DE' : '#FCEBEB',
            border: `1px solid ${(distance.eligible || isException) ? '#3B6D11' : '#A32D2D'}30`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: (distance.eligible || isException) ? '#3B6D11' : '#A32D2D', marginBottom: 8 }}>
              {(distance.eligible || isException) ? "✅ 신청 가능" : "❌ 신청 불가"}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
              <div>📍 거주지 → 소속까지</div>
              <div style={{ fontSize: 20, fontWeight: 700, margin: '4px 0' }}>
                {distance.distance_km} km
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                {distance.eligible ? '50km 초과로 사택 신청이 가능합니다.' : '50km 이내로 사택 신청 대상이 아닙니다.'}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: 신청 */}
        {(distance?.eligible || isException) && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>③ 신청 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">비밀번호 설정 <span className="req">*</span></label>
                <input type="password" placeholder="현황 조회용"
                  value={form.password} onChange={e => setF('password', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">비밀번호 확인 <span className="req">*</span></label>
                <input type="password" placeholder="다시 입력"
                  value={form.password_confirm} onChange={e => setF('password_confirm', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">비고 <span className="opt">(선택)</span></label>
              <textarea placeholder="추가 요청사항"
                value={form.note || ''} onChange={e => setF('note', e.target.value)}
                style={{ height: 80 }} />
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
            <button onClick={handleSubmit} disabled={submitting}
              style={{
                width: '100%', height: 44, borderRadius: 10,
                background: '#3B6D11', color: '#EAF3DE',
                border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}>
              {submitting ? '신청 중...' : '사택 신청하기'}
            </button>
          </>
        )}

        {error && !distance && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}
