import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const GRADES = ['A', 'B+', 'B0', 'B-', 'C'];

// 평가인상률 매트릭스 [성과][역량]
const MATRIX = {
  'A':  { 'A': 2.0, 'B+': 1.5, 'B0': 1.0, 'B-': 0.5, 'C': 0.0 },
  'B+': { 'A': 1.5, 'B+': 1.0, 'B0': 0.5, 'B-': 0.0, 'C':-1.0 },
  'B0': { 'A': 1.0, 'B+': 0.5, 'B0': 0.0, 'B-':-0.5, 'C':-2.0 },
  'B-': { 'A': 0.5, 'B+': 0.0, 'B0':-0.5, 'B-':-1.0, 'C':-3.0 },
  'C':  { 'A': 0.0, 'B+': -0.5,'B0':-1.5, 'B-':-2.5, 'C':-4.0 },
};

const COEF_NA = { 'A': 1.5, 'B+': 1.2, 'B0': 1.0, 'B-': 0.8, 'C': 0.5 };
const COEF_DA = { 'A': 1.3, 'B+': 1.1, 'B0': 1.0, 'B-': 0.9, 'C': 0.7 };

function ceil1(n) { return Math.ceil(n); }
function fmt(n) {
  if (!n && n !== 0) return '-';
  return Math.round(n).toLocaleString('ko-KR') + '원';
}

