import {
  BASE_EQUIPMENT_HOURLY_RATE_PLN,
  CATEGORY_LABELS,
  LOWER_SILESIA_COUNTY_MARGINS,
  PRICE_SOURCES,
  REGIONAL_12M_TREND_PROFILES,
  REGIONAL_CLIMATE_PROFILES,
  SUBREGIONS,
} from '../data/dolnoslaskieRates.ts';
import type {
  CatalogWorkItem,
  CategorySummary,
  CountyBenchmarkId,
  CountyMarginBenchmark,
  DieselEquipmentCorrelationReport,
  DieselHistoryPoint,
  DieselMonthlyPriceItem,
  DieselPriceBenchmarkMode,
  EarthworkRiskLevel,
  EarthworksSeasonalityReport,
  EstimateLineItem,
  EstimateSettings,
  EstimateSummary,
  HistoricalRatePoint,
  ItemProfitabilityBar,
  ItemProfitabilityCountyDelta,
  ItemProfitabilityCountyReport,
  ItemProfitabilitySortMode,
  LineTotals,
  PriceSourceId,
  PriceSourceMeta,
  RegionalClimateProfile,
  RegionalRateTrendProfile,
  SeasonalEarthworkRiskPoint,
  SoilCategory,
  SourceComparisonRow,
  StructureParams,
  StructureVolumePreview,
  SubregionId,
  SubregionMeta,
  WorkCategory,
} from '../types/estimator.ts';
import { DEFAULT_DIESEL_BENCHMARK_SERIES } from './dieselSearch.ts';

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function calculateLineTotals(
  item: EstimateLineItem,
  settings: EstimateSettings
): LineTotals {
  const qty = Math.max(0, Number(item.quantity) || 0);
  const laborTotal = round2(qty * Math.max(0, Number(item.rateLabor) || 0));
  const materialsTotal = round2(qty * Math.max(0, Number(item.rateMaterials) || 0));
  const equipmentTotal = round2(qty * Math.max(0, Number(item.rateEquipment) || 0));
  const directTotal = round2(laborTotal + materialsTotal + equipmentTotal);

  const kpRate = Math.max(0, Number(settings.indirectCostsPct) || 0) / 100;
  const profitRate = Math.max(0, Number(settings.profitPct) || 0) / 100;
  const riskRate = Math.min(35, Math.max(0, Number(settings.soilRiskPct) || 0)) / 100;
  const discountRate = Math.min(50, Math.max(0, Number(settings.discountPct) || 0)) / 100;

  // W kosztorysowaniu budowlanym Kp liczy się od (R + S), a Zysk od (R + S + Kp)
  const indirectCost = round2((laborTotal + equipmentTotal) * kpRate);
  const profit = round2((laborTotal + equipmentTotal + indirectCost) * profitRate);
  const baseBeforeRisk = round2(directTotal + indirectCost + profit);
  const riskReserveAmount = round2(baseBeforeRisk * riskRate);
  const netBeforeDiscount = round2(baseBeforeRisk + riskReserveAmount);
  const discountAmount = round2(netBeforeDiscount * discountRate);
  const netTotal = round2(netBeforeDiscount - discountAmount);
  const vatAmount = round2(netTotal * (settings.vatRate / 100));
  const grossTotal = round2(netTotal + vatAmount);
  const unitNetRate = qty > 0 ? round2(netTotal / qty) : round2(
    ((item.rateLabor + item.rateEquipment) * (1 + kpRate) * (1 + profitRate) + item.rateMaterials) *
      (1 + riskRate) *
      (1 - discountRate)
  );

  return {
    laborTotal,
    materialsTotal,
    equipmentTotal,
    directTotal,
    indirectCost,
    profit,
    riskReserveAmount,
    netBeforeDiscount,
    discountAmount,
    netTotal,
    vatAmount,
    grossTotal,
    unitNetRate,
  };
}

export function calculateEstimateSummary(
  items: EstimateLineItem[],
  settings: EstimateSettings
): EstimateSummary {
  let laborTotal = 0;
  let materialsTotal = 0;
  let equipmentTotal = 0;
  let directTotal = 0;
  let indirectCost = 0;
  let profit = 0;
  let riskReserveAmount = 0;
  let discountAmount = 0;
  let netTotal = 0;
  let vatAmount = 0;
  let grossTotal = 0;

  const categoryMap = new Map<WorkCategory, CategorySummary>();
  (Object.keys(CATEGORY_LABELS) as WorkCategory[]).forEach((cat) => {
    categoryMap.set(cat, {
      category: cat,
      label: CATEGORY_LABELS[cat],
      laborTotal: 0,
      materialsTotal: 0,
      equipmentTotal: 0,
      netTotal: 0,
      itemCount: 0,
    });
  });

  const bdoMap = new Map<string, { code: string; quantity: number; unit: EstimateLineItem['unit']; items: string[] }>();

  for (const item of items) {
    const t = calculateLineTotals(item, settings);
    laborTotal = round2(laborTotal + t.laborTotal);
    materialsTotal = round2(materialsTotal + t.materialsTotal);
    equipmentTotal = round2(equipmentTotal + t.equipmentTotal);
    directTotal = round2(directTotal + t.directTotal);
    indirectCost = round2(indirectCost + t.indirectCost);
    profit = round2(profit + t.profit);
    riskReserveAmount = round2(riskReserveAmount + (t.riskReserveAmount ?? 0));
    discountAmount = round2(discountAmount + t.discountAmount);
    netTotal = round2(netTotal + t.netTotal);
    vatAmount = round2(vatAmount + t.vatAmount);
    grossTotal = round2(grossTotal + t.grossTotal);

    const catEntry = categoryMap.get(item.category);
    if (catEntry) {
      catEntry.laborTotal = round2(catEntry.laborTotal + t.laborTotal);
      catEntry.materialsTotal = round2(catEntry.materialsTotal + t.materialsTotal);
      catEntry.equipmentTotal = round2(catEntry.equipmentTotal + t.equipmentTotal);
      catEntry.netTotal = round2(catEntry.netTotal + t.netTotal);
      catEntry.itemCount += 1;
    }

    if (item.bdoCode && item.quantity > 0) {
      const key = `${item.bdoCode}__${item.unit}`;
      const existing = bdoMap.get(key);
      if (existing) {
        existing.quantity = round2(existing.quantity + item.quantity);
        existing.items.push(item.name);
      } else {
        bdoMap.set(key, {
          code: item.bdoCode,
          quantity: round2(item.quantity),
          unit: item.unit,
          items: [item.name],
        });
      }
    }
  }

  const laborSharePct = directTotal > 0 ? round2((laborTotal / directTotal) * 100) : 0;
  const materialsSharePct = directTotal > 0 ? round2((materialsTotal / directTotal) * 100) : 0;
  const equipmentSharePct = directTotal > 0 ? round2(100 - laborSharePct - materialsSharePct) : 0;

  return {
    laborTotal,
    materialsTotal,
    equipmentTotal,
    directTotal,
    indirectCost,
    profit,
    riskReserveAmount,
    discountAmount,
    netTotal,
    vatAmount,
    grossTotal,
    laborSharePct,
    materialsSharePct,
    equipmentSharePct,
    byCategory: Array.from(categoryMap.values()).filter((c) => c.itemCount > 0),
    bdoSummary: Array.from(bdoMap.values()),
  };
}

export function applyPriceSourceToItems(
  items: EstimateLineItem[],
  catalog: CatalogWorkItem[],
  sourceId: PriceSourceId,
  subregionId: EstimateSettings['subregionId'],
  subregions: Record<SubregionId, SubregionMeta> = SUBREGIONS
): EstimateLineItem[] {
  const mult = subregions[subregionId].multiplier;
  return items.map((item) => {
    if (!item.catalogId || item.isCustom) {
      return item;
    }
    const cat = catalog.find((c) => c.id === item.catalogId);
    if (!cat) return item;
    const rate = cat.ratesBySource[sourceId];
    return {
      ...item,
      rateLabor: round2(rate.labor * mult),
      rateMaterials: round2(rate.materials * mult),
      rateEquipment: round2(rate.equipment * mult),
    };
  });
}

