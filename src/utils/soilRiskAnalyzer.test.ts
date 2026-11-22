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
  analyzeSoilAndSiteRisk,
  inferSiteUtilityDensityFromLocation,
} from './soilRiskAnalyzer';

const SAMPLE_ITEMS = generateItemsFromStructureParams(
  DEFAULT_STRUCTURE_PARAMS,
  WORK_CATALOG,
  DEFAULT_ESTIMATE_SETTINGS
);

test('analyzeSoilAndSiteRisk scales suggested risk factor across soil categories and utility density', () => {
  const urbanCatIV = analyzeSoilAndSiteRisk({
    params: { ...DEFAULT_STRUCTURE_PARAMS, soilCategory: 'IV', excavationDepthM: 2.8 },
    settings: DEFAULT_ESTIMATE_SETTINGS,
    siteContext: 'teren_zurbanizowany',
    activeItems: SAMPLE_ITEMS,
  });

  const urbanCatIII = analyzeSoilAndSiteRisk({
    params: { ...DEFAULT_STRUCTURE_PARAMS, soilCategory: 'III', excavationDepthM: 2.8 },
    settings: DEFAULT_ESTIMATE_SETTINGS,
    siteContext: 'teren_zurbanizowany',
    activeItems: SAMPLE_ITEMS,
  });

  const openCatI = analyzeSoilAndSiteRisk({
    params: {
      ...DEFAULT_STRUCTURE_PARAMS,
      soilCategory: 'I-II',
      scopeMode: 'tylko_ziemne',
      excavationDepthM: 1.2,
    },
    settings: DEFAULT_ESTIMATE_SETTINGS,
    siteContext: 'teren_otwarty',
    activeItems: SAMPLE_ITEMS,
  });

  assert.equal(urbanCatIV.drivers.length, 4);
  assert.ok(urbanCatIV.suggestedRiskPct > urbanCatIII.suggestedRiskPct);
  assert.ok(urbanCatIII.suggestedRiskPct > openCatI.suggestedRiskPct);
  assert.ok(
    urbanCatIV.drivers[0].id === 'underground_utilities' &&
      urbanCatIV.drivers[0].contributionPct > openCatI.drivers[0].contributionPct
  );
  assert.ok(urbanCatIV.activeEstimateDeltaPln > 0);
  assert.ok(urbanCatIV.parametricEstimateDeltaPln > 0);
});

test('applying soilRiskPct in EstimateSettings increases final net and gross estimate totals transparently', () => {
  const baseSummary = calculateEstimateSummary(SAMPLE_ITEMS, {
    ...DEFAULT_ESTIMATE_SETTINGS,
    soilRiskPct: 0,
  });

  const analysis = analyzeSoilAndSiteRisk({
    params: DEFAULT_STRUCTURE_PARAMS,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    siteContext: 'teren_zurbanizowany',
    activeItems: SAMPLE_ITEMS,
  });

  const withRiskSummary = calculateEstimateSummary(SAMPLE_ITEMS, {
    ...DEFAULT_ESTIMATE_SETTINGS,
    soilRiskPct: analysis.suggestedRiskPct,
  });

  assert.equal(
    withRiskSummary.netTotal,
    analysis.activeEstimateSuggestedNetPln
  );
  assert.ok((withRiskSummary.riskReserveAmount ?? 0) > 0);
  assert.ok(withRiskSummary.netTotal > baseSummary.netTotal);
  assert.ok(withRiskSummary.grossTotal > baseSummary.grossTotal);
});

test('inferSiteUtilityDensityFromLocation classifies urban, industrial, and open locations', () => {
  assert.equal(
    inferSiteUtilityDensityFromLocation('Wrocław — Psie Pole, ul. Kiełczowska'),
    'teren_zurbanizowany'
  );
  assert.equal(
    inferSiteUtilityDensityFromLocation('Strefa ekonomiczna LSSE Legnica'),
    'strefa_przemyslowa'
  );
  assert.equal(
    inferSiteUtilityDensityFromLocation('Działka rolna nr 42, gmina Wleń'),
    'teren_otwarty'
  );
});
