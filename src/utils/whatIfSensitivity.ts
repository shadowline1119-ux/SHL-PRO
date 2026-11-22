import {
  EstimateLineItem,
  EstimateSettings,
  WhatIfCategoryImpact,
  WhatIfComponentDelta,
  WhatIfSensitivityReport,
  WhatIfSimulationParams,
} from '../types/estimator';
import { calculateEstimateSummary } from './calculations';

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export interface WhatIfPresetDefinition {
  id: string;
  label: string;
  description: string;
  buildParams: (settings: EstimateSettings) => WhatIfSimulationParams;
}

export function createDefaultWhatIfParams(
  settings: EstimateSettings
): WhatIfSimulationParams {
  return {
    equipmentEfficiencyDeltaPct: 0,
    laborEfficiencyDeltaPct: 0,
    materialsPriceDeltaPct: 0,
    indirectCostsPct: settings.indirectCostsPct,
    profitPct: settings.profitPct,
    discountPct: settings.discountPct,
  };
}

export const WHAT_IF_PRESETS: WhatIfPresetDefinition[] = [
  {
    id: 'equip_plus_10',
    label: 'Wydajność sprzętu +10%',
    description: 'Szybsza realizacja wykopów i załadunku (-9,1% czasu pracy maszyn).',
    buildParams: (s) => ({
      ...createDefaultWhatIfParams(s),
      equipmentEfficiencyDeltaPct: 10,
    }),
  },
  {
    id: 'crew_and_equip_plus_15',
    label: 'Optymalizacja S +15% i M -8%',
    description: 'Lepsza logistyka maszyn (+15% wydajności) i tańsze kruszywo (-8%).',
    buildParams: (s) => ({
      ...createDefaultWhatIfParams(s),
      equipmentEfficiencyDeltaPct: 15,
      materialsPriceDeltaPct: -8,
    }),
  },
  {
    id: 'hard_soil_downtime',
    label: 'Trudne warunki (-15% S, -10% R)',
    description: 'Spadek wydajności koparek (-15%) i robocizny (-10%) w mokrym gruncie.',
    buildParams: (s) => ({
      ...createDefaultWhatIfParams(s),
      equipmentEfficiencyDeltaPct: -15,
      laborEfficiencyDeltaPct: -10,
    }),
  },
  {
    id: 'competitive_tender_bid',
    label: 'Agresywna oferta przetargowa',
    description: 'Zysk 5%, Rabat 3% oraz +10% wydajności sprzętu pod przetarg BZP.',
    buildParams: (s) => ({
      ...createDefaultWhatIfParams(s),
      equipmentEfficiencyDeltaPct: 10,
      profitPct: 5,
      discountPct: 3,
    }),
  },
];

/**
 * Przelicza wpływ szybkiej zmiany parametrów (wydajność sprzętu/robocizny, ceny materiałów,
 * narzuty Kp/Zysk/Rabat) na końcową wartość netto i brutto oferty przy użyciu głównego
 * silnika kalkulacji kosztorysowej (`calculateEstimateSummary`).
 *
 * Wydajność pracy (+p%): większa wydajność skraca potrzebny czas pracy na jednostkę robót,
 * dlatego jednostkowy koszt robocizny lub sprzętu skaluje się mnożnikiem `1 / (1 + p / 100)`.
 */