export function compareSourcesForEstimate(
  items: EstimateLineItem[],
  catalog: CatalogWorkItem[],
  settings: EstimateSettings,
  priceSources: Record<PriceSourceId, PriceSourceMeta> = PRICE_SOURCES,
  subregions: Record<SubregionId, SubregionMeta> = SUBREGIONS
): SourceComparisonRow[] {
  const activeSummary = calculateEstimateSummary(items, settings);
  const mult = subregions[settings.subregionId].multiplier;
  const sourceIds = Object.keys(priceSources) as PriceSourceId[];

  return sourceIds.map((srcId) => {
    const simulatedItems = items.map((item) => {
      if (!item.catalogId || item.isCustom) return item;
      const cat = catalog.find((c) => c.id === item.catalogId);
      if (!cat) return item;
      const r = cat.ratesBySource[srcId];
      return {
        ...item,
        rateLabor: round2(r.labor * mult),
        rateMaterials: round2(r.materials * mult),
        rateEquipment: round2(r.equipment * mult),
      };
    });

    const summary = calculateEstimateSummary(simulatedItems, {
      ...settings,
      sourceId: srcId,
    });

    const deltaPln = round2(summary.netTotal - activeSummary.netTotal);
    const deltaPct =
      activeSummary.netTotal > 0 ? round2((deltaPln / activeSummary.netTotal) * 100) : 0;

    return {
      sourceId: srcId,
      sourceName: priceSources[srcId].name,
      shortName: priceSources[srcId].shortName,
      laborTotal: summary.laborTotal,
      materialsTotal: summary.materialsTotal,
      equipmentTotal: summary.equipmentTotal,
      netTotal: summary.netTotal,
      grossTotal: summary.grossTotal,
      deltaFromActivePct: deltaPct,
      deltaFromActivePln: deltaPln,
    };
  });
}

export function computeStructureVolumes(params: StructureParams): StructureVolumePreview {
  const L = Math.max(1, params.lengthM);
  const W = Math.max(1, params.widthM);
  const H = Math.max(1, params.heightM);
  const floors = Math.max(1, Math.round(params.floors));
  const footprintM2 = round2(L * W);
  const grossVolumeM3 = round2(footprintM2 * H);

  const margin = Math.max(0, params.overdigMarginM);
  const excDepth = Math.max(0, params.excavationDepthM);
  const topsoilArea = round2((L + margin * 4) * (W + margin * 4));
  const topsoilVolumeM3 = round2(topsoilArea * 0.25);

  // Objętość wykopu jako ostrosłup ścięty z bezpiecznym nachyleniem skarp 1:0.5
  const bottomArea = (L + margin * 2) * (W + margin * 2);
  const slopeOffset = excDepth * 0.5;
  const topArea = (L + margin * 2 + slopeOffset * 2) * (W + margin * 2 + slopeOffset * 2);
  const excavationVolumeM3 =
    excDepth > 0 ? round2(((bottomArea + topArea) / 2) * excDepth) : 0;

  // Zasypka stanowi ~22% wykopu przy obsypaniu fundamentów lub 100% piwnicy po wyburzeniu
  const basementVol = params.basementDepthM > 0 ? round2(footprintM2 * params.basementDepthM) : 0;
  const backfillVolumeM3 = round2(excavationVolumeM3 * 0.22 + basementVol * 0.85);

  const perimeter = 2 * (L + W);
  const wallT = Math.max(0.12, params.wallThicknessCm / 100);
  const wallArea = perimeter * H + (floors > 1 ? footprintM2 * (floors - 1) * 0.35 : 0);

  let brickRubbleTonnes = 0;
  let concreteRubbleTonnes = 0;
  let steelScrapTonnes = 0;

  if (params.scopeMode !== 'tylko_ziemne') {
    if (params.objectType === 'budynek_murowany') {
      const masonryVol = wallArea * wallT * 0.82; // odliczenie okien/drzwi ok. 18%
      const slabVol = footprintM2 * 0.18 * floors;
      brickRubbleTonnes = round2(masonryVol * 1.65);
      concreteRubbleTonnes = round2((slabVol + perimeter * 0.6 * 0.8) * 2.3);
    } else if (params.objectType === 'obiekt_zelbetowy') {
      const concreteVol = wallArea * wallT * 0.65 + footprintM2 * 0.24 * floors + perimeter * 0.7 * 0.9;
      concreteRubbleTonnes = round2(concreteVol * 2.4);
      brickRubbleTonnes = round2(footprintM2 * 0.25 * floors);
      steelScrapTonnes = round2(concreteVol * 0.085);
    } else if (params.objectType === 'hala_stalowa') {
      steelScrapTonnes = round2(footprintM2 * 0.048 * Math.max(1, H / 6));
      concreteRubbleTonnes = round2((footprintM2 * 0.2 + perimeter * 0.5 * 0.6) * 2.35);
    }
  }

  const asbestosM2 =
    params.scopeMode !== 'tylko_ziemne' && params.hasAsbestosRoof
      ? round2(footprintM2 * 1.15)
      : 0;

  return {
    footprintM2,
    grossVolumeM3,
    topsoilVolumeM3,
    excavationVolumeM3,
    backfillVolumeM3,
    brickRubbleTonnes,
    concreteRubbleTonnes,
    steelScrapTonnes,
    asbestosM2,
  };
}

export function generateItemsFromStructureParams(
  params: StructureParams,
  catalog: CatalogWorkItem[],
  settings: EstimateSettings,
  subregions: Record<SubregionId, SubregionMeta> = SUBREGIONS
): EstimateLineItem[] {
  const vol = computeStructureVolumes(params);
  const mult = subregions[settings.subregionId].multiplier;
  const items: EstimateLineItem[] = [];

  const pushCatalog = (catalogId: string, quantity: number, notes?: string) => {
    if (quantity <= 0) return;
    const cat = catalog.find((c) => c.id === catalogId);
    if (!cat) return;
    const rate = cat.ratesBySource[settings.sourceId];
    items.push({
      id: `gen-${catalogId}-${items.length + 1}`,
      catalogId: cat.id,
      knr: cat.knr,
      name: cat.name,
      category: cat.category,
      unit: cat.unit,
      quantity: round2(quantity),
      rateLabor: round2(rate.labor * mult),
      rateMaterials: round2(rate.materials * mult),
      rateEquipment: round2(rate.equipment * mult),
      bdoCode: cat.bdoCode,
      notes,
      isCustom: false,
    });
  };

  if (params.treesToRemove > 0) {
    pushCatalog('rz-wycinka-drzew', params.treesToRemove);
    pushCatalog('rz-karczowanie-pni', params.treesToRemove);
  }

  // Część rozbiórkowa
  if (params.scopeMode !== 'tylko_ziemne' && params.objectType !== 'budowla_ziemna') {
    if (params.hasAsbestosRoof && vol.asbestosM2 > 0) {
      pushCatalog('rw-azbest-eternit', vol.asbestosM2, 'Obowiązkowa ewidencja BDO 17 06 05*');
    } else if (params.objectType === 'budynek_murowany') {
      pushCatalog('rw-rozbiorka-dachu', round2(vol.footprintM2 * 1.12));
    }

    if (params.objectType === 'budynek_murowany') {
      pushCatalog('rw-budynek-murowany', vol.grossVolumeM3);
    } else if (params.objectType === 'obiekt_zelbetowy') {
      pushCatalog('rw-obiekt-zelbetowy', vol.grossVolumeM3);
    } else if (params.objectType === 'hala_stalowa') {
      pushCatalog('rw-hala-stalowa', vol.steelScrapTonnes);
    }

    pushCatalog('rw-skuwanie-posadzek', vol.footprintM2);

    const foundationM3 = round2(2 * (params.lengthM + params.widthM) * 0.5 * 0.8);
    pushCatalog('rw-skuwanie-law-beton', foundationM3);

    if (vol.brickRubbleTonnes > 0) {
      pushCatalog('tu-gruz-ceglany', vol.brickRubbleTonnes);
    }
    if (vol.concreteRubbleTonnes > 0) {
      pushCatalog('tu-gruz-betonowy', vol.concreteRubbleTonnes);
    }
    const mixedWasteTonnes = round2(Math.max(4, vol.footprintM2 * 0.035));
    pushCatalog('tu-odpady-zmieszane', mixedWasteTonnes);
  }

  // Część robót ziemnych
  if (params.scopeMode !== 'tylko_rozbiorka') {
    pushCatalog('rz-humus', vol.topsoilVolumeM3);

    if (vol.excavationVolumeM3 > 0) {
      const excId =
        params.soilCategory === 'I-II'
          ? 'rz-wykop-szeroko-1-2'
          : params.soilCategory === 'III'
          ? 'rz-wykop-szeroko-3'
          : 'rz-wykop-szeroko-4';
      pushCatalog(excId, vol.excavationVolumeM3);

      // Transport urobku (z korektą na odległość powyżej 15 km)
      const excessSoil = round2(Math.max(0, vol.excavationVolumeM3 - vol.backfillVolumeM3 * 0.45));
      if (excessSoil > 0) {
        const haulFactor = params.haulDistanceKm > 15 ? 1 + (params.haulDistanceKm - 15) * 0.03 : 1;
        const haulCat = catalog.find((c) => c.id === 'tu-wywoz-urobku');
        if (haulCat) {
          const r = haulCat.ratesBySource[settings.sourceId];
          items.push({
            id: `gen-tu-wywoz-${items.length + 1}`,
            catalogId: haulCat.id,
            knr: haulCat.knr,
            name: `${haulCat.name} (trasa ${params.haulDistanceKm} km)`,
            category: haulCat.category,
            unit: haulCat.unit,
            quantity: excessSoil,
            rateLabor: round2(r.labor * mult),
            rateMaterials: round2(r.materials * mult),
            rateEquipment: round2(r.equipment * mult * haulFactor),
            bdoCode: haulCat.bdoCode,
            isCustom: false,
          });
        }
        pushCatalog('tu-utylizacja-ziemia', round2(excessSoil * 1.65));
      }

      if (vol.backfillVolumeM3 > 0) {
        pushCatalog('rz-wymiana-gruntu', round2(vol.backfillVolumeM3 * 0.55));
        pushCatalog('rz-zasypka-zageszczenie', round2(vol.backfillVolumeM3 * 0.45));
      }
    }

    pushCatalog('rz-niwelacja-terenu', round2(vol.footprintM2 * 1.4));
    pushCatalog('rz-badanie-zageszczenia', Math.max(3, Math.round(vol.footprintM2 / 120)));

    if (params.groundwaterLowering) {
      const perimeter = round2(2 * (params.lengthM + params.widthM + params.overdigMarginM * 4));
      pushCatalog('oz-iglo-montaz', perimeter);
    }
    if (params.shoringRequired && params.excavationDepthM > 1.5) {
      const shoringArea = round2(
        2 * (params.lengthM + params.widthM + params.overdigMarginM * 4) * params.excavationDepthM
      );
      pushCatalog('oz-grodzice-larsen', shoringArea);
    }
  }

  return items;
}

