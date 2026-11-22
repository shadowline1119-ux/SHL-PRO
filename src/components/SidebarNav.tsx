import React, { useEffect } from 'react';
import {
  BarChart3,
  Briefcase,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSearch,
  FileText,
  MapPin,
  Mountain,
  Settings,
  X,
} from 'lucide-react';
import { PRICE_SOURCES, SUBREGIONS } from '../data/dolnoslaskieRates';
import {
  EstimateSettings,
  PriceSourceId,
  PriceSourceMeta,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import { ActiveTab, NAV_GROUPS } from '../utils/navigation';

export type { ActiveTab } from '../utils/navigation';

interface SidebarNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  settings: EstimateSettings;
  itemCount: number;
  netTotalFormatted: string;
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  pendingSyncCount?: number;
  cloudPendingCount?: number;
  localSavedLabel?: string | null;
  cloudUserEmail?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const TAB_ICONS: Record<ActiveTab, React.ComponentType<{ className?: string }>> = {
  kosztorys: Calculator,
  parametry: Building2,
  dokumentacja: FileSearch,
  kruszywa: Mountain,
  przetargi: Briefcase,
  baza_cen: Database,
  raporty: BarChart3,
  oferta: FileText,
  ustawienia: Settings,
};

export function SidebarNav({
  activeTab,
  onSelectTab,
  settings,
  itemCount,
  netTotalFormatted,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
  pendingSyncCount = 0,
  cloudPendingCount = 0,
  localSavedLabel,
  cloudUserEmail,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}: SidebarNavProps) {
  const source = priceSources[settings.sourceId] ?? PRICE_SOURCES[settings.sourceId];
  const subregion = subregions[settings.subregionId] ?? SUBREGIONS[settings.subregionId];

  useEffect(() => {
    if (!mobileOpen || !onCloseMobile) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileOpen, onCloseMobile]);

  const handleSelect = (tab: ActiveTab) => {
    onSelectTab(tab);
    onCloseMobile?.();
  };

  const renderSidebarBody = (isRail: boolean, isMobileDrawer: boolean) => (
    <div
      className={`${
        isMobileDrawer ? 'min-h-full' : 'h-full'
      } flex flex-col justify-between`}
    >
      <div className={isMobileDrawer ? 'flex flex-col' : 'min-h-0 flex-1 flex flex-col'}>
        {/* Brand Header */}
        <div
          className={`border-b border-slate-800 flex items-center gap-2.5 ${
            isRail ? 'flex-col px-2 py-3 justify-center' : 'justify-between px-4 py-3.5'
          }`}
        >
          {!isRail ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/assets/aistudio/Metaliczny_znak_marki_SHL_PRO_cf0c8d3e.png"
                alt="Logo SHL PRO"
                className="w-11 h-11 rounded-lg object-contain border border-slate-700/80 shrink-0"
              />
              <div className="min-w-0">
                <div className="font-display text-base font-bold tracking-tight text-white truncate">
                  SHL PRO
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                  Kosztorysant · Dolny Śląsk
                </p>
              </div>
            </div>
          ) : (
            <img
              src="/assets/aistudio/Metaliczny_znak_marki_SHL_PRO_cf0c8d3e.png"
              alt="Logo SHL PRO"
              className="w-9 h-9 rounded-lg object-contain border border-slate-700/80 shrink-0"
            />
          )}

          {isMobileDrawer && onCloseMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Zamknij menu nawigacji"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={isRail ? 'Rozwiń panel boczny' : 'Zwiń panel boczny'}
                title={isRail ? 'Rozwiń panel boczny' : 'Zwiń panel boczny'}
                className="hidden lg:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              >
                {isRail ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
            )
          )}
        </div>

        {/* Grouped Navigation */}
        <nav
          aria-label="Główna nawigacja"
          className={`${
            isMobileDrawer ? '' : 'flex-1 overflow-y-auto'
          } py-2.5 space-y-2.5 ${isRail ? 'px-2' : 'px-3'}`}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="space-y-0.5">
              {!isRail ? (
                <div className="px-2.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.title}
                </div>
              ) : (
                <div className="mx-2 border-t border-slate-800 pt-2 first:border-t-0 first:pt-0" />
              )}

              {group.items.map((item) => {
                const Icon = TAB_ICONS[item.id];
                const isActive = activeTab === item.id;
                const badgeCount =
                  item.id === 'baza_cen'
                    ? pendingSyncCount
                    : item.id === 'ustawienia'
                    ? cloudPendingCount
                    : 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={isRail ? item.label : undefined}
                    title={isRail ? `${item.label} — ${item.sublabel}` : undefined}
                    className={`w-full flex items-center rounded-lg transition-colors relative ${
                      isRail ? 'justify-center px-2 py-2.5' : 'items-start gap-2.5 px-3 py-1.5 text-left'
                    } ${
                      isActive
                        ? 'bg-amber-600/20 text-white border border-amber-500/40'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${isRail ? '' : 'mt-0.5'} ${
                        isActive ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    />
                    {!isRail && (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium leading-tight whitespace-nowrap truncate">
                            {item.label}
                          </span>
                          {badgeCount > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono tabular-nums font-semibold bg-amber-500 text-slate-950 rounded shrink-0">
                              {badgeCount}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">
                          {item.sublabel}
                        </div>
                      </div>
                    )}
                    {isRail && badgeCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Workspace Snapshot Card */}
      {!isRail ? (
        <div className="p-3 m-2.5 rounded-lg bg-slate-800/70 border border-slate-700/80 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{subregion.name}</span>
          </div>
          <div className="space-y-1 text-xs text-slate-300">
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Baza cen:</span>
              <span className="font-medium text-white truncate">{source.shortName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Pozycji:</span>
              <span className="font-mono tabular-nums text-white">{itemCount}</span>
            </div>
            {localSavedLabel && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Dysk:</span>
                <span className="font-mono text-emerald-300 truncate">{localSavedLabel}</span>
              </div>
            )}
            {cloudUserEmail && (
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Chmura:</span>
                <span className="text-slate-200 truncate max-w-[140px]" title={cloudUserEmail}>
                  {cloudUserEmail}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2 pt-1 border-t border-slate-700">
              <span className="text-slate-400">Netto:</span>
              <span className="font-mono tabular-nums font-semibold text-amber-300 whitespace-nowrap">
                {netTotalFormatted}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-2 mb-3 mx-auto text-center">
          <div
            title={`Pozycji w kosztorysie: ${itemCount} · Wartość netto: ${netTotalFormatted}`}
            className="text-[11px] font-mono tabular-nums font-semibold text-amber-300"
          >
            {itemCount} poz.
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar / Collapsible Rail */}
      <aside
        className={`no-print hidden lg:flex shrink-0 flex-col bg-slate-900 text-slate-100 border-r border-slate-800 sticky top-0 h-screen transition-[width] duration-150 ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {renderSidebarBody(collapsed, false)}
      </aside>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu nawigacji aplikacji"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={() => onCloseMobile?.()}
          />
          <aside className="relative z-10 w-[280px] max-w-[85vw] h-full overflow-y-auto bg-slate-900 text-slate-100 border-r border-slate-800 shadow-2xl">
            {renderSidebarBody(false, true)}
          </aside>
        </div>
      )}
    </>
  );
}
