import { useEffect, useState } from 'react';

const STORAGE_KEY = 'habittracker-theme';

function getInitialTheme() {
  return 'dark';
}

export function useTheme() {
  const [theme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return { theme, toggleTheme: () => {} };
}
