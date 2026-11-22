import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_STRUCTURE_PARAMS,
  WORK_CATALOG,
} from '../data/dolnoslaskieRates';
import {
  applyPriceSourceToItems,
  buildCostStructurePieData,
  buildDieselEquipmentCorrelationReport,
  buildEarthworksSeasonalityReport,
  buildItemProfitabilityCountyReport,
  buildProfitMarginCountyComparison,
  buildRegionalRateHistory,
  buildUnitPriceMarketComparison,
  calculateEstimateSummary,
  calculateLineTotals,
  compareSourcesForEstimate,
  computeStructureVolumes,
  generateItemsFromStructureParams,
  getOrderedComparableCatalogItems,
} from './calculations';
import { EstimateLineItem } from '../types/estimator';

test('calculateLineTotals computes R, M, S, Kp, Z, discount, and VAT accurately', () => {
  const item: EstimateLineItem = {
    id: 'test-1',
    knr: 'KNR 2-01',
    name: 'Wykop testowy',
    category: 'roboty_ziemne',
    unit: 'm³',
    quantity: 100,
    rateLabor: 10,
    rateMaterials: 20,
    rateEquipment: 30,
  };

  const totals = calculateLineTotals(item, {
    ...DEFAULT_ESTIMATE_SETTINGS,
    indirectCostsPct: 10,
    profitPct: 10,
    vatRate: 23,
    discountPct: 0,
  });

  // R = 1000, M = 2000, S = 3000 => direct = 6000
  // Kp = 10% of (R+S = 4000) = 400
  // Z = 10% of (4000 + 400) = 440
  // Net = 6000 + 400 + 440 = 6840
  assert.equal(totals.laborTotal, 1000);
  assert.equal(totals.materialsTotal, 2000);
  assert.equal(totals.equipmentTotal, 3000);
  assert.equal(totals.directTotal, 6000);
  assert.equal(totals.indirectCost, 400);
  assert.equal(totals.profit, 440);
  assert.equal(totals.netTotal, 6840);
  assert.equal(totals.vatAmount, 1573.2);
  assert.equal(totals.grossTotal, 8413.2);
});

test('calculateEstimateSummary aggregates BDO codes and category shares totaling 100%', () => {
  const items: EstimateLineItem[] = [
    {
      id: '1',
      knr: 'KNR 2-01',
      name: 'Wykop',
      category: 'roboty_ziemne',
      unit: 'm³',
      quantity: 50,
      rateLabor: 10,
      rateMaterials: 0,
      rateEquipment: 30,
    },
    {
      id: '2',
      knr: 'KNR 4-04',
      name: 'Gruz betonowy',
      category: 'transport_utylizacja',
      unit: 't',
      quantity: 20,
      rateLabor: 5,
      rateMaterials: 40,
      rateEquipment: 15,
      bdoCode: '17 01 01',
    },
  ];

  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);
  assert.equal(summary.byCategory.length, 2);
  assert.equal(summary.bdoSummary.length, 1);
  assert.equal(summary.bdoSummary[0].code, '17 01 01');
  assert.equal(summary.bdoSummary[0].quantity, 20);
  const sumShares =
    summary.laborSharePct + summary.materialsSharePct + summary.equipmentSharePct;
  assert.ok(Math.abs(sumShares - 100) < 0.05);
});

test('computeStructureVolumes and generateItemsFromStructureParams produce valid earthwork & demolition items', () => {
  const vol = computeStructureVolumes(DEFAULT_STRUCTURE_PARAMS);
  assert.equal(vol.footprintM2, 336);
  assert.equal(vol.grossVolumeM3, 2184);
  assert.ok(vol.excavationVolumeM3 > 500);
  assert.ok(vol.brickRubbleTonnes > 100);

  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  assert.ok(items.length >= 8);
  assert.ok(items.some((i) => i.catalogId === 'rw-budynek-murowany'));
  assert.ok(items.some((i) => i.catalogId === 'rz-wykop-szeroko-3'));
});

test('applyPriceSourceToItems and compareSourcesForEstimate match active source at 0% delta', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const switched = applyPriceSourceToItems(
    items,
    WORK_CATALOG,
    'sekocenbud',
    'wroclaw'
  );
  const sekSettings = { ...DEFAULT_ESTIMATE_SETTINGS, sourceId: 'sekocenbud' as const };
  const comparison = compareSourcesForEstimate(switched, WORK_CATALOG, sekSettings);

  assert.equal(comparison.length, 5);
  const sekRow = comparison.find((r) => r.sourceId === 'sekocenbud');
  assert.ok(sekRow);
  assert.equal(sekRow.deltaFromActivePln, 0);
  assert.equal(sekRow.deltaFromActivePct, 0);
});

