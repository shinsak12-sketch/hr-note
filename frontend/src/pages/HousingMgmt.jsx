import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const STATUSES = ['신청', '보완요청', '승인', '반려'];
const STATUS_STYLE = {
  '신청':    { color: '#1A4A8A', bg: '#E8F0FB' },
  '검토중':  { color: '#854F0B', bg: '#FAEEDA' },
  '보완요청':{ color: '#7B2D8B', bg: '#F5E8F8' },
  '승인':    { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':    { color: '#A32D2D', bg: '#FCEBEB' },
};

// ── 특인 관리 모달 ──────────────────────
function ExceptionModal({ onClose, setToast }) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ emp_no: '', emp_name: '', reason: '' });
  const [error, setError] = useState('');

  useEffect(() => { api.getHousingExceptions().then(setList); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.emp_no || !form.emp_name || !form.reason) { setError('모든 항목을 입력하세요.'); return; }
    try {
      await api.addHousingException(form);
      setForm({ emp_no: '', emp_name: '', reason: '' });
      setError('');
      setToast('등록되었습니다.');
      api.getHousingExceptions().then(setList);
    } catch (e) { setError(e.message); }
  }

  async function handleDelete(id) {
    await api.deleteHousingException(id);
    setToast('삭제되었습니다.');
    api.getHousingExceptions().then(setList);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>⭐ 특인 대상 관리</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg2)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>새 특인 대상 등록</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">사번 <span className="req">*</span></label>
                <input type="text" placeholder="사번" value={form.emp_no} onChange={e => setForm(f => ({ ...f, emp_no: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">성명 <span className="req">*</span></label>
                <input type="text" placeholder="성명" value={form.emp_name} onChange={e => setForm(f => ({ ...f, emp_name: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">예외 사유 <span className="req">*</span></label>
              <input type="text" placeholder="예: 본사 발령 대기" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
            <button type="submit" className="btn-primary" style={{ height: 36 }}>등록</button>
          </form>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13, padding: 16 }}>등록된 특인 대상이 없습니다.</div>}
            {list.map(e => (
              <div key={e.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderLeft: '3px solid #854F0B', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.emp_name} <span style={{ fontSize: 12, color: 'var(--text2)' }}>· {e.emp_no}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{e.reason}</div>
                </div>
                <button onClick={() => handleDelete(e.id)} style={{ background: '#FCEBEB', color: '#A32D2D', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>삭제</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 결재 모달 ──────────────────────────
function ApprovalModal({ request, onClose, onDone }) {
  const [status, setStatus] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const APPROVAL_STATUSES = ['승인', '반려', '보완요청'];

  async function handleSave() {
    if (!status) return;
    setSaving(true);
    try {
      await api.updateHousingStatus(request.id, { status, manager_comment: comment });
      onDone('결재 처리되었습니다.');
    } catch (e) { } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>결재 — {request.emp_name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>처리 결과 선택</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {APPROVAL_STATUSES.map(s => {
              const st = STATUS_STYLE[s];
              return (
                <button key={s} onClick={() => setStatus(s)} style={{
                  flex: 1, padding: '10px 6px', borderRadius: 10,
                  border: `2px solid ${status === s ? st.color : 'transparent'}`,
                  background: st.bg, color: st.color,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>{s}</button>
              );
            })}
          </div>
          <div className="form-group">
            <label className="form-label">코멘트 <span className="opt">(선택)</span></label>
            <textarea placeholder="지시/승인/반려 내용을 입력하세요" value={comment}
              onChange={e => setComment(e.target.value)} style={{ height: 100 }} />
          </div>
          <button onClick={handleSave} disabled={!status || saving} className="btn-primary"
            style={{ height: 44, fontSize: 15, background: status ? STATUS_STYLE[status]?.color : 'var(--border)', marginBottom: 8 }}>
            {saving ? '처리 중...' : '결재처리'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 계약정보 모달 ──────────────────────
function ContractModal({ request, onClose, onDone }) {
  const [form, setForm] = useState({
    housing_address: request.housing_address || '',
    contract_start: request.contract_start?.split?.('T')[0] || '',
    contract_end: request.contract_end?.split?.('T')[0] || '',
    contract_note: request.contract_note || '',
    deposit: request.deposit || '',
    monthly_rent: request.monthly_rent || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.async = true;
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  function searchAddress() {
    if (!window.daum?.Postcode) { alert('주소 검색 로딩 중입니다.'); return; }
    new window.daum.Postcode({
      oncomplete: (data) => {
        setForm(f => ({ ...f, housing_address: data.roadAddress || data.jibunAddress }));
      }
    }).open();
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateHousingContract(request.id, form);
      onDone('계약정보가 저장되었습니다.');
    } catch (e) { } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📋 계약정보 — {request.emp_name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 사택 주소 - 카카오 API */}
          <div className="form-group">
            <label className="form-label">사택 주소</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="주소 검색 후 자동입력"
                value={form.housing_address} readOnly
                style={{ flex: 1, background: 'var(--bg2)' }} />
              <button type="button" onClick={searchAddress} style={{
                padding: '0 12px', height: 40, borderRadius: 8,
                background: '#3B6D11', color: '#EAF3DE',
                border: 'none', cursor: 'pointer', fontSize: 12,
                fontWeight: 600, whiteSpace: 'nowrap',
              }}>🔍 검색</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">계약 시작일</label>
              <input type="date" placeholder="계약 시작일" value={form.contract_start}
                onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">계약 만료일</label>
              <input type="date" placeholder="계약 만료일" value={form.contract_end}
                onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">보증금 (만원)</label>
              <input type="number" placeholder="보증금 (만원)" value={form.deposit}
                onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">월세 (만원)</label>
              <input type="number" placeholder="월세 (만원)" value={form.monthly_rent}
                onChange={e => setForm(f => ({ ...f, monthly_rent: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">계약 특이사항</label>
            <textarea placeholder="특이사항 입력" value={form.contract_note}
              onChange={e => setForm(f => ({ ...f, contract_note: e.target.value }))}
              style={{ height: 70 }} />
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary"
            style={{ background: '#3B6D11', height: 44, fontSize: 15, marginBottom: 8 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 카드 ──────────────────────────────
function HousingCard({ r, exceptions, onApproval, onContract, onReset, onDelete, onRefresh }) {
  const st = STATUS_STYLE[r.status] || STATUS_STYLE['신청'];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isException = exceptions.some(e => e.emp_no === r.emp_no);

  useEffect(() => {
    function h(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, []);

  const dateStr = r.created_at?.split?.('T')[0] || '';
  const contractEnd = r.contract_end ? new Date(r.contract_end) : null;
  const daysLeft = contractEnd ? Math.ceil((contractEnd - new Date()) / (1000*60*60*24)) : null;
  const expiryColor = daysLeft !== null ? (daysLeft <= 60 ? '#A32D2D' : daysLeft <= 90 ? '#854F0B' : daysLeft <= 180 ? '#7A6B00' : null) : null;

  return (
    <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderLeft: `4px solid ${st.color}`, borderRadius: 12, padding: '14px 16px' }}>
      {/* 상단 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>· {r.emp_no}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{r.status}</span>
          {isException && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#FAEEDA', color: '#854F0B' }}>⭐ 특인</span>
          )}
        </div>
        {/* 햄버거: 비번초기화/삭제만 */}
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--text2)', fontSize: 18 }}>⋮</button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 130 }}>
              <button onClick={() => { onReset(r); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#854F0B', fontFamily: 'inherit', borderBottom: '0.5px solid var(--border)' }}>🔑 비번 초기화</button>
              <button onClick={() => { onDelete(r); setMenuOpen(false); }} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: '#A32D2D', fontFamily: 'inherit' }}>🗑️ 삭제</button>
            </div>
          )}
        </div>
      </div>

      {/* 기본 정보 */}
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 10 }}>
        <div>🏢 {r.org_name || '-'} ({r.headquarters})</div>
        <div>🏠 거주지: {r.home_address}</div>
        {r.distance_km && <div>📏 {r.distance_km} km</div>}
        <div>📅 신청일: {dateStr}</div>
      </div>

      {/* 계약 정보 */}
      {r.housing_address && (
        <div style={{ background: '#EAF3DE', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: '#3B6D11', marginBottom: 4 }}>📋 계약 정보</div>
          <div>📍 {r.housing_address}</div>
          {r.contract_start && <div>📆 {r.contract_start?.split?.('T')[0]} ~ {r.contract_end?.split?.('T')[0]}</div>}
          {expiryColor && <div style={{ color: expiryColor, fontWeight: 600 }}>⚠️ 만료 D-{daysLeft}</div>}
          {r.deposit && <div>💰 보증금 {Number(r.deposit).toLocaleString()}만원 / 월세 {Number(r.monthly_rent).toLocaleString()}만원</div>}
          {r.contract_note && <div>📝 {r.contract_note}</div>}
        </div>
      )}

      {/* 담당자 코멘트 */}
      {r.manager_comment && (
        <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: 'var(--text2)' }}>💬 코멘트: </span>{r.manager_comment}
        </div>
      )}

      {/* 보완사항 */}
      {r.supplement && (
        <div style={{ background: '#F5E8F8', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: '#7B2D8B' }}>📨 보완사항: </span>{r.supplement}
        </div>
      )}

      {/* 결재 + 계약정보 버튼 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={() => onApproval(r)} style={{
          flex: 1, height: 36, borderRadius: 8,
          background: '#E8F0FB', color: '#1A4A8A',
          border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>✅ 결재</button>
        <button onClick={() => onContract(r)} style={{
          flex: 1, height: 36, borderRadius: 8,
          background: '#EAF3DE', color: '#3B6D11',
          border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>📋 계약정보</button>
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────
export default function HousingMgmt() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filterStatus, setFilterStatus] = useState('전체');
  const [showException, setShowException] = useState(false);
  const [approvalModal, setApprovalModal] = useState(null);
  const [contractModal, setContractModal] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [data, excs] = await Promise.all([api.getHousingRequests(), api.getHousingExceptions()]);
    setRequests(data);
    setExceptions(excs);
    setLoading(false);
  }

  async function handleReset(r) { await api.resetHousingPassword(r.id); setToast('비밀번호가 1111로 초기화되었습니다.'); }
  async function handleDelete(r) { await api.deleteHousingRequest(r.id); setToast('삭제되었습니다.'); load(); }

  const filtered = filterStatus === '전체' ? requests : requests.filter(r => r.status === filterStatus);
  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: requests.filter(r => r.status === s).length }), {});

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">사택 신청 관리</div>
        <button onClick={() => setShowException(true)} style={{
          fontSize: 12, padding: '5px 10px', borderRadius: 8,
          background: '#FAEEDA', color: '#854F0B', border: 'none', cursor: 'pointer', fontWeight: 600,
        }}>⭐ 특인</button>
      </div>

      {/* 현황 */}
      <div style={{ padding: '12px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
        {STATUSES.map(s => {
          const st = STATUS_STYLE[s];
          return (
            <div key={s} style={{ background: st.bg, borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: st.color }}>{counts[s] || 0}</div>
              <div style={{ fontSize: 9, color: st.color }}>{s}</div>
            </div>
          );
        })}
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', borderBottom: '0.5px solid var(--border)' }}>
        {['전체', ...STATUSES].map(s => {
          const st = STATUS_STYLE[s];
          const active = filterStatus === s;
          return (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: '5px 12px', borderRadius: 20, border: 'none',
              background: active ? (st?.bg || 'var(--bg2)') : 'var(--bg2)',
              color: active ? (st?.color || 'var(--text)') : 'var(--text2)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}>{s}</button>
          );
        })}
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && filtered.length === 0 && <div className="center-msg">신청 내역이 없습니다.</div>}
        {filtered.map(r => (
          <HousingCard key={r.id} r={r} exceptions={exceptions}
            onApproval={r => setApprovalModal(r)}
            onContract={r => setContractModal(r)}
            onReset={handleReset}
            onDelete={r => { handleDelete(r); }}
            onRefresh={load}
          />
        ))}
      </div>

      {showException && <ExceptionModal onClose={() => { setShowException(false); load(); }} setToast={setToast} />}
      {approvalModal && <ApprovalModal request={approvalModal} onClose={() => setApprovalModal(null)} onDone={msg => { setToast(msg); setApprovalModal(null); load(); }} />}
      {contractModal && <ContractModal request={contractModal} onClose={() => setContractModal(null)} onDone={msg => { setToast(msg); setContractModal(null); load(); }} />}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
