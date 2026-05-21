import { useState, useEffect } from 'react';

const MENU_MAP = {
  tasks: '업무지시',
  issues: '직원관리',
  memos: '메모장',
  offices: '사무실 주소',
};

export function usePermission() {
  const user = JSON.parse(localStorage.getItem('hr_user') || '{}');

  function hasAccess(menuKey) {
    // 마스터는 전체 접근
    if (user.role === 'master') return true;
    // work_type 없으면 전체 접근 (기존 계정 호환)
    if (!user.work_type) return true;
    // allowed_menus 없으면 전체 접근
    if (!user.allowed_menus) return true;
    const menus = Array.isArray(user.allowed_menus) ? user.allowed_menus : JSON.parse(user.allowed_menus || '[]');
    return menus.includes(menuKey);
  }

  return { hasAccess, user, MENU_MAP };
}
