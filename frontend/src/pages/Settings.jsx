import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';

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
  const [msg, setMsg] = useState('');

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const res = await onUpload(file);
      setResult(res);
      setMsg(`✅ ${res.success}건 등록 완료!`);
      setFile(null);
    } catch (e) {
      setMsg('❌ 업로드 실패: ' + e.message);
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
        onChange={e => { setFile(e.target.files[0]); setMsg(''); }}
        style={{ height: 'auto', padding: '8px 12px', fontSize: 13 }} />
      {file && <div style={{ fontSize: 12, color: 'var(--text2)' }}>선택: {file.name}</div>}
      <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? '업로드 중...' : '📤 업로드'}
      </button>
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('✅') ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{msg}</div>}
      {result?.errors?.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>
          {result.errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}

function OrgMapSection() {
  const [list, setList] = useState([]);
  const [inputName, setInputName] = useState('');
  const [offices, setOffices] = useState([]);
  const [mappedOrg, setMappedOrg] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.getOrgMap().then(setList);
    api.getOffices().then(setOffices);
  }, []);

  async function handleDownload() {
    const blob = await api.downloadOrgMapTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'orgmap_template.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    setToast('업로드 중...');
    const result = await api.uploadOrgMap(file);
    setToast(`${result.inserted}건 등록 완료`);
    api.getOrgMap().then(setList);
    e.target.value = '';
  }

  async function handleAdd() {
    if (!inputName || !mappedOrg) return;
    setSaving(true);
    await api.addOrgMap({ input_name: inputName, mapped_org_name: mappedOrg });
    setInputName(''); setMappedOrg('');
    api.getOrgMap().then(setList);
    setSaving(false);
  }

  async function handleDelete(id) {
    await api.deleteOrgMap(id);
    api.getOrgMap().then(setList);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
        업로드 데이터의 소속명과 사무실 조직명이 다를 경우 매핑하세요.
      </div>
      {/* 엑셀 업로드 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleDownload} style={{ flex: 1, height: 36, borderRadius: 8, background: 'var(--bg2)', border: '0.5px solid var(--border)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          📥 양식 다운로드
        </button>
        <label style={{ flex: 1, height: 36, borderRadius: 8, background: '#EAF3DE', color: '#3B6D11', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontWeight: 600 }}>
          📤 엑셀 업로드
          <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleUpload} />
        </label>
      </div>
      {toast && <div style={{ fontSize: 12, color: '#3B6D11', background: '#EAF3DE', borderRadius: 6, padding: '6px 10px' }}>{toast}</div>}
      {/* 수기 추가 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '0.5px solid var(--border)', paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>수기 추가</div>
        <input type="text" placeholder="업로드 소속명" value={inputName} onChange={e => setInputName(e.target.value)} />
        <select value={mappedOrg} onChange={e => setMappedOrg(e.target.value)}>
          <option value="">실제 조직명 선택</option>
          {offices.map(o => <option key={o.id} value={o.org_name}>{o.org_name}</option>)}
        </select>
        <button onClick={handleAdd} disabled={!inputName || !mappedOrg || saving}
          style={{ height: 36, borderRadius: 8, background: '#1A4A8A', color: '#E8F0FB', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          {saving ? '추가 중...' : '+ 추가'}
        </button>
      </div>
      {list.length > 0 && (
        <div style={{ border: '0.5px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {list.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: i < list.length-1 ? '0.5px solid var(--border)' : 'none', fontSize: 12 }}>
              <div>
                <span style={{ color: 'var(--text2)' }}>{item.input_name}</span>
                <span style={{ margin: '0 6px', color: 'var(--text2)' }}>→</span>
                <span style={{ fontWeight: 600 }}>{item.mapped_org_name}</span>
              </div>
              <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A32D2D', fontSize: 16 }}>×</button>
            </div>
          ))}
        </div>
      )}
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
            description="양식을 다운받아 작성 후 업로드하세요.<br/><span style='color:#A32D2D'>* 이슈구분: 질병/노무/사고/사건/기타<br/>* 심각도: 상/중/하 &nbsp;* 날짜: YYYY-MM-DD</span>"
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

        {/* 조직명 매핑 */}
        <AccordionSection title="조직명 매핑 관리" icon="🗂️">
          <OrgMapSection />
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
