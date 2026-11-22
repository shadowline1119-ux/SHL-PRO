import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { PRICE_SOURCES, SUBREGIONS } from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  DolnoslaskieTenderItem,
  DolnoslaskieTendersResponse,
  EstimateSettings,
  LocalBipRegionId,
  LocalBipSearchResponse,
  RegionalTenderBucket,
  SubregionId,
  SubregionMeta,
  TenderAutoEstimate,
  TenderScopeFilter,
} from '../types/estimator';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  formatOfflineSyncTime,
  loadLocalBipFromOfflineCache,
  loadTendersFromOfflineCache,
  saveLocalBipToOfflineCache,
  saveTendersToOfflineCache,
} from '../utils/offlineCache';
import { formatNumber, formatPLN } from '../utils/calculations';
import { buildAutoEstimateForTender } from '../utils/tenderAutoEstimator';
import {
  LOCAL_BIP_PORTAL_DIRECTORY,
  LOCAL_BIP_REGIONS,
  localBipCandidateToEstimateTender,
} from '../utils/localBipTenders';
import {
  filterAndSortTenders,
  formatDeadlineInfo,
  matchesRegionalBucket,
  ORDER_TYPE_LABELS,
} from '../utils/tenders';

interface TendersPanelProps {
  settings: EstimateSettings;
  workCatalog?: CatalogWorkItem[];
  subregions?: Record<SubregionId, SubregionMeta>;
  onStartEstimateFromTender: (tender: DolnoslaskieTenderItem) => void;
  onApplyAutoEstimate: (
    estimate: TenderAutoEstimate,
    targetTab: 'kosztorys' | 'oferta',
    tender: DolnoslaskieTenderItem
  ) => void;
}

const REGIONAL_BUCKET_OPTIONS: { id: RegionalTenderBucket; label: string }[] = [
  { id: 'all', label: 'Cały Dolny Śląsk' },
  { id: 'lwowek', label: 'Powiat lwówecki' },
  { id: 'boleslawiec', label: 'Powiat bolesławiecki' },
  { id: 'zlotoryja', label: 'Powiat złotoryjski' },
  { id: 'wody_polskie', label: 'Wody Polskie' },
  { id: 'kowr', label: 'KOWR' },
];

const LOCAL_BIP_REGION_IDS: LocalBipRegionId[] = [
  'powiat_lwowecki',
  'powiat_boleslawiecki',
  'powiat_zlotoryjski',
  'wody_polskie_lwowek',
  'kowr_dolny_slask',
  'inne_instytucje',
];

type TenderSortMode = 'deadline' | 'value_desc' | 'confidence';

const CONFIDENCE_RANK: Record<TenderAutoEstimate['confidence'], number> = {
  wysoka: 3,
  srednia: 2,
  wstepna: 1,
};

const CONFIDENCE_LABELS: Record<TenderAutoEstimate['confidence'], string> = {
  wysoka: 'Wysoka (wymiary z BZP/SWZ)',
  srednia: 'Średnia (skala z BZP)',
  wstepna: 'Wstępna (wzorzec KNR)',
};

