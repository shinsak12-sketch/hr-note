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
  const [orgName, setOrgName] = useState('');
  const [hqList, setHqList] = useState([]);
  const [deptList, setDeptList] = useState([]);
  const [orgList, setOrgList] = useState([]);
  const [copied, setCopied] = useState(null);

  const load = useCallback(async (params = {}) => {
    setLoading(true);
    const data = await api.getOffices(params);
    setOffices(data);
    setLoading(false);
  }, []);

  // 본부 목록 로드
  useEffect(() => {
    api.getOfficeHeadquarters().then(setHqList);
    load({});
  }, [load]);

  // 본부 바뀌면 부서 목록 갱신 + 재조회
  useEffect(() => {
    if (headquarters) {
      api.getOfficeDepartments(headquarters).then(setDeptList);
      setDepartment('');
      setOrgName('');
      setOrgList([]);
      load({ headquarters });
    } else if (headquarters === '') {
      setDeptList([]);
      setDepartment('');
      setOrgName('');
      setOrgList([]);
      load({});
    }
  }, [headquarters, load]);

  // 부서 바뀌면 조직 목록 갱신 + 재조회
  useEffect(() => {
    if (department) {
      api.getOfficeOrgs(headquarters, department).then(setOrgList);
      setOrgName('');
      load({ headquarters, department });
    } else if (headquarters) {
      setOrgList([]);
      setOrgName('');
      load({ headquarters });
    }
  }, [department]);

  // 조직 바뀌면 재조회
  useEffect(() => {
    if (orgName) load({ headquarters, department, org_name: orgName });
    else if (department) load({ headquarters, department });
    else if (headquarters) load({ headquarters });
  }, [orgName]);

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
        <button className="header-back" onClick={() => nav(window.location.pathname.startsWith('/field') ? '/field' : '/')}>
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
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={orgName} onChange={e => setOrgName(e.target.value)}
            style={{ flex: 1 }} disabled={!department || orgList.length === 0}>
            <option value="">전체 조직</option>
            {orgList.map(o => <option key={o}>{o}</option>)}
          </select>
          <form onSubmit={handleSearch} style={{ flex: 2, display: 'flex', gap: 8 }}>
            <input type="text" placeholder="조직명, 주소, 관리자 검색"
              value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 1 }} />
            <button type="submit" className="btn-secondary">검색</button>
          </form>
        </div>
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
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>📍 {office.org_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => {
                            const text = [
                              `📍 ${office.org_name}`,
                              `🗺️ ${office.address}`,
                              office.manager_name ? `👤 ${office.manager_name}` : null,
                              office.phone ? `📞 ${office.phone}` : null,
                            ].filter(Boolean).join('\n');
                            if (navigator.share) {
                              navigator.share({ title: office.org_name, text });
                            } else {
                              navigator.clipboard.writeText(text);
                              setCopied(office.id + '_share');
                              setTimeout(() => setCopied(null), 2000);
                            }
                          }} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6,
                            background: copied === office.id + '_share' ? '#EAF3DE' : 'var(--bg2)',
                            color: copied === office.id + '_share' ? '#3B6D11' : 'var(--text2)',
                            border: '0.5px solid var(--border)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            {copied === office.id + '_share' ? '✓ 복사됨' : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                                </svg>
                                공유
                              </>
                            )}
                          </button>
                          <button onClick={() => {
                            navigator.clipboard.writeText(office.address);
                            setCopied(office.id + '_addr');
                            setTimeout(() => setCopied(null), 2000);
                          }} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6,
                            background: copied === office.id + '_addr' ? '#EAF3DE' : 'var(--bg2)',
                            color: copied === office.id + '_addr' ? '#3B6D11' : 'var(--text2)',
                            border: '0.5px solid var(--border)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            {copied === office.id + '_addr' ? '✓ 복사됨' : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                                주소복사
                              </>
                            )}
                          </button>
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
