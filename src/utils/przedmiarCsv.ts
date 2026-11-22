import { CATEGORY_LABELS, PRICE_SOURCES, SUBREGIONS } from '../data/dolnoslaskieRates.ts';
import type { EstimateLineItem, EstimateSettings } from '../types/estimator.ts';
import { calculateEstimateSummary, calculateLineTotals } from './calculations.ts';

export type CsvDelimiterMode = 'semicolon' | 'comma';

export interface PrzedmiarExportInput {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  projectName?: string;
  location?: string;
  delimiterMode?: CsvDelimiterMode;
}

export function sanitizeExportFilename(name: string, fallback = 'Przedmiar_robot'): string {
  const plMap: Record<string, string> = {
    ą: 'a',
    ć: 'c',
    ę: 'e',
    ł: 'l',
    ń: 'n',
    ó: 'o',
    ś: 's',
    ź: 'z',
    ż: 'z',
    Ą: 'A',
    Ć: 'C',
    Ę: 'E',
    Ł: 'L',
    Ń: 'N',
    Ó: 'O',
    Ś: 'S',
    Ź: 'Z',
    Ż: 'Z',
  };
  const ascii = (name || '')
    .split('')
    .map((ch) => plMap[ch] ?? ch)
    .join('')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

  return ascii || fallback;
}

function escapeCsvCell(value: string | number, sep: string): string {
  const str = String(value ?? '');
  if (str.includes(sep) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvDecimal(value: number, sep: string): string {
  const fixed = (Number.isFinite(value) ? value : 0).toFixed(2);
  // W polskim Excelu przy separatorze ';' używa się przecinka dziesiętnego;
  // przy separatorze ',' (Apple Numbers EN / uniwersalny CSV) kropki dziesiętnej.
  return sep === ';' ? fixed.replace('.', ',') : fixed;
}

export function buildPrzedmiarCsv({
  items,
  settings,
  projectName,
  location,
  delimiterMode = 'semicolon',
}: PrzedmiarExportInput): string {
  const sep = delimiterMode === 'comma' ? ',' : ';';
  const summary = calculateEstimateSummary(items, settings);
  const sourceName = PRICE_SOURCES[settings.sourceId]?.name ?? settings.sourceId;
  const subregionName = SUBREGIONS[settings.subregionId]?.name ?? settings.subregionId;

  const metaLines: string[] = [
    ['Przedmiar robót ziemnych i rozbiórkowych', projectName || 'Inwestycja dolnośląska']
      .map((c) => escapeCsvCell(c, sep))
      .join(sep),
    ['Region / Baza cenowa', `${subregionName} · ${sourceName}`, location || '']
      .map((c) => escapeCsvCell(c, sep))
      .join(sep),
    [
      'Narzuty',
      `Kp ${settings.indirectCostsPct}% · Zysk ${settings.profitPct}% · Rabat ${settings.discountPct}% · VAT ${settings.vatRate}%`,
    ]
      .map((c) => escapeCsvCell(c, sep))
      .join(sep),
    '',
  ];

  const header = [
    'Lp.',
    'Podstawa / KNR',
    'Kod BDO',
    'Kategoria robót',
    'Opis robót budowlanych',
    'J.m.',
    'Ilość',
    'Stawka R [zł]',
    'Stawka M [zł]',
    'Stawka S [zł]',
    'Cena jedn. netto [zł]',
    'Wartość netto [zł]',
  ]
    .map((c) => escapeCsvCell(c, sep))
    .join(sep);

  const itemRows = items.map((item, idx) => {
    const t = calculateLineTotals(item, settings);
    return [
      idx + 1,
      escapeCsvCell(item.knr, sep),
      escapeCsvCell(item.bdoCode ?? '', sep),
      escapeCsvCell(CATEGORY_LABELS[item.category] ?? item.category, sep),
      escapeCsvCell(item.name, sep),
      escapeCsvCell(item.unit, sep),
      formatCsvDecimal(item.quantity, sep),
      formatCsvDecimal(item.rateLabor, sep),
      formatCsvDecimal(item.rateMaterials, sep),
      formatCsvDecimal(item.rateEquipment, sep),
      formatCsvDecimal(t.unitNetRate, sep),
      formatCsvDecimal(t.netTotal, sep),
    ].join(sep);
  });

  const makeTotalRow = (label: string, amount: number) =>
    ['', '', '', '', escapeCsvCell(label, sep), '', '', '', '', '', '', formatCsvDecimal(amount, sep)].join(
      sep
    );

  const footerRows: string[] = [
    '',
    makeTotalRow('Razem koszty bezpośrednie (R+M+S)', summary.directTotal),
    makeTotalRow(`Koszty pośrednie Kp (${settings.indirectCostsPct}%)`, summary.indirectCost),
    makeTotalRow(`Zysk kalkulacyjny (${settings.profitPct}%)`, summary.profit),
    ...(summary.discountAmount > 0
      ? [makeTotalRow(`Rabat handlowy (${settings.discountPct}%)`, -summary.discountAmount)]
      : []),
    makeTotalRow('RAZEM WARTOŚĆ NETTO [zł]', summary.netTotal),
    makeTotalRow(`Podatek VAT (${settings.vatRate}%)`, summary.vatAmount),
    makeTotalRow('RAZEM WARTOŚĆ BRUTTO [zł]', summary.grossTotal),
  ];

  return '\uFEFF' + [...metaLines, header, ...itemRows, ...footerRows].join('\r\n');
}
