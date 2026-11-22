import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'amber';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Potwierdź',
  cancelLabel = 'Anuluj',
  tone = 'amber',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const confirmBtnClass =
    tone === 'danger'
      ? 'bg-red-700 hover:bg-red-800 text-white'
      : 'bg-amber-700 hover:bg-amber-800 text-white';

  const iconWrapClass =
    tone === 'danger'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${iconWrapClass}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="confirm-dialog-title"
                className="font-display text-sm font-semibold text-slate-900"
              >
                {title}
              </h2>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Zamknij okno potwierdzenia"
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
