import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const GROUP_TYPES = ['본부', '부서', '센터'];
const TYPE_STYLE = {
  '본부': { color: '#A32D2D', bg: '#FCEBEB' },
  '부서': { color: '#1A4A8A', bg: '#E8F0FB' },
  '센터': { color: '#3B6D11', bg: '#EAF3DE' },
};

export default function OfficeHome() {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem('hr_user') || '{}');
  const isMaster = user.role === 'master';
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [groupNames, setGroupNames] = useState([]);

  const load = useCallback(async (params = {}) => {
    setLoading(true);
    const data = await api.getOffices(params);
    setOffices(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.getOffices().then(data => {
      const names = [...new Set(data.map(o => o.group_name))];
      setGroupNames(names);
    });
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    const params = {};
    if (filterType) params.group_type = filterType;
    if (filterGroup) params.group_name = filterGroup;
    if (query) params.q = query;
    load(params);
  }

  function handleFilterType(val) {
    setFilterType(val);
    setFilterGroup('');
    const params = {};
    if (val) params.group_type = val;
    if (query) params.q = query;
    load(params);
  }

  function handleFilterGroup(val) {
    setFilterGroup(val);
    const params = {};
    if (filterType) params.group_type = filterType;
    if (val) params.group_name = val;
    if (query) params.q = query;
    load(params);
  }

  // 그룹별로 묶기
  const grouped = offices.reduce((acc, o) => {
    const key = o.group_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(o);
    return acc;
  }, {});

  function openNaver(address) {
    const encoded = encodeURIComponent(address);
    window.open(`https://map.naver.com/v5/search/${encoded}`, '_blank');
  }

  function callPhone(phone) {
    window.location.href = `tel:${phone}`;
  }

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

      {/* 검색 + 필터 */}
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="조직명, 주소, 관리자 검색"
            value={query} onChange={e => setQuery(e.target.value)}
            style={{ flex: 1 }} />
          <button type="submit" className="btn-secondary">검색</button>
        </form>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filterType} onChange={e => handleFilterType(e.target.value)} style={{ flex: 1 }}>
            <option value="">전체 구분</option>
            {GROUP_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={filterGroup} onChange={e => handleFilterGroup(e.target.value)} style={{ flex: 1 }}>
            <option value="">전체 그룹</option>
            {groupNames.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && offices.length === 0 && <div className="center-msg">등록된 사무실이 없습니다.</div>}
        {Object.entries(grouped).map(([groupName, items]) => (
          <section key={groupName}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 8, paddingLeft: 4 }}>
              📍 {groupName}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(office => {
                const ts = TYPE_STYLE[office.group_type] || TYPE_STYLE['센터'];
                return (
                  <div key={office.id} style={{
                    background: 'var(--bg)', border: '0.5px solid var(--border)',
                    borderRadius: 12, padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                          background: ts.bg, color: ts.color,
                        }}>{office.group_type}</span>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{office.org_name}</span>
                      </div>
                      {isMaster && (
                        <button onClick={() => nav(`/offices/${office.id}/edit`)} style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 6,
                          background: 'var(--bg2)', color: 'var(--text2)',
                          border: '0.5px solid var(--border)', cursor: 'pointer',
                        }}>수정</button>
                      )}
                    </div>

                    {/* 주소 - 누르면 네이버지도 */}
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
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
