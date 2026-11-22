import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_STRUCTURE_PARAMS,
  WORK_CATALOG,
} from '../data/dolnoslaskieRates';
import { generateItemsFromStructureParams } from './calculations';
import {
  calculateWhatIfSensitivity,
  createDefaultWhatIfParams,
  WHAT_IF_PRESETS,
} from './whatIfSensitivity';

const SAMPLE_ITEMS = generateItemsFromStructureParams(
  DEFAULT_STRUCTURE_PARAMS,
  WORK_CATALOG,
  DEFAULT_ESTIMATE_SETTINGS
);

test('returns zero deltas when all What-If parameters match baseline estimate', () => {
  const params = createDefaultWhatIfParams(DEFAULT_ESTIMATE_SETTINGS);
  const report = calculateWhatIfSensitivity(
    SAMPLE_ITEMS,
    DEFAULT_ESTIMATE_SETTINGS,
    params
  );

  assert.equal(report.hasAnyChange, false);
  assert.equal(report.hasMarkupChange, false);
  assert.equal(report.simulatedNetTotal, report.baselineNetTotal);
  assert.equal(report.deltaNetPln, 0);
  assert.equal(report.deltaNetPct, 0);
  assert.equal(report.deltaMarginPp, 0);
});

test('increasing equipment efficiency by 10% lowers equipment cost by ~9.09% and lowers net offer value proportionally', () => {
  const equipPreset = WHAT_IF_PRESETS.find((p) => p.id === 'equip_plus_10');
  assert.ok(equipPreset);

  const report = calculateWhatIfSensitivity(
    SAMPLE_ITEMS,
    DEFAULT_ESTIMATE_SETTINGS,
    equipPreset.buildParams(DEFAULT_ESTIMATE_SETTINGS)
  );

  assert.equal(report.hasAnyChange, true);
  assert.equal(report.hasMarkupChange, false);
  assert.ok(
    report.equipmentCostMultiplier < 0.91 && report.equipmentCostMultiplier > 0.908
  );

  const equipComponent = report.componentDeltas.find((c) => c.key === 'equipment');
  assert.ok(equipComponent);
  assert.ok(equipComponent.deltaPln < 0);
  assert.ok(
    equipComponent.deltaPct <= -9.0 && equipComponent.deltaPct >= -9.2,
    `Expected equipment cost drop around -9.09%, got ${equipComponent.deltaPct}%`
  );

  // Net total must decrease, and because Kp & Zysk apply to S, absolute PLN drop exceeds direct S drop
  assert.ok(report.simulatedNetTotal < report.baselineNetTotal);
  assert.ok(report.deltaNetPln < equipComponent.deltaPln);
  assert.ok(report.deltaNetPct < 0);

  const expectedPct =
    Math.round(
      ((report.simulatedNetTotal - report.baselineNetTotal) / report.baselineNetTotal) *
        10000
    ) / 100;
  assert.equal(report.deltaNetPct, expectedPct);
});

test('decreasing equipment efficiency and increasing material costs raises final net offer and shifts real margin', () => {
  const report = calculateWhatIfSensitivity(
    SAMPLE_ITEMS,
    DEFAULT_ESTIMATE_SETTINGS,
    {
      ...createDefaultWhatIfParams(DEFAULT_ESTIMATE_SETTINGS),
      equipmentEfficiencyDeltaPct: -20,
      materialsPriceDeltaPct: 15,
      profitPct: 12,
      discountPct: 2,
    }
  );

  assert.equal(report.hasAnyChange, true);
  assert.equal(report.hasMarkupChange, true);
  assert.ok(report.simulatedNetTotal > report.baselineNetTotal);
  assert.ok(report.deltaNetPct > 10);
  assert.ok(report.simulatedMarginPct > report.baselineMarginPct);
  assert.equal(
    report.categoryImpacts.length,
    report.baselineSummary.byCategory.length
  );
});

test('handles empty estimate safely with zero totals and zero percentage deltas', () => {
  const report = calculateWhatIfSensitivity([], DEFAULT_ESTIMATE_SETTINGS, {
    ...createDefaultWhatIfParams(DEFAULT_ESTIMATE_SETTINGS),
    equipmentEfficiencyDeltaPct: 10,
  });

  assert.equal(report.baselineNetTotal, 0);
  assert.equal(report.simulatedNetTotal, 0);
  assert.equal(report.deltaNetPln, 0);
  assert.equal(report.deltaNetPct, 0);
  assert.equal(report.categoryImpacts.length, 0);
});
