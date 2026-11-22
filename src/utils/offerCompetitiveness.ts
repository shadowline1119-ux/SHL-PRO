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
  OfferCompetitivenessBar,
  OfferCompetitivenessMetricMode,
  OfferCompetitivenessReport,
  OfferCompetitivenessStatus,
  OfferMarketSegment,
  PriceSourceId,
  PriceSourceMeta,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import { calculateEstimateSummary, formatNumber } from './calculations';

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function normalizePolish(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');
}

const COUNTY_LOCATION_KEYWORDS: Array<{ countyId: CountyBenchmarkId; keywords: string[] }> = [
  {
    countyId: 'pow_wroclawski',
    keywords: [
      'powiat wroclawski',
      'pow. wroclawski',
      'kobierzyce',
      'bielany wroclawskie',
      'dlugoleka',
      'siechnice',
      'katy wroclawskie',
      'sobota',
      'sobotka',
      'czernica',
      'zorawina',
      'mietkow',
    ],
  },
  {
    countyId: 'm_wroclaw',
    keywords: ['wroclaw', 'psie pole', 'krzyki', 'fabryczna', 'srodmiescie', 'stare miasto'],
  },
  {
    countyId: 'pow_lubinski',
    keywords: ['lubin', 'lubinski', 'scinawa', 'rudna'],
  },
  {
    countyId: 'pow_legnicki',
    keywords: ['legnica', 'legnicki', 'chojnow', 'prochowice', 'kunice', 'legnickie pole'],
  },
  {
    countyId: 'pow_boleslawiecki',
    keywords: ['boleslawiec', 'boleslawiecki', 'nowogrodziec', 'osiecznica'],
  },
  {
    countyId: 'pow_lwowecki',
    keywords: ['lwowek', 'lwowecki', 'gryfow', 'mirsk', 'wlen', 'lubomierz'],
  },
  {
    countyId: 'pow_zlotoryjski',
    keywords: ['zlotoryja', 'zlotoryjski', 'swierzawa', 'wojciechow', 'czaple', 'pielgrzymka'],
  },
  {
    countyId: 'pow_swidnicki',
    keywords: ['swidnica', 'swidnicki', 'swiebodzice', 'strzegom', 'zarow', 'jaworzyna'],
  },
  {
    countyId: 'pow_walbrzyski',
    keywords: ['walbrzych', 'walbrzyski', 'boguszow', 'szczawno', 'gluszyca', 'jedlina'],
  },
  {
    countyId: 'pow_karkonoski',
    keywords: ['jelenia gora', 'karkonoski', 'karpacz', 'szklarska poreba', 'kowary', 'piechowice'],
  },
];

const SUBREGION_DEFAULT_COUNTY: Record<SubregionId, CountyBenchmarkId> = {
  wroclaw: 'm_wroclaw',
  legnica_glogow: 'pow_legnicki',
  walbrzych: 'pow_swidnicki',
  jelenia_gora: 'pow_boleslawiecki',
};

// Lokalne mnożniki presji konkurencyjnej i kosztów dostępu na poziomie powiatów (względem średniej swojego subregionu)
const COUNTY_PRICE_FACTORS: Record<CountyBenchmarkId, number> = {
  m_wroclaw: 1.03,
  pow_wroclawski: 1.01,
  pow_lubinski: 1.025,
  pow_legnicki: 0.99,
  pow_boleslawiecki: 0.975,
  pow_lwowecki: 0.955,
  pow_zlotoryjski: 0.965,
  pow_swidnicki: 0.985,
  pow_walbrzyski: 0.97,
  pow_karkonoski: 1.015,
};

const SEGMENT_MULTIPLIERS: Record<OfferMarketSegment, number> = {
  all: 1.0,
  public_tender: 0.955,
  commercial: 1.035,
};

export function inferCountyFromLocationAndSubregion(
  locationText: string | undefined,
  subregionId: SubregionId,
  counties: CountyMarginBenchmark[] = LOWER_SILESIA_COUNTY_MARGINS
): CountyBenchmarkId {
  const normalized = normalizePolish(locationText ?? '');
  if (normalized) {
    for (const entry of COUNTY_LOCATION_KEYWORDS) {
      if (entry.keywords.some((kw) => normalized.includes(kw))) {
        if (counties.some((c) => c.id === entry.countyId)) {
          return entry.countyId;
        }
      }
    }
  }

  const fallback = SUBREGION_DEFAULT_COUNTY[subregionId];
  if (counties.some((c) => c.id === fallback)) {
    return fallback;
  }
  const bySubregion = counties.find((c) => c.subregionId === subregionId);
  return bySubregion?.id ?? counties[0]?.id ?? 'm_wroclaw';
}

