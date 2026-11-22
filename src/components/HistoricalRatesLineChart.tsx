import React, { useEffect, useMemo, useState } from 'react';
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
import { TrendingUp } from 'lucide-react';
import { PRICE_SOURCES, SUBREGIONS } from '../data/dolnoslaskieRates';
import {
  EstimateSettings,
  EstimateSummary,
  HistoricalRatePoint,
  PriceSourceId,
  PriceSourceMeta,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import {
  buildRegionalRateHistory,
  formatNumber,
  formatPLN,
} from '../utils/calculations';

interface HistoricalRatesLineChartProps {
  settings: EstimateSettings;
  summary: EstimateSummary;
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
}

interface HistoryTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: HistoricalRatePoint;
  }>;
  viewMode: 'rates_pln' | 'index_100';
}

function HistoryTooltip({
  active,
  payload,
  viewMode,
}: HistoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const laborRate = point.laborRatePln ?? point.laborForecastPln;
  const equipmentRate = point.equipmentRatePln ?? point.equipmentForecastPln;
  const laborIdx = point.laborIndex ?? point.laborForecastIndex;
  const equipmentIdx = point.equipmentIndex ?? point.equipmentForecastIndex;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm min-w-[235px] space-y-1.5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900">
          {point.monthLabel.replace('*', '')}
        </span>
        <span
          className={`text-[11px] font-medium whitespace-nowrap ${
            point.isForecast ? 'text-amber-800' : 'text-slate-500'
          }`}
        >
          {point.isForecast ? 'Prognoza trendu' : 'Dane historyczne'}
        </span>
      </div>

      <div className="space-y-1 font-mono tabular-nums text-[11px]">
        {laborRate !== null && (
          <div className="flex justify-between gap-4 text-slate-800">
            <span>Robocizna (R):</span>
            <span className="font-semibold">
              {formatNumber(laborRate, 2)} zł/r-g
              {laborIdx !== null ? ` (${formatNumber(laborIdx, 1)})` : ''}
            </span>
          </div>
        )}
        {equipmentRate !== null && (
          <div className="flex justify-between gap-4 text-sky-900">
            <span>Sprzęt (S):</span>
            <span className="font-semibold">
              {formatNumber(equipmentRate, 2)} zł/m-g
              {equipmentIdx !== null ? ` (${formatNumber(equipmentIdx, 1)})` : ''}
            </span>
          </div>
        )}
      </div>

      {viewMode === 'index_100' && (
        <div className="pt-1 border-t border-slate-100 text-[11px] text-slate-500">
          Baza indeksu 100,0 = grudzień 2025
        </div>
      )}
    </div>
  );
}

