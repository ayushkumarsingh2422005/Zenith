import React, { useState } from 'react';
import { Scene, WeatherMode } from './components/Scene';

export default function App() {
  const [isBirdsEye, setIsBirdsEye] = useState(false);
  const [weather, setWeather] = useState<WeatherMode>('DAY');

  return (
    <div className="app-container">
      {/* 3D Scene */}
      <div className="scene-layer">
        <Scene isBirdsEye={isBirdsEye} weather={weather} />
      </div>

      {/* UI Overlay */}
      <div className="ui-layer-top">
        <div>
          <h1 className="app-title">ZENITH</h1>
          <p className="app-subtitle">Procedural Ecosystem</p>
        </div>
        
        {/* Weather Controls (Top Right) */}
        <div className="weather-toggle">
          <button
            onClick={() => setWeather('DAY')}
            className={`toggle-btn ${weather === 'DAY' ? 'active' : 'inactive'}`}
          >
            Day
          </button>
          <button
            onClick={() => setWeather('CLOUDY')}
            className={`toggle-btn ${weather === 'CLOUDY' ? 'active' : 'inactive'}`}
          >
            Cloudy
          </button>
        </div>
      </div>

      {/* Controls Container (Bottom Center) */}
      <div className="ui-layer-bottom">
        <button
          onClick={() => setIsBirdsEye(false)}
          className={`mode-btn ${!isBirdsEye ? 'active' : 'inactive'}`}
        >
          {/* SVG for Explore/Walk */}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>
          </svg>
          <span className="btn-label">Explore</span>
        </button>

        <button
          onClick={() => setIsBirdsEye(true)}
          className={`mode-btn ${isBirdsEye ? 'active' : 'inactive'}`}
        >
           {/* SVG for Map/Birdseye */}
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
             <line x1="8" y1="2" x2="8" y2="18"/>
             <line x1="16" y1="6" x2="16" y2="22"/>
           </svg>
          <span className="btn-label">Bird's Eye</span>
        </button>
      </div>

      {/* Instructions Overlay */}
      <div className="instructions-panel">
        <p className="instructions-title">Controls</p>
        <p className="instructions-text">Left Click Rotate • Right Click Pan • Scroll Zoom</p>
      </div>
    </div>
  );
}