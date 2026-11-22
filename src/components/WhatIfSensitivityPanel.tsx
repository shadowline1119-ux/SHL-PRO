import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  EstimateLineItem,
  EstimateSettings,
  WhatIfSimulationParams,
} from '../types/estimator';
import { formatNumber, formatPLN } from '../utils/calculations';
import {
  calculateWhatIfSensitivity,
  createDefaultWhatIfParams,
  WHAT_IF_PRESETS,
} from '../utils/whatIfSensitivity';

interface WhatIfSensitivityPanelProps {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  onApplyMarkups?: (next: Pick<EstimateSettings, 'indirectCostsPct' | 'profitPct' | 'discountPct'>) => void;
  onNavigateToEstimate?: () => void;
}

interface WhatIfChartRow {
  label: string;
  baselinePln: number;
  simulatedPln: number;
  deltaPln: number;
  deltaPct: number;
}

interface WhatIfTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: WhatIfChartRow }>;
}

function WhatIfChartTooltip({ active, payload }: WhatIfTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const signPln = row.deltaPln > 0 ? '+' : '';
  const signPct = row.deltaPct > 0 ? '+' : '';

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-sm space-y-1 max-w-[260px]">
      <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1">
        {row.label}
      </div>
      <div className="space-y-0.5 font-mono tabular-nums text-[11px]">
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Bieżąca wycena:</span>
          <span className="font-semibold text-slate-800">{formatPLN(row.baselinePln)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Symulacja What-If:</span>
          <span className="font-semibold text-slate-900">{formatPLN(row.simulatedPln)}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-slate-100">
          <span className="text-slate-600">Zmiana:</span>
          <span
            className={
              row.deltaPln < 0
                ? 'font-semibold text-emerald-700'
                : row.deltaPln > 0
                ? 'font-semibold text-amber-800'
                : 'text-slate-500'
            }
          >
            {signPln}
            {formatPLN(row.deltaPln)} ({signPct}
            {formatNumber(row.deltaPct, 1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

export function WhatIfSensitivityPanel({
  items,
  settings,
  onApplyMarkups,
  onNavigateToEstimate,
}: WhatIfSensitivityPanelProps) {
  const [params, setParams] = useState<WhatIfSimulationParams>(() =>
    createDefaultWhatIfParams(settings)
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [breakdownTab, setBreakdownTab] = useState<'components' | 'categories'>('components');
  const [appliedMarkupsNotice, setAppliedMarkupsNotice] = useState(false);

  // Gdy użytkownik zmieni narzuty w głównym kosztorysie, zsynchronizuj bazę symulacji
  useEffect(() => {
    setParams((prev) => ({
      ...prev,
      indirectCostsPct: settings.indirectCostsPct,
      profitPct: settings.profitPct,
      discountPct: settings.discountPct,
    }));
  }, [settings.indirectCostsPct, settings.profitPct, settings.discountPct]);

  const report = useMemo(
    () => calculateWhatIfSensitivity(items, settings, params),
    [items, settings, params]
  );

  const chartData: WhatIfChartRow[] = useMemo(
    () =>
      report.componentDeltas
        .filter((d) => d.key !== 'discount')
        .map((d) => ({
          label: d.label.replace(' / BDO', ''),
          baselinePln: d.baselinePln,
          simulatedPln: d.simulatedPln,
          deltaPln: d.deltaPln,
          deltaPct: d.deltaPct,
        })),
    [report.componentDeltas]
  );

  const updateField = <K extends keyof WhatIfSimulationParams>(
    key: K,
    value: number
  ) => {
    setActivePresetId(null);
    setAppliedMarkupsNotice(false);
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = WHAT_IF_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setAppliedMarkupsNotice(false);
    setParams(preset.buildParams(settings));
  };

  const handleReset = () => {
    setActivePresetId(null);
    setAppliedMarkupsNotice(false);
    setParams(createDefaultWhatIfParams(settings));
  };

  const handleCommitMarkups = () => {
    if (!onApplyMarkups || !report.hasMarkupChange) return;
    onApplyMarkups({
      indirectCostsPct: params.indirectCostsPct,
      profitPct: params.profitPct,
      discountPct: params.discountPct,
    });
    setAppliedMarkupsNotice(true);
  };

  const signPct = report.deltaNetPct > 0 ? '+' : '';
  const signPln = report.deltaNetPln > 0 ? '+' : '';
  const signMargin = report.deltaMarginPp > 0 ? '+' : '';

  const deltaToneClass =
    report.deltaNetPln < 0
      ? 'text-emerald-700'
      : report.deltaNetPln > 0
      ? 'text-red-700'
      : 'text-slate-700';

  const deltaVerdictLabel =
    report.deltaNetPln < 0
      ? 'Niższa cena ofertowa (wyższa konkurencyjność)'
      : report.deltaNetPln > 0
      ? 'Wyższa wartość netto oferty'
      : 'Brak odchylenia od bieżącej wyceny';

  return (
    <section
      aria-label="Symulator wrażliwości parametrów i ceny netto oferty"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Symulator wrażliwości ceny netto oferty (What-If)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Szybka zmiana wydajności sprzętu, robocizny, cen materiałów oraz narzutów Kp/Zysk/Rabat z
            natychmiastowym przeliczeniem wpływu na końcową ofertę netto (bez nadpisywania pozycji
            kosztorysu).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onApplyMarkups && report.hasMarkupChange && (
            <button
              type="button"
              onClick={handleCommitMarkups}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              Zastosuj narzuty do kosztorysu
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            disabled={!report.hasAnyChange}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-45 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Resetuj parametry</span>
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center space-y-3 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
          <SlidersHorizontal className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-600">
            Dodaj co najmniej jedną pozycję robót do kosztorysu, aby symulować wpływ zmian
            wydajności sprzętu i narzutów na końcową cenę netto.
          </p>
          {onNavigateToEstimate && (
            <button
              type="button"
              onClick={onNavigateToEstimate}
              className="inline-flex items-center px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Przejdź do kosztorysu
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Quick Presets Bar */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-slate-500">
              Szybkie scenariusze wariantowe:
            </div>
            <div className="flex flex-wrap gap-2">
              {WHAT_IF_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.id)}
                    title={preset.description}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {appliedMarkupsNotice && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
            >
              Zaktualizowano narzuty kosztorysu (Kp {params.indirectCostsPct}%, Zysk{' '}
              {params.profitPct}%, Rabat {params.discountPct}%).
            </div>
          )}

          {/* 3 KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <div className="text-xs text-slate-500">Bieżąca wartość netto oferty</div>
              <div
                data-testid="whatif-baseline-net"
                className="mt-1 font-mono tabular-nums text-xl font-semibold text-slate-900"
              >
                {formatPLN(report.baselineNetTotal)}
              </div>
              <div className="mt-1.5 flex flex-wrap justify-between gap-x-2 text-[11px] font-mono tabular-nums text-slate-500">
                <span>Brutto: {formatPLN(report.baselineGrossTotal)}</span>
                <span>Marża: {formatNumber(report.baselineMarginPct, 1)}%</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <div className="text-xs text-slate-500">Symulowana wartość netto oferty</div>
              <div
                data-testid="whatif-simulated-net"
                className="mt-1 font-mono tabular-nums text-xl font-semibold text-slate-900"
              >
                {formatPLN(report.simulatedNetTotal)}
              </div>
              <div className="mt-1.5 flex flex-wrap justify-between gap-x-2 text-[11px] font-mono tabular-nums text-slate-500">
                <span>Brutto: {formatPLN(report.simulatedGrossTotal)}</span>
                <span>
                  Marża: {formatNumber(report.simulatedMarginPct, 1)}% (
                  {signMargin}
                  {formatNumber(report.deltaMarginPp, 1)} p.p.)
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <div className="text-xs text-slate-500">Wpływ na cenę netto (różnica %)</div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span
                  data-testid="whatif-delta-pct"
                  className={`font-mono tabular-nums text-xl font-semibold ${deltaToneClass}`}
                >
                  {signPct}
                  {formatNumber(report.deltaNetPct, 2)}%
                </span>
                <span
                  data-testid="whatif-delta-pln"
                  className={`font-mono tabular-nums text-xs font-semibold ${deltaToneClass}`}
                >
                  {signPln}
                  {formatPLN(report.deltaNetPln)}
                </span>
              </div>
              <div className={`mt-1.5 text-[11px] font-medium ${deltaToneClass}`}>
                {deltaVerdictLabel}
              </div>
            </div>
          </div>

          {/* Main Interactive 2-Column Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-1">
            {/* Left Column: Sliders & Numeric Inputs */}
            <div className="lg:col-span-6 space-y-4 border border-slate-200 rounded-lg p-4 bg-slate-50/40">
              <div className="text-xs font-semibold text-slate-800 pb-2 border-b border-slate-200">
                Parametry pracy i cen czynników (R / M / S)
              </div>

              {/* Equipment Efficiency */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="whatif-equip-eff"
                    className="text-xs font-medium text-slate-800"
                  >
                    Zmiana wydajności sprzętu (S)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[-10, 0, 10, 20].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => updateField('equipmentEfficiencyDeltaPct', step)}
                        className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded border transition-colors ${
                          params.equipmentEfficiencyDeltaPct === step
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {step > 0 ? `+${step}%` : `${step}%`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="whatif-equip-eff"
                    type="range"
                    min={-30}
                    max={50}
                    step={1}
                    value={params.equipmentEfficiencyDeltaPct}
                    onChange={(e) =>
                      updateField('equipmentEfficiencyDeltaPct', Number(e.target.value))
                    }
                    className="flex-1 accent-amber-700 cursor-pointer"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      aria-label="Wydajność sprzętu w procentach"
                      min={-35}
                      max={60}
                      step={1}
                      value={params.equipmentEfficiencyDeltaPct}
                      onChange={(e) =>
                        updateField(
                          'equipmentEfficiencyDeltaPct',
                          Number(e.target.value) || 0
                        )
                      }
                      className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                    <span className="text-xs font-mono text-slate-500">%</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                  Mnożnik kosztu sprzętu: ×{formatNumber(report.equipmentCostMultiplier, 3)}{' '}
                  ({report.equipmentCostMultiplier <= 1 ? '' : '+'}
                  {formatNumber((report.equipmentCostMultiplier - 1) * 100, 1)}% stawki S)
                </div>
              </div>

              {/* Labor Efficiency */}
              <div className="space-y-1.5 pt-3 border-t border-slate-200/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="whatif-labor-eff"
                    className="text-xs font-medium text-slate-800"
                  >
                    Zmiana wydajności robocizny (R)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[-10, 0, 10].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => updateField('laborEfficiencyDeltaPct', step)}
                        className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded border transition-colors ${
                          params.laborEfficiencyDeltaPct === step
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {step > 0 ? `+${step}%` : `${step}%`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="whatif-labor-eff"
                    type="range"
                    min={-30}
                    max={50}
                    step={1}
                    value={params.laborEfficiencyDeltaPct}
                    onChange={(e) =>
                      updateField('laborEfficiencyDeltaPct', Number(e.target.value))
                    }
                    className="flex-1 accent-slate-800 cursor-pointer"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      aria-label="Wydajność robocizny w procentach"
                      min={-35}
                      max={60}
                      step={1}
                      value={params.laborEfficiencyDeltaPct}
                      onChange={(e) =>
                        updateField('laborEfficiencyDeltaPct', Number(e.target.value) || 0)
                      }
                      className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                    <span className="text-xs font-mono text-slate-500">%</span>
                  </div>
                </div>
              </div>

              {/* Materials & BDO Price */}
              <div className="space-y-1.5 pt-3 border-t border-slate-200/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="whatif-materials-price"
                    className="text-xs font-medium text-slate-800"
                  >
                    Zmiana cen materiałów i opłat BDO (M)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[-10, 0, 10].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => updateField('materialsPriceDeltaPct', step)}
                        className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded border transition-colors ${
                          params.materialsPriceDeltaPct === step
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {step > 0 ? `+${step}%` : `${step}%`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="whatif-materials-price"
                    type="range"
                    min={-35}
                    max={50}
                    step={1}
                    value={params.materialsPriceDeltaPct}
                    onChange={(e) =>
                      updateField('materialsPriceDeltaPct', Number(e.target.value))
                    }
                    className="flex-1 accent-amber-700 cursor-pointer"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      aria-label="Zmiana cen materiałów w procentach"
                      min={-40}
                      max={60}
                      step={1}
                      value={params.materialsPriceDeltaPct}
                      onChange={(e) =>
                        updateField('materialsPriceDeltaPct', Number(e.target.value) || 0)
                      }
                      className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                    <span className="text-xs font-mono text-slate-500">%</span>
                  </div>
                </div>
              </div>

              {/* Markups Kp / Zysk / Rabat */}
              <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
                <div className="text-xs font-semibold text-slate-800">
                  Docelowe narzuty i rabat oferty
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="whatif-kp"
                      className="block text-[11px] text-slate-600 mb-1"
                    >
                      Kp (%) · baza {settings.indirectCostsPct}%
                    </label>
                    <input
                      id="whatif-kp"
                      type="number"
                      min={0}
                      max={40}
                      step={0.5}
                      value={params.indirectCostsPct}
                      onChange={(e) =>
                        updateField(
                          'indirectCostsPct',
                          Math.max(0, Number(e.target.value) || 0)
                        )
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="whatif-profit"
                      className="block text-[11px] text-slate-600 mb-1"
                    >
                      Zysk (%) · baza {settings.profitPct}%
                    </label>
                    <input
                      id="whatif-profit"
                      type="number"
                      min={0}
                      max={40}
                      step={0.5}
                      value={params.profitPct}
                      onChange={(e) =>
                        updateField('profitPct', Math.max(0, Number(e.target.value) || 0))
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="whatif-discount"
                      className="block text-[11px] text-slate-600 mb-1"
                    >
                      Rabat (%) · baza {settings.discountPct}%
                    </label>
                    <input
                      id="whatif-discount"
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={params.discountPct}
                      onChange={(e) =>
                        updateField('discountPct', Math.max(0, Number(e.target.value) || 0))
                      }
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Recharts Comparison + Breakdown Table */}
            <div className="lg:col-span-6 space-y-4">
              <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    Struktura kosztu: bieżąca wycena vs symulacja
                  </span>
                  <div className="flex items-center gap-4 text-[11px] text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />
                      Bieżąca
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-600 inline-block" />
                      Symulacja
                    </span>
                  </div>
                </div>

                <div className="h-[205px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                      barGap={4}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(val: number) =>
                          val >= 1000
                            ? `${Math.round(val / 1000)} tys.`
                            : `${Math.round(val)}`
                        }
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={54}
                      />
                      <Tooltip
                        content={<WhatIfChartTooltip />}
                        cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                      />
                      <Bar
                        dataKey="baselinePln"
                        name="Bieżąca"
                        fill="#94a3b8"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="simulatedPln"
                        name="Symulacja"
                        fill="#d97706"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Breakdown Toggle + Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <span className="text-xs font-semibold text-slate-700">
                    Szczegółowy wpływ na cenę
                  </span>
                  <div className="inline-flex p-0.5 bg-slate-200/70 rounded-md">
                    <button
                      type="button"
                      onClick={() => setBreakdownTab('components')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                        breakdownTab === 'components'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Składniki R/M/S
                    </button>
                    <button
                      type="button"
                      onClick={() => setBreakdownTab('categories')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                        breakdownTab === 'categories'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Kategorie robót
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/60 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                        <th className="py-2 px-3">
                          {breakdownTab === 'components' ? 'Składnik' : 'Kategoria robót'}
                        </th>
                        <th className="py-2 px-3 text-right">Bieżąca</th>
                        <th className="py-2 px-3 text-right">Symulacja</th>
                        <th className="py-2 px-3 text-right">Różnica</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                      {breakdownTab === 'components'
                        ? report.componentDeltas.map((row) => {
                            const sPln = row.deltaPln > 0 ? '+' : '';
                            const sPct = row.deltaPct > 0 ? '+' : '';
                            const rowColor =
                              row.key === 'discount'
                                ? 'text-slate-600'
                                : row.deltaPln < 0
                                ? 'text-emerald-700'
                                : row.deltaPln > 0
                                ? 'text-red-700'
                                : 'text-slate-500';
                            return (
                              <tr key={row.key} className="hover:bg-slate-50/70">
                                <td className="py-2 px-3 font-sans font-medium text-slate-800">
                                  {row.label}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-600">
                                  {formatPLN(row.baselinePln)}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-slate-900">
                                  {formatPLN(row.simulatedPln)}
                                </td>
                                <td className={`py-2 px-3 text-right font-semibold ${rowColor}`}>
                                  {sPln}
                                  {formatNumber(row.deltaPln, 0)} zł ({sPct}
                                  {formatNumber(row.deltaPct, 1)}%)
                                </td>
                              </tr>
                            );
                          })
                        : report.categoryImpacts.map((cat) => {
                            const sPln = cat.deltaNetPln > 0 ? '+' : '';
                            const sPct = cat.deltaNetPct > 0 ? '+' : '';
                            const rowColor =
                              cat.deltaNetPln < 0
                                ? 'text-emerald-700'
                                : cat.deltaNetPln > 0
                                ? 'text-red-700'
                                : 'text-slate-500';
                            return (
                              <tr key={cat.category} className="hover:bg-slate-50/70">
                                <td className="py-2 px-3 font-sans font-medium text-slate-800">
                                  {cat.label}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-600">
                                  {formatPLN(cat.baselineNetPln)}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-slate-900">
                                  {formatPLN(cat.simulatedNetPln)}
                                </td>
                                <td className={`py-2 px-3 text-right font-semibold ${rowColor}`}>
                                  {sPln}
                                  {formatNumber(cat.deltaNetPln, 0)} zł ({sPct}
                                  {formatNumber(cat.deltaNetPct, 1)}%)
                                </td>
                              </tr>
                            );
                          })}
                      <tr className="bg-slate-50 font-semibold border-t border-slate-300">
                        <td className="py-2.5 px-3 font-sans text-slate-900">
                          Wartość netto oferty
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700">
                          {formatPLN(report.baselineNetTotal)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-900">
                          {formatPLN(report.simulatedNetTotal)}
                        </td>
                        <td className={`py-2.5 px-3 text-right ${deltaToneClass}`}>
                          {signPln}
                          {formatNumber(report.deltaNetPln, 0)} zł ({signPct}
                          {formatNumber(report.deltaNetPct, 2)}%)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
