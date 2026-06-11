import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// 두 날짜 사이 개월수(M)와 잔여일수(D) 계산 - 엑셀 DATEDIF 방식
function calcMonthsAndDays(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr);
  // 종료일 +1일 처리 (엑셀 DATEDIF 방식)
  const end = new Date(endStr);
  end.setDate(end.getDate() + 1);
  if (end <= start) return null;

  // DATEDIF "m" - 완전한 개월수
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const tempDate = new Date(start);
  tempDate.setMonth(tempDate.getMonth() + months);
  if (tempDate > end) months -= 1;

  // DATEDIF "md" - 개월 나머지 일수
  const tempDate2 = new Date(start);
  tempDate2.setMonth(tempDate2.getMonth() + months);
  let remainDays = Math.round((end - tempDate2) / (1000 * 60 * 60 * 24));
  if (remainDays < 0) remainDays = 0;

  // 해당 종료월 일수 (일할 분모) - end의 월 일수
  const daysInMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();

  // 일할계산값 = ROUNDDOWN(D/C, 3)
  const fraction = Math.floor((remainDays / daysInMonth) * 1000) / 1000;

  // 합산 = ROUNDDOWN(M + D/C, 3)
  const total = Math.floor((months + fraction) * 1000) / 1000;

  return { months, remainDays, daysInMonth, fraction, total };
}

// 잔여개월 기준 예상종료일 - 엑셀 방식
// V5 = Q5 + ROUNDDOWN(O5*U5, 0)
// Q5 = 예상시작일 + 정수개월, O5 = 소수부분, U5 = Q5 달의 일수
function calcEndDate(startStr, remainMonths) {
  if (!startStr || remainMonths <= 0) return null;
  const start = new Date(startStr);

  const fullMonths = Math.floor(remainMonths);         // 정수 개월 (n)
  const fraction = remainMonths - fullMonths;           // 소수 부분 (o)

  // Q5: 예상시작일 + 정수개월 - 1일 (엑셀 방식)
  const q = new Date(start);
  q.setMonth(q.getMonth() + fullMonths);
  q.setDate(q.getDate() - 1);

  // U5: Q5 달의 일수 (1월이면 31)
  const daysInMonth = new Date(q.getFullYear(), q.getMonth() + 1, 0).getDate();

  // V5 = Q5 + ROUNDDOWN(O5 * U5, 0)
  const extraDays = Math.floor(fraction * daysInMonth);
  const end = new Date(q);
  end.setDate(end.getDate() + extraDays);

  return end.toISOString().split('T')[0];
}

