import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function HousingStats() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHousingStats().then(data => { setStats(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="container"><div style={{ textAlign:'center', padding:60, color:'var(--text2)' }}>불러오는 중...</div></div>;
  if (!stats) return <div className="container"><div style={{ textAlign:'center', padding:60, color:'var(--text2)' }}>데이터 없음</div></div>;

  const maxHq = Math.max(...(stats.byHq?.map(r => Number(r.cnt)) || [1]), 1);

  return (
    <div className="container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">사택 현황</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:16, paddingBottom:32 }}>

        {/* 요약 카드 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            { label:'전체 사택', value: stats.total, color:'#2D6A6A', bg:'#E6F4F4' },
            { label:'입주중', value: stats.occupied, color:'#00854A', bg:'rgba(0,133,74,0.1)' },
            { label:'공실', value: stats.vacant, color:'#854F0B', bg:'#FAEEDA' },
            { label:'만료임박(30일)', value: stats.exp30, color:'#A32D2D', bg:'#FCEBEB' },
          ].map(s => (
            <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:11, color:s.color, fontWeight:600, marginBottom:6 }}>{s.label}</div>
              <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* 계약 만료 현황 */}
        <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>📅 계약 만료 현황</div>
          <div style={{ display:'flex', gap:8 }}>
            {[
              { label:'30일 이내', value: stats.exp30, color:'#A32D2D', bg:'#FCEBEB' },
              { label:'60일 이내', value: stats.exp60, color:'#854F0B', bg:'#FAEEDA' },
              { label:'90일 이내', value: stats.exp90, color:'#5A4A00', bg:'#FFFDE6' },
            ].map(s => (
              <div key={s.label} style={{ flex:1, background:s.bg, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontSize:10, color:s.color, fontWeight:600, marginBottom:4 }}>{s.label}</div>
                <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 본부별 현황 */}
        {stats.byHq?.length > 0 && (
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>🏢 본부별 입주 현황</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {stats.byHq.map(r => (
                <div key={r.headquarters}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12 }}>{r.headquarters}</span>
                    <span style={{ fontSize:12, fontWeight:700 }}>{r.cnt}명</span>
                  </div>
                  <div style={{ height:8, borderRadius:4, background:'var(--bg2)', overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:4, background:'#2D6A6A', width:`${(Number(r.cnt)/maxHq)*100}%`, transition:'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 만료 임박 목록 */}
        {stats.expiring?.length > 0 && (
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>⚠️ 만료 임박 (90일 이내)</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {stats.expiring.map(r => {
                const days = Number(r.days_left);
                const color = days <= 30 ? '#A32D2D' : days <= 60 ? '#854F0B' : '#5A4A00';
                const bg = days <= 30 ? '#FCEBEB' : days <= 60 ? '#FAEEDA' : '#FFFDE6';
                return (
                  <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background:'var(--bg2)', borderRadius:8 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600 }}>{r.address}</div>
                      <div style={{ fontSize:11, color:'var(--text2)' }}>
                        {r.emp_name ? `${r.emp_name} · ${r.resident_org}` : '공실'} · {r.contract_end?.split('T')[0]}
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:10, background:bg, color, whiteSpace:'nowrap' }}>
                      D-{days}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 장기 입주자 TOP 10 */}
        {stats.longTerm?.length > 0 && (
          <div style={{ background:'var(--bg)', border:'0.5px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>🏅 장기 입주자 TOP {stats.longTerm.length}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {stats.longTerm.map((r, i) => {
                const months = Number(r.months);
                const years = Math.floor(months / 12);
                const rem = months % 12;
                const dur = years > 0 ? `${years}년 ${rem}개월` : `${rem}개월`;
                return (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--bg2)', borderRadius:8 }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background: i < 3 ? ['#A32D2D','#854F0B','#5A4A00'][i] : 'var(--border)', color: i < 3 ? '#fff' : 'var(--text2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600 }}>{r.emp_name} <span style={{ color:'var(--text2)', fontWeight:400 }}>· {r.org_name}</span></div>
                      <div style={{ fontSize:11, color:'var(--text2)' }}>{r.address}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:'#2D6A6A', whiteSpace:'nowrap' }}>{dur}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
