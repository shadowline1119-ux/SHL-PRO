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
import { FileText } from 'lucide-react';
import {
  LOWER_SILESIA_COUNTY_MARGINS,
  PRICE_SOURCES,
  SUBREGIONS,
  WORK_CATALOG,
} from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  CountyBenchmarkId,
  CountyMarginBenchmark,
  EstimateLineItem,
  EstimateSettings,
  EstimateSummary,
  GeneratedPdfOfferRecord,
  OfferCompetitivenessBar,
  OfferCompetitivenessMetricMode,
  OfferMarketSegment,
  OfferMetadata,
  PriceSourceId,
  PriceSourceMeta,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import { formatNumber, formatPLN } from '../utils/calculations';
import {
  buildOfferCompetitivenessReport,
  inferCountyFromLocationAndSubregion,
} from '../utils/offerCompetitiveness';

interface OfferCompetitivenessCountyChartProps {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  summary: EstimateSummary;
  offer?: OfferMetadata;
  lastGeneratedPdfOffer?: GeneratedPdfOfferRecord | null;
  counties?: CountyMarginBenchmark[];
  workCatalog?: CatalogWorkItem[];
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  onNavigateToOfferPdf?: () => void;
}

interface CompetitivenessTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: OfferCompetitivenessBar;
  }>;
  ourOfferNetTotal: number;
}

function CompetitivenessTooltip({
  active,
  payload,
  ourOfferNetTotal,
}: CompetitivenessTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const isOurOffer = row.kind === 'our_offer';
  const diffFromOfferPln = roundTooltip(-row.deltaVsOurOfferPln);
  const diffFromOfferPct =
    row.netPricePln > 0 && !isOurOffer
      ? Math.round(((ourOfferNetTotal - row.netPricePln) / row.netPricePln) * 1000) / 10
      : 0;
  const signPct = diffFromOfferPct > 0 ? '+' : '';
  const signPln = diffFromOfferPln > 0 ? '+' : '';

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs shadow-sm max-w-[300px] space-y-1.5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900 leading-snug">{row.fullLabel}</span>
        <span className="font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
          {formatPLN(row.netPricePln)}
        </span>
      </div>

      <div className="space-y-1 font-mono tabular-nums text-[11px]">
        <div className="flex justify-between gap-4 text-slate-700">
          <span>Relacja do średniej powiatu:</span>
          <span className="font-semibold text-slate-900">
            {formatNumber(row.indexVsCountyAvg, 1)}%
          </span>
        </div>

        {!isOurOffer && ourOfferNetTotal > 0 && (
          <div className="flex justify-between gap-4 text-slate-700">
            <span>Nasza oferta PDF vs ten próg:</span>
            <span
              className={
                diffFromOfferPln <= 0
                  ? 'text-emerald-700 font-semibold'
                  : 'text-amber-800 font-semibold'
              }
            >
              {signPct}
              {formatNumber(diffFromOfferPct, 1)}% ({signPln}
              {formatNumber(diffFromOfferPln, 0)} zł)
            </span>
          </div>
        )}
      </div>

      <p className="pt-1 border-t border-slate-100 text-[11px] text-slate-500 leading-snug">
        {row.description}
      </p>
    </div>
  );
}

