import { useState, useEffect } from 'react';

const PERMISSIONS = {
  '인사':    ['tasks', 'issues', 'memos', 'offices', 'general'],
  '교육':    ['tasks', 'memos', 'offices', 'general'],
  '총무경리': ['tasks', 'memos', 'offices', 'general'],
  '급여후생': ['tasks', 'memos', 'offices', 'general'],
};

export function usePermission() {
  const user = JSON.parse(localStorage.getItem('hr_user') || '{}');

  function hasAccess(menuKey) {
    if (user.role === 'master') return true;
    if (!user.work_type) return true;
    const allowed = PERMISSIONS[user.work_type];
    if (!allowed) return true;
    return allowed.includes(menuKey);
  }

  return { hasAccess, user };
}
