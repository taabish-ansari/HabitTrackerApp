import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThemeToggle from './components/ThemeToggle';
import ProfileOverlay from './components/ProfileOverlay';
import HabitDetailOverlay from './components/HabitDetailOverlay';
import './styles.css';
import './responsive.css';
import './premium.css';
import './profile.css';
import './habit-colors.css';
import './today.css';
import './mobile-font.css';
import './completion-motion.css';
import './reorder.css';
import './mobile-premium.css';
import './mobile-compact.css';
import './habit-detail.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <ProfileOverlay />
    <HabitDetailOverlay />
    <div className="global-theme-control">
      <ThemeToggle compact />
    </div>
  </React.StrictMode>
);
