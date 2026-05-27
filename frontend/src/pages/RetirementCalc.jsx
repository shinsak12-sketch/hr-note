import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function ceil1(n) { return Math.ceil(n); }

function fmt(n) {
  if (!n && n !== 0) return '-';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

function calcTenure(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr);
  const end = new Date(endStr);
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  if (days < 0) { months--; days += new Date(end.getFullYear(), end.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }
  const totalDays = Math.ceil((end - start) / (1000*60*60*24));
  return { years, months, days, totalDays };
}

// 퇴사일 기준 3개월 구간 계산
function calc3MonthPeriods(endStr) {
  if (!endStr) return null;
  const end = new Date(endStr);

  // 전체 구간: 퇴사일 3개월 전 ~ 퇴사일 전날
  const periodEnd = new Date(end);
  periodEnd.setDate(periodEnd.getDate() - 1);

  const periodStart = new Date(end);
  periodStart.setMonth(periodStart.getMonth() - 3);

  // 월별 구간 분리
  const periods = [];
  let curYear = periodStart.getFullYear();
  let curMonth = periodStart.getMonth(); // 0-based

  while (true) {
    const monthFirstDay = new Date(curYear, curMonth, 1);
    const monthLastDay = new Date(curYear, curMonth + 1, 0);

    // 구간 시작: periodStart가 이 달 중간이면 그날부터, 아니면 1일부터
    const segStart = periodStart > monthFirstDay ? new Date(periodStart) : new Date(monthFirstDay);
    // 구간 끝: periodEnd가 이 달 중간이면 그날까지, 아니면 말일까지
    const segEnd = periodEnd < monthLastDay ? new Date(periodEnd) : new Date(monthLastDay);

    if (segStart > periodEnd) break;

    const segDays = Math.ceil((segEnd - segStart) / (1000*60*60*24)) + 1;
    const monthDays = monthLastDay.getDate();
    const isFull = segStart.getDate() === 1 && segEnd.getDate() === monthDays;

    periods.push({
      start: segStart.toISOString().split('T')[0],
      end: segEnd.toISOString().split('T')[0],
      days: segDays,
      monthDays,
      isFull,
      year: curYear,
      month: curMonth + 1,
    });

    // 다음 달로
    curMonth++;
    if (curMonth > 11) { curMonth = 0; curYear++; }

    if (new Date(curYear, curMonth, 1) > periodEnd) break;
  }

  const totalDays = periods.reduce((sum, p) => sum + p.days, 0);
  return { periods, totalDays, periodStart, periodEnd };
}

function fmtDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function calcRetirementTax(retirementPay, tenureYears) {
  const y = Math.max(1, Math.ceil(tenureYears));
  let tenureDeduct = 0;
  if (y <= 5) tenureDeduct = 300000 * y;
  else if (y <= 10) tenureDeduct = 1500000 + 500000 * (y - 5);
  else if (y <= 20) tenureDeduct = 4000000 + 800000 * (y - 10);
  else tenureDeduct = 12000000 + 1200000 * (y - 20);

  const converted = Math.max(0, (retirementPay - tenureDeduct)) * 12 / y;

  let convertedDeduct = 0;
  if (converted <= 8000000) convertedDeduct = converted;
  else if (converted <= 70000000) convertedDeduct = 8000000 + (converted - 8000000) * 0.6;
  else if (converted <= 140000000) convertedDeduct = 44800000 + (converted - 70000000) * 0.55;
  else if (converted <= 300000000) convertedDeduct = 83300000 + (converted - 140000000) * 0.45;
  else convertedDeduct = 155300000 + (converted - 300000000) * 0.35;

  const taxBase = Math.max(0, converted - convertedDeduct);

  let convertedTax = 0;
  if (taxBase <= 14000000) convertedTax = taxBase * 0.06;
  else if (taxBase <= 50000000) convertedTax = 840000 + (taxBase - 14000000) * 0.15;
  else if (taxBase <= 88000000) convertedTax = 6240000 + (taxBase - 50000000) * 0.24;
  else if (taxBase <= 150000000) convertedTax = 15360000 + (taxBase - 88000000) * 0.35;
  else if (taxBase <= 300000000) convertedTax = 37060000 + (taxBase - 150000000) * 0.38;
  else if (taxBase <= 500000000) convertedTax = 94060000 + (taxBase - 300000000) * 0.40;
  else convertedTax = 174060000 + (taxBase - 500000000) * 0.42;

  const incomeTax = Math.floor(convertedTax * y / 12);
  const localTax = Math.floor(incomeTax * 0.1);
  const totalTax = incomeTax + localTax;
  return { tenureDeduct, converted, convertedDeduct, taxBase, incomeTax, localTax, totalTax };
}

export default function RetirementCalc() {
  const nav = useNavigate();
  const [receiveType, setReceiveType] = useState('일시금');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [salary, setSalary] = useState({ basic: '', performance: '', qualification: '', bonus: '', annual: '' });

  function setS(k, v) { setSalary(s => ({ ...s, [k]: v })); }

  const tenure = startDate && endDate ? calcTenure(startDate, endDate) : null;
  const tenureYears = tenure ? tenure.totalDays / 365 : 0;
  const periodData = endDate ? calc3MonthPeriods(endDate) : null;

  // 월 급여 (1원 절상)
  const monthlyWage = (s) => s ? ceil1(Number(s.replace(/,/g,'')) / 12) : 0;
  const basicM = monthlyWage(salary.basic);
  const performanceM = monthlyWage(salary.performance);
  const qualificationM = monthlyWage(salary.qualification);
  const bonusM = monthlyWage(salary.bonus);
  const monthlyTotal = basicM + performanceM + qualificationM + bonusM;

  // 연차수당 3개월 산입
  const annualLeave = salary.annual ? Number(salary.annual.replace(/,/g,'')) : 0;
  const annualLeave3M = Math.floor(annualLeave / 12 * 3);

  // 구간별 임금 계산
  const periodWages = periodData?.periods.map(p => {
    const wage = p.isFull ? monthlyTotal : Math.floor(monthlyTotal * p.days / p.monthDays);
    return { ...p, wage };
  }) || [];

  const wage3M = periodWages.reduce((sum, p) => sum + p.wage, 0) + annualLeave3M;
  const totalDays3M = periodData?.totalDays || 89;

  const avgWage = totalDays3M > 0 ? wage3M / totalDays3M : 0;
  const retirementPay = tenure ? Math.floor(avgWage * 30 * tenure.totalDays / 365) : 0;
  const tax = retirementPay > 0 ? calcRetirementTax(retirementPay, tenureYears) : null;
  const netPay = tax ? retirementPay - tax.totalTax : retirementPay;

  const SALARY_ITEMS = [
    { key: 'basic', label: '기본급' },
    { key: 'performance', label: '성과급' },
    { key: 'qualification', label: '자격수당' },
    { key: 'bonus', label: '성과가급' },
  ];

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/hr-calc')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">💰 평균임금·퇴직금 계산기</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* 수령방법 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>수령 방법</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['일시금', 'IRP·DC 이전'].map(t => (
              <button key={t} onClick={() => setReceiveType(t)} style={{
                flex: 1, height: 42, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: `2px solid ${receiveType === t ? '#854F0B' : 'var(--border)'}`,
                background: receiveType === t ? '#FAEEDA' : 'var(--bg)',
                color: receiveType === t ? '#854F0B' : 'var(--text2)',
                fontSize: 13, fontWeight: 700,
              }}>{t}</button>
            ))}
          </div>
          {receiveType === 'IRP·DC 이전' && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#1A4A8A', background: '#E8F0FB', borderRadius: 8, padding: '8px 12px' }}>
              ℹ️ IRP·DC 이전 시 퇴직소득세 과세 이연 — 실제 수령 시점에 과세됩니다.
            </div>
          )}
        </section>

        {/* 재직기간 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>재직기간</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">입사일</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">퇴사일</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          {tenure && (
            <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', borderRadius: 8, padding: '8px 12px', marginTop: 4 }}>
              📅 {tenure.years}년 {tenure.months}개월 {tenure.days}일 ({tenure.totalDays.toLocaleString()}일)
            </div>
          )}
        </section>

        {/* 연봉 입력 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>연봉 입력</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10 }}>각 항목의 연간 금액 입력 (월급여 = 연봉÷12, 1원 절상)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SALARY_ITEMS.map(item => (
              <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>{item.label}</div>
                <input type="text" placeholder="연간 금액"
                  value={salary[item.key]}
                  onChange={e => setS(item.key, e.target.value)}
                  style={{ textAlign: 'right' }} />
                <div style={{ fontSize: 11, color: 'var(--text2)', width: 70, textAlign: 'right' }}>
                  {salary[item.key] ? fmt(ceil1(Number(salary[item.key].replace(/,/g,''))/12)) + '/월' : '-'}
                </div>
              </div>
            ))}
            <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>연차수당</div>
                <input type="text" placeholder="연간 총액"
                  value={salary.annual}
                  onChange={e => setS('annual', e.target.value)}
                  style={{ textAlign: 'right' }} />
                <div style={{ fontSize: 11, color: 'var(--text2)', width: 70, textAlign: 'right' }}>
                  {salary.annual ? `3개월: ${fmt(annualLeave3M)}` : '-'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 평균임금 계산 결과 */}
        {tenure && monthlyTotal > 0 && periodData && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>임금 총액 계산</div>
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {/* 구간별 임금 */}
              {periodWages.map((p, i) => (
                <div key={i} style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {fmtDate(p.start)} ~ {fmtDate(p.end)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {p.days}일{p.isFull ? ' (전체)' : ` (일할: ${p.days}/${p.monthDays}일)`}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(p.wage)}</div>
                </div>
              ))}
              {/* 연차수당 */}
              {annualLeave3M > 0 && (
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>연차수당 산입액</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>연간 ÷ 12 × 3</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(annualLeave3M)}</div>
                </div>
              )}
              {/* 합계 */}
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>임금 총액</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(wage3M)}</div>
              </div>
              <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>총 일수</div>
                <div style={{ fontSize: 13 }}>{totalDays3M}일</div>
              </div>
              <div style={{ padding: '12px 14px', background: '#FAEEDA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#854F0B' }}>일 평균임금</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#854F0B' }}>{fmt(avgWage)}</div>
              </div>
            </div>
          </section>
        )}

        {/* 퇴직금 */}
        {tenure && retirementPay > 0 && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>퇴직금</div>
            <div style={{ background: '#FAEEDA', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: '#854F0B', marginBottom: 8, lineHeight: 1.7 }}>
                평균임금 {fmt(avgWage)} × 30일 × {tenure.totalDays}일 ÷ 365
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#854F0B', textAlign: 'center' }}>
                {fmt(retirementPay)}
              </div>
            </div>
          </section>
        )}

        {/* 퇴직소득세 */}
        {tax && receiveType === '일시금' && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>퇴직소득세</div>
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {[
                { label: '퇴직급여', val: retirementPay },
                { label: '근속연수공제', val: -tax.tenureDeduct, sub: `${Math.ceil(tenureYears)}년` },
                { label: '환산급여', val: tax.converted, sub: '× 12 ÷ 근속연수' },
                { label: '환산급여공제', val: -tax.convertedDeduct },
                { label: '과세표준', val: tax.taxBase, bold: true },
                { label: '소득세', val: -tax.incomeTax },
                { label: '지방소득세', val: -tax.localTax, sub: '소득세 × 10%' },
                { label: '세금 합계', val: -tax.totalTax, bold: true, color: '#A32D2D' },
              ].map((row, i) => (
                <div key={i} style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{row.label}{row.sub && <span style={{ fontSize: 10, marginLeft: 4 }}>({row.sub})</span>}</div>
                  <div style={{ fontSize: 13, fontWeight: row.bold ? 700 : 400, color: row.color || 'var(--text)' }}>
                    {row.val < 0 ? '▼ ' : ''}{fmt(Math.abs(row.val))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 실수령액 */}
        {retirementPay > 0 && (
          <section>
            <div style={{ background: receiveType === '일시금' ? '#EAF3DE' : '#E8F0FB', borderRadius: 14, padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: receiveType === '일시금' ? '#3B6D11' : '#1A4A8A', marginBottom: 8, fontWeight: 600 }}>
                {receiveType === '일시금' ? '💰 실수령 퇴직금' : '💰 IRP·DC 이전금액 (세전)'}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: receiveType === '일시금' ? '#3B6D11' : '#1A4A8A' }}>
                {fmt(receiveType === '일시금' ? netPay : retirementPay)}
              </div>
              {receiveType === '일시금' && tax && (
                <div style={{ fontSize: 11, color: '#3B6D11', marginTop: 6 }}>
                  퇴직금 {fmt(retirementPay)} — 세금 {fmt(tax.totalTax)}
                </div>
              )}
              {receiveType === 'IRP·DC 이전' && (
                <div style={{ fontSize: 11, color: '#1A4A8A', marginTop: 6 }}>
                  ※ 실제 수령 시점에 퇴직소득세 부과
                </div>
              )}
            </div>
          </section>
        )}

        <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.7 }}>
          ※ 본 계산기는 참고용이며 실제와 차이가 있을 수 있습니다.<br/>
          ※ 통상임금이 평균임금보다 높은 경우 통상임금 기준 적용 필요
        </div>

      </div>
    </div>
  );
}
