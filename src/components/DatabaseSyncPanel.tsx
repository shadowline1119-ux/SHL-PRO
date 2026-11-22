import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Download,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { CATEGORY_LABELS } from '../data/dolnoslaskieRates';
import {
  EstimateLineItem,
  EstimateSettings,
  PendingSyncImport,
  PersistedCatalogWorkItem,
  PersistedPriceSourceMeta,
  PersistedSubregionMeta,
  PriceSourceId,
  SavedProjectEstimate,
  SubregionId,
  SyncConflictStrategy,
  SyncHistoryEntry,
  SyncStatusState,
  WorkCategory,
  WorkUnit,
} from '../types/estimator';
import { formatNumber } from '../utils/calculations';
import {
  ProjectVersionsSection,
  SaveProjectVersionPayload,
} from './ProjectVersionsSection';

interface DatabaseSyncPanelProps {
  isOnline: boolean;
  storageMode: 'indexeddb' | 'memory';
  priceSources: Record<PriceSourceId, PersistedPriceSourceMeta>;
  subregions: Record<SubregionId, PersistedSubregionMeta>;
  workCatalog: PersistedCatalogWorkItem[];
  quarryMaterialCount: number;
  savedEstimates: SavedProjectEstimate[];
  syncState: SyncStatusState;
  pendingQueue: PendingSyncImport[];
  syncHistory: SyncHistoryEntry[];
  settings: EstimateSettings;
  activeProjectName: string;
  activeItems: EstimateLineItem[];
  activeNetTotal: number;
  isSyncing: boolean;
  onSyncRemoteFeed: (strategy: SyncConflictStrategy) => Promise<void>;
  onImportExternalJson: (
    rawText: string,
    fileName: string,
    strategy: SyncConflictStrategy
  ) => Promise<void>;
  onFlushPendingQueue: () => Promise<void>;
  onClearPendingQueue: () => Promise<void>;
  onExportBackup: () => Promise<void>;
  onResetDatabases: () => Promise<void>;
  onSavePriceSource: (source: PersistedPriceSourceMeta) => Promise<void>;
  onSaveSubregion: (subregion: PersistedSubregionMeta) => Promise<void>;
  onSaveWorkCatalogItem: (item: PersistedCatalogWorkItem) => Promise<void>;
  onDeleteWorkCatalogItem: (id: string) => Promise<void>;
  onReapplyActiveRates: () => void;
  onSaveCurrentProjectSnapshot: (payload: SaveProjectVersionPayload) => Promise<void>;
  onLoadProjectSnapshot: (project: SavedProjectEstimate) => void;
  onDeleteProjectSnapshot: (id: string) => Promise<void>;
}

const SOURCE_IDS: PriceSourceId[] = [
  'sekocenbud',
  'intercenbud',
  'bistyp',
  'orgbud',
  'rynek_dolnoslaski',
];

const SUBREGION_IDS: SubregionId[] = [
  'wroclaw',
  'legnica_glogow',
  'walbrzych',
  'jelenia_gora',
];

const UNITS: WorkUnit[] = ['m³', 'm²', 'mb', 'szt.', 't', 'm-g', 'kpl.'];

