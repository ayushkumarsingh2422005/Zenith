import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('index.tsx: Script loaded');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('index.tsx: Root element found', rootElement);

try {
  const root = ReactDOM.createRoot(rootElement);
  console.log('index.tsx: React root created');
  root.render(
    <App />
  );
  console.log('index.tsx: App rendered');
} catch (error) {
  console.error('index.tsx: Error rendering app:', error);
  throw error;
}