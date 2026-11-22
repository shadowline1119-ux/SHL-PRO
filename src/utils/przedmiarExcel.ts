import ExcelJS from 'exceljs';
import { CATEGORY_LABELS, PRICE_SOURCES, SUBREGIONS } from '../data/dolnoslaskieRates.ts';
import type { EstimateLineItem, EstimateSettings } from '../types/estimator.ts';
import { calculateEstimateSummary, calculateLineTotals } from './calculations.ts';

export interface PrzedmiarExcelInput {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  projectName?: string;
  location?: string;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0F172A' },
};

const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' },
};

const ZEBRA_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' },
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFEF3C7' },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
};

export async function buildPrzedmiarWorkbookBuffer({
  items,
  settings,
  projectName,
  location,
}: PrzedmiarExcelInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SHL PRO';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = calculateEstimateSummary(items, settings);
  const sourceMeta = PRICE_SOURCES[settings.sourceId];
  const subregionMeta = SUBREGIONS[settings.subregionId];

  // =========================================================================
  // ARKUSZ 1: Przedmiar robót (Excel & Apple Numbers compatible)
  // =========================================================================
  const ws = workbook.addWorksheet('Przedmiar robót', {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  ws.columns = [
    { key: 'lp', width: 6 },
    { key: 'knr', width: 17 },
    { key: 'bdo', width: 12 },
    { key: 'category', width: 24 },
    { key: 'name', width: 46 },
    { key: 'unit', width: 8 },
    { key: 'qty', width: 12 },
    { key: 'rateL', width: 13 },
    { key: 'rateM', width: 13 },
    { key: 'rateS', width: 13 },
    { key: 'unitNet', width: 16 },
    { key: 'netTotal', width: 18 },
  ];

  // Title & Metadata block (Rows 1..4)
  ws.mergeCells('A1:L1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'PRZEDMIAR ROBÓT ZIEMNYCH I ROZBIÓRKOWYCH';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF0F172A' } };
  ws.getRow(1).height = 24;

  ws.mergeCells('A2:L2');
  const projectCell = ws.getCell('A2');
  projectCell.value = `Inwestycja: ${projectName || 'Inwestycja dolnośląska'}${
    location ? ` · Lokalizacja: ${location}` : ''
  }`;
  projectCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };

  ws.mergeCells('A3:L3');
  const sourceCell = ws.getCell('A3');
  sourceCell.value = `Region: ${subregionMeta?.name ?? settings.subregionId} · Baza cenowa: ${
    sourceMeta?.name ?? settings.sourceId
  } (${sourceMeta?.quarter ?? ''})`;
  sourceCell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF475569' } };

  // Row 4: Kalkulacyjne wskaźniki procentowe (odwołania w formułach Excel / Numbers)
  ws.getCell('A4').value = 'Parametry narzutów:';
  ws.getCell('A4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
  ws.mergeCells('A4:B4');

  ws.getCell('C4').value = 'Kp:';
  ws.getCell('C4').alignment = { horizontal: 'right' };
  ws.getCell('C4').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('D4').value = Math.max(0, Number(settings.indirectCostsPct) || 0) / 100;
  ws.getCell('D4').numFmt = '0.0%';
  ws.getCell('D4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };

  ws.getCell('E4').value = 'Zysk:';
  ws.getCell('E4').alignment = { horizontal: 'right' };
  ws.getCell('E4').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('F4').value = Math.max(0, Number(settings.profitPct) || 0) / 100;
  ws.getCell('F4').numFmt = '0.0%';
  ws.getCell('F4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };

  ws.getCell('G4').value = 'Rabat:';
  ws.getCell('G4').alignment = { horizontal: 'right' };
  ws.getCell('G4').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('H4').value = Math.min(50, Math.max(0, Number(settings.discountPct) || 0)) / 100;
  ws.getCell('H4').numFmt = '0.0%';
  ws.getCell('H4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };

  ws.getCell('I4').value = 'VAT:';
  ws.getCell('I4').alignment = { horizontal: 'right' };
  ws.getCell('I4').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('J4').value = settings.vatRate / 100;
  ws.getCell('J4').numFmt = '0%';
  ws.getCell('J4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };

  // Row 6: Table headers
  const headerRow = ws.getRow(6);
  headerRow.values = [
    'Lp.',
    'Podstawa / KNR',
    'Kod BDO',
    'Kategoria robót',
    'Opis robót budowlanych',
    'J.m.',
    'Ilość',
    'R / j.m. (zł)',
    'M / j.m. (zł)',
    'S / j.m. (zł)',
    'Cena j. netto (zł)',
    'Wartość netto (zł)',
  ];
  headerRow.height = 24;
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = HEADER_FILL;
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber === 1 || colNumber === 6 ? 'center' : colNumber >= 7 ? 'right' : 'left',
      wrapText: true,
    };
  });

  const firstItemRow = 7;
  items.forEach((item, idx) => {
    const r = firstItemRow + idx;
    const totals = calculateLineTotals(item, settings);
    const row = ws.getRow(r);

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = item.knr;
    row.getCell(3).value = item.bdoCode ?? '';
    row.getCell(4).value = CATEGORY_LABELS[item.category] ?? item.category;
    row.getCell(5).value = item.name;
    row.getCell(6).value = item.unit;
    row.getCell(7).value = Number(item.quantity) || 0;
    row.getCell(8).value = Number(item.rateLabor) || 0;
    row.getCell(9).value = Number(item.rateMaterials) || 0;
    row.getCell(10).value = Number(item.rateEquipment) || 0;

    // Formuła spójna z calculateLineTotals (Kp od R+S, Zysk od R+S+Kp, Rabat od całości)
    const netFormula =
      `ROUND((ROUND(G${r}*I${r},2)+ROUND(G${r}*H${r},2)+ROUND(G${r}*J${r},2)` +
      `+ROUND((ROUND(G${r}*H${r},2)+ROUND(G${r}*J${r},2))*$D$4,2)` +
      `+ROUND((ROUND(G${r}*H${r},2)+ROUND(G${r}*J${r},2)+ROUND((ROUND(G${r}*H${r},2)+ROUND(G${r}*J${r},2))*$D$4,2))*$F$4,2))*(1-$H$4),2)`;

    row.getCell(11).value = {
      formula: `IF(G${r}>0,ROUND(L${r}/G${r},2),ROUND(((H${r}+J${r})*(1+$D$4)*(1+$F$4)+I${r})*(1-$H$4),2))`,
      result: totals.unitNetRate,
    };
    row.getCell(12).value = {
      formula: netFormula,
      result: totals.netTotal,
    };

    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };

    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };

    for (const col of [8, 9, 10, 11, 12]) {
      row.getCell(col).numFmt = '#,##0.00 "zł"';
      row.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
    }
    row.getCell(12).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };

    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      if (c !== 12) {
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } };
      }
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) {
        cell.fill = ZEBRA_FILL;
      }
    }
    row.height = item.name.length > 52 ? 30 : 20;
  });

  const lastItemRow = items.length > 0 ? firstItemRow + items.length - 1 : firstItemRow;
  let summaryStartRow = (items.length > 0 ? lastItemRow : firstItemRow) + 2;

  const addSummaryRow = (
    label: string,
    formula: string | undefined,
    resultValue: number,
    options?: { bold?: boolean; highlight?: boolean }
  ) => {
    const r = summaryStartRow++;
    ws.mergeCells(`I${r}:K${r}`);
    const labelCell = ws.getCell(`I${r}`);
    labelCell.value = label;
    labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    labelCell.font = {
      name: 'Calibri',
      size: options?.bold ? 10.5 : 9.5,
      bold: Boolean(options?.bold),
      color: { argb: 'FF0F172A' },
    };

    const valCell = ws.getCell(`L${r}`);
    valCell.value = formula ? { formula, result: resultValue } : resultValue;
    valCell.numFmt = '#,##0.00 "zł"';
    valCell.alignment = { horizontal: 'right', vertical: 'middle' };
    valCell.font = {
      name: 'Calibri',
      size: options?.bold ? 10.5 : 9.5,
      bold: Boolean(options?.bold),
      color: { argb: options?.highlight ? 'FF92400E' : 'FF0F172A' },
    };

    for (let c = 9; c <= 12; c++) {
      const cell = ws.getCell(r, c);
      cell.border = THIN_BORDER;
      cell.fill = options?.highlight ? TOTAL_FILL : SUBHEADER_FILL;
    }
    ws.getRow(r).height = 20;
    return r;
  };

  if (items.length > 0) {
    addSummaryRow(
      'Koszty bezpośrednie (R+M+S):',
      `SUMPRODUCT(G${firstItemRow}:G${lastItemRow},H${firstItemRow}:H${lastItemRow})+SUMPRODUCT(G${firstItemRow}:G${lastItemRow},I${firstItemRow}:I${lastItemRow})+SUMPRODUCT(G${firstItemRow}:G${lastItemRow},J${firstItemRow}:J${lastItemRow})`,
      summary.directTotal
    );
    addSummaryRow(
      `Koszty pośrednie Kp (${settings.indirectCostsPct}% od R+S):`,
      undefined,
      summary.indirectCost
    );
    addSummaryRow(
      `Zysk kalkulacyjny (${settings.profitPct}% od R+S+Kp):`,
      undefined,
      summary.profit
    );
    if (summary.discountAmount > 0) {
      addSummaryRow(
        `Rabat handlowy (-${settings.discountPct}%):`,
        undefined,
        -summary.discountAmount
      );
    }
    const netRow = addSummaryRow(
      'RAZEM WARTOŚĆ NETTO:',
      `SUM(L${firstItemRow}:L${lastItemRow})`,
      summary.netTotal,
      { bold: true }
    );
    const vatRow = addSummaryRow(
      `Podatek VAT (${settings.vatRate}%):`,
      `ROUND(L${netRow}*$J$4,2)`,
      summary.vatAmount
    );
    addSummaryRow(
      'WARTOŚĆ KOSZTORYSOWA BRUTTO:',
      `L${netRow}+L${vatRow}`,
      summary.grossTotal,
      { bold: true, highlight: true }
    );
  }

  // =========================================================================
  // ARKUSZ 2: Zestawienie R-M-S
  // =========================================================================
  const wsRms = workbook.addWorksheet('Zestawienie R-M-S', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  wsRms.columns = [
    { key: 'cat', width: 32 },
    { key: 'count', width: 14 },
    { key: 'r', width: 18 },
    { key: 'm', width: 18 },
    { key: 's', width: 18 },
    { key: 'net', width: 20 },
  ];

  wsRms.mergeCells('A1:F1');
  wsRms.getCell('A1').value = 'ZESTAWIENIE KOSZTÓW ROBOCIZNY, MATERIAŁÓW I SPRZĘTU (R / M / S)';
  wsRms.getCell('A1').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } };
  wsRms.getRow(1).height = 24;

  const rmsHeader = wsRms.getRow(3);
  rmsHeader.values = [
    'Kategoria robót',
    'Liczba pozycji',
    'Robocizna R (zł)',
    'Materiały i BDO M (zł)',
    'Sprzęt S (zł)',
    'Razem netto z narzutami (zł)',
  ];
  rmsHeader.height = 22;
  rmsHeader.eachCell((cell, colNumber) => {
    cell.fill = HEADER_FILL;
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'right' };
  });

  const rmsStartRow = 4;
  summary.byCategory.forEach((cat, idx) => {
    const row = wsRms.getRow(rmsStartRow + idx);
    row.values = [
      cat.label,
      cat.itemCount,
      cat.laborTotal,
      cat.materialsTotal,
      cat.equipmentTotal,
      cat.netTotal,
    ];
    row.getCell(2).alignment = { horizontal: 'right' };
    for (const col of [3, 4, 5, 6]) {
      row.getCell(col).numFmt = '#,##0.00 "zł"';
      row.getCell(col).alignment = { horizontal: 'right' };
    }
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } };
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
    });
  });

  if (summary.byCategory.length > 0) {
    const rmsLastRow = rmsStartRow + summary.byCategory.length - 1;
    const totalRmsRow = wsRms.getRow(rmsLastRow + 1);
    totalRmsRow.getCell(1).value = 'RAZEM';
    totalRmsRow.getCell(2).value = { formula: `SUM(B${rmsStartRow}:B${rmsLastRow})`, result: items.length };
    totalRmsRow.getCell(3).value = { formula: `SUM(C${rmsStartRow}:C${rmsLastRow})`, result: summary.laborTotal };
    totalRmsRow.getCell(4).value = { formula: `SUM(D${rmsStartRow}:D${rmsLastRow})`, result: summary.materialsTotal };
    totalRmsRow.getCell(5).value = { formula: `SUM(E${rmsStartRow}:E${rmsLastRow})`, result: summary.equipmentTotal };
    totalRmsRow.getCell(6).value = { formula: `SUM(F${rmsStartRow}:F${rmsLastRow})`, result: summary.netTotal };
    for (const col of [3, 4, 5, 6]) {
      totalRmsRow.getCell(col).numFmt = '#,##0.00 "zł"';
    }
    totalRmsRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = TOTAL_FILL;
      cell.border = THIN_BORDER;
    });
  }

  // =========================================================================
  // ARKUSZ 3: Odpady BDO (jeśli występują)
  // =========================================================================
  if (summary.bdoSummary.length > 0) {
    const wsBdo = workbook.addWorksheet('Odpady BDO', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    wsBdo.columns = [
      { key: 'code', width: 16 },
      { key: 'items', width: 58 },
      { key: 'unit', width: 10 },
      { key: 'qty', width: 16 },
    ];

    wsBdo.mergeCells('A1:D1');
    wsBdo.getCell('A1').value = 'ZESTAWIENIE ODPADÓW I UROBKU DO EWIDENCJI BDO';
    wsBdo.getCell('A1').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } };
    wsBdo.getRow(1).height = 24;

    const bdoHeader = wsBdo.getRow(3);
    bdoHeader.values = ['Kod BDO', 'Powiązane pozycje w przedmiarze', 'J.m.', 'Łączna ilość'];
    bdoHeader.height = 22;
    bdoHeader.eachCell((cell, colNumber) => {
      cell.fill = HEADER_FILL;
      cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber === 3 ? 'center' : colNumber === 4 ? 'right' : 'left',
      };
    });

    summary.bdoSummary.forEach((bdo, idx) => {
      const row = wsBdo.getRow(4 + idx);
      row.values = [bdo.code, bdo.items.join(' · '), bdo.unit, bdo.quantity];
      row.getCell(2).alignment = { wrapText: true };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(4).alignment = { horizontal: 'right' };
      row.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } };
        cell.border = THIN_BORDER;
        if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
      });
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function buildPrzedmiarWorkbookBytes(
  input: PrzedmiarExcelInput
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SHL PRO';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const { items, settings, projectName, location } = input;
  const summary = calculateEstimateSummary(items, settings);
  const sourceMeta = PRICE_SOURCES[settings.sourceId];
  const subregionMeta = SUBREGIONS[settings.subregionId];

  const ws = workbook.addWorksheet('Przedmiar robót', {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  ws.columns = [
    { key: 'lp', width: 6 },
    { key: 'knr', width: 17 },
    { key: 'bdo', width: 12 },
    { key: 'category', width: 24 },
    { key: 'name', width: 46 },
    { key: 'unit', width: 8 },
    { key: 'qty', width: 12 },
    { key: 'rateL', width: 13 },
    { key: 'rateM', width: 13 },
    { key: 'rateS', width: 13 },
    { key: 'unitNet', width: 16 },
    { key: 'netTotal', width: 18 },
  ];

  ws.mergeCells('A1:L1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'SHL PRO — PRZEDMIAR ROBÓT';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF0F172A' } };
  ws.getRow(1).height = 24;

  ws.mergeCells('A2:L2');
  const projectCell = ws.getCell('A2');
  projectCell.value = `Inwestycja: ${projectName || 'Inwestycja dolnośląska'}${
    location ? ` · Lokalizacja: ${location}` : ''
  }`;
  projectCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };

  ws.mergeCells('A3:L3');
  const sourceCell = ws.getCell('A3');
  sourceCell.value = `Region: ${subregionMeta?.name ?? settings.subregionId} · Baza cenowa: ${
    sourceMeta?.name ?? settings.sourceId
  } (${sourceMeta?.quarter ?? ''})`;
  sourceCell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF475569' } };

  ws.getCell('A4').value = 'Parametry narzutów:';
  ws.getCell('A4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
  ws.mergeCells('A4:B4');

  ws.getCell('C4').value = 'Kp:';
  ws.getCell('C4').alignment = { horizontal: 'right' };
  ws.getCell('C4').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('D4').value = Math.max(0, Number(settings.indirectCostsPct) || 0) / 100;
  ws.getCell('D4').numFmt = '0.0%';
  ws.getCell('D4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };

  ws.getCell('E4').value = 'Zysk:';
  ws.getCell('E4').alignment = { horizontal: 'right' };
  ws.getCell('E4').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('F4').value = Math.max(0, Number(settings.profitPct) || 0) / 100;
  ws.getCell('F4').numFmt = '0.0%';
  ws.getCell('F4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };

  ws.getCell('G4').value = 'Rabat:';
  ws.getCell('G4').alignment = { horizontal: 'right' };
  ws.getCell('G4').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('H4').value = Math.min(50, Math.max(0, Number(settings.discountPct) || 0)) / 100;
  ws.getCell('H4').numFmt = '0.0%';
  ws.getCell('H4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };

  ws.getCell('I4').value = 'VAT:';
  ws.getCell('I4').alignment = { horizontal: 'right' };
  ws.getCell('I4').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('J4').value = settings.vatRate / 100;
  ws.getCell('J4').numFmt = '0%';
  ws.getCell('J4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };

  const headerRow = ws.getRow(6);
  headerRow.values = [
    'Lp.',
    'Podstawa / KNR',
    'Kod BDO',
    'Kategoria robót',
    'Opis robót budowlanych',
    'J.m.',
    'Ilość',
    'R / j.m. (zł)',
    'M / j.m. (zł)',
    'S / j.m. (zł)',
    'Cena j. netto (zł)',
    'Wartość netto (zł)',
  ];
  headerRow.height = 24;
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = HEADER_FILL;
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNumber === 1 || colNumber === 6 ? 'center' : colNumber >= 7 ? 'right' : 'left',
      wrapText: true,
    };
  });

  const firstItemRow = 7;
  items.forEach((item, idx) => {
    const r = firstItemRow + idx;
    const totals = calculateLineTotals(item, settings);
    const row = ws.getRow(r);

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = item.knr;
    row.getCell(3).value = item.bdoCode ?? '';
    row.getCell(4).value = CATEGORY_LABELS[item.category] ?? item.category;
    row.getCell(5).value = item.name;
    row.getCell(6).value = item.unit;
    row.getCell(7).value = Number(item.quantity) || 0;
    row.getCell(8).value = Number(item.rateLabor) || 0;
    row.getCell(9).value = Number(item.rateMaterials) || 0;
    row.getCell(10).value = Number(item.rateEquipment) || 0;

    const netFormula =
      `ROUND((ROUND(G${r}*I${r},2)+ROUND(G${r}*H${r},2)+ROUND(G${r}*J${r},2)` +
      `+ROUND((ROUND(G${r}*H${r},2)+ROUND(G${r}*J${r},2))*$D$4,2)` +
      `+ROUND((ROUND(G${r}*H${r},2)+ROUND(G${r}*J${r},2)+ROUND((ROUND(G${r}*H${r},2)+ROUND(G${r}*J${r},2))*$D$4,2))*$F$4,2))*(1-$H$4),2)`;

    row.getCell(11).value = {
      formula: `IF(G${r}>0,ROUND(L${r}/G${r},2),ROUND(((H${r}+J${r})*(1+$D$4)*(1+$F$4)+I${r})*(1-$H$4),2))`,
      result: totals.unitNetRate,
    };
    row.getCell(12).value = {
      formula: netFormula,
      result: totals.netTotal,
    };

    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };

    for (const col of [8, 9, 10, 11, 12]) {
      row.getCell(col).numFmt = '#,##0.00 "zł"';
      row.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
    }
    row.getCell(12).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };

    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      if (c !== 12) {
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } };
      }
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
    }
    row.height = item.name.length > 52 ? 30 : 20;
  });

  const lastItemRow = items.length > 0 ? firstItemRow + items.length - 1 : firstItemRow;
  let summaryStartRow = (items.length > 0 ? lastItemRow : firstItemRow) + 2;

  const addSummaryRow = (
    label: string,
    formula: string | undefined,
    resultValue: number,
    options?: { bold?: boolean; highlight?: boolean }
  ) => {
    const r = summaryStartRow++;
    ws.mergeCells(`I${r}:K${r}`);
    const labelCell = ws.getCell(`I${r}`);
    labelCell.value = label;
    labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    labelCell.font = {
      name: 'Calibri',
      size: options?.bold ? 10.5 : 9.5,
      bold: Boolean(options?.bold),
      color: { argb: 'FF0F172A' },
    };

    const valCell = ws.getCell(`L${r}`);
    valCell.value = formula ? { formula, result: resultValue } : resultValue;
    valCell.numFmt = '#,##0.00 "zł"';
    valCell.alignment = { horizontal: 'right', vertical: 'middle' };
    valCell.font = {
      name: 'Calibri',
      size: options?.bold ? 10.5 : 9.5,
      bold: Boolean(options?.bold),
      color: { argb: options?.highlight ? 'FF92400E' : 'FF0F172A' },
    };

    for (let c = 9; c <= 12; c++) {
      const cell = ws.getCell(r, c);
      cell.border = THIN_BORDER;
      cell.fill = options?.highlight ? TOTAL_FILL : SUBHEADER_FILL;
    }
    ws.getRow(r).height = 20;
    return r;
  };

  if (items.length > 0) {
    addSummaryRow(
      'Koszty bezpośrednie (R+M+S):',
      `SUMPRODUCT(G${firstItemRow}:G${lastItemRow},H${firstItemRow}:H${lastItemRow})+SUMPRODUCT(G${firstItemRow}:G${lastItemRow},I${firstItemRow}:I${lastItemRow})+SUMPRODUCT(G${firstItemRow}:G${lastItemRow},J${firstItemRow}:J${lastItemRow})`,
      summary.directTotal
    );
    addSummaryRow(`Koszty pośrednie Kp (${settings.indirectCostsPct}% od R+S):`, undefined, summary.indirectCost);
    addSummaryRow(`Zysk kalkulacyjny (${settings.profitPct}% od R+S+Kp):`, undefined, summary.profit);
    if (summary.discountAmount > 0) {
      addSummaryRow(`Rabat handlowy (-${settings.discountPct}%):`, undefined, -summary.discountAmount);
    }
    const netRow = addSummaryRow('RAZEM WARTOŚĆ NETTO:', `SUM(L${firstItemRow}:L${lastItemRow})`, summary.netTotal, { bold: true });
    const vatRow = addSummaryRow(`Podatek VAT (${settings.vatRate}%):`, `ROUND(L${netRow}*$J$4,2)`, summary.vatAmount);
    addSummaryRow('WARTOŚĆ KOSZTORYSOWA BRUTTO:', `L${netRow}+L${vatRow}`, summary.grossTotal, { bold: true, highlight: true });
  }

  const wsRms = workbook.addWorksheet('Zestawienie R-M-S', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  wsRms.columns = [
    { key: 'cat', width: 32 },
    { key: 'count', width: 14 },
    { key: 'r', width: 18 },
    { key: 'm', width: 18 },
    { key: 's', width: 18 },
    { key: 'net', width: 20 },
  ];
  wsRms.mergeCells('A1:F1');
  wsRms.getCell('A1').value = 'ZESTAWIENIE KOSZTÓW ROBOCIZNY, MATERIAŁÓW I SPRZĘTU (R / M / S)';
  wsRms.getCell('A1').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } };
  wsRms.getRow(1).height = 24;

  const rmsHeader = wsRms.getRow(3);
  rmsHeader.values = ['Kategoria robót', 'Liczba pozycji', 'Robocizna R (zł)', 'Materiały i BDO M (zł)', 'Sprzęt S (zł)', 'Razem netto z narzutami (zł)'];
  rmsHeader.height = 22;
  rmsHeader.eachCell((cell, colNumber) => {
    cell.fill = HEADER_FILL;
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'right' };
  });

  const rmsStartRow = 4;
  summary.byCategory.forEach((cat, idx) => {
    const row = wsRms.getRow(rmsStartRow + idx);
    row.values = [cat.label, cat.itemCount, cat.laborTotal, cat.materialsTotal, cat.equipmentTotal, cat.netTotal];
    row.getCell(2).alignment = { horizontal: 'right' };
    for (const col of [3, 4, 5, 6]) {
      row.getCell(col).numFmt = '#,##0.00 "zł"';
      row.getCell(col).alignment = { horizontal: 'right' };
    }
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } };
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
    });
  });

  if (summary.byCategory.length > 0) {
    const rmsLastRow = rmsStartRow + summary.byCategory.length - 1;
    const totalRmsRow = wsRms.getRow(rmsLastRow + 1);
    totalRmsRow.getCell(1).value = 'RAZEM';
    totalRmsRow.getCell(2).value = { formula: `SUM(B${rmsStartRow}:B${rmsLastRow})`, result: items.length };
    totalRmsRow.getCell(3).value = { formula: `SUM(C${rmsStartRow}:C${rmsLastRow})`, result: summary.laborTotal };
    totalRmsRow.getCell(4).value = { formula: `SUM(D${rmsStartRow}:D${rmsLastRow})`, result: summary.materialsTotal };
    totalRmsRow.getCell(5).value = { formula: `SUM(E${rmsStartRow}:E${rmsLastRow})`, result: summary.equipmentTotal };
    totalRmsRow.getCell(6).value = { formula: `SUM(F${rmsStartRow}:F${rmsLastRow})`, result: summary.netTotal };
    for (const col of [3, 4, 5, 6]) totalRmsRow.getCell(col).numFmt = '#,##0.00 "zł"';
    totalRmsRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = TOTAL_FILL;
      cell.border = THIN_BORDER;
    });
  }

  if (summary.bdoSummary.length > 0) {
    const wsBdo = workbook.addWorksheet('Odpady BDO', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    wsBdo.columns = [
      { key: 'code', width: 16 },
      { key: 'items', width: 58 },
      { key: 'unit', width: 10 },
      { key: 'qty', width: 16 },
    ];
    wsBdo.mergeCells('A1:D1');
    wsBdo.getCell('A1').value = 'ZESTAWIENIE ODPADÓW I UROBKU DO EWIDENCJI BDO';
    wsBdo.getCell('A1').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } };
    wsBdo.getRow(1).height = 24;

    const bdoHeader = wsBdo.getRow(3);
    bdoHeader.values = ['Kod BDO', 'Powiązane pozycje w przedmiarze', 'J.m.', 'Łączna ilość'];
    bdoHeader.height = 22;
    bdoHeader.eachCell((cell, colNumber) => {
      cell.fill = HEADER_FILL;
      cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 3 ? 'center' : colNumber === 4 ? 'right' : 'left' };
    });

    summary.bdoSummary.forEach((bdo, idx) => {
      const row = wsBdo.getRow(4 + idx);
      row.values = [bdo.code, bdo.items.join(' · '), bdo.unit, bdo.quantity];
      row.getCell(2).alignment = { wrapText: true };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(4).alignment = { horizontal: 'right' };
      row.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } };
        cell.border = THIN_BORDER;
        if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
      });
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(arrayBuffer);
}
