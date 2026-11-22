import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ACTIVE_DRAFT_ID,
  APP_FOLDER_NAME,
  LOCAL_SUBFOLDERS,
  LocalStorageEngine,
  stripSensitiveSecrets,
} from './localStorageEngine';
import { DEFAULT_ESTIMATE_SETTINGS, DEFAULT_OFFER_METADATA, DEFAULT_STRUCTURE_PARAMS } from '../src/data/dolnoslaskieRates';
import type { EstimateLineItem, SavedProjectEstimate } from '../src/types/estimator';

const tempRoots: string[] = [];

function makeTempEngine(): { engine: LocalStorageEngine; tmpRoot: string; appDataDir: string; docsBaseDir: string } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shadowline-test-'));
  tempRoots.push(tmpRoot);
  const appDataDir = path.join(tmpRoot, 'AppData');
  const docsBaseDir = path.join(tmpRoot, 'Documents');
  const engine = new LocalStorageEngine({
    appDataDir,
    documentsBaseDir: docsBaseDir,
    disableOsOpen: true,
  });
  return { engine, tmpRoot, appDataDir, docsBaseDir };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup issues
    }
  }
});

describe('LocalStorageEngine (SHL BASE disk & SQLite WAL)', () => {
  it('auto-creates SHL BASE root and all 6 required subfolders + WAL SQLite in AppData', () => {
    assert.equal(APP_FOLDER_NAME, 'SHL BASE');
    const { engine, appDataDir, docsBaseDir } = makeTempEngine();
    const status = engine.getStatus();

    const expectedRoot = path.join(docsBaseDir, APP_FOLDER_NAME);
    assert.equal(status.documentsRootPath, expectedRoot);
    assert.ok(fs.existsSync(expectedRoot));
    assert.equal(status.subfolders.length, 6);

    for (const sub of LOCAL_SUBFOLDERS) {
      const subPath = path.join(expectedRoot, sub);
      assert.ok(fs.existsSync(subPath), `Missing subfolder ${sub}`);
    }

    assert.ok(fs.existsSync(path.join(appDataDir, 'shadowline_kosztorys.db')));
    assert.equal(status.sqliteJournalMode, 'WAL');
    assert.equal(status.sqliteSynchronous, 'FULL');

    engine.close();
  });

  it('strips any sensitive auth/password keys and never writes plaintext secrets to disk or SQLite', () => {
    const sanitized = stripSensitiveSecrets({
      companyName: 'SHADOW-LINE Sp. z o.o.',
      password: 'should-not-be-saved',
      refreshToken: 'secret-jwt-token',
      nested: {
        accessToken: 'abc123',
        city: 'Lwówek Śląski',
      },
    }) as Record<string, unknown>;

    assert.equal(sanitized.companyName, 'SHADOW-LINE Sp. z o.o.');
    assert.equal('password' in sanitized, false);
    assert.equal('refreshToken' in sanitized, false);
    assert.deepEqual(sanitized.nested, { city: 'Lwówek Śląski' });
  });

  it('autosaves active draft, versions, company data, creates backups, and restores without data loss', () => {
    const { engine } = makeTempEngine();

    const sampleItem: EstimateLineItem = {
      id: 'item-1',
      knr: 'KNR 2-01',
      name: 'Wykopy koparką podławicową w gruncie kat. III',
      category: 'roboty_ziemne',
      unit: 'm³',
      quantity: 250,
      rateLabor: 22,
      rateMaterials: 0,
      rateEquipment: 48,
    };

    const snapshotV1: SavedProjectEstimate = {
      id: 'est-v1',
      projectKey: 'przebudowa_drogi',
      name: 'Przebudowa drogi powiatowej',
      versionNumber: 1,
      versionTag: 'Wstępny',
      versionNote: 'Wersja początkowa',
      createdAt: '2026-11-18T10:00:00.000Z',
      updatedAt: '2026-11-18T10:05:00.000Z',
      itemCount: 1,
      netTotal: 19500,
      items: [sampleItem],
      settings: DEFAULT_ESTIMATE_SETTINGS,
      structureParams: { ...DEFAULT_STRUCTURE_PARAMS, projectName: 'Przebudowa drogi powiatowej' },
      offer: DEFAULT_OFFER_METADATA,
    };

    engine.autosaveWorkspace({
      activeDraft: {
        projectName: 'Przebudowa drogi powiatowej',
        items: [sampleItem],
        settings: DEFAULT_ESTIMATE_SETTINGS,
        structureParams: { ...DEFAULT_STRUCTURE_PARAMS, projectName: 'Przebudowa drogi powiatowej' },
        offer: DEFAULT_OFFER_METADATA,
        netTotal: 19500,
      },
      companyProfile: {
        companyName: 'SHADOW-LINE Roboty Ziemne',
        companyNip: '6160001122',
        companyAddress: 'Lwówek Śląski',
        companyPhone: '+48 600 100 200',
        companyEmail: 'biuro@shadowline.pl',
      },
      savedEstimates: [snapshotV1],
    });

    const loaded = engine.loadWorkspaceSnapshot();
    assert.ok(loaded.activeDraft);
    assert.equal(loaded.activeDraft.items.length, 1);
    assert.equal(loaded.savedEstimates.length, 1);
    assert.equal(loaded.companyProfile?.companyName, 'SHADOW-LINE Roboty Ziemne');

    // Create manual backup
    const backup = engine.createBackup('Kopia przed przetargiem', 'manual');
    assert.ok(fs.existsSync(path.join(engine.getSubfolderPath('Kopie zapasowe'), backup.jsonFilename)));
    assert.ok(backup.dbFilename && fs.existsSync(path.join(engine.getSubfolderPath('Kopie zapasowe'), backup.dbFilename)));

    // Mutate project to simulate accidental wipe/edit, then restore backup
    engine.autosaveWorkspace({
      activeDraft: {
        projectName: 'Pusty roboczy',
        items: [],
        settings: DEFAULT_ESTIMATE_SETTINGS,
        structureParams: DEFAULT_STRUCTURE_PARAMS,
        offer: DEFAULT_OFFER_METADATA,
        netTotal: 0,
      },
    });
    assert.equal(engine.loadWorkspaceSnapshot().activeDraft?.items.length, 0);

    const restored = engine.restoreBackup(backup.id);
    assert.equal(restored.activeDraft?.items.length, 1);
    assert.equal(restored.activeDraft?.items[0].quantity, 250);
    assert.notEqual(backup.id, ACTIVE_DRAFT_ID);

    engine.close();
  });

  it('saves PDF/Excel exports directly into Oferty PDF and Eksport Excel and migrates documents folder cleanly', () => {
    const { engine, tmpRoot } = makeTempEngine();

    const pdfSave = engine.saveExportedFile('Oferty PDF', 'Oferta_2026_01.pdf', new Uint8Array([37, 80, 68, 70]));
    assert.ok(fs.existsSync(pdfSave.fullPath));
    assert.equal(pdfSave.sizeBytes, 4);

    const newDocsBase = path.join(tmpRoot, 'MovedDocuments');
    const migration = engine.changeDocumentsLocation(newDocsBase, true);
    assert.ok(migration.movedFiles >= 1);
    assert.ok(
      fs.existsSync(path.join(newDocsBase, APP_FOLDER_NAME, 'Oferty PDF', 'Oferta_2026_01.pdf'))
    );

    assert.throws(() => engine.purgeUserData('niepotwierdzone'));
    const purgeRes = engine.purgeUserData('USUŃ DANE');
    assert.equal(purgeRes.purged, true);

    engine.close();
  });

  it('migrates existing files from legacy SHADOW-LINE Kosztorys folder into SHL BASE automatically', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shl-migrate-'));
    tempRoots.push(tmpRoot);
    const appDataDir = path.join(tmpRoot, 'AppData');
    const docsBaseDir = path.join(tmpRoot, 'Documents');
    const legacyExportDir = path.join(docsBaseDir, 'SHADOW-LINE Kosztorys', 'Oferty PDF');
    fs.mkdirSync(legacyExportDir, { recursive: true });
    fs.writeFileSync(path.join(legacyExportDir, 'Stara_Oferta.pdf'), Buffer.from('PDF-TEST'));

    const engine = new LocalStorageEngine({
      appDataDir,
      documentsBaseDir: docsBaseDir,
      disableOsOpen: true,
    });

    const migratedFile = path.join(docsBaseDir, 'SHL BASE', 'Oferty PDF', 'Stara_Oferta.pdf');
    assert.ok(fs.existsSync(migratedFile));
    assert.equal(fs.readFileSync(migratedFile, 'utf8'), 'PDF-TEST');

    engine.close();
  });
});