export default function SalaryCalc() {
  const nav = useNavigate();
  const [prevBasic, setPrevBasic] = useState('');        // 전년도 기본급
  const [baseRate, setBaseRate] = useState('');          // 기본인상률
  const [perfGrade, setPerfGrade] = useState('');        // 성과평가
  const [compGrade, setCompGrade] = useState('');        // 역량평가
  const [promoType, setPromoType] = useState('없음');    // 승진상실보전 P/L/없음
  const [coefType, setCoefType] = useState('나형');      // 성과계수 나/다형
  const [hasLicense, setHasLicense] = useState(false);  // 자격수당

  const prevBasicNum = prevBasic ? Number(prevBasic.replace(/,/g,'')) : 0;
  const baseRateNum = baseRate ? Number(baseRate) : 0;

  // 평가인상률
  const evalRate = (perfGrade && compGrade) ? (MATRIX[perfGrade]?.[compGrade] ?? 0) : 0;

  // 승진상실보전률
  const promoRate = promoType === 'P' ? 3.5 : promoType === 'L' ? 2.5 : 0;

  // 신 기본급
  const newBasic = prevBasicNum > 0
    ? ceil1(prevBasicNum * (1 + (baseRateNum + evalRate + promoRate) / 100))
    : 0;

  // 성과계수
  const coef = perfGrade
    ? (coefType === '나형' ? COEF_NA[perfGrade] : COEF_DA[perfGrade])
    : 0;

  // 성과급/성과가급
  const quarter = newBasic / 4;
  const coefAmount = quarter * coef;
  const 성과급 = ceil1(Math.min(quarter, coefAmount));
  const 성과가급 = Math.max(0, ceil1(coefAmount - quarter));

  // 자격수당
  const 자격수당 = hasLicense ? 1200000 : 0;

  // 연봉 합계
  const totalAnnual = newBasic + 성과급 + 성과가급 + 자격수당;

  const canCalc = prevBasicNum > 0 && perfGrade && compGrade;

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/hr-calc')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">📊 연봉 계산기</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* 전년도 기본급 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>전년도 기본급</div>
          <input type="text" placeholder="전년도 기본급 (연간)"
            value={prevBasic}
            onChange={e => {
              const raw = e.target.value.replace(/,/g, '');
              if (/^\d*$/.test(raw)) setPrevBasic(raw ? Number(raw).toLocaleString('ko-KR') : '');
            }}
            style={{ textAlign: 'right', fontSize: 15 }} />
        </section>

        {/* 기본인상률 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>기본인상률 (%)</div>
          <input type="number" placeholder="예: 2.5" value={baseRate}
            onChange={e => setBaseRate(e.target.value)} step="0.1" />
        </section>

        {/* 평가등급 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>평가등급</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['역량평가', compGrade, setCompGrade], ['성과평가', perfGrade, setPerfGrade]].map(([label, val, setter]) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {GRADES.map(g => (
                    <button key={g} onClick={() => setter(g)} style={{
                      height: 34, borderRadius: 8, fontFamily: 'inherit',
                      border: `2px solid ${val === g ? '#1A4A8A' : 'var(--border)'}`,
                      background: val === g ? '#E8F0FB' : 'var(--bg)',
                      color: val === g ? '#1A4A8A' : 'var(--text2)',
                      fontSize: 13, fontWeight: val === g ? 700 : 400, cursor: 'pointer',
                    }}>{g}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 평가인상률 표시 */}
          {perfGrade && compGrade && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: evalRate >= 0 ? '#EAF3DE' : '#FCEBEB', fontSize: 13, fontWeight: 700, color: evalRate >= 0 ? '#3B6D11' : '#A32D2D', textAlign: 'center' }}>
              평가인상률: {evalRate >= 0 ? '+' : ''}{evalRate}%
              <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>(성과 {perfGrade} × 역량 {compGrade})</span>
            </div>
          )}
        </section>

        {/* 승진상실보전 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>승진상실보전</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['없음', 'P직급 (+3.5%)', 'L직급 (+2.5%)'].map((opt, i) => {
              const val = ['없음','P','L'][i];
              return (
                <button key={opt} onClick={() => setPromoType(val)} style={{
                  flex: 1, height: 38, borderRadius: 8, fontFamily: 'inherit', fontSize: 11,
                  border: `2px solid ${promoType === val ? '#854F0B' : 'var(--border)'}`,
                  background: promoType === val ? '#FAEEDA' : 'var(--bg)',
                  color: promoType === val ? '#854F0B' : 'var(--text2)',
                  fontWeight: promoType === val ? 700 : 400, cursor: 'pointer',
                }}>{opt}</button>
              );
            })}
          </div>
        </section>

        {/* 성과계수 유형 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>성과계수 유형</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {['나형', '다형'].map(t => (
              <button key={t} onClick={() => setCoefType(t)} style={{
                flex: 1, height: 38, borderRadius: 8, fontFamily: 'inherit',
                border: `2px solid ${coefType === t ? '#5C3D8F' : 'var(--border)'}`,
                background: coefType === t ? '#F0EBF8' : 'var(--bg)',
                color: coefType === t ? '#5C3D8F' : 'var(--text2)',
                fontSize: 13, fontWeight: coefType === t ? 700 : 400, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>
          {/* 성과계수 표 */}
          <div style={{ border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontSize: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', background: 'var(--bg2)' }}>
              <div style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, borderRight: '0.5px solid var(--border)' }}>등급</div>
              {GRADES.map(g => (
                <div key={g} style={{
                  padding: '8px 4px', textAlign: 'center', fontWeight: 700,
                  background: perfGrade === g ? '#F0EBF8' : 'transparent',
                  color: perfGrade === g ? '#5C3D8F' : 'var(--text)',
                  borderRight: '0.5px solid var(--border)',
                }}>{g}</div>
              ))}
            </div>
            {['나형', '다형'].map(type => {
              const coefs = type === '나형' ? COEF_NA : COEF_DA;
              return (
                <div key={type} style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', borderTop: '0.5px solid var(--border)' }}>
                  <div style={{
                    padding: '8px 6px', textAlign: 'center', fontWeight: 700,
                    background: coefType === type ? '#F0EBF8' : 'var(--bg2)',
                    color: coefType === type ? '#5C3D8F' : 'var(--text2)',
                    borderRight: '0.5px solid var(--border)',
                    cursor: 'pointer',
                  }} onClick={() => setCoefType(type)}>{type}</div>
                  {GRADES.map(g => {
                    const isSelected = coefType === type && perfGrade === g;
                    return (
                      <div key={g} style={{
                        padding: '8px 4px', textAlign: 'center',
                        background: isSelected ? '#F0EBF8' : 'transparent',
                        color: isSelected ? '#5C3D8F' : coefs[g] > 1 ? '#3B6D11' : coefs[g] < 1 ? '#A32D2D' : 'var(--text)',
                        fontWeight: isSelected ? 700 : 400,
                        borderRight: '0.5px solid var(--border)',
                      }}>{coefs[g]}</div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {perfGrade && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#5C3D8F', background: '#F0EBF8', borderRadius: 8, padding: '6px 12px', textAlign: 'center', fontWeight: 600 }}>
              적용 계수: {coefType === '나형' ? COEF_NA[perfGrade] : COEF_DA[perfGrade]} ({coefType} / 성과 {perfGrade})
            </div>
          )}
        </section>

        {/* 자격수당 */}
        <section>
          <button onClick={() => setHasLicense(v => !v)} style={{
            width: '100%', height: 44, borderRadius: 10, fontFamily: 'inherit',
            border: `2px solid ${hasLicense ? '#3B6D11' : 'var(--border)'}`,
            background: hasLicense ? '#EAF3DE' : 'var(--bg)',
            color: hasLicense ? '#3B6D11' : 'var(--text2)',
            fontSize: 13, fontWeight: hasLicense ? 700 : 400, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 18 }}>{hasLicense ? '✅' : '⬜'}</span>
            손해사정사 자격수당 (+연 120만원)
          </button>
        </section>

        {/* 결과 */}
        {canCalc && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>연봉 계산 결과</div>

            {/* 인상률 요약 */}
            <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 12, lineHeight: 1.8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>기본인상률</span>
                <span>{baseRateNum > 0 ? `+${baseRateNum}%` : '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>평가인상률</span>
                <span style={{ color: evalRate >= 0 ? '#3B6D11' : '#A32D2D' }}>{evalRate >= 0 ? '+' : ''}{evalRate}%</span>
              </div>
              {promoRate > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text2)' }}>승진상실보전</span>
                  <span style={{ color: '#854F0B' }}>+{promoRate}%</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid var(--border)', paddingTop: 4, marginTop: 4, fontWeight: 700 }}>
                <span>총 인상률</span>
                <span style={{ color: (baseRateNum+evalRate+promoRate) >= 0 ? '#3B6D11' : '#A32D2D' }}>
                  {(baseRateNum+evalRate+promoRate) >= 0 ? '+' : ''}{(baseRateNum+evalRate+promoRate).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* 연봉 구성 */}
            <div style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {[
                { label: '기본급', val: newBasic, sub: `전년 ${fmt(prevBasicNum)} → 인상`, color: '#1A4A8A' },
                { label: '성과급', val: 성과급, sub: `기본급÷4 × Min(1, ${coef})`, color: '#3B6D11' },
                { label: '성과가급', val: 성과가급, sub: 성과가급 > 0 ? `성과계수 초과분` : '해당없음', color: '#854F0B' },
                { label: '자격수당', val: 자격수당, sub: hasLicense ? '손해사정사' : '해당없음', color: '#5C3D8F' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{item.sub}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{fmt(item.val)}</div>
                </div>
              ))}
              <div style={{ padding: '14px', background: '#EAF3DE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#3B6D11' }}>연봉 합계</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#3B6D11' }}>{fmt(totalAnnual)}</div>
              </div>
            </div>

            {/* 월 환산 */}
            <div style={{ marginTop: 8, background: 'var(--bg2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>월 환산 (÷12)</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>기본급</span><span>{fmt(ceil1(newBasic/12))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>성과급</span><span>{fmt(ceil1(성과급/12))}</span>
              </div>
              {성과가급 > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text2)' }}>성과가급</span><span>{fmt(ceil1(성과가급/12))}</span>
                </div>
              )}
              {자격수당 > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text2)' }}>자격수당</span><span>{fmt(ceil1(자격수당/12))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '0.5px solid var(--border)', paddingTop: 4, marginTop: 4, fontWeight: 700 }}>
                <span>월 합계</span><span>{fmt(ceil1(totalAnnual/12))}</span>
              </div>
            </div>
          </section>
        )}

        <div style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.7 }}>
          ※ 본 계산기는 참고용이며 실제와 차이가 있을 수 있습니다.
        </div>
      </div>
    </div>
  );
}
