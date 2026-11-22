import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexedDbManager } from '../db/indexedDbManager';
import { ExternalPriceListPackage } from '../types/estimator';
import {
  createPriceSyncService,
  parseExternalPriceListPackage,
} from './priceSyncService';

const SAMPLE_PACKAGE: ExternalPriceListPackage = {
  version: '2026.Q4-TEST',
  publishedAt: '2026-11-18T12:00:00.000Z',
  quarter: 'IV kw. 2026',
  publisher: 'Test Feed Dolny Śląsk',
  changelog: ['Aktualizacja testowa stawek'],
  priceSources: {
    sekocenbud: {
      hourlyLaborAvg: 37.5,
      equipmentIndex: 1.12,
      quarter: 'IV kw. 2026',
    },
  },
  workCatalogUpdates: [
    {
      id: 'rz-humus',
      ratesBySource: {
        sekocenbud: { labor: 4.5, materials: 0, equipment: 16.0 },
        intercenbud: { labor: 4.3, materials: 0, equipment: 15.5 },
        bistyp: { labor: 4.7, materials: 0, equipment: 16.8 },
        orgbud: { labor: 4.2, materials: 0, equipment: 15.2 },
        rynek_dolnoslaski: { labor: 5.0, materials: 0, equipment: 17.5 },
      },
    },
  ],
  quarryMaterialUpdates: [
    {
      id: 'woj-bazalt-0-31',
      priceNetPerUnit: 51.0,
    },
  ],
};

test('parseExternalPriceListPackage validates valid and malformed JSON payloads', () => {
  const valid = parseExternalPriceListPackage(JSON.stringify(SAMPLE_PACKAGE));
  assert.equal(valid.ok, true);

  const badJson = parseExternalPriceListPackage('{not valid json');
  assert.equal(badJson.ok, false);

  const missingVersion = parseExternalPriceListPackage({ priceSources: {} });
  assert.equal(missingVersion.ok, false);
});

test('priceSyncService defers remote sync and external file imports when browser is offline', async () => {
  const db = createIndexedDbManager({ idbFactory: null });
  await db.initAndSeedDefaults();

  let fetchCalled = false;
  const sync = createPriceSyncService({
    db,
    isNavigatorOnline: () => false,
    fetchFn: (async () => {
      fetchCalled = true;
      throw new Error('Should not call fetch when offline');
    }) as typeof fetch,
  });

  const remoteRes = await sync.syncFromRemoteFeed();
  assert.equal(remoteRes.status, 'deferred_offline');
  assert.equal(remoteRes.pendingQueueCount, 1);
  assert.equal(fetchCalled, false);

  const importRes = await sync.syncExternalImport(SAMPLE_PACKAGE, {
    label: 'cennik_q4.json',
  });
  assert.equal(importRes.status, 'deferred_offline');
  assert.equal(importRes.pendingQueueCount, 2);

  // Stawki w IndexedDB nie mogą zostać nadpisane w trybie offline
  const sources = await db.getPriceSourcesRecord();
  assert.equal(sources.sekocenbud.hourlyLaborAvg, 34.8);
});

test('priceSyncService also defers sync if navigator.onLine is true but health endpoint fails', async () => {
  const db = createIndexedDbManager({ idbFactory: null });
  await db.initAndSeedDefaults();

  const sync = createPriceSyncService({
    db,
    isNavigatorOnline: () => true,
    fetchFn: (async () => {
      throw new Error('Network unreachable');
    }) as typeof fetch,
  });

  const res = await sync.syncFromRemoteFeed();
  assert.equal(res.status, 'deferred_offline');
  assert.equal(res.pendingQueueCount, 1);
});

test('priceSyncService syncs when online and preserves user-modified rates under preserve_custom strategy', async () => {
  const db = createIndexedDbManager({ idbFactory: null });
  await db.initAndSeedDefaults();

  // Użytkownik ręcznie zmienił stawkę dla 'rz-humus'
  const initialCatalog = await db.getWorkCatalog();
  const humus = initialCatalog.find((c) => c.id === 'rz-humus')!;
  await db.saveWorkCatalogItem({
    ...humus,
    isModifiedByUser: true,
    ratesBySource: {
      ...humus.ratesBySource,
      sekocenbud: { labor: 12.34, materials: 0, equipment: 30.0 },
    },
  });

  const sync = createPriceSyncService({
    db,
    isNavigatorOnline: () => true,
    fetchFn: (async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/health')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (urlStr.includes('/api/price-lists/latest')) {
        return new Response(JSON.stringify(SAMPLE_PACKAGE), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch,
  });

  const res = await sync.syncFromRemoteFeed({ conflictStrategy: 'preserve_custom' });
  assert.equal(res.status, 'synced');
  assert.equal(res.version, '2026.Q4-TEST');
  assert.equal(res.updatedSourceCount, 1);
  assert.equal(res.updatedQuarryCount, 1);
  assert.equal(res.skippedCustomCount, 1);

  const afterCatalog = await db.getWorkCatalog();
  const afterHumus = afterCatalog.find((c) => c.id === 'rz-humus')!;
  assert.equal(afterHumus.ratesBySource.sekocenbud.labor, 12.34);

  const afterQuarries = await db.getQuarryMaterials();
  const woj = afterQuarries.find((q) => q.id === 'woj-bazalt-0-31')!;
  assert.equal(woj.priceNetPerUnit, 51);

  // Przy overwrite_all własna stawka zostaje nadpisana pakietem
  const overwriteRes = await sync.syncFromRemoteFeed({
    conflictStrategy: 'overwrite_all',
  });
  assert.equal(overwriteRes.status, 'synced');
  assert.equal(overwriteRes.updatedWorkCount, 1);
  const forcedHumus = (await db.getWorkCatalog()).find((c) => c.id === 'rz-humus')!;
  assert.equal(forcedHumus.ratesBySource.sekocenbud.labor, 4.5);
});

test('priceSyncService flushes queued offline external imports once internet becomes active', async () => {
  const db = createIndexedDbManager({ idbFactory: null });
  await db.initAndSeedDefaults();

  let online = false;
  const sync = createPriceSyncService({
    db,
    isNavigatorOnline: () => online,
    fetchFn: (async (url: RequestInfo | URL) => {
      if (!online) throw new Error('offline');
      if (String(url).includes('/api/health')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(SAMPLE_PACKAGE), { status: 200 });
    }) as typeof fetch,
  });

  // 1. Import w trybie offline -> kolejka
  const deferred = await sync.syncExternalImport(SAMPLE_PACKAGE, {
    label: 'offline_import.json',
  });
  assert.equal(deferred.status, 'deferred_offline');
  assert.equal((await db.getPendingQueue()).length, 1);

  // 2. Odzyskanie połączenia i wywołanie flushPendingQueue()
  online = true;
  const flushed = await sync.flushPendingQueue();
  assert.ok(flushed);
  assert.equal(flushed.status, 'synced');
  assert.equal(flushed.pendingQueueCount, 0);

  const sources = await db.getPriceSourcesRecord();
  assert.equal(sources.sekocenbud.hourlyLaborAvg, 37.5);
});
