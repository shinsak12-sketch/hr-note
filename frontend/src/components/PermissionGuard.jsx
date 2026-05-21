import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../utils/usePermission.js';

export function PermissionGuard({ menuKey, children }) {
  const { hasAccess } = usePermission();
  const nav = useNavigate();
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!hasAccess(menuKey)) {
      setDenied(true);
    }
  }, [menuKey]);

  if (denied) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        {/* 팝업 */}
        <div style={{
          background: 'var(--bg)', border: '0.5px solid var(--border)',
          borderRadius: 16, padding: 28, textAlign: 'center',
          maxWidth: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            접근 권한이 없습니다
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 24 }}>
            이 메뉴에 접근할 수 있는<br/>권한이 없습니다.<br/>관리자에게 문의하세요.
          </div>
          <button className="btn-primary" onClick={() => nav('/')}>
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return children;
}
