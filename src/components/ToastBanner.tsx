import React from 'react';
import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';

export interface ToastItem {
  id: string;
  message: string;
  tone?: 'success' | 'info' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastBannerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastBanner({ toasts, onDismiss }: ToastBannerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="no-print fixed bottom-4 right-4 z-40 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-auto pointer-events-none"
    >
      {toasts.slice(-3).map((toast) => {
        const tone = toast.tone ?? 'success';
        const Icon =
          tone === 'warning'
            ? AlertTriangle
            : tone === 'info'
            ? Info
            : CheckCircle2;
        const iconColor =
          tone === 'warning'
            ? 'text-amber-400'
            : tone === 'info'
            ? 'text-sky-400'
            : 'text-emerald-400';

        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-slate-900 text-white border border-slate-700 shadow-lg px-3.5 py-2.5 text-xs"
          >
            <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
            <span className="flex-1 leading-snug text-slate-100">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  onDismiss(toast.id);
                }}
                className="px-2 py-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200 hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              type="button"
              aria-label="Zamknij powiadomienie"
              onClick={() => onDismiss(toast.id)}
              className="p-0.5 text-slate-400 hover:text-white rounded transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