function fmt(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

const EMPTY_PERIOD = { start: '', end: '' };

export default function ParentalLeaveCalc() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  // URL 파라미터에서 기간 데이터 로드
  const initPeriods = () => {
    try {
      const raw = searchParams.get('periods');
      if (raw) {
        const parsed = JSON.parse(raw);
        const filled = parsed.map(p => ({ start: p.start || '', end: p.end || '' }));
        while (filled.length < 9) filled.push({ start: '', end: '' });
        return filled.slice(0, 9);
      }
    } catch {}
    return Array.from({length: 9}, () => ({ start:'', end:'' }));
  };

  const fromName = searchParams.get('emp_name') || '';
  const fromChild = searchParams.get('child') || '';

  const [spouseUsed, setSpouseUsed] = useState(false);
  const [periods, setPeriods] = useState(initPeriods);
  const [expectedStart, setExpectedStart] = useState('');

  const maxMonths = spouseUsed ? 18 : 12;

  // 각 회차 계산
  const calcResults = periods.map(p => calcMonthsAndDays(p.start, p.end));

  // 총 사용기간
  const totalUsed = calcResults.reduce((sum, r) => sum + (r?.total || 0), 0);
  const remaining = Math.max(0, maxMonths - totalUsed);
  const isOver = totalUsed > maxMonths;

  // 예상 종료일
  const expectedEnd = calcEndDate(expectedStart, remaining);

  function updatePeriod(idx, key, val) {
    setPeriods(p => p.map((item, i) => i === idx ? { ...item, [key]: val } : item));
  }

  function formatMonths(val) {
    const m = Math.floor(val);
    const d = val - m;
    if (d === 0) return `${m}개월`;
    const daysInMonth = 30;
    const days = Math.round(d * daysInMonth);
    return `${m}개월 ${days}일`;
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav(window.location.pathname.startsWith('/field') ? '/field' : '/hr-calc')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">👶 육아휴직 계산기</div>
        {!window.location.pathname.startsWith("/field") && <button onClick={() => nav("/attendance-app")} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "#FAEEDA", color: "#854F0B", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>근태관리</button>}
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

      {fromName && (
        <div style={{ margin: '0 16px', padding: '10px 14px', background: '#EAF3DE', borderRadius: 10, fontSize: 12, color: '#3B6D11', fontWeight: 600 }}>
          📋 {fromName} · {fromChild} 기간 자동 입력됨
        </div>
      )}

        {/* 배우자 사용 여부 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>배우자 육아휴직 사용 여부</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.6 }}>
            배우자가 3개월 이상 육아휴직 사용 시 본인 육아휴직 기간이 6개월 추가됩니다.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { val: false, label: '미사용 (12개월)', icon: '👤' },
              { val: true,  label: '3개월 이상 사용 (18개월)', icon: '👫' },
            ].map(opt => (
              <button key={String(opt.val)} type="button" onClick={() => setSpouseUsed(opt.val)} style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${spouseUsed === opt.val ? '#3B6D11' : 'var(--border)'}`,
                background: spouseUsed === opt.val ? '#EAF3DE' : 'var(--bg)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                fontFamily: 'inherit',
              }}>
                <div style={{ fontSize: 24 }}>{opt.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: spouseUsed === opt.val ? '#3B6D11' : 'var(--text2)', textAlign: 'center', lineHeight: 1.4 }}>{opt.label}</div>
              </button>
            ))}
          </div>
        </section>

        {/* 사용기간 입력 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>육아휴직 사용기간 입력</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {periods.map((p, i) => {
              const r = calcResults[i];
              const hasData = p.start && p.end;
              return (
                <div key={i} style={{
                  background: 'var(--bg)', border: `0.5px solid ${hasData && r ? '#3B6D11' : 'var(--border)'}`,
                  borderRadius: 10, padding: '8px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', width: 30, flexShrink: 0 }}>{i+1}회차</div>
                    <input type="date" value={p.start} onChange={e => updatePeriod(i, 'start', e.target.value)}
                      style={{ flex: 1, height: 34, fontSize: 12, padding: '0 8px' }} />
                    <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>~</span>
                    <input type="date" value={p.end} onChange={e => updatePeriod(i, 'end', e.target.value)}
                      style={{ flex: 1, height: 34, fontSize: 12, padding: '0 8px' }} />
                  </div>
                  {hasData && r && (
                    <div style={{ marginTop: 5, fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#3B6D11', fontWeight: 600 }}>
                        ✓ {r.months}개월 {r.remainDays}일 = {r.total.toFixed(3)}개월
                      </span>
                      <span style={{ color: 'var(--text2)', fontSize: 10 }}>
                        ({r.months} + {r.remainDays}/{r.daysInMonth})
                      </span>
                    </div>
                  )}
                  {hasData && !r && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#A32D2D' }}>⚠️ 종료일이 시작일보다 빠릅니다</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 결과 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>계산 결과</div>
          <div style={{ background: isOver ? '#FCEBEB' : '#EAF3DE', border: `1px solid ${isOver ? '#A32D2D' : '#3B6D11'}20`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>총 사용기간</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: isOver ? '#A32D2D' : '#3B6D11' }}>{totalUsed.toFixed(3)}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>개월</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>잔여기간</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: isOver ? '#A32D2D' : '#1A4A8A' }}>{remaining.toFixed(3)}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>개월</div>
              </div>
            </div>

            {/* 합산 산식 */}
            {totalUsed > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: 'var(--text2)', lineHeight: 1.8 }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>📐 산식</div>
                {calcResults.map((r, i) => r ? (
                  <div key={i}>{i+1}회차: {r.months} + {r.remainDays}/{r.daysInMonth} = {r.total.toFixed(3)}</div>
                ) : null)}
                <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', marginTop: 4, paddingTop: 4, fontWeight: 600, color: isOver ? '#A32D2D' : '#3B6D11' }}>
                  합계: {calcResults.filter(r=>r).map(r => r.total.toFixed(3)).join(' + ')} = {totalUsed.toFixed(3)}개월
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '8px 0', borderTop: `0.5px solid ${isOver ? '#A32D2D' : '#3B6D11'}30` }}>
              {isOver
                ? `⚠️ 최대 사용기간(${maxMonths}개월) 초과!`
                : totalUsed === 0
                  ? `최대 ${maxMonths}개월 사용 가능`
                  : `✅ ${maxMonths}개월 이내 (${(maxMonths - totalUsed).toFixed(3)}개월 남음)`
              }
            </div>
          </div>
        </section>

        {/* 잔여기간 모의계산 */}
        {remaining > 0 && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>잔여기간 모의계산</div>
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">예상 시작일</label>
                <input type="date" value={expectedStart} onChange={e => setExpectedStart(e.target.value)} />
              </div>
              {expectedEnd && (
                <div style={{ background: '#E8F0FB', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>예상 종료일</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1A4A8A' }}>{fmt(expectedEnd)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                    {fmt(expectedStart)} ~ {fmt(expectedEnd)} ({remaining.toFixed(3)}개월)
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 유의사항 */}
        <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.7 }}>
          ※ 본 계산기는 참고용이며, 실제 사용기간과 일부 오차가 발생할 수 있습니다.<br/>
          ※ 월력 기준으로 계산됩니다. (노동부 기준)
        </div>

      </div>
    </div>
  );
}
