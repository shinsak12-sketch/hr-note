import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Toast } from '../components/Common.jsx';

function AccordionSection({ title, icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', background: 'var(--bg)', border: 'none', cursor: 'pointer',
        textAlign: 'left',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '0.5px solid var(--border)', background: 'var(--bg2)' }}>
          <div style={{ paddingTop: 14 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

function UploadSection({ description, onDownload, onUpload, downloadLabel }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState('');

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const res = await onUpload(file);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}
        dangerouslySetInnerHTML={{ __html: description }} />
      <button className="btn-secondary" style={{ width: '100%' }} onClick={onDownload}>
        📥 {downloadLabel || '양식 다운로드'}
      </button>
      <input type="file" accept=".xlsx,.xls"
        onChange={e => setFile(e.target.files[0])}
        style={{ height: 'auto', padding: '8px 12px', fontSize: 13 }} />
      {file && <div style={{ fontSize: 12, color: 'var(--text2)' }}>선택: {file.name}</div>}
      <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? '업로드 중...' : '📤 업로드'}
      </button>
      {result && (
        <div style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>✅ {result.success}건 등록 완료 (전체 {result.total}건)</span>
          {result.errors?.length > 0 && (
            <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>
              {result.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  );
}

export default function Settings() {
  const nav = useNavigate();

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

      <div className="page-content" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* 이슈 업로드 */}
        <AccordionSection title="이슈 일괄 등록" icon="📋">
          <UploadSection
            description="양식을 다운받아 작성 후 업로드하세요.<br/><span style='color:#A32D2D'>* 이슈구분: 질병/노무/사고/사건/기타<br/>* 심각도: 상/중/하 &nbsp; * 날짜: YYYY-MM-DD</span>"
            downloadLabel="이슈 양식 다운로드"
            onDownload={() => api.downloadTemplate()}
            onUpload={(file) => api.uploadExcel(file)}
          />
        </AccordionSection>

        {/* 사무실 업로드 */}
        <AccordionSection title="사무실 일괄 등록" icon="🏢">
          <UploadSection
            description="양식을 다운받아 작성 후 업로드하세요.<br/><span style='color:#A32D2D'>* 본부명/조직명/주소는 필수<br/>* 부서명은 본부 직속이면 빈칸</span>"
            downloadLabel="사무실 양식 다운로드"
            onDownload={() => api.downloadOfficeTemplate()}
            onUpload={(file) => api.uploadOfficeExcel(file)}
          />
        </AccordionSection>

        {/* 권한 설정 */}
        <AccordionSection title="권한 설정" icon="🔐">
          <button onClick={() => nav('/settings/permissions')} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 10,
            border: '0.5px solid var(--border)', background: 'var(--bg)',
            cursor: 'pointer', width: '100%', textAlign: 'left',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>업무구분별 메뉴 권한 설정</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>인사/교육/총무경리/급여후생별 접근 메뉴 관리</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
        </AccordionSection>

        {/* 계정 관리 */}
        <AccordionSection title="계정 관리" icon="👥">
          <button onClick={() => nav('/accounts')} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 10,
            border: '0.5px solid var(--border)', background: 'var(--bg)',
            cursor: 'pointer', width: '100%', textAlign: 'left',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>계정 관리 페이지로 이동</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>승인 대기 처리 및 계정 관리</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
        </AccordionSection>

      </div>
    </div>
  );
}
