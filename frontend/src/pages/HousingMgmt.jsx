import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

const STATUSES = ['신청', '검토중', '보완요청', '승인', '반려'];
const STATUS_STYLE = {
  '신청':    { color: '#1A4A8A', bg: '#E8F0FB' },
  '검토중':  { color: '#854F0B', bg: '#FAEEDA' },
  '보완요청':{ color: '#7B2D8B', bg: '#F5E8F8' },
  '승인':    { color: '#3B6D11', bg: '#EAF3DE' },
  '반려':    { color: '#A32D2D', bg: '#FCEBEB' },
};

const EMPTY_CONTRACT = { housing_address: '', contract_start: '', contract_end: '', contract_note: '', deposit: '', monthly_rent: '' };

function ExceptionModal({ onClose, toast, setToast }) {
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
      setToast('예외 대상이 등록되었습니다.');
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
        <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>⭐ 특인 대상 관리</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 추가 폼 */}
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

          {/* 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13, padding: 16 }}>등록된 특인 대상이 없습니다.</div>}
            {list.map(e => (
              <div key={e.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderLeft: '3px solid #854F0B', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.emp_name} <span style={{ fontSize: 12, color: 'var(--text2)' }}>· {e.emp_no}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{e.reason}</div>
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

function StatusModal({ request, onClose, onDone }) {
  const [status, setStatus] = useState('');
  const [comment, setComment] = useState('');
  const [contract, setContract] = useState(EMPTY_CONTRACT);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!status) return;
    setSaving(true);
    try {
      const body = { status, manager_comment: comment };
      if (status === '승인') Object.assign(body, contract);
      await api.updateHousingStatus(request.id, body);
      onDone('상태가 변경되었습니다.');
    } catch (e) { } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>상태 변경 — {request.emp_name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 상태 선택 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUSES.filter(s => s !== request.status).map(s => {
              const st = STATUS_STYLE[s];
              return (
                <button key={s} onClick={() => setStatus(s)} style={{
                  padding: '7px 14px', borderRadius: 20, border: `2px solid ${status === s ? st.color : 'transparent'}`,
                  background: st.bg, color: st.color, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>{s}</button>
              );
            })}
          </div>

          {/* 담당자 코멘트 */}
          <div className="form-group">
            <label className="form-label">담당자 코멘트</label>
            <textarea placeholder="지시/승인/반려 내용 입력" value={comment} onChange={e => setComment(e.target.value)} style={{ height: 80 }} />
          </div>

          {/* 승인 시 계약 정보 */}
          {status === '승인' && (
            <div style={{ background: '#EAF3DE', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#3B6D11' }}>📋 계약 정보 입력</div>
              <div className="form-group">
                <label className="form-label">사택 주소</label>
                <input type="text" placeholder="사택 주소" value={contract.housing_address} onChange={e => setContract(c => ({ ...c, housing_address: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">계약 시작일</label>
                  <input type="date" value={contract.contract_start} onChange={e => setContract(c => ({ ...c, contract_start: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">계약 만료일</label>
                  <input type="date" value={contract.contract_end} onChange={e => setContract(c => ({ ...c, contract_end: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">보증금 (만원)</label>
                  <input type="number" placeholder="0" value={contract.deposit} onChange={e => setContract(c => ({ ...c, deposit: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">월세 (만원)</label>
                  <input type="number" placeholder="0" value={contract.monthly_rent} onChange={e => setContract(c => ({ ...c, monthly_rent: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">계약 특이사항</label>
                <textarea placeholder="특이사항 입력" value={contract.contract_note} onChange={e => setContract(c => ({ ...c, contract_note: e.target.value }))} style={{ height: 60 }} />
              </div>
            </div>
          )}

          <button onClick={handleSave} disabled={!status || saving} className="btn-primary" style={{ marginBottom: 8 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HousingCard({ r, onAction }) {
  const st = STATUS_STYLE[r.status] || STATUS_STYLE['신청'];
  const [menuOpen, setMenuOpen] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const menuRef = useRef(null);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{r.emp_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 6 }}>· {r.emp_no}</span>
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{r.status}</span>
        </div>
        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--text2)', fontSize: 18 }}>⋮</button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 140 }}>
              {[
                { label: '✏️ 상태 변경', action: () => { onAction('status', r); setMenuOpen(false); } },
                { label: '📋 계약정보 수정', action: () => { setShowContract(s => !s); setMenuOpen(false); } },
                { label: '🔑 비번 초기화', action: () => { onAction('reset', r); setMenuOpen(false); }, color: '#854F0B' },
                { label: '🗑️ 삭제', action: () => { onAction('delete', r); setMenuOpen(false); }, color: '#A32D2D' },
              ].map((item, i) => (
                <button key={i} onClick={item.action} style={{ display: 'block', width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', fontSize: 13, cursor: 'pointer', color: item.color || 'var(--text)', fontFamily: 'inherit', borderBottom: i < 3 ? '0.5px solid var(--border)' : 'none' }}>{item.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 8 }}>
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
        <div style={{ background: '#F5E8F8', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
          <span style={{ fontWeight: 600, color: '#7B2D8B' }}>📨 보완사항: </span>{r.supplement}
        </div>
      )}

      {/* 계약정보 수정 폼 */}
      {showContract && <ContractForm request={r} onDone={(msg) => { onAction('refresh'); setShowContract(false); }} />}
    </div>
  );
}

function ContractForm({ request, onDone }) {
  const [form, setForm] = useState({
    housing_address: request.housing_address || '',
    contract_start: request.contract_start?.split?.('T')[0] || '',
    contract_end: request.contract_end?.split?.('T')[0] || '',
    contract_note: request.contract_note || '',
    deposit: request.deposit || '',
    monthly_rent: request.monthly_rent || '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await api.updateHousingContract(request.id, form);
    setSaving(false);
    onDone('계약정보가 수정되었습니다.');
  }

  return (
    <div style={{ background: '#EAF3DE', borderRadius: 10, padding: 12, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#3B6D11' }}>📋 계약정보 수정</div>
      <input type="text" placeholder="사택 주소" value={form.housing_address} onChange={e => setForm(f => ({ ...f, housing_address: e.target.value }))} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input type="date" value={form.contract_start} onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))} />
        <input type="date" value={form.contract_end} onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input type="number" placeholder="보증금(만원)" value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: e.target.value }))} />
        <input type="number" placeholder="월세(만원)" value={form.monthly_rent} onChange={e => setForm(f => ({ ...f, monthly_rent: e.target.value }))} />
      </div>
      <textarea placeholder="특이사항" value={form.contract_note} onChange={e => setForm(f => ({ ...f, contract_note: e.target.value }))} style={{ height: 60 }} />
      <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ background: '#3B6D11', height: 36 }}>
        {saving ? '저장 중...' : '저장'}
      </button>
    </div>
  );
}

export default function HousingMgmt() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [filterStatus, setFilterStatus] = useState('전체');
  const [showException, setShowException] = useState(false);
  const [statusModal, setStatusModal] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await api.getHousingRequests();
    setRequests(data);
    setLoading(false);
  }

  async function handleAction(type, r) {
    if (type === 'status') { setStatusModal(r); return; }
    if (type === 'reset') { await api.resetHousingPassword(r.id); setToast('비밀번호가 1111로 초기화되었습니다.'); return; }
    if (type === 'delete') { await api.deleteHousingRequest(r.id); setToast('삭제되었습니다.'); load(); return; }
    if (type === 'refresh') { load(); }
  }

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
          background: '#FAEEDA', color: '#854F0B',
          border: 'none', cursor: 'pointer', fontWeight: 600,
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
          <HousingCard key={r.id} r={r} onAction={(type, item) => {
            if (type === 'refresh') { load(); return; }
            handleAction(type, item || r);
          }} />
        ))}
      </div>

      {showException && <ExceptionModal onClose={() => setShowException(false)} toast={toast} setToast={setToast} />}
      {statusModal && (
        <StatusModal request={statusModal} onClose={() => setStatusModal(null)}
          onDone={(msg) => { setToast(msg); setStatusModal(null); load(); }} />
      )}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