function roundTooltip(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function OfferCompetitivenessCountyChart({
  items,
  settings,
  summary,
  offer,
  lastGeneratedPdfOffer = null,
  counties = LOWER_SILESIA_COUNTY_MARGINS,
  workCatalog = WORK_CATALOG,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
  onNavigateToOfferPdf,
}: OfferCompetitivenessCountyChartProps) {
  const inferredCountyId = useMemo(
    () =>
      inferCountyFromLocationAndSubregion(
        offer?.projectLocation ?? lastGeneratedPdfOffer?.projectLocation,
        settings.subregionId,
        counties
      ),
    [offer?.projectLocation, lastGeneratedPdfOffer?.projectLocation, settings.subregionId, counties]
  );

  const [selectedCountyId, setSelectedCountyId] =
    useState<CountyBenchmarkId>(inferredCountyId);
  const [hasManualCounty, setHasManualCounty] = useState(false);
  const [segment, setSegment] = useState<OfferMarketSegment>('all');
  const [metricMode, setMetricMode] =
    useState<OfferCompetitivenessMetricMode>('net_pln');
  const [offerSourceMode, setOfferSourceMode] = useState<'generated_pdf' | 'live_preview'>(
    lastGeneratedPdfOffer ? 'generated_pdf' : 'live_preview'
  );
  const [inspectedBarId, setInspectedBarId] = useState<string | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsCompactViewport(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!hasManualCounty) {
      setSelectedCountyId(inferredCountyId);
    }
  }, [inferredCountyId, hasManualCounty]);

  useEffect(() => {
    if (!lastGeneratedPdfOffer && offerSourceMode === 'generated_pdf') {
      setOfferSourceMode('live_preview');
    }
  }, [lastGeneratedPdfOffer, offerSourceMode]);

  const useGeneratedRecord =
    offerSourceMode === 'generated_pdf' && Boolean(lastGeneratedPdfOffer);

  const activeOfferNetTotal = useGeneratedRecord
    ? lastGeneratedPdfOffer!.netTotal
    : summary.netTotal;
  const activeOfferNumber = useGeneratedRecord
    ? lastGeneratedPdfOffer!.offerNumber
    : offer?.offerNumber || 'OF/2026';

  const report = useMemo(
    () =>
      buildOfferCompetitivenessReport({
        items,
        settings,
        offerNetTotal: activeOfferNetTotal,
        offerNumber: activeOfferNumber,
        offerSource: useGeneratedRecord ? 'generated_pdf' : 'live_preview',
        countyId: selectedCountyId,
        segment,
        metricMode,
        counties,
        workCatalog,
        priceSources,
        subregions,
      }),
    [
      items,
      settings,
      activeOfferNetTotal,
      activeOfferNumber,
      useGeneratedRecord,
      selectedCountyId,
      segment,
      metricMode,
      counties,
      workCatalog,
      priceSources,
      subregions,
    ]
  );

  const ourOfferColor =
    report.competitivenessStatus === 'bardzo_konkurencyjna' ||
    report.competitivenessStatus === 'optymalna_rynkowa'
      ? '#059669'
      : report.competitivenessStatus === 'powyzej_sredniej'
      ? '#d97706'
      : '#dc2626';

  const statusTextClass =
    report.competitivenessStatus === 'bardzo_konkurencyjna' ||
    report.competitivenessStatus === 'optymalna_rynkowa'
      ? 'text-emerald-700'
      : report.competitivenessStatus === 'powyzej_sredniej'
      ? 'text-amber-800'
      : 'text-red-700';

  const deltaSign = report.deltaVsCountyAvgPln > 0 ? '+' : '';
  const hasGeneratedDiff =
    Boolean(lastGeneratedPdfOffer) &&
    Math.abs((lastGeneratedPdfOffer?.netTotal ?? 0) - summary.netTotal) > 0.5;

  const inspectedBar =
    report.bars.find((b) => b.id === inspectedBarId) ?? null;

  return (
    <section
      aria-label="Konkurencyjność ceny netto oferty PDF na tle powiatu"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      {/* Header + Primary Mode Controls */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex-1 min-w-0 sm:min-w-[280px]">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Konkurencyjność ceny netto oferty PDF na tle powiatu
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Porównanie końcowej ceny netto oferty{' '}
            <span className="font-mono font-medium text-slate-800">
              {report.offerNumber}
            </span>{' '}
            z cenami rynkowymi analogicznych inwestycji w powiecie{' '}
            <span className="font-medium text-slate-800">{report.countyName}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div
            role="group"
            aria-label="Jednostka wykresu konkurencyjności"
            className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setMetricMode('net_pln')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                metricMode === 'net_pln'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cena netto (PLN)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('index_100')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                metricMode === 'index_100'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Indeks (100% = średnia)
            </button>
          </div>

          {onNavigateToOfferPdf && (
            <button
              type="button"
              onClick={onNavigateToOfferPdf}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Oferta PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">
            {useGeneratedRecord
              ? 'Wygenerowana oferta PDF (netto)'
              : 'Cena końcowa oferty PDF (netto)'}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="font-mono tabular-nums text-lg font-semibold text-slate-900">
              {formatPLN(report.offerNetTotal)}
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
              {report.offerNumber}
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">
            Średnia rynkowa ({report.countyShortName})
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="font-mono tabular-nums text-lg font-semibold text-sky-900">
              {formatPLN(report.countyAverageNetPln)}
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
              Mediana BZP: {formatNumber(report.countyMedianTenderNetPln / 1000, 1)} tys.
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70">
          <div className="text-xs text-slate-500">Pozycja konkurencyjna oferty</div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className={`font-mono tabular-nums text-lg font-semibold ${statusTextClass}`}>
              {deltaSign}
              {formatNumber(report.deltaVsCountyAvgPct, 1)}%
            </span>
            <span className={`text-xs font-semibold ${statusTextClass}`}>
              {report.competitivenessLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & County Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto min-w-0">
          <label
            htmlFor="offer-comp-county-select"
            className="text-xs font-medium text-slate-700 whitespace-nowrap"
          >
            Powiat porównawczy:
          </label>
          <select
            id="offer-comp-county-select"
            value={selectedCountyId}
            onChange={(e) => {
              setSelectedCountyId(e.target.value as CountyBenchmarkId);
              setHasManualCounty(true);
            }}
            className="w-full sm:w-auto max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
          >
            {counties.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({subregions[c.subregionId]?.name ?? c.subregionId})
              </option>
            ))}
          </select>
          {hasManualCounty && selectedCountyId !== inferredCountyId && (
            <button
              type="button"
              onClick={() => {
                setHasManualCounty(false);
                setSelectedCountyId(inferredCountyId);
              }}
              className="text-xs font-medium text-amber-800 hover:text-amber-900 underline whitespace-nowrap"
            >
              Dopasuj automatycznie
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Segment analogicznych inwestycji w powiecie"
            className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setSegment('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                segment === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Wszystkie analogiczne
            </button>
            <button
              type="button"
              onClick={() => setSegment('public_tender')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                segment === 'public_tender'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Przetargi (BZP/BIP)
            </button>
            <button
              type="button"
              onClick={() => setSegment('commercial')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                segment === 'commercial'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Komercyjne
            </button>
          </div>

          {hasGeneratedDiff && (
            <div
              role="group"
              aria-label="Źródło ceny oferty PDF"
              className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
            >
              <button
                type="button"
                onClick={() => setOfferSourceMode('generated_pdf')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  offerSourceMode === 'generated_pdf'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Zapisany PDF
              </button>
              <button
                type="button"
                onClick={() => setOfferSourceMode('live_preview')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  offerSourceMode === 'live_preview'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bieżąca wycena
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Recharts BarChart */}
      {report.offerNetTotal <= 0 ? (
        <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
          Dodaj pozycje do kosztorysu i przygotuj ofertę PDF, aby zestawić cenę końcową netto ze średnimi cenami analogicznych inwestycji w powiecie.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="h-[330px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={330}>
              <BarChart
                data={report.bars}
                margin={{
                  top: 18,
                  right: isCompactViewport ? 8 : 20,
                  left: isCompactViewport ? 0 : 10,
                  bottom: isCompactViewport ? 16 : 20,
                }}
                barCategoryGap="20%"
                onClick={(state) => {
                  const clickedLabel = state?.activeLabel;
                  if (clickedLabel) {
                    const matched = report.bars.find((b) => b.shortLabel === clickedLabel);
                    if (matched) {
                      setInspectedBarId((prev) => (prev === matched.id ? null : matched.id));
                    }
                  }
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="shortLabel"
                  interval={0}
                  angle={isCompactViewport ? -28 : 0}
                  textAnchor={isCompactViewport ? 'end' : 'middle'}
                  height={isCompactViewport ? 68 : 32}
                  tick={{ fill: '#334155', fontSize: isCompactViewport ? 10 : 11, fontWeight: 500 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val: number) =>
                    metricMode === 'index_100'
                      ? `${Math.round(val)}%`
                      : `${Math.round(val / 1000)} tys.`
                  }
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={metricMode === 'index_100' ? 48 : isCompactViewport ? 56 : 74}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={
                    <CompetitivenessTooltip ourOfferNetTotal={report.offerNetTotal} />
                  }
                />
                <ReferenceLine
                  y={
                    metricMode === 'index_100'
                      ? 100
                      : report.countyAverageNetPln
                  }
                  stroke="#0284c7"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <Bar
                  dataKey="selectedMetricValue"
                  name={
                    metricMode === 'index_100'
                      ? 'Relacja do średniej (%)'
                      : 'Cena netto (PLN)'
                  }
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  maxBarSize={58}
                >
                  {report.bars.map((entry) => {
                    let fill = '#334155';
                    if (entry.kind === 'our_offer') {
                      fill = ourOfferColor;
                    } else if (entry.id === 'county_avg') {
                      fill = '#0284c7';
                    } else if (entry.id === 'county_p25' || entry.id === 'county_tender_median') {
                      fill = '#475569';
                    }
                    const isSelected = inspectedBarId === entry.id;
                    return (
                      <Cell
                        key={entry.id}
                        fill={fill}
                        stroke={isSelected ? '#0f172a' : undefined}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {inspectedBar && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="text-slate-700">
                <span className="font-semibold text-slate-900">{inspectedBar.fullLabel}:</span>{' '}
                {inspectedBar.description}
              </div>
              <span className="font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                {formatPLN(inspectedBar.netPricePln)} ({formatNumber(inspectedBar.indexVsCountyAvg, 1)}% średniej)
              </span>
            </div>
          )}

          {/* Legend & Competitiveness Interpretation */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: ourOfferColor }}
                  />
                  Nasza oferta PDF ({formatPLN(report.offerNetTotal)})
                </span>
                <span className="inline-flex items-center gap-1.5 text-sky-900 font-medium">
                  <span className="w-3 h-3 rounded-sm bg-sky-600 inline-block" />
                  Średnia powiatu ({formatPLN(report.countyAverageNetPln)})
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-700 inline-block" />
                  Progi rynkowe (P25 · BZP · Sekocenbud · P75)
                </span>
              </div>
              <span className="font-mono tabular-nums text-slate-600">
                Typowa marża w powiecie: {report.typicalCountyMarginRange}
              </span>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-800">Wniosek cenowy:</span>{' '}
              {report.competitivenessAdvice}{' '}
              <span className="text-slate-500">
                ({report.countyMarketNote})
              </span>
              {lastGeneratedPdfOffer && (
                <span className="block mt-1 text-[11px] text-slate-500">
                  Ostatnio wygenerowany plik PDF: <span className="font-mono text-slate-700">{lastGeneratedPdfOffer.filename}</span> ({formatPLN(lastGeneratedPdfOffer.netTotal)} netto).
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
