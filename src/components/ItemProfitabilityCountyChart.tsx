import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Check } from 'lucide-react';
import {
  CATEGORY_LABELS,
  LOWER_SILESIA_COUNTY_MARGINS,
  SUBREGIONS,
} from '../data/dolnoslaskieRates';
import {
  CountyBenchmarkId,
  CountyMarginBenchmark,
  EstimateLineItem,
  EstimateSettings,
  ItemProfitabilityBar,
  ItemProfitabilitySortMode,
  SubregionId,
  SubregionMeta,
  WorkCategory,
} from '../types/estimator';
import {
  buildItemProfitabilityCountyReport,
  formatNumber,
  formatPLN,
} from '../utils/calculations';

interface ItemProfitabilityCountyChartProps {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  counties?: CountyMarginBenchmark[];
  subregions?: Record<SubregionId, SubregionMeta>;
}

interface ItemTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: ItemProfitabilityBar;
  }>;
  benchmarkLabel: string;
}

function ItemProfitabilityTooltip({
  active,
  payload,
  benchmarkLabel,
}: ItemTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const bar = payload[0]?.payload;
  if (!bar) return null;

  const deltaSign = bar.deltaVsBenchmarkPp > 0 ? '+' : '';
  const deltaPlnSign = bar.deltaVsBenchmarkPln > 0 ? '+' : '';
  const visibleCountyDeltas = bar.countyDeltas.slice(0, 6);
  const remainingCounties = bar.countyDeltas.length - visibleCountyDeltas.length;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm min-w-[355px] max-w-[400px] space-y-2">
      <div className="border-b border-slate-100 pb-1.5 space-y-0.5">
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="font-mono font-semibold text-slate-700 whitespace-nowrap">
            Poz. {bar.lp} · {bar.knrCode}
          </span>
          <span className="truncate">{bar.categoryLabel}</span>
        </div>
        <div className="font-semibold text-slate-900 leading-snug">
          {bar.fullName}
        </div>
      </div>

      <div className="space-y-1 font-mono tabular-nums text-[11px]">
        <div className="flex justify-between gap-4 text-slate-700">
          <span className="whitespace-nowrap">Wartość netto pozycji:</span>
          <span className="font-semibold text-slate-900 whitespace-nowrap">
            {formatPLN(bar.netTotal)}
          </span>
        </div>
        <div className="flex justify-between gap-4 text-slate-700">
          <span className="whitespace-nowrap">Rentowność pozycji:</span>
          <span
            className={`font-semibold whitespace-nowrap ${
              bar.status === 'unprofitable'
                ? 'text-red-700'
                : bar.status === 'above_market'
                ? 'text-emerald-700'
                : 'text-amber-800'
            }`}
          >
            {formatNumber(bar.marginPct, 2)}% ({formatPLN(bar.profitPln)})
          </span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600">
          <span className="truncate" title={benchmarkLabel}>
            Benchmark ({benchmarkLabel}):
          </span>
          <span className="whitespace-nowrap shrink-0">
            {formatPLN(bar.benchmarkProfitPln)}
          </span>
        </div>
        <div className="flex justify-between gap-4 text-slate-700">
          <span className="whitespace-nowrap">Odchylenie:</span>
          <span
            className={`whitespace-nowrap ${
              bar.deltaVsBenchmarkPp >= 0
                ? 'text-emerald-700 font-semibold'
                : 'text-amber-800 font-semibold'
            }`}
          >
            {deltaSign}
            {formatNumber(bar.deltaVsBenchmarkPp, 2)} p.p. ({deltaPlnSign}
            {formatPLN(bar.deltaVsBenchmarkPln)})
          </span>
        </div>
        <div className="flex justify-between gap-4 text-slate-500">
          <span className="whitespace-nowrap">Udział materiałów (M):</span>
          <span className="whitespace-nowrap">
            {formatNumber(bar.materialsSharePct, 1)}%
          </span>
        </div>
      </div>

      {visibleCountyDeltas.length > 0 && (
        <div className="pt-1.5 border-t border-slate-100 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Różnica vs wybrane powiaty:
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono tabular-nums text-[10px]">
            {visibleCountyDeltas.map((cd) => {
              const s = cd.deltaPp > 0 ? '+' : '';
              return (
                <div
                  key={cd.countyId}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-slate-600 truncate">
                    {cd.countyShortName}
                  </span>
                  <span
                    className={`whitespace-nowrap shrink-0 ${
                      cd.deltaPp >= 0
                        ? 'text-emerald-700 font-semibold'
                        : 'text-amber-800 font-semibold'
                    }`}
                  >
                    {s}
                    {formatNumber(cd.deltaPp, 1)} p.p.
                  </span>
                </div>
              );
            })}
          </div>
          {remainingCounties > 0 && (
            <div className="text-[10px] text-slate-400">
              + {remainingCounties} pozostałych wybranych powiatów
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ALL_CATEGORIES_OPTION = 'all';

const WEST_DS_PRESET: CountyBenchmarkId[] = [
  'pow_lwowecki',
  'pow_boleslawiecki',
  'pow_zlotoryjski',
  'pow_karkonoski',
];

const METRO_LGOM_PRESET: CountyBenchmarkId[] = [
  'm_wroclaw',
  'pow_wroclawski',
  'pow_lubinski',
  'pow_legnicki',
];

const DEFAULT_SELECTED_COUNTIES: CountyBenchmarkId[] = [
  'm_wroclaw',
  'pow_wroclawski',
  'pow_lubinski',
  'pow_boleslawiecki',
  'pow_lwowecki',
];

export function ItemProfitabilityCountyChart({
  items,
  settings,
  counties = LOWER_SILESIA_COUNTY_MARGINS,
  subregions = SUBREGIONS,
}: ItemProfitabilityCountyChartProps) {
  const allCountyIds = useMemo(() => counties.map((c) => c.id), [counties]);
  const [selectedCounties, setSelectedCounties] = useState<CountyBenchmarkId[]>(
    () => {
      const valid = DEFAULT_SELECTED_COUNTIES.filter((id) =>
        allCountyIds.includes(id)
      );
      return valid.length > 0 ? valid : allCountyIds;
    }
  );
  const [benchmarkMode, setBenchmarkMode] = useState<
    'selected_avg' | 'single_county'
  >('selected_avg');
  const [referenceCountyId, setReferenceCountyId] =
    useState<CountyBenchmarkId>('m_wroclaw');
  const [metricMode, setMetricMode] = useState<'margin_pct' | 'profit_pln'>(
    'margin_pct'
  );
  const [categoryFilter, setCategoryFilter] = useState<WorkCategory | 'all'>(
    ALL_CATEGORIES_OPTION
  );
  const [sortBy, setSortBy] =
    useState<ItemProfitabilitySortMode>('estimate_order');
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCounties.includes(referenceCountyId) && selectedCounties.length > 0) {
      setReferenceCountyId(selectedCounties[0]);
    }
  }, [selectedCounties, referenceCountyId]);

  const availableCategories = useMemo(() => {
    const present = new Set<WorkCategory>();
    items.forEach((it) => {
      if (it.quantity > 0) present.add(it.category);
    });
    return (Object.keys(CATEGORY_LABELS) as WorkCategory[]).filter((cat) =>
      present.has(cat)
    );
  }, [items]);

  const report = useMemo(
    () =>
      buildItemProfitabilityCountyReport({
        items,
        settings,
        counties,
        selectedCountyIds: selectedCounties,
        benchmarkMode,
        referenceCountyId,
        metricMode,
        categoryFilter,
        sortBy,
      }),
    [
      items,
      settings,
      counties,
      selectedCounties,
      benchmarkMode,
      referenceCountyId,
      metricMode,
      categoryFilter,
      sortBy,
    ]
  );

  const inspectedBar = useMemo(() => {
    if (report.bars.length === 0) return null;
    if (inspectedItemId) {
      const found = report.bars.find((b) => b.id === inspectedItemId);
      if (found) return found;
    }
    return report.lowestMarginItem ?? report.bars[0];
  }, [report.bars, report.lowestMarginItem, inspectedItemId]);

  const toggleCounty = (id: CountyBenchmarkId) => {
    setSelectedCounties((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== id);
      }
      return allCountyIds.filter((item) => item === id || prev.includes(item));
    });
  };

  const applyPreset = (ids: CountyBenchmarkId[]) => {
    const valid = allCountyIds.filter((id) => ids.includes(id));
    if (valid.length >= 1) {
      setSelectedCounties(valid);
    }
  };

  const matchesSet = (target: CountyBenchmarkId[]) =>
    selectedCounties.length === target.length &&
    target.every((id) => selectedCounties.includes(id));

  const isAllPreset = selectedCounties.length === allCountyIds.length;
  const isWestPreset = matchesSet(WEST_DS_PRESET);
  const isMetroPreset = matchesSet(METRO_LGOM_PRESET);
  const subregionCountyIds = useMemo(
    () =>
      counties
        .filter((c) => c.subregionId === settings.subregionId)
        .map((c) => c.id),
    [counties, settings.subregionId]
  );
  const isSubregionPreset =
    subregionCountyIds.length > 0 && matchesSet(subregionCountyIds);

  const selectedCountyMetas = useMemo(
    () => counties.filter((c) => selectedCounties.includes(c.id)),
    [counties, selectedCounties]
  );

  return (
    <section
      aria-label="Rentowność poszczególnych pozycji kosztorysowych na tle powiatów Dolnego Śląska"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex-1 min-w-[280px]">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Rentowność pozycji kosztorysowych vs średnie marże w powiatach Dolnego Śląska
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Porównanie marży netto każdej pozycji (narzuty Kp{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {settings.indirectCostsPct}%
            </span>{' '}
            i Zysk{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {settings.profitPct}%
            </span>{' '}
            od R+S, rabat{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {settings.discountPct}%
            </span>
            ) z benchmarkiem rynkowym wybranych powiatów. Pozycje z wysokim udziałem materiałów (M) mają niższą marżę niż prace ziemne i sprzętowe.
          </p>
        </div>

        <div
          role="group"
          aria-label="Jednostka wykresu rentowności pozycji"
          className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
        >
          <button
            type="button"
            onClick={() => setMetricMode('margin_pct')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              metricMode === 'margin_pct'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rentowność (%)
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('profit_pln')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              metricMode === 'profit_pln'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Zysk netto (PLN)
          </button>
        </div>
      </div>

      {/* Insight Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Rentowność ważona pozycji</span>
            <span className="font-mono tabular-nums font-semibold text-slate-700 whitespace-nowrap">
              {report.aboveBenchmarkCount}/{report.filteredItemsCount} &ge; rynek
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span
              className={`font-mono tabular-nums text-lg font-semibold whitespace-nowrap ${
                report.weightedEstimateMarginPct >= report.benchmarkMarginPct
                  ? 'text-emerald-700'
                  : report.weightedEstimateMarginPct > 0
                  ? 'text-amber-800'
                  : 'text-red-700'
              }`}
            >
              {formatNumber(report.weightedEstimateMarginPct, 2)}%
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
              Benchmark: {formatNumber(report.benchmarkMarginPct, 2)}%
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Najbardziej rentowna pozycja</span>
            {report.mostProfitableItem && (
              <span className="font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                {formatPLN(report.mostProfitableItem.profitPln)}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-emerald-700 whitespace-nowrap">
              {report.mostProfitableItem
                ? `${formatNumber(report.mostProfitableItem.marginPct, 2)}%`
                : '—'}
            </span>
            <span className="text-[11px] font-medium text-slate-700 truncate">
              {report.mostProfitableItem
                ? report.mostProfitableItem.shortLabel
                : 'Brak pozycji'}
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Najniższa rentowność (do korekty)</span>
            {report.lowestMarginItem && (
              <span className="font-mono tabular-nums font-semibold text-slate-700 whitespace-nowrap">
                M: {formatNumber(report.lowestMarginItem.materialsSharePct, 0)}%
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span
              className={`font-mono tabular-nums text-lg font-semibold whitespace-nowrap ${
                report.lowestMarginItem && report.lowestMarginItem.marginPct <= 0
                  ? 'text-red-700'
                  : 'text-amber-800'
              }`}
            >
              {report.lowestMarginItem
                ? `${formatNumber(report.lowestMarginItem.marginPct, 2)}%`
                : '—'}
            </span>
            <span className="text-[11px] font-medium text-slate-700 truncate">
              {report.lowestMarginItem
                ? report.lowestMarginItem.shortLabel
                : 'Brak pozycji'}
            </span>
          </div>
        </div>
      </div>

      {/* Filters & Benchmark Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50/70 border border-slate-200 rounded-lg p-3.5">
        <div className="space-y-1">
          <label
            htmlFor="item-profit-category-filter"
            className="block text-[11px] font-medium text-slate-600"
          >
            Kategoria robót
          </label>
          <select
            id="item-profit-category-filter"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as WorkCategory | 'all')
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
          >
            <option value="all">
              Wszystkie kategorie ({report.totalEstimateItemsCount} poz.)
            </option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="item-profit-sort"
            className="block text-[11px] font-medium text-slate-600"
          >
            Kolejność słupków
          </label>
          <select
            id="item-profit-sort"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as ItemProfitabilitySortMode)
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
          >
            <option value="estimate_order">Kolejność z kosztorysu (Lp.)</option>
            <option value="margin_asc">Od najniższej rentowności (%)</option>
            <option value="margin_desc">Od najwyższej rentowności (%)</option>
            <option value="profit_desc">Od najwyższego zysku (PLN)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="item-profit-benchmark"
            className="block text-[11px] font-medium text-slate-600"
          >
            Punkt odniesienia na wykresie
          </label>
          <select
            id="item-profit-benchmark"
            value={
              benchmarkMode === 'selected_avg'
                ? 'selected_avg'
                : referenceCountyId
            }
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'selected_avg') {
                setBenchmarkMode('selected_avg');
              } else {
                setBenchmarkMode('single_county');
                setReferenceCountyId(val as CountyBenchmarkId);
              }
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
          >
            <option value="selected_avg">
              Średnia wybranych powiatów ({formatNumber(report.selectedCountiesAvgMarginPct, 2)}%)
            </option>
            {selectedCountyMetas.map((c) => (
              <option key={c.id} value={c.id}>
                Tylko {c.shortName} ({formatNumber(c.avgMarginPct, 1)}%)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* County Filter Bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">
            Wybrane powiaty Dolnego Śląska do porównania (min. 1)
          </span>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => applyPreset(allCountyIds)}
              className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap shrink-0 ${
                isAllPreset
                  ? 'bg-slate-900 text-white border-slate-900 font-medium'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Wszystkie 10 powiatów
            </button>
            <button
              type="button"
              onClick={() => applyPreset(METRO_LGOM_PRESET)}
              className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap shrink-0 ${
                isMetroPreset
                  ? 'bg-slate-900 text-white border-slate-900 font-medium'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Wrocław i LGOM
            </button>
            <button
              type="button"
              onClick={() => applyPreset(WEST_DS_PRESET)}
              className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap shrink-0 ${
                isWestPreset
                  ? 'bg-slate-900 text-white border-slate-900 font-medium'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Zachód DŚ (Lwówek · Bolesławiec · Złotoryja)
            </button>
            {subregionCountyIds.length > 0 && (
              <button
                type="button"
                onClick={() => applyPreset(subregionCountyIds)}
                className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap shrink-0 ${
                  isSubregionPreset
                    ? 'bg-slate-900 text-white border-slate-900 font-medium'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {subregions[settings.subregionId]?.name ?? 'Aktywny subregion'}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {counties.map((county) => {
            const checked = selectedCounties.includes(county.id);
            const inActiveSubregion = county.subregionId === settings.subregionId;
            return (
              <button
                key={county.id}
                type="button"
                aria-pressed={checked}
                onClick={() => toggleCounty(county.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  checked
                    ? inActiveSubregion
                      ? 'bg-sky-50 text-sky-900 border-sky-300'
                      : 'bg-slate-100 text-slate-900 border-slate-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {checked && <Check className="w-3 h-3 shrink-0" />}
                <span>
                  {county.shortName} ({formatNumber(county.avgMarginPct, 1)}%)
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grouped BarChart */}
      {report.bars.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
          Brak pozycji spełniających wybrane kryteria. Dodaj pozycje do kosztorysu lub zmień filtr kategorii.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="h-[340px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={report.bars}
                margin={{ top: 18, right: 16, left: 6, bottom: 30 }}
                barGap={4}
                barCategoryGap="20%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="shortLabel"
                  interval={0}
                  angle={report.bars.length > 6 ? -18 : 0}
                  textAnchor={report.bars.length > 6 ? 'end' : 'middle'}
                  height={report.bars.length > 6 ? 62 : 34}
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  width={metricMode === 'profit_pln' ? 84 : 56}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val: number) =>
                    metricMode === 'profit_pln'
                      ? Math.abs(val) >= 1000
                        ? `${formatNumber(val / 1000, 1)} tys.`
                        : `${Math.round(val)} zł`
                      : `${formatNumber(val, 1)}%`
                  }
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={
                    <ItemProfitabilityTooltip
                      benchmarkLabel={report.benchmarkLabel}
                    />
                  }
                />
                {metricMode === 'margin_pct' && (
                  <ReferenceLine
                    y={report.benchmarkMarginPct}
                    stroke="#334155"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                )}
                <Bar
                  dataKey="selectedMetricValue"
                  name={
                    metricMode === 'profit_pln'
                      ? 'Zysk pozycji (PLN)'
                      : 'Rentowność pozycji (%)'
                  }
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={38}
                  onClick={(data) => {
                    const barId = (data as unknown as { id?: string })?.id;
                    if (barId) setInspectedItemId(barId);
                  }}
                  className="cursor-pointer"
                >
                  {report.bars.map((entry) => {
                    const fill =
                      entry.status === 'unprofitable'
                        ? '#dc2626'
                        : entry.status === 'above_market'
                        ? '#059669'
                        : '#d97706';
                    return <Cell key={entry.id} fill={fill} />;
                  })}
                </Bar>
                <Bar
                  dataKey="benchmarkMetricValue"
                  name={
                    benchmarkMode === 'single_county'
                      ? `Marża powiatu (${formatNumber(report.benchmarkMarginPct, 1)}%)`
                      : `Średnia wybranych powiatów (${formatNumber(report.benchmarkMarginPct, 1)}%)`
                  }
                  fill="#64748b"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={38}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Color Legend Detail Line */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" />
                Powyżej / równo benchmarku ({report.aboveBenchmarkCount})
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="w-3 h-3 rounded-sm bg-amber-600 inline-block" />
                Poniżej benchmarku powiatowego ({report.belowBenchmarkCount})
              </span>
              {report.unprofitableCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-red-700 font-medium">
                  <span className="w-3 h-3 rounded-sm bg-red-600 inline-block" />
                  Nierentowna &le; 0% ({report.unprofitableCount})
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span className="w-3 h-3 rounded-sm bg-slate-500 inline-block" />
                Benchmark rynkowy ({report.benchmarkLabel})
              </span>
            </div>
            <span className="text-slate-500">
              Kliknij słupek pozycji, aby podejrzeć odchylenia dla każdego powiatu
            </span>
          </div>

          {/* Interactive Selected Item vs Selected Counties Breakdown */}
          {inspectedBar && (
            <div className="border border-slate-200 rounded-lg bg-slate-50/70 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Szczegółowa analiza pozycji vs wybrane powiaty
                  </div>
                  <div className="text-xs font-semibold text-slate-900">
                    Poz. {inspectedBar.lp} ({inspectedBar.knrCode}) ·{' '}
                    {inspectedBar.fullName}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Wybierz pozycję do analizy powiatowej"
                    value={inspectedBar.id}
                    onChange={(e) => setInspectedItemId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-amber-600 focus:outline-none"
                  >
                    {report.bars.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.shortLabel} ({formatNumber(b.marginPct, 2)}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {inspectedBar.countyDeltas.map((cd) => {
                  const signPp = cd.deltaPp > 0 ? '+' : '';
                  const signPln = cd.deltaPln > 0 ? '+' : '';
                  return (
                    <div
                      key={cd.countyId}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500">
                        <span className="truncate font-medium text-slate-700">
                          {cd.countyShortName}
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatNumber(cd.countyMarginPct, 1)}%
                        </span>
                      </div>
                      <div
                        className={`mt-1 font-mono tabular-nums font-semibold ${
                          cd.deltaPp >= 0
                            ? 'text-emerald-700'
                            : 'text-amber-800'
                        }`}
                      >
                        {signPp}
                        {formatNumber(cd.deltaPp, 2)} p.p.
                      </div>
                      <div className="font-mono tabular-nums text-[10px] text-slate-500">
                        {signPln}
                        {formatPLN(cd.deltaPln)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
