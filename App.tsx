import React, { useState } from 'react';
import { Scene, WeatherMode } from './components/Scene';

export default function App() {
  const [isBirdsEye, setIsBirdsEye] = useState(false);
  const [weather, setWeather] = useState<WeatherMode>('DAY');

  return (
    <div className="relative w-full h-screen bg-gray-900 overflow-hidden">
      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Scene isBirdsEye={isBirdsEye} weather={weather} />
      </div>

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 z-10 pointer-events-none flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-light text-white tracking-widest drop-shadow-lg opacity-90">ZENITH</h1>
          <p className="text-sm text-gray-300 font-light mt-1 opacity-70">Procedural Ecosystem</p>
        </div>
        
        {/* Weather Controls (Top Right) */}
        <div className="flex gap-2 pointer-events-auto bg-black/20 backdrop-blur-md p-1 rounded-full border border-white/10">
          <button
            onClick={() => setWeather('DAY')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              weather === 'DAY' 
                ? 'bg-white text-black shadow-lg' 
                : 'text-white/70 hover:text-white'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setWeather('CLOUDY')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              weather === 'CLOUDY' 
                ? 'bg-white text-black shadow-lg' 
                : 'text-white/70 hover:text-white'
            }`}
          >
            Cloudy
          </button>
        </div>
      </div>

      {/* Controls Container (Bottom Center) */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 flex gap-4 pointer-events-auto">
        <button
          onClick={() => setIsBirdsEye(false)}
          className={`flex items-center gap-2 px-6 py-3 rounded-full backdrop-blur-md transition-all duration-300 border border-white/10 ${
            !isBirdsEye 
              ? 'bg-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
              : 'bg-black/30 text-gray-400 hover:bg-black/50'
          }`}
        >
          {/* SVG for Explore/Walk */}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>
          </svg>
          <span className="font-medium">Explore</span>
        </button>

        <button
          onClick={() => setIsBirdsEye(true)}
          className={`flex items-center gap-2 px-6 py-3 rounded-full backdrop-blur-md transition-all duration-300 border border-white/10 ${
            isBirdsEye 
              ? 'bg-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
              : 'bg-black/30 text-gray-400 hover:bg-black/50'
          }`}
        >
           {/* SVG for Map/Birdseye */}
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
             <line x1="8" y1="2" x2="8" y2="18"/>
             <line x1="16" y1="6" x2="16" y2="22"/>
           </svg>
          <span className="font-medium">Bird's Eye</span>
        </button>
      </div>

      {/* Instructions Overlay */}
      <div className="absolute bottom-8 right-8 z-10 pointer-events-none text-right hidden md:block">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Controls</p>
        <p className="text-white/80 text-sm">Left Click Rotate • Right Click Pan • Scroll Zoom</p>
      </div>
    </div>
  );
}