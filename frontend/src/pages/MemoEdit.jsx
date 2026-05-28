import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';

const TAGS = ['회의', '현장', '임원', '기타'];
const EMPTY = {
  memo_date: new Date().toISOString().split('T')[0],
  title: '', content: '', tag: ''
};

function ShareModal({ memoId, onClose }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.getUsers().then(data => {
      const me = JSON.parse(localStorage.getItem('hr_user') || '{}');
      setUsers(data.filter(u => u.status === 'active' && u.id !== me.id));
    });
  }, []);

  function toggle(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function handleShare() {
    if (!selected.length) return;
    setSharing(true);
    await api.shareMemo(memoId, selected);
    setDone(true);
    setSharing(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📤 메모 공유</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        {done ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.length}명에게 공유되었습니다!</div>
            <button onClick={onClose} style={{ marginTop: 16, padding: '8px 24px', borderRadius: 8, background: '#5C3D8F', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>닫기</button>
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {users.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>공유 가능한 사용자가 없습니다.</div>}
              {users.map(u => (
                <div key={u.id} onClick={() => toggle(u.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderBottom: '0.5px solid var(--border)', cursor: 'pointer',
                  background: selected.includes(u.id) ? '#F0EBF8' : 'var(--bg)',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: '#5C3D8F',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>{u.name?.[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>{u.work_type || u.username}</div>
                  </div>
                  {selected.includes(u.id) && <span style={{ color: '#5C3D8F', fontSize: 18 }}>✓</span>}
                </div>
              ))}
            </div>
            <div style={{ padding: 16 }}>
              <button onClick={handleShare} disabled={!selected.length || sharing} style={{
                width: '100%', height: 44, borderRadius: 10, background: selected.length ? '#5C3D8F' : 'var(--bg2)',
                color: selected.length ? '#fff' : 'var(--text2)', border: 'none', fontSize: 14, fontWeight: 700, cursor: selected.length ? 'pointer' : 'default',
              }}>{sharing ? '공유 중...' : `${selected.length}명에게 공유`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function MemoEdit() {
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [memoId, setMemoId] = useState(id || null);
  const [delConfirm, setDelConfirm] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [memoData, setMemoData] = useState(null);
  const autoSaveTimer = useRef(null);
  const memoIdRef = useRef(id || null);
  const savedRef = useRef(true);

  useEffect(() => {
    if (isEdit) {
      api.getMemo(id).then(memo => {
        setForm({
          memo_date: memo.memo_date?.split?.('T')[0] || memo.memo_date || '',
          title: memo.title || '',
          content: memo.content || '',
          tag: memo.tag || '',
        });
        setMemoData(memo);
        setSaved(true);
        savedRef.current = true;
      });
    }
  }, [id]);

  const save = useCallback(async (formData) => {
    setAutoSaving(true);
    try {
      if (memoIdRef.current) {
        await api.updateMemo(memoIdRef.current, formData);
      } else {
        const created = await api.createMemo(formData);
        memoIdRef.current = created.id;
        setMemoId(created.id);
      }
      setSaved(true);
      savedRef.current = true;
    } catch (e) {
      // 저장 실패
    } finally {
      setAutoSaving(false);
    }
  }, []);

  function setF(k, v) {
    const next = { ...form, [k]: v };
    setForm(next);
    setSaved(false);
    savedRef.current = false;
    // 자동저장 디바운스 2초
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      save(next);
    }, 2000);
  }

  async function handleManualSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    await save(form);
    // 저장 후 목록으로 이동
    nav('/memos-app', { replace: true });
  }

  async function handleBack() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    // 미저장 내용 있으면 저장 후 이동
    if (!savedRef.current && (form.content || form.title)) {
      await save(form);
    }
    nav('/memos-app');
  }

  async function handleDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (memoIdRef.current) await api.deleteMemo(memoIdRef.current);
    nav('/memos-app', { replace: true });
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={handleBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          목록
        </button>
        <div style={{ fontSize: 12, color: autoSaving ? '#854F0B' : saved ? '#3B6D11' : 'var(--text2)' }}>
          {autoSaving ? '저장 중...' : saved ? '저장됨 ✓' : '미저장'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {memoIdRef.current && !memoData?.is_shared && (
            <button onClick={() => setShareModal(true)} style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 8,
              background: '#F0EBF8', color: '#5C3D8F',
              border: '0.5px solid var(--border)', cursor: 'pointer',
            }}>공유</button>
          )}
          {memoIdRef.current && (
            <button onClick={handleDelete} style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 8,
              background: delConfirm ? '#FCEBEB' : 'var(--bg2)',
              color: delConfirm ? '#A32D2D' : 'var(--text2)',
              border: '0.5px solid var(--border)', cursor: 'pointer',
            }}>{delConfirm ? '확인?' : '삭제'}</button>
          )}
          {!memoData?.is_shared && (
            <button onClick={handleManualSave} style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 8,
              background: '#5C3D8F', color: '#fff',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}>저장</button>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
        {/* 공유받은 메모 표시 */}
        {memoData?.is_shared && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: '#F0EBF8', borderRadius: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#5C3D8F' }}>📤 공유됨</span>
            <span style={{ fontSize: 11, color: '#5C3D8F' }}>작성자: {memoData.shared_by_name}</span>
            <span style={{ fontSize: 11, color: '#7B2D8B', marginLeft: 'auto' }}>읽기전용</span>
          </div>
        )}

        {/* 날짜 + 태그 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={form.memo_date}
            onChange={e => setF('memo_date', e.target.value)}
            readOnly={memoData?.is_shared}
            style={{ flex: 1, ...(memoData?.is_shared ? { background: 'var(--bg2)', color: 'var(--text2)' } : {}) }} />
          <select value={form.tag} onChange={e => setF('tag', e.target.value)}
            disabled={memoData?.is_shared}
            style={{ flex: 1 }}>
            <option value="">태그 없음</option>
            {TAGS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* 제목 */}
        <input type="text" placeholder="제목 (선택)"
          value={form.title}
          onChange={e => setF('title', e.target.value)}
          readOnly={memoData?.is_shared}
          style={{
            fontSize: 18, fontWeight: 600, border: 'none',
            borderBottom: '0.5px solid var(--border)',
            borderRadius: 0, background: 'transparent', padding: '8px 0',
            ...(memoData?.is_shared ? { color: 'var(--text)' } : {})
          }} />

        {/* 내용 */}
        <textarea
          placeholder="내용을 입력하세요..."
          value={form.content}
          onChange={e => setF('content', e.target.value)}
          readOnly={memoData?.is_shared}
          style={{
            flex: 1, border: 'none', background: 'transparent',
            fontSize: 15, lineHeight: 1.8, resize: 'none',
            minHeight: 'calc(100vh - 280px)', borderRadius: 0,
            padding: '8px 0',
          }}
          autoFocus={!isEdit && !memoData?.is_shared}
        />
      </div>

      {shareModal && memoIdRef.current && (
        <ShareModal memoId={memoIdRef.current} onClose={() => setShareModal(false)} />
      )}
    </div>
  );
}
