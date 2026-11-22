import { useEffect, useState } from 'react';

export interface OnlineAndSwStatus {
  isOnline: boolean;
  swOfflineReady: boolean;
  swNeedRefresh: boolean;
  applySwUpdate: () => void;
}

export function useOnlineStatus(): OnlineAndSwStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [swOfflineReady, setSwOfflineReady] = useState<boolean>(false);
  const [swNeedRefresh, setSwNeedRefresh] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleSwReady = () => setSwOfflineReady(true);
    const handleSwNeedRefresh = () => setSwNeedRefresh(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('terenkoszt:sw-ready', handleSwReady);
    window.addEventListener('terenkoszt:sw-need-refresh', handleSwNeedRefresh);

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg && (reg.active || reg.waiting || reg.installing)) {
          setSwOfflineReady(true);
        }
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('terenkoszt:sw-ready', handleSwReady);
      window.removeEventListener('terenkoszt:sw-need-refresh', handleSwNeedRefresh);
    };
  }, []);

  const applySwUpdate = () => {
    window.dispatchEvent(new CustomEvent('terenkoszt:sw-apply-update'));
  };

  return {
    isOnline,
    swOfflineReady,
    swNeedRefresh,
    applySwUpdate,
  };
}
