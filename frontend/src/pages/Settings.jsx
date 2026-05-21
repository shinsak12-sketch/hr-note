import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

export default function Settings() {
  const nav = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState('');

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const res = await api.uploadExcel(file);
      setResult(res);
      setToast(`${res.success}건 등록 완료!`);
      setFile(null);
    } catch (e) {
      setToast('업로드 실패: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="app-container">
      <div className="header">
        <button className="header-back" onClick={() => nav('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
          홈
        </button>
        <div className="header-title">설정</div>
        <div style={{ width: 40 }} />
      </div>

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 엑셀 업로드 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>📊 이슈 일괄 등록 (엑셀 업로드)</div>
          <div className="detail-section">
            <div className="detail-row" style={{ flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                양식을 다운받아 작성 후 업로드하세요.<br/>
                <span style={{ color: 'var(--red)', fontSize: 12 }}>* 이슈구분: 질병/노무/사고/사건/기타</span><br/>
                <span style={{ color: 'var(--red)', fontSize: 12 }}>* 심각도: 상/중/하</span><br/>
                <span style={{ color: 'var(--red)', fontSize: 12 }}>* 날짜: YYYY-MM-DD 형식</span>
              </div>
              <button className="btn-secondary" style={{ width: '100%' }} onClick={() => api.downloadTemplate()}>
                📥 양식 다운로드
              </button>
            </div>
            <div className="detail-row" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
              <input type="file" accept=".xlsx,.xls"
                onChange={e => setFile(e.target.files[0])}
                style={{ height: 'auto', padding: '8px 12px', fontSize: 13 }}
              />
              {file && (
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>선택된 파일: {file.name}</div>
              )}
              <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? '업로드 중...' : '📤 업로드'}
              </button>
            </div>
            {result && (
              <div className="detail-row" style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>
                  ✅ {result.success}건 등록 완료 (전체 {result.total}건)
                </div>
                {result.errors.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--red)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ 오류 {result.errors.length}건:</div>
                    {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 계정 관리 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>👥 계정 관리</div>
          <button onClick={() => nav('/accounts')} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', borderRadius: 12,
            border: '0.5px solid var(--border)', background: 'var(--bg)',
            cursor: 'pointer', textAlign: 'left', width: '100%',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'var(--green-light)', fontSize: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>👥</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>계정 관리</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>승인 대기 처리 및 계정 관리</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
        </section>

      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}