function classifyOfferCompetitiveness(deltaPct: number): {
  status: OfferCompetitivenessStatus;
  label: string;
  advice: string;
} {
  if (deltaPct <= -6) {
    return {
      status: 'bardzo_konkurencyjna',
      label: 'Wysoka konkurencyjność cenowa',
      advice:
        'Cena netto oferty PDF plasuje się wyraźnie poniżej średniej powiatowej i progu przetargowego — wysoka szansa wygranej; upewnij się, że marża pokrywa ryzyka podłoża.',
    };
  }
  if (deltaPct <= 2) {
    return {
      status: 'optymalna_rynkowa',
      label: 'Optymalna strefa rynkowa',
      advice:
        'Oferta PDF jest precyzyjnie dopasowana do średnich stawek analogicznych realizacji w tym powiecie (blisko mediany przetargowej oraz bezpiecznej marży).',
    };
  }
  if (deltaPct <= 10) {
    return {
      status: 'powyzej_sredniej',
      label: 'Lekko powyżej średniej powiatu',
      advice:
        'Cena jest o kilka procent wyższa od średniej rynkowej w powiecie — dobrze pozycjonowana dla zleceń prywatnych; w przetargu BZP/BIP rozważ rabat 3–5%.',
    };
  }
  return {
    status: 'wysoka_ryzyko_odrzucenia',
    label: 'Powyżej średniej — ryzyko cenowe',
    advice:
      'Cena netto oferty PDF istotnie przewyższa analogiczne wyceny w powiecie. Sprawdź poziom narzutów Kp/Zysk lub przełącz bazę na stawkę bardziej konkurencyjną.',
  };
}

function computeRegionalMarketReferenceNet(params: {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  targetCounty: CountyMarginBenchmark;
  workCatalog: CatalogWorkItem[];
  priceSources: Record<PriceSourceId, PriceSourceMeta>;
  subregions: Record<SubregionId, SubregionMeta>;
}): {
  neutralCountyMarketNet: number;
  catalogRefNet: number;
} {
  const {
    items,
    settings,
    targetCounty,
    workCatalog,
    priceSources,
    subregions,
  } = params;

  const activeSubMult = subregions[settings.subregionId]?.multiplier ?? 1;
  const countySubMult = subregions[targetCounty.subregionId]?.multiplier ?? 1;
  const countyFactor = COUNTY_PRICE_FACTORS[targetCounty.id] ?? 1;
  const subregionRatio = activeSubMult > 0 ? countySubMult / activeSubMult : 1;

  // Neutralna wycena analogicznej inwestycji w powiecie: średnia koszyka baz (rynek_dolnoslaski, intercenbud, sekocenbud)
  // skorygowana do mnożnika podregionu wybranego powiatu oraz jego lokalnego wskaźnika cenowego,
  // ze standardowymi kosztami pośrednimi 11.5% i średnią marżą zysku właściwą dla tego powiatu.
  const marketSources: PriceSourceId[] = ['rynek_dolnoslaski', 'intercenbud', 'sekocenbud'];

  const neutralItems: EstimateLineItem[] = items.map((item) => {
    if (!item.catalogId || item.isCustom) {
      return {
        ...item,
        rateLabor: round2(item.rateLabor * subregionRatio * countyFactor),
        rateMaterials: round2(item.rateMaterials * subregionRatio * (0.98 + countyFactor * 0.02)),
        rateEquipment: round2(item.rateEquipment * subregionRatio * countyFactor),
      };
    }

    const cat = workCatalog.find((c) => c.id === item.catalogId);
    if (!cat) {
      return {
        ...item,
        rateLabor: round2(item.rateLabor * subregionRatio * countyFactor),
        rateMaterials: round2(item.rateMaterials * subregionRatio),
        rateEquipment: round2(item.rateEquipment * subregionRatio * countyFactor),
      };
    }

    const availableRates = marketSources
      .map((s) => cat.ratesBySource[s])
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (availableRates.length === 0) {
      return item;
    }

    const avgL =
      availableRates.reduce((acc, r) => acc + r.labor, 0) / availableRates.length;
    const avgM =
      availableRates.reduce((acc, r) => acc + r.materials, 0) / availableRates.length;
    const avgS =
      availableRates.reduce((acc, r) => acc + r.equipment, 0) / availableRates.length;

    return {
      ...item,
      rateLabor: round2(avgL * countySubMult * countyFactor),
      rateMaterials: round2(avgM * countySubMult * (0.985 + countyFactor * 0.015)),
      rateEquipment: round2(avgS * countySubMult * countyFactor),
    };
  });

  const marketCountySettings: EstimateSettings = {
    sourceId: priceSources.rynek_dolnoslaski ? 'rynek_dolnoslaski' : settings.sourceId,
    subregionId: targetCounty.subregionId,
    indirectCostsPct: 11.5,
    profitPct: round2(Math.max(4, targetCounty.avgMarginPct + 1.2)),
    vatRate: settings.vatRate,
    discountPct: 0,
  };

  const neutralCountySummary = calculateEstimateSummary(neutralItems, marketCountySettings);

  // Referencja katalogowa KNR / Sekocenbud + Bistyp dla danego powiatu (górny segment kosztorysów inwestorskich / dużych firm)
  const catalogItems: EstimateLineItem[] = items.map((item) => {
    if (!item.catalogId || item.isCustom) {
      return {
        ...item,
        rateLabor: round2(item.rateLabor * subregionRatio * 1.03),
        rateMaterials: round2(item.rateMaterials * subregionRatio * 1.02),
        rateEquipment: round2(item.rateEquipment * subregionRatio * 1.03),
      };
    }
    const cat = workCatalog.find((c) => c.id === item.catalogId);
    const r = cat?.ratesBySource.sekocenbud ?? cat?.ratesBySource[settings.sourceId];
    if (!r) return item;
    return {
      ...item,
      rateLabor: round2(r.labor * countySubMult * Math.max(1, countyFactor)),
      rateMaterials: round2(r.materials * countySubMult),
      rateEquipment: round2(r.equipment * countySubMult * Math.max(1, countyFactor)),
    };
  });

  const catalogSettings: EstimateSettings = {
    sourceId: priceSources.sekocenbud ? 'sekocenbud' : settings.sourceId,
    subregionId: targetCounty.subregionId,
    indirectCostsPct: 12.5,
    profitPct: round2(Math.max(6, targetCounty.typicalRangeMaxPct)),
    vatRate: settings.vatRate,
    discountPct: 0,
  };
  const catalogRefSummary = calculateEstimateSummary(catalogItems, catalogSettings);

  return {
    neutralCountyMarketNet: neutralCountySummary.netTotal,
    catalogRefNet: catalogRefSummary.netTotal,
  };
}

