import React, { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EstimateSummary } from '../types/estimator';
import {
  buildCostStructurePieData,
  CostStructureSlice,
  formatNumber,
  formatPLN,
} from '../utils/calculations';

interface CostStructurePieChartProps {
  summary: EstimateSummary;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: CostStructureSlice;
  }>;
}

function CostTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0]?.payload;
  if (!slice) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-sm">
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <span
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: slice.color }}
        />
        <span>{slice.name}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4 font-mono tabular-nums text-slate-700">
        <span>{formatPLN(slice.value)}</span>
        <span className="font-semibold text-slate-900">
          {formatNumber(slice.sharePct, 1)}%
        </span>
      </div>
    </div>
  );
}

interface SliceLabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}

function renderSlicePercentLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
}: SliceLabelProps) {
  if (percent < 0.06) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
  const rad = (-midAngle * Math.PI) / 180;
  const x = cx + radius * Math.cos(rad);
  const y = cy + radius * Math.sin(rad);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
      style={{ pointerEvents: 'none', fontFamily: 'JetBrains Mono, monospace' }}
    >
      {Math.round(percent * 100)}%
    </text>
  );
}

export function CostStructurePieChart({ summary }: CostStructurePieChartProps) {
  const [hoveredKey, setHoveredKey] = useState<CostStructureSlice['key'] | null>(null);

  const slices = useMemo(() => buildCostStructurePieData(summary), [summary]);
  const activeSlices = useMemo(
    () => slices.filter((slice) => slice.value > 0),
    [slices]
  );

  return (
    <div
      aria-label="Wykres kołowy struktury kosztów projektu (R / M / S)"
      className="pt-5 border-t border-slate-200 space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Struktura kosztów bezpośrednich projektu (wykres kołowy R / M / S)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Procentowy i kwotowy udział robocizny, materiałów oraz sprzętu w aktualnym kosztorysie.
          </p>
        </div>
        <div className="text-xs text-slate-600 font-mono tabular-nums">
          Razem R+M+S:{' '}
          <span className="font-semibold text-slate-900">
            {formatPLN(summary.directTotal)}
          </span>
        </div>
      </div>

      {activeSlices.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-slate-200/80">
          Brak wartości kosztów R / M / S w aktywnym kosztorysie. Dodaj pozycje lub uzupełnij ilości, aby wyświetlić wykres kołowy.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-5 h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={activeSlices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={104}
                  paddingAngle={activeSlices.length > 1 ? 1.5 : 0}
                  stroke="#ffffff"
                  strokeWidth={2}
                  labelLine={false}
                  label={renderSlicePercentLabel}
                  isAnimationActive={false}
                  onMouseEnter={(_, idx) => {
                    const item = activeSlices[idx];
                    if (item) setHoveredKey(item.key);
                  }}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  {activeSlices.map((slice) => {
                    const dimmed = hoveredKey !== null && hoveredKey !== slice.key;
                    return (
                      <Cell
                        key={slice.key}
                        fill={slice.color}
                        fillOpacity={dimmed ? 0.45 : 1}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<CostTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:col-span-7 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Składnik kosztów</th>
                  <th className="py-2.5 px-3 text-right">Udział</th>
                  <th className="py-2.5 px-3 text-right">Wartość netto bezp.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {slices.map((slice) => {
                  const isHighlighted = hoveredKey === slice.key;
                  return (
                    <tr
                      key={slice.key}
                      onMouseEnter={() => setHoveredKey(slice.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      className={`transition-colors ${
                        isHighlighted ? 'bg-slate-100/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5 font-medium text-slate-900">
                          <span
                            className="w-3 h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: slice.color }}
                          />
                          <span>{slice.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                        {formatNumber(slice.sharePct, 1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatPLN(slice.value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 text-slate-700">
                  <td className="py-2.5 px-3 font-medium">
                    Narzuty (Kp + Zysk po rabacie)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                    —
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-800">
                    {formatPLN(summary.netTotal - summary.directTotal)}
                  </td>
                </tr>
                <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-900">
                  <td className="py-2.5 px-3">Wartość kosztorysowa netto razem</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    100,0%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {formatPLN(summary.netTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
