import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_OFFER_METADATA,
  DEFAULT_STRUCTURE_PARAMS,
} from '../data/dolnoslaskieRates';
import { EstimateLineItem, SavedProjectEstimate } from '../types/estimator';
import {
  buildProjectVersionSnapshot,
  computeActiveVsLatestSnapshotDelta,
  computeVersionTimeline,
  getNextVersionNumber,
  groupVersionsByProject,
  normalizeProjectKey,
  suggestDefaultVersionTag,
  validateVersionSaveInput,
} from './projectVersions';

function makeLine(id: string, qty: number, rateLabor: number): EstimateLineItem {
  return {
    id,
    knr: 'KNR 2-01',
    name: `Pozycja ${id}`,
    category: 'roboty_ziemne',
    unit: 'm³',
    quantity: qty,
    rateLabor,
    rateMaterials: 0,
    rateEquipment: 20,
  };
}

test('validateVersionSaveInput rejects empty project name or empty version tag', () => {
  const missingTag = validateVersionSaveInput({
    projectName: 'Hala produkcyjna Wrocław',
    versionTag: '   ',
  });
  assert.equal(missingTag.valid, false);
  assert.ok(missingTag.error);

  const shortName = validateVersionSaveInput({
    projectName: 'A',
    versionTag: 'Wstępny',
  });
  assert.equal(shortName.valid, false);

  const ok = validateVersionSaveInput({
    projectName: '  Rozbiórka   hali  Lwówek  ',
    versionTag: '  Poprawiony  ',
    versionNote: 'Dodano wywóz gruzu',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedName, 'Rozbiórka hali Lwówek');
  assert.equal(ok.normalizedTag, 'Poprawiony');
  assert.equal(ok.normalizedNote, 'Dodano wywóz gruzu');
});

test('buildProjectVersionSnapshot increments versionNumber per normalized projectKey and computes timeline deltas', () => {
  const existing: SavedProjectEstimate[] = [];

  const v1 = buildProjectVersionSnapshot({
    existingSnapshots: existing,
    projectName: 'Wykop pod halę Wrocław',
    versionTag: 'Wstępny',
    versionNote: 'Kosztorys bazowy',
    items: [makeLine('1', 100, 10)],
    settings: DEFAULT_ESTIMATE_SETTINGS,
    structureParams: DEFAULT_STRUCTURE_PARAMS,
    offer: DEFAULT_OFFER_METADATA,
    netTotal: 10000,
    nowIso: '2026-11-18T08:00:00.000Z',
    idOverride: 'snap-1',
  });
  assert.equal(v1.versionNumber, 1);
  assert.equal(v1.versionTag, 'Wstępny');
  assert.equal(v1.projectKey, normalizeProjectKey('Wykop pod halę Wrocław'));

  existing.push(v1);

  assert.equal(getNextVersionNumber(existing, '  wykop pod halę wrocław '), 2);
  assert.equal(suggestDefaultVersionTag(1), 'Wstępny');
  assert.equal(suggestDefaultVersionTag(2), 'Poprawiony');

  const v2 = buildProjectVersionSnapshot({
    existingSnapshots: existing,
    projectName: 'Wykop pod halę Wrocław',
    versionTag: 'Poprawiony',
    versionNote: 'Zwiększono kubaturę i dodano skarpowanie',
    items: [makeLine('1', 120, 10), makeLine('2', 50, 15)],
    settings: DEFAULT_ESTIMATE_SETTINGS,
    structureParams: DEFAULT_STRUCTURE_PARAMS,
    offer: DEFAULT_OFFER_METADATA,
    netTotal: 13500,
    nowIso: '2026-11-18T09:30:00.000Z',
    idOverride: 'snap-2',
  });
  assert.equal(v2.versionNumber, 2);
  existing.push(v2);

  const timeline = computeVersionTimeline(existing);
  assert.equal(timeline.length, 2);
  // Newest first
  assert.equal(timeline[0].snapshot.id, 'snap-2');
  assert.equal(timeline[0].versionNumber, 2);
  assert.equal(timeline[0].versionTag, 'Poprawiony');
  assert.equal(timeline[0].netDeltaPln, 3500);
  assert.equal(timeline[0].netDeltaPct, 35);
  assert.equal(timeline[0].itemCountDelta, 1);
  assert.equal(timeline[0].changedItemsCount, 2);

  // Baseline v1 has null deltas
  assert.equal(timeline[1].snapshot.id, 'snap-1');
  assert.equal(timeline[1].netDeltaPln, null);
  assert.equal(timeline[1].previousVersion, null);

  const groups = groupVersionsByProject(timeline);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].versionCount, 2);
  assert.equal(groups[0].latestVersionNumber, 2);
  assert.equal(groups[0].latestVersionTag, 'Poprawiony');
  assert.equal(groups[0].totalDeltaFromFirstPln, 3500);
});

test('computeActiveVsLatestSnapshotDelta detects unsaved changes against latest saved version', () => {
  const v1 = buildProjectVersionSnapshot({
    existingSnapshots: [],
    projectName: 'Melioracja rowu R-4',
    versionTag: 'Ostateczny',
    items: [makeLine('1', 40, 12)],
    settings: DEFAULT_ESTIMATE_SETTINGS,
    structureParams: DEFAULT_STRUCTURE_PARAMS,
    offer: DEFAULT_OFFER_METADATA,
    netTotal: 5000,
    nowIso: '2026-11-18T10:00:00.000Z',
    idOverride: 'snap-m1',
  });

  const unchanged = computeActiveVsLatestSnapshotDelta({
    savedEstimates: [v1],
    projectName: 'Melioracja rowu R-4',
    currentItems: [makeLine('1', 40, 12)],
    currentNetTotal: 5000,
  });
  assert.ok(unchanged);
  assert.equal(unchanged.hasChanges, false);
  assert.equal(unchanged.netDeltaPln, 0);
  assert.equal(unchanged.changedItemsCount, 0);

  const modified = computeActiveVsLatestSnapshotDelta({
    savedEstimates: [v1],
    projectName: 'Melioracja rowu R-4',
    currentItems: [makeLine('1', 60, 12)],
    currentNetTotal: 6200,
  });
  assert.ok(modified);
  assert.equal(modified.hasChanges, true);
  assert.equal(modified.netDeltaPln, 1200);
  assert.equal(modified.netDeltaPct, 24);
  assert.equal(modified.changedItemsCount, 1);
  assert.equal(modified.referenceVersionTag, 'Ostateczny');
});
