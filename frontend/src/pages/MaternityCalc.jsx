import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TYPES = [
  { label: '일반', totalDays: 90, minPostDays: 45, paidDays: 60 },
  { label: '미숙아', totalDays: 100, minPostDays: 45, paidDays: 60 },
  { label: '다태아', totalDays: 120, minPostDays: 60, paidDays: 75 },
];

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function diffDays(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const diff = Math.ceil((new Date(endStr) - new Date(startStr)) / (1000*60*60*24)) + 1;
  return diff > 0 ? diff : null;
}

function fmt(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} (${days[d.getDay()]})`;
}

export default function MaternityCalc() {
  const nav = useNavigate();
  const [typeLabel, setTypeLabel] = useState('일반');
  const [birthDate, setBirthDate] = useState('');
  const [startDate, setStartDate] = useState('');   // 전체 시작일 (미분리 시)
  const [usePrenatal, setUsePrenatal] = useState(false);
  const [prenatalStart, setPrenatalStart] = useState('');
  const [postStart, setPostStart] = useState('');
  const [prenatalDays, setPrenatalDays] = useState('');

  const type = TYPES.find(t => t.label === typeLabel);
  const totalDays = type?.totalDays || 90;
  const minPostDays = type?.minPostDays || 45;
  const paidDays = type?.paidDays || 60;

  // prenatalDays는 이제 출산전 종료일 (date string)
  const prenatalUsed = usePrenatal && prenatalStart && prenatalDays
    ? (diffDays(prenatalStart, prenatalDays) || 0) : 0;
  const prenatalEnd = prenatalDays || null; // 종료일 = 입력값
  const postDays = totalDays - prenatalUsed;

  // 전체 종료일
  const wholeStart = usePrenatal ? prenatalStart : startDate;
  const postActualStart = usePrenatal ? postStart : (startDate || birthDate);
  const wholeEnd = usePrenatal
    ? (postActualStart ? addDays(postActualStart, postDays - 1) : null)
    : (wholeStart ? addDays(wholeStart, totalDays - 1) : null);

  const actualPostDays = birthDate && wholeEnd ? diffDays(birthDate, wholeEnd) : postDays;
  const postOk = actualPostDays >= minPostDays;

  // 유급기간
  const paidStart = wholeStart || birthDate;
  const paidEnd = paidStart ? addDays(paidStart, paidDays - 1) : null;

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav(window.location.pathname.startsWith('/field') ? '/field' : '/hr-calc')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">🤰 출산전후휴가 계산기</div>
        <button onClick={() => nav("/attendance-app")} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "#FAEEDA", color: "#854F0B", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>근태관리</button>
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* 구분 선택 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>구분 선택</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {TYPES.map(t => (
              <button key={t.label} onClick={() => setTypeLabel(t.label)} style={{
                flex: 1, padding: '10px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: `2px solid ${typeLabel === t.label ? '#1A4A8A' : 'var(--border)'}`,
                background: typeLabel === t.label ? '#E8F0FB' : 'var(--bg)',
                color: typeLabel === t.label ? '#1A4A8A' : 'var(--text2)',
                fontSize: 13, fontWeight: 700, textAlign: 'center',
              }}>
                <div>{t.label}</div>
                <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>{t.totalDays}일</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
            📌 총 {totalDays}일 · 출산 후 {minPostDays}일 이상 의무 사용 · 유급 {paidDays}일
          </div>
        </section>

        {/* 출산전 분리사용 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>출산전 분리사용</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[false, true].map(v => (
              <button key={String(v)} onClick={() => { setUsePrenatal(v); setPrenatalStart(''); setPrenatalDays(''); setStartDate(''); }} style={{
                flex: 1, height: 40, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                border: `2px solid ${usePrenatal === v ? '#1A4A8A' : 'var(--border)'}`,
                background: usePrenatal === v ? '#E8F0FB' : 'var(--bg)',
                color: usePrenatal === v ? '#1A4A8A' : 'var(--text2)',
                fontSize: 13, fontWeight: 700,
              }}>{v ? '분리사용' : '미사용'}</button>
            ))}
          </div>

          {/* 미사용: 전체 시작일 */}
          {!usePrenatal && (
            <div className="form-group">
              <label className="form-label">휴가 시작일</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          )}

          {/* 분리사용: 출산전 기간 */}
          {usePrenatal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">출산전 시작일</label>
                  <input type="date" value={prenatalStart} onChange={e => setPrenatalStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">출산전 종료일</label>
                  <input type="date" value={prenatalDays} onChange={e => setPrenatalDays(e.target.value)} />
                </div>
              </div>
              {prenatalStart && prenatalDays && (
                <div style={{ fontSize: 12, color: '#1A4A8A', background: '#E8F0FB', borderRadius: 8, padding: '8px 12px' }}>
                  출산전 사용일수: <strong>{diffDays(prenatalStart, prenatalDays)}일</strong>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">출산후 휴가 시작일</label>
                <input type="date" value={postStart} onChange={e => setPostStart(e.target.value)} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 6, padding: '6px 10px' }}>
                ※ 출산전 최대 {totalDays - minPostDays}일 사용 가능 (출산후 {minPostDays}일 의무 확보)
              </div>
            </div>
          )}
        </section>

        {/* 출산일 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>출산일 (예정일)</div>
          <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
        </section>

        {/* 결과 */}
        {birthDate && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>계산 결과</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* 요약 */}
              <div style={{ background: '#E8F0FB', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>총 휴가일수</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#1A4A8A' }}>{totalDays}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>일</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>출산후 사용일수</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: postOk ? '#3B6D11' : '#A32D2D' }}>{actualPostDays}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>일</div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '6px 0', borderTop: '0.5px solid #1A4A8A30', color: postOk ? '#3B6D11' : '#A32D2D' }}>
                  {postOk ? `✅ 출산후 ${minPostDays}일 이상 충족` : `⚠️ 출산후 ${minPostDays}일 미충족 (현재 ${postDays}일)`}
                </div>
              </div>

              {/* 일정표 */}
              <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {!usePrenatal && startDate && (
                  <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1A4A8A' }}>휴가 시작일</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1A4A8A' }}>{fmt(startDate)}</div>
                  </div>
                )}
                {usePrenatal && prenatalStart && prenatalUsed > 0 && (
                  <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1A4A8A' }}>출산전 휴가</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{prenatalUsed}일</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12 }}>
                      <div>{fmt(prenatalStart)}</div>
                      <div style={{ color: 'var(--text2)' }}>~ {fmt(prenatalEnd)}</div>
                    </div>
                  </div>
                )}
                <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F5E8F8' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5C3D8F' }}>출산일</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5C3D8F' }}>{fmt(birthDate)}</div>
                </div>
                <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#3B6D11' }}>출산후 휴가</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{postDays}일</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12 }}>
                    <div>{fmt(postActualStart || birthDate)}</div>
                    <div style={{ color: 'var(--text2)' }}>~ {fmt(wholeEnd)}</div>
                  </div>
                </div>
                {paidEnd && (
                  <div style={{ padding: '12px 14px', background: 'var(--bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>유급기간</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{paidDays}일 (고용보험)</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12 }}>
                      <div>{fmt(paidStart)}</div>
                      <div style={{ color: 'var(--text2)' }}>~ {fmt(paidEnd)}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* 출산후 의무일수 체크 */}
              <div style={{ background: postOk ? '#EAF3DE' : '#FCEBEB', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: postOk ? '#3B6D11' : '#A32D2D' }}>
                  {postOk ? '✅' : '⚠️'} 출산후 {minPostDays}일 이상 여부
                </div>
                <div style={{ color: postOk ? '#3B6D11' : '#A32D2D', marginTop: 2 }}>
                  출산후 {actualPostDays}일 {postOk ? `≥ ${minPostDays}일 ✓` : `< ${minPostDays}일 ✗`}
                  {usePrenatal && prenatalUsed > 0 && ` (출산전 ${prenatalUsed}일 분리사용)`}
                </div>
              </div>
            </div>
          </section>
        )}

        <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.7 }}>
          ※ 출산전 분리사용 시 출산후 의무사용일수({minPostDays}일) 이상 확보 필요<br/>
          ※ 유급기간은 고용보험 기준이며 실제와 다를 수 있습니다.
        </div>
      </div>
    </div>
  );
}
