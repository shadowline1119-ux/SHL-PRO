import React, { useEffect } from 'react';
import { History, X } from 'lucide-react';
import { EstimateLineItem, SavedProjectEstimate } from '../types/estimator';
import {
  ProjectVersionsSection,
  SaveProjectVersionPayload,
} from './ProjectVersionsSection';

interface ProjectVersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedEstimates: SavedProjectEstimate[];
  activeProjectName: string;
  activeItems: EstimateLineItem[];
  activeNetTotal: number;
  onSaveVersion: (payload: SaveProjectVersionPayload) => Promise<void>;
  onLoadVersion: (snapshot: SavedProjectEstimate) => void;
  onDeleteVersion: (id: string) => Promise<void>;
}

export function ProjectVersionsModal({
  isOpen,
  onClose,
  savedEstimates,
  activeProjectName,
  activeItems,
  activeNetTotal,
  onSaveVersion,
  onLoadVersion,
  onDeleteVersion,
}: ProjectVersionsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="versions-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <History className="w-5 h-5 text-amber-700 shrink-0" />
            <div className="min-w-0">
              <h2
                id="versions-modal-title"
                className="font-display text-base font-semibold text-slate-900 truncate"
              >
                Wersje projektu i historia zmian (IndexedDB)
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Zapisz zrzut bieżącego kosztorysu z tagiem wersji (np. Wstępny, Poprawiony, Ostateczny) lub przywróć wcześniejszą rewizję.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Zamknij okno wersji projektu"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <ProjectVersionsSection
            idPrefix="modal-ver"
            savedEstimates={savedEstimates}
            activeProjectName={activeProjectName}
            activeItems={activeItems}
            activeNetTotal={activeNetTotal}
            onSaveVersion={onSaveVersion}
            onLoadVersion={(snapshot) => {
              onLoadVersion(snapshot);
              onClose();
            }}
            onDeleteVersion={onDeleteVersion}
            initialViewMode={savedEstimates.length > 0 ? 'current' : 'all'}
          />
        </div>
      </div>
    </div>
  );
}
