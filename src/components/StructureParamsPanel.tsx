import React, { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Calculator, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { PRICE_SOURCES, SUBREGIONS, WORK_CATALOG } from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  EstimateLineItem,
  EstimateSettings,
  PriceSourceId,
  PriceSourceMeta,
  SoilCategory,
  StructureObjectType,
  StructureParams,
  SubregionId,
  SubregionMeta,
  WorkScopeMode,
} from '../types/estimator';
import {
  computeStructureVolumes,
  formatNumber,
  generateItemsFromStructureParams,
} from '../utils/calculations';
import { downloadPrzedmiarCsv, downloadPrzedmiarXlsx } from '../utils/downloadPrzedmiar';
import { SoilRiskAnalyzerPanel } from './SoilRiskAnalyzerPanel';

interface StructureParamsPanelProps {
  params: StructureParams;
  settings: EstimateSettings;
  projectLocation?: string;
  activeItems?: EstimateLineItem[];
  workCatalog?: CatalogWorkItem[];
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  onChangeParams: (next: StructureParams) => void;
  onApplySoilRiskPct?: (nextRiskPct: number) => void;
  onGenerateEstimate: (replaceExisting: boolean) => void;
  onGoToEstimate?: () => void;
}

const OBJECT_TYPE_LABELS: { id: StructureObjectType; label: string }[] = [
  { id: 'budynek_murowany', label: 'Budynek murowany (cegła / pustak)' },
  { id: 'obiekt_zelbetowy', label: 'Obiekt żelbetowy ciężki / przemysłowy' },
  { id: 'hala_stalowa', label: 'Hala stalowa / magazynowa' },
  { id: 'budowla_ziemna', label: 'Tylko roboty ziemne / wykop pod inwestycję' },
];

const SCOPE_LABELS: { id: WorkScopeMode; label: string }[] = [
  { id: 'kompleksowo', label: 'Kompleksowo (rozbiórka + wykopy)' },
  { id: 'tylko_rozbiorka', label: 'Tylko rozbiórka i wywóz gruzu' },
  { id: 'tylko_ziemne', label: 'Tylko roboty ziemne i niwelacja' },
];