export function HistoricalRatesLineChart({
  settings,
  summary,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
}: HistoricalRatesLineChartProps) {
  const [selectedRegion, setSelectedRegion] = useState<SubregionId>(
    settings.subregionId
  );
  const [viewMode, setViewMode] = useState<'rates_pln' | 'index_100'>('rates_pln');
  const [includeForecast, setIncludeForecast] = useState<boolean>(true);

  useEffect(() => {
    setSelectedRegion(settings.subregionId);
  }, [settings.subregionId]);

  const report = useMemo(
    () =>
      buildRegionalRateHistory({
        subregionId: selectedRegion,
        sourceId: settings.sourceId,
        includeForecast,
        estimateSummary: summary,
        priceSources,
        subregions,
      }),
    [selectedRegion, settings.sourceId, includeForecast, summary, priceSources, subregions]
  );

  const subregionList = useMemo(
    () => Object.values(subregions),
    [subregions]
  );
  const selectedRegionMeta = subregions[selectedRegion];
  const isDifferentFromEstimateRegion = selectedRegion !== settings.subregionId;
  const impactSign = report.projectedEstimateImpactPln > 0 ? '+' : '';

  return (
    <section
      aria-label="Historia średnich cen robocizny i sprzętu z 12 miesięcy"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex-1 min-w-0 sm:min-w-[280px]">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Historia średnich cen robocizny i sprzętu (ostatnie 12 miesięcy)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Zmiany stawek bazowych R (zł/r-g) oraz S (zł/m-g) w okresie gru 2025 – lis 2026 dla wybranego regionu wraz z projekcją trendu na kolejne 3 miesiące.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div
            role="group"
            aria-label="Tryb wykresu historycznego"
            className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setViewMode('rates_pln')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'rates_pln'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stawki (zł/r-g i zł/m-g)
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
              Indeks dynamiki (100 = gru 25)
            </button>
          </div>

          <button
            type="button"
            aria-pressed={includeForecast}
            onClick={() => setIncludeForecast((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              includeForecast
                ? 'bg-amber-50 text-amber-950 border-amber-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>Prognoza +3 mies.</span>
          </button>
        </div>
      </div>

      {/* Region Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="history-region-select"
            className="text-xs font-medium text-slate-700 whitespace-nowrap"
          >
            Analizowany region:
          </label>
          <select
            id="history-region-select"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value as SubregionId)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
          >
            {subregionList.map((reg) => (
              <option key={reg.id} value={reg.id}>
                {reg.name}
                {reg.id === settings.subregionId ? ' (region kosztorysu)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
          <span>Baza odniesienia: {report.sourceShortName}</span>
          <span aria-hidden="true">·</span>
          <span>Miasta: {selectedRegionMeta?.cities}</span>
          {isDifferentFromEstimateRegion && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-amber-800">
                Podgląd porównawczy regionu
              </span>
            </>
          )}
        </div>
      </div>

      {/* 3-Card Insight Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Robocizna (R) · lis 2026</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              +{formatNumber(report.laborChange12mPct, 1)}% r/r
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-slate-900">
              {formatNumber(report.currentLaborRatePln, 2)} zł/r-g
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
              12M: {formatNumber(report.laborMinPln, 2)} – {formatNumber(report.laborMaxPln, 2)} zł
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Sprzęt (S) · lis 2026</span>
            <span className="font-mono tabular-nums font-semibold text-sky-900">
              +{formatNumber(report.equipmentChange12mPct, 1)}% r/r
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-sky-900">
              {formatNumber(report.currentEquipmentRatePln, 2)} zł/m-g
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
              12M: {formatNumber(report.equipmentMinPln, 2)} – {formatNumber(report.equipmentMaxPln, 2)} zł
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="whitespace-nowrap">Prognoza +3M (lut 27)</span>
            <span className="font-mono tabular-nums text-[11px] font-medium text-amber-800 whitespace-nowrap">
              R +{formatNumber(report.forecastQuarterLaborPct, 1)}% · S +{formatNumber(report.forecastQuarterEquipmentPct, 1)}%
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-slate-900 whitespace-nowrap">
              {summary.directTotal > 0
                ? `${impactSign}${formatPLN(report.projectedEstimateImpactPln)}`
                : `${formatNumber(report.forecastEndLaborPln, 2)} / ${formatNumber(report.forecastEndEquipmentPln, 2)} zł`}
            </span>
            <span className="text-[11px] text-slate-500 whitespace-nowrap">
              {summary.directTotal > 0 ? 'wpływ na R+S zlecenia' : 'prognoza R / S'}
            </span>
          </div>
        </div>
      </div>

      {/* Recharts LineChart */}
      <div className="space-y-2">
        <div className="h-[310px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={310}>
            <LineChart
              data={report.points}
              margin={{ top: 14, right: 20, left: 6, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                vertical={false}
              />
              <XAxis
                dataKey="monthLabel"
                interval={0}
                tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />

              {viewMode === 'rates_pln' ? (
                <>
                  <YAxis
                    yAxisId="labor"
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) => `${v} zł`}
                    tick={{ fill: '#1e293b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={54}
                  />
                  <YAxis
                    yAxisId="equipment"
                    orientation="right"
                    domain={['auto', 'auto']}
                    tickFormatter={(v: number) => `${Math.round(v)} zł`}
                    tick={{ fill: '#0369a1', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip
                    content={<HistoryTooltip viewMode={viewMode} />}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  />
                  <Line
                    yAxisId="labor"
                    type="monotone"
                    dataKey="laborRatePln"
                    name="Robocizna R (zł/r-g)"
                    stroke="#1e293b"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#1e293b' }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="equipment"
                    type="monotone"
                    dataKey="equipmentRatePln"
                    name="Sprzęt S (zł/m-g)"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#0284c7' }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {includeForecast && (
                    <>
                      <Line
                        yAxisId="labor"
                        type="monotone"
                        dataKey="laborForecastPln"
                        name="Prognoza R (+3M)"
                        stroke="#475569"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={{ r: 3, fill: '#ffffff', stroke: '#475569', strokeWidth: 2 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="equipment"
                        type="monotone"
                        dataKey="equipmentForecastPln"
                        name="Prognoza S (+3M)"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={{ r: 3, fill: '#ffffff', stroke: '#0284c7', strokeWidth: 2 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  <YAxis
                    domain={[90, 'auto']}
                    tickFormatter={(v: number) => `${v}`}
                    tick={{ fill: '#334155', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <ReferenceLine
                    y={100}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    content={<HistoryTooltip viewMode={viewMode} />}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="laborIndex"
                    name="Indeks robocizny R (gru 25 = 100)"
                    stroke="#1e293b"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#1e293b' }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="equipmentIndex"
                    name="Indeks sprzętu S (gru 25 = 100)"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#0284c7' }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {includeForecast && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="laborForecastIndex"
                        name="Prognoza indeksu R (+3M)"
                        stroke="#475569"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={{ r: 3, fill: '#ffffff', stroke: '#475569', strokeWidth: 2 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="equipmentForecastIndex"
                        name="Prognoza indeksu S (+3M)"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={{ r: 3, fill: '#ffffff', stroke: '#0284c7', strokeWidth: 2 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </>
                  )}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>{report.driverNote}</span>
          <span className="whitespace-nowrap">
            * Miesiące oznaczone gwiazdką stanowią prognozę liniową na podstawie dynamiki 12M.
          </span>
        </div>
      </div>
    </section>
  );
}
