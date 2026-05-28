import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const CATEGORIES = ['휴직', '휴가', '단축근무', '근무OFF'];
const TYPES = {
  '휴직': ['육아휴직','육아휴직(임신중)','질병휴직','난임휴직','가족돌봄휴직','무급휴직','명령휴직'],
  '휴가': ['질병휴가','출산전휴가','출산후휴가','출산전후휴가','가족돌봄휴가'],
  '단축근무': ['육아기단축근무','임신중단축근무'],
  '근무OFF': ['근무OFF'],
};
const CHILD_ORDERS = ['첫째','둘째','셋째','넷째'];
const BIRTH_TYPES = ['일반','미숙아','다태아'];
const STATUS_STYLE = {
  '예정':    { color: '#854F0B', bg: '#FAEEDA' },
  '진행중':  { color: '#1A4A8A', bg: '#E8F0FB' },
  '정상종료':{ color: '#3B6D11', bg: '#EAF3DE' },
  '조기종료':{ color: 'var(--text2)', bg: 'var(--bg2)' },
};

// ── 입력 모달 ──────────────────────────
function InputModal({ record, offices, onClose, onDone }) {
  const isEdit = !!record;
  const [form, setForm] = useState(record || {
    category: '휴직', type: '육아휴직', office_id: '', org_name: '',
    emp_no: '', emp_name: '', start_date: '', end_date: '', return_date: '',
    used_days: '', note: '',
    child_order: '', split_count: '', disease_name: '', remaining_days: '',
    family_target: '', leave_reason: '', multi_birth: false, premature: false,
    birth_type: '', // 일반/미숙아/다태아
    birth_date: '', prenatal_days: '',
    reduce_hours: '', work_start_time: '', work_end_time: '',
    normal_return_date: '', contract_date: '',
    retirement_date: '', off_start_date: '', leave_deleted: false, doc_completed: false,
  });
  const [officeSearch, setOfficeSearch] = useState('');
  const [showOfficeList, setShowOfficeList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prevPeriods, setPrevPeriods] = useState([]);
  const [prenatalRecord, setPrenatalRecord] = useState(null); // 기존 회차 기간

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // 사번+종류+시작일 변경 시 자동 회차 계산
  async function calcSplitCount(emp_no, type, start_date) {
    if (!emp_no || !type) return;
    try {
      const res = await api.getAttendanceSplitCount(emp_no, type, start_date);
      setF('split_count', res.split_count);

      // 기존 이력 조회
      const all = await api.getAttendance();
      const familyTypes = ['가족돌봄휴직','가족돌봄휴가'];
      const related = all.filter(x => {
        if (x.emp_no !== emp_no || x.type !== type) return false;
        if (familyTypes.includes(type) && start_date) {
          return new Date(x.start_date).getFullYear() === new Date(start_date).getFullYear();
        }
        return true;
      }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      setPrevPeriods(related);

      // 이름/소속 자동입력 (기존 이력 있으면)
      if (related.length > 0) {
        const ref = related[related.length - 1]; // 가장 최근 이력
        if (!form.emp_name) setF('emp_name', ref.emp_name || '');
        if (!form.office_id && ref.office_id) setF('office_id', String(ref.office_id));
        if (!form.org_name && ref.org_name) setF('org_name', ref.org_name || '');
      } else {
        // 같은 사번 다른 종류에서라도 이름 찾기
        const anyRecord = all.filter(x => x.emp_no === emp_no).sort((a,b) => new Date(b.start_date) - new Date(a.start_date))[0];
        if (anyRecord) {
          if (!form.emp_name) setF('emp_name', anyRecord.emp_name || '');
          if (!form.office_id && anyRecord.office_id) setF('office_id', String(anyRecord.office_id));
          if (!form.org_name && anyRecord.org_name) setF('org_name', anyRecord.org_name || '');
        }
      }
    } catch {}
  }

  const filteredOffices = officeSearch
    ? offices.filter(o => o.org_name.includes(officeSearch) || o.headquarters?.includes(officeSearch))
    : offices;

  // 사용일수 자동계산
  useEffect(() => {
    if (form.start_date && form.end_date) {
      const diff = Math.ceil((new Date(form.end_date) - new Date(form.start_date)) / (1000*60*60*24)) + 1;
      setF('used_days', diff);
    }
  }, [form.start_date, form.end_date]);

  // 출산후기간 자동계산
  useEffect(() => {
    if (form.type === '출산전후휴가' && form.birth_date && form.end_date) {
      const diff = Math.ceil((new Date(form.end_date) - new Date(form.birth_date)) / (1000*60*60*24)) + 1;
      setF('post_birth_days', diff);
    }
  }, [form.birth_date, form.end_date]);

  async function handleSave() {
    if (!form.emp_no || !form.emp_name || !form.start_date) return;
    setSaving(true);
    try {
      if (isEdit) await api.updateAttendance(record.id, form);
      else await api.createAttendance(form);
      onDone(isEdit ? '수정되었습니다.' : '등록되었습니다.');
    } catch (e) {
      if (e.message?.includes('시작일')) {
        alert(`⚠️ ${e.message}`);
      } else if (e.message?.includes('기간 중복')) {
        if (!window.confirm(`⚠️ ${e.message}\n\n그래도 등록하시겠습니까?`)) {
          setSaving(false); return;
        }
        try {
          await api.createAttendance({ ...form, force: true });
          onDone('등록되었습니다.');
        } catch (e2) { alert(e2.message); }
      } else {
        alert(e.message || '오류가 발생했습니다.');
      }
    } finally { setSaving(false); }
  }

  const typeList = TYPES[form.category] || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{isEdit ? '✏️ 수정' : '➕ 근태 등록'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 구분 선택 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>구분</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => { setF('category', c); setF('type', TYPES[c][0]); }} style={{
                  padding: '6px 14px', borderRadius: 20, fontFamily: 'inherit',
                  border: `2px solid ${form.category === c ? '#854F0B' : 'var(--border)'}`,
                  background: form.category === c ? '#FAEEDA' : 'var(--bg2)',
                  color: form.category === c ? '#854F0B' : 'var(--text2)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>{c}</button>
              ))}
            </div>
          </div>

          {/* 종류 선택 */}
          <div className="form-group">
            <label className="form-label">종류 <span className="req">*</span></label>
            <select value={form.type} onChange={async e => {
              const newType = e.target.value;
              setF('type', newType);
              if (form.emp_no && form.start_date) calcSplitCount(form.emp_no, newType, form.start_date);
              // 출산후휴가 선택 시 출산전휴가 이력 조회
              if (newType === '출산후휴가' && form.emp_no && form.child_order) {
                const all = await api.getAttendance();
                const rec = all.find(x => x.emp_no === form.emp_no && x.type === '출산전휴가' && x.child_order === form.child_order);
                setPrenatalRecord(rec || null);
              }
            }}>
              {typeList.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* 공통 기본 정보 */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>기본 정보</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">사번 <span className="req">*</span></label>
              <input type="text" placeholder="사번" value={form.emp_no||''} onChange={e => {
                setF('emp_no', e.target.value);
                if (e.target.value.length >= 6 && form.type && form.start_date) calcSplitCount(e.target.value, form.type, form.start_date);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">성명 <span className="req">*</span></label>
              <input type="text" placeholder="성명" value={form.emp_name||''} onChange={e => setF('emp_name', e.target.value)} />
            </div>
          </div>

          {/* 소속 */}
          <div className="form-group">
            <label className="form-label">소속</label>
            <div style={{ position: 'relative' }}>
              <input type="text" placeholder="센터명 검색"
                value={officeSearch || (form.office_id ? (offices.find(o=>o.id==form.office_id)?.org_name||form.org_name||'') : form.org_name||'')}
                onChange={e => { setOfficeSearch(e.target.value); setF('office_id',''); setF('org_name', e.target.value); setShowOfficeList(true); }}
                onFocus={() => setShowOfficeList(true)} />
              {showOfficeList && filteredOffices.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 8, maxHeight: 150, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                  {filteredOffices.slice(0, 15).map(o => (
                    <div key={o.id} onClick={() => { setF('office_id', String(o.id)); setF('org_name', o.org_name); setOfficeSearch(''); setShowOfficeList(false); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '0.5px solid var(--border)' }}>
                      <span style={{ fontWeight: 600 }}>{o.org_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{o.headquarters}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 날짜 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">시작일 <span className="req">*</span></label>
              <input type="date" value={form.start_date||''} onChange={e => {
                setF('start_date', e.target.value);
                if (form.emp_no && form.type) calcSplitCount(form.emp_no, form.type, e.target.value);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">종료일</label>
              <input type="date" value={form.end_date||''} onChange={e => {
                setF('end_date', e.target.value);
                if (e.target.value) {
                  const d = new Date(e.target.value);
                  d.setDate(d.getDate() + 1);
                  setF('return_date', d.toISOString().split('T')[0]);
                }
              }} />
            </div>
          </div>

          {/* 기존 회차 기간 표시 */}
          {!isEdit && prevPeriods.length > 0 && (
            <div style={{ background: '#E8F0FB', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, color: '#1A4A8A', marginBottom: 4 }}>📋 기존 사용 이력</div>
              {prevPeriods.map((p, i) => (
                <div key={p.id} style={{ color: '#1A4A8A' }}>
                  {i+1}회차: {p.start_date?.split('T')[0]} ~ {p.end_date?.split('T')[0] || '진행중'}
                  {p.used_days ? ` (${p.used_days}일)` : ''}
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#5A7AB8' }}>{p.status}</span>
                </div>
              ))}
              <div style={{ borderTop: '0.5px solid #1A4A8A30', marginTop: 4, paddingTop: 4, fontWeight: 700, color: '#1A4A8A' }}>
                → {form.split_count}회차로 자동 설정
              </div>
              <div style={{ marginTop: 6, padding: '6px 10px', background: '#FAEEDA', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#854F0B' }}>
                ⚠️ 잔여기간 확인 필요 — HR계산기에서 잔여기간을 확인하세요.
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">{form.category === '휴가' ? '복귀예정일' : '복직예정일'}</label>
              <input type="date" value={form.return_date||''} onChange={e => setF('return_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">사용일수</label>
              <input type="number" placeholder="자동계산" value={form.used_days||''} onChange={e => setF('used_days', e.target.value)} />
            </div>
          </div>

          {/* 종류별 추가 필드 */}
          {(form.type === '육아휴직' || form.type === '육아휴직(임신중)') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">자녀구분</label>
                <select value={form.child_order||''} onChange={e => setF('child_order', e.target.value)}>
                  <option value="">선택</option>
                  {CHILD_ORDERS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">분할회차</label>
                <input type="number" placeholder="회차" value={form.split_count||''} onChange={e => setF('split_count', e.target.value)} min="1" max="5" />
              </div>
            </div>
          )}
          {(form.type === '질병휴직') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">질병명</label>
                <input type="text" placeholder="질병명" value={form.disease_name||''} onChange={e => setF('disease_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">사용회차</label>
                <input type="number" placeholder="회차" value={form.split_count||''} onChange={e => setF('split_count', e.target.value)} />
              </div>
            </div>
          )}
          {form.type === '질병휴가' && (
            <div className="form-group">
              <label className="form-label">질병명</label>
              <input type="text" placeholder="질병명" value={form.disease_name||''} onChange={e => setF('disease_name', e.target.value)} />
            </div>
          )}
          {form.type === '가족돌봄휴직' && (
            <div className="form-group">
              <label className="form-label">대상가족구분</label>
              <input type="text" placeholder="예: 부모, 배우자, 자녀" value={form.family_target||''} onChange={e => setF('family_target', e.target.value)} />
            </div>
          )}
          {(form.type === '무급휴직' || form.type === '명령휴직') && (
            <div className="form-group">
              <label className="form-label">휴직사유</label>
              <textarea placeholder="휴직사유" value={form.leave_reason||''} onChange={e => setF('leave_reason', e.target.value)} style={{ height: 60 }} />
            </div>
          )}
          {['출산전휴가','출산후휴가','출산전후휴가'].includes(form.type) && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">자녀구분 <span className="req">*</span></label>
                  <select value={form.child_order||''} onChange={async e => {
                    setF('child_order', e.target.value);
                    if (form.type === '출산후휴가' && form.emp_no && e.target.value) {
                      const all = await api.getAttendance();
                      const rec = all.find(x => x.emp_no === form.emp_no && x.type === '출산전휴가' && x.child_order === e.target.value);
                      setPrenatalRecord(rec || null);
                    }
                  }}>
                    <option value="">선택</option>
                    {['첫째','둘째','셋째','넷째'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">구분 <span className="req">*</span></label>
                  <select value={form.birth_type||''} onChange={e => setF('birth_type', e.target.value)}>
                    <option value="">선택</option>
                    {BIRTH_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {/* 출산후휴가: 출산전휴가 이력 자동 조회 */}
              {form.type === '출산후휴가' && prenatalRecord && (
                <div style={{ background: '#E8F0FB', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#1A4A8A', lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 출산전휴가 이력</div>
                  <div>기간: {prenatalRecord.start_date?.split('T')[0]} ~ {prenatalRecord.end_date?.split('T')[0]}</div>
                  <div>사용일수: {prenatalRecord.used_days || '-'}일 ({prenatalRecord.birth_type || '-'})</div>
                </div>
              )}
            </>
          )}
          {(form.type === '육아기단축근무' || form.type === '임신중단축근무') && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">단축시간</label>
                  <select value={form.reduce_hours||''} onChange={e => setF('reduce_hours', e.target.value)}>
                    <option value="">선택</option>
                    {[1,2,3,4,5].map(h => <option key={h} value={h}>{h}시간</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">근무시작</label>
                  <input type="time" value={form.work_start_time||''} onChange={e => setF('work_start_time', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">근무종료</label>
                  <input type="time" value={form.work_end_time||''} onChange={e => setF('work_end_time', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">정상예정일</label>
                <input type="date" value={form.normal_return_date||''} onChange={e => setF('normal_return_date', e.target.value)} />
              </div>
              {form.type === '육아기단축근무' && (
                <div className="form-group">
                  <label className="form-label">단축근로계약일</label>
                  <input type="date" value={form.contract_date||''} onChange={e => setF('contract_date', e.target.value)} />
                </div>
              )}
            </>
          )}
          {form.type === '근무OFF' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">정년일</label>
                  <input type="date" value={form.retirement_date||''} onChange={e => setF('retirement_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">근무OFF 시작일</label>
                  <input type="date" value={form.off_start_date||''} onChange={e => setF('off_start_date', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[['leave_deleted','연차삭제'],['doc_completed','서류완료']].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setF(key, !form[key])} style={{
                    flex: 1, height: 36, borderRadius: 8, fontFamily: 'inherit',
                    border: `2px solid ${form[key] ? '#3B6D11' : 'var(--border)'}`,
                    background: form[key] ? '#EAF3DE' : 'var(--bg2)',
                    color: form[key] ? '#3B6D11' : 'var(--text2)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>{form[key] ? '✓' : ''} {label}</button>
                ))}
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">비고</label>
            <textarea placeholder="비고" value={form.note||''} onChange={e => setF('note', e.target.value)} style={{ height: 60 }} />
          </div>

          <button onClick={handleSave} disabled={saving || !form.emp_no || !form.emp_name || !form.start_date}
            className="btn-primary" style={{ marginBottom: 8 }}>
            {saving ? '저장 중...' : isEdit ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 종료처리 모달 ──────────────────────
function CloseModal({ record, onClose, onDone }) {
  const [status, setStatus] = useState('');
  const [comment, setComment] = useState('');
  const [endDate, setEndDate] = useState(record.end_date?.split('T')[0] || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!status) return;
    setSaving(true);
    await api.closeAttendance(record.id, { status, end_comment: comment, end_date: endDate });
    setSaving(false);
    onDone('종료 처리되었습니다.');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>종료 처리 — {record.emp_name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['정상종료','조기종료'].map(s => (
              <button key={s} type="button" onClick={() => setStatus(s)} style={{
                flex: 1, height: 44, borderRadius: 10, fontFamily: 'inherit',
                border: `2px solid ${status===s ? (s==='정상종료'?'#3B6D11':'#854F0B') : 'var(--border)'}`,
                background: status===s ? (s==='정상종료'?'#EAF3DE':'#FAEEDA') : 'var(--bg)',
                color: status===s ? (s==='정상종료'?'#3B6D11':'#854F0B') : 'var(--text2)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>{s === '정상종료' ? '✅' : '⚡'} {s}</button>
            ))}
          </div>
          <div className="form-group">
            <label className="form-label">실제 종료일</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">코멘트</label>
            <textarea placeholder="코멘트 입력" value={comment} onChange={e => setComment(e.target.value)} style={{ height: 80 }} />
          </div>
          <button onClick={handleSave} disabled={!status || saving} className="btn-primary"
            style={{ background: status === '정상종료' ? '#3B6D11' : '#854F0B', marginBottom: 8 }}>
            {saving ? '처리 중...' : '종료 처리'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 연장 모달 ──────────────────────────
function ExtendModal({ record, onClose, onDone }) {
  // 시작일 기본값: 기존 종료일 + 1일
  const defaultStart = record.end_date ? (() => {
    const d = new Date(record.end_date);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })() : '';
  const [form, setForm] = useState({ start_date: defaultStart, end_date: '', return_date: '' });
  const [saving, setSaving] = useState(false);
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.start_date) return;
    setSaving(true);
    try {
      await api.extendAttendance(record.id, form);
      onDone('연장 등록되었습니다.');
    } catch(e) { } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>🔄 연장 — {record.emp_name} ({record.type})</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
            현재 {record.split_count || 1}회차 ({record.start_date?.split('T')[0]} ~ {record.end_date?.split('T')[0] || '미정'})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">연장 시작일 <span className="req">*</span></label>
              <input type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">연장 종료일</label>
              <input type="date" value={form.end_date} onChange={e => {
                setF('end_date', e.target.value);
                if (e.target.value) {
                  const d = new Date(e.target.value);
                  d.setDate(d.getDate() + 1);
                  setF('return_date', d.toISOString().split('T')[0]);
                }
              }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">복직예정일</label>
            <input type="date" value={form.return_date} onChange={e => setF('return_date', e.target.value)} />
          </div>
          <button onClick={handleSave} disabled={!form.start_date || saving}
            className="btn-primary" style={{ background: '#1A4A8A', marginBottom: 8 }}>
            {saving ? '처리 중...' : '연장 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── 분할 모달 ──────────────────────────
function SplitModal({ record, onClose, onDone }) {
  const [form, setForm] = useState({ start_date: '', end_date: '', return_date: '' });
  const [saving, setSaving] = useState(false);
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.start_date) return;
    setSaving(true);
    try {
      await api.extendAttendance(record.id, { ...form, is_split: true });
      onDone('분할 등록되었습니다.');
    } catch(e) { } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>✂️ 분할 — {record.emp_name} ({record.type})</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.6 }}>
            현재 {record.split_count || 1}회차 ({record.start_date?.split('T')[0]} ~ {record.end_date?.split('T')[0] || '미정'})<br/>
            연장과 달리 시작일을 자유롭게 입력하세요.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">분할 시작일 <span className="req">*</span></label>
              <input type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">분할 종료일</label>
              <input type="date" value={form.end_date} onChange={e => {
                setF('end_date', e.target.value);
                if (e.target.value) {
                  const d = new Date(e.target.value);
                  d.setDate(d.getDate() + 1);
                  setF('return_date', d.toISOString().split('T')[0]);
                }
              }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">복직예정일</label>
            <input type="date" value={form.return_date} onChange={e => setF('return_date', e.target.value)} />
          </div>
          <button onClick={handleSave} disabled={!form.start_date || saving}
            className="btn-primary" style={{ background: '#5C3D8F', marginBottom: 8 }}>
            {saving ? '처리 중...' : '분할 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttCard({ r, onEdit, onClose, onExtend, onSplit, onRevert, onCalc, onDelete }) {
  const st = STATUS_STYLE[r.status] || STATUS_STYLE['진행중'];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  const CHILD_COLORS = {
    '첫째':  { bg: '#E8F0FB', color: '#1A4A8A' },
    '둘째':  { bg: '#EAF3DE', color: '#3B6D11' },
    '셋째':  { bg: '#FAEEDA', color: '#854F0B' },
    '넷째':  { bg: '#F0EBF8', color: '#5C3D8F' },
    '임신중':{ bg: '#FDEBF5', color: '#A32D6A' },
  };
  const CAT_COLOR = { '휴직':'#A32D2D','휴가':'#1A4A8A','단축근무':'#3B6D11','근무OFF':'#5C3D8F' };
  const cc = CAT_COLOR[r.category] || '#854F0B';
  const childStyle = r.child_order ? (CHILD_COLORS[r.child_order] || { bg: '#EAF3DE', color: '#3B6D11' }) : null;

  // 총 사용일수 (이전 회차 + 현재)
  const prevTotalDays = r.prevPeriods?.reduce((sum, p) => sum + (p.used_days || 0), 0) || 0;
  const totalUsedDays = prevTotalDays + (r.used_days || 0);

  // 이상감지
  const today = new Date(); today.setHours(0,0,0,0);
  const endDate = r.end_date ? new Date(r.end_date) : null;
  const startDate = r.start_date ? new Date(r.start_date) : null;
  const endDiff = endDate ? Math.ceil((endDate - today) / (1000*60*60*24)) : null;
  const startDiff = startDate ? Math.ceil((startDate - today) / (1000*60*60*24)) : null;

  let alertBadge = null;
  if (r.status === '진행중') {
    if (endDate && endDiff < 0) {
      alertBadge = { text: `🔴 종료일 ${Math.abs(endDiff)}일 경과`, bg: '#FCEBEB', color: '#A32D2D' };
    } else if (endDate && endDiff >= 0 && endDiff <= 15) {
      alertBadge = { text: `🟠 종료 D-${endDiff}`, bg: '#FAEEDA', color: '#854F0B' };
    } else if (startDate && startDiff > 0 && startDiff <= 7) {
      alertBadge = { text: `🟡 시작 D-${startDiff}`, bg: '#FFFBE6', color: '#5A4A00' };
    }
  }

  return (
    <div style={{ background: 'var(--bg)', border: `0.5px solid ${alertBadge?.color || cc}20`, borderLeft: `4px solid ${alertBadge?.color || cc}`, borderRadius: 12, padding: '12px 14px' }}>
      {alertBadge && (
        <div style={{ marginBottom: 8, display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: alertBadge.bg, color: alertBadge.color }}>
          {alertBadge.text}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: cc+'20', color: cc }}>{r.type}</span>
          {r.split_count >= 1 && <span style={{ marginLeft: 2, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: '#E8F0FB', color: '#1A4A8A' }}>{r.split_count}회차</span>}
          {r.is_extension && <span style={{ marginLeft: 2, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: '#F5E8F8', color: '#7B2D8B' }}>연장</span>}
          {r.child_order && childStyle && <span style={{ marginLeft: 2, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: childStyle.bg, color: childStyle.color }}>{r.child_order}</span>}
          <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: st.bg, color: st.color }}>{r.status}</span>
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o=>!o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--text2)', fontSize: 18 }}>⋮</button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 130 }}>
              <button onClick={() => { onEdit(r); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#1A4A8A', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>✏️ 수정</button>
              {(r.type === '육아휴직' || r.type === '육아휴직(임신중)') && (
                <button onClick={() => { onCalc(r); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#3B6D11', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>🧮 잔여기간 계산</button>
              )}
              {['질병휴직','난임휴직','가족돌봄휴직','질병휴가','가족돌봄휴가'].includes(r.type) && (
                <button onClick={() => { onCalc(r); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#A32D2D', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>🧮 잔여기간 계산</button>
              )}
              {['출산전휴가','출산후휴가','출산전후휴가'].includes(r.type) && (
                <button onClick={() => { onCalc(r); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#5C3D8F', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>🧮 출산휴가 계산기</button>
              )}
              {r.status !== '진행중' && (
                <button onClick={() => { onRevert(r.id); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#854F0B', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>↩️ 종료취소</button>
              )}
              <button onClick={() => { onDelete(r.id); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#A32D2D', fontFamily: 'inherit' }}>🗑️ 삭제</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
        <div>🏢 {r.org_name || '-'}</div>
        {r.prevPeriods?.map((p, i) => (
          <div key={p.id} style={{ fontSize: 11, color: 'var(--text2)' }}>
            📋 {i+1}회차: {p.start_date?.split('T')[0]} ~ {p.end_date?.split('T')[0] || '진행중'} {p.used_days ? `(${p.used_days}일)` : ''}
          </div>
        ))}
        <div>📅 {r.start_date?.split('T')[0]} ~ {r.end_date?.split('T')[0] || '미정'} ({r.used_days ? r.used_days+'일' : '-'})</div>
        {r.prevPeriods?.length > 0 && totalUsedDays > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#854F0B', background: '#FAEEDA', borderRadius: 6, padding: '3px 8px', display: 'inline-block', marginTop: 2 }}>
            📊 총 사용일수: {totalUsedDays}일
          </div>
        )}
        {r.return_date && <div>🔙 복직예정: {r.return_date?.split('T')[0]}</div>}
        {r.disease_name && <div>🏥 {r.disease_name}</div>}
        {r.birth_type && <div>👶 {r.birth_type}</div>}
        {r.leave_reason && <div>📝 {r.leave_reason}</div>}
        {r.reduce_hours && <div>⏰ 단축 {r.reduce_hours}시간 ({r.work_start_time}~{r.work_end_time})</div>}
        {r.retirement_date && <div>🎯 정년일: {r.retirement_date?.split('T')[0]}</div>}
        {r.end_comment && <div style={{ color: 'var(--text)' }}>💬 {r.end_comment}</div>}
        {r.note && <div>📌 {r.note}</div>}
      </div>
      {(r.status === '진행중' || r.status === '예정') && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onExtend(r)} style={{ flex: 1, height: 34, borderRadius: 8, background: '#E8F0FB', color: '#1A4A8A', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🔄 연장
          </button>
          <button onClick={() => onSplit(r)} style={{ flex: 1, height: 34, borderRadius: 8, background: '#F0EBF8', color: '#5C3D8F', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ✂️ 분할
          </button>
          {r.status === '진행중' && (
            <button onClick={() => onClose(r)} style={{ flex: 1, height: 34, borderRadius: 8, background: '#FAEEDA', color: '#854F0B', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              종료
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 ──────────────────────────────
export default function AttendanceMgmt() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [catFilter, setCatFilter] = useState('전체');
  const [hqFilter, setHqFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('진행중');
  const [search, setSearch] = useState('');
  const [inputModal, setInputModal] = useState(null);
  const [closeModal, setCloseModal] = useState(null);
  const [extendModal, setExtendModal] = useState(null);
  const [splitModal, setSplitModal] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerMenuRef = useRef(null);

  useEffect(() => {
    load();
    api.getOffices().then(setOffices);
    function h(e) { if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function load() {
    const data = await api.getAttendance();
    setList(data); setLoading(false);
  }

  async function handleDelete(id) {
    await api.deleteAttendance(id);
    setToast('삭제되었습니다.'); load();
  }

  async function handleDownloadTemplate() {
    try {
      const token = localStorage.getItem('hr_token');
      const BASE = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${BASE}/attendance/template/excel`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { setToast('다운로드 실패: ' + res.status); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'attendance_template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e) {
      setToast('다운로드 오류: ' + e.message);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setToast('업로드 중...');
    try {
      const result = await api.uploadAttendanceExcel(file);
      if (result.error) { setToast('오류: ' + result.error); return; }
      setToast(`${result.inserted}건 등록 완료${result.errors?.length ? ` (오류 ${result.errors.length}건)` : ''}`);
      load();
    } catch(e) {
      setToast('업로드 실패: ' + e.message);
    } finally {
      e.target.value = '';
    }
  }

  async function handleRevert(id) {
    await api.closeAttendance(id, { status: '진행중', end_comment: null });
    setToast('진행중으로 되돌렸습니다.'); load();
  }

  function handleCalc(r) {
    // 출산전/후/전후 휴가 → 출산전후휴가 계산기로
    if (['출산전휴가','출산후휴가','출산전후휴가'].includes(r.type)) {
      nav('/hr-calc/maternity');
      return;
    }
    if (['질병휴직','난임휴직','가족돌봄휴직','질병휴가','가족돌봄휴가'].includes(r.type)) {
      const familyTypes = ['가족돌봄휴직','가족돌봄휴가'];
      const related = list.filter(x => {
        if (x.emp_no !== r.emp_no || x.type !== r.type) return false;
        if (familyTypes.includes(r.type)) {
          return new Date(x.start_date).getFullYear() === new Date(r.start_date).getFullYear();
        }
        return true;
      }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      const periods = related.map(x => ({
        start: x.start_date?.split('T')[0] || '',
        end: x.end_date?.split('T')[0] || '',
      }));
      const params = new URLSearchParams({
        periods: JSON.stringify(periods),
        type: r.type,
        emp_name: r.emp_name,
      });
      nav('/hr-calc/leave?' + params.toString());
      return;
    }
    // 육아휴직 - 사번+자녀구분 (임신중 종류도 포함)
    const related = list.filter(x =>
      x.emp_no === r.emp_no &&
      (x.type === '육아휴직' || x.type === '육아휴직(임신중)') &&
      x.child_order === r.child_order
    ).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    const periods = related.map(x => ({
      start: x.start_date?.split('T')[0] || '',
      end: x.end_date?.split('T')[0] || '',
    }));
    const params = new URLSearchParams({
      periods: JSON.stringify(periods),
      child: r.child_order || '',
      emp_name: r.emp_name,
    });
    nav('/hr-calc/parental-leave?' + params.toString());
  }

  const PERIOD_TYPES = ['질병휴직','질병휴가','난임휴직','가족돌봄휴직','가족돌봄휴가'];
  const FAMILY_TYPES = ['가족돌봄휴직','가족돌봄휴가'];

  // 조직 필터 목록 - 사무실 데이터 기반
  const hqList = [...new Set(offices.map(o => o.headquarters).filter(Boolean))].sort();
  const deptList = [...new Set(offices.filter(o => !hqFilter || o.headquarters === hqFilter).map(o => o.department).filter(Boolean))].sort();
  const orgList = [...new Set(offices.filter(o => (!hqFilter || o.headquarters === hqFilter) && (!deptFilter || o.department === deptFilter)).map(o => o.org_name).filter(Boolean))].sort();

  const filtered = list.filter(r => {
    const matchCat = catFilter === '전체' || r.category === catFilter;
    const matchSt = statusFilter === '전체' || r.status === statusFilter;
    const matchSearch = !search || r.emp_name?.includes(search) || r.emp_no?.includes(search) || r.org_name?.includes(search) || r.type?.includes(search);
    const matchHq = !hqFilter || offices.find(o => o.org_name === r.org_name)?.headquarters === hqFilter;
    const matchDept = !deptFilter || offices.find(o => o.org_name === r.org_name)?.department === deptFilter;
    const matchOrg = !orgFilter || r.org_name === orgFilter;
    return matchCat && matchSt && matchSearch && matchHq && matchDept && matchOrg;
  }).sort((a, b) => {
    const ea = a.end_date ? new Date(a.end_date) : new Date('9999-12-31');
    const eb = b.end_date ? new Date(b.end_date) : new Date('9999-12-31');
    return ea - eb;
  }).map(r => {
    // 육아휴직: 사번 + 자녀구분 기준, 자신보다 시작일이 이전인 것만
    if (r.type === '육아휴직' || r.type === '육아휴직(임신중)') {
      const related = list.filter(x =>
        x.id !== r.id &&
        x.emp_no === r.emp_no &&
        (x.type === '육아휴직' || x.type === '육아휴직(임신중)') &&
        x.child_order === r.child_order &&
        x.start_date < r.start_date
      ).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      return { ...r, prevPeriods: related };
    }
    // 질병/난임/가족돌봄: 자신보다 시작일이 이전인 것만
    if (!PERIOD_TYPES.includes(r.type)) return r;
    const related = list.filter(x => {
      if (x.id === r.id || x.emp_no !== r.emp_no || x.type !== r.type) return false;
      if (x.start_date >= r.start_date) return false;
      if (FAMILY_TYPES.includes(r.type)) {
        return new Date(x.start_date).getFullYear() === new Date(r.start_date).getFullYear();
      }
      return true;
    }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return { ...r, prevPeriods: related };
  });

  const counts = { 전체: list.length };
  CATEGORIES.forEach(c => { counts[c] = list.filter(r => r.category === c).length; });

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/attendance-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">근태 관리</div>
        <div ref={headerMenuRef} style={{ position: 'relative', display: 'flex', gap: 6 }}>
          <button onClick={() => setInputModal({})} style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 8,
            background: '#FAEEDA', color: '#854F0B', border: 'none', cursor: 'pointer', fontWeight: 600,
          }}>+ 등록</button>
          <button onClick={() => setMenuOpen(o => !o)} style={{
            width: 34, height: 34, borderRadius: 8, background: 'var(--bg2)',
            border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text2)',
          }}>⋮</button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 100, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 150 }}>
              <button onClick={() => { handleDownloadTemplate(); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#1A4A8A', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>
                📥 서식 다운로드
              </button>
              <label style={{ display: 'block', width: '100%', padding: '12px 16px', fontSize: 13, cursor: 'pointer', color: '#3B6D11', fontFamily: 'inherit' }}>
                📤 엑셀 업로드
                <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={(e) => { handleUpload(e); setMenuOpen(false); }} />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 검색 */}
      <div style={{ padding: '8px 16px 0' }}>
        <input type="text" placeholder="🔍 이름, 사번, 소속, 종류 검색"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 0', overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {['전체', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCatFilter(c)} style={{
            padding: '4px 12px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
            background: catFilter === c ? '#854F0B' : 'var(--bg2)',
            color: catFilter === c ? '#FFF9E6' : 'var(--text2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>{c} ({counts[c]||0})</button>
        ))}
      </div>

      {/* 조직 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '0.5px solid var(--border)' }}>
        <select value={hqFilter} onChange={e => { setHqFilter(e.target.value); setDeptFilter(''); setOrgFilter(''); }} style={{ flex: 1, fontSize: 12, height: 34 }}>
          <option value="">전체 본부</option>
          {hqList.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setOrgFilter(''); }} style={{ flex: 1, fontSize: 12, height: 34 }}>
          <option value="">전체 부서</option>
          {deptList.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)} style={{ flex: 1, fontSize: 12, height: 34 }}>
          <option value="">전체 센터</option>
          {orgList.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {/* 상태 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 16px 8px', borderBottom: '0.5px solid var(--border)', overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {['예정', '진행중', '정상종료', '조기종료', '전체'].map(s => {
          const st = STATUS_STYLE[s];
          const count = s === '전체' ? list.length : list.filter(r => r.status === s).length;
          return (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '4px 12px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
              background: statusFilter === s ? (st?.bg || 'var(--bg2)') : 'var(--bg2)',
              color: statusFilter === s ? (st?.color || 'var(--text)') : 'var(--text2)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>{s} <span style={{ fontSize: 11, opacity: 0.8 }}>{count}</span></button>
          );
        })}
      </div>

      <div className="page-content" style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 40 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">내역이 없습니다.</div>}
        {filtered.map(r => (
          <AttCard key={r.id} r={r}
            onEdit={r => setInputModal(r)}
            onClose={r => setCloseModal(r)}
            onExtend={r => setExtendModal(r)}
            onSplit={r => setSplitModal(r)}
            onRevert={handleRevert}
            onCalc={handleCalc}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {splitModal && (
        <SplitModal record={splitModal} onClose={() => setSplitModal(null)}
          onDone={msg => { setToast(msg); setSplitModal(null); load(); }} />
      )}
      {extendModal && (
        <ExtendModal
          record={extendModal}
          onClose={() => setExtendModal(null)}
          onDone={msg => { setToast(msg); setExtendModal(null); load(); }}
        />
      )}
      {inputModal !== null && (
        <InputModal
          record={inputModal?.id ? inputModal : null}
          offices={offices}
          onClose={() => setInputModal(null)}
          onDone={msg => { setToast(msg); setInputModal(null); load(); }}
        />
      )}
      {closeModal && (
        <CloseModal
          record={closeModal}
          onClose={() => setCloseModal(null)}
          onDone={msg => { setToast(msg); setCloseModal(null); load(); }}
        />
      )}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
