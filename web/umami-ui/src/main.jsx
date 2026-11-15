import { createRoot } from 'react-dom/client';
import { useTheme } from '@umami/react-zen';
import '@umami/react-zen/styles.full.css';
import { App } from './App.jsx';

useTheme.getState().initTheme();

createRoot(document.getElementById('root')).render(<App />);