export function formatPLN(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export interface CostStructureSlice {
  key: 'labor' | 'materials' | 'equipment';
  name: string;
  shortLabel: string;
  value: number;
  sharePct: number;
  color: string;
}

export function buildCostStructurePieData(summary: EstimateSummary): CostStructureSlice[] {
  const labor = round2(Math.max(0, summary.laborTotal));
  const materials = round2(Math.max(0, summary.materialsTotal));
  const equipment = round2(Math.max(0, summary.equipmentTotal));
  const total = round2(labor + materials + equipment);

  const share = (val: number) => (total > 0 ? round2((val / total) * 100) : 0);

  return [
    {
      key: 'labor',
      name: 'Robocizna (R)',
      shortLabel: 'Robocizna',
      value: labor,
      sharePct: share(labor),
      color: '#1e293b',
    },
    {
      key: 'materials',
      name: 'Materiały i opłaty BDO (M)',
      shortLabel: 'Materiały',
      value: materials,
      sharePct: share(materials),
      color: '#d97706',
    },
    {
      key: 'equipment',
      name: 'Sprzęt i transport (S)',
      shortLabel: 'Sprzęt',
      value: equipment,
      sharePct: share(equipment),
      color: '#0284c7',
    },
  ];
}

export interface UnitPriceMarketRow {
  sourceId: PriceSourceId;
  sourceName: string;
  shortName: string;
  quarter: string;
  laborUnit: number;
  materialsUnit: number;
  equipmentUnit: number;
  laborBar: number;
  materialsBar: number;
  equipmentBar: number;
  directUnitTotal: number;
  netUnitTotal: number;
  selectedPrice: number;
  deltaFromMinPln: number;
  deltaFromMinPct: number;
  deltaFromActivePln: number;
  deltaFromActivePct: number;
  isActiveSource: boolean;
  isCheapest: boolean;
  isMostExpensive: boolean;
}

export interface UnitPriceMarketComparison {
  catalogItem: CatalogWorkItem;
  rows: UnitPriceMarketRow[];
  cheapestSourceId: PriceSourceId;
  mostExpensiveSourceId: PriceSourceId;
  minPrice: number;
  maxPrice: number;
  spreadPln: number;
  spreadPct: number;
  activeQuantityInEstimate: number;
  potentialTotalSavingPln: number;
}

export function getOrderedComparableCatalogItems(
  items: EstimateLineItem[],
  catalog: CatalogWorkItem[]
): {
  inEstimate: Array<{ item: CatalogWorkItem; estimateQuantity: number }>;
  otherCatalog: CatalogWorkItem[];
} {
  const qtyByCatalogId = new Map<string, number>();
  for (const row of items) {
    if (row.catalogId) {
      qtyByCatalogId.set(
        row.catalogId,
        round2((qtyByCatalogId.get(row.catalogId) ?? 0) + Math.max(0, row.quantity))
      );
    }
  }

  const inEstimate: Array<{ item: CatalogWorkItem; estimateQuantity: number }> = [];
  const otherCatalog: CatalogWorkItem[] = [];

  for (const cat of catalog) {
    const qty = qtyByCatalogId.get(cat.id);
    if (qty !== undefined) {
      inEstimate.push({ item: cat, estimateQuantity: qty });
    } else {
      otherCatalog.push(cat);
    }
  }

  return { inEstimate, otherCatalog };
}

export function buildUnitPriceMarketComparison(params: {
  catalogItem: CatalogWorkItem;
  settings: EstimateSettings;
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  selectedSourceIds?: PriceSourceId[];
  priceMode?: 'net_with_markups' | 'direct_rms';
  activeEstimateItems?: EstimateLineItem[];
}): UnitPriceMarketComparison {
  const {
    catalogItem,
    settings,
    priceSources = PRICE_SOURCES,
    subregions = SUBREGIONS,
    selectedSourceIds,
    priceMode = 'net_with_markups',
    activeEstimateItems = [],
  } = params;

  const mult = subregions[settings.subregionId]?.multiplier ?? 1;
  const kpRate = Math.max(0, Number(settings.indirectCostsPct) || 0) / 100;
  const profitRate = Math.max(0, Number(settings.profitPct) || 0) / 100;
  const discountRate = Math.min(50, Math.max(0, Number(settings.discountPct) || 0)) / 100;
  const rsMarkupFactor = (1 + kpRate) * (1 + profitRate) * (1 - discountRate);
  const mDiscountFactor = 1 - discountRate;

  const allSourceIds = Object.keys(priceSources) as PriceSourceId[];
  const filteredIds =
    selectedSourceIds && selectedSourceIds.length > 0
      ? allSourceIds.filter((id) => selectedSourceIds.includes(id))
      : allSourceIds;
  const effectiveIds = filteredIds.length > 0 ? filteredIds : allSourceIds;

  const activeQuantityInEstimate = round2(
    activeEstimateItems
      .filter((i) => i.catalogId === catalogItem.id)
      .reduce((acc, i) => acc + Math.max(0, Number(i.quantity) || 0), 0)
  );

  const buildRow = (srcId: PriceSourceId) => {
    const meta = priceSources[srcId];
    const rate = catalogItem.ratesBySource[srcId];
    const laborUnit = round2((rate?.labor ?? 0) * mult);
    const materialsUnit = round2((rate?.materials ?? 0) * mult);
    const equipmentUnit = round2((rate?.equipment ?? 0) * mult);
    const directUnitTotal = round2(laborUnit + materialsUnit + equipmentUnit);

    const syntheticLine: EstimateLineItem = {
      id: `cmp-${catalogItem.id}-${srcId}`,
      catalogId: catalogItem.id,
      knr: catalogItem.knr,
      name: catalogItem.name,
      category: catalogItem.category,
      unit: catalogItem.unit,
      quantity: 1,
      rateLabor: laborUnit,
      rateMaterials: materialsUnit,
      rateEquipment: equipmentUnit,
    };

    const totals = calculateLineTotals(syntheticLine, {
      ...settings,
      sourceId: srcId,
    });
    const netUnitTotal = totals.unitNetRate;
    const selectedPrice =
      priceMode === 'direct_rms' ? directUnitTotal : netUnitTotal;

    const laborBar =
      priceMode === 'direct_rms' ? laborUnit : round2(laborUnit * rsMarkupFactor);
    const materialsBar =
      priceMode === 'direct_rms'
        ? materialsUnit
        : round2(materialsUnit * mDiscountFactor);
    const equipmentBar =
      priceMode === 'direct_rms'
        ? equipmentUnit
        : round2(Math.max(0, netUnitTotal - laborBar - materialsBar));

    return {
      sourceId: srcId,
      sourceName: meta.name,
      shortName: meta.shortName,
      quarter: meta.quarter,
      laborUnit,
      materialsUnit,
      equipmentUnit,
      laborBar,
      materialsBar,
      equipmentBar,
      directUnitTotal,
      netUnitTotal,
      selectedPrice,
    };
  };

  const rawRows = effectiveIds.map(buildRow);

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let cheapestSourceId = rawRows[0].sourceId;
  let mostExpensiveSourceId = rawRows[0].sourceId;

  for (const r of rawRows) {
    if (r.selectedPrice < minPrice) {
      minPrice = r.selectedPrice;
      cheapestSourceId = r.sourceId;
    }
    if (r.selectedPrice > maxPrice) {
      maxPrice = r.selectedPrice;
      mostExpensiveSourceId = r.sourceId;
    }
  }

  const activeRow =
    rawRows.find((r) => r.sourceId === settings.sourceId) ??
    (priceSources[settings.sourceId] && catalogItem.ratesBySource[settings.sourceId]
      ? buildRow(settings.sourceId)
      : undefined);
  const activeReferencePrice = activeRow?.selectedPrice ?? minPrice;

  const rows: UnitPriceMarketRow[] = rawRows.map((r) => {
    const deltaFromMinPln = round2(r.selectedPrice - minPrice);
    const deltaFromMinPct =
      minPrice > 0 ? round2((deltaFromMinPln / minPrice) * 100) : 0;
    const deltaFromActivePln = round2(r.selectedPrice - activeReferencePrice);
    const deltaFromActivePct =
      activeReferencePrice > 0
        ? round2((deltaFromActivePln / activeReferencePrice) * 100)
        : 0;

    return {
      ...r,
      deltaFromMinPln,
      deltaFromMinPct,
      deltaFromActivePln,
      deltaFromActivePct,
      isActiveSource: r.sourceId === settings.sourceId,
      isCheapest: r.sourceId === cheapestSourceId,
      isMostExpensive: r.sourceId === mostExpensiveSourceId,
    };
  });

  const spreadPln = round2(maxPrice - minPrice);
  const spreadPct = minPrice > 0 ? round2((spreadPln / minPrice) * 100) : 0;
  const potentialTotalSavingPln =
    activeQuantityInEstimate > 0
      ? round2(Math.max(0, activeReferencePrice - minPrice) * activeQuantityInEstimate)
      : 0;

  return {
    catalogItem,
    rows,
    cheapestSourceId,
    mostExpensiveSourceId,
    minPrice: round2(minPrice),
    maxPrice: round2(maxPrice),
    spreadPln,
    spreadPct,
    activeQuantityInEstimate,
    potentialTotalSavingPln,
  };
}

export interface CountyMarginChartBar {
  id: 'current_estimate' | CountyBenchmarkId;
  shortLabel: string;
  fullName: string;
  kind: 'estimate' | 'county';
  subregionId: SubregionId;
  marginPct: number;
  profitPln: number;
  selectedMetricValue: number;
  typicalRangeMinPct?: number;
  typicalRangeMaxPct?: number;
  marketNote?: string;
  deltaFromEstimatePp: number;
  deltaFromEstimatePln: number;
  isActiveSubregion: boolean;
}

export interface ProfitMarginCountyComparison {
  bars: CountyMarginChartBar[];
  projectedProfitPln: number;
  projectedMarginPct: number;
  executionCostPln: number;
  estimateNetTotal: number;
  selectedAvgMarginPct: number;
  selectedAvgProfitPln: number;
  deltaVsSelectedAvgPp: number;
  deltaVsSelectedAvgPln: number;
  highestCounty: CountyMarginChartBar;
  lowestCounty: CountyMarginChartBar;
  estimateRankAmongSelected: number;
  selectedCountiesCount: number;
}

export function buildProfitMarginCountyComparison(params: {
  summary: EstimateSummary;
  settings: EstimateSettings;
  counties?: CountyMarginBenchmark[];
  selectedCountyIds?: CountyBenchmarkId[];
  metricMode?: 'margin_pct' | 'profit_pln';
  projectName?: string;
}): ProfitMarginCountyComparison {
  const {
    summary,
    settings,
    counties = LOWER_SILESIA_COUNTY_MARGINS,
    selectedCountyIds,
    metricMode = 'margin_pct',
    projectName = 'Aktualny kosztorys',
  } = params;

  const executionCostPln = round2(summary.directTotal + summary.indirectCost);
  const projectedProfitPln = round2(summary.netTotal - executionCostPln);
  const projectedMarginPct =
    summary.netTotal > 0 ? round2((projectedProfitPln / summary.netTotal) * 100) : 0;

  const filteredCounties =
    selectedCountyIds && selectedCountyIds.length > 0
      ? counties.filter((c) => selectedCountyIds.includes(c.id))
      : counties;
  const effectiveCounties = filteredCounties.length > 0 ? filteredCounties : counties;

  const estimateBar: CountyMarginChartBar = {
    id: 'current_estimate',
    shortLabel: 'Aktualny kosztorys',
    fullName: projectName,
    kind: 'estimate',
    subregionId: settings.subregionId,
    marginPct: projectedMarginPct,
    profitPln: projectedProfitPln,
    selectedMetricValue:
      metricMode === 'profit_pln' ? projectedProfitPln : projectedMarginPct,
    marketNote: `Narzut Zysk ${settings.profitPct}% · Koszty pośrednie ${settings.indirectCostsPct}% · Rabat ${settings.discountPct}%`,
    deltaFromEstimatePp: 0,
    deltaFromEstimatePln: 0,
    isActiveSubregion: true,
  };

  const countyBars: CountyMarginChartBar[] = effectiveCounties.map((county) => {
    const equivalentProfitPln = round2(summary.netTotal * (county.avgMarginPct / 100));
    return {
      id: county.id,
      shortLabel: county.shortName,
      fullName: county.name,
      kind: 'county',
      subregionId: county.subregionId,
      marginPct: county.avgMarginPct,
      profitPln: equivalentProfitPln,
      selectedMetricValue:
        metricMode === 'profit_pln' ? equivalentProfitPln : county.avgMarginPct,
      typicalRangeMinPct: county.typicalRangeMinPct,
      typicalRangeMaxPct: county.typicalRangeMaxPct,
      marketNote: county.marketNote,
      deltaFromEstimatePp: round2(county.avgMarginPct - projectedMarginPct),
      deltaFromEstimatePln: round2(equivalentProfitPln - projectedProfitPln),
      isActiveSubregion: county.subregionId === settings.subregionId,
    };
  });

  const selectedAvgMarginPct = round2(
    countyBars.reduce((acc, c) => acc + c.marginPct, 0) / countyBars.length
  );
  const selectedAvgProfitPln = round2(
    summary.netTotal * (selectedAvgMarginPct / 100)
  );
  const deltaVsSelectedAvgPp = round2(projectedMarginPct - selectedAvgMarginPct);
  const deltaVsSelectedAvgPln = round2(projectedProfitPln - selectedAvgProfitPln);

  let highestCounty = countyBars[0];
  let lowestCounty = countyBars[0];
  for (const c of countyBars) {
    if (c.marginPct > highestCounty.marginPct) highestCounty = c;
    if (c.marginPct < lowestCounty.marginPct) lowestCounty = c;
  }

  const estimateRankAmongSelected =
    1 + countyBars.filter((c) => c.marginPct > projectedMarginPct).length;

  return {
    bars: [estimateBar, ...countyBars],
    projectedProfitPln,
    projectedMarginPct,
    executionCostPln,
    estimateNetTotal: summary.netTotal,
    selectedAvgMarginPct,
    selectedAvgProfitPln,
    deltaVsSelectedAvgPp,
    deltaVsSelectedAvgPln,
    highestCounty,
    lowestCounty,
    estimateRankAmongSelected,
    selectedCountiesCount: countyBars.length,
  };
}

export interface RegionalRateHistoryReport {
  subregionId: SubregionId;
  subregionName: string;
  sourceId: PriceSourceId;
  sourceShortName: string;
  driverNote: string;
  points: HistoricalRatePoint[];
  currentLaborRatePln: number;
  currentEquipmentRatePln: number;
  startLaborRatePln: number;
  startEquipmentRatePln: number;
  laborChange12mPct: number;
  equipmentChange12mPct: number;
  laborMinPln: number;
  laborMaxPln: number;
  equipmentMinPln: number;
  equipmentMaxPln: number;
  forecastQuarterLaborPct: number;
  forecastQuarterEquipmentPct: number;
  forecastEndLaborPln: number;
  forecastEndEquipmentPln: number;
  projectedEstimateImpactPln: number;
}

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

const FORECAST_3M_KEYS = ['2026-12', '2027-01', '2027-02'];
const FORECAST_3M_LABELS = ['gru 26*', 'sty 27*', 'lut 27*'];

export function buildRegionalRateHistory(params: {
  subregionId: SubregionId;
  sourceId: PriceSourceId;
  includeForecast?: boolean;
  estimateSummary?: EstimateSummary;
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  trendProfiles?: Record<SubregionId, RegionalRateTrendProfile>;
}): RegionalRateHistoryReport {
  const {
    subregionId,
    sourceId,
    includeForecast = false,
    estimateSummary,
    priceSources = PRICE_SOURCES,
    subregions = SUBREGIONS,
    trendProfiles = REGIONAL_12M_TREND_PROFILES,
  } = params;

  const subregion = subregions[subregionId] ?? subregions.wroclaw;
  const source = priceSources[sourceId] ?? priceSources.rynek_dolnoslaski;
  const profile = trendProfiles[subregionId] ?? trendProfiles.wroclaw;

  const currentLaborRatePln = round2(source.hourlyLaborAvg * subregion.multiplier);
  const currentEquipmentRatePln = round2(
    BASE_EQUIPMENT_HOURLY_RATE_PLN * source.equipmentIndex * subregion.multiplier
  );

  const laborSeries = profile.laborRelIndices.map((idx) =>
    round2(currentLaborRatePln * idx)
  );
  const equipmentSeries = profile.equipmentRelIndices.map((idx) =>
    round2(currentEquipmentRatePln * idx)
  );

  const startLaborRatePln = laborSeries[0] ?? currentLaborRatePln;
  const startEquipmentRatePln = equipmentSeries[0] ?? currentEquipmentRatePln;

  const laborChange12mPct =
    startLaborRatePln > 0
      ? round2(((currentLaborRatePln - startLaborRatePln) / startLaborRatePln) * 100)
      : 0;
  const equipmentChange12mPct =
    startEquipmentRatePln > 0
      ? round2(
          ((currentEquipmentRatePln - startEquipmentRatePln) / startEquipmentRatePln) * 100
        )
      : 0;

  // Prognoza liniowa na kolejne 3 miesiące na bazie trendu z 12 mies.
  const laborSlope = linearSlope(laborSeries);
  const equipmentSlope = linearSlope(equipmentSeries);
  const forecastLaborValues = [1, 2, 3].map((step) =>
    round2(Math.max(0, currentLaborRatePln + laborSlope * step))
  );
  const forecastEquipmentValues = [1, 2, 3].map((step) =>
    round2(Math.max(0, currentEquipmentRatePln + equipmentSlope * step))
  );

  const forecastEndLaborPln = forecastLaborValues[2] ?? currentLaborRatePln;
  const forecastEndEquipmentPln = forecastEquipmentValues[2] ?? currentEquipmentRatePln;

  const forecastQuarterLaborPct =
    currentLaborRatePln > 0
      ? round2(((forecastEndLaborPln - currentLaborRatePln) / currentLaborRatePln) * 100)
      : 0;
  const forecastQuarterEquipmentPct =
    currentEquipmentRatePln > 0
      ? round2(
          ((forecastEndEquipmentPln - currentEquipmentRatePln) / currentEquipmentRatePln) *
            100
        )
      : 0;

  const projectedEstimateImpactPln = estimateSummary
    ? round2(
        estimateSummary.laborTotal * (forecastQuarterLaborPct / 100) +
          estimateSummary.equipmentTotal * (forecastQuarterEquipmentPct / 100)
      )
    : 0;

  const points: HistoricalRatePoint[] = profile.months.map((monthKey, idx) => {
    const lRate = laborSeries[idx];
    const eRate = equipmentSeries[idx];
    const lIdx = startLaborRatePln > 0 ? round2((lRate / startLaborRatePln) * 100) : 100;
    const eIdx =
      startEquipmentRatePln > 0 ? round2((eRate / startEquipmentRatePln) * 100) : 100;
    const isBridge = includeForecast && idx === profile.months.length - 1;

    return {
      monthKey,
      monthLabel: profile.monthLabels[idx] ?? monthKey,
      isForecast: false,
      laborRatePln: lRate,
      equipmentRatePln: eRate,
      laborForecastPln: isBridge ? lRate : null,
      equipmentForecastPln: isBridge ? eRate : null,
      laborIndex: lIdx,
      equipmentIndex: eIdx,
      laborForecastIndex: isBridge ? lIdx : null,
      equipmentForecastIndex: isBridge ? eIdx : null,
    };
  });

  if (includeForecast) {
    FORECAST_3M_KEYS.forEach((monthKey, idx) => {
      const lRate = forecastLaborValues[idx];
      const eRate = forecastEquipmentValues[idx];
      const lIdx = startLaborRatePln > 0 ? round2((lRate / startLaborRatePln) * 100) : 100;
      const eIdx =
        startEquipmentRatePln > 0 ? round2((eRate / startEquipmentRatePln) * 100) : 100;

      points.push({
        monthKey,
        monthLabel: FORECAST_3M_LABELS[idx],
        isForecast: true,
        laborRatePln: null,
        equipmentRatePln: null,
        laborForecastPln: lRate,
        equipmentForecastPln: eRate,
        laborIndex: null,
        equipmentIndex: null,
        laborForecastIndex: lIdx,
        equipmentForecastIndex: eIdx,
      });
    });
  }

  return {
    subregionId,
    subregionName: subregion.name,
    sourceId,
    sourceShortName: source.shortName,
    driverNote: profile.driverNote,
    points,
    currentLaborRatePln,
    currentEquipmentRatePln,
    startLaborRatePln,
    startEquipmentRatePln,
    laborChange12mPct,
    equipmentChange12mPct,
    laborMinPln: Math.min(...laborSeries),
    laborMaxPln: Math.max(...laborSeries),
    equipmentMinPln: Math.min(...equipmentSeries),
    equipmentMaxPln: Math.max(...equipmentSeries),
    forecastQuarterLaborPct,
    forecastQuarterEquipmentPct,
    forecastEndLaborPln,
    forecastEndEquipmentPln,
    projectedEstimateImpactPln,
  };
}

const SEASONALITY_MONTH_SHORT = [
  'Sty',
  'Lut',
  'Mar',
  'Kwi',
  'Maj',
  'Cze',
  'Lip',
  'Sie',
  'Wrz',
  'Paź',
  'Lis',
  'Gru',
];

const SEASONALITY_MONTH_FULL = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

const SOIL_RISK_FACTORS: Record<
  SoilCategory,
  { rainMult: number; frostMult: number; advice: string }
> = {
  'I-II': {
    rainMult: 0.78,
    frostMult: 0.92,
    advice:
      'Grunty przepuszczalne (kat. I–II, piaski i żwiry): szybkie odprowadzanie opadów ogranicza przestoje, jednak podczas ulew wymagane jest zabezpieczenie skarp przed podmyciem.',
  },
  III: {
    rainMult: 1.18,
    frostMult: 1.1,
    advice:
      'Grunty spoiste (kat. III, gliny i iły): wysoka podatność na uplastycznienie po opadach — w miesiącach mokrych należy założyć rezerwę na pompowanie, doziarnienie lub wymianę podłoża.',
  },
  IV: {
    rainMult: 0.94,
    frostMult: 1.15,
    advice:
      'Grunty twarde i skaliste (kat. IV): stabilniejsze dno wykopu po deszczu, ale zamarzająca woda w spękaniach oraz roztopy wydłużają kucie młotem i odspajanie.',
  },
};

function round1(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;
}

function classifyEarthworkRisk(riskPct: number): {
  level: EarthworkRiskLevel;
  label: string;
} {
  if (riskPct < 22) return { level: 'niskie', label: 'Niskie' };
  if (riskPct < 36) return { level: 'umiarkowane', label: 'Umiarkowane' };
  if (riskPct < 52) return { level: 'wysokie', label: 'Wysokie' };
  return { level: 'krytyczne', label: 'Krytyczne' };
}

function getMonthReasonNote(monthIndex: number): string {
  if (monthIndex === 11 || monthIndex === 0 || monthIndex === 1) {
    return 'Przemarzanie gruntu, opady śniegu oraz krótszy dzień roboczy utrudniające zagęszczenie.';
  }
  if (monthIndex === 2) {
    return 'Wiosenne roztopy i podwyższone zwierciadło wód gruntowych na dnie wykopów.';
  }
  if (monthIndex >= 5 && monthIndex <= 7) {
    return 'Okresowe ulewy i burze konwekcyjne wymagające odwodnienia wykopów oraz przerw technologicznych.';
  }
  if (monthIndex === 9 || monthIndex === 10) {
    return 'Wolniejsze wysychanie gruntu po opadach przy niższej temperaturze i krótszym dniu.';
  }
  return 'Korzystne warunki gruntowo-wodne i stabilne tempo robót ziemnych oraz zagęszczania.';
}

const EARTHWORK_SENSITIVE_CATEGORIES: WorkCategory[] = [
  'roboty_ziemne',
  'odwodnienie_zabezpieczenia',
  'podbudowy_stabilizacja',
];

export function buildEarthworksSeasonalityReport(params: {
  subregionId: SubregionId;
  soilCategory?: SoilCategory;
  plannedMonthIndex?: number;
  estimateSummary?: EstimateSummary;
  subregions?: Record<SubregionId, SubregionMeta>;
  climateProfiles?: Record<SubregionId, RegionalClimateProfile>;
}): EarthworksSeasonalityReport {
  const {
    subregionId,
    soilCategory = 'III',
    plannedMonthIndex = 10,
    estimateSummary,
    subregions = SUBREGIONS,
    climateProfiles = REGIONAL_CLIMATE_PROFILES,
  } = params;

  const subregion = subregions[subregionId] ?? subregions.wroclaw;
  const climate = climateProfiles[subregionId] ?? climateProfiles.wroclaw;
  const soilFactor = SOIL_RISK_FACTORS[soilCategory] ?? SOIL_RISK_FACTORS.III;
  const normalizedMonthIdx = Math.min(
    11,
    Math.max(0, Math.round(Number.isFinite(plannedMonthIndex) ? plannedMonthIndex : 10))
  );

  const months: SeasonalEarthworkRiskPoint[] = SEASONALITY_MONTH_SHORT.map(
    (monthShort, idx) => {
      const precipitationMm = Math.max(0, climate.precipitationMm[idx] ?? 40);
      const frostThaw = Math.max(0, climate.frostThawIndices[idx] ?? 10);

      const rawRisk =
        (precipitationMm / 100) * 34 * soilFactor.rainMult +
        frostThaw * soilFactor.frostMult;
      const delayRiskPct = round1(Math.min(82, Math.max(8, rawRisk)));
      const { level, label } = classifyEarthworkRisk(delayRiskPct);
      const suggestedCostBufferPct = round1(2.0 + delayRiskPct * 0.22);
      const suggestedScheduleBufferDays = round1(
        Math.max(1.0, delayRiskPct * 0.14)
      );

      return {
        monthIndex: idx,
        monthShort,
        monthFull: SEASONALITY_MONTH_FULL[idx] ?? monthShort,
        precipitationMm,
        delayRiskPct,
        riskLevel: level,
        riskLabel: label,
        suggestedCostBufferPct,
        suggestedScheduleBufferDays,
        reasonNote: getMonthReasonNote(idx),
      };
    }
  );

  let peakRiskMonth = months[0];
  let optimalMonth = months[0];
  let annualPrecipitationMm = 0;
  let riskSum = 0;

  for (const m of months) {
    annualPrecipitationMm += m.precipitationMm;
    riskSum += m.delayRiskPct;
    if (m.delayRiskPct > peakRiskMonth.delayRiskPct) {
      peakRiskMonth = m;
    }
    if (m.delayRiskPct < optimalMonth.delayRiskPct) {
      optimalMonth = m;
    }
  }

  const selectedMonth = months[normalizedMonthIdx] ?? months[0];
  const avgDelayRiskPct = round1(riskSum / months.length);

  const earthworksSubsetNet = estimateSummary
    ? round2(
        estimateSummary.byCategory
          .filter((c) => EARTHWORK_SENSITIVE_CATEGORIES.includes(c.category))
          .reduce((acc, c) => acc + c.netTotal, 0)
      )
    : 0;
  const isEarthworksSubsetBase = earthworksSubsetNet > 0;
  const bufferBasePln = isEarthworksSubsetBase
    ? earthworksSubsetNet
    : round2(estimateSummary?.netTotal ?? 0);

  const calcBufferPln = (pct: number) => round2(bufferBasePln * (pct / 100));

  return {
    subregionId,
    subregionName: subregion.name,
    soilCategory,
    plannedMonthIndex: normalizedMonthIdx,
    months,
    selectedMonth,
    peakRiskMonth,
    optimalMonth,
    annualPrecipitationMm: Math.round(annualPrecipitationMm),
    avgDelayRiskPct,
    bufferBasePln,
    isEarthworksSubsetBase,
    selectedMonthBufferPln: calcBufferPln(selectedMonth.suggestedCostBufferPct),
    peakMonthBufferPln: calcBufferPln(peakRiskMonth.suggestedCostBufferPct),
    optimalMonthBufferPln: calcBufferPln(optimalMonth.suggestedCostBufferPct),
    soilAdvice: soilFactor.advice,
    regionalClimateNote: climate.climateNote,
  };
}

function computePearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return Math.round((num / den) * 1000) / 1000;
}

