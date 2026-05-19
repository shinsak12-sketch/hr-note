const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('hr_token');
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
  getUsers: () => request('/auth/users'),
  addUser: (body) => request('/auth/users', { method: 'POST', body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
  changePassword: (id, password) => request(`/auth/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),

  getIssues: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/issues${q ? '?' + q : ''}`);
  },
  getIssue: (id) => request(`/issues/${id}`),
  createIssue: (body) => request('/issues', { method: 'POST', body: JSON.stringify(body) }),
  updateIssue: (id, body) => request(`/issues/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteIssue: (id) => request(`/issues/${id}`, { method: 'DELETE' }),
  getSummary: () => request('/issues/stats/summary'),
  exportExcel: () => {
    const token = getToken();
    const url = `${BASE}/issues/export/excel`;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HR노트_이슈목록.xlsx';
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(b => { a.href = URL.createObjectURL(b); a.click(); });
  },
};