test('buildCostStructurePieData returns R, M, S slices with shares and handles zero totals', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);
  const slices = buildCostStructurePieData(summary);

  assert.equal(slices.length, 3);
  assert.deepEqual(
    slices.map((s) => s.key),
    ['labor', 'materials', 'equipment']
  );
  const totalVal = slices.reduce((acc, s) => acc + s.value, 0);
  assert.ok(Math.abs(totalVal - summary.directTotal) < 0.05);
  const totalPct = slices.reduce((acc, s) => acc + s.sharePct, 0);
  assert.ok(Math.abs(totalPct - 100) < 0.1);

  const emptySummary = calculateEstimateSummary([], DEFAULT_ESTIMATE_SETTINGS);
  const emptySlices = buildCostStructurePieData(emptySummary);
  assert.ok(emptySlices.every((s) => s.value === 0 && s.sharePct === 0));
});

test('buildUnitPriceMarketComparison compares ORGBUD vs Sekocenbud with consistent stacked R/M/S bars and savings', () => {
  const targetCat = WORK_CATALOG.find((c) => c.id === 'rw-budynek-murowany')!;
  assert.ok(targetCat);

  const estimateItems = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );

  const ordered = getOrderedComparableCatalogItems(estimateItems, WORK_CATALOG);
  assert.ok(ordered.inEstimate.some((x) => x.item.id === 'rw-budynek-murowany'));

  const cmp = buildUnitPriceMarketComparison({
    catalogItem: targetCat,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    selectedSourceIds: ['orgbud', 'sekocenbud'],
    priceMode: 'net_with_markups',
    activeEstimateItems: estimateItems,
  });

  assert.equal(cmp.rows.length, 2);
  assert.deepEqual(
    cmp.rows.map((r) => r.sourceId),
    ['sekocenbud', 'orgbud']
  );
  for (const row of cmp.rows) {
    const barSum = Math.round((row.laborBar + row.materialsBar + row.equipmentBar) * 100) / 100;
    assert.ok(Math.abs(barSum - row.selectedPrice) < 0.03);
  }
  assert.ok(cmp.minPrice > 0);
  assert.ok(cmp.maxPrice >= cmp.minPrice);
  assert.ok(cmp.activeQuantityInEstimate > 0);
  assert.ok(cmp.potentialTotalSavingPln > 0);

  const directCmp = buildUnitPriceMarketComparison({
    catalogItem: targetCat,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    selectedSourceIds: ['orgbud', 'sekocenbud'],
    priceMode: 'direct_rms',
    activeEstimateItems: estimateItems,
  });
  for (const row of directCmp.rows) {
    assert.equal(row.selectedPrice, row.directUnitTotal);
    assert.equal(row.laborBar, row.laborUnit);
  }
});

test('buildProfitMarginCountyComparison computes projected margin vs Lower Silesian county averages', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);

  const westSubset = buildProfitMarginCountyComparison({
    summary,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    selectedCountyIds: ['pow_lwowecki', 'pow_boleslawiecki', 'pow_zlotoryjski'],
    metricMode: 'margin_pct',
    projectName: 'Projekt testowy',
  });

  assert.equal(westSubset.bars.length, 4); // 1 active estimate + 3 counties
  assert.equal(westSubset.bars[0].id, 'current_estimate');
  assert.equal(westSubset.projectedProfitPln, summary.profit);
  assert.ok(westSubset.projectedMarginPct > 5 && westSubset.projectedMarginPct < 10);
  // Lwówek 6.8, Bolesławiec 7.6, Złotoryja 7.1 -> avg = 7.17
  assert.equal(westSubset.selectedAvgMarginPct, 7.17);
  assert.equal(westSubset.highestCounty.id, 'pow_boleslawiecki');
  assert.equal(westSubset.lowestCounty.id, 'pow_lwowecki');

  // Verify PLN metric mode and trade discount reducing net margin
  const discountedSettings = { ...DEFAULT_ESTIMATE_SETTINGS, discountPct: 10 };
  const discountedSummary = calculateEstimateSummary(items, discountedSettings);
  const discountedCmp = buildProfitMarginCountyComparison({
    summary: discountedSummary,
    settings: discountedSettings,
    metricMode: 'profit_pln',
  });
  assert.ok(discountedCmp.projectedProfitPln < 0);
  assert.ok(discountedCmp.projectedMarginPct < 0);
  assert.equal(
    discountedCmp.bars[0].selectedMetricValue,
    discountedCmp.projectedProfitPln
  );

  // Empty estimate fallback
  const emptySummary = calculateEstimateSummary([], DEFAULT_ESTIMATE_SETTINGS);
  const emptyCmp = buildProfitMarginCountyComparison({
    summary: emptySummary,
    settings: DEFAULT_ESTIMATE_SETTINGS,
  });
  assert.equal(emptyCmp.projectedMarginPct, 0);
  assert.equal(emptyCmp.projectedProfitPln, 0);
});

