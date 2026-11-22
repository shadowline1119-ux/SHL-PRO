import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 text-amber-700" />
        <span>Zainstaluj offline</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
        >
          <Share className="w-3.5 h-3.5 text-amber-700" />
          <span>Zapisz na iPad / iPhone</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          >
            <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 p-5 shadow-xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 id="ios-pwa-title" className="font-display text-sm font-semibold text-slate-900">
                  Instalacja offline na iPad / iPhone
                </h3>
                <button
                  type="button"
                  aria-label="Zamknij instrukcję"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Naciśnij przycisk <strong>Udostępnij</strong> (ikona ze strzałką w górę) na pasku przeglądarki Safari.
                </li>
                <li>
                  Przewiń listę i wybierz <strong>Do ekranu początkowego</strong>.
                </li>
                <li>
                  Zatwierdź <strong>Dodaj</strong> — aplikacja SHL PRO uruchomi się jak program natywny i zachowa kosztorysy oraz cenniki kruszyw bez zasięgu w terenie.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-amber-700 rounded-lg transition-colors"
              >
                Rozumiem
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
