import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const LEAVE_TYPES = [
  { label: '질병휴직', maxDays: 180 },
  { label: '난임휴직', maxDays: 180 },
  { label: '가족돌봄휴직', maxDays: 90 },
  { label: '가족돌봄휴가', maxDays: 10 },
  { label: '질병휴가', maxDays: 60 },
];

const EMPTY_PERIOD = { start: '', end: '' };

function calcDays(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (end < start) return null;
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

export default function LeaveCalc() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  const initData = () => {
    try {
      const raw = searchParams.get('periods');
      const type = searchParams.get('type') || '';
      if (raw) {
        const parsed = JSON.parse(raw);
        const filled = parsed.map(p => ({ start: p.start || '', end: p.end || '' }));
        while (filled.length < 5) filled.push({ start: '', end: '' });
        return { periods: filled.slice(0, 5), type };
      }
    } catch {}
    return { periods: [EMPTY_PERIOD,EMPTY_PERIOD,EMPTY_PERIOD,EMPTY_PERIOD,EMPTY_PERIOD], type: '' };
  };

  const init = initData();
  const fromName = searchParams.get('emp_name') || '';

  const [leaveType, setLeaveType] = useState(init.type);
  const [periods, setPeriods] = useState(init.periods);
  const [expectedStart, setExpectedStart] = useState('');
  const [familyHolidayDays, setFamilyHolidayDays] = useState(0); // 가족돌봄휴직 시 휴가 차감일

  const maxDays = LEAVE_TYPES.find(t => t.label === leaveType)?.maxDays || 0;
  const isFamilyLeave = leaveType === '가족돌봄휴직';

  function updatePeriod(idx, key, val) {
    setPeriods(p => p.map((item, i) => i === idx ? { ...item, [key]: val } : item));
  }

  const dayResults = periods.map(p => calcDays(p.start, p.end));
  const totalUsed = dayResults.reduce((sum, d) => sum + (d || 0), 0);
  const deduct = isFamilyLeave ? Number(familyHolidayDays) || 0 : 0;
  const remaining = Math.max(0, maxDays - totalUsed - deduct);
  const isOver = maxDays > 0 && (totalUsed + deduct) > maxDays;

  // 예상 종료일: 예상시작일 + 잔여일수 - 1
  const expectedEnd = expectedStart && remaining > 0 ? (() => {
    const d = new Date(expectedStart);
    d.setDate(d.getDate() + remaining - 1);
    return d.toISOString().split('T')[0];
  })() : null;

  function fmt(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/hr-calc')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">📋 휴가·휴직 잔여기간</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

      {fromName && (
        <div style={{ margin: '0 16px', padding: '10px 14px', background: '#FCEBEB', borderRadius: 10, fontSize: 12, color: '#A32D2D', fontWeight: 600 }}>
          📋 {fromName} · {leaveType} 기간 자동 입력됨
        </div>
      )}

        {/* 구분 선택 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>휴가·휴직 구분</div>
          <select value={leaveType} onChange={e => { setLeaveType(e.target.value); setPeriods([EMPTY_PERIOD,EMPTY_PERIOD,EMPTY_PERIOD,EMPTY_PERIOD,EMPTY_PERIOD]); setExpectedStart(''); }}
            style={{ fontSize: 14 }}>
            <option value="">선택하세요</option>
            {LEAVE_TYPES.map(t => (
              <option key={t.label} value={t.label}>{t.label} (최대 {t.maxDays}일)</option>
            ))}
          </select>
          {leaveType && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
              📌 {leaveType} 최대 사용기간: <strong>{maxDays}일</strong>
              {isFamilyLeave && <span style={{ color: '#A32D2D' }}> (같은 연도 가족돌봄휴가 사용일 차감)</span>}
            </div>
          )}
          {isFamilyLeave && (
            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">같은 연도 가족돌봄휴가 사용일수</label>
              <input type="number" placeholder="0" min="0" max="10"
                value={familyHolidayDays}
                onChange={e => setFamilyHolidayDays(e.target.value)}
                style={{ width: '100%' }} />
            </div>
          )}
        </section>

        {/* 사용기간 입력 */}
        {leaveType && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>사용기간 입력</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {periods.map((p, i) => {
                const days = dayResults[i];
                const hasData = p.start && p.end;
                return (
                  <div key={i} style={{
                    background: 'var(--bg)', border: `0.5px solid ${hasData && days ? '#854F0B' : 'var(--border)'}`,
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
                    {hasData && days && (
                      <div style={{ marginTop: 5, fontSize: 11, color: '#854F0B', fontWeight: 600 }}>
                        ✓ {days}일
                      </div>
                    )}
                    {hasData && !days && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#A32D2D' }}>⚠️ 종료일이 시작일보다 빠릅니다</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 결과 */}
        {leaveType && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>계산 결과</div>
            <div style={{ background: isOver ? '#FCEBEB' : '#FAEEDA', border: `1px solid ${isOver ? '#A32D2D' : '#854F0B'}20`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>총 사용일수</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: isOver ? '#A32D2D' : '#854F0B' }}>{totalUsed}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>일</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>잔여일수</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: isOver ? '#A32D2D' : '#1A4A8A' }}>{remaining}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>일</div>
                </div>
              </div>

              {/* 산식 */}
              {totalUsed > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: 'var(--text2)', lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>📐 산식</div>
                  {dayResults.map((d, i) => d ? (
                    <div key={i}>{i+1}회차: {periods[i].start} ~ {periods[i].end} = {d}일</div>
                  ) : null)}
                  <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', marginTop: 4, paddingTop: 4, fontWeight: 600, color: isOver ? '#A32D2D' : '#854F0B' }}>
                    합계: {dayResults.filter(d=>d).join(' + ')} = {totalUsed}일
                    {isFamilyLeave && deduct > 0 && ` + 휴가 ${deduct}일`} / 최대 {maxDays}일
                  </div>
                </div>
              )}

              <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, padding: '8px 0', borderTop: `0.5px solid ${isOver ? '#A32D2D' : '#854F0B'}30` }}>
                {isOver
                  ? `⚠️ 최대 사용기간(${maxDays}일) 초과!`
                  : totalUsed === 0 && deduct === 0
                    ? `최대 ${maxDays}일 사용 가능`
                    : `✅ ${maxDays}일 이내 (${remaining}일 남음${deduct > 0 ? `, 휴가 ${deduct}일 차감` : ''})`
                }
              </div>
            </div>
          </section>
        )}

        {/* 잔여기간 모의계산 */}
        {leaveType && remaining > 0 && (
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
                    {fmt(expectedStart)} ~ {fmt(expectedEnd)} ({remaining}일)
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 유의사항 */}
        {leaveType && (
          <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.7 }}>
            ※ 본 계산기는 참고용이며, 실제 사용기간과 일부 오차가 발생할 수 있습니다.<br/>
            ※ 일력 기준으로 계산됩니다.
          </div>
        )}
      </div>
    </div>
  );
}