function classifyPearsonStrength(r: number): string {
  const abs = Math.abs(r);
  const dir = r >= 0 ? 'dodatnia' : 'ujemna';
  if (abs >= 0.85) return `Bardzo silna korelacja ${dir}`;
  if (abs >= 0.65) return `Silna korelacja ${dir}`;
  if (abs >= 0.4) return `Umiarkowana korelacja ${dir}`;
  return 'Słaba zależność statystyczna';
}

export function buildDieselEquipmentCorrelationReport(params: {
  settings: EstimateSettings;
  estimateSummary: EstimateSummary;
  benchmarkMode?: DieselPriceBenchmarkMode;
  dieselPrices?: DieselMonthlyPriceItem[];
  dieselDataOrigin?: 'google_search' | 'reference_baseline';
  scenarioDieselDeltaPln?: number;
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  trendProfiles?: Record<SubregionId, RegionalRateTrendProfile>;
}): DieselEquipmentCorrelationReport {
  const {
    settings,
    estimateSummary,
    benchmarkMode = 'retail_pl',
    dieselPrices,
    dieselDataOrigin = 'reference_baseline',
    scenarioDieselDeltaPln = 0,
    priceSources = PRICE_SOURCES,
    subregions = SUBREGIONS,
    trendProfiles = REGIONAL_12M_TREND_PROFILES,
  } = params;

  const subregion = subregions[settings.subregionId] ?? subregions.wroclaw;
  const source = priceSources[settings.sourceId] ?? priceSources.rynek_dolnoslaski;
  const profile = trendProfiles[settings.subregionId] ?? trendProfiles.wroclaw;

  const effectiveDiesel =
    dieselPrices && dieselPrices.length === 12
      ? dieselPrices
      : DEFAULT_DIESEL_BENCHMARK_SERIES[benchmarkMode];

  const currentEquipmentRatePln = round2(
    BASE_EQUIPMENT_HOURLY_RATE_PLN * source.equipmentIndex * subregion.multiplier
  );
  const activeEstimateEquipmentPln = round2(Math.max(0, estimateSummary.equipmentTotal));

  const rawDieselValues = effectiveDiesel.map((d) => d.pricePlnPerL);
  const rawEquipValues = profile.equipmentRelIndices.map((idx) =>
    round2(currentEquipmentRatePln * idx)
  );

  const startDieselPlnPerL = rawDieselValues[0] ?? 6.0;
  const startEquipRate = rawEquipValues[0] ?? currentEquipmentRatePln;

  const points: DieselHistoryPoint[] = effectiveDiesel.map((d, idx) => {
    const equipRate = rawEquipValues[idx] ?? currentEquipmentRatePln;
    const relIdx = profile.equipmentRelIndices[idx] ?? 1;
    const estimateEquipPln = round2(activeEstimateEquipmentPln * relIdx);
    const dieselIndex =
      startDieselPlnPerL > 0 ? round2((d.pricePlnPerL / startDieselPlnPerL) * 100) : 100;
    const equipmentIndex =
      startEquipRate > 0 ? round2((equipRate / startEquipRate) * 100) : 100;

    return {
      monthKey: d.monthKey,
      monthLabel: profile.monthLabels[idx] ?? d.monthLabel,
      dieselPlnPerL: round2(d.pricePlnPerL),
      equipmentRatePln: equipRate,
      estimateEquipmentCostPln: estimateEquipPln,
      dieselIndex,
      equipmentIndex,
    };
  });

  const dieselSeries = points.map((p) => p.dieselPlnPerL);
  const equipSeries = points.map((p) => p.equipmentRatePln);
  const pearsonCorrelation = computePearsonCorrelation(dieselSeries, equipSeries);
  const correlationStrengthLabel = classifyPearsonStrength(pearsonCorrelation);

  const currentDieselPlnPerL = dieselSeries[dieselSeries.length - 1] ?? startDieselPlnPerL;
  const minDieselPlnPerL = Math.min(...dieselSeries);
  const maxDieselPlnPerL = Math.max(...dieselSeries);

  const dieselChange12mPct =
    startDieselPlnPerL > 0
      ? round2(((currentDieselPlnPerL - startDieselPlnPerL) / startDieselPlnPerL) * 100)
      : 0;
  const equipmentChange12mPct =
    startEquipRate > 0
      ? round2(((currentEquipmentRatePln - startEquipRate) / startEquipRate) * 100)
      : 0;

  // Udział kosztu paliwa w motogodzinie ciężkiego sprzętu budowlanego (ok. 28–42%, estymowany z relacji zmian 12M)
  const rawElasticity =
    Math.abs(dieselChange12mPct) >= 0.8
      ? Math.abs(equipmentChange12mPct / dieselChange12mPct) * 28
      : 34;
  const fuelPassThroughElasticityPct = round1(Math.min(44, Math.max(28, rawElasticity)));

  const clampedDelta = Math.max(-2.0, Math.min(3.0, scenarioDieselDeltaPln));
  const scenarioDieselPlnPerL = round2(Math.max(1.0, currentDieselPlnPerL + clampedDelta));
  const dieselShiftPct =
    currentDieselPlnPerL > 0 ? (scenarioDieselPlnPerL - currentDieselPlnPerL) / currentDieselPlnPerL : 0;
  const scenarioEquipmentDeltaPct = round2(
    dieselShiftPct * (fuelPassThroughElasticityPct / 100) * 100
  );
  const scenarioEquipmentRatePln = round2(
    currentEquipmentRatePln * (1 + scenarioEquipmentDeltaPct / 100)
  );
  const scenarioEstimateEquipmentDeltaPln = round2(
    activeEstimateEquipmentPln * (scenarioEquipmentDeltaPct / 100)
  );

  const kpRate = Math.max(0, Number(settings.indirectCostsPct) || 0) / 100;
  const profitRate = Math.max(0, Number(settings.profitPct) || 0) / 100;
  const discountRate = Math.min(50, Math.max(0, Number(settings.discountPct) || 0)) / 100;
  const netFactor = (1 + kpRate) * (1 + profitRate) * (1 - discountRate);
  const scenarioEstimateNetDeltaPln = round2(scenarioEstimateEquipmentDeltaPln * netFactor);

  const dieselUnitLabel = benchmarkMode === 'wholesale_orlen' ? 'zł/l netto (hurt)' : 'zł/l brutto';
  const signDelta = clampedDelta > 0 ? '+' : '';
  const signEquip = scenarioEstimateNetDeltaPln > 0 ? '+' : '';
  const negotiationTalkingPoint = [
    `Analiza 12-miesięczna (${subregion.name}, baza ${source.shortName}) wykazuje współczynnik korelacji Pearsona r = ${formatNumber(
      pearsonCorrelation,
      2
    )} (${correlationStrengthLabel.toLowerCase()}) między ceną oleju napędowego (${formatNumber(
      currentDieselPlnPerL,
      2
    )} ${dieselUnitLabel}, zmiana 12M: ${dieselChange12mPct > 0 ? '+' : ''}${formatNumber(
      dieselChange12mPct,
      1
    )}%) a stawką pracy maszyn (${formatNumber(currentEquipmentRatePln, 2)} zł/m-g, zmiana 12M: ${
      equipmentChange12mPct > 0 ? '+' : ''
    }${formatNumber(equipmentChange12mPct, 1)}%).`,
    activeEstimateEquipmentPln > 0
      ? `Przy udziale paliwa w koszcie motogodziny ok. ${formatNumber(
          fuelPassThroughElasticityPct,
          0
        )}% oraz wartości sprzętu w kosztorysie ${formatPLN(activeEstimateEquipmentPln)}${
          clampedDelta !== 0
            ? `, zmiana ceny ON o ${signDelta}${formatNumber(
                clampedDelta,
                2
              )} zł/l uzasadnia korektę wartości netto oferty o ${signEquip}${formatPLN(
                scenarioEstimateNetDeltaPln
              )}.`
            : ', każda zmiana cen paliwa o +0,50 zł/l wymaga odpowiedniej waloryzacji klauzulą paliwową.'
        }`
      : 'Dodaj pozycje sprzętowe do kosztorysu, aby przeliczyć wpływ wahań ceny ON w PLN.',
  ].join(' ');

  return {
    subregionId: settings.subregionId,
    subregionName: subregion.name,
    sourceId: settings.sourceId,
    sourceShortName: source.shortName,
    benchmarkMode,
    dieselDataOrigin,
    points,
    pearsonCorrelation,
    correlationStrengthLabel,
    fuelPassThroughElasticityPct,
    currentDieselPlnPerL,
    startDieselPlnPerL,
    minDieselPlnPerL,
    maxDieselPlnPerL,
    dieselChange12mPct,
    currentEquipmentRatePln,
    equipmentChange12mPct,
    activeEstimateEquipmentPln,
    scenarioDieselDeltaPln: clampedDelta,
    scenarioDieselPlnPerL,
    scenarioEquipmentRatePln,
    scenarioEquipmentDeltaPct,
    scenarioEstimateEquipmentDeltaPln,
    scenarioEstimateNetDeltaPln,
    negotiationTalkingPoint,
  };
}

