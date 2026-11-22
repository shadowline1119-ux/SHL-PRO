import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Check, TrendingDown } from 'lucide-react';
import { PRICE_SOURCES, SUBREGIONS, WORK_CATALOG } from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  EstimateLineItem,
  EstimateSettings,
  PriceSourceId,
  PriceSourceMeta,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import {
  buildUnitPriceMarketComparison,
  formatNumber,
  formatPLN,
  getOrderedComparableCatalogItems,
  UnitPriceMarketRow,
} from '../utils/calculations';

interface UnitPriceMarketChartProps {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  workCatalog?: CatalogWorkItem[];
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  onSelectSource: (sourceId: PriceSourceId) => void;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: UnitPriceMarketRow;
  }>;
  unitLabel: string;
  priceMode: 'net_with_markups' | 'direct_rms';
}

function UnitPriceTooltip({
  active,
  payload,
  unitLabel,
  priceMode,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm min-w-[230px] space-y-1.5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900">{row.sourceName}</span>
        {row.isCheapest && (
          <span className="font-semibold text-emerald-700 whitespace-nowrap">
            Najtańsza
          </span>
        )}
      </div>

      <div className="space-y-1 font-mono tabular-nums text-[11px]">
        <div className="flex justify-between gap-4 text-slate-700">
          <span>Robocizna (R):</span>
          <span>{formatNumber(row.laborUnit, 2)} zł/{unitLabel}</span>
        </div>
        <div className="flex justify-between gap-4 text-amber-800">
          <span>Materiały (M):</span>
          <span>{formatNumber(row.materialsUnit, 2)} zł/{unitLabel}</span>
        </div>
        <div className="flex justify-between gap-4 text-sky-900">
          <span>Sprzęt (S):</span>
          <span>{formatNumber(row.equipmentUnit, 2)} zł/{unitLabel}</span>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-1.5 space-y-1 font-mono tabular-nums">
        <div className="flex justify-between gap-4 text-slate-700">
          <span>Koszt bezp. R+M+S:</span>
          <span className="font-medium">{formatPLN(row.directUnitTotal)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-900 font-semibold">
          <span>
            {priceMode === 'direct_rms'
              ? 'Porównywana (bezp.):'
              : 'Cena j. netto (z narzutami):'}
          </span>
          <span>{formatPLN(row.selectedPrice)}</span>
        </div>
        <div className="flex justify-between gap-4 text-[11px] text-slate-500">
          <span>Różnica od minimum:</span>
          <span>
            {row.deltaFromMinPln === 0
              ? '0,00 zł (najtaniej)'
              : `+${formatNumber(row.deltaFromMinPln, 2)} zł (+${row.deltaFromMinPct}%)`}
          </span>
        </div>
      </div>
    </div>
  );
}

export function UnitPriceMarketChart({
  items,
  settings,
  workCatalog = WORK_CATALOG,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
  onSelectSource,
}: UnitPriceMarketChartProps) {
  const orderedGroups = useMemo(
    () => getOrderedComparableCatalogItems(items, workCatalog),
    [items, workCatalog]
  );

  const defaultItemId =
    orderedGroups.inEstimate[0]?.item.id ?? workCatalog[0]?.id ?? '';

  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(defaultItemId);
  const [priceMode, setPriceMode] = useState<'net_with_markups' | 'direct_rms'>(
    'net_with_markups'
  );
  const [chartStyle, setChartStyle] = useState<'total' | 'stacked_rms'>(
    'stacked_rms'
  );

  const allSourceIds = useMemo(
    () => Object.keys(priceSources) as PriceSourceId[],
    [priceSources]
  );
  const [selectedSources, setSelectedSources] = useState<PriceSourceId[]>(allSourceIds);

  const selectedCatalogItem = useMemo(() => {
    return (
      workCatalog.find((c) => c.id === selectedCatalogId) ??
      orderedGroups.inEstimate[0]?.item ??
      workCatalog[0]
    );
  }, [workCatalog, selectedCatalogId, orderedGroups.inEstimate]);

  const comparison = useMemo(() => {
    if (!selectedCatalogItem) return null;
    return buildUnitPriceMarketComparison({
      catalogItem: selectedCatalogItem,
      settings,
      priceSources,
      subregions,
      selectedSourceIds: selectedSources,
      priceMode,
      activeEstimateItems: items,
    });
  }, [
    selectedCatalogItem,
    settings,
    priceSources,
    subregions,
    selectedSources,
    priceMode,
    items,
  ]);

  const toggleSource = (id: PriceSourceId) => {
    setSelectedSources((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // Keep at least 2 databases to compare
        return prev.filter((s) => s !== id);
      }
      return allSourceIds.filter((s) => s === id || prev.includes(s));
    });
  };

  const applyPresetOrgbudVsSekocenbud = () => {
    const pair: PriceSourceId[] = ['orgbud', 'sekocenbud'].filter((id): id is PriceSourceId =>
      allSourceIds.includes(id as PriceSourceId)
    );
    if (pair.length >= 2) {
      setSelectedSources(pair);
    }
  };

  const applyPresetAllSources = () => {
    setSelectedSources(allSourceIds);
  };

  if (!selectedCatalogItem || !comparison) {
    return null;
  }

  const isOrgbudVsSekocenbudPreset =
    selectedSources.length === 2 &&
    selectedSources.includes('orgbud') &&
    selectedSources.includes('sekocenbud');

  const cheapestMeta = priceSources[comparison.cheapestSourceId];
  const expensiveMeta = priceSources[comparison.mostExpensiveSourceId];
  const activeRegionName = subregions[settings.subregionId]?.name ?? '';
  const unitLabel = selectedCatalogItem.unit;

  return (
    <div
      aria-label="Porównanie cen jednostkowych wybranych pozycji między bazami rynkowymi"
      className="pt-6 border-t border-slate-200 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Porównanie cen jednostkowych między bazami rynkowymi (Recharts)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Zestawienie stawki za 1 {unitLabel} wybranej usługi lub materiału między katalogami (np. Orgbud-Serwis vs Sekocenbud) dla subregionu{' '}
            <span className="font-medium text-slate-700">{activeRegionName}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div
            role="group"
            aria-label="Tryb kalkulacji ceny jednostkowej"
            className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setPriceMode('net_with_markups')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                priceMode === 'net_with_markups'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cena j. netto (z narzutami)
            </button>
            <button
              type="button"
              onClick={() => setPriceMode('direct_rms')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                priceMode === 'direct_rms'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Koszt bezp. R+M+S
            </button>
          </div>

          <div
            role="group"
            aria-label="Widok wykresu słupkowego"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setChartStyle('stacked_rms')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                chartStyle === 'stacked_rms'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Składniki R / M / S
            </button>
            <button
              type="button"
              onClick={() => setChartStyle('total')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                chartStyle === 'total'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cena łącznie
            </button>
          </div>
        </div>
      </div>

      {/* Item selector + market database filter bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
        <div className="lg:col-span-6">
          <label
            htmlFor="unit-price-item-select"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Wybrana usługa lub materiał z katalogu KNR
          </label>
          <select
            id="unit-price-item-select"
            value={selectedCatalogItem.id}
            onChange={(e) => setSelectedCatalogId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
          >
            {orderedGroups.inEstimate.length > 0 && (
              <optgroup label="Pozycje z aktywnego kosztorysu">
                {orderedGroups.inEstimate.map(({ item: cat, estimateQuantity }) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.knr} · {cat.name} ({formatNumber(estimateQuantity, 0)} {cat.unit})
                  </option>
                ))}
              </optgroup>
            )}
            {orderedGroups.otherCatalog.length > 0 && (
              <optgroup label="Pozostałe materiały i roboty z katalogu">
                {orderedGroups.otherCatalog.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.knr} · {cat.name} (j.m.: {cat.unit})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="lg:col-span-6 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">
              Porównywane bazy cenowe (min. 2)
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={applyPresetOrgbudVsSekocenbud}
                className={`px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                  isOrgbudVsSekocenbudPreset
                    ? 'bg-slate-900 text-white border-slate-900 font-medium'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                ORGBUD vs Sekocenbud
              </button>
              <button
                type="button"
                onClick={applyPresetAllSources}
                className={`px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                  selectedSources.length === allSourceIds.length
                    ? 'bg-slate-900 text-white border-slate-900 font-medium'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Wszystkie 5 baz
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {allSourceIds.map((srcId) => {
              const checked = selectedSources.includes(srcId);
              const meta = priceSources[srcId];
              return (
                <button
                  key={srcId}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleSource(srcId)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    checked
                      ? 'bg-amber-50 text-amber-950 border-amber-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {checked && <Check className="w-3 h-3 text-amber-700 shrink-0" />}
                  <span>{meta.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Insight Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">Najkorzystniejsza baza dla pozycji</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-semibold text-sm text-emerald-800 truncate">
              {cheapestMeta.shortName}
            </span>
            <span className="font-mono tabular-nums text-base font-semibold text-slate-900 whitespace-nowrap">
              {formatPLN(comparison.minPrice)} / {unitLabel}
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">
            Rozpiętość cenowa (vs {expensiveMeta.shortName})
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-base font-semibold text-slate-900">
              {formatPLN(comparison.spreadPln)} / {unitLabel}
            </span>
            <span className="font-mono tabular-nums text-xs font-semibold text-amber-800">
              +{formatNumber(comparison.spreadPct, 1)}% różnicy
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">
            {comparison.activeQuantityInEstimate > 0
              ? `Oszczędność vs aktywna (${formatNumber(comparison.activeQuantityInEstimate, 0)} ${unitLabel})`
              : 'Rekomendacja kosztorysowa'}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono tabular-nums text-base font-semibold text-slate-900 whitespace-nowrap">
              {comparison.potentialTotalSavingPln > 0
                ? formatPLN(comparison.potentialTotalSavingPln)
                : comparison.cheapestSourceId === settings.sourceId
                ? 'Aktywna najtańsza baza'
                : `−${formatNumber(comparison.spreadPct, 1)}% (${cheapestMeta.shortName})`}
            </span>

            {comparison.cheapestSourceId !== settings.sourceId && (
              <button
                type="button"
                onClick={() => onSelectSource(comparison.cheapestSourceId)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>Wybierz {cheapestMeta.shortName}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recharts BarChart */}
      <div className="pt-2">
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={comparison.rows}
              margin={{ top: 12, right: 20, left: 10, bottom: 8 }}
              barCategoryGap="24%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val: number) => `${val} zł`}
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                content={
                  <UnitPriceTooltip unitLabel={unitLabel} priceMode={priceMode} />
                }
              />
              {chartStyle === 'stacked_rms' ? (
                <>
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  />
                  <Bar
                    dataKey="laborBar"
                    name={
                      priceMode === 'net_with_markups'
                        ? 'Robocizna (R + Kp/Zysk)'
                        : 'Robocizna (R)'
                    }
                    stackId="rms"
                    fill="#1e293b"
                    isAnimationActive={false}
                    maxBarSize={68}
                  />
                  <Bar
                    dataKey="materialsBar"
                    name="Materiały / BDO (M)"
                    stackId="rms"
                    fill="#d97706"
                    isAnimationActive={false}
                    maxBarSize={68}
                  />
                  <Bar
                    dataKey="equipmentBar"
                    name={
                      priceMode === 'net_with_markups'
                        ? 'Sprzęt (S + Kp/Zysk)'
                        : 'Sprzęt (S)'
                    }
                    stackId="rms"
                    fill="#0284c7"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                    maxBarSize={68}
                  />
                </>
              ) : (
                <Bar
                  dataKey="selectedPrice"
                  name={
                    priceMode === 'direct_rms'
                      ? `Koszt bezp. R+M+S (zł/${unitLabel})`
                      : `Cena j. netto (zł/${unitLabel})`
                  }
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={72}
                >
                  {comparison.rows.map((entry) => {
                    let fill = '#334155';
                    if (entry.isCheapest) fill = '#15803d';
                    else if (entry.isActiveSource) fill = '#b45309';
                    return <Cell key={entry.sourceId} fill={fill} />;
                  })}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            {chartStyle === 'stacked_rms'
              ? priceMode === 'net_with_markups'
                ? `Wysokość słupków odpowiada cenie jednostkowej netto za 1 ${unitLabel} wraz z narzutami (Kp ${settings.indirectCostsPct}%, Zysk ${settings.profitPct}%).`
                : `Wysokość słupków odpowiada bezpośrednim nakładom R + M + S za 1 ${unitLabel} bez narzutów.`
              : `Kolor zielony oznacza najtańszą bazę dla tej pozycji; kolor bursztynowy oznacza bazę aktualnie aktywną w kosztorysie.`}
          </span>
          <span className="font-mono tabular-nums text-slate-700">
            {selectedCatalogItem.knr} · j.m.: {unitLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
