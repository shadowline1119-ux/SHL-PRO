import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, ShieldAlert } from 'lucide-react';
import { SUBREGIONS, WORK_CATALOG } from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  EstimateLineItem,
  EstimateSettings,
  SiteUtilityDensity,
  SoilCategory,
  SoilRiskSeverity,
  StructureParams,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import {
  calculateEstimateSummary,
  formatNumber,
  formatPLN,
  generateItemsFromStructureParams,
} from '../utils/calculations';
import {
  analyzeSoilAndSiteRisk,
  inferSiteUtilityDensityFromLocation,
} from '../utils/soilRiskAnalyzer';

interface SoilRiskAnalyzerPanelProps {
  params: StructureParams;
  settings: EstimateSettings;
  projectLocation?: string;
  activeItems?: EstimateLineItem[];
  workCatalog?: CatalogWorkItem[];
  subregions?: Record<SubregionId, SubregionMeta>;
  onChangeSoilCategory: (cat: SoilCategory) => void;
  onApplySoilRiskPct: (nextRiskPct: number) => void;
  onGoToEstimate?: () => void;
}

const SITE_DENSITY_OPTIONS: { id: SiteUtilityDensity; label: string }[] = [
  { id: 'teren_zurbanizowany', label: 'Zabudowa miejska (gęste sieci)' },
  { id: 'strefa_przemyslowa', label: 'Strefa przemysłowa / LSSE' },
  { id: 'teren_otwarty', label: 'Teren otwarty / rolny' },
];

const SOIL_QUICK_OPTIONS: { id: SoilCategory; label: string }[] = [
  { id: 'I-II', label: 'Kat. I–II (piaski)' },
  { id: 'III', label: 'Kat. III (gliny, iły)' },
  { id: 'IV', label: 'Kat. IV (rumosz skalny)' },
];

function getSeverityTextClass(sev: SoilRiskSeverity): string {
  if (sev === 'krytyczne') return 'text-red-700';
  if (sev === 'wysokie') return 'text-amber-800';
  if (sev === 'umiarkowane') return 'text-sky-800';
  return 'text-emerald-700';
}

function getSeverityBarClass(sev: SoilRiskSeverity): string {
  if (sev === 'krytyczne') return 'bg-red-600';
  if (sev === 'wysokie') return 'bg-amber-600';
  if (sev === 'umiarkowane') return 'bg-sky-600';
  return 'bg-emerald-600';
}

