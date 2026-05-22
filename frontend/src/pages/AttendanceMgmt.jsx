import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const CATEGORIES = ['휴직', '휴가', '단축근무', '근무OFF'];
const TYPES = {
  '휴직': ['육아휴직','질병휴직','난임휴직','가족돌봄휴직','무급휴직','명령휴직'],
  '휴가': ['질병휴가','출산전후휴가'],
  '단축근무': ['육아기단축근무','임신중단축근무'],
  '근무OFF': ['근무OFF'],
};
const CHILD_ORDERS = ['첫째','둘째','셋째','넷째'];
const STATUS_STYLE = {
  '진행중': { color: '#1A4A8A', bg: '#E8F0FB' },
  '정상종료': { color: '#3B6D11', bg: '#EAF3DE' },
  '조기종료': { color: '#854F0B', bg: '#FAEEDA' },
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
    birth_date: '', prenatal_days: '',
    reduce_hours: '', work_start_time: '', work_end_time: '',
    normal_return_date: '', contract_date: '',
    retirement_date: '', off_start_date: '', leave_deleted: false, doc_completed: false,
  });
  const [officeSearch, setOfficeSearch] = useState('');
  const [showOfficeList, setShowOfficeList] = useState(false);
  const [saving, setSaving] = useState(false);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

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
      if (e.message?.includes('기간 중복')) {
        if (!window.confirm(`⚠️ ${e.message}\n\n그래도 등록하시겠습니까?`)) {
          setSaving(false); return;
        }
        // 강제 등록 (overlap 무시 파라미터)
        try {
          await api.createAttendance({ ...form, force: true });
          onDone('등록되었습니다.');
        } catch (e2) { }
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
            <select value={form.type} onChange={e => setF('type', e.target.value)}>
              {typeList.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* 공통 기본 정보 */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>기본 정보</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">사번 <span className="req">*</span></label>
              <input type="text" placeholder="사번" value={form.emp_no||''} onChange={e => setF('emp_no', e.target.value)} />
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
              <input type="date" value={form.start_date||''} onChange={e => setF('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">종료일</label>
              <input type="date" value={form.end_date||''} onChange={e => setF('end_date', e.target.value)} />
            </div>
          </div>
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
          {form.type === '육아휴직' && (
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
          {(form.type === '질병휴직' || form.type === '질병휴가') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">질병명</label>
                <input type="text" placeholder="질병명" value={form.disease_name||''} onChange={e => setF('disease_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">잔여일수</label>
                <input type="number" placeholder={form.type==='질병휴직'?'최대180일':'최대60일'} value={form.remaining_days||''} onChange={e => setF('remaining_days', e.target.value)} />
              </div>
              {form.type === '질병휴직' && (
                <div className="form-group">
                  <label className="form-label">사용회차</label>
                  <input type="number" placeholder="회차" value={form.split_count||''} onChange={e => setF('split_count', e.target.value)} />
                </div>
              )}
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
          {form.type === '출산전후휴가' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">출산일(예정일)</label>
                  <input type="date" value={form.birth_date||''} onChange={e => setF('birth_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">출산전 분리사용일</label>
                  <input type="number" placeholder="일수" value={form.prenatal_days||''} onChange={e => setF('prenatal_days', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[['multi_birth','다태아'],['premature','미숙아']].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setF(key, !form[key])} style={{
                    flex: 1, height: 36, borderRadius: 8, fontFamily: 'inherit',
                    border: `2px solid ${form[key] ? '#1A4A8A' : 'var(--border)'}`,
                    background: form[key] ? '#E8F0FB' : 'var(--bg2)',
                    color: form[key] ? '#1A4A8A' : 'var(--text2)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>{form[key] ? '✓' : ''} {label}</button>
                ))}
              </div>
              {form.post_birth_days > 0 && (
                <div style={{ background: '#E8F0FB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1A4A8A' }}>
                  📅 출산후기간: {form.post_birth_days}일
                  {form.post_birth_days >= 45 ? ' ✅ 45일 이상' : ' ⚠️ 45일 미만'}
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

// ── 카드 ──────────────────────────────
function AttCard({ r, onEdit, onClose, onDelete }) {
  const st = STATUS_STYLE[r.status] || STATUS_STYLE['진행중'];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  const catColor = { '휴직':'#A32D2D','휴가':'#1A4A8A','단축근무':'#3B6D11','근무OFF':'#5C3D8F' };
  const cc = catColor[r.category] || '#854F0B';

  return (
    <div style={{ background: 'var(--bg)', border: `0.5px solid ${cc}20`, borderLeft: `4px solid ${cc}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: cc+'20', color: cc }}>{r.type}</span>
          <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: st.bg, color: st.color }}>{r.status}</span>
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(o=>!o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--text2)', fontSize: 18 }}>⋮</button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 120 }}>
              <button onClick={() => { onEdit(r); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#1A4A8A', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>✏️ 수정</button>
              <button onClick={() => { onDelete(r.id); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#A32D2D', fontFamily: 'inherit' }}>🗑️ 삭제</button>
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
        <div>🏢 {r.org_name || '-'}</div>
        <div>📅 {r.start_date?.split('T')[0]} ~ {r.end_date?.split('T')[0] || '미정'} ({r.used_days ? r.used_days+'일' : '-'})</div>
        {r.return_date && <div>🔙 복직예정: {r.return_date?.split('T')[0]}</div>}
        {r.child_order && <div>👶 {r.child_order} · {r.split_count}회차</div>}
        {r.disease_name && <div>🏥 {r.disease_name} {r.remaining_days ? `(잔여 ${r.remaining_days}일)` : ''}</div>}
        {r.leave_reason && <div>📝 {r.leave_reason}</div>}
        {r.reduce_hours && <div>⏰ 단축 {r.reduce_hours}시간 ({r.work_start_time}~{r.work_end_time})</div>}
        {r.retirement_date && <div>🎯 정년일: {r.retirement_date?.split('T')[0]}</div>}
        {r.end_comment && <div style={{ color: 'var(--text)' }}>💬 {r.end_comment}</div>}
        {r.note && <div>📌 {r.note}</div>}
      </div>
      {r.status === '진행중' && (
        <button onClick={() => onClose(r)} style={{ width: '100%', height: 34, borderRadius: 8, background: '#FAEEDA', color: '#854F0B', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          종료 처리
        </button>
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
  const [statusFilter, setStatusFilter] = useState('진행중');
  const [search, setSearch] = useState('');
  const [inputModal, setInputModal] = useState(null);
  const [closeModal, setCloseModal] = useState(null);

  useEffect(() => { load(); api.getOffices().then(setOffices); }, []);

  async function load() {
    const data = await api.getAttendance();
    setList(data); setLoading(false);
  }

  async function handleDelete(id) {
    await api.deleteAttendance(id);
    setToast('삭제되었습니다.'); load();
  }

  const filtered = list.filter(r => {
    const matchCat = catFilter === '전체' || r.category === catFilter;
    const matchSt = statusFilter === '전체' || r.status === statusFilter;
    const matchSearch = !search || r.emp_name?.includes(search) || r.emp_no?.includes(search) || r.org_name?.includes(search) || r.type?.includes(search);
    return matchCat && matchSt && matchSearch;
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
        <button onClick={() => setInputModal({})} style={{
          fontSize: 12, padding: '5px 10px', borderRadius: 8,
          background: '#FAEEDA', color: '#854F0B', border: 'none', cursor: 'pointer', fontWeight: 600,
        }}>+ 등록</button>
      </div>

      {/* 검색 */}
      <div style={{ padding: '8px 16px 0' }}>
        <input type="text" placeholder="🔍 이름, 사번, 소속, 종류 검색"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* 카테고리 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 0', overflowX: 'auto' }}>
        {['전체', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCatFilter(c)} style={{
            padding: '4px 12px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
            background: catFilter === c ? '#854F0B' : 'var(--bg2)',
            color: catFilter === c ? '#FFF9E6' : 'var(--text2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>{c} ({counts[c]||0})</button>
        ))}
      </div>

      {/* 상태 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 16px 8px', borderBottom: '0.5px solid var(--border)', overflowX: 'auto' }}>
        {['진행중', '정상종료', '조기종료', '전체'].map(s => {
          const st = STATUS_STYLE[s];
          return (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              padding: '4px 12px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
              background: statusFilter === s ? (st?.bg || 'var(--bg2)') : 'var(--bg2)',
              color: statusFilter === s ? (st?.color || 'var(--text)') : 'var(--text2)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>{s}</button>
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
            onDelete={handleDelete}
          />
        ))}
      </div>

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
