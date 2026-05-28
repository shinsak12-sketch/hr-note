const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() { return localStorage.getItem('hr_token'); }

// ── 간단한 메모리 캐시 ──────────────────────
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30초

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL) { cache.delete(key); return null; }
  return item.data;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

export function invalidateCache(pattern) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

// stale-while-revalidate: 캐시 있으면 즉시 반환 + 백그라운드 갱신
async function cachedRequest(path, setter) {
  const cached = getCached(path);
  if (cached) {
    setter?.(cached); // 캐시 즉시 반환
    // 백그라운드로 최신 데이터 갱신
    request(path).then(fresh => {
      setCache(path, fresh);
      setter?.(fresh);
    }).catch(() => {});
    return cached;
  }
  const data = await request(path);
  setCache(path, data);
  return data;
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('hr_token');
    localStorage.removeItem('hr_user');
    window.location.href = '/login';
    return;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '오류가 발생했습니다.');
  return data;
}

export const api = {
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  requestAccount: (body) => request('/auth/request', { method: 'POST', body: JSON.stringify(body) }),
  getUsers: () => request('/auth/users'),
  updateUserStatus: (id, status) => request(`/auth/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),

  getIssues: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/issues${q ? '?' + q : ''}`);
  },
  getIssue: (id) => request(`/issues/${id}`),
  createIssue: (body) => request('/issues', { method: 'POST', body: JSON.stringify(body) }),
  updateIssue: (id, body) => request(`/issues/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteIssue: (id) => request(`/issues/${id}`, { method: 'DELETE' }),
  getSummary: () => request('/issues/stats/summary'),

  // 조치 이력
  getActions: (issueId) => request(`/issues/${issueId}/actions`),
  addAction: (issueId, body) => request(`/issues/${issueId}/actions`, { method: 'POST', body: JSON.stringify(body) }),
  deleteAction: (issueId, actionId) => request(`/issues/${issueId}/actions/${actionId}`, { method: 'DELETE' }),

  downloadTemplate: () => {
    const token = getToken();
    fetch(`${BASE}/issues/template/excel`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'HR노트_업로드양식.xlsx';
        a.click();
      });
  },

  uploadExcel: async (file) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/issues/upload/excel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '업로드 실패');
    return data;
  },

  exportExcel: () => {
    const token = getToken();
    fetch(`${BASE}/issues/export/excel`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'HR노트_이슈목록.xlsx';
        a.click();
      });
  },

  // 업무지시
  getTasks: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/tasks${q ? '?' + q : ''}`);
  },
  getTask: (id) => request(`/tasks/${id}`),
  createTask: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  updateTaskStatus: (id, status) => request(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  // 진행과정
  getProgress: (taskId) => request(`/tasks/${taskId}/progress`),
  addProgress: (taskId, body) => request(`/tasks/${taskId}/progress`, { method: 'POST', body: JSON.stringify(body) }),
  deleteProgress: (taskId, progressId) => request(`/tasks/${taskId}/progress/${progressId}`, { method: 'DELETE' }),

  // 메모
  getMemos: (q) => {
    const qs = q ? '?q=' + encodeURIComponent(q) : '';
    return cachedRequest('/memos' + qs);
  },
  getMemo: (id) => cachedRequest('/memos/' + id),
  shareMemo: (id, userIds) => request('/memos/' + id + '/share', { method: 'POST', body: JSON.stringify({ user_ids: userIds }) }),
  getMemoUnreadCount: () => request('/memos/unread-count'),
  markMemoRead: (id) => request('/memos/' + id + '/read', { method: 'PATCH' }),
  getMemoComments: (id) => request('/memos/' + id + '/comments'),
  addMemoComment: (id, content) => request('/memos/' + id + '/comments', { method: 'POST', body: JSON.stringify({ content }) }),
  deleteMemoComment: (memoId, id) => request('/memos/' + memoId + '/comments/' + id, { method: 'DELETE' }),
  getMemoShares: (id) => request('/memos/' + id + '/shares'),
  unshareMemo: (id, userId) => request('/memos/' + id + '/shares/' + userId, { method: 'DELETE' }),
  createMemo: (body) => request('/memos', { method: 'POST', body: JSON.stringify(body) }).then(r => { invalidateCache('/memos'); return r; }),
  updateMemo: (id, body) => request('/memos/' + id, { method: 'PUT', body: JSON.stringify(body) }).then(r => { invalidateCache('/memos'); return r; }),
  deleteMemo: (id) => request('/memos/' + id, { method: 'DELETE' }).then(r => { invalidateCache('/memos'); return r; }),

  // 사무실
  getEmployees: () => request('/employees'),
  downloadEmployeeTemplate: () => fetch(BASE + '/employees/template', { headers: { Authorization: 'Bearer ' + localStorage.getItem('hr_token') } }).then(r => r.blob()),
  uploadEmployees: (file) => { const fd = new FormData(); fd.append('file', file); return fetch(BASE + '/employees/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('hr_token') }, body: fd }).then(r => r.json()); },
  getOrgMap: () => cachedRequest('/orgmap'),
  addOrgMap: (body) => request('/orgmap', { method: 'POST', body: JSON.stringify(body) }),
  deleteOrgMap: (id) => request('/orgmap/' + id, { method: 'DELETE' }),
  downloadOrgMapTemplate: () => fetch(BASE + '/orgmap/template', { headers: { Authorization: 'Bearer ' + localStorage.getItem('hr_token') } }).then(r => r.blob()),
  uploadOrgMap: (file) => { const fd = new FormData(); fd.append('file', file); return fetch(BASE + '/orgmap/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('hr_token') }, body: fd }).then(r => r.json()); },
  getOffices: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return cachedRequest('/offices' + (q ? '?' + q : ''));
  },
  getOfficeHeadquarters: () => cachedRequest('/offices/headquarters'),
  getOfficeDepartments: (hq) => request('/offices/departments' + (hq ? '?headquarters=' + encodeURIComponent(hq) : '')),
  getOfficeOrgs: (hq, dept) => { const p = new URLSearchParams(); if(hq) p.set('headquarters',hq); if(dept) p.set('department',dept); return request('/offices/orgs' + (p.toString() ? '?' + p.toString() : '')); },
  getOffice: (id) => request('/offices/' + id),
  createOffice: (body) => request('/offices', { method: 'POST', body: JSON.stringify(body) }),
  updateOffice: (id, body) => request('/offices/' + id, { method: 'PUT', body: JSON.stringify(body) }),
  deleteOffice: (id) => request('/offices/' + id, { method: 'DELETE' }),
  downloadOfficeTemplate: () => {
    const token = localStorage.getItem('hr_token');
    fetch(BASE + '/offices/template/excel', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.blob()).then(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'HR노트_사무실양식.xlsx';
        a.click();
      });
  },
  uploadOfficeExcel: async (file) => {
    const token = localStorage.getItem('hr_token');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(BASE + '/offices/upload/excel', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '업로드 실패');
    return data;
  },

  // 사택신청
  checkDistance: (body) => request('/housing/check-distance', { method: 'POST', body: JSON.stringify(body) }),
  applyHousing: (body) => request('/housing/apply', { method: 'POST', body: JSON.stringify(body) }),
  getMyHousingStatus: (emp_no, password) => request('/housing/my-status', { method: 'POST', body: JSON.stringify({ emp_no, password }) }),
  submitSupplement: (id, emp_no, password, supplement) => request('/housing/supplement/' + id, { method: 'PATCH', body: JSON.stringify({ emp_no, password, supplement }) }),
  withdrawHousing: (id, emp_no, password) => request('/housing/withdraw/' + id, { method: 'DELETE', body: JSON.stringify({ emp_no, password }) }),
  getHousingRequests: () => cachedRequest('/housing'),
  getHousingStats: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('/housing/stats' + (q ? '?' + q : '')); },
  updateHousingStatus: (id, body) => request('/housing/' + id + '/status', { method: 'PATCH', body: JSON.stringify(body) }),
  updateHousingContract: (id, body) => request('/housing/' + id + '/contract', { method: 'PATCH', body: JSON.stringify(body) }),
  resetHousingPassword: (id) => request('/housing/' + id + '/reset-password', { method: 'PATCH' }),
  deleteHousingRequest: (id) => request('/housing/' + id, { method: 'DELETE' }).then(r => { invalidateCache('/housing'); return r; }),
  downloadHousingTemplate: () => {
    const token = localStorage.getItem('hr_token');
    fetch(BASE + '/housing/template/excel', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.blob()).then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'HR노트_사택등록양식.xlsx'; a.click(); });
  },
  uploadHousingExcel: async (file) => {
    const token = localStorage.getItem('hr_token');
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch(BASE + '/housing/upload/excel', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '업로드 실패');
    return data;
  },
  getHousingExceptions: () => request('/housing/exceptions'),
  checkHousingException: (emp_no) => request('/housing/exceptions/check/' + emp_no),
  addHousingException: (body) => request('/housing/exceptions', { method: 'POST', body: JSON.stringify(body) }),
  deleteHousingException: (id) => request('/housing/exceptions/' + id, { method: 'DELETE' }),

  // 자산관리
  getAssets: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('/assets' + (q ? '?' + q : '')); },
  getAssetStats: () => request('/assets/stats'),
  updateAsset: (id, body) => request('/assets/' + id, { method: 'PATCH', body: JSON.stringify(body) }),
  downloadAssetTemplate: () => {
    const token = localStorage.getItem('hr_token');
    fetch(BASE + '/assets/template/excel', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.blob()).then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'HR노트_자산등록양식.xlsx'; a.click(); });
  },
  uploadAssetExcel: async (file) => {
    const token = localStorage.getItem('hr_token');
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch(BASE + '/assets/upload/excel', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '업로드 실패');
    return data;
  },
  getAssetsByEmp: (emp_no, asset_type) => request('/assets/by-emp?emp_no=' + emp_no + (asset_type ? '&asset_type=' + encodeURIComponent(asset_type) : '')),
  submitAssetRequest: (body) => request('/assets/requests', { method: 'POST', body: JSON.stringify(body) }),
  getAssetRequests: () => request('/assets/requests'),
  updateAssetRequestStatus: (id, body) => request('/assets/requests/' + id + '/status', { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAssetRequest: (id) => request('/assets/requests/' + id, { method: 'DELETE' }),

  // 자산변경신고 추가
  getMyAssetRequests: (emp_no, password) => request('/assets/requests/my-status', { method: 'POST', body: JSON.stringify({ emp_no, password }) }),
  resetAssetRequestPassword: (id) => request('/assets/requests/' + id + '/reset-password', { method: 'PATCH' }),
  // 수선관리
  submitRepair: (body) => request('/repairs', { method: 'POST', body: JSON.stringify(body) }),
  getMyRepairs: (emp_no, password) => request('/repairs/my-status', { method: 'POST', body: JSON.stringify({ emp_no, password }) }),
  getRepairs: () => cachedRequest('/repairs'),
  addRepairDirect: (body) => request('/repairs/direct', { method: 'POST', body: JSON.stringify(body) }),
  updateRepairStatus: (id, body) => request('/repairs/' + id + '/status', { method: 'PATCH', body: JSON.stringify(body) }),
  resetRepairPassword: (id) => request('/repairs/' + id + '/reset-password', { method: 'PATCH' }),
  deleteRepair: (id) => request('/repairs/' + id, { method: 'DELETE' }),

  retrieveAsset: (id) => request('/assets/' + id + '/retrieve', { method: 'PATCH' }),
  deployAsset: (id, body) => request('/assets/' + id + '/deploy', { method: 'PATCH', body: JSON.stringify(body) }),
  // 음양력 변환
  solarToLunar: (year, month, day) => request('/lunar?type=sol2lun&solYear=' + year + '&solMonth=' + String(month).padStart(2,'0') + '&solDay=' + String(day).padStart(2,'0')),
  lunarToSolar: (year, month, day, leap) => request('/lunar?type=lun2sol&solYear=' + year + '&solMonth=' + String(month).padStart(2,'0') + '&solDay=' + String(day).padStart(2,'0') + (leap ? '&lunLeapmonth=Y' : '')),

  // 근태관리
  getAttendanceSplitCount: (emp_no, type, start_date) => request('/attendance/split-count?emp_no=' + emp_no + '&type=' + encodeURIComponent(type) + '&start_date=' + (start_date||'')),
  getAttendanceAlertCount: () => request('/attendance/alert-count'),
  getHousingPendingCount: () => request('/housing/pending-count'),
  getAttendance: (params={}) => { const q = new URLSearchParams(params).toString(); return cachedRequest('/attendance' + (q?'?'+q:'')); },
  getAttendanceStats: (params={}) => { const q = new URLSearchParams(params).toString(); return request('/attendance/stats' + (q?'?'+q:'')); },
  createAttendance: (body) => request('/attendance', { method: 'POST', body: JSON.stringify(body) }).then(r => { invalidateCache('/attendance'); return r; }),
  updateAttendance: (id, body) => request('/attendance/' + id, { method: 'PATCH', body: JSON.stringify(body) }).then(r => { invalidateCache('/attendance'); return r; }),
  closeAttendance: (id, body) => request('/attendance/' + id + '/close', { method: 'PATCH', body: JSON.stringify(body) }).then(r => { invalidateCache('/attendance'); return r; }),
  downloadAttendanceTemplate: () => fetch(BASE + '/attendance/template/excel', { headers: { Authorization: 'Bearer ' + localStorage.getItem('hr_token') } }).then(r => r.blob()),
  uploadAttendanceExcel: (file) => { const fd = new FormData(); fd.append('file', file); return fetch(BASE + '/attendance/upload/excel', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('hr_token') }, body: fd }).then(r => r.json()); },
  updateAttendanceComment: (id, comment) => request('/attendance/' + id + '/comment', { method: 'PATCH', body: JSON.stringify({ comment }) }),
  revertAttendance: (id) => request('/attendance/' + id + '/revert', { method: 'PATCH' }).then(r => { invalidateCache('/attendance'); return r; }),
  extendAttendance: (id, body) => request('/attendance/' + id + '/extend', { method: 'POST', body: JSON.stringify(body) }).then(r => { invalidateCache('/attendance'); return r; }),
  deleteAttendance: (id) => request('/attendance/' + id, { method: 'DELETE' }).then(r => { invalidateCache('/attendance'); return r; }),
};