test('buildRegionalRateHistory produces 12-month regional series, index=100 start, and 3M forecast', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);

  const wroHistory = buildRegionalRateHistory({
    subregionId: 'wroclaw',
    sourceId: 'rynek_dolnoslaski',
    includeForecast: false,
    estimateSummary: summary,
  });

  assert.equal(wroHistory.points.length, 12);
  assert.equal(wroHistory.points[0].monthLabel, 'gru 25');
  assert.equal(wroHistory.points[11].monthLabel, 'lis 26');
  assert.equal(wroHistory.points[0].laborIndex, 100);
  assert.equal(wroHistory.points[0].equipmentIndex, 100);
  // 38.5 * 1.06 = 40.81 zł/r-g
  assert.equal(wroHistory.currentLaborRatePln, 40.81);
  assert.ok(wroHistory.laborChange12mPct > 5);
  assert.ok(wroHistory.equipmentChange12mPct > 3);
  assert.ok(wroHistory.projectedEstimateImpactPln > 0);

  const walbrzychForecast = buildRegionalRateHistory({
    subregionId: 'walbrzych',
    sourceId: 'rynek_dolnoslaski',
    includeForecast: true,
    estimateSummary: summary,
  });
  assert.equal(walbrzychForecast.points.length, 15);
  assert.ok(walbrzychForecast.currentLaborRatePln < wroHistory.currentLaborRatePln);
  // Bridge point at month 11 links historical and forecast lines seamlessly
  assert.equal(
    walbrzychForecast.points[11].laborRatePln,
    walbrzychForecast.points[11].laborForecastPln
  );
  assert.equal(walbrzychForecast.points[12].isForecast, true);
  assert.equal(walbrzychForecast.points[12].laborRatePln, null);
  assert.ok((walbrzychForecast.points[14].laborForecastPln ?? 0) > walbrzychForecast.currentLaborRatePln);
});

test('buildEarthworksSeasonalityReport models 12-month precipitation, soil sensitivity, and estimate safety margins', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);

  const wroClay = buildEarthworksSeasonalityReport({
    subregionId: 'wroclaw',
    soilCategory: 'III',
    plannedMonthIndex: 6, // Lipiec
    estimateSummary: summary,
  });

  const jgClay = buildEarthworksSeasonalityReport({
    subregionId: 'jelenia_gora',
    soilCategory: 'III',
    plannedMonthIndex: 6,
    estimateSummary: summary,
  });

  const wroSand = buildEarthworksSeasonalityReport({
    subregionId: 'wroclaw',
    soilCategory: 'I-II',
    plannedMonthIndex: 6,
    estimateSummary: summary,
  });

  assert.equal(wroClay.months.length, 12);
  assert.equal(wroClay.selectedMonth.monthShort, 'Lip');
  assert.ok(wroClay.isEarthworksSubsetBase);
  assert.ok(wroClay.bufferBasePln > 0 && wroClay.bufferBasePln <= summary.netTotal);
  assert.ok(wroClay.selectedMonthBufferPln > 0);
  // Mountain/Sudeten region (Jelenia Góra) has higher annual precipitation & delay risk than Wrocław
  assert.ok(jgClay.annualPrecipitationMm > wroClay.annualPrecipitationMm);
  assert.ok(jgClay.avgDelayRiskPct > wroClay.avgDelayRiskPct);
  assert.ok(jgClay.selectedMonth.suggestedCostBufferPct > wroClay.selectedMonth.suggestedCostBufferPct);
  // Cohesive clay (cat. III) has higher delay risk & suggested buffer than permeable sand (cat. I-II)
  assert.ok(wroClay.selectedMonth.delayRiskPct > wroSand.selectedMonth.delayRiskPct);
  assert.ok(wroClay.peakRiskMonth.delayRiskPct > wroClay.optimalMonth.delayRiskPct);

  // Empty estimate produces 0 PLN buffer but still provides percentage contingency guidance
  const emptySummary = calculateEstimateSummary([], DEFAULT_ESTIMATE_SETTINGS);
  const emptyReport = buildEarthworksSeasonalityReport({
    subregionId: 'legnica_glogow',
    soilCategory: 'III',
    plannedMonthIndex: 3,
    estimateSummary: emptySummary,
  });
  assert.equal(emptyReport.bufferBasePln, 0);
  assert.equal(emptyReport.selectedMonthBufferPln, 0);
  assert.ok(emptyReport.selectedMonth.suggestedCostBufferPct > 0);
});

