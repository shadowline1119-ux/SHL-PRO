import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SUBREGIONS } from '../data/dolnoslaskieRates';
import {
  EstimateSettings,
  EstimateSummary,
  SeasonalEarthworkRiskPoint,
  SoilCategory,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import {
  buildEarthworksSeasonalityReport,
  formatNumber,
  formatPLN,
} from '../utils/calculations';

interface EarthworksSeasonalityChartProps {
  settings: EstimateSettings;
  summary: EstimateSummary;
  defaultSoilCategory?: SoilCategory;
  subregions?: Record<SubregionId, SubregionMeta>;
}

interface SeasonalityTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: SeasonalEarthworkRiskPoint;
  }>;
  bufferBasePln: number;
}

function getRiskTextClass(level: SeasonalEarthworkRiskPoint['riskLevel']): string {
  switch (level) {
    case 'niskie':
      return 'text-emerald-700';
    case 'umiarkowane':
      return 'text-sky-800';
    case 'wysokie':
      return 'text-amber-800';
    case 'krytyczne':
      return 'text-red-700';
  }
}

function SeasonalityTooltip({
  active,
  payload,
  bufferBasePln,
}: SeasonalityTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const bufferPln = Math.round(bufferBasePln * (point.suggestedCostBufferPct / 100) * 100) / 100;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm max-w-[295px] space-y-1.5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900">{point.monthFull}</span>
        <span
          className={`font-semibold whitespace-nowrap ${getRiskTextClass(point.riskLevel)}`}
        >
          Ryzyko: {point.riskLabel} ({formatNumber(point.delayRiskPct, 1)}%)
        </span>
      </div>

      <div className="space-y-1 font-mono tabular-nums text-[11px]">
        <div className="flex justify-between gap-4 text-sky-900">
          <span>Średnie opady w regionie:</span>
          <span className="font-semibold">{point.precipitationMm} mm</span>
        </div>
        <div className="flex justify-between gap-4 text-amber-800">
          <span>Sugerowany margines kosztowy:</span>
          <span className="font-semibold">
            +{formatNumber(point.suggestedCostBufferPct, 1)}%
          </span>
        </div>
        {bufferBasePln > 0 && (
          <div className="flex justify-between gap-4 text-slate-800">
            <span>Rezerwa do kosztorysu:</span>
            <span className="font-semibold">{formatPLN(bufferPln)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Bufor harmonogramu (na 20 dni rob.):</span>
          <span className="font-semibold">
            +{formatNumber(point.suggestedScheduleBufferDays, 1)} dni
          </span>
        </div>
      </div>

      <p className="pt-1 border-t border-slate-100 text-[11px] text-slate-500 leading-snug">
        {point.reasonNote}
      </p>
    </div>
  );
}

const SOIL_OPTIONS: { id: SoilCategory; label: string }[] = [
  { id: 'I-II', label: 'Kat. I–II (piaski, żwiry przepuszczalne)' },
  { id: 'III', label: 'Kat. III (gliny, iły — grunty spoiste)' },
  { id: 'IV', label: 'Kat. IV (zwietrzelina, rumosz skalny)' },
];

export function EarthworksSeasonalityChart({
  settings,
  summary,
  defaultSoilCategory = 'III',
  subregions = SUBREGIONS,
}: EarthworksSeasonalityChartProps) {
  const [selectedRegion, setSelectedRegion] = useState<SubregionId>(
    settings.subregionId
  );
  const [soilCategory, setSoilCategory] = useState<SoilCategory>(defaultSoilCategory);
  const [plannedMonthIndex, setPlannedMonthIndex] = useState<number>(10); // Listopad
  const [chartMode, setChartMode] = useState<'risk_precip' | 'safety_margin'>(
    'risk_precip'
  );

  useEffect(() => {
    setSelectedRegion(settings.subregionId);
  }, [settings.subregionId]);

  useEffect(() => {
    setSoilCategory(defaultSoilCategory);
  }, [defaultSoilCategory]);

  const report = useMemo(
    () =>
      buildEarthworksSeasonalityReport({
        subregionId: selectedRegion,
        soilCategory,
        plannedMonthIndex,
        estimateSummary: summary,
        subregions,
      }),
    [selectedRegion, soilCategory, plannedMonthIndex, summary, subregions]
  );

  const subregionList = useMemo(() => Object.values(subregions), [subregions]);
  const isDifferentRegion = selectedRegion !== settings.subregionId;

  return (
    <section
      aria-label="Ryzyko opóźnień robót ziemnych a sezonowość i opady"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex-1 min-w-0 sm:min-w-[280px]">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Ryzyko opóźnień robót ziemnych a sezonowość i opady w regionie
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Miesięczne ryzyko przestojów pogodowych i średnie opady dla wybranego subregionu Dolnego Śląska z wyliczeniem sugerowanego marginesu bezpieczeństwa dla kosztorysu.
          </p>
        </div>

        <div
          role="group"
          aria-label="Tryb wykresu sezonowości i marginesów"
          className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
        >
          <button
            type="button"
            onClick={() => setChartMode('risk_precip')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              chartMode === 'risk_precip'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Opady (mm) i ryzyko (%)
          </button>
          <button
            type="button"
            onClick={() => setChartMode('safety_margin')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              chartMode === 'safety_margin'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Marginesy bezpieczeństwa (%)
          </button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label
              htmlFor="seasonality-region-select"
              className="text-xs font-medium text-slate-700 whitespace-nowrap"
            >
              Region:
            </label>
            <select
              id="seasonality-region-select"
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

          <div className="flex items-center gap-2">
            <label
              htmlFor="seasonality-soil-select"
              className="text-xs font-medium text-slate-700 whitespace-nowrap"
            >
              Grunt:
            </label>
            <select
              id="seasonality-soil-select"
              value={soilCategory}
              onChange={(e) => setSoilCategory(e.target.value as SoilCategory)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
            >
              {SOIL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="seasonality-month-select"
              className="text-xs font-medium text-slate-700 whitespace-nowrap"
            >
              Planowany start:
            </label>
            <select
              id="seasonality-month-select"
              value={plannedMonthIndex}
              onChange={(e) => setPlannedMonthIndex(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
            >
              {report.months.map((m) => (
                <option key={m.monthIndex} value={m.monthIndex}>
                  {m.monthFull} ({formatNumber(m.delayRiskPct, 0)}% ryzyka)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
          <span className="font-mono tabular-nums">
            Suma opadów: {report.annualPrecipitationMm} mm/rok
          </span>
          {isDifferentRegion && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-amber-800">
                Podgląd regionu spoza kosztorysu
              </span>
            </>
          )}
        </div>
      </div>

      {/* 3-Card Insight Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="whitespace-nowrap">
              Start: {report.selectedMonth.monthFull}
            </span>
            <span
              className={`font-semibold whitespace-nowrap ${getRiskTextClass(
                report.selectedMonth.riskLevel
              )}`}
            >
              Ryzyko {report.selectedMonth.riskLabel.toLowerCase()}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-slate-900">
              {formatNumber(report.selectedMonth.delayRiskPct, 1)}% opóźnień
            </span>
            <span className="font-mono tabular-nums text-[11px] text-sky-900 whitespace-nowrap">
              Opady: {report.selectedMonth.precipitationMm} mm
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="whitespace-nowrap">Sugerowany margines kosztorysu</span>
            <span className="font-mono tabular-nums text-[11px] font-medium text-slate-700 whitespace-nowrap">
              +{formatNumber(report.selectedMonth.suggestedScheduleBufferDays, 1)} dni/mies.
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-lg font-semibold text-amber-800">
              +{formatNumber(report.selectedMonth.suggestedCostBufferPct, 1)}%
            </span>
            <span className="font-mono tabular-nums text-xs font-semibold text-slate-800 whitespace-nowrap">
              {report.bufferBasePln > 0
                ? `${formatPLN(report.selectedMonthBufferPln)} rezerwy`
                : 'Brak pozycji ziemnych'}
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="whitespace-nowrap">Okno optymalne vs szczyt</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
              Śr. roczna: {formatNumber(report.avgDelayRiskPct, 1)}%
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-sm font-semibold text-emerald-700 whitespace-nowrap">
              Min: {report.optimalMonth.monthShort} (+{formatNumber(report.optimalMonth.suggestedCostBufferPct, 1)}%)
            </span>
            <span className="font-mono tabular-nums text-sm font-semibold text-red-700 whitespace-nowrap">
              Szczyt: {report.peakRiskMonth.monthShort} (+{formatNumber(report.peakRiskMonth.suggestedCostBufferPct, 1)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Recharts ComposedChart */}
      <div className="space-y-2">
        <div className="h-[315px] w-full min-w-0">
          <ResponsiveContainer width="100%" height={315}>
            <ComposedChart
              data={report.months}
              margin={{ top: 14, right: 20, left: 6, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e2e8f0"
                vertical={false}
              />
              <XAxis
                dataKey="monthShort"
                interval={0}
                tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />

              {chartMode === 'risk_precip' ? (
                <>
                  <YAxis
                    yAxisId="precip"
                    domain={[0, 'auto']}
                    tickFormatter={(v: number) => `${v} mm`}
                    tick={{ fill: '#0369a1', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <YAxis
                    yAxisId="risk"
                    orientation="right"
                    domain={[0, 85]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fill: '#92400e', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <ReferenceLine
                    yAxisId="risk"
                    y={36}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                    strokeOpacity={0.65}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    content={
                      <SeasonalityTooltip bufferBasePln={report.bufferBasePln} />
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar
                    yAxisId="precip"
                    dataKey="precipitationMm"
                    name="Średnie opady w regionie (mm)"
                    fill="#0284c7"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  >
                    {report.months.map((entry) => (
                      <Cell
                        key={`precip-${entry.monthIndex}`}
                        fill={
                          entry.monthIndex === report.plannedMonthIndex
                            ? '#0284c7'
                            : '#bae6fd'
                        }
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="risk"
                    type="monotone"
                    dataKey="delayRiskPct"
                    name="Ryzyko opóźnień robót ziemnych (%)"
                    stroke="#b45309"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#b45309' }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </>
              ) : (
                <>
                  <YAxis
                    yAxisId="margin"
                    domain={[0, 22]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fill: '#92400e', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <YAxis
                    yAxisId="days"
                    orientation="right"
                    domain={[0, 14]}
                    tickFormatter={(v: number) => `${v} d`}
                    tick={{ fill: '#334155', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <ReferenceLine
                    yAxisId="margin"
                    y={report.selectedMonth.suggestedCostBufferPct}
                    stroke="#d97706"
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    content={
                      <SeasonalityTooltip bufferBasePln={report.bufferBasePln} />
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar
                    yAxisId="margin"
                    dataKey="suggestedCostBufferPct"
                    name="Sugerowany margines kosztorysu (%)"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  >
                    {report.months.map((entry) => {
                      let fill = '#f59e0b';
                      if (entry.monthIndex === report.plannedMonthIndex) {
                        fill = '#b45309';
                      } else if (entry.riskLevel === 'niskie') {
                        fill = '#059669';
                      } else if (entry.riskLevel === 'krytyczne') {
                        fill = '#dc2626';
                      }
                      return <Cell key={`margin-${entry.monthIndex}`} fill={fill} />;
                    })}
                  </Bar>
                  <Line
                    yAxisId="days"
                    type="monotone"
                    dataKey="suggestedScheduleBufferDays"
                    name="Sugerowany bufor harmonogramu (dni / mies.)"
                    stroke="#1e293b"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#1e293b' }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            {report.regionalClimateNote} {report.soilAdvice}
          </span>
          {report.bufferBasePln > 0 && (
            <span className="font-mono tabular-nums text-slate-600 whitespace-nowrap">
              {report.isEarthworksSubsetBase
                ? 'Podstawa rezerwy (roboty ziemne + odwodnienie + podbudowy):'
                : 'Podstawa rezerwy (wartość netto kosztorysu):'}{' '}
              {formatPLN(report.bufferBasePln)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