export function SoilRiskAnalyzerPanel({
  params,
  settings,
  projectLocation,
  activeItems = [],
  workCatalog = WORK_CATALOG,
  subregions = SUBREGIONS,
  onChangeSoilCategory,
  onApplySoilRiskPct,
  onGoToEstimate,
}: SoilRiskAnalyzerPanelProps) {
  const [siteContext, setSiteContext] = useState<SiteUtilityDensity>(() =>
    inferSiteUtilityDensityFromLocation(projectLocation)
  );
  const [autoSyncRisk, setAutoSyncRisk] = useState<boolean>(false);

  const analysis = useMemo(
    () =>
      analyzeSoilAndSiteRisk({
        params,
        settings,
        siteContext,
        activeItems,
        workCatalog,
        subregions,
      }),
    [params, settings, siteContext, activeItems, workCatalog, subregions]
  );

  const activeRiskPct = Math.max(0, Number(settings.soilRiskPct) || 0);
  const isAppliedMatch =
    Math.abs(activeRiskPct - analysis.suggestedRiskPct) < 0.05;

  // Gdy włączono auto-synchronizację, zmiana kategorii gruntu lub parametrów wykopu
  // automatycznie aktualizuje współczynnik ryzyka w ustawieniach kosztorysu.
  useEffect(() => {
    if (!autoSyncRisk) return;
    if (Math.abs((Number(settings.soilRiskPct) || 0) - analysis.suggestedRiskPct) >= 0.05) {
      onApplySoilRiskPct(analysis.suggestedRiskPct);
    }
  }, [autoSyncRisk, analysis.suggestedRiskPct, settings.soilRiskPct, onApplySoilRiskPct]);

  const hasActiveItems = activeItems.length > 0;
  const shownBaseNet = hasActiveItems
    ? analysis.activeEstimateBaseNetPln
    : analysis.parametricEstimateBaseNetPln;
  const shownWithSuggestedNet = hasActiveItems
    ? analysis.activeEstimateSuggestedNetPln
    : analysis.parametricEstimateSuggestedNetPln;
  const shownDeltaPln = hasActiveItems
    ? analysis.activeEstimateDeltaPln
    : analysis.parametricEstimateDeltaPln;

  const currentActualNet = useMemo(() => {
    if (activeRiskPct <= 0) return shownBaseNet;
    const targetItems = hasActiveItems
      ? activeItems
      : generateItemsFromStructureParams(
          params,
          workCatalog,
          { ...settings, soilRiskPct: 0 },
          subregions
        );
    return calculateEstimateSummary(targetItems, {
      ...settings,
      soilRiskPct: activeRiskPct,
    }).netTotal;
  }, [
    activeRiskPct,
    shownBaseNet,
    hasActiveItems,
    activeItems,
    params,
    workCatalog,
    settings,
    subregions,
  ]);

  const currentActualDeltaPln = Math.round((currentActualNet - shownBaseNet) * 100) / 100;

  return (
    <section
      aria-label="Analiza kategorii gruntu i współczynnika ryzyka kolizji podziemnych"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Analiza kategorii gruntu i ryzyka kolizji z infrastrukturą podziemną
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automatyczna ocena warunków gruntowych PN-B-06050 ({analysis.soilTitle}) oraz ryzyka
            kolizji z sieciami GESUT dla wykopu o głębokości{' '}
            <span className="font-mono font-medium text-slate-700">
              {formatNumber(params.excavationDepthM, 1)} m
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeRiskPct > 0 && (
            <button
              type="button"
              onClick={() => {
                setAutoSyncRisk(false);
                onApplySoilRiskPct(0);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Wyzeruj ryzyko (0%)</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onApplySoilRiskPct(analysis.suggestedRiskPct)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              isAppliedMatch
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-amber-700 text-white hover:bg-amber-800'
            }`}
          >
            {isAppliedMatch && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
            <span>
              {isAppliedMatch
                ? `Współczynnik +${formatNumber(analysis.suggestedRiskPct, 1)}% aktywny w wycenie`
                : `Zastosuj sugerowane ryzyko (+${formatNumber(analysis.suggestedRiskPct, 1)}%) do kosztorysu`}
            </span>
          </button>
        </div>
      </div>

      {/* Controls row: Soil category quick switcher + Utility density */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-500">
            Analizowana kategoria gruntu:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SOIL_QUICK_OPTIONS.map((opt) => {
              const isSelected = params.soilCategory === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeSoilCategory(opt.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-500">
            Uzbrojenie podziemne / otoczenie działki:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SITE_DENSITY_OPTIONS.map((opt) => {
              const isSelected = siteContext === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSiteContext(opt.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-amber-50 text-amber-900 border-amber-300 font-semibold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Auto-sync toggle + manual fine-tuning */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3">
        <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={autoSyncRisk}
            onChange={(e) => {
              const checked = e.target.checked;
              setAutoSyncRisk(checked);
              if (checked) {
                onApplySoilRiskPct(analysis.suggestedRiskPct);
              }
            }}
            className="w-4 h-4 rounded border-slate-300 text-amber-700 focus:ring-amber-600"
          />
          <span>
            Automatycznie przeliczaj wycenę kosztorysu po każdej zmianie kategorii gruntu
          </span>
        </label>

        <div className="flex items-center gap-2.5">
          <label
            htmlFor="soil-risk-manual-input"
            className="text-xs text-slate-600 whitespace-nowrap"
          >
            Aktywny narzut ryzyka w kosztorysie:
          </label>
          <div className="flex items-center gap-1">
            <input
              id="soil-risk-manual-input"
              type="number"
              min={0}
              max={35}
              step={0.5}
              value={activeRiskPct}
              onChange={(e) => {
                setAutoSyncRisk(false);
                onApplySoilRiskPct(
                  Math.min(35, Math.max(0, Number(e.target.value) || 0))
                );
              }}
              className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
            />
            <span className="text-xs font-mono text-slate-500">%</span>
          </div>
        </div>
      </div>

      {/* 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
          <div className="text-xs text-slate-500">Sugerowany współczynnik ryzyka</div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <span
              data-testid="soil-suggested-risk-pct"
              className={`font-mono tabular-nums text-xl font-semibold ${getSeverityTextClass(
                analysis.riskLevel
              )}`}
            >
              +{formatNumber(analysis.suggestedRiskPct, 1)}%
            </span>
            <span className="font-mono tabular-nums text-xs text-slate-600">
              mnożnik ×{formatNumber(analysis.suggestedMultiplier, 3)}
            </span>
          </div>
          <div className={`mt-1.5 text-[11px] font-medium ${getSeverityTextClass(analysis.riskLevel)}`}>
            Poziom ryzyka: {analysis.riskLevelLabel}
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
          <div className="text-xs text-slate-500">
            {hasActiveItems
              ? 'Wpływ sugerowanego ryzyka na kosztorys'
              : 'Wpływ na wycenę z parametrów'}
          </div>
          <div
            data-testid="soil-suggested-delta-pln"
            className="mt-1 font-mono tabular-nums text-xl font-semibold text-slate-900"
          >
            +{formatPLN(shownDeltaPln)}
          </div>
          <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500">
            {formatPLN(shownBaseNet)} → {formatPLN(shownWithSuggestedNet)} netto
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
          <div className="text-xs text-slate-500">Końcowa wartość netto (z aktywnym ryzykiem)</div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <span
              data-testid="soil-active-net-total"
              className="font-mono tabular-nums text-xl font-semibold text-slate-900"
            >
              {formatPLN(currentActualNet)}
            </span>
            <span className="font-mono tabular-nums text-xs font-semibold text-amber-800">
              {activeRiskPct > 0 ? `+${formatNumber(activeRiskPct, 1)}%` : '0%'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500 font-mono tabular-nums">
              {activeRiskPct > 0
                ? `Rezerwa w wycenie: +${formatPLN(currentActualDeltaPln)}`
                : 'Ryzyko nie jest jeszcze doliczone do wyceny'}
            </span>
            {onGoToEstimate && activeRiskPct > 0 && (
              <button
                type="button"
                onClick={onGoToEstimate}
                className="text-amber-800 font-medium hover:underline whitespace-nowrap"
              >
                Zobacz kosztorys
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4 Risk Drivers Breakdown + Mitigation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-3">
          <div className="text-xs font-semibold text-slate-800">
            Składowe sugerowanego współczynnika ryzyka ({analysis.soilCategory})
          </div>
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {analysis.drivers.map((driver) => {
              const barPct = Math.min(100, Math.max(8, (driver.contributionPct / 6.5) * 100));
              return (
                <div key={driver.id} className="p-3 space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-slate-900">
                      {driver.label}
                    </span>
                    <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
                      <span className={`font-semibold ${getSeverityTextClass(driver.severity)}`}>
                        +{formatNumber(driver.contributionPct, 1)}%
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ({driver.severityLabel})
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${barPct}%` }}
                      className={`h-full ${getSeverityBarClass(driver.severity)}`}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {driver.engineeringNote}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-3">
          <div className="text-xs font-semibold text-slate-800">
            Charakterystyka geotechniczna i zalecenia BHP / ZUDP
          </div>
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 space-y-3 text-xs">
            <p className="text-slate-700 leading-relaxed">{analysis.soilEngineeringSummary}</p>
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <div className="font-semibold text-slate-800">
                Zalecane działania zabezpieczające na budowie:
              </div>
              <ul className="space-y-1.5 text-[11px] text-slate-600 list-disc pl-4">
                {analysis.mitigationChecklist.map((item, idx) => (
                  <li key={idx} className="leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
