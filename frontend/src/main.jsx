import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ThemeToggle from './components/ThemeToggle';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <div className="global-theme-control">
      <ThemeToggle compact />
    </div>
  </React.StrictMode>
);
