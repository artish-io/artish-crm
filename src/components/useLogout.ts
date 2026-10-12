'use client';

import { useCallback } from 'react';

/** Clears the session cookie and returns to the login page. */
export function useLogout() {
  return useCallback(async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }, []);
}
