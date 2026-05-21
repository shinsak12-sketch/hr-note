import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

const MENUS = [
  { key: 'tasks',   label: '📌 업무지시' },
  { key: 'issues',  label: '📋 직원관리' },
  { key: 'memos',   label: '📝 메모장' },
  { key: 'offices', label: '🏢 사무실 주소' },
];

const WORK_TYPES = ['인사', '교육', '총무경리', '급여후생'];

export default function PermissionSettings() {
  const nav = useNavigate();
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    api.getPermissions().then(data => {
      const map = {};
      data.forEach(p => {
        let menus = p.allowed_menus;
        if (typeof menus === 'string') {
          try { menus = JSON.parse(menus); } catch { menus = []; }
        }
        map[p.work_type] = Array.isArray(menus) ? menus : [];
      });
      // 없는 work_type은 기본값으로 채우기
      WORK_TYPES.forEach(wt => { if (!map[wt]) map[wt] = []; });
      setPerms(map);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      // 기본값으로 세팅
      const map = {};
      WORK_TYPES.forEach(wt => { map[wt] = ['tasks','issues','memos','offices']; });
      setPerms(map);
      setLoading(false);
    });
  }, []);

  function toggle(workType, menuKey) {
    setPerms(prev => {
      const current = prev[workType] || [];
      const next = current.includes(menuKey)
        ? current.filter(m => m !== menuKey)
        : [...current, menuKey];
      return { ...prev, [workType]: next };
    });
  }

  async function handleSave(workType) {
    setSaving(workType);
    try {
      await api.updatePermission(workType, perms[workType] || []);
      setMsg(`✅ ${workType} 권한이 저장되었습니다.`);
    } catch (e) {
      setMsg('❌ 저장 실패: ' + e.message);
    } finally {
      setSaving('');
    }
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/settings')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          설정
        </button>
        <div className="header-title">권한 설정</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: '12px 16px 4px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
        업무구분별로 접근 가능한 메뉴를 설정하세요.<br/>
        체크된 메뉴만 해당 업무구분 사용자가 접근할 수 있어요.
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && <div className="center-msg">권한 정보 불러오는 중...</div>}
        {!loading && WORK_TYPES.map(workType => (
          <div key={workType} style={{
            background: 'var(--bg)', border: '0.5px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <div style={{
              padding: '12px 16px', background: 'var(--bg2)',
              borderBottom: '0.5px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>🏷️ {workType}</span>
              <button onClick={() => handleSave(workType)} style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 6,
                background: 'var(--green)', color: '#EAF3DE',
                border: 'none', cursor: 'pointer', fontWeight: 600,
              }}>{saving === workType ? '저장 중...' : '저장'}</button>
            </div>

            {/* 메뉴 체크리스트 */}
            <div style={{ padding: '8px 0' }}>
              {MENUS.map(menu => {
                const checked = (perms[workType] || []).includes(menu.key);
                return (
                  <label key={menu.key} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px', cursor: 'pointer',
                    borderBottom: '0.5px solid var(--border)',
                  }}>
                    <div onClick={() => toggle(workType, menu.key)} style={{
                      width: 22, height: 22, borderRadius: 6,
                      border: `2px solid ${checked ? 'var(--green)' : 'var(--border)'}`,
                      background: checked ? 'var(--green)' : 'var(--bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, cursor: 'pointer',
                    }}>
                      {checked && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 14, color: checked ? 'var(--text)' : 'var(--text2)' }}>
                      {menu.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {msg && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a19', color: '#fff', padding: '10px 20px',
          borderRadius: 20, fontSize: 13, zIndex: 100,
        }}>{msg}</div>
      )}
    </div>
  );
}