function buildCompactItemLabel(lp: number, knr: string | undefined, name: string): string {
  const cleanKnr = (knr ?? '')
    .replace(/^KNR-W\s+/i, '')
    .replace(/^KNR\s+/i, '')
    .replace(/^KNNR\s+/i, '')
    .trim();
  if (cleanKnr && cleanKnr !== 'WŁASNA' && cleanKnr.length <= 14) {
    return `Poz. ${lp} (${cleanKnr})`;
  }
  const shortWords = (name ?? '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
  const truncated =
    shortWords.length > 16 ? `${shortWords.slice(0, 15)}…` : shortWords;
  return `Poz. ${lp} · ${truncated || 'Pozycja'}`;
}

export function buildItemProfitabilityCountyReport(params: {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  counties?: CountyMarginBenchmark[];
  selectedCountyIds?: CountyBenchmarkId[];
  benchmarkMode?: 'selected_avg' | 'single_county';
  referenceCountyId?: CountyBenchmarkId;
  metricMode?: 'margin_pct' | 'profit_pln';
  categoryFilter?: WorkCategory | 'all';
  sortBy?: ItemProfitabilitySortMode;
}): ItemProfitabilityCountyReport {
  const {
    items,
    settings,
    counties = LOWER_SILESIA_COUNTY_MARGINS,
    selectedCountyIds,
    benchmarkMode = 'selected_avg',
    referenceCountyId,
    metricMode = 'margin_pct',
    categoryFilter = 'all',
    sortBy = 'estimate_order',
  } = params;

  const filteredCounties =
    selectedCountyIds && selectedCountyIds.length > 0
      ? counties.filter((c) => selectedCountyIds.includes(c.id))
      : counties;
  const effectiveCounties =
    filteredCounties.length > 0 ? filteredCounties : counties;

  const avgCountyMarginPct = round2(
    effectiveCounties.reduce((acc, c) => acc + c.avgMarginPct, 0) /
      Math.max(1, effectiveCounties.length)
  );
  const minCountyMarginPct = Math.min(
    ...effectiveCounties.map((c) => c.avgMarginPct)
  );
  const maxCountyMarginPct = Math.max(
    ...effectiveCounties.map((c) => c.avgMarginPct)
  );

  const chosenReferenceCounty =
    benchmarkMode === 'single_county'
      ? effectiveCounties.find((c) => c.id === referenceCountyId) ??
        effectiveCounties.find((c) => c.subregionId === settings.subregionId) ??
        effectiveCounties[0]
      : null;

  const activeBenchmarkMode: 'selected_avg' | 'single_county' =
    chosenReferenceCounty ? 'single_county' : 'selected_avg';

  const benchmarkMarginPct = chosenReferenceCounty
    ? chosenReferenceCounty.avgMarginPct
    : avgCountyMarginPct;
  const benchmarkLabel = chosenReferenceCounty
    ? `${chosenReferenceCounty.shortName} (${chosenReferenceCounty.avgMarginPct.toFixed(1).replace('.', ',')}%)`
    : `Średnia ${effectiveCounties.length} powiatów (${avgCountyMarginPct.toFixed(1).replace('.', ',')}%)`;

  const activeItemsWithIndex = items
    .map((item, idx) => ({ item, lp: idx + 1 }))
    .filter(({ item }) => item.quantity > 0);

  const categoryFiltered =
    categoryFilter === 'all'
      ? activeItemsWithIndex
      : activeItemsWithIndex.filter(
          ({ item }) => item.category === categoryFilter
        );

  const rawBars: ItemProfitabilityBar[] = categoryFiltered.map(
    ({ item, lp }) => {
      const totals = calculateLineTotals(item, settings);
      const executionCostPln = round2(totals.directTotal + totals.indirectCost);
      const profitPln = round2(totals.netTotal - executionCostPln);
      const marginPct =
        totals.netTotal > 0 ? round2((profitPln / totals.netTotal) * 100) : 0;
      const materialsSharePct =
        totals.directTotal > 0
          ? round2((totals.materialsTotal / totals.directTotal) * 100)
          : 0;

      const benchmarkProfitPln = round2(
        totals.netTotal * (benchmarkMarginPct / 100)
      );
      const deltaVsBenchmarkPp = round2(marginPct - benchmarkMarginPct);
      const deltaVsBenchmarkPln = round2(profitPln - benchmarkProfitPln);

      const status: ItemProfitabilityBar['status'] =
        marginPct <= 0
          ? 'unprofitable'
          : marginPct >= benchmarkMarginPct
          ? 'above_market'
          : 'below_market';

      const countyDeltas: ItemProfitabilityCountyDelta[] = effectiveCounties.map(
        (county) => {
          const equivalentProfitPln = round2(
            totals.netTotal * (county.avgMarginPct / 100)
          );
          return {
            countyId: county.id,
            countyShortName: county.shortName,
            countyFullName: county.name,
            countyMarginPct: county.avgMarginPct,
            equivalentProfitPln,
            deltaPp: round2(marginPct - county.avgMarginPct),
            deltaPln: round2(profitPln - equivalentProfitPln),
          };
        }
      );

      return {
        id: item.id,
        lp,
        knrCode: item.knr || 'WŁASNA',
        shortLabel: buildCompactItemLabel(lp, item.knr, item.name),
        fullName: item.name,
        category: item.category,
        categoryLabel: CATEGORY_LABELS[item.category],
        quantity: item.quantity,
        unit: item.unit,
        netTotal: totals.netTotal,
        executionCostPln,
        profitPln,
        marginPct,
        materialsSharePct,
        selectedMetricValue:
          metricMode === 'profit_pln' ? profitPln : marginPct,
        benchmarkMetricValue:
          metricMode === 'profit_pln' ? benchmarkProfitPln : benchmarkMarginPct,
        benchmarkMarginPct,
        benchmarkProfitPln,
        deltaVsBenchmarkPp,
        deltaVsBenchmarkPln,
        status,
        countyDeltas,
      };
    }
  );

  const bars = [...rawBars].sort((a, b) => {
    switch (sortBy) {
      case 'margin_asc':
        return a.marginPct - b.marginPct || a.lp - b.lp;
      case 'margin_desc':
        return b.marginPct - a.marginPct || a.lp - b.lp;
      case 'profit_desc':
        return b.profitPln - a.profitPln || a.lp - b.lp;
      default:
        return a.lp - b.lp;
    }
  });

  const totalNet = bars.reduce((acc, b) => acc + b.netTotal, 0);
  const totalProfit = bars.reduce((acc, b) => acc + b.profitPln, 0);
  const weightedEstimateMarginPct =
    totalNet > 0 ? round2((totalProfit / totalNet) * 100) : 0;
  const avgItemMarginPct =
    bars.length > 0
      ? round2(bars.reduce((acc, b) => acc + b.marginPct, 0) / bars.length)
      : 0;

  let mostProfitableItem: ItemProfitabilityBar | null = null;
  let lowestMarginItem: ItemProfitabilityBar | null = null;
  for (const bar of bars) {
    if (!mostProfitableItem || bar.marginPct > mostProfitableItem.marginPct) {
      mostProfitableItem = bar;
    }
    if (!lowestMarginItem || bar.marginPct < lowestMarginItem.marginPct) {
      lowestMarginItem = bar;
    }
  }

  return {
    bars,
    totalEstimateItemsCount: activeItemsWithIndex.length,
    filteredItemsCount: bars.length,
    benchmarkMode: activeBenchmarkMode,
    benchmarkLabel,
    benchmarkMarginPct,
    selectedCountiesCount: effectiveCounties.length,
    selectedCountiesAvgMarginPct: avgCountyMarginPct,
    selectedCountiesMinMarginPct: round2(minCountyMarginPct),
    selectedCountiesMaxMarginPct: round2(maxCountyMarginPct),
    avgItemMarginPct,
    weightedEstimateMarginPct,
    aboveBenchmarkCount: bars.filter((b) => b.status === 'above_market').length,
    belowBenchmarkCount: bars.filter((b) => b.status === 'below_market').length,
    unprofitableCount: bars.filter((b) => b.status === 'unprofitable').length,
    mostProfitableItem,
    lowestMarginItem,
  };
}





