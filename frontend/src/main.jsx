import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThemeToggle from './components/ThemeToggle';
import ProfileOverlay from './components/ProfileOverlay';
import './styles.css';
import './responsive.css';
import './premium.css';
import './profile.css';
import './habit-colors.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <ProfileOverlay />
    <div className="global-theme-control">
      <ThemeToggle compact />
    </div>
  </React.StrictMode>
);
