import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import AppHome from './pages/AppHome.jsx';
import AttendanceHome from './pages/AttendanceHome.jsx';
import AttendanceMgmt from './pages/AttendanceMgmt.jsx';
import AttendanceStats from './pages/AttendanceStats.jsx';
import IssueHome from './pages/IssueHome.jsx';
import EmpList from './pages/EmpList.jsx';
import IssueList from './pages/IssueList.jsx';
import IssueInput from './pages/IssueInput.jsx';
import IssueDetail from './pages/IssueDetail.jsx';
import AccountMgmt from './pages/AccountMgmt.jsx';
import AccountRequest from './pages/AccountRequest.jsx';
import Settings from './pages/Settings.jsx';
import PermissionSettings from './pages/PermissionSettings.jsx';
import Scoring from './pages/Scoring.jsx';
import TaskHome from './pages/TaskHome.jsx';
import TaskInput from './pages/TaskInput.jsx';
import TaskDetail from './pages/TaskDetail.jsx';
import MemoHome from './pages/MemoHome.jsx';
import MemoEdit from './pages/MemoEdit.jsx';
import OfficeHome from './pages/OfficeHome.jsx';
import OfficeInput from './pages/OfficeInput.jsx';
import GeneralHome from './pages/GeneralHome.jsx';
import HousingMgmt from './pages/HousingMgmt.jsx';
import HousingStats from './pages/HousingStats.jsx';
import HousingList from './pages/HousingList.jsx';
import HousingLanding from './pages/HousingLanding.jsx';
import HousingApply from './pages/HousingApply.jsx';
import HousingStatus from './pages/HousingStatus.jsx';
import AssetHome from './pages/AssetHome.jsx';
import AssetRequests from './pages/AssetRequests.jsx';
import AssetList from './pages/AssetList.jsx';
import AssetStock from './pages/AssetStock.jsx';
import AssetRequest from './pages/AssetRequest.jsx';
import AssetStatus from './pages/AssetStatus.jsx';
import RepairRequest from './pages/RepairRequest.jsx';
import RepairStatus from './pages/RepairStatus.jsx';
import RepairMgmt from './pages/RepairMgmt.jsx';
import RepairStats from './pages/RepairStats.jsx';
import RepairList from './pages/RepairList.jsx';
import HRCalc from './pages/HRCalc.jsx';
import ParentalLeaveCalc from './pages/ParentalLeaveCalc.jsx';
import PregnancyCalc from './pages/PregnancyCalc.jsx';
import LunarCalc from './pages/LunarCalc.jsx';
import LeaveCalc from './pages/LeaveCalc.jsx';
import MaternityCalc from './pages/MaternityCalc.jsx';
import { PermissionGuard } from './components/PermissionGuard.jsx';

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

      {/* 자산관리 */}
      <Route path="/asset-mgmt" element={<PrivateRoute><PermissionGuard menuKey="general"><AssetHome /></PermissionGuard></PrivateRoute>} />
      <Route path="/asset-requests" element={<PrivateRoute><PermissionGuard menuKey="general"><AssetRequests /></PermissionGuard></PrivateRoute>} />
      <Route path="/asset-list" element={<PrivateRoute><PermissionGuard menuKey="general"><AssetList /></PermissionGuard></PrivateRoute>} />
      <Route path="/asset-stock" element={<PrivateRoute><PermissionGuard menuKey="general"><AssetStock /></PermissionGuard></PrivateRoute>} />

      {/* 수선관리 */}
      <Route path="/repair-stats" element={<PrivateRoute><PermissionGuard menuKey="general"><RepairStats /></PermissionGuard></PrivateRoute>} />
      <Route path="/repair-mgmt" element={<PrivateRoute><PermissionGuard menuKey="general"><RepairMgmt /></PermissionGuard></PrivateRoute>} />
      <Route path="/repair-list" element={<PrivateRoute><PermissionGuard menuKey="general"><RepairList /></PermissionGuard></PrivateRoute>} />

      {/* 사택/장비/수선 신청 (로그인 불필요) */}
      <Route path="/dbsonsa" element={<HousingLanding />} />
      <Route path="/dbsonsa/new" element={<HousingApply />} />
      <Route path="/dbsonsa/status" element={<HousingStatus />} />
      <Route path="/dbsonsa/asset" element={<AssetRequest />} />
      <Route path="/dbsonsa/asset-status" element={<AssetStatus />} />
      <Route path="/dbsonsa/repair" element={<RepairRequest />} />
      <Route path="/dbsonsa/repair-status" element={<RepairStatus />} />

      <Route path="/" element={<PrivateRoute><AppHome /></PrivateRoute>} />

      {/* 업무지시 */}
      <Route path="/tasks-app" element={<PrivateRoute><PermissionGuard menuKey="tasks"><TaskHome /></PermissionGuard></PrivateRoute>} />
      <Route path="/tasks/new" element={<PrivateRoute><PermissionGuard menuKey="tasks"><TaskInput /></PermissionGuard></PrivateRoute>} />
      <Route path="/tasks/:id" element={<PrivateRoute><PermissionGuard menuKey="tasks"><TaskDetail /></PermissionGuard></PrivateRoute>} />
      <Route path="/tasks/:id/edit" element={<PrivateRoute><PermissionGuard menuKey="tasks"><TaskInput /></PermissionGuard></PrivateRoute>} />

      {/* 직원관리 */}
      <Route path="/issues-app" element={<PrivateRoute><PermissionGuard menuKey="issues"><IssueHome /></PermissionGuard></PrivateRoute>} />
      <Route path="/emp" element={<PrivateRoute><PermissionGuard menuKey="issues"><EmpList /></PermissionGuard></PrivateRoute>} />
      <Route path="/issues" element={<PrivateRoute><PermissionGuard menuKey="issues"><IssueList /></PermissionGuard></PrivateRoute>} />
      <Route path="/issues/new" element={<PrivateRoute><PermissionGuard menuKey="issues"><IssueInput /></PermissionGuard></PrivateRoute>} />
      <Route path="/issues/:id" element={<PrivateRoute><PermissionGuard menuKey="issues"><IssueDetail /></PermissionGuard></PrivateRoute>} />
      <Route path="/issues/:id/edit" element={<PrivateRoute><PermissionGuard menuKey="issues"><IssueInput /></PermissionGuard></PrivateRoute>} />
      <Route path="/scoring" element={<PrivateRoute><PermissionGuard menuKey="issues"><Scoring /></PermissionGuard></PrivateRoute>} />

      {/* 메모장 */}
      <Route path="/memos-app" element={<PrivateRoute><PermissionGuard menuKey="memos"><MemoHome /></PermissionGuard></PrivateRoute>} />
      <Route path="/memos/new" element={<PrivateRoute><PermissionGuard menuKey="memos"><MemoEdit /></PermissionGuard></PrivateRoute>} />
      <Route path="/memos/:id" element={<PrivateRoute><PermissionGuard menuKey="memos"><MemoEdit /></PermissionGuard></PrivateRoute>} />

      {/* 사무실 주소 */}
      <Route path="/offices-app" element={<PrivateRoute><PermissionGuard menuKey="offices"><OfficeHome /></PermissionGuard></PrivateRoute>} />
      <Route path="/offices/new" element={<MasterRoute><OfficeInput /></MasterRoute>} />
      <Route path="/offices/:id/edit" element={<MasterRoute><OfficeInput /></MasterRoute>} />

      <Route path="/hr-calc" element={<PrivateRoute><HRCalc /></PrivateRoute>} />
      <Route path="/hr-calc/parental-leave" element={<PrivateRoute><ParentalLeaveCalc /></PrivateRoute>} />
      <Route path="/hr-calc/pregnancy" element={<PrivateRoute><PregnancyCalc /></PrivateRoute>} />
      <Route path="/hr-calc/lunar" element={<PrivateRoute><LunarCalc /></PrivateRoute>} />
      <Route path="/hr-calc/leave" element={<PrivateRoute><LeaveCalc /></PrivateRoute>} />
      <Route path="/hr-calc/maternity" element={<PrivateRoute><MaternityCalc /></PrivateRoute>} />

      {/* 총무지원 */}
      <Route path="/general-app" element={<PrivateRoute><PermissionGuard menuKey="general"><GeneralHome /></PermissionGuard></PrivateRoute>} />
      <Route path="/attendance-app" element={<PrivateRoute><PermissionGuard menuKey="attendance"><AttendanceHome /></PermissionGuard></PrivateRoute>} />
      <Route path="/attendance-stats" element={<PrivateRoute><PermissionGuard menuKey="attendance"><AttendanceStats /></PermissionGuard></PrivateRoute>} />
      <Route path="/attendance-mgmt" element={<PrivateRoute><PermissionGuard menuKey="attendance"><AttendanceMgmt /></PermissionGuard></PrivateRoute>} />
      <Route path="/housing-stats" element={<PrivateRoute><PermissionGuard menuKey="general"><HousingStats /></PermissionGuard></PrivateRoute>} />
      <Route path="/housing-mgmt" element={<PrivateRoute><PermissionGuard menuKey="general"><HousingMgmt /></PermissionGuard></PrivateRoute>} />
      <Route path="/housing-list" element={<PrivateRoute><PermissionGuard menuKey="general"><HousingList /></PermissionGuard></PrivateRoute>} />

      {/* 설정/계정 */}
      <Route path="/settings/permissions" element={<MasterRoute><PermissionSettings /></MasterRoute>} />
      <Route path="/settings" element={<MasterRoute><Settings /></MasterRoute>} />
      <Route path="/accounts" element={<MasterRoute><AccountMgmt /></MasterRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
