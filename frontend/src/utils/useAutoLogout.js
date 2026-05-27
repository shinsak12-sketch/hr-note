import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const TIMEOUT = 30 * 60; // 30분 (초)

export function useAutoLogout() {
  const nav = useNavigate();
  const [remaining, setRemaining] = useState(TIMEOUT);
  const timerRef = useRef(null);
  const countRef = useRef(TIMEOUT);

  const reset = useCallback(() => {
    countRef.current = TIMEOUT;
    setRemaining(TIMEOUT);
  }, []);

  function logout() {
    localStorage.removeItem('hr_token');
    localStorage.removeItem('hr_user');
    nav('/login', { replace: true });
  }

  useEffect(() => {
    // 1초마다 카운트다운
    timerRef.current = setInterval(() => {
      countRef.current -= 1;
      setRemaining(countRef.current);
      if (countRef.current <= 0) {
        clearInterval(timerRef.current);
        logout();
      }
    }, 1000);

    // 사용자 동작 감지 → 초기화
    const events = ['mousedown', 'touchstart', 'keydown', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));

    return () => {
      clearInterval(timerRef.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, []);

  // mm:ss 포맷
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  const isWarning = remaining <= 300; // 5분 이하

  return { display, isWarning, remaining };
}
