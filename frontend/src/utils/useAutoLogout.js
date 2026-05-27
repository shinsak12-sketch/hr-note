import { useEffect, useRef, useState, useCallback } from 'react';

const TIMEOUT = 30 * 60; // 30분 (초)

export function useAutoLogout(onLogout) {
  const [remaining, setRemaining] = useState(TIMEOUT);
  const countRef = useRef(TIMEOUT);
  const timerRef = useRef(null);

  const reset = useCallback(() => {
    countRef.current = TIMEOUT;
    setRemaining(TIMEOUT);
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      countRef.current -= 1;
      setRemaining(countRef.current);
      if (countRef.current <= 0) {
        clearInterval(timerRef.current);
        onLogout?.();
      }
    }, 1000);

    const events = ['mousedown', 'touchstart', 'keydown', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));

    return () => {
      clearInterval(timerRef.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  }, [onLogout]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  const isWarning = remaining <= 300;

  return { display, isWarning };
}
