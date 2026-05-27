import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TYPES = [
  { label: '일반', totalDays: 90, minPostDays: 45 },
  { label: '미숙아', totalDays: 100, minPostDays: 45 },
  { label: '다태아', totalDays: 120, minPostDays: 60 },
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
  const [usePrenatal, setUsePrenatal] = useState(false);
  const [prenatalStart, setPrenatalStart] = useState('');
  const [prenatalDays, setPrenatalDays] = useState('');

  const type = TYPES.find(t => t.label === typeLabel);
  const totalDays = type?.totalDays || 90;
  const minPostDays = type?.minPostDays || 45;

  // 출산전 사용일수
  const prenatalUsed = usePrenatal ? (Number(prenatalDays) || 0) : 0;
  const prenatalEnd = prenatalStart && prenatalUsed > 0
    ? addDays(prenatalStart, prenatalUsed - 1) : null;

  // 출산후 사용가능일수
  const postDays = totalDays - prenatalUsed;

  // 출산후 종료일: 출산일 기준
  const postEnd = birthDate ? addDays(birthDate, postDays - 1) : null;

  // 출산후 실제 사용일수 (출산일 ~ 종료일)
  const actualPostDays = birthDate && postEnd ? diffDays(birthDate, postEnd) : null;

  // 45일/60일 이상 여부
  const postOk = actualPostDays !== null && actualPostDays >= minPostDays;

  // 유급기간 (최초 60일 or 다태아 75일 - 고용보험 기준)
  const paidDays = typeLabel === '다태아' ? 75 : 60;
  const paidEnd = birthDate
    ? addDays(prenatalStart || birthDate, paidDays - 1)
    : prenatalStart ? addDays(prenatalStart, paidDays - 1) : null;

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/hr-calc')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">🤰 출산전후휴가 계산기</div>
        <div style={{ width: 40 }} />
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
            📌 총 {totalDays}일 · 출산 후 {minPostDays}일 이상 의무 사용
          </div>
        </section>

        {/* 출산일 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>출산일 (예정일)</div>
          <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
        </section>

        {/* 출산전 분리사용 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>출산전 분리사용</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[false, true].map(v => (
              <button key={String(v)} onClick={() => { setUsePrenatal(v); if (!v) { setPrenatalStart(''); setPrenatalDays(''); } }} style={{
                flex: 1, height: 40, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                border: `2px solid ${usePrenatal === v ? '#1A4A8A' : 'var(--border)'}`,
                background: usePrenatal === v ? '#E8F0FB' : 'var(--bg)',
                color: usePrenatal === v ? '#1A4A8A' : 'var(--text2)',
                fontSize: 13, fontWeight: 700,
              }}>{v ? '분리사용' : '미사용'}</button>
            ))}
          </div>

          {usePrenatal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">출산전 시작일</label>
                  <input type="date" value={prenatalStart} onChange={e => setPrenatalStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">출산전 사용일수</label>
                  <input type="number" placeholder="일수" min="1" max={totalDays - minPostDays}
                    value={prenatalDays} onChange={e => setPrenatalDays(e.target.value)} />
                </div>
              </div>
              {prenatalEnd && (
                <div style={{ fontSize: 12, color: '#1A4A8A', background: '#E8F0FB', borderRadius: 8, padding: '8px 12px' }}>
                  출산전 종료일: <strong>{fmt(prenatalEnd)}</strong>
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 6, padding: '6px 10px' }}>
                ※ 출산전 최대 사용가능: {totalDays - minPostDays}일 (출산후 {minPostDays}일 의무 확보)
              </div>
            </div>
          )}
        </section>

        {/* 결과 */}
        {birthDate && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>계산 결과</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* 요약 카드 */}
              <div style={{ background: '#E8F0FB', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>총 휴가일수</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: '#1A4A8A' }}>{totalDays}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>일</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>출산후 사용일수</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: postOk ? '#3B6D11' : '#A32D2D' }}>{postDays}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>일</div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '6px 0', borderTop: '0.5px solid #1A4A8A30', color: postOk ? '#3B6D11' : '#A32D2D' }}>
                  {postOk ? `✅ 출산후 ${minPostDays}일 이상 충족` : `⚠️ 출산후 ${minPostDays}일 미충족 (현재 ${postDays}일)`}
                </div>
              </div>

              {/* 상세 일정 */}
              <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
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
                <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#5C3D8F' }}>출산일</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#5C3D8F' }}>{fmt(birthDate)}</div>
                </div>
                <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#3B6D11' }}>출산후 휴가</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{postDays}일</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12 }}>
                    <div>{fmt(birthDate)}</div>
                    <div style={{ color: 'var(--text2)' }}>~ {fmt(postEnd)}</div>
                  </div>
                </div>
                <div style={{ padding: '12px 14px', background: 'var(--bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>유급기간</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{paidDays}일 (고용보험)</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12 }}>
                    <div>{fmt(usePrenatal && prenatalStart ? prenatalStart : birthDate)}</div>
                    <div style={{ color: 'var(--text2)' }}>~ {fmt(paidEnd)}</div>
                  </div>
                </div>
              </div>

              {/* 출산후 45일 체크 */}
              {birthDate && postEnd && (
                <div style={{ background: postOk ? '#EAF3DE' : '#FCEBEB', borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: postOk ? '#3B6D11' : '#A32D2D', marginBottom: 4 }}>
                    {postOk ? '✅' : '⚠️'} 출산후 {minPostDays}일 이상 여부
                  </div>
                  <div style={{ color: postOk ? '#3B6D11' : '#A32D2D' }}>
                    출산일({fmt(birthDate)}) ~ 종료일({fmt(postEnd)}) = {postDays}일
                    {postOk ? ` ≥ ${minPostDays}일 ✓` : ` < ${minPostDays}일 ✗`}
                  </div>
                </div>
              )}
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
