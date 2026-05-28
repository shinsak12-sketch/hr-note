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
  const [shares, setShares] = useState([]);
  const [selected, setSelected] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const me = JSON.parse(localStorage.getItem('hr_user') || '{}');
    Promise.all([
      api.getUsers(),
      api.getMemoShares(memoId),
    ]).then(([allUsers, existingShares]) => {
      setShares(existingShares);
      const sharedUserIds = new Set(existingShares.map(s => s.user_id));
      setUsers(allUsers.filter(u => u.status === 'active' && u.id !== me.id && !sharedUserIds.has(u.id)));
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
      <div style={{ background: 'var(--bg)', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: '16px 16px 0 0', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
              {/* 기존 공유자 */}
              {shares.length > 0 && (
                <>
                  <div style={{ padding: '10px 16px 6px', fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg2)' }}>공유됨 ({shares.length}명)</div>
                  {shares.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--bg2)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#5C3D8F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{s.name?.[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#F0EBF8', color: '#5C3D8F', fontWeight: 600 }}>공유됨</span>
                      <button onClick={async () => {
                        if (!window.confirm(`${s.name}님의 공유를 취소할까요?`)) return;
                        await api.unshareMemo(memoId, s.user_id);
                        setShares(prev => prev.filter(x => x.id !== s.id));
                        setUsers(prev => [...prev, { id: s.user_id, name: s.name }]);
                      }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', fontSize: 18, padding: '0 2px' }}>×</button>
                    </div>
                  ))}
                </>
              )}

              {/* 추가 공유 가능한 사용자 */}
              {users.length > 0 && (
                <>
                  <div style={{ padding: '10px 16px 6px', fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>추가 공유</div>
                  {users.map(u => (
                    <div key={u.id} onClick={() => toggle(u.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                      borderBottom: '0.5px solid var(--border)', cursor: 'pointer',
                      background: selected.includes(u.id) ? '#F0EBF8' : 'var(--bg)',
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#5C3D8F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{u.name?.[0]}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{u.work_type || u.username}</div>
                      </div>
                      {selected.includes(u.id) && <span style={{ color: '#5C3D8F', fontSize: 18 }}>✓</span>}
                    </div>
                  ))}
                </>
              )}
              {users.length === 0 && shares.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>공유 가능한 사용자가 없습니다.</div>
              )}
              {users.length === 0 && shares.length > 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>모든 사용자에게 공유되었습니다.</div>
              )}
            </div>
            {users.length > 0 && (
              <div style={{ padding: 16, borderTop: '0.5px solid var(--border)' }}>
                <button onClick={handleShare} disabled={!selected.length || sharing} style={{
                  width: '100%', height: 44, borderRadius: 10,
                  background: selected.length ? '#5C3D8F' : 'var(--bg2)',
                  color: selected.length ? '#fff' : 'var(--text2)',
                  border: 'none', fontSize: 14, fontWeight: 700,
                  cursor: selected.length ? 'pointer' : 'default',
                }}>{sharing ? '공유 중...' : selected.length ? `${selected.length}명에게 공유` : '공유할 사용자 선택'}</button>
              </div>
            )}
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
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
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
        api.getAttachments(id).then(setAttachments);
        api.getMemoComments(id).then(setComments);
        if (memo.is_shared && !memo.is_read) api.markMemoRead(id).catch(() => {});
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
    if (!delConfirm) {
      setDelConfirm(true);
      setTimeout(() => setDelConfirm(false), 3000); // 3초 후 자동 초기화
      return;
    }
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

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, paddingBottom: 40 }}>
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
          onChange={e => {
            setF('content', e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.max(200, e.target.scrollHeight) + 'px';
          }}
          onFocus={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.max(200, e.target.scrollHeight) + 'px';
          }}
          readOnly={memoData?.is_shared}
          style={{
            border: 'none', background: 'transparent',
            fontSize: 15, lineHeight: 1.8, resize: 'none',
            minHeight: 200, height: 'auto', borderRadius: 0,
            padding: '8px 0', overflow: 'hidden',
          }}
          autoFocus={!isEdit && !memoData?.is_shared}
        />

        {/* 첨부파일 */}
        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4, paddingBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>📎 첨부파일{attachments.length > 0 ? ` (${attachments.length})` : ''}</span>
            {!memoData?.is_shared && memoIdRef.current && (
              <label style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', border: '0.5px solid var(--border)' }}>
                {uploading ? '업로드 중...' : '+ 파일 추가'}
                <input type="file" style={{ display: 'none' }} multiple onChange={async (e) => {
                  if (!memoIdRef.current) return;
                  setUploading(true);
                  try {
                    const sign = await api.getAttachmentSign();
                    for (const file of e.target.files) {
                      const fd = new FormData();
                      fd.append('file', file);
                      fd.append('api_key', sign.api_key);
                      fd.append('timestamp', sign.timestamp);
                      fd.append('signature', sign.signature);
                      fd.append('folder', sign.folder);
                      const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloud_name}/auto/upload`, { method: 'POST', body: fd });
                      const data = await res.json();
                      const att = await api.saveAttachment(memoIdRef.current, {
                        file_name: file.name,
                        file_url: data.secure_url,
                        file_type: file.type,
                        file_size: file.size,
                      });
                      setAttachments(a => [...a, att]);
                    }
                  } finally {
                    setUploading(false);
                    e.target.value = '';
                  }
                }} />
              </label>
            )}
          </div>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map(att => {
                const isImage = att.file_type?.startsWith('image/') ||
                  /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(att.file_url || att.file_name || '');
                return (
                  <div key={att.id} style={{ border: '0.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {isImage && (
                      <img
                        src={att.file_url.replace('/upload/', '/upload/w_800,c_limit,q_auto,f_auto/')}
                        alt={att.file_name}
                        style={{ width: '100%', height: 'auto', display: 'block', background: 'var(--bg2)' }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
                      <span style={{ fontSize: 18 }}>{isImage ? '🖼️' : '📄'}</span>
                      <a href={att.file_url} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: 12, color: '#1A4A8A', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {att.file_name}
                      </a>
                      <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>{att.file_size ? Math.round(att.file_size/1024) + 'KB' : ''}</span>
                      {!memoData?.is_shared && (
                        <button onClick={async () => {
                          if (!window.confirm('첨부파일을 삭제하시겠습니까?')) return;
                          try {
                            await api.deleteAttachment(att.id);
                            setAttachments(a => a.filter(x => x.id !== att.id));
                          } catch(e) { alert('삭제 실패: ' + e.message); }
                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>×</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 댓글 섹션 - 저장된 메모이면 모두 표시 */}
        {isEdit && memoIdRef.current && (
          <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>
              💬 댓글 {comments.length > 0 ? `(${comments.length})` : ''}
            </div>
            {comments.map(c => {
              const me = JSON.parse(localStorage.getItem('hr_user') || '{}');
              return (
                <div key={c.id} style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#5C3D8F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {c.user_name?.[0]}
                  </div>
                  <div style={{ flex: 1, background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{c.user_name}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--text2)' }}>{new Date(c.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        {String(c.user_id) === String(me.id) && (
                          <button onClick={async () => {
                            await api.deleteMemoComment(memoIdRef.current, c.id);
                            setComments(cs => cs.filter(x => x.id !== c.id));
                          }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', fontSize: 13, padding: 0 }}>×</button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>{c.content}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                type="text" placeholder="댓글 입력..." value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    const c = await api.addMemoComment(memoIdRef.current, commentText.trim());
                    setComments(cs => [...cs, c]);
                    setCommentText('');
                  }
                }}
                style={{ flex: 1, height: 36, fontSize: 13 }}
              />
              <button onClick={async () => {
                if (!commentText.trim()) return;
                const c = await api.addMemoComment(memoIdRef.current, commentText.trim());
                setComments(cs => [...cs, c]);
                setCommentText('');
              }} style={{ height: 36, padding: '0 14px', borderRadius: 8, background: '#5C3D8F', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>등록</button>
            </div>
          </div>
        )}

      </div>

      {shareModal && memoIdRef.current && (
        <ShareModal memoId={memoIdRef.current} onClose={() => setShareModal(false)} />
      )}
    </div>
  );
}
