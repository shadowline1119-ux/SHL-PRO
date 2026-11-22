import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractTechnicalDocsFromZip } from './zipDocs';

test('extractTechnicalDocsFromZip extracts PDF, PNG, and TXT while skipping DWG and __MACOSX', async () => {
  const zip = new JSZip();
  zip.file('01_opis_techniczny.txt', 'Rozbiórka hali stalowej 30x15m we Wrocławiu.');
  zip.file('rysunki/rzut_fundamentow.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  zip.file('rysunki/plan_sytuacyjny.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  zip.file('cad/projekt.dwg', new Uint8Array([0x41, 0x43, 0x31, 0x30]));
  zip.file('__MACOSX/._01_opis_techniczny.txt', 'junk');

  const buffer = await zip.generateAsync({ type: 'uint8array' });
  const result = await extractTechnicalDocsFromZip(buffer, 'projekt_wroclaw.zip');

  assert.equal(result.archiveName, 'projekt_wroclaw.zip');
  assert.equal(result.extractedTexts.length, 1);
  assert.equal(result.extractedTexts[0].name, '01_opis_techniczny.txt');
  assert.match(result.extractedTexts[0].content, /Wrocławiu/);

  assert.equal(result.attachments.length, 2);
  assert.deepEqual(
    result.attachments.map((a) => a.mimeType),
    ['image/png', 'application/pdf']
  );

  assert.equal(result.skippedFiles.length, 1);
  assert.equal(result.skippedFiles[0].name, 'cad/projekt.dwg');
});

test('extractTechnicalDocsFromZip rejects corrupted archive buffers', async () => {
  const broken = new Uint8Array([1, 2, 3, 4, 5]);
  await assert.rejects(
    () => extractTechnicalDocsFromZip(broken, 'uszkodzony.zip'),
    /End of data|zip/i
  );
});
