import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_STRUCTURE_PARAMS,
  SUBREGIONS,
  WORK_CATALOG,
} from '../data/dolnoslaskieRates';
import { generateItemsFromStructureParams } from './calculations';
import { findEstimateItemSuggestions } from './estimateItemSuggestions';

const ACTIVE_ITEMS = generateItemsFromStructureParams(
  DEFAULT_STRUCTURE_PARAMS,
  WORK_CATALOG,
  DEFAULT_ESTIMATE_SETTINGS
);

test('findEstimateItemSuggestions returns empty for empty query and matches from 1+ characters', () => {
  assert.deepEqual(
    findEstimateItemSuggestions({
      query: '   ',
      workCatalog: WORK_CATALOG,
      existingEstimateItems: ACTIVE_ITEMS,
      settings: DEFAULT_ESTIMATE_SETTINGS,
    }),
    []
  );

  const singleChar = findEstimateItemSuggestions({
    query: 'w',
    workCatalog: WORK_CATALOG,
    existingEstimateItems: ACTIVE_ITEMS,
    settings: DEFAULT_ESTIMATE_SETTINGS,
  });
  assert.ok(singleChar.length > 0);
});

test('findEstimateItemSuggestions supports Polish diacritic-insensitive search and prioritizes active estimate items', () => {
  const results = findEstimateItemSuggestions({
    query: 'wywoz',
    workCatalog: WORK_CATALOG,
    existingEstimateItems: ACTIVE_ITEMS,
    settings: DEFAULT_ESTIMATE_SETTINGS,
  });

  assert.ok(results.length > 0);
  assert.ok(results.some((r) => r.name.toLowerCase().includes('wywóz')));
  assert.ok(results.some((r) => r.sourceType === 'estimate'));
});

test('findEstimateItemSuggestions excludes edited row and computes subregion-adjusted R/M/S patch', () => {
  const customRow = {
    ...ACTIVE_ITEMS[0],
    id: 'custom-editing-row',
    knr: 'KALK. WŁASNA',
    name: 'iglo',
    isCustom: true,
  };

  const results = findEstimateItemSuggestions({
    query: 'iglo',
    workCatalog: WORK_CATALOG,
    existingEstimateItems: [...ACTIVE_ITEMS, customRow],
    settings: { ...DEFAULT_ESTIMATE_SETTINGS, subregionId: 'wroclaw' },
    subregions: SUBREGIONS,
    excludeItemId: 'custom-editing-row',
  });

  assert.ok(results.length >= 1);
  assert.ok(results.every((r) => r.id !== 'est:custom-editing-row'));
  const wellpoint = results.find((r) => r.knr.includes('0602-01'));
  assert.ok(wellpoint);
  assert.equal(wellpoint.unit, 'mb');
  assert.ok(wellpoint.rateLabor > 0 && wellpoint.rateEquipment > 0);
  assert.equal(wellpoint.patch.name, wellpoint.name);
});
