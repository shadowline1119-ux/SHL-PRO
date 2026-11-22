import React, { useMemo, useState } from 'react';
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
  LOWER_SILESIA_COUNTY_MARGINS,
  SUBREGIONS,
} from '../data/dolnoslaskieRates';
import {
  CountyBenchmarkId,
  CountyMarginBenchmark,
  EstimateSettings,
  EstimateSummary,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import {
  buildProfitMarginCountyComparison,
  CountyMarginChartBar,
  formatNumber,
  formatPLN,
} from '../utils/calculations';

interface ProfitMarginCountyChartProps {
  summary: EstimateSummary;
  settings: EstimateSettings;
  projectName?: string;
  counties?: CountyMarginBenchmark[];
  subregions?: Record<SubregionId, SubregionMeta>;
}

interface MarginTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: CountyMarginChartBar;
  }>;
  estimateNetTotal: number;
}

function MarginTooltip({
  active,
  payload,
  estimateNetTotal,
}: MarginTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const isEstimate = row.kind === 'estimate';
  const signPp = row.deltaFromEstimatePp > 0 ? '+' : '';
  const signPln = row.deltaFromEstimatePln > 0 ? '+' : '';

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm max-w-[290px] space-y-1.5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900">{row.fullName}</span>
        <span className="font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
          {formatNumber(row.marginPct, 2)}%
        </span>
      </div>

      <div className="space-y-1 font-mono tabular-nums text-[11px]">
        <div className="flex justify-between gap-4 text-slate-700">
          <span>
            {isEstimate ? 'Zysk na kosztorysie:' : 'Zysk wg średniej powiatu:'}
          </span>
          <span className="font-semibold text-slate-900">
            {formatPLN(row.profitPln)}
          </span>
        </div>

        {!isEstimate && row.typicalRangeMinPct !== undefined && row.typicalRangeMaxPct !== undefined && (
          <div className="flex justify-between gap-4 text-slate-600">
            <span>Typowe widełki rynkowe:</span>
            <span>
              {formatNumber(row.typicalRangeMinPct, 1)}% – {formatNumber(row.typicalRangeMaxPct, 1)}%
            </span>
          </div>
        )}

        {!isEstimate && estimateNetTotal > 0 && (
          <div className="flex justify-between gap-4 text-slate-700">
            <span>Różnica vs Twój kosztorys:</span>
            <span
              className={
                row.deltaFromEstimatePp > 0
                  ? 'text-emerald-700 font-semibold'
                  : row.deltaFromEstimatePp < 0
                  ? 'text-amber-800 font-semibold'
                  : 'text-slate-600'
              }
            >
              {signPp}
              {formatNumber(row.deltaFromEstimatePp, 2)} p.p. ({signPln}
              {formatNumber(row.deltaFromEstimatePln, 0)} zł)
            </span>
          </div>
        )}
      </div>

      {row.marketNote && (
        <p className="pt-1 border-t border-slate-100 text-[11px] text-slate-500 leading-snug">
          {row.marketNote}
        </p>
      )}
    </div>
  );
}

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
  'pow_swidnicki',
];

