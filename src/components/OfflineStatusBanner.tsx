import React from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineStatusBanner() {
  const { isOnline, swNeedRefresh, applySwUpdate } = useOnlineStatus();

  if (isOnline && !swNeedRefresh) {
    return null;
  }

  return (
    <div className="no-print space-y-2 mb-4">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-950"
        >
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              <strong>Tryb offline (lokalna baza SQLite i folder Dokumenty)</strong> — wszystkie zmiany zapisują się lokalnie na dysku i są oznaczane jako oczekujące na synchronizację. Oferty PDF, eksporty Excel (.xlsx), CSV, kalkulator oraz raporty R/M/S działają w 100% bez internetu.
            </span>
          </div>
        </div>
      )}

      {swNeedRefresh && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs text-slate-800"
        >
          <span>Dostępna jest zaktualizowana wersja aplikacji do pracy offline.</span>
          <button
            type="button"
            onClick={applySwUpdate}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Zastosuj aktualizację</span>
          </button>
        </div>
      )}
    </div>
  );
}