function formatDateTimePl(iso: string | null): string {
  if (!iso) return 'Brak synchronizacji';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DatabaseSyncPanel({
  isOnline,
  storageMode,
  priceSources,
  subregions,
  workCatalog,
  quarryMaterialCount,
  savedEstimates,
  syncState,
  pendingQueue,
  syncHistory,
  settings,
  activeProjectName,
  activeItems,
  activeNetTotal,
  isSyncing,
  onSyncRemoteFeed,
  onImportExternalJson,
  onFlushPendingQueue,
  onClearPendingQueue,
  onExportBackup,
  onResetDatabases,
  onSavePriceSource,
  onSaveSubregion,
  onSaveWorkCatalogItem,
  onDeleteWorkCatalogItem,
  onReapplyActiveRates,
  onSaveCurrentProjectSnapshot,
  onLoadProjectSnapshot,
  onDeleteProjectSnapshot,
}: DatabaseSyncPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [conflictStrategy, setConflictStrategy] =
    useState<SyncConflictStrategy>('preserve_custom');

  const [rateEditSourceId, setRateEditSourceId] = useState<PriceSourceId>(
    settings.sourceId
  );
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<'all' | WorkCategory>('all');
  const [showAddKnrForm, setShowAddKnrForm] = useState(false);

  const [newKnrCode, setNewKnrCode] = useState('KALK. WŁASNA');
  const [newKnrName, setNewKnrName] = useState('');
  const [newKnrCategory, setNewKnrCategory] = useState<WorkCategory>('roboty_ziemne');
  const [newKnrUnit, setNewKnrUnit] = useState<WorkUnit>('m³');
  const [newKnrLabor, setNewKnrLabor] = useState<number>(18);
  const [newKnrMaterials, setNewKnrMaterials] = useState<number>(0);
  const [newKnrEquipment, setNewKnrEquipment] = useState<number>(42);
  const [newKnrBdo, setNewKnrBdo] = useState('');

  const modifiedOrCustomCount = useMemo(
    () => workCatalog.filter((item) => item.isModifiedByUser || item.isCustom).length,
    [workCatalog]
  );

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return workCatalog.filter((item) => {
      if (catalogCategory !== 'all' && item.category !== catalogCategory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.knr.toLowerCase().includes(q) ||
        (item.bdoCode && item.bdoCode.toLowerCase().includes(q))
      );
    });
  }, [workCatalog, catalogSearch, catalogCategory]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await onImportExternalJson(text, file.name, conflictStrategy);
    } finally {
      e.target.value = '';
    }
  };

  const handleCreateCustomKnr = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = newKnrName.trim();
    if (nameTrimmed.length < 3) return;

    const r = (v: number) => Math.round(v * 100) / 100;
    const baseL = Math.max(0, Number(newKnrLabor) || 0);
    const baseM = Math.max(0, Number(newKnrMaterials) || 0);
    const baseS = Math.max(0, Number(newKnrEquipment) || 0);

    const newItem: PersistedCatalogWorkItem = {
      id: `custom-knr-${Date.now()}`,
      knr: newKnrCode.trim() || 'KALK. WŁASNA',
      name: nameTrimmed,
      category: newKnrCategory,
      unit: newKnrUnit,
      bdoCode: newKnrBdo.trim() || undefined,
      description: 'Własna pozycja katalogowa zapisana lokalnie w bazie IndexedDB.',
      isCustom: true,
      isModifiedByUser: true,
      updatedAt: new Date().toISOString(),
      ratesBySource: {
        sekocenbud: { labor: r(baseL), materials: r(baseM), equipment: r(baseS) },
        intercenbud: {
          labor: r(baseL * 0.96),
          materials: r(baseM * 0.98),
          equipment: r(baseS * 0.97),
        },
        bistyp: {
          labor: r(baseL * 1.03),
          materials: r(baseM * 1.02),
          equipment: r(baseS * 1.05),
        },
        orgbud: {
          labor: r(baseL * 0.94),
          materials: r(baseM * 0.97),
          equipment: r(baseS * 0.95),
        },
        rynek_dolnoslaski: {
          labor: r(baseL * 1.08),
          materials: r(baseM * 1.04),
          equipment: r(baseS * 1.1),
        },
      },
    };

    await onSaveWorkCatalogItem(newItem);
    setNewKnrName('');
    setNewKnrBdo('');
    setShowAddKnrForm(false);
  };

  const handleUpdateKnrRateField = (
    item: PersistedCatalogWorkItem,
    field: 'labor' | 'materials' | 'equipment',
    rawValue: number
  ) => {
    const val = Math.max(0, Math.round((Number(rawValue) || 0) * 100) / 100);
    const updated: PersistedCatalogWorkItem = {
      ...item,
      isModifiedByUser: true,
      updatedAt: new Date().toISOString(),
      ratesBySource: {
        ...item.ratesBySource,
        [rateEditSourceId]: {
          ...item.ratesBySource[rateEditSourceId],
          [field]: val,
        },
      },
    };
    void onSaveWorkCatalogItem(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <section
        aria-label="Stan lokalnej bazy danych IndexedDB"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Lokalna baza danych</span>
            <HardDrive className="w-4 h-4 text-amber-700" />
          </div>
          <div className="mt-1.5 font-display text-lg font-semibold text-slate-900">
            {storageMode === 'indexeddb' ? 'IndexedDB (trwała)' : 'Pamięć sesji'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Wersja cennika: <span className="font-mono text-slate-800">{syncState.currentVersion}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Połączenie i synchronizacja</span>
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-700" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-700" />
            )}
          </div>
          <div
            className={`mt-1.5 font-display text-lg font-semibold ${
              isOnline ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {isOnline ? 'Online — gotowy do sync' : 'Offline — praca autonomiczna'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Ost. sync: {formatDateTimePl(syncState.lastSyncedAt)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Katalog stawek R/M/S i kopalń</span>
            <Database className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-base font-semibold text-slate-900 whitespace-nowrap">
            {workCatalog.length} KNR · {quarryMaterialCount} kruszyw
          </div>
          <div className="mt-1 text-xs text-slate-500">
            5 źródeł cenowych · własne/zmienione: {modifiedOrCustomCount}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Projekty offline i kolejka</span>
            <Clock className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-base font-semibold text-slate-900 whitespace-nowrap">
            {savedEstimates.length} zapis. · {pendingQueue.length} kolejka
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Kosztorysy działają 100% bez internetu
          </div>
        </div>
      </section>

      {/* Sync Engine Section (Online-Gated) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Synchronizacja IndexedDB z zewnętrznymi cennikami (wyłącznie przy aktywnym internecie)
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Tworzenie kosztorysów, edycja stawek R/M/S oraz eksport odbywają się w pełni lokalnie na bazie IndexedDB. Moduł synchronizacji pobiera aktualizacje cenników i przetwarza zewnętrzne importy dopiero po wykryciu aktywnego połączenia z siecią — w trybie offline żądania trafiają bezpiecznie do kolejki.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => onSyncRemoteFeed(conflictStrategy)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Synchronizuj cenniki (online)</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              aria-label="Wybierz zewnętrzny plik cennika JSON"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importuj zewnętrzny cennik (.json)</span>
            </button>

            <button
              type="button"
              onClick={() => void onExportBackup()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Kopia bazy (.json)</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="sync-conflict-strategy" className="font-medium text-slate-700">
              Polityka aktualizacji lokalnych stawek:
            </label>
            <select
              id="sync-conflict-strategy"
              value={conflictStrategy}
              onChange={(e) =>
                setConflictStrategy(e.target.value as SyncConflictStrategy)
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            >
              <option value="preserve_custom">
                Zachowaj moje własne i ręcznie zmienione stawki (zalecane)
              </option>
              <option value="overwrite_all">
                Nadpisz wszystkie stawki danymi z pakietu zewnętrznego
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void onResetDatabases()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Przywróć fabryczne bazy Dolny Śląsk</span>
          </button>
        </div>

        {syncState.lastResultMessage && (
          <div
            role="status"
            className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs ${
              syncState.lastResultStatus === 'synced'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : syncState.lastResultStatus === 'deferred_offline'
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : syncState.lastResultStatus === 'error'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}
          >
            {syncState.lastResultStatus === 'synced' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
            ) : syncState.lastResultStatus === 'deferred_offline' ? (
              <WifiOff className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
            )}
            <span>{syncState.lastResultMessage}</span>
          </div>
        )}

        {pendingQueue.length > 0 && (
          <div className="border border-amber-200 bg-amber-50/70 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-amber-950">
                Kolejka oczekujących synchronizacji offline ({pendingQueue.length})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={() => void onFlushPendingQueue()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Wykonaj zaległe teraz</span>
                </button>
                <button
                  type="button"
                  onClick={() => void onClearPendingQueue()}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Wyczyść kolejkę
                </button>
              </div>
            </div>
            <ul className="space-y-1 text-xs text-amber-900">
              {pendingQueue.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{q.label}</span>
                  <span className="font-mono text-[11px] text-amber-800">
                    Dodano: {formatDateTimePl(q.queuedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {syncHistory.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Ostatnie zdarzenia synchronizacji
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-2 px-3">Czas</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Wersja</th>
                    <th className="py-2 px-3">Zakres aktualizacji</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {syncHistory.slice(0, 6).map((h) => (
                    <tr key={h.id}>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {formatDateTimePl(h.timestamp)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            h.status === 'synced'
                              ? 'text-emerald-700'
                              : h.status === 'deferred_offline'
                              ? 'text-amber-800'
                              : 'text-red-700'
                          }`}
                        >
                          {h.status === 'synced'
                            ? 'Zsynchronizowano'
                            : h.status === 'deferred_offline'
                            ? 'Odłożono (offline)'
                            : 'Błąd'}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                        {h.version}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{h.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Saved Offline Projects & Versions in IndexedDB */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Zapisane kosztorysy i wersje projektów offline (IndexedDB)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Zapisuj kolejne zrzuty tego samego projektu z tagami wersji (np. Wstępny, Poprawiony, Ostateczny) i śledź różnice wartości w czasie bez dostępu do sieci.
            </p>
          </div>
        </div>

        <ProjectVersionsSection
          idPrefix="db-ver"
          savedEstimates={savedEstimates}
          activeProjectName={activeProjectName}
          activeItems={activeItems}
          activeNetTotal={activeNetTotal}
          onSaveVersion={onSaveCurrentProjectSnapshot}
          onLoadVersion={onLoadProjectSnapshot}
          onDeleteVersion={onDeleteProjectSnapshot}
          initialViewMode="all"
        />
      </section>

      {/* Regional Labor / Equipment Indices & Subregion Multipliers */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Lokalne stawki robocizny (zł/r-g), sprzętu i mnożniki subregionów (IndexedDB)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Każda zmiana zapisuje się natychmiast w lokalnej bazie IndexedDB i działa całkowicie offline.
            </p>
          </div>
          <button
            type="button"
            onClick={onReapplyActiveRates}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Przelicz otwarty kosztorys wg stawek z bazy</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Baza cenowa</th>
                  <th className="py-2.5 px-3">Okres / wydanie</th>
                  <th className="py-2.5 px-3 text-right w-32">Robocizna (zł/r-g)</th>
                  <th className="py-2.5 px-3 text-right w-28">Indeks sprzętu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {SOURCE_IDS.map((srcId) => {
                  const src = priceSources[srcId];
                  return (
                    <tr key={srcId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{src.name}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {src.quarter}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min={1}
                          step={0.1}
                          aria-label={`Stawka robocizny dla ${src.name}`}
                          value={src.hourlyLaborAvg}
                          onChange={(e) =>
                            void onSavePriceSource({
                              ...src,
                              isCustom: true,
                              hourlyLaborAvg: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-24 text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min={0.5}
                          step={0.01}
                          aria-label={`Indeks sprzętu dla ${src.name}`}
                          value={src.equipmentIndex}
                          onChange={(e) =>
                            void onSavePriceSource({
                              ...src,
                              isCustom: true,
                              equipmentIndex: Math.max(0.5, Number(e.target.value) || 0.5),
                            })
                          }
                          className="w-20 text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-5 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Subregion Dolnego Śląska</th>
                  <th className="py-2.5 px-3 text-right w-28">Mnożnik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {SUBREGION_IDS.map((subId) => {
                  const sub = subregions[subId];
                  return (
                    <tr key={subId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{sub.name}</div>
                        <div className="text-[11px] text-slate-500">{sub.cities}</div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          min={0.5}
                          max={2}
                          step={0.01}
                          aria-label={`Mnożnik dla ${sub.name}`}
                          value={sub.multiplier}
                          onChange={(e) =>
                            void onSaveSubregion({
                              ...sub,
                              multiplier: Math.max(0.5, Number(e.target.value) || 1),
                            })
                          }
                          className="w-20 text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* KNR Catalog Unit Rate Editor (IndexedDB) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Edytor stawek jednostkowych R / M / S katalogu KNR (IndexedDB)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Zmodyfikuj stawki robocizny (R), materiałów (M) i sprzętu (S) dla wybranej bazy cenowej lub dodaj własne pozycje katalogowe.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddKnrForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dodaj własną pozycję KNR</span>
            </button>
          </div>

          {showAddKnrForm && (
            <form
              onSubmit={handleCreateCustomKnr}
              className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="new-knr-code" className="block text-[11px] font-medium text-slate-700 mb-1">
                    Numer KNR / kod
                  </label>
                  <input
                    id="new-knr-code"
                    type="text"
                    value={newKnrCode}
                    onChange={(e) => setNewKnrCode(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="new-knr-name" className="block text-[11px] font-medium text-slate-700 mb-1">
                    Nazwa pozycji robót
                  </label>
                  <input
                    id="new-knr-name"
                    type="text"
                    required
                    value={newKnrName}
                    onChange={(e) => setNewKnrName(e.target.value)}
                    placeholder="np. Odmulenie rowu melioracyjnego koparką skarpową"
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="new-knr-bdo" className="block text-[11px] font-medium text-slate-700 mb-1">
                    Kod odpadu BDO (opcjonalnie)
                  </label>
                  <input
                    id="new-knr-bdo"
                    type="text"
                    value={newKnrBdo}
                    onChange={(e) => setNewKnrBdo(e.target.value)}
                    placeholder="np. 17 05 04"
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                <div>
                  <label htmlFor="new-knr-cat" className="block text-[11px] font-medium text-slate-700 mb-1">
                    Kategoria
                  </label>
                  <select
                    id="new-knr-cat"
                    value={newKnrCategory}
                    onChange={(e) => setNewKnrCategory(e.target.value as WorkCategory)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                  >
                    {(Object.keys(CATEGORY_LABELS) as WorkCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-knr-unit" className="block text-[11px] font-medium text-slate-700 mb-1">
                    J.m.
                  </label>
                  <select
                    id="new-knr-unit"
                    value={newKnrUnit}
                    onChange={(e) => setNewKnrUnit(e.target.value as WorkUnit)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono text-slate-900"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-knr-r" className="block text-[11px] font-medium text-slate-700 mb-1">
                    Robocizna R (zł)
                  </label>
                  <input
                    id="new-knr-r"
                    type="number"
                    min={0}
                    step={0.5}
                    value={newKnrLabor}
                    onChange={(e) => setNewKnrLabor(Number(e.target.value) || 0)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono text-right text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="new-knr-m" className="block text-[11px] font-medium text-slate-700 mb-1">
                    Materiały M (zł)
                  </label>
                  <input
                    id="new-knr-m"
                    type="number"
                    min={0}
                    step={0.5}
                    value={newKnrMaterials}
                    onChange={(e) => setNewKnrMaterials(Number(e.target.value) || 0)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono text-right text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="new-knr-s" className="block text-[11px] font-medium text-slate-700 mb-1">
                    Sprzęt S (zł)
                  </label>
                  <input
                    id="new-knr-s"
                    type="number"
                    min={0}
                    step={0.5}
                    value={newKnrEquipment}
                    onChange={(e) => setNewKnrEquipment(Number(e.target.value) || 0)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono text-right text-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddKnrForm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg"
                >
                  Zapisz w katalogu IndexedDB
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="edit-rate-source" className="text-xs font-medium text-slate-700">
                Edytowana baza:
              </label>
              <select
                id="edit-rate-source"
                value={rateEditSourceId}
                onChange={(e) => setRateEditSourceId(e.target.value as PriceSourceId)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              >
                {SOURCE_IDS.map((srcId) => (
                  <option key={srcId} value={srcId}>
                    {priceSources[srcId].name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filtr kategorii katalogu KNR"
                value={catalogCategory}
                onChange={(e) =>
                  setCatalogCategory(e.target.value as 'all' | WorkCategory)
                }
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              >
                <option value="all">Wszystkie kategorie ({workCatalog.length})</option>
                {(Object.keys(CATEGORY_LABELS) as WorkCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Szukaj w lokalnej bazie KNR"
                placeholder="Szukaj po KNR lub nazwie..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 min-w-[260px]">KNR · Pozycja robót</th>
                <th className="py-2.5 px-2 text-center w-14">J.m.</th>
                <th className="py-2.5 px-2 text-right w-28">Robocizna (R)</th>
                <th className="py-2.5 px-2 text-right w-28">Materiały (M)</th>
                <th className="py-2.5 px-2 text-right w-28">Sprzęt (S)</th>
                <th className="py-2.5 px-3 text-right w-28">Razem bezp.</th>
                <th className="py-2.5 px-3 text-right w-16">
                  <span className="sr-only">Akcje</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCatalog.map((item) => {
                const rates = item.ratesBySource[rateEditSourceId];
                const total = rates.labor + rates.materials + rates.equipment;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500">
                        <span>{item.knr}</span>
                        {item.bdoCode && (
                          <span className="text-amber-800">BDO {item.bdoCode}</span>
                        )}
                        {item.isCustom && (
                          <span className="text-sky-700 font-semibold">Własna</span>
                        )}
                        {!item.isCustom && item.isModifiedByUser && (
                          <span className="text-amber-700 font-semibold">Zmodyfikowana</span>
                        )}
                      </div>
                      <div className="font-medium text-slate-900 mt-0.5">{item.name}</div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono text-slate-700">
                      {item.unit}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        aria-label={`Stawka R dla ${item.name}`}
                        value={rates.labor}
                        onChange={(e) =>
                          handleUpdateKnrRateField(item, 'labor', Number(e.target.value))
                        }
                        className="w-24 text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        aria-label={`Stawka M dla ${item.name}`}
                        value={rates.materials}
                        onChange={(e) =>
                          handleUpdateKnrRateField(item, 'materials', Number(e.target.value))
                        }
                        className="w-24 text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        aria-label={`Stawka S dla ${item.name}`}
                        value={rates.equipment}
                        onChange={(e) =>
                          handleUpdateKnrRateField(item, 'equipment', Number(e.target.value))
                        }
                        className="w-24 text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatNumber(total, 2)} zł
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {item.isCustom && (
                        <button
                          type="button"
                          aria-label={`Usuń pozycję KNR "${item.name}"`}
                          onClick={() => void onDeleteWorkCatalogItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredCatalog.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                    Brak pozycji KNR pasujących do filtra „{catalogSearch}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
