import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  BookmarkPlus,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  PRICE_SOURCES,
  SUBREGIONS,
  WORK_CATALOG,
} from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  EstimateLineItem,
  EstimateSettings,
  EstimateSummary,
  PriceSourceId,
  PriceSourceMeta,
  SavedProjectEstimate,
  SubregionId,
  SubregionMeta,
  WorkCategory,
  WorkUnit,
} from '../types/estimator';
import { calculateLineTotals, formatNumber, formatPLN } from '../utils/calculations';
import { downloadPrzedmiarCsv, downloadPrzedmiarXlsx } from '../utils/downloadPrzedmiar';
import {
  EstimateItemSuggestion,
  findEstimateItemSuggestions,
} from '../utils/estimateItemSuggestions';
import { computeActiveVsLatestSnapshotDelta, getVersionsForProject } from '../utils/projectVersions';

interface EstimateWorkspaceProps {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  summary: EstimateSummary;
  projectName?: string;
  projectLocation?: string;
  workCatalog?: CatalogWorkItem[];
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  savedEstimates?: SavedProjectEstimate[];
  onUpdateSettings: (next: EstimateSettings, reapplySourceRates?: boolean) => void;
  onUpdateItem: (id: string, patch: Partial<EstimateLineItem>) => void;
  onRemoveItem: (id: string) => void;
  onAddCatalogItem: (item: CatalogWorkItem, quantity: number) => void;
  onAddCustomItem: () => void;
  onClearItems: () => void;
  onGoToParams: () => void;
  onOpenVersionsModal?: () => void;
  onExportCompleted?: () => void;
}

const UNITS: WorkUnit[] = ['m³', 'm²', 'mb', 'szt.', 't', 'm-g', 'kpl.'];

