import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import EmpList from './pages/EmpList.jsx';
import IssueList from './pages/IssueList.jsx';
import IssueInput from './pages/IssueInput.jsx';
import IssueDetail from './pages/IssueDetail.jsx';
import AccountMgmt from './pages/AccountMgmt.jsx';
import AccountRequest from './pages/AccountRequest.jsx';
import Settings from './pages/Settings.jsx';
import Scoring from './pages/Scoring.jsx';

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
      <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="/emp" element={<PrivateRoute><EmpList /></PrivateRoute>} />
      <Route path="/issues" element={<PrivateRoute><IssueList /></PrivateRoute>} />
      <Route path="/issues/new" element={<PrivateRoute><IssueInput /></PrivateRoute>} />
      <Route path="/issues/:id" element={<PrivateRoute><IssueDetail /></PrivateRoute>} />
      <Route path="/issues/:id/edit" element={<PrivateRoute><IssueInput /></PrivateRoute>} />
      <Route path="/settings" element={<MasterRoute><Settings /></MasterRoute>} />
      <Route path="/scoring" element={<PrivateRoute><Scoring /></PrivateRoute>} />
      <Route path="/accounts" element={<MasterRoute><AccountMgmt /></MasterRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
