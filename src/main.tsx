import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {inject} from '@vercel/analytics';
import App, { ErrorBoundary } from './App.tsx';
import './index.css';

inject();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