export function ProfitMarginCountyChart({
  summary,
  settings,
  projectName,
  counties = LOWER_SILESIA_COUNTY_MARGINS,
  subregions = SUBREGIONS,
}: ProfitMarginCountyChartProps) {
  const allCountyIds = useMemo(() => counties.map((c) => c.id), [counties]);
  const [selectedCounties, setSelectedCounties] =
    useState<CountyBenchmarkId[]>(allCountyIds);
  const [metricMode, setMetricMode] = useState<'margin_pct' | 'profit_pln'>(
    'margin_pct'
  );

  const comparison = useMemo(
    () =>
      buildProfitMarginCountyComparison({
        summary,
        settings,
        counties,
        selectedCountyIds: selectedCounties,
        metricMode,
        projectName,
      }),
    [summary, settings, counties, selectedCounties, metricMode, projectName]
  );

  const toggleCounty = (id: CountyBenchmarkId) => {
    setSelectedCounties((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev;
        return prev.filter((item) => item !== id);
      }
      return allCountyIds.filter((item) => item === id || prev.includes(item));
    });
  };

  const applyPreset = (ids: CountyBenchmarkId[]) => {
    const valid = allCountyIds.filter((id) => ids.includes(id));
    if (valid.length >= 2) {
      setSelectedCounties(valid);
    }
  };

  const matchesSet = (target: CountyBenchmarkId[]) =>
    selectedCounties.length === target.length &&
    target.every((id) => selectedCounties.includes(id));

  const isAllPreset = selectedCounties.length === allCountyIds.length;
  const isWestPreset = matchesSet(WEST_DS_PRESET);
  const isMetroPreset = matchesSet(METRO_LGOM_PRESET);

  const activeRegionName = subregions[settings.subregionId]?.name ?? '';
  const deltaSign = comparison.deltaVsSelectedAvgPp > 0 ? '+' : '';
  const deltaPlnSign = comparison.deltaVsSelectedAvgPln > 0 ? '+' : '';

  return (
    <section
      aria-label="Porównanie przewidywanej marży zysku w powiatach Dolnego Śląska"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex-1 min-w-[280px]">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Przewidywana marża zysku na tle powiatów Dolnego Śląska
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Zestawienie realnej marży netto aktualnego kosztorysu (po uwzględnieniu narzutu Zysk{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {settings.profitPct}%
            </span>{' '}
            i rabatu{' '}
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {settings.discountPct}%
            </span>
            ) ze średnimi marżami rynkowymi dla subregionu{' '}
            <span className="font-medium text-slate-800">{activeRegionName}</span> i pozostałych powiatów.
          </p>
        </div>

        <div
          role="group"
          aria-label="Jednostka porównania marży"
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
            Marża zysku (%)
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
            Kwota zysku (PLN)
          </button>
        </div>
      </div>

      {/* Insight Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">Przewidywana marża kosztorysu</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span
              className={`font-mono tabular-nums text-lg font-semibold ${
                comparison.projectedMarginPct < 0
                  ? 'text-red-700'
                  : 'text-amber-800'
              }`}
            >
              {formatNumber(comparison.projectedMarginPct, 2)}%
            </span>
            <span className="font-mono tabular-nums text-xs font-medium text-slate-700 whitespace-nowrap">
              {formatPLN(comparison.projectedProfitPln)}
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">
            Średnia rynkowa ({comparison.selectedCountiesCount} powiatów)
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-slate-900">
              {formatNumber(comparison.selectedAvgMarginPct, 2)}%
            </span>
            <span
              className={`font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${
                comparison.deltaVsSelectedAvgPp >= 0
                  ? 'text-emerald-700'
                  : 'text-amber-800'
              }`}
            >
              {deltaSign}
              {formatNumber(comparison.deltaVsSelectedAvgPp, 2)} p.p. ({deltaPlnSign}
              {formatNumber(comparison.deltaVsSelectedAvgPln, 0)} zł)
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">
            Najwyższa marża i pozycja kosztorysu
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
              {comparison.highestCounty.shortLabel}{' '}
              <span className="font-mono tabular-nums text-emerald-700">
                ({formatNumber(comparison.highestCounty.marginPct, 1)}%)
              </span>
            </span>
            <span className="font-mono tabular-nums text-xs font-semibold text-slate-700 whitespace-nowrap">
              Pozycja {comparison.estimateRankAmongSelected}. z {comparison.bars.length}
            </span>
          </div>
        </div>
      </div>

      {/* County Filter Bar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">
            Wybrane powiaty Dolnego Śląska (min. 2)
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
              onClick={() => applyPreset(WEST_DS_PRESET)}
              className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap shrink-0 ${
                isWestPreset
                  ? 'bg-slate-900 text-white border-slate-900 font-medium'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Zachód DŚ (Lwówek · Bolesławiec · Złotoryja)
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
                <span>{county.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* BarChart */}
      {summary.netTotal <= 0 ? (
        <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
          Dodaj pozycje do kosztorysu, aby porównać przewidywaną marżę zysku ze średnimi stawkami w powiatach Dolnego Śląska.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="h-[320px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={comparison.bars}
                margin={{ top: 16, right: 20, left: 10, bottom: 28 }}
                barCategoryGap="18%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="shortLabel"
                  interval={0}
                  angle={comparison.bars.length > 7 ? -18 : 0}
                  textAnchor={comparison.bars.length > 7 ? 'end' : 'middle'}
                  height={comparison.bars.length > 7 ? 56 : 32}
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val: number) =>
                    metricMode === 'profit_pln'
                      ? `${Math.round(val / 1000)} tys.`
                      : `${val}%`
                  }
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={metricMode === 'profit_pln' ? 72 : 48}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={
                    <MarginTooltip estimateNetTotal={comparison.estimateNetTotal} />
                  }
                />
                <ReferenceLine
                  y={
                    metricMode === 'profit_pln'
                      ? comparison.projectedProfitPln
                      : comparison.projectedMarginPct
                  }
                  stroke={comparison.projectedMarginPct < 0 ? '#dc2626' : '#d97706'}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <Bar
                  dataKey="selectedMetricValue"
                  name={
                    metricMode === 'profit_pln'
                      ? 'Zysk netto (PLN)'
                      : 'Marża zysku (%)'
                  }
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={54}
                >
                  {comparison.bars.map((entry) => {
                    let fill = '#334155';
                    if (entry.kind === 'estimate') {
                      fill = entry.marginPct < 0 ? '#dc2626' : '#d97706';
                    } else if (entry.isActiveSubregion) {
                      fill = '#0284c7';
                    }
                    return <Cell key={entry.id} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                <span className="w-3 h-3 rounded-sm bg-amber-600 inline-block" />
                Aktualny kosztorys ({formatNumber(comparison.projectedMarginPct, 2)}%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-sky-600 inline-block" />
                Powiaty aktywnego subregionu
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-slate-700 inline-block" />
                Pozostałe powiaty Dolnego Śląska
              </span>
            </div>
            <span className="font-mono tabular-nums text-slate-600">
              Wartość netto kosztorysu: {formatPLN(comparison.estimateNetTotal)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
