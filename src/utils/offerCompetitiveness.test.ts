import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_STRUCTURE_PARAMS,
  WORK_CATALOG,
} from '../data/dolnoslaskieRates';
import {
  calculateEstimateSummary,
  generateItemsFromStructureParams,
} from './calculations';
import {
  buildOfferCompetitivenessReport,
  inferCountyFromLocationAndSubregion,
} from './offerCompetitiveness';

test('inferCountyFromLocationAndSubregion detects Dolnoslaskie county from location text and falls back by subregion', () => {
  assert.equal(
    inferCountyFromLocationAndSubregion('Wrocław, ul. Kiełczowska', 'wroclaw'),
    'm_wroclaw'
  );
  assert.equal(
    inferCountyFromLocationAndSubregion('Bielany Wrocławskie / Kobierzyce', 'wroclaw'),
    'pow_wroclawski'
  );
  assert.equal(
    inferCountyFromLocationAndSubregion('Lwówek Śląski, ul. Betleja', 'jelenia_gora'),
    'pow_lwowecki'
  );
  assert.equal(
    inferCountyFromLocationAndSubregion('Bolesławiec — strefa przemysłowa', 'jelenia_gora'),
    'pow_boleslawiecki'
  );
  assert.equal(
    inferCountyFromLocationAndSubregion('Lokalizacja nieznana', 'walbrzych'),
    'pow_swidnicki'
  );
});

test('buildOfferCompetitivenessReport builds 6 comparison bars and reflects discount and profit changes accurately', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);

  const report = buildOfferCompetitivenessReport({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    offerNetTotal: summary.netTotal,
    offerNumber: 'OF/2026/11/042',
    offerSource: 'generated_pdf',
    countyId: 'm_wroclaw',
    segment: 'all',
    metricMode: 'net_pln',
  });

  assert.equal(report.bars.length, 6);
  assert.equal(report.bars[0].id, 'our_offer');
  assert.equal(report.bars[0].netPricePln, summary.netTotal);
  assert.equal(report.offerSource, 'generated_pdf');
  assert.ok(report.countyAverageNetPln > 0);
  assert.ok(report.countyLowQuartileNetPln < report.countyMedianTenderNetPln);
  assert.ok(report.countyMedianTenderNetPln < report.countyAverageNetPln);
  assert.ok(report.countyAverageNetPln < report.countyHighQuartileNetPln);

  // Higher profit margin should move offer into higher price tier relative to same county average
  const expensiveOffer = roundPln(report.countyAverageNetPln * 1.15);
  const expensiveReport = buildOfferCompetitivenessReport({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    offerNetTotal: expensiveOffer,
    countyId: 'm_wroclaw',
    segment: 'public_tender',
    metricMode: 'index_100',
  });

  assert.equal(expensiveReport.competitivenessStatus, 'wysoka_ryzyko_odrzucenia');
  assert.ok(expensiveReport.deltaVsCountyAvgPct > 10);
  const avgBar = expensiveReport.bars.find((b) => b.id === 'county_avg');
  assert.ok(avgBar);
  assert.equal(avgBar.selectedMetricValue, 100);
  assert.ok(expensiveReport.bars[0].selectedMetricValue > 110);
});

test('buildOfferCompetitivenessReport differentiates county price levels and handles empty estimates safely', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);

  const wroclawReport = buildOfferCompetitivenessReport({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    offerNetTotal: summary.netTotal,
    countyId: 'm_wroclaw',
  });
  const lwowekReport = buildOfferCompetitivenessReport({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    offerNetTotal: summary.netTotal,
    countyId: 'pow_lwowecki',
  });

  assert.ok(wroclawReport.countyAverageNetPln > lwowekReport.countyAverageNetPln);

  const emptyReport = buildOfferCompetitivenessReport({
    items: [],
    settings: DEFAULT_ESTIMATE_SETTINGS,
    offerNetTotal: 0,
    countyId: 'pow_boleslawiecki',
  });
  assert.equal(emptyReport.offerNetTotal, 0);
  assert.equal(emptyReport.countyAverageNetPln, 0);
});

function roundPln(v: number): number {
  return Math.round(v * 100) / 100;
}
