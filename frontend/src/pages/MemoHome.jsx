import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

function MemoCard({ memo, dateStr, ts, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  return (
    <div style={{
      background: 'var(--bg)', border: '0.5px solid var(--border)',
      borderLeft: `4px solid ${memo.is_shared ? '#1A6A6A' : '#5C3D8F'}`,
      background: memo.is_shared ? '#F0F8F8' : 'var(--bg)',
      borderRadius: 12, padding: '14px 16px', position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* 클릭 영역 */}
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={onEdit}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{dateStr}</span>
            {memo.tag && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: ts.bg, color: ts.color,
              }}>#{memo.tag}</span>
            )}
            {memo.is_shared && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#F0EBF8', color: '#5C3D8F' }}>
                📤 공유받음 · {memo.shared_by_name}
              </span>
            )}
            {memo.is_shared && !memo.is_read && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FCEBEB', color: '#A32D2D' }}>
                NEW
              </span>
            )}
            {!memo.is_shared && memo.share_count > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#EAF3DE', color: '#3B6D11' }}>
                📤 공유됨 · {memo.share_count}명
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
            {memo.title || <span style={{ color: 'var(--text2)', fontWeight: 400 }}>제목 없음</span>}
          </div>
          {memo.content && (
            <div style={{
              fontSize: 13, color: 'var(--text2)', lineHeight: 1.5,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {memo.content}
            </div>
          )}
        </div>

        {/* 햄버거 버튼 */}
        <div ref={menuRef} style={{ position: 'relative', marginLeft: 8, flexShrink: 0 }}>
          <button onClick={() => setOpen(o => !o)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 6px', borderRadius: 6, color: 'var(--text2)',
            fontSize: 18, lineHeight: 1,
          }}>⋮</button>
          {open && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 50,
              background: 'var(--bg)', border: '0.5px solid var(--border)',
              borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              overflow: 'hidden', minWidth: 100,
            }}>
              <button onClick={() => { setOpen(false); onEdit(); }} style={{
                display: 'block', width: '100%', padding: '12px 16px',
                border: 'none', background: 'none', textAlign: 'left',
                fontSize: 14, cursor: 'pointer', color: '#5C3D8F', fontWeight: 600,
              }}>✏️ 수정</button>
              <div style={{ height: '0.5px', background: 'var(--border)' }} />
              <button onClick={() => { setOpen(false); onDelete(); }} style={{
                display: 'block', width: '100%', padding: '12px 16px',
                border: 'none', background: 'none', textAlign: 'left',
                fontSize: 14, cursor: 'pointer', color: '#A32D2D', fontWeight: 600,
              }}>🗑️ 삭제</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
            <MemoCard key={memo.id} memo={memo} dateStr={dateStr} ts={ts}
              onEdit={() => nav(`/memos/${memo.id}`)}
              onDelete={async () => {
                if (!window.confirm('이 메모를 삭제할까요?')) return;
                await api.deleteMemo(memo.id);
                load(query);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
