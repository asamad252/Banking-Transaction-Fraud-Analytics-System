import React from 'react';
import { createRoot } from 'react-dom/client';
import { Globals } from '@react-spring/web';
import App from './App.jsx';
import './styles.css';

// Honour the operating system's "reduce motion" setting: every spring in the
// app jumps straight to its end state instead of animating.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const applyMotionPreference = () => Globals.assign({ skipAnimation: reduceMotion.matches });
applyMotionPreference();
reduceMotion.addEventListener('change', applyMotionPreference);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
