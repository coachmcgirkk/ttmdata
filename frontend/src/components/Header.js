import React from 'react';
import './Header.css';

const Header = () => {
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="logo-section">
          <img 
            src="/logo-thumbnail.svg" 
            alt="BLE Traffic Monitor" 
            className="header-logo"
          />
          <div className="logo-text">
            <h1>Trapii</h1>
            <p>GPS Traffic Monitoring & Data Intelligence</p>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="status-indicator">
            <span className="status-dot"></span>
            <span className="status-text">Connected</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 