export function StructureParamsPanel({
  params,
  settings,
  projectLocation,
  activeItems = [],
  workCatalog = WORK_CATALOG,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
  onChangeParams,
  onApplySoilRiskPct,
  onGenerateEstimate,
  onGoToEstimate,
}: StructureParamsPanelProps) {
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const volumes = useMemo(() => computeStructureVolumes(params), [params]);

  const handleExportParametricXlsx = async () => {
    setExportError(null);
    setIsExportingXlsx(true);
    try {
      const items = generateItemsFromStructureParams(
        params,
        workCatalog,
        settings,
        subregions
      );
      await downloadPrzedmiarXlsx({
        items,
        settings,
        projectName: params.projectName,
        location: projectLocation,
      });
    } catch (err: unknown) {
      setExportError(
        err instanceof Error ? err.message : 'Nie udało się wygenerować pliku Excel / Numbers.'
      );
    } finally {
      setIsExportingXlsx(false);
    }
  };

  const handleExportParametricCsv = () => {
    setExportError(null);
    const items = generateItemsFromStructureParams(
      params,
      workCatalog,
      settings,
      subregions
    );
    downloadPrzedmiarCsv({
      items,
      settings,
      projectName: params.projectName,
      location: projectLocation,
      delimiterMode: 'semicolon',
    });
  };

  const updateField = <K extends keyof StructureParams>(
    key: K,
    value: StructureParams[K]
  ) => {
    onChangeParams({ ...params, [key]: value });
  };

  const numInput = (
    id: string,
    label: string,
    value: number,
    unit: string,
    step: number,
    min: number,
    onChange: (val: number) => void
  ) => (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-11 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          {unit}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Parametry geometryczne budynku lub konstrukcji
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Wprowadź wymiary obiektu i warunki gruntowe. System obliczy kubaturę, objętość wykopów oraz tonaż odpadów BDO dla bazy{' '}
              <span className="font-medium text-slate-900">
                {priceSources[settings.sourceId].name}
              </span>{' '}
              ({subregions[settings.subregionId].name}).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
          <div className="lg:col-span-8 space-y-5">
            <div>
              <label
                htmlFor="param-project-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Nazwa inwestycji / obiektu
              </label>
              <input
                id="param-project-name"
                type="text"
                value={params.projectName}
                onChange={(e) => updateField('projectName', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="param-object-type"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Typ obiektu / konstrukcji
                </label>
                <select
                  id="param-object-type"
                  value={params.objectType}
                  onChange={(e) =>
                    updateField('objectType', e.target.value as StructureObjectType)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                >
                  {OBJECT_TYPE_LABELS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="param-scope-mode"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Zakres kosztorysowania
                </label>
                <select
                  id="param-scope-mode"
                  value={params.scopeMode}
                  onChange={(e) =>
                    updateField('scopeMode', e.target.value as WorkScopeMode)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                >
                  {SCOPE_LABELS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {numInput('param-length', 'Długość zabudowy', params.lengthM, 'm', 0.5, 1, (v) =>
                updateField('lengthM', v)
              )}
              {numInput('param-width', 'Szerokość zabudowy', params.widthM, 'm', 0.5, 1, (v) =>
                updateField('widthM', v)
              )}
              {numInput('param-height', 'Wysokość obiektu', params.heightM, 'm', 0.5, 1, (v) =>
                updateField('heightM', v)
              )}
              {numInput('param-floors', 'Liczba kondygnacji', params.floors, 'kond.', 1, 1, (v) =>
                updateField('floors', Math.max(1, Math.round(v)))
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {numInput(
                'param-basement',
                'Głębokość podpiwniczenia',
                params.basementDepthM,
                'm',
                0.2,
                0,
                (v) => updateField('basementDepthM', v)
              )}
              {numInput(
                'param-wall-cm',
                'Grubość ścian zewn.',
                params.wallThicknessCm,
                'cm',
                2,
                12,
                (v) => updateField('wallThicknessCm', v)
              )}
              {numInput(
                'param-exc-depth',
                'Głębokość wykopu',
                params.excavationDepthM,
                'm',
                0.1,
                0,
                (v) => updateField('excavationDepthM', v)
              )}
              {numInput(
                'param-overdig',
                'Odsadzenie robocze wykopu',
                params.overdigMarginM,
                'm',
                0.2,
                0,
                (v) => updateField('overdigMarginM', v)
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="param-soil-cat"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Kategoria gruntu (PN-B-06050)
                </label>
                <select
                  id="param-soil-cat"
                  value={params.soilCategory}
                  onChange={(e) =>
                    updateField('soilCategory', e.target.value as SoilCategory)
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                >
                  <option value="I-II">Kat. I–II (piaski, lekkie)</option>
                  <option value="III">Kat. III (gliny, iły — DŚ)</option>
                  <option value="IV">Kat. IV (rumosz skalny)</option>
                </select>
              </div>
              {numInput(
                'param-haul',
                'Odległość wywozu urobku',
                params.haulDistanceKm,
                'km',
                1,
                1,
                (v) => updateField('haulDistanceKm', v)
              )}
              {numInput(
                'param-trees',
                'Drzewa do wycinki i karczowania',
                params.treesToRemove,
                'szt.',
                1,
                0,
                (v) => updateField('treesToRemove', Math.round(v))
              )}
            </div>

            <div className="pt-2 flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.groundwaterLowering}
                  onChange={(e) => updateField('groundwaterLowering', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                />
                <span>Odwodnienie wykopu (igłofiltry)</span>
              </label>
              <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.shoringRequired}
                  onChange={(e) => updateField('shoringRequired', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                />
                <span>Zabezpieczenie ścian grodzicami Larssena</span>
              </label>
              <label className="inline-flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.hasAsbestosRoof}
                  onChange={(e) => updateField('hasAsbestosRoof', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                />
                <span>Pokrycie z azbestu / eternitu (BDO 17 06 05*)</span>
              </label>
            </div>
          </div>

          <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Calculator className="w-3.5 h-3.5 text-amber-700" />
                <span>Wyliczony przedmiar inżynieryjny</span>
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <dt className="text-slate-600">Powierzchnia zabudowy</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatNumber(volumes.footprintM2, 1)} m²
                  </dd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <dt className="text-slate-600">Kubatura brutto obiektu</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatNumber(volumes.grossVolumeM3, 1)} m³
                  </dd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <dt className="text-slate-600">Zdjęcie humusu (25 cm)</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900">
                    {formatNumber(volumes.topsoilVolumeM3, 1)} m³
                  </dd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <dt className="text-slate-600">Objętość wykopu ze skarpą</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatNumber(volumes.excavationVolumeM3, 1)} m³
                  </dd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <dt className="text-slate-600">Zasypka / wymiana gruntu</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900">
                    {formatNumber(volumes.backfillVolumeM3, 1)} m³
                  </dd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <dt className="text-slate-600">Szacowany gruz ceglany</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900">
                    {formatNumber(volumes.brickRubbleTonnes, 1)} t
                  </dd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200">
                  <dt className="text-slate-600">Szacowany gruz betonowy</dt>
                  <dd className="font-mono tabular-nums font-medium text-slate-900">
                    {formatNumber(volumes.concreteRubbleTonnes, 1)} t
                  </dd>
                </div>
                {volumes.steelScrapTonnes > 0 && (
                  <div className="flex justify-between py-1.5 border-b border-slate-200">
                    <dt className="text-slate-600">Złom stalowy (odzysk)</dt>
                    <dd className="font-mono tabular-nums font-medium text-slate-900">
                      {formatNumber(volumes.steelScrapTonnes, 1)} t
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() => onGenerateEstimate(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-amber-700 rounded-lg hover:bg-amber-800 transition-colors"
              >
                <span>Generuj kosztorys z parametrów</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onGenerateEstimate(false)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <span>Dopisz do aktualnego kosztorysu</span>
              </button>

              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="text-[11px] font-medium text-slate-500">
                  Eksport przedmiaru do arkusza (Excel / Numbers na iPad):
                </div>
                {exportError && (
                  <div
                    role="alert"
                    className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-800"
                  >
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{exportError}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isExportingXlsx}
                    onClick={handleExportParametricXlsx}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                  >
                    {isExportingXlsx ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span>Excel / Numbers</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportParametricCsv}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV (iPad)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Soil & Underground Infrastructure Collision Risk Analyzer */}
      <SoilRiskAnalyzerPanel
        params={params}
        settings={settings}
        projectLocation={projectLocation}
        activeItems={activeItems}
        workCatalog={workCatalog}
        subregions={subregions}
        onChangeSoilCategory={(soilCat) => updateField('soilCategory', soilCat)}
        onApplySoilRiskPct={(nextRiskPct) => onApplySoilRiskPct?.(nextRiskPct)}
        onGoToEstimate={onGoToEstimate}
      />
    </div>
  );
}
