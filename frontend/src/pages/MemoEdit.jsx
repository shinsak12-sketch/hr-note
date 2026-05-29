import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../utils/api.js';

const TAGS = ['회의', '현장', '임원', '기타'];
const EMPTY = {
  memo_date: new Date().toISOString().split('T')[0],
  title: '', content: '', tag: ''
};

// ── AI 대화 모달 ──────────────────────────
function AIChatModal({ onClose, onSave }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const res = await api.aiChat(newMessages);
      setMessages(m => [...m, { role: 'assistant', content: res.content }]);
    } catch(e) {
      setMessages(m => [...m, { role: 'assistant', content: '오류가 발생했습니다: ' + e.message }]);
    } finally { setLoading(false); }
  }

  async function handleSaveMemo() {
    if (messages.length === 0) return;
    // 대화 내용을 메모 형식으로 변환
    const content = messages.map(m =>
      `${m.role === 'user' ? '👤 나' : '🤖 AI'}: ${m.content}`
    ).join('\n\n');
    onSave(content);
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
      <div style={{ background:'var(--bg)', width:'100%', maxWidth:480, margin:'0 auto', borderRadius:'16px 16px 0 0', height:'80vh', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'0.5px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>🤖 AI 대화</div>
          <div style={{ display:'flex', gap:8 }}>
            {messages.length > 0 && (
              <button onClick={handleSaveMemo} style={{ fontSize:12, padding:'5px 12px', borderRadius:8, background:'#5C3D8F', color:'#fff', border:'none', cursor:'pointer', fontWeight:600 }}>
                요약 저장
              </button>
            )}
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text2)' }}>×</button>
          </div>
        </div>

        {/* 대화 영역 */}
        <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:12 }}>
          {messages.length === 0 && (
            <div style={{ textAlign:'center', color:'var(--text2)', fontSize:13, marginTop:40 }}>
              무엇이든 물어보세요 😊
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display:'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'80%', padding:'10px 14px', borderRadius: m.role==='user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: m.role==='user' ? '#5C3D8F' : 'var(--bg2)',
                color: m.role==='user' ? '#fff' : 'var(--text)',
                fontSize:13, lineHeight:1.6, whiteSpace:'pre-wrap'
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display:'flex', justifyContent:'flex-start' }}>
              <div style={{ padding:'10px 14px', borderRadius:'16px 16px 16px 4px', background:'var(--bg2)', fontSize:13, color:'var(--text2)' }}>
                ···
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 입력 영역 */}
        <div style={{ padding:'12px 16px', borderTop:'0.5px solid var(--border)', display:'flex', gap:8, flexShrink:0, paddingBottom:28 }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="메시지 입력..." style={{ flex:1, height:40, fontSize:13 }}
            disabled={loading}
          />
          <button onClick={handleSend} disabled={!input.trim() || loading}
            style={{ height:40, padding:'0 16px', borderRadius:8, background:'#5C3D8F', color:'#fff', border:'none', cursor:'pointer', fontSize:13, fontWeight:600, flexShrink:0 }}>
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [aiModal, setAiModal] = useState(false);
  const [commentText, setCommentText] = useState('');
  const textareaRef = useRef(null);
  const autoSaveTimer = useRef(null);
  const memoIdRef = useRef(id || null);
  const savedRef = useRef(true);

  function adjustHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(200, el.scrollHeight) + 'px';
  }

  useEffect(() => {
    if (form.content !== undefined) {
      setTimeout(adjustHeight, 50);
    }
  }, [form.content]);

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
            <button onClick={() => setAiModal(true)} style={{
              fontSize: 12, padding: '5px 10px', borderRadius: 8,
              background: '#1A4A8A', color: '#E8F0FB',
              border: 'none', cursor: 'pointer', fontWeight: 600,
            }}>🤖 AI</button>
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
          ref={textareaRef}
          placeholder="내용을 입력하세요..."
          value={form.content}
          onChange={e => {
            setF('content', e.target.value);
            adjustHeight();
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

      {aiModal && (
        <AIChatModal
          onClose={() => setAiModal(false)}
          onSave={async (content) => {
            const me = JSON.parse(localStorage.getItem('hr_user') || '{}');
            const newMemo = await api.createMemo({
              title: `AI 대화 ${new Date().toLocaleDateString('ko-KR')}`,
              content,
              memo_date: new Date().toISOString().split('T')[0],
              tag: 'AI',
              is_ai: true,
            });
            setAiModal(false);
            nav('/memos/' + newMemo.id);
          }}
        />
      )}
      {shareModal && memoIdRef.current && (
        <ShareModal memoId={memoIdRef.current} onClose={() => setShareModal(false)} />
      )}
    </div>
  );
}