export function buildOfferCompetitivenessReport(params: {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  offerNetTotal: number;
  offerNumber?: string;
  offerSource?: 'generated_pdf' | 'live_preview';
  countyId: CountyBenchmarkId;
  segment?: OfferMarketSegment;
  metricMode?: OfferCompetitivenessMetricMode;
  counties?: CountyMarginBenchmark[];
  workCatalog?: CatalogWorkItem[];
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
}): OfferCompetitivenessReport {
  const {
    items,
    settings,
    offerNetTotal,
    offerNumber = 'OF/2026',
    offerSource = 'live_preview',
    countyId,
    segment = 'all',
    metricMode = 'net_pln',
    counties = LOWER_SILESIA_COUNTY_MARGINS,
    workCatalog = WORK_CATALOG,
    priceSources = PRICE_SOURCES,
    subregions = SUBREGIONS,
  } = params;

  const targetCounty =
    counties.find((c) => c.id === countyId) ?? counties[0];
  const countySubregion =
    subregions[targetCounty.subregionId] ?? SUBREGIONS[targetCounty.subregionId];

  const cleanOfferNet = round2(Math.max(0, offerNetTotal));
  const segMult = SEGMENT_MULTIPLIERS[segment] ?? 1.0;

  const { neutralCountyMarketNet, catalogRefNet } = computeRegionalMarketReferenceNet({
    items,
    settings,
    targetCounty,
    workCatalog,
    priceSources,
    subregions,
  });

  const baseMarket = neutralCountyMarketNet > 0 ? neutralCountyMarketNet : cleanOfferNet;
  const countyAverageNetPln = round2(baseMarket * segMult);
  const countyLowQuartileNetPln = round2(countyAverageNetPln * 0.915);
  const countyMedianTenderNetPln = round2(
    countyAverageNetPln * (segment === 'public_tender' ? 0.975 : 0.962)
  );
  const countyCatalogRefNetPln = round2(
    Math.max(countyAverageNetPln * 1.025, (catalogRefNet > 0 ? catalogRefNet : baseMarket * 1.05) * segMult)
  );
  const countyHighQuartileNetPln = round2(
    Math.max(countyCatalogRefNetPln * 1.045, countyAverageNetPln * 1.115)
  );

  const deltaVsCountyAvgPln = round2(cleanOfferNet - countyAverageNetPln);
  const deltaVsCountyAvgPct =
    countyAverageNetPln > 0
      ? round2((deltaVsCountyAvgPln / countyAverageNetPln) * 100)
      : 0;

  const classification = classifyOfferCompetitiveness(deltaVsCountyAvgPct);

  const toBar = (bar: {
    id: OfferCompetitivenessBar['id'];
    shortLabel: string;
    fullLabel: string;
    kind: OfferCompetitivenessBar['kind'];
    netPricePln: number;
    description: string;
  }): OfferCompetitivenessBar => {
    const indexVsCountyAvg =
      countyAverageNetPln > 0
        ? round2((bar.netPricePln / countyAverageNetPln) * 100)
        : 100;
    const deltaVsOurOfferPln = round2(bar.netPricePln - cleanOfferNet);
    const deltaVsOurOfferPct =
      cleanOfferNet > 0 ? round2((deltaVsOurOfferPln / cleanOfferNet) * 100) : 0;
    const deltaVsAvgPct =
      countyAverageNetPln > 0
        ? round2(((bar.netPricePln - countyAverageNetPln) / countyAverageNetPln) * 100)
        : 0;

    return {
      ...bar,
      indexVsCountyAvg,
      selectedMetricValue:
        metricMode === 'index_100' ? indexVsCountyAvg : bar.netPricePln,
      deltaVsOurOfferPln,
      deltaVsOurOfferPct,
      deltaVsCountyAvgPct: deltaVsAvgPct,
    };
  };

  const bars: OfferCompetitivenessBar[] = [
    toBar({
      id: 'our_offer',
      shortLabel: 'Nasza oferta PDF',
      fullLabel: `Nasza oferta PDF (${offerNumber})`,
      kind: 'our_offer',
      netPricePln: cleanOfferNet,
      description:
        offerSource === 'generated_pdf'
          ? 'Końcowa cena netto z ostatnio wygenerowanego pliku oferty PDF.'
          : 'Końcowa cena netto przygotowanej oferty PDF (z narzutami Kp, Zysk i rabatem).',
    }),
    toBar({
      id: 'county_p25',
      shortLabel: 'Najtańsze (P25)',
      fullLabel: `Dolny kwartyl ofert w ${targetCounty.shortName} (P25)`,
      kind: 'market',
      netPricePln: countyLowQuartileNetPln,
      description:
        'Próg agresywnych ofert lokalnych podwykonawców o minimalnych narzutach własnych.',
    }),
    toBar({
      id: 'county_tender_median',
      shortLabel: 'Mediana BZP/BIP',
      fullLabel: `Mediana wygrywających przetargów (${targetCounty.shortName})`,
      kind: 'market',
      netPricePln: countyMedianTenderNetPln,
      description:
        'Mediana cen składanych w postępowaniach publicznych o analogicznym zakresie robót.',
    }),
    toBar({
      id: 'county_avg',
      shortLabel: 'Średnia powiatu',
      fullLabel: `Średnia rynkowa w ${targetCounty.shortName}`,
      kind: 'market',
      netPricePln: countyAverageNetPln,
      description:
        'Średnia cena rynkowa analogicznych inwestycji w wybranym powiecie i segmencie.',
    }),
    toBar({
      id: 'county_catalog_ref',
      shortLabel: 'KNR / Sekocenbud',
      fullLabel: `Wycena bazowa KNR / Sekocenbud (${targetCounty.shortName})`,
      kind: 'market',
      netPricePln: countyCatalogRefNetPln,
      description:
        'Referencyjna wartość kosztorysowa dla pełnych narzutów katalogowych regionu.',
    }),
    toBar({
      id: 'county_p75',
      shortLabel: 'Budżet / P75',
      fullLabel: `Górny kwartyl i budżet inwestora (${targetCounty.shortName})`,
      kind: 'market',
      netPricePln: countyHighQuartileNetPln,
      description:
        'Górny przedział ofert lub szacunkowego budżetu zamawiającego w powiecie.',
    }),
  ];

  return {
    countyId: targetCounty.id,
    countyName: targetCounty.name,
    countyShortName: targetCounty.shortName,
    countySubregionName: countySubregion.name,
    countyMarketNote: targetCounty.marketNote,
    segment,
    metricMode,
    offerSource,
    offerNumber,
    offerNetTotal: cleanOfferNet,
    countyAverageNetPln,
    countyMedianTenderNetPln,
    countyLowQuartileNetPln,
    countyHighQuartileNetPln,
    deltaVsCountyAvgPln,
    deltaVsCountyAvgPct,
    competitivenessStatus: classification.status,
    competitivenessLabel: classification.label,
    competitivenessAdvice: classification.advice,
    typicalCountyMarginRange: `${formatNumber(targetCounty.typicalRangeMinPct, 1)}% – ${formatNumber(targetCounty.typicalRangeMaxPct, 1)}%`,
    bars,
  };
}
