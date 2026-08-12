import { useState, useEffect } from 'react';

export type AdminTheme = 'dark' | 'light';

const STORAGE_KEY = 'imoflex_admin_theme';

export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminTheme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'light' || stored === 'dark') ? stored : 'dark';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return { theme, toggle };
}
