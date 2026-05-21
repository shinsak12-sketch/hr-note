import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function MemoHome() {
  const nav = useNavigate();
  const [memos, setMemos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    const data = await api.getMemos(q);
    setMemos(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  function handleSearch(e) {
    e.preventDefault();
    load(query);
  }

  const TAG_COLORS = {
    '회의': { bg: '#E8F0FB', color: '#1A4A8A' },
    '현장': { bg: '#EAF3DE', color: '#3B6D11' },
    '임원': { bg: '#FCEBEB', color: '#A32D2D' },
    '기타': { bg: '#F0F0EE', color: '#5F5E5A' },
  };

  function tagStyle(tag) {
    return TAG_COLORS[tag] || { bg: '#FAEEDA', color: '#854F0B' };
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">메모장</div>
        <button onClick={() => nav('/memos/new')} style={{
          background: '#5C3D8F', color: '#fff', border: 'none',
          borderRadius: 8, padding: '6px 12px', fontSize: 13,
          fontWeight: 600, cursor: 'pointer',
        }}>+ 작성</button>
      </div>

      {/* 검색 */}
      <form className="search-bar" onSubmit={handleSearch}>
        <input type="text" placeholder="제목, 내용, 태그 검색"
          value={query} onChange={e => setQuery(e.target.value)} />
        <button type="submit" className="btn-secondary">검색</button>
      </form>

      <div className="page-content" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div className="center-msg">불러오는 중...</div>}
        {!loading && memos.length === 0 && <div className="center-msg">메모가 없습니다.</div>}
        {memos.map(memo => {
          const ts = tagStyle(memo.tag);
          const dateStr = memo.memo_date?.split?.('T')[0] || memo.memo_date || '';
          return (
            <div key={memo.id}
              style={{
                background: 'var(--bg)', border: '0.5px solid var(--border)',
                borderLeft: '4px solid #5C3D8F',
                borderRadius: 12, padding: '14px 16px',
              }}>
              {/* 상단: 날짜 + 태그 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{dateStr}</span>
                {memo.tag && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: ts.bg, color: ts.color,
                  }}>#{memo.tag}</span>
                )}
              </div>
              {/* 제목 */}
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}
                onClick={() => nav(`/memos/${memo.id}`)}>
                {memo.title || <span style={{ color: 'var(--text2)', fontWeight: 400 }}>제목 없음</span>}
              </div>
              {/* 내용 미리보기 */}
              {memo.content && (
                <div style={{
                  fontSize: 13, color: 'var(--text2)', lineHeight: 1.5,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  marginBottom: 10, cursor: 'pointer',
                }} onClick={() => nav(`/memos/${memo.id}`)}>
                  {memo.content}
                </div>
              )}
              {/* 수정/삭제 버튼 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => nav(`/memos/${memo.id}`)}
                  style={{
                    flex: 1, height: 34, borderRadius: 8,
                    background: '#F0EBF8', color: '#5C3D8F',
                    border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>✏️ 수정</button>
                <button onClick={async () => {
                  if (!window.confirm('이 메모를 삭제할까요?')) return;
                  await api.deleteMemo(memo.id);
                  load(query);
                }}
                  style={{
                    flex: 1, height: 34, borderRadius: 8,
                    background: '#FCEBEB', color: '#A32D2D',
                    border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>🗑️ 삭제</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
