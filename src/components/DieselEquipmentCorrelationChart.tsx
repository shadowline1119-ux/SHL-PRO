import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Fuel,
  Loader2,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PRICE_SOURCES, SUBREGIONS } from '../data/dolnoslaskieRates';
import {
  DieselGoogleSearchResponse,
  DieselHistoryPoint,
  DieselPriceBenchmarkMode,
  EstimateSettings,
  EstimateSummary,
  PriceSourceId,
  PriceSourceMeta,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import {
  buildDieselEquipmentCorrelationReport,
  formatNumber,
  formatPLN,
} from '../utils/calculations';

interface DieselEquipmentCorrelationChartProps {
  settings: EstimateSettings;
  summary: EstimateSummary;
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
}

type CorrelationViewMode = 'rates' | 'index_100' | 'estimate_pln';

const STORAGE_KEY = 'terenkoszt_diesel_gsearch_v1';

interface DieselTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: DieselHistoryPoint;
  }>;
  benchmarkMode: DieselPriceBenchmarkMode;
  activeEstimateEquipmentPln: number;
}

function DieselCorrelationTooltip({
  active,
  payload,
  benchmarkMode,
  activeEstimateEquipmentPln,
}: DieselTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const dieselUnit = benchmarkMode === 'wholesale_orlen' ? 'zł/l netto' : 'zł/l brutto';

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm min-w-[255px] space-y-1.5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900">{point.monthLabel}</span>
        <span className="font-mono tabular-nums text-[11px] text-slate-500">
          {point.monthKey}
        </span>
      </div>

      <div className="space-y-1 font-mono tabular-nums text-[11px]">
        <div className="flex justify-between gap-4 text-amber-800">
          <span>Olej napędowy (ON):</span>
          <span className="font-semibold">
            {formatNumber(point.dieselPlnPerL, 2)} {dieselUnit}
          </span>
        </div>
        <div className="flex justify-between gap-4 text-sky-900">
          <span>Praca maszyn (S):</span>
          <span className="font-semibold">
            {formatNumber(point.equipmentRatePln, 2)} zł/m-g
          </span>
        </div>
        {activeEstimateEquipmentPln > 0 && (
          <div className="flex justify-between gap-4 text-slate-800">
            <span>Koszt S w kosztorysie:</span>
            <span className="font-semibold">
              {formatPLN(point.estimateEquipmentCostPln)}
            </span>
          </div>
        )}
      </div>

      <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-3 font-mono tabular-nums text-[11px] text-slate-500">
        <span>Indeks (gru 25 = 100):</span>
        <span>
          ON {formatNumber(point.dieselIndex, 1)} · S {formatNumber(point.equipmentIndex, 1)}
        </span>
      </div>
    </div>
  );
}

const SCENARIO_PRESETS: Array<{ label: string; delta: number }> = [
  { label: '-0,50 zł/l', delta: -0.5 },
  { label: 'Bieżąca cena (0,00)', delta: 0 },
  { label: '+0,50 zł/l', delta: 0.5 },
  { label: '+1,00 zł/l', delta: 1.0 },
];

