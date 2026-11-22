import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOfflineSyncTime,
  loadTendersFromOfflineCache,
  saveTendersToOfflineCache,
  StorageLike,
} from './offlineCache';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

describe('offlineCache utilities', () => {
  it('saves and restores cached Dolny Śląsk tenders payload cleanly', () => {
    const storage = createMemoryStorage();
    const ok = saveTendersToOfflineCache(
      storage,
      {
        orderMode: 'all',
        daysBack: 21,
        payload: {
          fetchedAt: '2026-11-17T12:00:00Z',
          provinceCode: 'PL02',
          provinceName: 'Województwo dolnośląskie',
          daysBack: 21,
          totalFetched: 1,
          items: [
            {
              id: 't1',
              tenderId: 'ocds-1',
              noticeNumber: '2026/BZP 001/01',
              bzpNumber: '2026/BZP 001',
              orderType: 'Works',
              orderObject: 'Roboty ziemne Wrocław',
              organizationName: 'Gmina Wrocław',
              organizationCity: 'Wrocław',
              organizationProvince: 'PL02',
              subregionId: 'wroclaw',
              nuts3Label: 'M. Wrocław (PL514)',
              cpvCode: '45111200-0',
              publicationDate: '2026-11-10T10:00:00Z',
              submittingOffersDate: '2026-11-25T10:00:00Z',
              isActiveDeadline: true,
              isEarthworksOrDemolition: true,
              shortDescription: 'Wykopy i podbudowa.',
              procedureUrl: 'https://ezamowienia.gov.pl',
              ezamowieniaUrl: 'https://ezamowienia.gov.pl',
            },
          ],
        },
      },
      '2026-11-17T12:05:00Z'
    );

    assert.equal(ok, true);
    const restored = loadTendersFromOfflineCache(storage);
    assert.ok(restored);
    assert.equal(restored.savedAt, '2026-11-17T12:05:00Z');
    assert.equal(restored.payload.items.length, 1);
    assert.equal(restored.payload.items[0].noticeNumber, '2026/BZP 001/01');
  });

  it('handles corrupted storage values gracefully by returning null', () => {
    const storage = createMemoryStorage();
    storage.setItem('terenkoszt_tenders_offline_v1', '{invalid json');
    assert.equal(loadTendersFromOfflineCache(storage), null);
    assert.equal(loadTendersFromOfflineCache(null), null);
  });

  it('formats offline sync timestamps cleanly and handles invalid dates', () => {
    assert.equal(formatOfflineSyncTime('invalid'), '—');
    assert.match(formatOfflineSyncTime('2026-11-17T12:00:00Z'), /\d{2}\.\d{2}/);
  });
});
