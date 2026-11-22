import { SUBREGIONS, WORK_CATALOG } from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  EstimateLineItem,
  EstimateSettings,
  SiteUtilityDensity,
  SoilCategory,
  SoilRiskAnalysisResult,
  SoilRiskDriverItem,
  SoilRiskSeverity,
  StructureParams,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import {
  calculateEstimateSummary,
  generateItemsFromStructureParams,
} from './calculations';

function round1(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function classifySeverity(pct: number, thresholds: [number, number, number]): {
  severity: SoilRiskSeverity;
  label: string;
} {
  if (pct < thresholds[0]) return { severity: 'niskie', label: 'Niskie' };
  if (pct < thresholds[1]) return { severity: 'umiarkowane', label: 'Umiarkowane' };
  if (pct < thresholds[2]) return { severity: 'wysokie', label: 'Wysokie' };
  return { severity: 'krytyczne', label: 'Krytyczne' };
}

const SOIL_PROFILE_META: Record<
  SoilCategory,
  {
    title: string;
    summary: string;
    baseUtilitiesPct: number;
    baseSlopePct: number;
    baseObstaclesPct: number;
    baseGroundwaterPct: number;
  }
> = {
  'I-II': {
    title: 'Kat. I–II (piaski sypkie, żwiry, grunty lekkie)',
    summary:
      'Szybkie urabianie łyżką koparki, ale wysoka podatność ścian wykopu na obsypywanie i podmycie oraz ryzyko gwałtownego odsłonięcia płytkich kabli SN/nN bez przekopów próbnych.',
    baseUtilitiesPct: 1.4,
    baseSlopePct: 1.5,
    baseObstaclesPct: 0.4,
    baseGroundwaterPct: 1.1,
  },
  III: {
    title: 'Kat. III (gliny zwałowe, iły, grunty spoiste DŚ)',
    summary:
      'Typowe grunty Dolnego Śląska: duże opory klejenia i uplastycznienie po opadach spowalniają precyzyjne odkrywanie sieci gazowych i wodociągowych oraz wymuszają stabilizację lub wymianę podłoża.',
    baseUtilitiesPct: 2.1,
    baseSlopePct: 1.9,
    baseObstaclesPct: 1.3,
    baseGroundwaterPct: 1.2,
  },
  IV: {
    title: 'Kat. IV (rumosz skalny, zwietrzeliny, grunty zwięzłe)',
    summary:
      'Konieczność kucia młotem hydraulicznym i podważania brył skalnych drastycznie podnosi ryzyko uszkodzenia sąsiednich rurociągów/kabli (drgania) oraz nieplanowanego zużycia zębów i sprzętu.',
    baseUtilitiesPct: 2.8,
    baseSlopePct: 1.0,
    baseObstaclesPct: 3.4,
    baseGroundwaterPct: 0.9,
  },
};

const UTILITY_DENSITY_MULT: Record<SiteUtilityDensity, number> = {
  teren_zurbanizowany: 1.45,
  strefa_przemyslowa: 1.15,
  teren_otwarty: 0.7,
};

export function inferSiteUtilityDensityFromLocation(
  location?: string
): SiteUtilityDensity {
  const norm = (location ?? '').toLowerCase();
  if (
    norm.includes('strefa') ||
    norm.includes('magazyn') ||
    norm.includes('przemysł') ||
    norm.includes('hala') ||
    norm.includes('lsse') ||
    norm.includes('wsse')
  ) {
    return 'strefa_przemyslowa';
  }
  if (
    norm.includes('centrum') ||
    norm.includes('ul.') ||
    norm.includes('psie pole') ||
    norm.includes('krzyki') ||
    norm.includes('wrocław') ||
    norm.includes('legnica') ||
    norm.includes('wałbrzych') ||
    norm.includes('jelenia')
  ) {
    return 'teren_zurbanizowany';
  }
  return 'teren_otwarty';
}

export function analyzeSoilAndSiteRisk(input: {
  params: StructureParams;
  settings: EstimateSettings;
  siteContext?: SiteUtilityDensity;
  activeItems?: EstimateLineItem[];
  workCatalog?: CatalogWorkItem[];
  subregions?: Record<SubregionId, SubregionMeta>;
}): SoilRiskAnalysisResult {
  const {
    params,
    settings,
    siteContext = 'teren_zurbanizowany',
    activeItems = [],
    workCatalog = WORK_CATALOG,
    subregions = SUBREGIONS,
  } = input;

  const soilCategory = params.soilCategory ?? 'III';
  const meta = SOIL_PROFILE_META[soilCategory] ?? SOIL_PROFILE_META.III;
  const depth = Math.max(0, Number(params.excavationDepthM) || 0);
  const densityMult = UTILITY_DENSITY_MULT[siteContext] ?? 1.15;

  // 1. Kolizje z infrastrukturą podziemną (GESUT / ZUDP)
  const depthUtilityFactor = depth >= 1.2 ? 1 + Math.min(0.45, (depth - 1.2) * 0.14) : 0.85;
  const demolitionBonus = params.scopeMode !== 'tylko_ziemne' ? 0.4 : 0;
  const utilitiesPct = round1(
    Math.min(7.5, meta.baseUtilitiesPct * densityMult * depthUtilityFactor + demolitionBonus)
  );
  const utilSev = classifySeverity(utilitiesPct, [1.5, 2.7, 4.0]);

  // 2. Niestabilność skarp i osypiska
  const depthSlopeBonus = depth > 1.5 ? (depth - 1.5) * 0.45 : 0;
  const shoringMitigation = params.shoringRequired ? -0.9 : 0;
  const slopePct = round1(
    Math.max(0.5, Math.min(5.0, meta.baseSlopePct + depthSlopeBonus + shoringMitigation))
  );
  const slopeSev = classifySeverity(slopePct, [1.2, 2.2, 3.3]);

  // 3. Głazy, niezinwentaryzowane fundamenty i kucie młotem
  const oldFoundationsFactor =
    params.scopeMode !== 'tylko_ziemne' || params.basementDepthM > 0 ? 0.6 : 0;
  const obstaclesPct = round1(
    Math.min(6.0, meta.baseObstaclesPct + oldFoundationsFactor)
  );
  const obstSev = classifySeverity(obstaclesPct, [1.0, 2.0, 3.5]);

  // 4. Wody gruntowe i nieprzewidziane sączenia
  const deepWaterBonus = depth >= 2.0 ? 0.5 : 0;
  const wellpointMitigation = params.groundwaterLowering ? -0.4 : 0;
  const waterPct = round1(
    Math.max(0.4, Math.min(3.5, meta.baseGroundwaterPct + deepWaterBonus + wellpointMitigation))
  );
  const waterSev = classifySeverity(waterPct, [1.0, 1.8, 2.6]);

  const drivers: SoilRiskDriverItem[] = [
    {
      id: 'underground_utilities',
      label: 'Kolizje z infrastrukturą podziemną (GESUT / ZUDP)',
      contributionPct: utilitiesPct,
      severity: utilSev.severity,
      severityLabel: utilSev.label,
      engineeringNote:
        siteContext === 'teren_zurbanizowany'
          ? 'Wysokie zagęszczenie kabli SN/nN, gazu i wodociągów — rezerwa na przekopy próbne ręczne oraz pracę koparki pod nadzorem gestora sieci.'
          : siteContext === 'strefa_przemyslowa'
          ? 'Sieci zakładowe i przyłącza technologiczne — wymagana weryfikacja trasy przed odspajaniem mechanicznym.'
          : 'Mniejsze zagęszczenie uzbrojenia (sieci przesyłowe, drenaże melioracyjne) — punktowe przekopy kontrolne.',
    },
    {
      id: 'slope_instability',
      label: 'Niestabilność skarp, rozmaknięcie i obsypywanie',
      contributionPct: slopePct,
      severity: slopeSev.severity,
      severityLabel: slopeSev.label,
      engineeringNote: params.shoringRequired
        ? 'Obudowa grodzicami Larssena ogranicza osypywanie ścian, pozostawiając ryzyko lokalnego osiadania klina odłamu.'
        : 'Brak sztywnej obudowy ścian przy wykopie wymaga łagodzenia skarp i ewentualnego dopompowywania/wymiany rozmoczonego podłoża.',
    },
    {
      id: 'boulders_breaker',
      label: 'Przeszkody podziemne, głazy, stare ławy i kucie młotem',
      contributionPct: obstaclesPct,
      severity: obstSev.severity,
      severityLabel: obstSev.label,
      engineeringNote:
        soilCategory === 'IV'
          ? 'Grunty kat. IV generują konieczność pracy młotem wyburzeniowym i większy narzut na zużycie osprzętu oraz transport brył.'
          : 'Ryzyko niezinwentaryzowanych fundamentów, gruzu lub narzutniaków wymagających selektywnego kruszenia i utylizacji.',
    },
    {
      id: 'groundwater_seepage',
      label: 'Sączenia wód gruntowych i awaryjne odwodnienie',
      contributionPct: waterPct,
      severity: waterSev.severity,
      severityLabel: waterSev.label,
      engineeringNote: params.groundwaterLowering
        ? 'Wycena zawiera igłofiltry — pozostały narzut obejmuje wydłużoną pracę pomp i przestoje technologiczne.'
        : 'Brak stałego igłofiltrowania w kosztorysie — rezerwa na pompowanie doraźne pompą szlamową po opadach lub przy wysiękach.',
    },
  ];

  const suggestedRiskPct = round1(
    Math.min(25, Math.max(1.5, drivers.reduce((acc, d) => acc + d.contributionPct, 0)))
  );
  const suggestedMultiplier = Math.round((1 + suggestedRiskPct / 100) * 1000) / 1000;
  const overall = classifySeverity(suggestedRiskPct, [5.0, 7.8, 10.5]);

  const mitigationChecklist: string[] = [
    siteContext === 'teren_zurbanizowany'
      ? 'Wykonaj ręczne przekopy próbne w strefie ±1,5 m od osi sieci z mapy GESUT przed wejściem koparki.'
      : 'Potwierdź przebieg lokalnych przyłączy i drenaży rolnych z geodetą przed rozpoczęciem wykopu.',
    soilCategory === 'IV'
      ? 'Zaplanuj młot hydrauliczny oraz osłonę przeciwodpryskową w sąsiedztwie istniejących instalacji.'
      : soilCategory === 'III'
      ? 'Uwzględnij geowłókninę separacyjną i rezerwę pospółki na wypadek uplastycznienia dna wykopu.'
      : 'Zabezpiecz krawędzie wykopu w gruntach sypkich przed obsypywaniem pod ciężarem sprzętu.',
    !params.shoringRequired && depth > 1.5
      ? 'Dla wykopów > 1,5 m w gruncie sypkim lub przy kolizjach sieciowych rozważ obudowę skrzynkową typu Box.'
      : 'Udokumentuj odbiór sieci i robót zanikających protokołem z gestorem infrastruktury.',
  ];

  const baseSettings: EstimateSettings = { ...settings, soilRiskPct: 0 };
  const riskSettings: EstimateSettings = { ...settings, soilRiskPct: suggestedRiskPct };

  const activeBaseSummary = calculateEstimateSummary(activeItems, baseSettings);
  const activeRiskSummary = calculateEstimateSummary(activeItems, riskSettings);

  const parametricItems = generateItemsFromStructureParams(
    params,
    workCatalog,
    baseSettings,
    subregions
  );
  const parametricBaseSummary = calculateEstimateSummary(parametricItems, baseSettings);
  const parametricRiskSummary = calculateEstimateSummary(parametricItems, riskSettings);

  return {
    soilCategory,
    soilTitle: meta.title,
    soilEngineeringSummary: meta.summary,
    siteContext,
    suggestedRiskPct,
    suggestedMultiplier,
    riskLevel: overall.severity,
    riskLevelLabel: overall.label,
    drivers,
    mitigationChecklist,
    activeEstimateBaseNetPln: activeBaseSummary.netTotal,
    activeEstimateSuggestedNetPln: activeRiskSummary.netTotal,
    activeEstimateDeltaPln: round2(
      activeRiskSummary.netTotal - activeBaseSummary.netTotal
    ),
    parametricEstimateBaseNetPln: parametricBaseSummary.netTotal,
    parametricEstimateSuggestedNetPln: parametricRiskSummary.netTotal,
    parametricEstimateDeltaPln: round2(
      parametricRiskSummary.netTotal - parametricBaseSummary.netTotal
    ),
  };
}
