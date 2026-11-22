import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';
import './index.css';

const updateSW = registerSW({
  immediate: true,
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('terenkoszt:sw-ready'));
  },
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('terenkoszt:sw-need-refresh'));
  },
});

window.addEventListener('terenkoszt:sw-apply-update', () => {
  updateSW(true);
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
