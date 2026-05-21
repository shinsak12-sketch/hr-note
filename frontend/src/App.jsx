import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import AppHome from './pages/AppHome.jsx';
import IssueHome from './pages/IssueHome.jsx';
import EmpList from './pages/EmpList.jsx';
import IssueList from './pages/IssueList.jsx';
import IssueInput from './pages/IssueInput.jsx';
import IssueDetail from './pages/IssueDetail.jsx';
import AccountMgmt from './pages/AccountMgmt.jsx';
import AccountRequest from './pages/AccountRequest.jsx';
import Settings from './pages/Settings.jsx';
import Scoring from './pages/Scoring.jsx';
import TaskHome from './pages/TaskHome.jsx';
import TaskInput from './pages/TaskInput.jsx';
import TaskDetail from './pages/TaskDetail.jsx';
import MemoHome from './pages/MemoHome.jsx';
import MemoEdit from './pages/MemoEdit.jsx';
import OfficeHome from './pages/OfficeHome.jsx';
import OfficeInput from './pages/OfficeInput.jsx';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('hr_token');
  return token ? children : <Navigate to="/login" replace />;
}

function MasterRoute({ children }) {
  const token = localStorage.getItem('hr_token');
  const user = JSON.parse(localStorage.getItem('hr_user') || '{}');
  if (!token) return <Navigate to="/login" replace />;
  if (user.role !== 'master') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/request" element={<AccountRequest />} />

      {/* 앱 목록 홈 */}
      <Route path="/" element={<PrivateRoute><AppHome /></PrivateRoute>} />

      {/* 이슈관리 */}
      <Route path="/issues-app" element={<PrivateRoute><IssueHome /></PrivateRoute>} />
      <Route path="/emp" element={<PrivateRoute><EmpList /></PrivateRoute>} />
      <Route path="/issues" element={<PrivateRoute><IssueList /></PrivateRoute>} />
      <Route path="/issues/new" element={<PrivateRoute><IssueInput /></PrivateRoute>} />
      <Route path="/issues/:id" element={<PrivateRoute><IssueDetail /></PrivateRoute>} />
      <Route path="/issues/:id/edit" element={<PrivateRoute><IssueInput /></PrivateRoute>} />
      <Route path="/scoring" element={<PrivateRoute><Scoring /></PrivateRoute>} />

      {/* 업무지시 */}
      <Route path="/tasks-app" element={<PrivateRoute><TaskHome /></PrivateRoute>} />
      <Route path="/tasks/new" element={<PrivateRoute><TaskInput /></PrivateRoute>} />
      <Route path="/tasks/:id" element={<PrivateRoute><TaskDetail /></PrivateRoute>} />
      <Route path="/tasks/:id/edit" element={<PrivateRoute><TaskInput /></PrivateRoute>} />

      {/* 메모장 */}
      <Route path="/memos-app" element={<PrivateRoute><MemoHome /></PrivateRoute>} />
      <Route path="/memos/new" element={<PrivateRoute><MemoEdit /></PrivateRoute>} />
      <Route path="/memos/:id" element={<PrivateRoute><MemoEdit /></PrivateRoute>} />

      {/* 사무실 주소 */}
      <Route path="/offices-app" element={<PrivateRoute><OfficeHome /></PrivateRoute>} />
      <Route path="/offices/new" element={<MasterRoute><OfficeInput /></MasterRoute>} />
      <Route path="/offices/:id/edit" element={<MasterRoute><OfficeInput /></MasterRoute>} />

      {/* 설정/계정 */}
      <Route path="/settings" element={<MasterRoute><Settings /></MasterRoute>} />
      <Route path="/accounts" element={<MasterRoute><AccountMgmt /></MasterRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
