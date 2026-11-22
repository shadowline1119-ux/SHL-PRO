import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialEstimateItems,
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_OFFER_METADATA,
  DEFAULT_STRUCTURE_PARAMS,
} from '../data/dolnoslaskieRates';
import type { SavedProjectEstimate } from '../types/estimator';
import {
  createBlankProjectWorkspace,
  duplicateProjectWorkspace,
  getLatestDistinctProjects,
} from './projectActions';

describe('projectActions', () => {
  it('creates a blank project while preserving the user contractor profile and regional settings', () => {
    const customOffer = {
      ...DEFAULT_OFFER_METADATA,
      contractorName: 'SHADOW-LINE Sp. z o.o.',
      contractorNip: '899-111-22-33',
      clientName: 'Poprzedni Klient',
    };
    const customSettings = {
      ...DEFAULT_ESTIMATE_SETTINGS,
      profitPct: 18,
    };

    const blank = createBlankProjectWorkspace({
      projectName: 'Wykop pod halę — Bolesławiec',
      currentSettings: customSettings,
      currentOffer: customOffer,
      now: new Date('2026-11-20T12:00:00.000Z'),
    });

    assert.equal(blank.items.length, 0);
    assert.equal(blank.structureParams.projectName, 'Wykop pod halę — Bolesławiec');
    assert.equal(blank.settings.profitPct, 18);
    assert.equal(blank.offer.contractorName, 'SHADOW-LINE Sp. z o.o.');
    assert.equal(blank.offer.contractorNip, '899-111-22-33');
    assert.equal(blank.offer.clientName, '');
  });

  it('duplicates an active project with cloned line item IDs and copy suffix', () => {
    const items = buildInitialEstimateItems('sekocenbud', 'wroclaw');
    const dup = duplicateProjectWorkspace({
      items,
      settings: DEFAULT_ESTIMATE_SETTINGS,
      structureParams: { ...DEFAULT_STRUCTURE_PARAMS, projectName: 'Rozbiórka magazynu' },
      offer: DEFAULT_OFFER_METADATA,
      now: new Date('2026-11-20T12:05:00.000Z'),
    });

    assert.equal(dup.structureParams.projectName, 'Rozbiórka magazynu (kopia)');
    assert.equal(dup.items.length, items.length);
    assert.notEqual(dup.items[0].id, items[0].id);
  });

  it('deduplicates recent saved project versions by projectKey keeping latest timestamp', () => {
    const base = {
      itemCount: 3,
      netTotal: 10000,
      items: [],
      settings: DEFAULT_ESTIMATE_SETTINGS,
      structureParams: DEFAULT_STRUCTURE_PARAMS,
      offer: DEFAULT_OFFER_METADATA,
    };
    const list: SavedProjectEstimate[] = [
      { ...base, id: '1', projectKey: 'proj_a', name: 'Projekt A', createdAt: '2026-11-18T10:00:00Z', updatedAt: '2026-11-18T10:00:00Z', versionNumber: 1 },
      { ...base, id: '2', projectKey: 'proj_a', name: 'Projekt A', createdAt: '2026-11-19T10:00:00Z', updatedAt: '2026-11-19T10:00:00Z', versionNumber: 2 },
      { ...base, id: '3', projectKey: 'proj_b', name: 'Projekt B', createdAt: '2026-11-18T15:00:00Z', updatedAt: '2026-11-18T15:00:00Z', versionNumber: 1 },
      { ...base, id: '4', projectKey: 'proj_c', name: 'Projekt C', createdAt: '2026-11-20T15:00:00Z', updatedAt: '2026-11-20T15:00:00Z', deleted: true },
    ];

    const recent = getLatestDistinctProjects(list, 5);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].id, '2');
    assert.equal(recent[1].id, '3');
  });
});
