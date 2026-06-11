import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function fmt(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function dayOfWeek(dateStr) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(dateStr).getDay()];
}

export default function PregnancyCalc() {
  const nav = useNavigate();
  const [dueDate, setDueDate] = useState('');

  // 마지막 생리시작일 = 분만예정일 - 280일
  const lastPeriod = dueDate ? addDays(dueDate, -280) : null;
  // 12주 이내 마지막 날 = 마지막 생리시작일 + 84일
  const week12End = lastPeriod ? addDays(lastPeriod, 84) : null;
  // 32주 이후 시작일 = 마지막 생리시작일 + 218일
  const week32Start = lastPeriod ? addDays(lastPeriod, 218) : null;

  // 오늘 기준 단계 판단
  const today = new Date().toISOString().split('T')[0];
  const isIn12 = week12End && today <= week12End;
  const isIn32 = week32Start && today >= week32Start;
  const isMiddle = week12End && week32Start && today > week12End && today < week32Start;

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav(window.location.pathname.startsWith('/field') ? '/field' : '/hr-calc')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">🤱 임신중 단축근무 계산기</div>
        <button onClick={() => nav("/attendance-app")} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "#FAEEDA", color: "#854F0B", border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>근태관리</button>
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* 안내 */}
        <div style={{ background: '#F5E8F8', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#5C3D8F', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 임신기 근로시간 단축 제도</div>
          <div>• <strong>임신 후 12주 이내</strong> 또는 <strong>32주 이후</strong> 여성 근로자</div>
          <div>• 1일 2시간 근로시간 단축 신청 가능</div>
          <div>• 단축을 이유로 임금 삭감 불가</div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#7B2D8B' }}>※ 근로기준법 제74조제7항 ('25.2.23. 기간 확대 시행)</div>
        </div>

        {/* 입력 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>분만예정일 입력</div>
          <div className="form-group">
            <label className="form-label">분만예정일 (출산예정일)</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              style={{ fontSize: 15 }} />
          </div>
        </section>

        {/* 결과 */}
        {dueDate && lastPeriod && (
          <>
            {/* 기준일 */}
            <section>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>기준일 계산</div>
              <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {[
                  { label: '마지막 생리시작일', date: lastPeriod, desc: '분만예정일 - 280일', color: 'var(--text2)', bg: 'var(--bg2)' },
                  { label: '분만예정일', date: dueDate, desc: '입력값', color: '#5C3D8F', bg: '#F5E8F8' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: item.bg, borderBottom: i === 0 ? '0.5px solid var(--border)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>{item.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 1 }}>{item.desc}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{fmt(item.date)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>({dayOfWeek(item.date)})</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 단축근무 대상기간 */}
            <section>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>단축근무 대상기간</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* 12주 이내 */}
                <div style={{
                  borderRadius: 12, padding: '14px 16px',
                  background: isIn12 ? '#EAF3DE' : 'var(--bg)',
                  border: `2px solid ${isIn12 ? '#3B6D11' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#3B6D11' }}>① 임신 후 12주 이내</div>
                    {isIn12 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#3B6D11', color: '#fff' }}>현재 해당</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.6 }}>
                    임신 1일 ~ 84일 (12주 × 7일)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>시작일</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#3B6D11' }}>{fmt(lastPeriod)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>({dayOfWeek(lastPeriod)})</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>마지막 날 (12주0일)</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#3B6D11' }}>{fmt(week12End)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>({dayOfWeek(week12End)})</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#3B6D11', fontWeight: 600 }}>
                    📐 {fmt(lastPeriod)} + 84일 = {fmt(week12End)}
                  </div>
                </div>

                {/* 중간 기간 */}
                <div style={{ borderRadius: 10, padding: '10px 14px', background: 'var(--bg2)', border: '0.5px solid var(--border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                    {isMiddle ? '⏳ 현재 단축근무 미해당 기간' : '13주 ~ 31주 (단축근무 미해당)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {fmt(addDays(week12End, 1))} ~ {fmt(addDays(week32Start, -1))}
                  </div>
                </div>

                {/* 32주 이후 */}
                <div style={{
                  borderRadius: 12, padding: '14px 16px',
                  background: isIn32 ? '#E8F0FB' : 'var(--bg)',
                  border: `2px solid ${isIn32 ? '#1A4A8A' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1A4A8A' }}>② 임신 후 32주 이후</div>
                    {isIn32 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#1A4A8A', color: '#fff' }}>현재 해당</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.6 }}>
                    임신 218일 (31주×7일+1일) ~ 분만예정일
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>시작일 (31주1일)</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1A4A8A' }}>{fmt(week32Start)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>({dayOfWeek(week32Start)})</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>분만예정일</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1A4A8A' }}>{fmt(dueDate)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>({dayOfWeek(dueDate)})</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#1A4A8A', fontWeight: 600 }}>
                    📐 {fmt(lastPeriod)} + 218일 = {fmt(week32Start)}
                  </div>
                </div>
              </div>
            </section>

            {/* 유의사항 */}
            <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.7 }}>
              ※ 계산표의 분만예정일은 임신 40주 기준으로 산정된 것입니다.<br/>
              ※ 해당 결과는 참고용으로만 사용하시기 바랍니다.<br/>
              ※ 실제 임신기간은 의료기관에서 확인하세요.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