export function calculateWhatIfSensitivity(
  items: EstimateLineItem[],
  settings: EstimateSettings,
  rawParams: WhatIfSimulationParams
): WhatIfSensitivityReport {
  const equipmentEfficiencyDeltaPct = clamp(
    rawParams.equipmentEfficiencyDeltaPct,
    -35,
    60
  );
  const laborEfficiencyDeltaPct = clamp(rawParams.laborEfficiencyDeltaPct, -35, 60);
  const materialsPriceDeltaPct = clamp(rawParams.materialsPriceDeltaPct, -40, 60);
  const indirectCostsPct = clamp(rawParams.indirectCostsPct, 0, 40);
  const profitPct = clamp(rawParams.profitPct, 0, 40);
  const discountPct = clamp(rawParams.discountPct, 0, 50);

  const equipmentCostMultiplier = 1 / (1 + equipmentEfficiencyDeltaPct / 100);
  const laborCostMultiplier = 1 / (1 + laborEfficiencyDeltaPct / 100);
  const materialsCostMultiplier = 1 + materialsPriceDeltaPct / 100;

  const baselineSummary = calculateEstimateSummary(items, settings);

  const simulatedItems: EstimateLineItem[] = items.map((item) => ({
    ...item,
    rateLabor: round2(Math.max(0, item.rateLabor) * laborCostMultiplier),
    rateMaterials: round2(Math.max(0, item.rateMaterials) * materialsCostMultiplier),
    rateEquipment: round2(Math.max(0, item.rateEquipment) * equipmentCostMultiplier),
  }));

  const simulatedSettings: EstimateSettings = {
    ...settings,
    indirectCostsPct,
    profitPct,
    discountPct,
  };

  const simulatedSummary = calculateEstimateSummary(simulatedItems, simulatedSettings);

  const baselineNetTotal = baselineSummary.netTotal;
  const simulatedNetTotal = simulatedSummary.netTotal;
  const deltaNetPln = round2(simulatedNetTotal - baselineNetTotal);
  const deltaNetPct =
    baselineNetTotal > 0 ? round2((deltaNetPln / baselineNetTotal) * 100) : 0;

  const baselineGrossTotal = baselineSummary.grossTotal;
  const simulatedGrossTotal = simulatedSummary.grossTotal;
  const deltaGrossPln = round2(simulatedGrossTotal - baselineGrossTotal);

  const baselineRealProfitPln = round2(
    baselineNetTotal - (baselineSummary.directTotal + baselineSummary.indirectCost)
  );
  const simulatedRealProfitPln = round2(
    simulatedNetTotal - (simulatedSummary.directTotal + simulatedSummary.indirectCost)
  );
  const baselineMarginPct =
    baselineNetTotal > 0
      ? round2((baselineRealProfitPln / baselineNetTotal) * 100)
      : 0;
  const simulatedMarginPct =
    simulatedNetTotal > 0
      ? round2((simulatedRealProfitPln / simulatedNetTotal) * 100)
      : 0;
  const deltaMarginPp = round2(simulatedMarginPct - baselineMarginPct);

  const buildDelta = (
    key: WhatIfComponentDelta['key'],
    label: string,
    baseVal: number,
    simVal: number
  ): WhatIfComponentDelta => {
    const dPln = round2(simVal - baseVal);
    const dPct = baseVal > 0 ? round2((dPln / baseVal) * 100) : 0;
    return {
      key,
      label,
      baselinePln: round2(baseVal),
      simulatedPln: round2(simVal),
      deltaPln: dPln,
      deltaPct: dPct,
    };
  };

  const baselineMarkupsPln = round2(
    baselineSummary.indirectCost + baselineSummary.profit
  );
  const simulatedMarkupsPln = round2(
    simulatedSummary.indirectCost + simulatedSummary.profit
  );

  const componentDeltas: WhatIfComponentDelta[] = [
    buildDelta(
      'equipment',
      'Sprzęt (S)',
      baselineSummary.equipmentTotal,
      simulatedSummary.equipmentTotal
    ),
    buildDelta(
      'labor',
      'Robocizna (R)',
      baselineSummary.laborTotal,
      simulatedSummary.laborTotal
    ),
    buildDelta(
      'materials',
      'Materiały / BDO (M)',
      baselineSummary.materialsTotal,
      simulatedSummary.materialsTotal
    ),
    buildDelta('markups', 'Narzuty (Kp + Zysk)', baselineMarkupsPln, simulatedMarkupsPln),
    buildDelta(
      'discount',
      'Rabat handlowy',
      baselineSummary.discountAmount,
      simulatedSummary.discountAmount
    ),
  ];

  const simByCategoryMap = new Map(
    simulatedSummary.byCategory.map((c) => [c.category, c])
  );
  const categoryImpacts: WhatIfCategoryImpact[] = baselineSummary.byCategory.map(
    (baseCat) => {
      const simCat = simByCategoryMap.get(baseCat.category);
      const simNet = simCat ? simCat.netTotal : 0;
      const dPln = round2(simNet - baseCat.netTotal);
      const dPct =
        baseCat.netTotal > 0 ? round2((dPln / baseCat.netTotal) * 100) : 0;
      return {
        category: baseCat.category,
        label: baseCat.label,
        baselineNetPln: baseCat.netTotal,
        simulatedNetPln: simNet,
        deltaNetPln: dPln,
        deltaNetPct: dPct,
      };
    }
  );

  const hasMarkupChange =
    round2(indirectCostsPct) !== round2(settings.indirectCostsPct) ||
    round2(profitPct) !== round2(settings.profitPct) ||
    round2(discountPct) !== round2(settings.discountPct);

  const hasAnyChange =
    round2(equipmentEfficiencyDeltaPct) !== 0 ||
    round2(laborEfficiencyDeltaPct) !== 0 ||
    round2(materialsPriceDeltaPct) !== 0 ||
    hasMarkupChange;

  return {
    baselineSummary,
    simulatedSummary,
    baselineNetTotal,
    simulatedNetTotal,
    deltaNetPln,
    deltaNetPct,
    baselineGrossTotal,
    simulatedGrossTotal,
    deltaGrossPln,
    baselineMarginPct,
    simulatedMarginPct,
    deltaMarginPp,
    equipmentCostMultiplier: Math.round(equipmentCostMultiplier * 10000) / 10000,
    laborCostMultiplier: Math.round(laborCostMultiplier * 10000) / 10000,
    materialsCostMultiplier: Math.round(materialsCostMultiplier * 10000) / 10000,
    hasAnyChange,
    hasMarkupChange,
    componentDeltas,
    categoryImpacts,
  };
}
