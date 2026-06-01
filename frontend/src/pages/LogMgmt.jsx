import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function LogMgmt() {
  const nav = useNavigate();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [page, actionFilter]);

  async function load() {
    setLoading(true);
    const data = await api.getLogs({ page, limit: 50, user_name: search, action: actionFilter });
    setLogs(data.list || []);
    setTotal(data.total || 0);
    setLoading(false);
  }

  const ACTIONS = ['로그인', '근태등록', '근태삭제', '사택등록', '사택신청', '메모작성', '메모삭제'];

  const fmt = (d) => {
    const dt = new Date(d);
    return `${dt.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })} ${dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const ACTION_COLOR = {
    '로그인': { bg: '#E8F0FB', color: '#1A4A8A' },
    '근태등록': { bg: '#EAF3DE', color: '#3B6D11' },
    '근태삭제': { bg: '#FCEBEB', color: '#A32D2D' },
    '사택등록': { bg: '#E6F4F4', color: '#2D6A6A' },
    '사택신청': { bg: '#F0EBF8', color: '#5C3D8F' },
    '메모작성': { bg: '#FAEEDA', color: '#854F0B' },
    '메모삭제': { bg: '#FCEBEB', color: '#A32D2D' },
  };

  return (
    <div className="container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/settings')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          뒤로
        </button>
        <div className="header-title">📋 접속/이용 로그</div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>총 {total}건</div>
      </div>

      <div style={{ padding: '10px 16px 0', display: 'flex', gap: 8 }}>
        <input placeholder="🔍 이름 검색" value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          style={{ flex: 1 }} />
        <button onClick={load} style={{ padding: '0 14px', height: 40, borderRadius: 8, background: '#1A4A8A', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>검색</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <button onClick={() => { setActionFilter(''); setPage(1); }}
          style={{ padding: '4px 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: !actionFilter ? '#1A4A8A' : 'var(--bg2)', color: !actionFilter ? '#fff' : 'var(--text2)', fontFamily: 'inherit' }}>전체</button>
        {ACTIONS.map(a => (
          <button key={a} onClick={() => { setActionFilter(a); setPage(1); }}
            style={{ padding: '4px 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              background: actionFilter === a ? (ACTION_COLOR[a]?.color || '#1A4A8A') : 'var(--bg2)',
              color: actionFilter === a ? '#fff' : 'var(--text2)',
            }}>{a}</button>
        ))}
      </div>

      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>로그 없음</div>
        ) : logs.map(log => (
          <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
              background: ACTION_COLOR[log.action]?.bg || 'var(--bg2)',
              color: ACTION_COLOR[log.action]?.color || 'var(--text2)'
            }}>{log.action}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{log.user_name || '-'}</div>
              {log.detail && <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.detail}</div>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap', textAlign: 'right' }}>
              <div>{fmt(log.created_at)}</div>
              {log.ip && <div style={{ fontSize: 10 }}>{log.ip.replace('::ffff:', '')}</div>}
            </div>
          </div>
        ))}

        {/* 페이지네이션 */}
        {total > 50 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
              style={{ padding: '6px 14px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>이전</button>
            <span style={{ fontSize: 12, padding: '6px 10px', color: 'var(--text2)' }}>{page} / {Math.ceil(total/50)}</span>
            <button onClick={() => setPage(p => p+1)} disabled={page >= Math.ceil(total/50)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>다음</button>
          </div>
        )}
      </div>
    </div>
  );
}
