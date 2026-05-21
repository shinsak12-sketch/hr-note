import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function OfficeHome() {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('hr_user') || '{}');
  const isMaster = user.role === 'master';

  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [headquarters, setHeadquarters] = useState('');
  const [department, setDepartment] = useState('');
  const [hqList, setHqList] = useState([]);
  const [deptList, setDeptList] = useState([]);
  const [copied, setCopied] = useState(null);

  // 본부 목록 로드
  useEffect(() => {
    api.getOfficeHeadquarters().then(setHqList);
    load({});
  }, []);

  // 본부 바뀌면 부서 목록 갱신
  useEffect(() => {
    if (headquarters) {
      api.getOfficeDepartments(headquarters).then(setDeptList);
      setDepartment('');
      load({ headquarters });
    } else {
      setDeptList([]);
      setDepartment('');
      load({});
    }
  }, [headquarters]);

  // 부서 바뀌면 재조회
  useEffect(() => {
    if (department) load({ headquarters, department });
    else if (headquarters) load({ headquarters });
  }, [department]);

  const load = useCallback(async (params = {}) => {
    setLoading(true);
    const data = await api.getOffices(params);
    setOffices(data);
    setLoading(false);
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    const params = {};
    if (headquarters) params.headquarters = headquarters;
    if (department) params.department = department;
    if (query) params.q = query;
    load(params);
  }

  function openNaver(address) {
    window.open(`https://map.naver.com/v5/search/${encodeURIComponent(address)}`, '_blank');
  }

  function callPhone(phone) {
    window.location.href = `tel:${phone}`;
  }

  // 본부 → 부서 → 센터 계층 그룹핑
  const grouped = offices.reduce((acc, o) => {
    const hq = o.headquarters;
    const dept = o.department || '__none__';
    if (!acc[hq]) acc[hq] = {};
    if (!acc[hq][dept]) acc[hq][dept] = [];
    acc[hq][dept].push(o);
    return acc;
  }, {});

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">사무실 주소</div>
        {isMaster && (
          <button onClick={() => nav('/offices/new')} style={{
            background: '#5A4A00', color: '#FFF9E6', border: 'none',
            borderRadius: 8, padding: '6px 12px', fontSize: 13,
            fontWeight: 600, cursor: 'pointer',
          }}>+ 등록</button>
        )}
      </div>

      {/* 필터 */}
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={headquarters} onChange={e => setHeadquarters(e.target.value)} style={{ flex: 1 }}>
            <option value="">전체 본부</option>
            {hqList.map(h => <option key={h}>{h}</option>)}
          </select>
          <select value={department} onChange={e => setDepartment(e.target.value)}
            style={{ flex: 1 }} disabled={!headquarters || deptList.length === 0}>
            <option value="">전체 부서</option>
            {deptList.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="조직명, 주소, 관리자 검색"
            value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 1 }} />
          <button type="submit" className="btn-secondary">검색</button>
        </form>
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && offices.length === 0 && <div className="center-msg">등록된 사무실이 없습니다.</div>}

        {Object.entries(grouped).map(([hq, depts]) => (
          <section key={hq}>
            {/* 본부 헤더 */}
            <div style={{
              fontSize: 14, fontWeight: 700, color: '#5A4A00',
              padding: '6px 12px', background: '#FFF9E6',
              borderRadius: 8, marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              🏛️ {hq}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(depts).map(([dept, items]) => (
                <div key={dept}>
                  {/* 부서 헤더 (부서가 있을 때만) */}
                  {dept !== '__none__' && (
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: '#1A4A8A',
                      padding: '4px 10px', marginBottom: 8, marginLeft: 4,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      📂 {dept}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: dept !== '__none__' ? 8 : 0 }}>
                    {items.map(office => (
                      <div key={office.id} style={{
                        background: 'var(--bg)', border: '0.5px solid var(--border)',
                        borderRadius: 12, padding: '14px 16px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>📍 {office.org_name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => {
                            navigator.clipboard.writeText(office.address);
                            setCopied(office.id);
                            setTimeout(() => setCopied(null), 2000);
                          }} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6,
                            background: copied === office.id ? '#EAF3DE' : 'var(--bg2)',
                            color: copied === office.id ? '#3B6D11' : 'var(--text2)',
                            border: '0.5px solid var(--border)', cursor: 'pointer',
                          }}>{copied === office.id ? '✓ 복사됨' : '📋 복사'}</button>
                          {isMaster && (
                            <button onClick={() => nav(`/offices/${office.id}/edit`)} style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 6,
                              background: 'var(--bg2)', color: 'var(--text2)',
                              border: '0.5px solid var(--border)', cursor: 'pointer',
                            }}>수정</button>
                          )}
                        </div>
                        </div>

                        {/* 주소 → 네이버지도 */}
                        <button onClick={() => openNaver(office.address)} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%',
                          background: '#FFF9E6', border: '0.5px solid #E8D84A30',
                          borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                          textAlign: 'left', marginBottom: 8,
                        }}>
                          <span style={{ fontSize: 14, flexShrink: 0 }}>🗺️</span>
                          <span style={{ fontSize: 13, color: '#5A4A00', fontWeight: 500, lineHeight: 1.4, flex: 1 }}>
                            {office.address}
                          </span>
                          <span style={{ fontSize: 11, color: '#5A4A00', flexShrink: 0 }}>지도 ›</span>
                        </button>

                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {office.manager_name && (
                            <span style={{ fontSize: 12, color: 'var(--text2)' }}>👤 {office.manager_name}</span>
                          )}
                          {office.phone && (
                            <button onClick={() => callPhone(office.phone)} style={{
                              fontSize: 12, color: '#1A4A8A', background: 'none',
                              border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                            }}>📞 {office.phone}</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
