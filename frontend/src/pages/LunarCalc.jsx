import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Solar, Lunar } from 'lunar-javascript';

const GAN_KO  = ['갑','을','병','정','무','기','경','신','임','계'];
const ZHI_KO  = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const ZODIAC  = ['🐭쥐','🐮소','🐯호랑이','🐰토끼','🐲용','🐍뱀','🐴말','🐑양','🐒원숭이','🐓닭','🐕개','🐗돼지'];
const DAYS_KO = ['일','월','화','수','목','금','토'];

function ganzhiKo(gz) {
  const map = {
    '甲':'갑','乙':'을','丙':'병','丁':'정','戊':'무','己':'기','庚':'경','辛':'신','壬':'임','癸':'계',
    '子':'자','丑':'축','寅':'인','卯':'묘','辰':'진','巳':'사','午':'오','未':'미','申':'신','酉':'유','戌':'술','亥':'해'
  };
  return gz.split('').map(c => map[c] || c).join('');
}

function shengxiaoKo(sx) {
  const map = {'鼠':'쥐','牛':'소','虎':'호랑이','兔':'토끼','龙':'용','蛇':'뱀','马':'말','羊':'양','猴':'원숭이','鸡':'닭','狗':'개','猪':'돼지'};
  return map[sx] || sx;
}

export default function LunarCalc() {
  const nav = useNavigate();
  const [mode, setMode] = useState('sol2lun');
  const [form, setForm] = useState({ year: '', month: '', day: '' });
  const [isLeap, setIsLeap] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); setResult(null); setError(''); }

  const daysInMonth = form.year && form.month
    ? new Date(Number(form.year), Number(form.month), 0).getDate()
    : 31;

  function handleCalc() {
    if (!form.year || !form.month || !form.day) { setError('날짜를 모두 입력하세요.'); return; }
    setError('');
    try {
      if (mode === 'sol2lun') {
        const solar = Solar.fromYmd(Number(form.year), Number(form.month), Number(form.day));
        const lunar = solar.getLunar();
        const lunMonth = lunar.getMonth();
        const isLeapMonth = lunMonth < 0;
        const solDate = new Date(Number(form.year), Number(form.month)-1, Number(form.day));
        setResult({
          type: 'sol2lun',
          solYear: form.year, solMonth: form.month, solDay: form.day,
          dayOfWeek: DAYS_KO[solDate.getDay()],
          lunYear: lunar.getYear(), lunMonth: Math.abs(lunMonth), lunDay: lunar.getDay(),
          lunLeap: isLeapMonth,
          ganZhi: ganzhiKo(lunar.getYearInGanZhi()),
          shengXiao: shengxiaoKo(lunar.getYearShengXiao()),
        });
      } else {
        const lunar = Lunar.fromYmd(Number(form.year), isLeap ? -Number(form.month) : Number(form.month), Number(form.day));
        const solar = lunar.getSolar();
        const solDate = new Date(solar.getYear(), solar.getMonth()-1, solar.getDay());
        setResult({
          type: 'lun2sol',
          lunYear: form.year, lunMonth: form.month, lunDay: form.day,
          lunLeap: isLeap,
          ganZhi: ganzhiKo(lunar.getYearInGanZhi()),
          shengXiao: shengxiaoKo(lunar.getYearShengXiao()),
          solYear: solar.getYear(), solMonth: solar.getMonth(), solDay: solar.getDay(),
          dayOfWeek: DAYS_KO[solDate.getDay()],
        });
      }
    } catch(e) {
      setError('날짜를 확인해주세요: ' + e.message);
    }
  }

  function fmt(y, m, d) {
    return `${y}년 ${Number(m)}월 ${Number(d)}일`;
  }

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
            <button key={m.val} onClick={() => { setMode(m.val); setResult(null); setError(''); setForm({ year: '', month: '', day: '' }); }} style={{
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
              <select value={form.year} onChange={e => setF('year', e.target.value)}>
                <option value="">연도</option>
                {Array.from({ length: 126 }, (_, i) => 2025 - i).map(y => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">월</label>
              <select value={form.month} onChange={e => setF('month', e.target.value)}>
                <option value="">월</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">일</label>
              <select value={form.day} onChange={e => setF('day', e.target.value)}>
                <option value="">일</option>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}일</option>
                ))}
              </select>
            </div>
          </div>

          {/* 윤달 */}
          {mode === 'lun2sol' && (
            <button type="button" onClick={() => setIsLeap(l => !l)} style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
              padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${isLeap ? '#854F0B' : 'var(--border)'}`,
              background: isLeap ? '#FAEEDA' : 'var(--bg2)',
              color: isLeap ? '#854F0B' : 'var(--text2)',
              fontSize: 13, fontFamily: 'inherit',
            }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${isLeap ? '#854F0B' : 'var(--border)'}`, background: isLeap ? '#854F0B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isLeap && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
              </div>
              윤달
            </button>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{error}</div>}

          <button onClick={handleCalc} style={{
            width: '100%', height: 44, borderRadius: 10, marginTop: 12,
            background: '#5C3D8F', color: '#fff',
            border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>🔄 변환</button>
        </section>

        {/* 결과 */}
        {result && (
          <section>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>변환 결과</div>
            <div style={{ background: '#F0EBF8', border: '1px solid #5C3D8F20', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* 입력 */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                  {result.type === 'sol2lun' ? '☀️ 입력 (양력)' : '🌙 입력 (음력)'}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#5C3D8F' }}>
                  {result.type === 'sol2lun'
                    ? fmt(result.solYear, result.solMonth, result.solDay)
                    : fmt(result.lunYear, result.lunMonth, result.lunDay)}
                  {result.type === 'lun2sol' && result.lunLeap && (
                    <span style={{ fontSize: 12, marginLeft: 6, color: '#854F0B', background: '#FAEEDA', padding: '2px 6px', borderRadius: 6 }}>윤달</span>
                  )}
                </div>
              </div>

              {/* 변환 결과 */}
              <div style={{ borderTop: '0.5px solid #5C3D8F30', paddingTop: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
                  {result.type === 'sol2lun' ? '🌙 음력' : '☀️ 양력'}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#5C3D8F' }}>
                  {result.type === 'sol2lun'
                    ? fmt(result.lunYear, result.lunMonth, result.lunDay)
                    : fmt(result.solYear, result.solMonth, result.solDay)}
                  {result.type === 'sol2lun' && result.lunLeap && (
                    <span style={{ fontSize: 12, marginLeft: 6, color: '#854F0B', background: '#FAEEDA', padding: '2px 6px', borderRadius: 6 }}>윤달</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: '#7B2D8B', marginTop: 6, fontWeight: 600 }}>
                  {result.ganZhi}년 · {result.shengXiao}띠
                </div>
              </div>

              {/* 요일 */}
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 12px', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>📅 요일</span>
                <strong>{result.dayOfWeek}요일</strong>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
