import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  Copy,
  FileDown,
  FilePlus2,
  FolderOpen,
  Menu,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import type { SavedProjectEstimate } from '../types/estimator';
import { formatPLN } from '../utils/calculations';
import { getHeaderTitleForTab, getNextWorkflowStep } from '../utils/navigation';
import { ActiveTab } from './SidebarNav';
import { PWAInstallButton } from './PWAInstallButton';

interface TopHeaderProps {
  activeTab: ActiveTab;
  projectName: string;
  isOnline: boolean;
  savedVersionsCount: number;
  recentProjects: SavedProjectEstimate[];
  onOpenMobileMenu: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onGoToOfferPdf: () => void;
  onRenameProject: (nextName: string) => void;
  onNewProject: () => void;
  onDuplicateProject: () => void;
  onOpenVersionsModal: () => void;
  onLoadProject: (project: SavedProjectEstimate) => void;
  onRequestResetDemo: () => void;
}

export function TopHeader({
  activeTab,
  projectName,
  isOnline,
  savedVersionsCount,
  recentProjects,
  onOpenMobileMenu,
  onSelectTab,
  onGoToOfferPdf,
  onRenameProject,
  onNewProject,
  onDuplicateProject,
  onOpenVersionsModal,
  onLoadProject,
  onRequestResetDemo,
}: TopHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftName(projectName);
  }, [projectName]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setIsRenaming(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setIsRenaming(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const handleCommitRename = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftName.trim();
    if (cleaned) {
      onRenameProject(cleaned);
    }
    setIsRenaming(false);
    setMenuOpen(false);
  };

  const nextStep = getNextWorkflowStep(activeTab);

  return (
    <header className="no-print bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Otwórz menu nawigacji"
          className="lg:hidden p-2 -ml-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>

        <img
          src="/assets/aistudio/Metaliczny_znak_marki_SHL_PRO_cf0c8d3e.png"
          alt="Logo SHL PRO"
          className="lg:hidden w-8 h-8 rounded-lg object-contain border border-slate-200 shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="relative inline-block max-w-full" ref={menuRef}>
            <button
              type="button"
              onClick={() => {
                setMenuOpen((prev) => !prev);
                setIsRenaming(false);
                setDraftName(projectName);
              }}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="Zarządzaj aktywnym projektem (zmiana nazwy, nowy projekt, duplikat, ostatnie kosztorysy)"
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-md px-1.5 py-0.5 -ml-1.5 hover:bg-slate-100 transition-colors max-w-full"
            >
              <span className="hidden sm:inline text-slate-400 whitespace-nowrap">Projekt:</span>
              <span className="truncate max-w-[190px] sm:max-w-[320px] font-semibold text-slate-800">
                {projectName}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute left-0 mt-1.5 w-[310px] max-w-[90vw] rounded-xl bg-white border border-slate-200 shadow-xl py-2 z-50 text-xs"
              >
                {isRenaming ? (
                  <form onSubmit={handleCommitRename} className="px-3 py-2 space-y-2 border-b border-slate-100">
                    <label htmlFor="header-rename-input" className="block text-[11px] font-medium text-slate-600">
                      Nowa nazwa projektu
                    </label>
                    <input
                      id="header-rename-input"
                      type="text"
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsRenaming(false)}
                        className="px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100 rounded"
                      >
                        Anuluj
                      </button>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded"
                      >
                        <Check className="w-3 h-3" />
                        <span>Zapisz</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setIsRenaming(true)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Zmień nazwę projektu</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onNewProject();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                >
                  <FilePlus2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Nowy pusty kosztorys</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onDuplicateProject();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Duplikuj bieżący kosztorys</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenVersionsModal();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <BookmarkPlus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Zapisz wersję / Historia</span>
                  </span>
                  {savedVersionsCount > 0 && (
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">
                      {savedVersionsCount}
                    </span>
                  )}
                </button>

                {recentProjects.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                    <div className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Ostatnie projekty
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {recentProjects.map((proj) => (
                        <button
                          key={proj.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onLoadProject(proj);
                            setMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-3.5 py-1.5 text-left hover:bg-slate-50"
                        >
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate text-slate-800 font-medium">{proj.name}</span>
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                            {formatPLN(proj.netTotal)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onRequestResetDemo();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-slate-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Przywróć wzorzec demonstracyjny</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <h1 className="font-display text-base sm:text-lg font-semibold text-slate-900 mt-0.5 truncate">
            {getHeaderTitleForTab(activeTab)}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
          {isOnline ? 'Online' : 'Tryb offline'} · Zapis lokalny
        </span>

        <PWAInstallButton />

        {nextStep && nextStep.tab !== 'oferta' && (
          <button
            type="button"
            onClick={() => onSelectTab(nextStep.tab)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Dalej: {nextStep.label}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}

        {activeTab !== 'oferta' ? (
          <button
            type="button"
            onClick={onGoToOfferPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-700 rounded-lg hover:bg-amber-800 transition-colors whitespace-nowrap shrink-0"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Oferta PDF</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelectTab('kosztorys')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Wróć do kosztorysu</span>
          </button>
        )}
      </div>
    </header>
  );
}
