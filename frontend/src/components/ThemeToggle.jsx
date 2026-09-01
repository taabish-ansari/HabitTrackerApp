import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? ' compact' : ''}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
    >
      <span className="theme-icon" aria-hidden="true">{dark ? '☀' : '☾'}</span>
      <span className="theme-label">{dark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
