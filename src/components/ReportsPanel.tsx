import React, { useMemo, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { PRICE_SOURCES, SUBREGIONS, WORK_CATALOG } from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  EstimateLineItem,
  EstimateSettings,
  EstimateSummary,
  GeneratedPdfOfferRecord,
  OfferMetadata,
  PriceSourceId,
  PriceSourceMeta,
  SoilCategory,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import {
  compareSourcesForEstimate,
  formatNumber,
  formatPLN,
} from '../utils/calculations';
import { downloadPrzedmiarCsv, downloadPrzedmiarXlsx } from '../utils/downloadPrzedmiar';
import { CostStructurePieChart } from './CostStructurePieChart';
import { DieselEquipmentCorrelationChart } from './DieselEquipmentCorrelationChart';
import { EarthworksSeasonalityChart } from './EarthworksSeasonalityChart';
import { HistoricalRatesLineChart } from './HistoricalRatesLineChart';
import { ItemProfitabilityCountyChart } from './ItemProfitabilityCountyChart';
import { OfferCompetitivenessCountyChart } from './OfferCompetitivenessCountyChart';
import { ProfitMarginCountyChart } from './ProfitMarginCountyChart';
import { UnitPriceMarketChart } from './UnitPriceMarketChart';
import { WhatIfSensitivityPanel } from './WhatIfSensitivityPanel';

interface ReportsPanelProps {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  summary: EstimateSummary;
  projectName?: string;
  projectLocation?: string;
  offer?: OfferMetadata;
  lastGeneratedPdfOffer?: GeneratedPdfOfferRecord | null;
  defaultSoilCategory?: SoilCategory;
  workCatalog?: CatalogWorkItem[];
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  onSelectSource: (sourceId: PriceSourceId) => void;
  onApplyMarkups?: (next: Pick<EstimateSettings, 'indirectCostsPct' | 'profitPct' | 'discountPct'>) => void;
  onNavigateToOfferPdf?: () => void;
  onNavigateToEstimate?: () => void;
}

export function ReportsPanel({
  items,
  settings,
  summary,
  projectName,
  projectLocation,
  offer,
  lastGeneratedPdfOffer = null,
  defaultSoilCategory = 'III',
  workCatalog = WORK_CATALOG,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
  onSelectSource,
  onApplyMarkups,
  onNavigateToOfferPdf,
  onNavigateToEstimate,
}: ReportsPanelProps) {
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const sourceComparison = useMemo(
    () =>
      compareSourcesForEstimate(
        items,
        workCatalog,
        settings,
        priceSources,
        subregions
      ),
    [items, workCatalog, settings, priceSources, subregions]
  );

  const maxCategoryDirect = useMemo(() => {
    const maxVal = summary.byCategory.reduce(
      (acc, c) => Math.max(acc, c.laborTotal + c.materialsTotal + c.equipmentTotal),
      0
    );
    return maxVal > 0 ? maxVal : 1;
  }, [summary.byCategory]);

  const maxSourceNet = useMemo(() => {
    const maxVal = sourceComparison.reduce((acc, s) => Math.max(acc, s.netTotal), 0);
    return maxVal > 0 ? maxVal : 1;
  }, [sourceComparison]);

  const handleExportCsv = () => {
    setExportError(null);
    downloadPrzedmiarCsv({
      items,
      settings,
      projectName,
      location: projectLocation,
      delimiterMode: 'semicolon',
    });
  };

  const handleExportXlsx = async () => {
    setExportError(null);
    setIsExportingXlsx(true);
    try {
      await downloadPrzedmiarXlsx({
        items,
        settings,
        projectName,
        location: projectLocation,
      });
    } catch (err: unknown) {
      setExportError(
        err instanceof Error ? err.message : 'Nie udało się wygenerować arkusza Excel / Numbers.'
      );
    } finally {
      setIsExportingXlsx(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Report 1: Labor vs Materials vs Equipment */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Porównanie kosztów robocizny, materiałów i sprzętu (R / M / S)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Rozbicie kosztów bezpośrednich według kategorii robót dla bazy{' '}
              <span className="font-medium text-slate-800">
                {priceSources[settings.sourceId].name}
              </span>{' '}
              ({subregions[settings.subregionId].name}).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleExportXlsx}
              disabled={items.length === 0 || isExportingXlsx}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isExportingXlsx ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Przedmiar Excel / Numbers (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={items.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Eksportuj zestawienie CSV</span>
            </button>
          </div>
        </div>

        {exportError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{exportError}</span>
          </div>
        )}

        {/* Summary Ratio Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Robocizna (R)</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {summary.laborSharePct}%
              </span>
            </div>
            <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-slate-900">
              {formatPLN(summary.laborTotal)}
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div
                style={{ width: `${summary.laborSharePct}%` }}
                className="h-full bg-slate-800"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Materiały i opłaty BDO (M)</span>
              <span className="font-mono tabular-nums font-semibold text-amber-800">
                {summary.materialsSharePct}%
              </span>
            </div>
            <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-amber-800">
              {formatPLN(summary.materialsTotal)}
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div
                style={{ width: `${summary.materialsSharePct}%` }}
                className="h-full bg-amber-600"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Sprzęt i transport (S)</span>
              <span className="font-mono tabular-nums font-semibold text-sky-800">
                {summary.equipmentSharePct}%
              </span>
            </div>
            <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-sky-900">
              {formatPLN(summary.equipmentTotal)}
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div
                style={{ width: `${summary.equipmentSharePct}%` }}
                className="h-full bg-sky-600"
              />
            </div>
          </div>
        </div>

        {/* Recharts Pie Chart: R / M / S Structure */}
        <CostStructurePieChart summary={summary} />

        {/* Category Stacked Bars + Table */}
        {summary.byCategory.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Dodaj pozycje do kosztorysu, aby wygenerować analizę kosztów materiałów i robocizny.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-3" aria-label="Wykres porównawczy R/M/S według kategorii">
              <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-slate-800 inline-block" />
                  Robocizna (R)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-amber-600 inline-block" />
                  Materiały i utylizacja (M)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-sky-600 inline-block" />
                  Sprzęt i transport (S)
                </span>
              </div>

              {summary.byCategory.map((cat) => {
                const catDirect = cat.laborTotal + cat.materialsTotal + cat.equipmentTotal;
                const widthPct = (catDirect / maxCategoryDirect) * 100;
                const lPct = catDirect > 0 ? (cat.laborTotal / catDirect) * 100 : 0;
                const mPct = catDirect > 0 ? (cat.materialsTotal / catDirect) * 100 : 0;
                const sPct = catDirect > 0 ? (cat.equipmentTotal / catDirect) * 100 : 0;
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-800">
                        {cat.label} ({cat.itemCount} poz.)
                      </span>
                      <span className="font-mono tabular-nums text-slate-700">
                        {formatPLN(catDirect)} bezp. · {formatPLN(cat.netTotal)} netto
                      </span>
                    </div>
                    <div className="h-5 w-full bg-slate-100 rounded overflow-hidden">
                      <div
                        style={{ width: `${Math.max(2, widthPct)}%` }}
                        className="h-full flex"
                      >
                        <div style={{ width: `${lPct}%` }} className="bg-slate-800 h-full" />
                        <div style={{ width: `${mPct}%` }} className="bg-amber-600 h-full" />
                        <div style={{ width: `${sPct}%` }} className="bg-sky-600 h-full" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <th className="py-2.5 px-3">Kategoria robót</th>
                    <th className="py-2.5 px-3 text-right">Pozycji</th>
                    <th className="py-2.5 px-3 text-right">Robocizna (R)</th>
                    <th className="py-2.5 px-3 text-right">Materiały (M)</th>
                    <th className="py-2.5 px-3 text-right">Sprzęt (S)</th>
                    <th className="py-2.5 px-3 text-right">Razem netto (z narzutami)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {summary.byCategory.map((cat) => (
                    <tr key={cat.category} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-900">{cat.label}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {cat.itemCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                        {formatPLN(cat.laborTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-800">
                        {formatPLN(cat.materialsTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-900">
                        {formatPLN(cat.equipmentTotal)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatPLN(cat.netTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Report 1B: PDF Offer Final Net Price vs Analogous Investments in Same County */}
      <OfferCompetitivenessCountyChart
        items={items}
        settings={settings}
        summary={summary}
        offer={offer}
        lastGeneratedPdfOffer={lastGeneratedPdfOffer}
        workCatalog={workCatalog}
        priceSources={priceSources}
        subregions={subregions}
        onNavigateToOfferPdf={onNavigateToOfferPdf}
      />

      {/* Report 1C: Quick Parameter Sensitivity (What-If) Simulator */}
      <WhatIfSensitivityPanel
        items={items}
        settings={settings}
        onApplyMarkups={onApplyMarkups}
        onNavigateToEstimate={onNavigateToEstimate}
      />

      {/* Report 2: Projected Profit Margin vs Lower Silesian Counties */}
      <ProfitMarginCountyChart
        summary={summary}
        settings={settings}
        projectName={projectName}
        subregions={subregions}
      />

      {/* Report 2B: Line-Item Profitability vs Selected Lower Silesian Counties */}
      <ItemProfitabilityCountyChart
        items={items}
        settings={settings}
        subregions={subregions}
      />

      {/* Report 3: 12-Month Regional Labor & Equipment Rate History */}
      <HistoricalRatesLineChart
        settings={settings}
        summary={summary}
        priceSources={priceSources}
        subregions={subregions}
      />

      {/* Report 4: Earthworks Seasonality, Precipitation & Safety Margin */}
      <EarthworksSeasonalityChart
        settings={settings}
        summary={summary}
        defaultSoilCategory={defaultSoilCategory}
        subregions={subregions}
      />

      {/* Report 5: Diesel Fuel (Google Search) vs Machinery Cost Correlation */}
      <DieselEquipmentCorrelationChart
        settings={settings}
        summary={summary}
        priceSources={priceSources}
        subregions={subregions}
      />

      {/* Report 6: Multi-source Lower Silesia Benchmark Comparison */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Porównanie stawek rynkowych z wielu źródeł (woj. dolnośląskie)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Symulacja całkowitej wartości aktualnego przedmiaru w 5 bazach cenowych dla subregionu{' '}
            <span className="font-medium text-slate-800">
              {subregions[settings.subregionId].name}
            </span>
            . Pozycje własne (custom) zachowują stawki wpisane ręcznie.
          </p>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <th className="py-2.5 px-3 min-w-[235px]">Źródło cenowe</th>
                <th className="py-2.5 px-3 text-right">Robocizna</th>
                <th className="py-2.5 px-3 text-right">Materiały / BDO</th>
                <th className="py-2.5 px-3 text-right">Sprzęt</th>
                <th className="py-2.5 px-3 text-right">Wartość netto</th>
                <th className="py-2.5 px-3 text-right">Odchylenie</th>
                <th className="py-2.5 px-3 w-36">Relacja kosztu</th>
                <th className="py-2.5 px-3 text-right">Wybór bazy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sourceComparison.map((row) => {
                const isActive = row.sourceId === settings.sourceId;
                const barWidth = (row.netTotal / maxSourceNet) * 100;
                return (
                  <tr
                    key={row.sourceId}
                    className={isActive ? 'bg-amber-50/50' : 'hover:bg-slate-50'}
                  >
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-900">{row.sourceName}</div>
                      <div className="text-[11px] text-slate-500 whitespace-nowrap">
                        {priceSources[row.sourceId].quarter} · R: {formatNumber(priceSources[row.sourceId].hourlyLaborAvg, 2)} zł/r-g
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatPLN(row.laborTotal)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatPLN(row.materialsTotal)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatPLN(row.equipmentTotal)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatPLN(row.netTotal)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums font-medium ${
                        row.deltaFromActivePln > 0
                          ? 'text-red-700'
                          : row.deltaFromActivePln < 0
                          ? 'text-emerald-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {isActive
                        ? 'Baza aktywna'
                        : `${row.deltaFromActivePln > 0 ? '+' : ''}${row.deltaFromActivePct}%`}
                    </td>
                    <td className="py-3 px-3">
                      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.max(4, barWidth)}%` }}
                          className={`h-full ${isActive ? 'bg-amber-600' : 'bg-slate-700'}`}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isActive ? (
                        <span className="text-xs font-semibold text-amber-800 whitespace-nowrap">
                          Aktywna
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectSource(row.sourceId)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors whitespace-nowrap"
                        >
                          Zastosuj bazę
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <UnitPriceMarketChart
          items={items}
          settings={settings}
          workCatalog={workCatalog}
          priceSources={priceSources}
          subregions={subregions}
          onSelectSource={onSelectSource}
        />
      </section>

      {/* Report 3: BDO Waste Ledger */}
      {summary.bdoSummary.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Zestawienie odpadów i urobku do ewidencji BDO
          </h2>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-3 w-32">Kod odpadu BDO</th>
                  <th className="py-2.5 px-3">Powiązane pozycje w kosztorysie</th>
                  <th className="py-2.5 px-3 text-right w-32">Łączna ilość</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {summary.bdoSummary.map((bdo) => (
                  <tr key={`${bdo.code}-${bdo.unit}`}>
                    <td className="py-2.5 px-3 font-mono font-semibold text-amber-800">
                      {bdo.code}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{bdo.items.join(' · ')}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatNumber(bdo.quantity, 2)} {bdo.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