export function EstimateWorkspace({
  items,
  settings,
  summary,
  projectName,
  projectLocation,
  workCatalog = WORK_CATALOG,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
  savedEstimates = [],
  onUpdateSettings,
  onUpdateItem,
  onRemoveItem,
  onAddCatalogItem,
  onAddCustomItem,
  onClearItems,
  onGoToParams,
  onOpenVersionsModal,
  onExportCompleted,
}: EstimateWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | WorkCategory>('all');
  const [catalogQuantities, setCatalogQuantities] = useState<Record<string, number>>({});
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const [popoverRect, setPopoverRect] = useState<{
    top: number;
    bottom: number;
    left: number;
    width: number;
  } | null>(null);

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const shouldFocusNewCustomRef = useRef(false);
  const prevItemsLengthRef = useRef(items.length);

  const focusedItem = useMemo(
    () => (focusedItemId ? items.find((item) => item.id === focusedItemId) ?? null : null),
    [focusedItemId, items]
  );

  const activeSuggestions = useMemo(() => {
    if (!focusedItem) return [];
    const signature = `${focusedItem.id}::${focusedItem.name}`;
    if (dismissedSignature === signature) return [];
    if (focusedItem.name.trim().length < 1) return [];
    return findEstimateItemSuggestions({
      query: focusedItem.name,
      workCatalog,
      existingEstimateItems: items,
      settings,
      subregions,
      excludeItemId: focusedItem.id,
      limit: 8,
    });
  }, [dismissedSignature, focusedItem, items, settings, subregions, workCatalog]);

  const showSuggestionsPopover = Boolean(focusedItem && activeSuggestions.length > 0 && popoverRect);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [focusedItem?.id, focusedItem?.name]);

  useEffect(() => {
    const grew = items.length > prevItemsLengthRef.current;
    prevItemsLengthRef.current = items.length;
    if (shouldFocusNewCustomRef.current && grew && items.length > 0) {
      shouldFocusNewCustomRef.current = false;
      const lastItem = items[items.length - 1];
      requestAnimationFrame(() => {
        const el = textareaRefs.current[lastItem.id];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
          setFocusedItemId(lastItem.id);
          setDismissedSignature(null);
        }
      });
    } else if (!grew) {
      shouldFocusNewCustomRef.current = false;
    }
  }, [items]);

  const updatePopoverPosition = (targetId: string | null) => {
    if (!targetId) {
      setPopoverRect(null);
      return;
    }
    const el = textareaRefs.current[targetId];
    if (!el) {
      setPopoverRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    setPopoverRect({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      width: Math.max(rect.width, 360),
    });
  };

  useLayoutEffect(() => {
    updatePopoverPosition(focusedItemId);
  }, [focusedItemId, focusedItem?.name, activeSuggestions.length]);

  useEffect(() => {
    if (!focusedItemId) return;
    const handleReposition = () => updatePopoverPosition(focusedItemId);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [focusedItemId]);

  const handleTriggerAddCustomItem = () => {
    shouldFocusNewCustomRef.current = true;
    onAddCustomItem();
  };

  const applySuggestion = (itemId: string, suggestion: EstimateItemSuggestion) => {
    onUpdateItem(itemId, suggestion.patch);
    setDismissedSignature(`${itemId}::${suggestion.name}`);
    setHighlightedIdx(0);
  };

  const handleExportXlsx = async () => {
    setExportError(null);
    setExportSuccess(null);
    setIsExportingXlsx(true);
    try {
      const res = await downloadPrzedmiarXlsx({
        items,
        settings,
        projectName,
        location: projectLocation,
      });
      if (res.savedToFolder) {
        setExportSuccess(`Wygenerowano lokalnie (offline) i zapisano w folderze „Eksport Excel”: ${res.filename}`);
        onExportCompleted?.();
      } else {
        setExportSuccess(`Wygenerowano lokalnie arkusz Excel: ${res.filename}`);
      }
    } catch (err: unknown) {
      setExportError(
        err instanceof Error ? err.message : 'Nie udało się wygenerować arkusza Excel / Numbers.'
      );
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const handleExportCsvNumbers = async () => {
    setExportError(null);
    setExportSuccess(null);
    const res = await downloadPrzedmiarCsv({
      items,
      settings,
      projectName,
      location: projectLocation,
      delimiterMode: 'semicolon',
    });
    if (res.savedToFolder) {
      setExportSuccess('Zapisano przedmiar CSV również w folderze „Eksport Excel”.');
      onExportCompleted?.();
    }
  };

  const activeSubregion = subregions[settings.subregionId] ?? SUBREGIONS[settings.subregionId];
  const activeSource = priceSources[settings.sourceId] ?? PRICE_SOURCES[settings.sourceId];

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workCatalog.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.knr.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.bdoCode && item.bdoCode.toLowerCase().includes(q))
      );
    });
  }, [workCatalog, searchQuery, categoryFilter]);

  const catalogIdsInEstimate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of items) {
      if (row.catalogId) {
        counts.set(row.catalogId, (counts.get(row.catalogId) ?? 0) + 1);
      }
    }
    return counts;
  }, [items]);

  const projectVersions = useMemo(
    () => (projectName ? getVersionsForProject(savedEstimates, projectName) : []),
    [savedEstimates, projectName]
  );

  const activeDelta = useMemo(
    () =>
      projectName
        ? computeActiveVsLatestSnapshotDelta({
            savedEstimates,
            projectName,
            currentItems: items,
            currentNetTotal: summary.netTotal,
          })
        : null,
    [savedEstimates, projectName, items, summary.netTotal]
  );

  return (
    <div className="space-y-6">
      {/* 4-column KPI strip */}
      <section aria-label="Podsumowanie finansowe kosztorysu" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Wartość kosztorysowa netto</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {formatPLN(summary.netTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Koszty bezp. R+M+S: {formatPLN(summary.directTotal)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">
            Wartość brutto (VAT {settings.vatRate}%)
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-amber-800">
            {formatPLN(summary.grossTotal)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Podatek VAT: {formatPLN(summary.vatAmount)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Udział kosztów R / M / S</div>
          <div className="mt-1.5 font-mono tabular-nums text-base font-semibold text-slate-900 whitespace-nowrap">
            {formatNumber(summary.laborSharePct, 1)}% / {formatNumber(summary.materialsSharePct, 1)}% / {formatNumber(summary.equipmentSharePct, 1)}%
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
            <div
              style={{ width: `${summary.laborSharePct}%` }}
              className="bg-slate-800"
              title={`Robocizna: ${summary.laborSharePct}%`}
            />
            <div
              style={{ width: `${summary.materialsSharePct}%` }}
              className="bg-amber-600"
              title={`Materiały i utylizacja: ${summary.materialsSharePct}%`}
            />
            <div
              style={{ width: `${summary.equipmentSharePct}%` }}
              className="bg-sky-600"
              title={`Sprzęt i transport: ${summary.equipmentSharePct}%`}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Narzuty i liczba pozycji</div>
          <div className="mt-1.5 font-mono tabular-nums text-2xl font-semibold text-slate-900">
            {items.length} poz.
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Kp {settings.indirectCostsPct}% · Zysk {settings.profitPct}%
            {(settings.soilRiskPct ?? 0) > 0
              ? ` · Ryzyko +${formatNumber(settings.soilRiskPct ?? 0, 1)}%`
              : ''}{' '}
            · Rabat {settings.discountPct}%
          </div>
        </div>
      </section>

      {/* Regional source and markup configuration bar */}
      <section aria-label="Konfiguracja bazy cenowej i narzutów" className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div className="lg:col-span-2">
            <label htmlFor="cfg-source" className="block text-xs font-medium text-slate-700 mb-1">
              Źródło cenowe (woj. dolnośląskie)
            </label>
            <select
              id="cfg-source"
              value={settings.sourceId}
              onChange={(e) =>
                onUpdateSettings(
                  { ...settings, sourceId: e.target.value as PriceSourceId },
                  true
                )
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
            >
              {(Object.keys(priceSources) as PriceSourceId[]).map((id) => (
                <option key={id} value={id}>
                  {priceSources[id].name}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="cfg-subregion" className="block text-xs font-medium text-slate-700 mb-1">
              Subregion dolnośląski
            </label>
            <select
              id="cfg-subregion"
              value={settings.subregionId}
              onChange={(e) =>
                onUpdateSettings(
                  { ...settings, subregionId: e.target.value as SubregionId },
                  true
                )
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
            >
              {(Object.keys(subregions) as SubregionId[]).map((id) => (
                <option key={id} value={id}>
                  {subregions[id].name} ({subregions[id].cities.split(',')[0]})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="cfg-kp" className="block text-xs font-medium text-slate-700 mb-1">
                Kp (%)
              </label>
              <input
                id="cfg-kp"
                type="number"
                min={0}
                max={60}
                step={0.5}
                value={settings.indirectCostsPct}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    indirectCostsPct: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="cfg-profit" className="block text-xs font-medium text-slate-700 mb-1">
                Zysk (%)
              </label>
              <input
                id="cfg-profit"
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={settings.profitPct}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    profitPct: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="cfg-vat" className="block text-xs font-medium text-slate-700 mb-1">
                VAT (%)
              </label>
              <select
                id="cfg-vat"
                value={settings.vatRate}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    vatRate: Number(e.target.value) === 8 ? 8 : 23,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
              >
                <option value={23}>23%</option>
                <option value={8}>8%</option>
              </select>
            </div>
            <div>
              <label htmlFor="cfg-discount" className="block text-xs font-medium text-slate-700 mb-1">
                Rabat (%)
              </label>
              <input
                id="cfg-discount"
                type="number"
                min={0}
                max={40}
                step={1}
                value={settings.discountPct}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    discountPct: Math.min(40, Math.max(0, Number(e.target.value) || 0)),
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div>
            <span className="font-medium text-slate-800">{activeSource.quarter}</span>
            <span aria-hidden="true"> · </span>
            <span>{activeSource.description}</span>
          </div>
          <div className="text-slate-500">{activeSubregion.disposalFeeNote}</div>
        </div>
      </section>

      {/* Active Estimate Table */}
      <section aria-label="Pozycje aktywnego kosztorysu" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Aktywny kosztorys robót
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Edytuj ilości oraz stawki jednostkowe R (robocizna), M (materiały/utylizacja) i S (sprzęt) bezpośrednio w tabeli.
            </p>
            {onOpenVersionsModal && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                {activeDelta ? (
                  <>
                    <span className="font-mono font-semibold text-slate-900">
                      v{activeDelta.referenceVersionNumber} · {activeDelta.referenceVersionTag}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Zapisanych wersji projektu: <span className="font-mono tabular-nums font-medium text-slate-800">{projectVersions.length}</span>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className={activeDelta.hasChanges ? 'text-amber-800 font-medium' : 'text-emerald-700 font-medium'}>
                      {activeDelta.hasChanges
                        ? `Niezapisane zmiany (${activeDelta.netDeltaPln >= 0 ? '+' : '−'}${formatPLN(Math.abs(activeDelta.netDeltaPln))})`
                        : 'Zgodny z ostatnią zapisaną wersją'}
                    </span>
                  </>
                ) : (
                  <span>
                    Brak zapisanych wersji tego projektu — zapisz zrzut z tagiem (np. Wstępny), aby śledzić zmiany w czasie.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenVersionsModal && (
              <button
                type="button"
                onClick={onOpenVersionsModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {projectVersions.length > 0 ? (
                  <History className="w-3.5 h-3.5" />
                ) : (
                  <BookmarkPlus className="w-3.5 h-3.5" />
                )}
                <span>
                  {projectVersions.length > 0
                    ? `Zapisz wersję / Historia (${projectVersions.length})`
                    : 'Zapisz wersję projektu'}
                </span>
              </button>
            )}
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={isExportingXlsx}
                  onClick={handleExportXlsx}
                  title="Pobierz arkusz .xlsx zgodny z Microsoft Excel oraz Apple Numbers na iPad"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {isExportingXlsx ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  <span>Przedmiar Excel / Numbers (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsvNumbers}
                  title="Pobierz plik CSV UTF-8 do otwarcia w Apple Numbers (iPad) lub Excel"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleTriggerAddCustomItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dodaj własną pozycję</span>
            </button>
            {items.length > 0 && (
              <button
                type="button"
                onClick={onClearItems}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>Wyczyść listę</span>
              </button>
            )}
          </div>
        </div>

        {exportSuccess && (
          <div
            role="status"
            className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
            <span>{exportSuccess}</span>
          </div>
        )}

        {exportError && (
          <div
            role="alert"
            className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{exportError}</span>
          </div>
        )}

        {items.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-800">
              Kosztorys nie zawiera jeszcze żadnych pozycji.
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Dodaj pozycje z pełnego katalogu robót ziemnych i rozbiórek poniżej albo wylicz je automatycznie na podstawie parametrów budynku.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onGoToParams}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 rounded-lg hover:bg-amber-800 transition-colors"
              >
                Przejdź do parametrów obiektu
              </button>
              <button
                type="button"
                onClick={handleTriggerAddCustomItem}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Dodaj pustą pozycję
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-2.5 w-9 text-center">Lp.</th>
                  <th className="py-2.5 px-3 min-w-[290px]">KNR · Opis pozycji</th>
                  <th className="py-2.5 px-1.5 w-16 text-center">J.m.</th>
                  <th className="py-2.5 px-1.5 w-20 text-right">Ilość</th>
                  <th className="py-2.5 px-1.5 w-20 text-right">Robocizna</th>
                  <th className="py-2.5 px-1.5 w-20 text-right">Materiały</th>
                  <th className="py-2.5 px-1.5 w-20 text-right">Sprzęt</th>
                  <th className="py-2.5 px-2.5 w-24 text-right">Cena j. netto</th>
                  <th className="py-2.5 px-2.5 w-28 text-right">Wartość netto</th>
                  <th className="py-2.5 px-1.5 w-9 text-center">
                    <span className="sr-only">Akcje</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {items.map((item, idx) => {
                  const totals = calculateLineTotals(item, settings);
                  const accessibleName = item.name.trim() || `pozycji ${idx + 1}`;
                  const isActiveAutocomplete =
                    focusedItemId === item.id && activeSuggestions.length > 0;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors align-top">
                      <td className="py-3 px-2.5 text-center font-mono tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-500">
                          <span className="whitespace-nowrap">{item.knr}</span>
                          <span aria-hidden="true">·</span>
                          <span className="whitespace-nowrap">{CATEGORY_LABELS[item.category]}</span>
                          {item.bdoCode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-800 font-medium whitespace-nowrap">
                                BDO {item.bdoCode}
                              </span>
                            </>
                          )}
                        </div>
                        <textarea
                          ref={(el) => {
                            textareaRefs.current[item.id] = el;
                          }}
                          rows={2}
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={isActiveAutocomplete}
                          aria-controls={isActiveAutocomplete ? 'estimate-item-suggestions-listbox' : undefined}
                          aria-activedescendant={
                            isActiveAutocomplete && activeSuggestions[highlightedIdx]
                              ? `estimate-suggestion-${activeSuggestions[highlightedIdx].id}`
                              : undefined
                          }
                          aria-label={`Nazwa pozycji ${idx + 1}`}
                          placeholder="Wpisz nazwę, KNR lub kod BDO — podpowiemy pozycję z listy..."
                          value={item.name}
                          onFocus={() => {
                            setFocusedItemId(item.id);
                            updatePopoverPosition(item.id);
                          }}
                          onBlur={() => {
                            setFocusedItemId((curr) => (curr === item.id ? null : curr));
                          }}
                          onKeyDown={(e) => {
                            if (!isActiveAutocomplete) return;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setHighlightedIdx((prev) => (prev + 1) % activeSuggestions.length);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlightedIdx(
                                (prev) => (prev - 1 + activeSuggestions.length) % activeSuggestions.length
                              );
                            } else if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              const selected =
                                activeSuggestions[highlightedIdx] ?? activeSuggestions[0];
                              if (selected) {
                                applySuggestion(item.id, selected);
                              }
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setDismissedSignature(`${item.id}::${item.name}`);
                            }
                          }}
                          onChange={(e) => {
                            setDismissedSignature(null);
                            setFocusedItemId(item.id);
                            onUpdateItem(item.id, { name: e.target.value });
                          }}
                          className="mt-1 w-full resize-none bg-transparent text-[13px] leading-snug font-medium text-slate-900 placeholder:text-slate-400 placeholder:font-normal border-b border-slate-200/80 hover:border-slate-300 focus:border-amber-600 focus:outline-none py-0.5"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <select
                          aria-label={`Jednostka miary dla ${accessibleName}`}
                          value={item.unit}
                          onChange={(e) =>
                            onUpdateItem(item.id, { unit: e.target.value as WorkUnit })
                          }
                          className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-mono text-slate-800 focus:border-amber-600 focus:outline-none"
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          aria-label={`Ilość dla ${accessibleName}`}
                          value={item.quantity}
                          onChange={(e) =>
                            onUpdateItem(item.id, {
                              quantity: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full text-right rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-amber-600 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          aria-label={`Stawka robocizny dla ${accessibleName}`}
                          value={item.rateLabor}
                          onChange={(e) =>
                            onUpdateItem(item.id, {
                              rateLabor: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full text-right rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-amber-600 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          aria-label={`Stawka materiałów dla ${accessibleName}`}
                          value={item.rateMaterials}
                          onChange={(e) =>
                            onUpdateItem(item.id, {
                              rateMaterials: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full text-right rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-amber-600 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          aria-label={`Stawka sprzętu dla ${accessibleName}`}
                          value={item.rateEquipment}
                          onChange={(e) =>
                            onUpdateItem(item.id, {
                              rateEquipment: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full text-right rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-amber-600 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatNumber(totals.unitNetRate, 2)} zł
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatPLN(totals.netTotal)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          aria-label={`Usuń pozycję "${accessibleName}"`}
                          onClick={() => onRemoveItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-900">
                  <td colSpan={7} className="py-3 px-4 text-right text-slate-600">
                    Razem koszty bezpośrednie + narzuty (Kp {settings.indirectCostsPct}%, Zysk {settings.profitPct}%):
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500">Netto:</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-sm text-slate-900 whitespace-nowrap">
                    {formatPLN(summary.netTotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Full Earthworks & Demolition Catalog */}
      <section aria-label="Pełny katalog robót ziemnych i rozbiórek" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Pełny katalog robót ziemnych i rozbiórek (Dolny Śląsk)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Wybierz dowolne prace, wpisz ilość i dodaj do kosztorysu. Stawki przeliczane są według bazy{' '}
                <span className="font-medium text-slate-700">{activeSource.shortName}</span> i subregionu{' '}
                <span className="font-medium text-slate-700">{activeSubregion.name}</span>.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Szukaj w katalogu robót"
                placeholder="Szukaj po nazwie, KNR lub kodzie BDO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                categoryFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Wszystkie ({workCatalog.length})
            </button>
            {(Object.keys(CATEGORY_LABELS) as WorkCategory[]).map((cat) => {
              const count = workCatalog.filter((c) => c.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    categoryFilter === cat
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {CATEGORY_LABELS[cat]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 min-w-[290px]">Pozycja katalogowa · KNR</th>
                <th className="py-2.5 px-3 w-16 text-center">J.m.</th>
                <th className="py-2.5 px-3 w-24 text-right">R / j.m.</th>
                <th className="py-2.5 px-3 w-24 text-right">M / j.m.</th>
                <th className="py-2.5 px-3 w-24 text-right">S / j.m.</th>
                <th className="py-2.5 px-3 w-28 text-right">Razem R+M+S</th>
                <th className="py-2.5 px-3 w-24 text-right">Ilość</th>
                <th className="py-2.5 px-4 w-36 text-right">Dodaj</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredCatalog.map((catItem) => {
                const rate = catItem.ratesBySource[settings.sourceId];
                const mult = activeSubregion.multiplier;
                const rL = Math.round(rate.labor * mult * 100) / 100;
                const rM = Math.round(rate.materials * mult * 100) / 100;
                const rS = Math.round(rate.equipment * mult * 100) / 100;
                const directUnit = rL + rM + rS;
                const qty = catalogQuantities[catItem.id] ?? 10;
                const addedCount = catalogIdsInEstimate.get(catItem.id) ?? 0;

                return (
                  <tr key={catItem.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500">
                        <span>{catItem.knr}</span>
                        <span aria-hidden="true">·</span>
                        <span>{CATEGORY_LABELS[catItem.category]}</span>
                        {catItem.bdoCode && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-800 font-medium">
                              BDO {catItem.bdoCode}
                            </span>
                          </>
                        )}
                        {addedCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-medium">
                              W kosztorysie ({addedCount})
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-sm font-medium text-slate-900 mt-0.5">
                        {catItem.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{catItem.description}</div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-700">
                      {catItem.unit}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatNumber(rL, 2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatNumber(rM, 2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatNumber(rS, 2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatNumber(directUnit, 2)} zł
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="number"
                        min={0.1}
                        step={1}
                        aria-label={`Ilość do dodania dla ${catItem.name}`}
                        value={qty}
                        onChange={(e) =>
                          setCatalogQuantities((prev) => ({
                            ...prev,
                            [catItem.id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onAddCatalogItem(catItem, qty > 0 ? qty : 1)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Dodaj</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredCatalog.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                    Brak pozycji spełniających kryteria wyszukiwania „{searchQuery}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showSuggestionsPopover &&
        focusedItem &&
        popoverRect &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const viewportW = window.innerWidth;
            const viewportH = window.innerHeight;
            const targetMinWidth = viewportW >= 640 ? 480 : 360;
            const maxWidth = Math.min(Math.max(popoverRect.width, targetMinWidth), viewportW - 24);
            const left = Math.max(12, Math.min(popoverRect.left, viewportW - maxWidth - 12));
            const spaceBelow = viewportH - popoverRect.bottom - 12;
            const spaceAbove = popoverRect.top - 12;
            const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
            const maxListHeight = Math.max(160, Math.min(300, openAbove ? spaceAbove - 44 : spaceBelow - 44));

            return (
              <div
                style={{
                  position: 'fixed',
                  left: `${left}px`,
                  width: `${maxWidth}px`,
                  ...(openAbove
                    ? { bottom: `${viewportH - popoverRect.top + 6}px` }
                    : { top: `${popoverRect.bottom + 6}px` }),
                  zIndex: 70,
                }}
                className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500">
                  <span className="font-medium text-slate-700 whitespace-nowrap truncate">
                    Podpowiedzi z listy i KNR ({activeSuggestions.length})
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap shrink-0">
                    ↑↓ · Enter · Esc
                  </span>
                </div>
                <div
                  id="estimate-item-suggestions-listbox"
                  role="listbox"
                  aria-label="Sugerowane pozycje kosztorysowe"
                  style={{ maxHeight: `${maxListHeight}px` }}
                  className="overflow-y-auto divide-y divide-slate-100"
                >
                  {activeSuggestions.map((s, sIdx) => {
                    const isHighlighted = sIdx === highlightedIdx;
                    return (
                      <button
                        key={s.id}
                        id={`estimate-suggestion-${s.id}`}
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applySuggestion(focusedItem.id, s);
                        }}
                        onClick={() => applySuggestion(focusedItem.id, s)}
                        onMouseEnter={() => setHighlightedIdx(sIdx)}
                        className={`w-full text-left px-3 py-2 transition-colors flex items-start justify-between gap-3 ${
                          isHighlighted ? 'bg-amber-50/90' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-500">
                            <span
                              className={
                                s.sourceType === 'estimate'
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-amber-800 font-medium'
                              }
                            >
                              {s.sourceLabel}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{s.knr}</span>
                            {s.bdoCode && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-800">BDO {s.bdoCode}</span>
                              </>
                            )}
                          </div>
                          <div className="text-xs font-medium text-slate-900 mt-0.5 leading-snug">
                            {s.name}
                          </div>
                        </div>
                        <div className="text-right shrink-0 font-mono tabular-nums">
                          <div className="text-xs font-semibold text-slate-900 whitespace-nowrap">
                            {formatNumber(s.directUnitCost, 2)} zł
                          </div>
                          <div className="text-[11px] text-slate-500 whitespace-nowrap">
                            / {s.unit}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
}
