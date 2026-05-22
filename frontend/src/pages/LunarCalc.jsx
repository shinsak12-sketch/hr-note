import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function LunarCalc() {
  const nav = useNavigate();
  const [mode, setMode] = useState('sol2lun'); // sol2lun | lun2sol
  const [form, setForm] = useState({ year: '', month: '', day: '' });
  const [isLeap, setIsLeap] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); setResult(null); }

  async function handleCalc() {
    if (!form.year || !form.month || !form.day) { setError('날짜를 모두 입력하세요.'); return; }
    setError(''); setLoading(true); setResult(null);
    try {
      let data;
      if (mode === 'sol2lun') {
        data = await api.solarToLunar(form.year, form.month, form.day);
      } else {
        data = await api.lunarToSolar(form.year, form.month, form.day, isLeap);
      }
      const item = data?.response?.body?.items?.item;
      if (!item) { setError('변환 결과를 찾을 수 없습니다.'); return; }
      setResult(Array.isArray(item) ? item[0] : item);
    } catch (e) { setError('API 호출 오류: ' + e.message); }
    finally { setLoading(false); }
  }

  function fmt(y, m, d) {
    if (!y || !m || !d) return '-';
    return `${y}년 ${Number(m)}월 ${Number(d)}일`;
  }

  const GAN = ['갑','을','병','정','무','기','경','신','임','계'];
  const JI = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
  const ZODIAC = ['🐭쥐','🐮소','🐯호랑이','🐰토끼','🐲용','🐍뱀','🐴말','🐑양','🐒원숭이','🐓닭','🐕개','🐗돼지'];

  function getSexagenary(year) {
    const y = Number(year);
    const gan = GAN[(y - 4) % 10];
    const ji = JI[(y - 4) % 12];
    const zodiac = ZODIAC[(y - 4) % 12];
    return `${gan}${ji}년 (${zodiac})`;
  }

  const today = new Date();

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/hr-calc')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">📅 음력/양력 변환</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* 모드 선택 */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { val: 'sol2lun', label: '양력 → 음력', icon: '☀️' },
            { val: 'lun2sol', label: '음력 → 양력', icon: '🌙' },
          ].map(m => (
            <button key={m.val} onClick={() => { setMode(m.val); setResult(null); setError(''); }} style={{
              flex: 1, height: 46, borderRadius: 12,
              border: `2px solid ${mode === m.val ? '#5C3D8F' : 'var(--border)'}`,
              background: mode === m.val ? '#F0EBF8' : 'var(--bg)',
              color: mode === m.val ? '#5C3D8F' : 'var(--text2)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>{m.icon} {m.label}</button>
          ))}
        </div>

        {/* 입력 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {mode === 'sol2lun' ? '☀️ 양력 날짜 입력' : '🌙 음력 날짜 입력'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">연도</label>
              <input type="number" placeholder={String(today.getFullYear())}
                value={form.year} onChange={e => setF('year', e.target.value)}
                min="1900" max="2100" />
            </div>
            <div className="form-group">
              <label className="form-label">월</label>
              <select value={form.month} onChange={e => setF('month', e.target.value)}>
                <option value="">월</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">일</label>
              <select value={form.day} onChange={e => setF('day', e.target.value)}>
                <option value="">일</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}일</option>
                ))}
              </select>
            </div>
          </div>

          {/* 음력 윤달 */}
          {mode === 'lun2sol' && (
            <button type="button" onClick={() => setIsLeap(l => !l)} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
              padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${isLeap ? '#854F0B' : 'var(--border)'}`,
              background: isLeap ? '#FAEEDA' : 'var(--bg2)',
              color: isLeap ? '#854F0B' : 'var(--text2)',
              fontSize: 13, fontFamily: 'inherit',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: `2px solid ${isLeap ? '#854F0B' : 'var(--border)'}`,
                background: isLeap ? '#854F0B' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isLeap && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
              </div>
              윤달
            </button>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{error}</div>}

          <button onClick={handleCalc} disabled={loading} style={{
            width: '100%', height: 44, borderRadius: 10, marginTop: 12,
            background: '#5C3D8F', color: '#fff',
            border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>{loading ? '변환 중...' : '🔄 변환'}</button>
        </section>

        {/* 결과 */}
        {result && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>변환 결과</div>
            <div style={{ background: '#F0EBF8', border: '1px solid #5C3D8F20', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

              {mode === 'sol2lun' ? (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>☀️ 입력 (양력)</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#5C3D8F' }}>{fmt(result.solYear, result.solMonth, result.solDay)}</div>
                  </div>
                  <div style={{ borderTop: '0.5px solid #5C3D8F30', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>🌙 음력</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#5C3D8F' }}>
                      {fmt(result.lunYear, result.lunMonth, result.lunDay)}
                      {result.lunLeapmonth === 'Y' && <span style={{ fontSize: 13, marginLeft: 6, color: '#854F0B', background: '#FAEEDA', padding: '2px 6px', borderRadius: 6 }}>윤달</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{getSexagenary(result.lunYear)}</div>
                  </div>
                  {result.dayOfWeek && (
                    <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      📅 요일: <strong>{result.dayOfWeek}</strong>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>🌙 입력 (음력)</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#5C3D8F' }}>
                      {fmt(result.lunYear, result.lunMonth, result.lunDay)}
                      {result.lunLeapmonth === 'Y' && <span style={{ fontSize: 13, marginLeft: 6, color: '#854F0B', background: '#FAEEDA', padding: '2px 6px', borderRadius: 6 }}>윤달</span>}
                    </div>
                  </div>
                  <div style={{ borderTop: '0.5px solid #5C3D8F30', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>☀️ 양력</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#5C3D8F' }}>{fmt(result.solYear, result.solMonth, result.solDay)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{getSexagenary(result.lunYear)}</div>
                  </div>
                  {result.dayOfWeek && (
                    <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      📅 요일: <strong>{result.dayOfWeek}</strong>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