export function TendersPanel({
  settings,
  workCatalog,
  subregions,
  onStartEstimateFromTender,
  onApplyAutoEstimate,
}: TendersPanelProps) {
  const { isOnline } = useOnlineStatus();
  const [daysBack, setDaysBack] = useState<number>(21);
  const [apiOrderMode, setApiOrderMode] = useState<'all' | 'Works'>('all');
  const [scopeFilter, setScopeFilter] = useState<TenderScopeFilter>('all');
  const [regionalBucket, setRegionalBucket] = useState<RegionalTenderBucket>('all');
  const [subregionFilter, setSubregionFilter] = useState<'all' | SubregionId>('all');
  const [onlyActive, setOnlyActive] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortMode, setSortMode] = useState<TenderSortMode>('deadline');

  const [data, setData] = useState<DolnoslaskieTendersResponse | null>(null);
  const [cachedMeta, setCachedMeta] = useState<{ savedAt: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Stan pobranych i przeliczonych kalkulacji szczegółowych (BZP + BIP)
  const [fetchedEstimates, setFetchedEstimates] = useState<Record<string, TenderAutoEstimate>>({});
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [calcAiLoadingId, setCalcAiLoadingId] = useState<string | null>(null);
  const [calcWarnings, setCalcWarnings] = useState<Record<string, string>>({});
  const [calcErrors, setCalcErrors] = useState<Record<string, string>>({});
  const [expandedBipCalcId, setExpandedBipCalcId] = useState<string | null>(null);

  // Stan wyszukiwarki BIP-ów powiatowych, Wód Polskich (ZZ Lwówek Śl.) i KOWR
  const [bipRegionId, setBipRegionId] = useState<LocalBipRegionId>('wody_polskie_lwowek');
  const [bipQuery, setBipQuery] = useState<string>('');
  const [bipActiveOnly, setBipActiveOnly] = useState<boolean>(true);
  const [bipLoading, setBipLoading] = useState<boolean>(false);
  const [bipError, setBipError] = useState<string | null>(null);
  const [bipResult, setBipResult] = useState<LocalBipSearchResponse | null>(() => {
    if (typeof window === 'undefined') return null;
    return loadLocalBipFromOfflineCache(window.localStorage, 'wody_polskie_lwowek');
  });
  const [bipFromCache, setBipFromCache] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(loadLocalBipFromOfflineCache(window.localStorage, 'wody_polskie_lwowek'));
  });
  const [showPortalDirectory, setShowPortalDirectory] = useState<boolean>(false);

  const loadTenders = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = loadTendersFromOfflineCache(window.localStorage);
        if (cached) {
          setData(cached.payload);
          setCachedMeta({ savedAt: cached.savedAt });
          setLoading(false);
          return;
        }
        setError(
          'Tryb offline — brak połączenia z internetem i brak wcześniej pobranych przetargów BZP w pamięci urządzenia.'
        );
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          days: String(daysBack),
          orderType: apiOrderMode,
        });
        if (forceRefresh) {
          params.set('refresh', '1');
        }
        const response = await fetch(`/api/tenders?${params.toString()}`);
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || 'Nie udało się pobrać listy przetargów.');
        }
        const payload = json as DolnoslaskieTendersResponse;
        setData(payload);
        setCachedMeta(null);
        saveTendersToOfflineCache(window.localStorage, {
          orderMode: apiOrderMode,
          daysBack,
          payload,
        });
      } catch (err: unknown) {
        const cached = loadTendersFromOfflineCache(window.localStorage);
        if (cached) {
          setData(cached.payload);
          setCachedMeta({ savedAt: cached.savedAt });
          setError(null);
        } else {
          const message =
            err instanceof Error ? err.message : 'Błąd połączenia z serwerem przetargów.';
          setError(message);
        }
      } finally {
        setLoading(false);
      }
    },
    [daysBack, apiOrderMode]
  );

  useEffect(() => {
    loadTenders(false);
  }, [loadTenders]);

  const allItems = data?.items ?? [];

  // Automatyczna kalkulacja w tle dla wszystkich pobranych przetargów budowlanych/ziemnych
  const autoEstimatesById = useMemo(() => {
    const map = new Map<string, TenderAutoEstimate>();
    for (const item of allItems) {
      const preFetched = fetchedEstimates[item.id];
      if (preFetched) {
        // Przelicz istniejący wyciąg pod aktualnie wybraną bazę cenową/narzuty
        map.set(
          item.id,
          preFetched.calculationMethod === 'ai_refined'
            ? preFetched
            : buildAutoEstimateForTender(item, settings, {
                extractedOverride: preFetched.extracted,
                calculationMethod: preFetched.calculationMethod,
                catalog: workCatalog,
                subregions,
              })
        );
      } else if (item.isEarthworksOrDemolition || item.orderType === 'Works') {
        map.set(
          item.id,
          buildAutoEstimateForTender(item, settings, {
            catalog: workCatalog,
            subregions,
          })
        );
      }
    }
    return map;
  }, [allItems, fetchedEstimates, settings, workCatalog, subregions]);

  const baseFilteredItems = useMemo(
    () =>
      filterAndSortTenders(allItems, {
        scope: scopeFilter,
        subregionId: subregionFilter,
        regionalBucket,
        onlyActive,
        searchQuery,
      }),
    [allItems, scopeFilter, subregionFilter, regionalBucket, onlyActive, searchQuery]
  );

  const filteredItems = useMemo(() => {
    if (sortMode === 'deadline') return baseFilteredItems;
    const copy = [...baseFilteredItems];
    if (sortMode === 'value_desc') {
      copy.sort((a, b) => {
        const va = autoEstimatesById.get(a.id)?.summary.netTotal ?? -1;
        const vb = autoEstimatesById.get(b.id)?.summary.netTotal ?? -1;
        return vb - va;
      });
    } else if (sortMode === 'confidence') {
      copy.sort((a, b) => {
        const ca = autoEstimatesById.get(a.id);
        const cb = autoEstimatesById.get(b.id);
        const ra = ca ? CONFIDENCE_RANK[ca.confidence] : 0;
        const rb = cb ? CONFIDENCE_RANK[cb.confidence] : 0;
        if (rb !== ra) return rb - ra;
        return (cb?.summary.netTotal ?? 0) - (ca?.summary.netTotal ?? 0);
      });
    }
    return copy;
  }, [baseFilteredItems, sortMode, autoEstimatesById]);

  const regionalCounts = useMemo(() => {
    const base = allItems.filter((item) => (onlyActive ? item.isActiveDeadline : true));
    return {
      all: base.length,
      lwowek: base.filter((item) => matchesRegionalBucket(item, 'lwowek')).length,
      boleslawiec: base.filter((item) => matchesRegionalBucket(item, 'boleslawiec')).length,
      zlotoryja: base.filter((item) => matchesRegionalBucket(item, 'zlotoryja')).length,
      wody_polskie: base.filter((item) => matchesRegionalBucket(item, 'wody_polskie')).length,
      kowr: base.filter((item) => matchesRegionalBucket(item, 'kowr')).length,
    };
  }, [allItems, onlyActive]);

  const stats = useMemo(() => {
    const activeItems = allItems.filter((item) => item.isActiveDeadline);
    const earthworksItems = activeItems.filter((item) => item.isEarthworksOrDemolition);
    const calculatedWorks = activeItems.filter((item) => autoEstimatesById.has(item.id));
    const totalEstimatedNet = earthworksItems.reduce(
      (sum, it) => sum + (autoEstimatesById.get(it.id)?.summary.netTotal ?? 0),
      0
    );
    const urgentCount = activeItems.filter((item) => {
      const dl = formatDeadlineInfo(item.submittingOffersDate);
      return dl.urgency === 'soon';
    }).length;
    return {
      activeTotal: activeItems.length,
      earthworksCount: earthworksItems.length,
      calculatedCount: calculatedWorks.length,
      totalEstimatedNet,
      urgentCount,
    };
  }, [allItems, autoEstimatesById]);

  const handleScopeChange = (nextScope: TenderScopeFilter) => {
    setScopeFilter(nextScope);
    if (nextScope === 'works' || nextScope === 'earthworks_demolition') {
      setApiOrderMode('Works');
    } else {
      setApiOrderMode('all');
    }
  };

  const handleFetchAndCalculateTender = async (
    tender: DolnoslaskieTenderItem,
    options?: { useAiRefinement?: boolean; isBipCandidate?: boolean }
  ) => {
    const id = tender.id;
    const useAi = Boolean(options?.useAiRefinement);

    if (options?.isBipCandidate) {
      setExpandedBipCalcId(id);
    } else {
      setExpandedId(id);
    }

    setCalcErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCalcWarnings((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    // Natychmiastowe przeliczenie lokalne (działa również offline i podczas ładowania)
    const instantLocal = buildAutoEstimateForTender(tender, settings, {
      catalog: workCatalog,
      subregions,
    });
    setFetchedEstimates((prev) => ({
      ...prev,
      [id]: prev[id] ?? instantLocal,
    }));

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (useAi) {
        setCalcWarnings((prev) => ({
          ...prev,
          [id]: 'Tryb offline — analiza AI wymaga internetu, zastosowano automatyczną kalkulację z danych BZP/KNR.',
        }));
      }
      return;
    }

    if (useAi) {
      setCalcAiLoadingId(id);
    } else {
      setCalculatingId(id);
    }

    try {
      const response = await fetch('/api/tenders/auto-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tender,
          settings,
          useAiRefinement: useAi,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Nie udało się pobrać danych przetargu.');
      }
      if (json.estimate) {
        setFetchedEstimates((prev) => ({
          ...prev,
          [id]: json.estimate as TenderAutoEstimate,
        }));
      }
      if (json.aiWarning) {
        setCalcWarnings((prev) => ({
          ...prev,
          [id]: String(json.aiWarning),
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Błąd pobierania danych przetargu.';
      setCalcErrors((prev) => ({
        ...prev,
        [id]: msg,
      }));
    } finally {
      setCalculatingId(null);
      setCalcAiLoadingId(null);
    }
  };

  const handleSelectBipRegion = (nextRegion: LocalBipRegionId) => {
    setBipRegionId(nextRegion);
    setBipError(null);
    if (typeof window !== 'undefined') {
      const cached = loadLocalBipFromOfflineCache(window.localStorage, nextRegion);
      setBipResult(cached);
      setBipFromCache(Boolean(cached));
    }
  };

  const handleSearchLocalBip = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBipError(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = loadLocalBipFromOfflineCache(window.localStorage, bipRegionId);
      if (cached) {
        setBipResult(cached);
        setBipFromCache(true);
        return;
      }
      setBipError(
        'Tryb offline — wyszukiwanie ogłoszeń w BIP / Wodach Polskich / KOWR wymaga internetu i nie ma jeszcze zapisanych wyników dla wybranego regionu.'
      );
      return;
    }

    setBipLoading(true);
    try {
      const response = await fetch('/api/search-local-bip-tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regionId: bipRegionId,
          customQuery: bipQuery.trim(),
          activeOnly: bipActiveOnly,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Nie udało się wyszukać przetargów BIP.');
      }
      const parsed = json.result as LocalBipSearchResponse;
      setBipResult(parsed);
      setBipFromCache(false);
      saveLocalBipToOfflineCache(window.localStorage, bipRegionId, parsed);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Błąd połączenia z wyszukiwarką BIP / Wody Polskie / KOWR.';
      setBipError(msg);
    } finally {
      setBipLoading(false);
    }
  };

  const activeBipRegionMeta = LOCAL_BIP_REGIONS[bipRegionId];
  const visiblePortalLinks = useMemo(
    () =>
      LOCAL_BIP_PORTAL_DIRECTORY.filter(
        (link) => bipRegionId === 'inne_instytucje' || link.regionId === bipRegionId
      ),
    [bipRegionId]
  );

  const renderAutoEstimateDrawer = (
    tender: DolnoslaskieTenderItem,
    est: TenderAutoEstimate,
    isBip = false
  ) => {
    const isBusy = calculatingId === tender.id;
    const isAiBusy = calcAiLoadingId === tender.id;
    const warning = calcWarnings[tender.id];
    const rowError = calcErrors[tender.id];

    return (
      <div className="space-y-4 text-xs">
        {/* Nagłówek podsumowania kalkulacji */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[11px]">
                  <Calculator className="w-3 h-3" />
                  <span>{est.workProfileLabel}</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    est.confidence === 'wysoka'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : est.confidence === 'srednia'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Pewność: {CONFIDENCE_LABELS[est.confidence]}
                </span>
                {est.calculationMethod === 'bzp_plus_portal' && (
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-medium">
                    Pobrano dane ze strony postępowania
                  </span>
                )}
                {est.calculationMethod === 'ai_refined' && (
                  <span className="px-2 py-0.5 rounded bg-amber-700 text-white text-[11px] font-medium">
                    Doprecyzowane AI (Gemini)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5">
                <strong className="text-slate-800">Podstawa obmiaru:</strong> {est.scaleBasis} ·{' '}
                <span>
                  Baza: {PRICE_SOURCES[settings.sourceId].shortName} ({SUBREGIONS[tender.subregionId].name})
                </span>
              </p>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-500">Szacowana wartość oferty</div>
              <div className="font-mono tabular-nums text-lg font-bold text-slate-900">
                {formatPLN(est.summary.netTotal)}{' '}
                <span className="text-xs font-normal text-slate-500">netto</span>
              </div>
              <div className="font-mono tabular-nums text-[11px] text-slate-500">
                {formatPLN(est.summary.grossTotal)} brutto (VAT {settings.vatRate}%)
              </div>
            </div>
          </div>

          {warning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              {warning}
            </div>
          )}
          {rowError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
              {rowError}
            </div>
          )}

          {/* Wyciągnięte parametry i wykryte wymiary z ogłoszenia */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-[11px]">
            <div>
              <div className="font-semibold text-slate-700">Dane zamawiającego i umowy</div>
              <div className="text-slate-600 mt-1 space-y-0.5">
                {est.extracted.referenceNumber && (
                  <div>
                    Sygnatura: <span className="font-mono text-slate-800">{est.extracted.referenceNumber}</span>
                  </div>
                )}
                <div>
                  Termin wykonania:{' '}
                  <span className="font-medium text-slate-800">
                    {est.extracted.executionPeriod || 'Wg SWZ / ogłoszenia'}
                  </span>
                </div>
                {est.extracted.wadiumPln && (
                  <div>
                    Wadium BZP:{' '}
                    <span className="font-mono text-slate-800">{formatPLN(est.extracted.wadiumPln)}</span>
                  </div>
                )}
                {est.extracted.organizationNip || est.extracted.organizationRegon ? (
                  <div>
                    ID:{' '}
                    <span className="font-mono text-slate-800">
                      {est.extracted.organizationNip || `REGON ${est.extracted.organizationRegon}`}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="font-semibold text-slate-700">
                Wykryte wymiary i dane ilościowe z tekstu przetargu
              </div>
              {est.extracted.detectedQuantities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {est.extracted.detectedQuantities.slice(0, 6).map((q, idx) => (
                    <span
                      key={`${q.unit}-${q.value}-${idx}`}
                      title={q.context}
                      className="px-2 py-1 rounded bg-slate-100 border border-slate-200 font-mono text-[11px] text-slate-800"
                    >
                      {q.normalizedLabel}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 mt-1">
                  Brak jawnych obmiarów liczbowych w krótkim opisie BZP — zastosowano normy szacunkowe dla profilu{' '}
                  <span className="font-medium text-slate-700">{est.workProfileLabel}</span>.
                </p>
              )}
            </div>
          </div>

          {est.extracted.fullDescription && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[11px] font-semibold text-slate-700 mb-0.5">
                Pobrany opis przedmiotu zamówienia
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto">
                {est.extracted.fullDescription}
              </p>
            </div>
          )}

          {est.extracted.externalDocLinks && est.extracted.externalDocLinks.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[11px] font-semibold text-slate-700 mb-1">
                Wykryte załączniki / dokumenty na stronie zamawiającego:
              </div>
              <div className="flex flex-wrap gap-2">
                {est.extracted.externalDocLinks.map((doc) => (
                  <a
                    key={doc.url}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-amber-50 text-[11px] text-amber-800"
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[220px]">{doc.label}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabela automatycznie skalkulowanych pozycji KNR */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3.5 py-2 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-800">
              Automatyczny kosztorys KNR ({est.items.length} poz.)
            </span>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-600">
              <span>R: {formatPLN(est.summary.laborTotal)}</span>
              <span>M: {formatPLN(est.summary.materialsTotal)}</span>
              <span>S: {formatPLN(est.summary.equipmentTotal)}</span>
              <span>
                Kp+Z: {formatPLN(est.summary.indirectCost + est.summary.profit)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-1.5 px-3">KNR</th>
                  <th className="py-1.5 px-3">Zakres robót</th>
                  <th className="py-1.5 px-2 text-center">J.m.</th>
                  <th className="py-1.5 px-2 text-right">Ilość</th>
                  <th className="py-1.5 px-3 text-right">Wartość netto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {est.items.map((line) => {
                  const rowNet =
                    line.quantity * (line.rateLabor + line.rateMaterials + line.rateEquipment);
                  return (
                    <tr key={line.id}>
                      <td className="py-1.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {line.knr}
                      </td>
                      <td className="py-1.5 px-3 text-slate-800">
                        <div>{line.name}</div>
                        {line.notes && (
                          <div className="text-[10px] text-slate-500">{line.notes}</div>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center text-slate-600">{line.unit}</td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-800">
                        {formatNumber(line.quantity, 2)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatPLN(rowNet)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Przyciski akcji */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                handleFetchAndCalculateTender(tender, {
                  useAiRefinement: false,
                  isBipCandidate: isBip,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              {isBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Odśwież ze strony / BZP</span>
            </button>

            <button
              type="button"
              disabled={isAiBusy}
              onClick={() =>
                handleFetchAndCalculateTender(tender, {
                  useAiRefinement: true,
                  isBipCandidate: isBip,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors"
            >
              {isAiBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{isAiBusy ? 'Analizuję AI...' : 'Doprecyzuj przedmiar AI (Gemini)'}</span>
            </button>

            <a
              href={tender.ezamowieniaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-amber-800 hover:underline px-2"
            >
              <span>Źródło BZP / BIP</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {tender.procedureUrl && tender.procedureUrl !== tender.ezamowieniaUrl && (
              <a
                href={tender.procedureUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-slate-700 hover:underline px-1"
              >
                <span>Platforma postępowania</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onApplyAutoEstimate(est, 'kosztorys', tender)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-amber-700 rounded-lg transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Załaduj kosztorys do edycji</span>
            </button>
            <button
              type="button"
              onClick={() => onApplyAutoEstimate(est, 'oferta', tender)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Gotowa Oferta PDF</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Pasek podsumowania aktualnych przetargów + automatyczne kalkulacje */}
      <section
        aria-label="Podsumowanie przetargów z Dolnego Śląska"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200"
      >
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Aktywne ogłoszenia (Dolny Śląsk)</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            {loading && !data ? '—' : stats.activeTotal}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Pobrano z BZP (ostatnie {daysBack} dni): {data?.totalFetched ?? 0}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Lwówek / Bolesławiec / Złotoryja</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            {loading && !data
              ? '—'
              : regionalCounts.lwowek + regionalCounts.boleslawiec + regionalCounts.zlotoryja}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Wody Polskie ({regionalCounts.wody_polskie}) · KOWR ({regionalCounts.kowr})
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Skalkulowane ziemne / drogi / rozb.</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-amber-700">
            {loading && !data ? '—' : stats.earthworksCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {loading && !data
              ? 'Obliczanie automatyczne...'
              : `Łączny szacunek netto: ${formatPLN(stats.totalEstimatedNet)}`}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500">Pilny termin (≤ 5 dni)</div>
          <div className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
            {loading && !data ? '—' : stats.urgentCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {data?.fetchedAt
              ? `Stan: ${new Date(data.fetchedAt).toLocaleTimeString('pl-PL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })} · Baza: ${PRICE_SOURCES[settings.sourceId].shortName}`
              : 'Źródło: ezamowienia.gov.pl'}
          </div>
        </div>
      </section>

      {/* Wyszukiwarka na żywo: BIP-y powiatowe, Wody Polskie ZZ Lwówek Śląski i KOWR */}
      <section
        aria-label="BIP-y powiatowe, Wody Polskie i KOWR — wyszukiwarka na żywo"
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-700 shrink-0" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                BIP-y powiatowe, Wody Polskie (ZZ Lwówek Śląski) i KOWR — zapytania poniżej PZP i przetargi
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Wyszukuj ogłoszenia z powiatów lwóweckiego, bolesławieckiego i złotoryjskiego, Zarządu Zlewni w Lwówku Śląskim oraz KOWR OT Wrocław, a następnie automatycznie pobieraj treść i przeliczaj kosztorys KNR.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPortalDirectory((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>Portale BIP / Wody / KOWR</span>
            {showPortalDirectory ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {LOCAL_BIP_REGION_IDS.map((id) => {
            const meta = LOCAL_BIP_REGIONS[id];
            const isSelected = bipRegionId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectBipRegion(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-amber-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {meta.shortLabel}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2">
          <strong className="text-slate-800">{activeBipRegionMeta.label}:</strong>{' '}
          {activeBipRegionMeta.description}
        </p>

        <form onSubmit={handleSearchLocalBip} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label htmlFor="local-bip-query" className="block text-xs font-medium text-slate-700 mb-1">
              Słowa kluczowe (opcjonalnie: rodzaj robót, gmina, rzeka, miejscowość)
            </label>
            <input
              id="local-bip-query"
              type="text"
              value={bipQuery}
              onChange={(e) => setBipQuery(e.target.value)}
              placeholder="np. roboty ziemne, rozbiórka, Bóbr, Kwisa, melioracje, kruszywo, dzierżawa..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <div className="md:col-span-3 flex items-center pb-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bipActiveOnly}
                onChange={(e) => setBipActiveOnly(e.target.checked)}
                className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
              />
              <span>Preferuj aktualne nabory</span>
            </label>
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={bipLoading}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-amber-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {bipLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>{bipLoading ? 'Przeszukuję BIP i Google...' : 'Szukaj w BIP / Wody / KOWR'}</span>
            </button>
          </div>
        </form>

        {showPortalDirectory && (
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Bezpośredni katalog portali BIP, Wód Polskich i KOWR ({activeBipRegionMeta.shortLabel}):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {visiblePortalLinks.map((portal) => (
                <a
                  key={portal.id}
                  href={portal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-amber-50/60 hover:border-amber-300 text-xs text-slate-800 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{portal.name}</div>
                    <div className="text-[11px] text-slate-500">{portal.category}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {bipError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{bipError}</span>
          </div>
        )}

        {bipResult && (
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="text-slate-700 flex-1 min-w-[240px]">{bipResult.overview}</p>
              <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                {bipFromCache ? 'Z pamięci offline · ' : ''}
                Stan: {formatOfflineSyncTime(bipResult.searchedAt)}
              </span>
            </div>

            {bipResult.items.length > 0 && (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <th className="py-2 px-3 min-w-[280px]">Ogłoszenie BIP · Instytucja</th>
                      <th className="py-2 px-3 w-32">Źródło / Miejsce</th>
                      <th className="py-2 px-3 w-40 text-right">Szacunek netto</th>
                      <th className="py-2 px-3 w-56 text-right">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bipResult.items.map((cand) => {
                      const mappedTender = localBipCandidateToEstimateTender(cand);
                      const preFetched = fetchedEstimates[mappedTender.id];
                      const bipEst =
                        preFetched ?? buildAutoEstimateForTender(mappedTender, settings);
                      const isBipExpanded = expandedBipCalcId === mappedTender.id;

                      return (
                        <React.Fragment key={cand.id}>
                          <tr className="hover:bg-slate-50/70 align-top">
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-slate-500">
                                <span className="font-semibold text-slate-700">
                                  {cand.referenceNumber}
                                </span>
                                {cand.isEarthworksOrDemolition && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-amber-800 font-semibold font-sans">
                                      Ziemne / Rozbiórki / Wodne
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="text-sm font-medium text-slate-900 mt-0.5 leading-snug">
                                {cand.title}
                              </div>
                              <div className="text-xs text-slate-600 mt-0.5">{cand.institution}</div>
                              {cand.summary && (
                                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                  {cand.summary}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-medium text-slate-800">{cand.locality}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {cand.sourcePlatform}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 mt-1">
                                {cand.deadlineDate || cand.publishedDate || '—'}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="font-mono tabular-nums font-semibold text-slate-900">
                                {formatPLN(bipEst.summary.netTotal)}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {bipEst.items.length} poz. KNR
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    isBipExpanded
                                      ? setExpandedBipCalcId(null)
                                      : handleFetchAndCalculateTender(mappedTender, {
                                          isBipCandidate: true,
                                        })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                                >
                                  <Calculator className="w-3.5 h-3.5 text-amber-700" />
                                  <span>{isBipExpanded ? 'Ukryj' : 'Kalkuluj'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onApplyAutoEstimate(bipEst, 'kosztorys', mappedTender)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-amber-700 rounded-lg transition-colors"
                                >
                                  <span>Wycena</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isBipExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={4} className="px-4 py-4 border-t border-slate-200/80">
                                {renderAutoEstimateDrawer(mappedTender, bipEst, true)}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {bipResult.sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">Zweryfikowane źródła Google:</span>
                {bipResult.sources.slice(0, 6).map((src) => (
                  <a
                    key={src.uri}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-800 hover:underline truncate max-w-[260px]"
                  >
                    <span className="truncate">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Filtry i wyszukiwarka BZP */}
      <section
        aria-label="Filtry przetargów z województwa dolnośląskiego"
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-[260px]">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Oficjalne ogłoszenia BZP (e-Zamówienia) — automatyczne pobieranie i kalkulacja
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              System automatycznie odczytuje opisy BZP, wymiary (m², m³, km, t), wadium i terminy realizacji, tworząc gotową kalkulację KNR dla aktualnej bazy cenowej ({PRICE_SOURCES[settings.sourceId].shortName}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadTenders(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-amber-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Pobieranie z BZP...' : 'Odśwież z BZP'}</span>
          </button>
        </div>

        {/* Szybki filtr powiatowy / instytucjonalny */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {REGIONAL_BUCKET_OPTIONS.map((opt) => {
            const count =
              opt.id === 'all'
                ? regionalCounts.all
                : opt.id === 'lwowek'
                ? regionalCounts.lwowek
                : opt.id === 'boleslawiec'
                ? regionalCounts.boleslawiec
                : opt.id === 'zlotoryja'
                ? regionalCounts.zlotoryja
                : opt.id === 'wody_polskie'
                ? regionalCounts.wody_polskie
                : regionalCounts.kowr;

            const isSelected = regionalBucket === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRegionalBucket(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-amber-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {opt.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Przyciski szybkiego wyboru branży */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleScopeChange('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              scopeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Wszystkie kategorie
          </button>
          <button
            type="button"
            onClick={() => handleScopeChange('works')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              scopeFilter === 'works'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Roboty budowlane (Works)
          </button>
          <button
            type="button"
            onClick={() => handleScopeChange('earthworks_demolition')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              scopeFilter === 'earthworks_demolition'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Roboty ziemne, rozbiórki i drogi
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-3 border-t border-slate-100">
          <div className="md:col-span-4">
            <label htmlFor="tenders-search" className="block text-xs font-medium text-slate-700 mb-1">
              Szukaj przetargu, miasta, zamawiającego lub CPV
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="tenders-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="np. Lwówek, Bolesławiec, Złotoryja, Wody Polskie..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="tenders-subregion" className="block text-xs font-medium text-slate-700 mb-1">
              Subregion dolnośląski
            </label>
            <select
              id="tenders-subregion"
              value={subregionFilter}
              onChange={(e) => setSubregionFilter(e.target.value as 'all' | SubregionId)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            >
              <option value="all">Całe woj. dolnośląskie</option>
              {(Object.keys(SUBREGIONS) as SubregionId[]).map((id) => (
                <option key={id} value={id}>
                  {SUBREGIONS[id].name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="tenders-sort" className="block text-xs font-medium text-slate-700 mb-1">
              Sortowanie listy
            </label>
            <select
              id="tenders-sort"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as TenderSortMode)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            >
              <option value="deadline">Najbliższy termin ofert</option>
              <option value="value_desc">Najwyższa skalkulowana wartość</option>
              <option value="confidence">Najlepsze dopasowanie wymiarów</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="tenders-days" className="block text-xs font-medium text-slate-700 mb-1">
              Okres publikacji
            </label>
            <select
              id="tenders-days"
              value={daysBack}
              onChange={(e) => setDaysBack(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            >
              <option value={14}>Ostatnie 14 dni</option>
              <option value={21}>Ostatnie 21 dni</option>
              <option value={30}>Ostatnie 30 dni</option>
              <option value={45}>Ostatnie 45 dni</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-center pb-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
                className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
              />
              <span>Tylko aktualne</span>
            </label>
          </div>
        </div>
      </section>

      {cachedMeta && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-950"
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Widok z pamięci offline — ostatnio zapisane przetargi BZP (stan z{' '}
              <span className="font-mono font-semibold">{formatOfflineSyncTime(cachedMeta.savedAt)}</span>).
            </span>
          </div>
          {isOnline && (
            <button
              type="button"
              onClick={() => loadTenders(true)}
              className="font-semibold underline hover:text-amber-800 whitespace-nowrap"
            >
              Pobierz najświeższe z BZP
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">{error}</div>
          <button
            type="button"
            onClick={() => loadTenders(true)}
            className="font-semibold underline hover:text-red-950 whitespace-nowrap"
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {/* Lista przetargów z automatyczną kalkulacją */}
      <section
        aria-label="Lista przetargów z Dolnego Śląska"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Wyświetlono <strong className="text-slate-900 font-mono tabular-nums">{filteredItems.length}</strong> z{' '}
            <span className="font-mono tabular-nums">{allItems.length}</span> pobranych ogłoszeń BZP
          </span>
          <span className="text-[11px] text-slate-500">
            Kalkulacja live wg bazy: {PRICE_SOURCES[settings.sourceId].shortName} (Kp {settings.indirectCostsPct}% · Z {settings.profitPct}%)
          </span>
        </div>

        {loading && !data ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-xs text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-amber-700" />
            <span>Pobieranie ogłoszeń BZP i automatyczne przeliczanie stawek KNR...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4 min-w-[300px]">Ogłoszenie · Zamawiający · Przedmiot zamówienia</th>
                  <th className="py-2.5 px-3 w-36">Lokalizacja</th>
                  <th className="py-2.5 px-3 w-32">Termin ofert</th>
                  <th className="py-2.5 px-3 w-44 text-right">Kalkulacja netto (SHL PRO)</th>
                  <th className="py-2.5 px-4 w-56 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredItems.map((tender) => {
                  const dl = formatDeadlineInfo(tender.submittingOffersDate);
                  const isExpanded = expandedId === tender.id;
                  const orderLabel = ORDER_TYPE_LABELS[tender.orderType] ?? tender.orderType;
                  const autoEst = autoEstimatesById.get(tender.id);
                  const isRowBusy = calculatingId === tender.id;

                  return (
                    <React.Fragment key={tender.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors align-top">
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-500">
                            <span className="font-semibold text-slate-700">{tender.noticeNumber}</span>
                            <span aria-hidden="true">·</span>
                            <span>{orderLabel}</span>
                            {tender.isEarthworksOrDemolition && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-800 font-semibold font-sans">
                                  Ziemne / Rozbiórki / Drogi
                                </span>
                              </>
                            )}
                          </div>
                          <div className="text-sm font-medium text-slate-900 mt-1 leading-snug">
                            {tender.orderObject}
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            {tender.organizationName}
                          </div>
                          {tender.extractedData?.detectedQuantities &&
                            tender.extractedData.detectedQuantities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {tender.extractedData.detectedQuantities.slice(0, 3).map((q, qi) => (
                                  <span
                                    key={`${q.unit}-${qi}`}
                                    className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200/80 font-mono text-[10px] text-amber-900"
                                  >
                                    {q.normalizedLabel}
                                  </span>
                                ))}
                              </div>
                            )}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-medium text-slate-800">
                            <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>{tender.organizationCity}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{tender.nuts3Label}</div>
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div
                            className={`font-semibold ${
                              dl.urgency === 'soon'
                                ? 'text-amber-700'
                                : dl.urgency === 'open'
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {dl.label}
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-slate-600 mt-0.5">
                            {dl.formattedDate}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right whitespace-nowrap">
                          {autoEst ? (
                            <div>
                              <div className="font-mono tabular-nums text-sm font-bold text-slate-900">
                                {formatPLN(autoEst.summary.netTotal)}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {autoEst.items.length} poz. KNR ·{' '}
                                <span
                                  className={
                                    autoEst.confidence === 'wysoka'
                                      ? 'text-emerald-700 font-medium'
                                      : autoEst.confidence === 'srednia'
                                      ? 'text-amber-700 font-medium'
                                      : 'text-slate-500'
                                  }
                                >
                                  {autoEst.confidence === 'wysoka'
                                    ? 'Z wymiarów'
                                    : autoEst.confidence === 'srednia'
                                    ? 'Skala BZP'
                                    : 'Wstępna'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleFetchAndCalculateTender(tender)}
                              className="text-[11px] text-slate-500 hover:text-amber-800 underline"
                            >
                              Poza CPV ziemnym · kalkuluj
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedId(null);
                                } else {
                                  handleFetchAndCalculateTender(tender);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                            >
                              {isRowBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                              ) : (
                                <Calculator className="w-3.5 h-3.5 text-amber-700" />
                              )}
                              <span>{isExpanded ? 'Ukryj' : 'Kalkulacja'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (autoEst) {
                                  onApplyAutoEstimate(autoEst, 'kosztorys', tender);
                                } else {
                                  onStartEstimateFromTender(tender);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap"
                            >
                              <span>Do kosztorysu</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && autoEst && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={5} className="px-4 py-4 border-t border-slate-200/80">
                            {renderAutoEstimateDrawer(tender, autoEst, false)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {filteredItems.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                      Brak przetargów spełniających wybrane kryteria. Zwiększ okres publikacji lub wyłącz filtr „Tylko aktualne”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
