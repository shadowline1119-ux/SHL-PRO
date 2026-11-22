import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIndexedDbManager,
  DEFAULT_CATALOG_VERSION,
} from './indexedDbManager';
import {
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_OFFER_METADATA,
  DEFAULT_STRUCTURE_PARAMS,
} from '../data/dolnoslaskieRates';
import { SavedProjectEstimate } from '../types/estimator';

test('indexedDbManager seeds all Dolny Śląsk price sources, subregions, KNR catalog, and quarries on boot', async () => {
  const manager = createIndexedDbManager({ idbFactory: null });
  await manager.initAndSeedDefaults();

  const snap = await manager.loadAllData();
  assert.equal(snap.storageMode, 'memory');
  assert.equal(snap.syncState.currentVersion, DEFAULT_CATALOG_VERSION);
  assert.equal(Object.keys(snap.priceSources).length, 5);
  assert.equal(Object.keys(snap.subregions).length, 4);
  assert.ok(snap.workCatalog.length >= 30);
  assert.ok(snap.quarryMaterials.length >= 18);
});

test('indexedDbManager persists custom edits to labor rates, KNR unit rates, and subregions', async () => {
  const manager = createIndexedDbManager({ idbFactory: null });
  await manager.initAndSeedDefaults();

  const sources = await manager.getPriceSourcesRecord();
  await manager.savePriceSource({
    ...sources.rynek_dolnoslaski,
    hourlyLaborAvg: 44.5,
    equipmentIndex: 1.18,
    isCustom: true,
  });

  const catalog = await manager.getWorkCatalog();
  const humus = catalog.find((c) => c.id === 'rz-humus')!;
  await manager.saveWorkCatalogItem({
    ...humus,
    isModifiedByUser: true,
    ratesBySource: {
      ...humus.ratesBySource,
      rynek_dolnoslaski: { labor: 9.9, materials: 0, equipment: 22.5 },
    },
  });

  const updatedSources = await manager.getPriceSourcesRecord();
  assert.equal(updatedSources.rynek_dolnoslaski.hourlyLaborAvg, 44.5);
  assert.equal(updatedSources.rynek_dolnoslaski.equipmentIndex, 1.18);
  assert.equal(updatedSources.rynek_dolnoslaski.isCustom, true);

  const updatedCatalog = await manager.getWorkCatalog();
  const updatedHumus = updatedCatalog.find((c) => c.id === 'rz-humus')!;
  assert.equal(updatedHumus.isModifiedByUser, true);
  assert.equal(updatedHumus.ratesBySource.rynek_dolnoslaski.labor, 9.9);
  assert.equal(updatedHumus.ratesBySource.rynek_dolnoslaski.equipment, 22.5);
});

test('indexedDbManager saves/deletes offline projects and preserves them when resetting price catalogs', async () => {
  const manager = createIndexedDbManager({ idbFactory: null });
  await manager.initAndSeedDefaults();

  const project: SavedProjectEstimate = {
    id: 'proj-test-1',
    name: 'Wykop pod halę Lwówek Śl.',
    clientName: 'Gmina Lwówek Śląski',
    location: 'Lwówek Śląski',
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    itemCount: 1,
    netTotal: 15000,
    items: [],
    settings: DEFAULT_ESTIMATE_SETTINGS,
    structureParams: DEFAULT_STRUCTURE_PARAMS,
    offer: DEFAULT_OFFER_METADATA,
  };

  await manager.saveEstimateProject(project);
  const loadedProjects = await manager.getSavedEstimates();
  assert.equal(loadedProjects.length, 1);
  assert.equal(loadedProjects[0].name, 'Wykop pod halę Lwówek Śl.');

  // Modyfikuj stawkę a następnie przywróć domyślne bazy — projekt użytkownika ma pozostać!
  const sources = await manager.getPriceSourcesRecord();
  await manager.savePriceSource({
    ...sources.sekocenbud,
    hourlyLaborAvg: 99,
  });

  const afterReset = await manager.resetPriceDatabasesToDefaults();
  assert.equal(afterReset.priceSources.sekocenbud.hourlyLaborAvg, 34.8);
  assert.equal(afterReset.savedEstimates.length, 1);

  const backup = await manager.exportDatabaseBackup();
  assert.equal(backup.appName, 'SHL PRO');
  assert.equal(backup.savedEstimates.length, 1);
  assert.ok(backup.workCatalog.length >= 30);

  const afterDelete = await manager.deleteSavedEstimate('proj-test-1');
  assert.equal(afterDelete.length, 0);
});

test('indexedDbManager persists multiple versioned snapshots of the same project over time', async () => {
  const manager = createIndexedDbManager({ idbFactory: null });
  await manager.initAndSeedDefaults();

  const base: Omit<SavedProjectEstimate, 'id' | 'versionNumber' | 'versionTag' | 'updatedAt' | 'createdAt' | 'netTotal'> = {
    projectKey: 'rozbiórka magazynu bolesławiec',
    name: 'Rozbiórka magazynu Bolesławiec',
    clientName: 'Powiat Bolesławiecki',
    location: 'Bolesławiec',
    itemCount: 3,
    items: [],
    settings: DEFAULT_ESTIMATE_SETTINGS,
    structureParams: DEFAULT_STRUCTURE_PARAMS,
    offer: DEFAULT_OFFER_METADATA,
  };

  await manager.saveEstimateProject({
    ...base,
    id: 'proj-v1',
    versionNumber: 1,
    versionTag: 'Wstępny',
    versionNote: 'Wersja przed wizją lokalną',
    netTotal: 42000,
    createdAt: '2026-11-18T08:00:00.000Z',
    updatedAt: '2026-11-18T08:00:00.000Z',
  });

  const list = await manager.saveEstimateProject({
    ...base,
    id: 'proj-v2',
    versionNumber: 2,
    versionTag: 'Ostateczny',
    versionNote: 'Po uzgodnieniu utylizacji azbestu',
    netTotal: 48500,
    createdAt: '2026-11-18T11:30:00.000Z',
    updatedAt: '2026-11-18T11:30:00.000Z',
  });

  assert.equal(list.length, 2);
  assert.equal(list[0].versionTag, 'Ostateczny');
  assert.equal(list[0].versionNumber, 2);
  assert.equal(list[1].versionTag, 'Wstępny');
  assert.equal(list[1].versionNumber, 1);
});
