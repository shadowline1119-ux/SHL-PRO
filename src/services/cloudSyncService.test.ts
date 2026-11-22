import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_OFFER_METADATA,
  DEFAULT_STRUCTURE_PARAMS,
} from '../data/dolnoslaskieRates';
import type { SavedProjectEstimate } from '../types/estimator';
import {
  buildConflictItem,
  detectEstimateSyncAction,
  resolveEstimateConflict,
  sanitizeFirestoreId,
} from './cloudSyncConflict';

function makeEst(patch: Partial<SavedProjectEstimate>): SavedProjectEstimate {
  return {
    id: 'est_1',
    projectKey: 'proj_1',
    name: 'Droga powiatowa nr 2514D',
    versionNumber: 1,
    versionTag: 'Wstępny',
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    itemCount: 1,
    netTotal: 10000,
    items: [],
    settings: DEFAULT_ESTIMATE_SETTINGS,
    structureParams: DEFAULT_STRUCTURE_PARAMS,
    offer: DEFAULT_OFFER_METADATA,
    localRevision: 1,
    cloudRevision: 1,
    syncStatus: 'synced',
    ...patch,
  };
}

describe('cloudSyncConflict (offline-first & non-destructive conflict detection)', () => {
  it('pushes local pending changes when cloud did not advance', () => {
    const local = makeEst({ localRevision: 2, cloudRevision: 1, syncStatus: 'pending_sync' });
    const cloud = makeEst({ localRevision: 1, cloudRevision: 1 });
    assert.equal(detectEstimateSyncAction(local, cloud), 'push_local');
  });

  it('pulls newer cloud revision when local has no pending edits', () => {
    const local = makeEst({ localRevision: 1, cloudRevision: 1, syncStatus: 'synced' });
    const cloud = makeEst({ localRevision: 2, cloudRevision: 2, netTotal: 12500 });
    assert.equal(detectEstimateSyncAction(local, cloud), 'pull_cloud');
  });

  it('detects conflict instead of silently overwriting when both local and cloud advanced', () => {
    const local = makeEst({
      localRevision: 3,
      cloudRevision: 1,
      syncStatus: 'pending_sync',
      netTotal: 14000,
      updatedAt: '2026-11-18T11:00:00.000Z',
    });
    const cloud = makeEst({
      localRevision: 2,
      cloudRevision: 2,
      netTotal: 15500,
      updatedAt: '2026-11-18T11:05:00.000Z',
    });
    assert.equal(detectEstimateSyncAction(local, cloud), 'conflict');

    const conflict = buildConflictItem(local, cloud);
    const keepBoth = resolveEstimateConflict(conflict, 'keep_both', '2026-11-18T12:00:00.000Z');
    assert.ok(keepBoth.primaryEstimate);
    assert.ok(keepBoth.secondaryEstimate);
    assert.equal(keepBoth.primaryEstimate.netTotal, 15500);
    assert.equal(keepBoth.secondaryEstimate.netTotal, 14000);
    assert.equal(keepBoth.secondaryEstimate.syncStatus, 'pending_sync');
  });

  it('sanitizes document IDs to safe Firestore ID characters', () => {
    const safe = sanitizeFirestoreId('../zły/id:testowy 1');
    assert.match(safe, /^[a-zA-Z0-9_-]+$/);
  });
});
