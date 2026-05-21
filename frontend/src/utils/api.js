const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() { return localStorage.getItem('hr_token'); }

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
};
