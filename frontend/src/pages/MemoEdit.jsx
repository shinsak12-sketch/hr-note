import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';

const TAGS = ['회의', '현장', '임원', '기타'];
const EMPTY = {
  memo_date: new Date().toISOString().split('T')[0],
  title: '', content: '', tag: ''
};

export default function MemoEdit() {
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [memoId, setMemoId] = useState(id || null);
  const [delConfirm, setDelConfirm] = useState(false);
  const autoSaveTimer = useRef(null);
  const isNewRef = useRef(!id);

  useEffect(() => {
    if (isEdit) {
      api.getMemo(id).then(memo => {
        setForm({
          memo_date: memo.memo_date?.split?.('T')[0] || memo.memo_date || '',
          title: memo.title || '',
          content: memo.content || '',
          tag: memo.tag || '',
        });
        setSaved(true);
      });
    }
  }, [id]);

  const save = useCallback(async (formData, mid) => {
    setAutoSaving(true);
    try {
      if (mid) {
        await api.updateMemo(mid, formData);
      } else {
        const created = await api.createMemo(formData);
        setMemoId(created.id);
        isNewRef.current = false;
        return created.id;
      }
      setSaved(true);
    } catch (e) {
      // 저장 실패 무시
    } finally {
      setAutoSaving(false);
    }
  }, []);

  function setF(k, v) {
    const next = { ...form, [k]: v };
    setForm(next);
    setSaved(false);
    // 자동저장 디바운스 2초
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      save(next, memoId);
    }, 2000);
  }

  async function handleManualSave() {
    const newId = await save(form, memoId);
    if (newId) setMemoId(newId);
    setSaved(true);
  }

  async function handleDelete() {
    if (!delConfirm) { setDelConfirm(true); return; }
    if (memoId) await api.deleteMemo(memoId);
    nav('/memos-app', { replace: true });
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={async () => {
          if (!saved && form.content || form.title) await save(form, memoId);
          nav('/memos-app');
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          목록
        </button>
        <div style={{ fontSize: 12, color: autoSaving ? '#854F0B' : saved ? '#3B6D11' : 'var(--text2)' }}>
          {autoSaving ? '저장 중...' : saved ? '저장됨 ✓' : '미저장'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {memoId && (
            <button onClick={handleDelete} style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 8,
              background: delConfirm ? '#FCEBEB' : 'var(--bg2)',
              color: delConfirm ? '#A32D2D' : 'var(--text2)',
              border: '0.5px solid var(--border)', cursor: 'pointer',
            }}>{delConfirm ? '확인?' : '삭제'}</button>
          )}
          <button onClick={handleManualSave} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 8,
            background: '#5C3D8F', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600,
          }}>저장</button>
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
        {/* 날짜 + 태그 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="date" value={form.memo_date}
            onChange={e => setF('memo_date', e.target.value)}
            style={{ flex: 1 }} />
          <select value={form.tag} onChange={e => setF('tag', e.target.value)}
            style={{ flex: 1 }}>
            <option value="">태그 없음</option>
            {TAGS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* 제목 */}
        <input type="text" placeholder="제목 (선택)"
          value={form.title}
          onChange={e => setF('title', e.target.value)}
          style={{
            fontSize: 18, fontWeight: 600, border: 'none',
            borderBottom: '0.5px solid var(--border)',
            borderRadius: 0, background: 'transparent', padding: '8px 0',
          }} />

        {/* 내용 */}
        <textarea
          placeholder="내용을 입력하세요..."
          value={form.content}
          onChange={e => setF('content', e.target.value)}
          style={{
            flex: 1, border: 'none', background: 'transparent',
            fontSize: 15, lineHeight: 1.8, resize: 'none',
            minHeight: 'calc(100vh - 280px)', borderRadius: 0,
            padding: '8px 0',
          }}
          autoFocus={!isEdit}
        />
      </div>
    </div>
  );
}