test('buildDieselEquipmentCorrelationReport computes Pearson r, 12M machinery cost series, and negotiation PLN delta', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);

  const report = buildDieselEquipmentCorrelationReport({
    settings: DEFAULT_ESTIMATE_SETTINGS,
    estimateSummary: summary,
    benchmarkMode: 'retail_pl',
    scenarioDieselDeltaPln: 0.5,
  });

  assert.equal(report.points.length, 12);
  assert.equal(report.points[0].dieselIndex, 100);
  assert.equal(report.points[0].equipmentIndex, 100);
  assert.ok(report.pearsonCorrelation > 0.7 && report.pearsonCorrelation <= 1);
  assert.equal(report.activeEstimateEquipmentPln, summary.equipmentTotal);
  assert.ok(report.scenarioEstimateEquipmentDeltaPln > 0);
  assert.ok(report.scenarioEstimateNetDeltaPln > report.scenarioEstimateEquipmentDeltaPln);
  assert.ok(report.negotiationTalkingPoint.includes('Pearsona'));

  const negativeScenario = buildDieselEquipmentCorrelationReport({
    settings: DEFAULT_ESTIMATE_SETTINGS,
    estimateSummary: summary,
    benchmarkMode: 'wholesale_orlen',
    dieselDataOrigin: 'google_search',
    scenarioDieselDeltaPln: -0.5,
  });
  assert.equal(negativeScenario.dieselDataOrigin, 'google_search');
  assert.ok(negativeScenario.scenarioEstimateNetDeltaPln < 0);
});

test('buildItemProfitabilityCountyReport compares line-item profitability against selected Lower Silesian counties', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );

  const report = buildItemProfitabilityCountyReport({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    selectedCountyIds: ['m_wroclaw', 'pow_lubinski', 'pow_lwowecki'],
    benchmarkMode: 'selected_avg',
    metricMode: 'margin_pct',
    sortBy: 'margin_desc',
  });

  assert.equal(report.totalEstimateItemsCount, items.length);
  assert.equal(report.filteredItemsCount, items.length);
  assert.equal(report.selectedCountiesCount, 3);
  // Average of 8.9 (Wrocław), 9.3 (Lubin), 6.8 (Lwówek) = 8.33%
  assert.equal(report.selectedCountiesAvgMarginPct, 8.33);
  assert.equal(report.benchmarkMarginPct, 8.33);
  assert.ok(report.mostProfitableItem && report.lowestMarginItem);
  assert.ok(
    report.mostProfitableItem.marginPct >= report.lowestMarginItem.marginPct
  );
  // Verify bars sorted descending by marginPct
  for (let i = 1; i < report.bars.length; i++) {
    assert.ok(report.bars[i - 1].marginPct >= report.bars[i].marginPct);
  }
  assert.equal(report.bars[0].countyDeltas.length, 3);

  // Single county benchmark & profit_pln mode & category filter
  const earthworksPln = buildItemProfitabilityCountyReport({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    selectedCountyIds: ['m_wroclaw', 'pow_walbrzyski'],
    benchmarkMode: 'single_county',
    referenceCountyId: 'pow_walbrzyski',
    metricMode: 'profit_pln',
    categoryFilter: 'roboty_ziemne',
    sortBy: 'margin_asc',
  });
  assert.equal(earthworksPln.benchmarkMode, 'single_county');
  assert.equal(earthworksPln.benchmarkMarginPct, 6.5);
  assert.ok(earthworksPln.bars.every((b) => b.category === 'roboty_ziemne'));
  assert.ok(
    earthworksPln.bars.every(
      (b) => Math.abs(b.selectedMetricValue - b.profitPln) < 0.01
    )
  );

  // Heavy discount triggers unprofitable items
  const discounted = buildItemProfitabilityCountyReport({
    items,
    settings: { ...DEFAULT_ESTIMATE_SETTINGS, discountPct: 12 },
    selectedCountyIds: ['m_wroclaw'],
  });
  assert.ok(discounted.unprofitableCount > 0);

  // Empty estimate
  const empty = buildItemProfitabilityCountyReport({
    items: [],
    settings: DEFAULT_ESTIMATE_SETTINGS,
  });
  assert.equal(empty.bars.length, 0);
  assert.equal(empty.mostProfitableItem, null);
});




