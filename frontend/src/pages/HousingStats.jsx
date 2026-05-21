import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function HousingStats() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hqList, setHqList] = useState([]);
  const [deptList, setDeptList] = useState([]);
  const [orgList, setOrgList] = useState([]);
  const [hq, setHq] = useState('');
  const [dept, setDept] = useState('');
  const [org, setOrg] = useState('');

  useEffect(() => {
    api.getOfficeHeadquarters().then(setHqList);
    loadStats({});
  }, []);

  async function loadStats(params) {
    setLoading(true);
    const data = await api.getHousingStats(params);
    setStats(data);
    setLoading(false);
  }

  async function handleHq(val) {
    setHq(val); setDept(''); setOrg(''); setDeptList([]); setOrgList([]);
    if (val) { api.getOfficeDepartments(val).then(setDeptList); loadStats({ headquarters: val }); }
    else loadStats({});
  }

  async function handleDept(val) {
    setDept(val); setOrg(''); setOrgList([]);
    if (val) { api.getOfficeOrgs(hq, val).then(setOrgList); loadStats({ headquarters: hq, department: val }); }
    else loadStats({ headquarters: hq });
  }

  async function handleOrg(val) {
    setOrg(val);
    if (val) loadStats({ headquarters: hq, department: dept, org_name: val });
    else loadStats({ headquarters: hq, department: dept });
  }

  const today = new Date();

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/general-app')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">사택 현황</div>
        <div style={{ width: 40 }} />
      </div>

      {/* 필터 */}
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={hq} onChange={e => handleHq(e.target.value)} style={{ flex: 1 }}>
            <option value="">전체 본부</option>
            {hqList.map(h => <option key={h}>{h}</option>)}
          </select>
          <select value={dept} onChange={e => handleDept(e.target.value)} style={{ flex: 1 }} disabled={!hq || !deptList.length}>
            <option value="">전체 부서</option>
            {deptList.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <select value={org} onChange={e => handleOrg(e.target.value)} disabled={!dept || !orgList.length}>
          <option value="">전체 조직</option>
          {orgList.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}

        {!loading && stats && (
          <>
            {/* 요약 */}
            <section>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📊 현황 요약</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: '사택 수', val: `${stats.total}건`, color: '#2D6A6A', bg: '#E6F4F4' },
                  { label: '보증금 총합', val: stats.deposit_sum ? `${Number(stats.deposit_sum).toLocaleString()}만` : '-', color: '#1A4A8A', bg: '#E8F0FB' },
                  { label: '월세 총합', val: stats.rent_sum ? `${Number(stats.rent_sum).toLocaleString()}만` : '-', color: '#3B6D11', bg: '#EAF3DE' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: s.color, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* 만료 예정 */}
            {stats.expiring?.length > 0 && (
              <section>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>⚠️ 만료 예정</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.expiring.map(r => {
                    const d = r.days_left;
                    const color = d <= 60 ? '#A32D2D' : d <= 90 ? '#854F0B' : '#7A6B00';
                    const bg = d <= 60 ? '#FCEBEB' : d <= 90 ? '#FAEEDA' : '#FFFBE6';
                    const badge = d <= 60 ? '🔴' : d <= 90 ? '🟠' : '🟡';
                    return (
                      <div key={r.id} style={{ background: 'var(--bg)', border: `0.5px solid ${color}30`, borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.emp_name} <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400 }}>· {r.emp_no}</span></div>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: bg, color }}>
                            {badge} D-{d}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                          <div>🏢 {r.org_name}</div>
                          {r.housing_address && <div>📍 {r.housing_address}</div>}
                          <div>📆 만료일: {r.contract_end?.split?.('T')[0]}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 전체 리스트 */}
            <section>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>🏠 사택 목록 ({stats.list?.length || 0})</div>
              {stats.list?.length === 0 && <div className="center-msg">승인된 사택이 없습니다.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.list?.map(r => (
                  <div key={r.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{r.emp_name} <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 400 }}>· {r.emp_no}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                      <div>🏢 {r.org_name}</div>
                      {r.housing_address && <div>📍 {r.housing_address}</div>}
                      {r.contract_end && <div>📆 {r.contract_start?.split?.('T')[0]} ~ {r.contract_end?.split?.('T')[0]}</div>}
                      {r.deposit && <div>💰 보증금 {Number(r.deposit).toLocaleString()}만원 / 월세 {Number(r.monthly_rent).toLocaleString()}만원</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
