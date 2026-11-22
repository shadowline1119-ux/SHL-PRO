import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  DEFAULT_ESTIMATE_SETTINGS,
  DEFAULT_STRUCTURE_PARAMS,
  WORK_CATALOG,
} from '../data/dolnoslaskieRates';
import {
  calculateEstimateSummary,
  generateItemsFromStructureParams,
} from './calculations';
import { buildPrzedmiarCsv, sanitizeExportFilename } from './przedmiarCsv';
import { buildPrzedmiarWorkbookBuffer } from './przedmiarExcel';

test('buildPrzedmiarCsv outputs UTF-8 BOM, Polish headers, totals, and handles Excel PL vs Apple Numbers comma delimiters', () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  ).slice(0, 3);

  const csvSemicolon = buildPrzedmiarCsv({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    projectName: 'Hala Żelbetowa — Wrocław',
    delimiterMode: 'semicolon',
  });

  assert.ok(csvSemicolon.startsWith('\uFEFF'), 'Must include UTF-8 BOM for Excel/Numbers');
  assert.ok(csvSemicolon.includes('Podstawa / KNR;Kod BDO;Kategoria robót;Opis robót budowlanych'));
  assert.ok(csvSemicolon.includes('RAZEM WARTOŚĆ BRUTTO [zł]'));

  const csvComma = buildPrzedmiarCsv({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    projectName: 'Hala Żelbetowa — Wrocław',
    delimiterMode: 'comma',
  });
  assert.ok(csvComma.includes('Podstawa / KNR,Kod BDO,Kategoria robót,Opis robót budowlanych'));
});

test('sanitizeExportFilename transliterates Polish diacritics cleanly for iPadOS and Excel filenames', () => {
  assert.equal(
    sanitizeExportFilename('Rozbiórka obiektu — Łódź / Żmigród'),
    'Rozbiorka_obiektu_Lodz_Zmigrod'
  );
});

test('buildPrzedmiarWorkbookBuffer generates valid multi-sheet .xlsx with formulas and cached totals matching calculation engine', async () => {
  const items = generateItemsFromStructureParams(
    DEFAULT_STRUCTURE_PARAMS,
    WORK_CATALOG,
    DEFAULT_ESTIMATE_SETTINGS
  );
  const summary = calculateEstimateSummary(items, DEFAULT_ESTIMATE_SETTINGS);

  const buffer = await buildPrzedmiarWorkbookBuffer({
    items,
    settings: DEFAULT_ESTIMATE_SETTINGS,
    projectName: DEFAULT_STRUCTURE_PARAMS.projectName,
    location: 'Wrocław, ul. Fabryczna 14',
  });

  assert.ok(buffer.length > 5000);

  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheetNames = loaded.worksheets.map((w) => w.name);
  assert.deepEqual(sheetNames, ['Przedmiar robót', 'Zestawienie R-M-S', 'Odpady BDO']);

  const mainSheet = loaded.getWorksheet('Przedmiar robót')!;
  assert.equal(
    mainSheet.getCell('A1').value,
    'PRZEDMIAR ROBÓT ZIEMNYCH I ROZBIÓRKOWYCH'
  );
  assert.equal(mainSheet.getCell('E7').value, items[0].name);

  // Verify first item has formula + cached result for Apple Numbers & Excel
  const firstNetVal = mainSheet.getCell('L7').value as ExcelJS.CellFormulaValue;
  assert.ok(typeof firstNetVal === 'object' && 'formula' in firstNetVal);
  assert.ok(typeof firstNetVal.result === 'number' && firstNetVal.result > 0);

  // Verify summary gross row exists and cached value matches summary.grossTotal
  let foundGross = false;
  mainSheet.eachRow((row) => {
    if (row.getCell(9).value === 'WARTOŚĆ KOSZTORYSOWA BRUTTO:') {
      const val = row.getCell(12).value as ExcelJS.CellFormulaValue;
      assert.equal(val.result, summary.grossTotal);
      foundGross = true;
    }
  });
  assert.ok(foundGross, 'Gross summary row should exist in Przedmiar robót sheet');
});