export function DieselEquipmentCorrelationChart({
  settings,
  summary,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
}: DieselEquipmentCorrelationChartProps) {
  const [benchmarkMode, setBenchmarkMode] =
    useState<DieselPriceBenchmarkMode>('retail_pl');
  const [viewMode, setViewMode] = useState<CorrelationViewMode>('rates');
  const [scenarioDelta, setScenarioDelta] = useState<number>(0.5);
  const [googleDataByMode, setGoogleDataByMode] = useState<
    Partial<Record<DieselPriceBenchmarkMode, DieselGoogleSearchResponse>>
  >({});
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copiedTalkingPoint, setCopiedTalkingPoint] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<
        Record<DieselPriceBenchmarkMode, DieselGoogleSearchResponse>
      >;
      if (parsed && typeof parsed === 'object') {
        setGoogleDataByMode(parsed);
      }
    } catch {
      // Ignore malformed localStorage cache
    }
  }, []);

  const activeGoogleData = googleDataByMode[benchmarkMode];
  const hasGoogleData =
    Boolean(activeGoogleData) &&
    Array.isArray(activeGoogleData?.monthlyPrices) &&
    activeGoogleData!.monthlyPrices.length === 12;

  const report = useMemo(
    () =>
      buildDieselEquipmentCorrelationReport({
        settings,
        estimateSummary: summary,
        benchmarkMode,
        dieselPrices: hasGoogleData ? activeGoogleData!.monthlyPrices : undefined,
        dieselDataOrigin: hasGoogleData ? 'google_search' : 'reference_baseline',
        scenarioDieselDeltaPln: scenarioDelta,
        priceSources,
        subregions,
      }),
    [
      settings,
      summary,
      benchmarkMode,
      hasGoogleData,
      activeGoogleData,
      scenarioDelta,
      priceSources,
      subregions,
    ]
  );

  const handleFetchFromGoogleSearch = async () => {
    setSearchError(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSearchError(
        'Brak połączenia z internetem. Pobieranie bieżących notowań oleju napędowego z Google Search wymaga dostępu do sieci.'
      );
      return;
    }

    setIsSearching(true);
    try {
      const subregionName = subregions[settings.subregionId]?.name ?? 'Dolny Śląsk';
      const response = await fetch('/api/diesel-history-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          benchmarkMode,
          subregionName,
        }),
      });

      const data = (await response.json()) as DieselGoogleSearchResponse & {
        error?: string;
      };

      if (!response.ok) {
        setSearchError(
          data?.error ||
            'Nie udało się pobrać notowań oleju napędowego z Google Search.'
        );
        return;
      }

      if (!Array.isArray(data.monthlyPrices) || data.monthlyPrices.length !== 12) {
        setSearchError(
          'Google Search nie zwrócił wystarczającej liczby miesięcznych cen ON. Spróbuj ponownie.'
        );
        return;
      }

      setGoogleDataByMode((prev) => {
        const next = { ...prev, [benchmarkMode]: data };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
        return next;
      });
    } catch (err: unknown) {
      setSearchError(
        err instanceof Error
          ? `Błąd połączenia z serwerem podczas zapytania Google Search: ${err.message}`
          : 'Nieznany błąd podczas pobierania cen ON z Google Search.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleCopyTalkingPoint = async () => {
    try {
      await navigator.clipboard.writeText(report.negotiationTalkingPoint);
      setCopiedTalkingPoint(true);
      window.setTimeout(() => setCopiedTalkingPoint(false), 2400);
    } catch {
      setCopiedTalkingPoint(false);
    }
  };

  const formatFetchedTime = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('pl-PL', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const dieselAxisUnit =
    benchmarkMode === 'wholesale_orlen' ? 'zł/l n.' : 'zł/l';
  const dieselChangeSign = report.dieselChange12mPct > 0 ? '+' : '';
  const scenarioDeltaSign = report.scenarioDieselDeltaPln > 0 ? '+' : '';
  const netDeltaSign = report.scenarioEstimateNetDeltaPln > 0 ? '+' : '';
  const equipDeltaSign = report.scenarioEstimateEquipmentDeltaPln > 0 ? '+' : '';

  return (
    <section
      aria-label="Korelacja cen oleju napędowego z kosztami pracy maszyn budowlanych"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex-1 min-w-0 sm:min-w-[280px]">
          <div className="flex items-center gap-2">
            <Fuel className="w-4 h-4 text-amber-700 shrink-0" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Korelacja cen oleju napędowego (ON) z kosztami pracy maszyn budowlanych
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Zestawienie 12-miesięcznej dynamiki cen paliwa (pobieranych na żywo z Google Search) ze stawkami sprzętu (S) w kosztorysie dla subregionu{' '}
            <span className="font-medium text-slate-800">{report.subregionName}</span>{' '}
            ({report.sourceShortName}) jako argumentacja do klauzuli waloryzacyjnej.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleFetchFromGoogleSearch}
            disabled={isSearching}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            {isSearching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <Search className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span>
              {isSearching
                ? 'Wyszukiwanie w Google...'
                : 'Pobierz ceny ON z Google Search'}
            </span>
          </button>

          <div
            role="group"
            aria-label="Tryb wykresu korelacji ON i sprzętu"
            className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setViewMode('rates')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'rates'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stawki (zł/l vs zł/m-g)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('index_100')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'index_100'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Indeks (100 = gru 25)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('estimate_pln')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'estimate_pln'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Koszt S w kosztorysie
            </button>
          </div>
        </div>
      </div>

      {/* Fuel Benchmark Selector + Origin Line */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-700 whitespace-nowrap">
            Wskaźnik paliwa ON:
          </span>
          <div
            role="group"
            aria-label="Wskaźnik cenowy oleju napędowego"
            className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setBenchmarkMode('retail_pl')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                benchmarkMode === 'retail_pl'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Detal stacje PL (brutto)
            </button>
            <button
              type="button"
              onClick={() => setBenchmarkMode('wholesale_orlen')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                benchmarkMode === 'wholesale_orlen'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hurt ORLEN Ekodiesel (netto)
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
          {hasGoogleData ? (
            <>
              <span className="font-semibold text-emerald-700">
                Dane z Google Search
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-700">
                {activeGoogleData!.fuelStationReference}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {formatFetchedTime(activeGoogleData!.fetchedAt)}
              </span>
            </>
          ) : (
            <span>
              Dane referencyjne (kliknij „Pobierz ceny ON z Google Search”, aby pobrać aktualne notowania z sieci)
            </span>
          )}
        </div>
      </div>

      {/* Honest Error Alert */}
      {searchError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <div className="font-semibold">
              Nie udało się pobrać danych paliwowych z Google Search
            </div>
            <div>{searchError}</div>
          </div>
        </div>
      )}

      {/* 3-Card Insight Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Korelacja ON vs sprzęt (S)</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              elastyczność {formatNumber(report.fuelPassThroughElasticityPct, 0)}%
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-slate-900">
              r = {formatNumber(report.pearsonCorrelation, 2)}
            </span>
            <span className="text-[11px] font-medium text-sky-900 truncate">
              {report.correlationStrengthLabel}
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Olej napędowy · lis 2026</span>
            <span
              className={`font-mono tabular-nums font-semibold ${
                report.dieselChange12mPct > 0
                  ? 'text-red-700'
                  : report.dieselChange12mPct < 0
                  ? 'text-emerald-700'
                  : 'text-slate-700'
              }`}
            >
              {dieselChangeSign}
              {formatNumber(report.dieselChange12mPct, 1)}% r/r
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-amber-800">
              {formatNumber(report.currentDieselPlnPerL, 2)} zł/l
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
              12M: {formatNumber(report.minDieselPlnPerL, 2)}–{formatNumber(report.maxDieselPlnPerL, 2)} zł
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Symulacja zmiany ON ({scenarioDeltaSign}
              {formatNumber(report.scenarioDieselDeltaPln, 2)} zł/l)
            </span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {equipDeltaSign}
              {formatPLN(report.scenarioEstimateEquipmentDeltaPln)} na S
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span
              className={`font-mono tabular-nums text-lg font-semibold whitespace-nowrap ${
                report.scenarioEstimateNetDeltaPln > 0
                  ? 'text-amber-800'
                  : report.scenarioEstimateNetDeltaPln < 0
                  ? 'text-emerald-700'
                  : 'text-slate-900'
              }`}
            >
              {netDeltaSign}
              {formatPLN(report.scenarioEstimateNetDeltaPln)}
            </span>
            <span className="text-[11px] text-slate-500 whitespace-nowrap">
              netto (z Kp i Zyskiem)
            </span>
          </div>
        </div>
      </div>

      {/* Main Recharts LineChart */}
      <div className="w-full h-[320px] pt-1">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'rates' ? (
            <LineChart
              data={report.points}
              margin={{ top: 10, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="diesel"
                orientation="left"
                width={78}
                domain={['dataMin - 0.15', 'dataMax + 0.15']}
                tick={{ fontSize: 11, fill: '#b45309' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  `${formatNumber(v, 2)} ${dieselAxisUnit}`
                }
              />
              <YAxis
                yAxisId="equipment"
                orientation="right"
                width={84}
                domain={['dataMin - 6', 'dataMax + 6']}
                tick={{ fontSize: 11, fill: '#0369a1' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${Math.round(v)} zł/m-g`}
              />
              <Tooltip
                content={
                  <DieselCorrelationTooltip
                    benchmarkMode={benchmarkMode}
                    activeEstimateEquipmentPln={report.activeEstimateEquipmentPln}
                  />
                }
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <Line
                yAxisId="diesel"
                type="monotone"
                dataKey="dieselPlnPerL"
                name={`Cena oleju napędowego (${dieselAxisUnit})`}
                stroke="#d97706"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#d97706', strokeWidth: 0 }}
                activeDot={{ r: 5.5, fill: '#b45309' }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="equipment"
                type="monotone"
                dataKey="equipmentRatePln"
                name="Koszt pracy sprzętu S (zł/m-g)"
                stroke="#0284c7"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#0284c7', strokeWidth: 0 }}
                activeDot={{ r: 5.5, fill: '#0369a1' }}
                isAnimationActive={false}
              />
            </LineChart>
          ) : viewMode === 'index_100' ? (
            <LineChart
              data={report.points}
              margin={{ top: 10, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                width={64}
                domain={['dataMin - 2', 'dataMax + 2']}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${formatNumber(v, 0)} pkt`}
              />
              <ReferenceLine
                y={100}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{
                  value: 'Baza 100 (gru 25)',
                  position: 'insideTopRight',
                  fill: '#64748b',
                  fontSize: 10,
                }}
              />
              <Tooltip
                content={
                  <DieselCorrelationTooltip
                    benchmarkMode={benchmarkMode}
                    activeEstimateEquipmentPln={report.activeEstimateEquipmentPln}
                  />
                }
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <Line
                type="monotone"
                dataKey="dieselIndex"
                name="Indeks ceny ON (gru 25 = 100)"
                stroke="#d97706"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#d97706', strokeWidth: 0 }}
                activeDot={{ r: 5.5 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="equipmentIndex"
                name="Indeks stawki sprzętu S (gru 25 = 100)"
                stroke="#0284c7"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#0284c7', strokeWidth: 0 }}
                activeDot={{ r: 5.5 }}
                isAnimationActive={false}
              />
            </LineChart>
          ) : (
            <LineChart
              data={report.points}
              margin={{ top: 10, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="diesel"
                orientation="left"
                width={78}
                domain={['dataMin - 0.15', 'dataMax + 0.15']}
                tick={{ fontSize: 11, fill: '#b45309' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  `${formatNumber(v, 2)} ${dieselAxisUnit}`
                }
              />
              <YAxis
                yAxisId="estimate"
                orientation="right"
                width={92}
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: '#0369a1' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000
                    ? `${formatNumber(v / 1000, 1)} tys. zł`
                    : `${Math.round(v)} zł`
                }
              />
              <Tooltip
                content={
                  <DieselCorrelationTooltip
                    benchmarkMode={benchmarkMode}
                    activeEstimateEquipmentPln={report.activeEstimateEquipmentPln}
                  />
                }
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <Line
                yAxisId="diesel"
                type="monotone"
                dataKey="dieselPlnPerL"
                name={`Cena oleju napędowego (${dieselAxisUnit})`}
                stroke="#d97706"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#d97706', strokeWidth: 0 }}
                activeDot={{ r: 5.5 }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="estimate"
                type="monotone"
                dataKey="estimateEquipmentCostPln"
                name="Łączny koszt sprzętu (S) w kosztorysie (PLN)"
                stroke="#0f172a"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#0f172a', strokeWidth: 0 }}
                activeDot={{ r: 5.5 }}
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Interactive Fuel Escalation & Negotiation Simulator */}
      <div className="border border-slate-200 rounded-lg bg-slate-50/80 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-700 shrink-0" />
            <h3 className="text-xs font-semibold text-slate-900">
              Symulator klauzuli paliwowej i argumentacja do negocjacji z inwestorem
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SCENARIO_PRESETS.map((preset) => {
              const isSelected = Math.abs(scenarioDelta - preset.delta) < 0.001;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setScenarioDelta(preset.delta)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="diesel-scenario-slider"
                className="font-medium text-slate-700"
              >
                Zakładana zmiana ceny ON (Δ zł/l):
              </label>
              <span className="font-mono tabular-nums font-semibold text-amber-800">
                {scenarioDeltaSign}
                {formatNumber(report.scenarioDieselDeltaPln, 2)} zł/l →{' '}
                {formatNumber(report.scenarioDieselPlnPerL, 2)} zł/l
              </span>
            </div>
            <input
              id="diesel-scenario-slider"
              type="range"
              min={-1.0}
              max={1.5}
              step={0.05}
              value={scenarioDelta}
              onChange={(e) => setScenarioDelta(Number(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
              <span>-1,00 zł/l</span>
              <span>0,00</span>
              <span>+1,50 zł/l</span>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Stawka sprzętu S</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                {formatNumber(report.currentEquipmentRatePln, 2)} →{' '}
                {formatNumber(report.scenarioEquipmentRatePln, 2)} zł/m-g
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Zmiana kosztów S</div>
              <div className="font-mono tabular-nums font-semibold text-sky-900 mt-0.5">
                {equipDeltaSign}
                {formatPLN(report.scenarioEstimateEquipmentDeltaPln)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500">Korekta oferty netto</div>
              <div className="font-mono tabular-nums font-semibold text-amber-800 mt-0.5">
                {netDeltaSign}
                {formatPLN(report.scenarioEstimateNetDeltaPln)}
              </div>
            </div>
          </div>
        </div>

        {/* Copyable Investor Talking Point */}
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-[260px] space-y-1">
            <div className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
              Gotowy zapis do protokołu negocjacji z inwestorem
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {report.negotiationTalkingPoint}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyTalkingPoint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            {copiedTalkingPoint ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>Skopiowano</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>Kopiuj argumentację do negocjacji</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grounding Sources (only when fetched from Google Search) */}
      {hasGoogleData && activeGoogleData && (
        <div className="border-t border-slate-200 pt-4 space-y-2.5 text-xs">
          <div className="text-slate-700 leading-relaxed">
            <span className="font-semibold text-slate-900">
              Podsumowanie z Google Search:{' '}
            </span>
            {activeGoogleData.summary}
          </div>

          {activeGoogleData.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Źródła w sieci:
              </span>
              {activeGoogleData.sources.map((src) => (
                <a
                  key={src.uri}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-medium text-sky-900 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                >
                  <span className="max-w-[220px] truncate">{src.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ))}
            </div>
          )}

          {activeGoogleData.webSearchQueries.length > 0 && (
            <div className="text-[11px] text-slate-500">
              Zapytania Google Search: {activeGoogleData.webSearchQueries.join(' · ')}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
