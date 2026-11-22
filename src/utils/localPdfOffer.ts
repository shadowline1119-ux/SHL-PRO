import pdfMake from 'pdfmake/build/pdfmake';
import vfsFonts from 'pdfmake/build/vfs_fonts';
import { PRICE_SOURCES, SUBREGIONS } from '../data/dolnoslaskieRates';
import type {
  EstimateLineItem,
  EstimateSettings,
  OfferMetadata,
  PriceSourceId,
  PriceSourceMeta,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import { calculateEstimateSummary, calculateLineTotals, formatNumber, formatPLN } from './calculations';

let fontsRegistered = false;

function ensurePdfMakeFonts(): void {
  if (fontsRegistered) return;
  const instance = pdfMake as unknown as {
    addVirtualFileSystem?: (vfs: Record<string, string>) => void;
    vfs?: Record<string, string>;
  };
  const vfs = vfsFonts as unknown as Record<string, string>;
  if (typeof instance.addVirtualFileSystem === 'function') {
    instance.addVirtualFileSystem(vfs);
  } else {
    instance.vfs = vfs;
  }
  fontsRegistered = true;
}

export interface LocalOfferPdfInput {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  offer: OfferMetadata;
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
}

export function buildOfferPdfDocDefinition({
  items,
  settings,
  offer,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
}: LocalOfferPdfInput): Record<string, unknown> {
  const summary = calculateEstimateSummary(items, settings);
  const sourceMeta = priceSources[settings.sourceId] ?? PRICE_SOURCES[settings.sourceId];
  const subregionMeta = subregions[settings.subregionId] ?? SUBREGIONS[settings.subregionId];

  const tableBody = [
    [
      { text: 'Lp.', style: 'th', alignment: 'center' },
      { text: 'Podstawa KNR / BDO', style: 'th' },
      { text: 'Opis robót budowlanych', style: 'th' },
      { text: 'J.m.', style: 'th', alignment: 'center' },
      { text: 'Ilość', style: 'th', alignment: 'right' },
      { text: 'Cena jedn. netto', style: 'th', alignment: 'right' },
      { text: 'Wartość netto', style: 'th', alignment: 'right' },
    ],
    ...items.map((item, idx) => {
      const totals = calculateLineTotals(item, settings);
      const kCode = item.bdoCode ? `${item.knr}\nBDO: ${item.bdoCode}` : item.knr;
      return [
        { text: String(idx + 1), style: 'tdCenter' },
        { text: kCode, style: 'tdMono' },
        { text: item.name, style: 'td' },
        { text: item.unit, style: 'tdCenter' },
        { text: formatNumber(item.quantity, 2), style: 'tdRight' },
        { text: formatPLN(totals.unitNetRate), style: 'tdRight' },
        { text: formatPLN(totals.netTotal), style: 'tdRightBold' },
      ];
    }),
  ];

  return {
    pageSize: 'A4',
    pageMargins: [32, 36, 32, 42],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 8.5,
      color: '#0f172a',
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `SHL PRO · Oferta ${offer.offerNumber} · ${offer.contractorName}`,
          fontSize: 7.5,
          color: '#64748b',
          margin: [32, 10, 0, 0],
        },
        {
          text: `Strona ${currentPage} z ${pageCount}`,
          alignment: 'right',
          fontSize: 7.5,
          color: '#64748b',
          margin: [0, 10, 32, 0],
        },
      ],
    }),
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'OFERTA KOSZTORYSOWA', fontSize: 16, bold: true, color: '#0f172a' },
              {
                text: `Nr oferty: ${offer.offerNumber}  |  Data wystawienia: ${offer.issueDate}  |  Ważna do: ${offer.validUntil}`,
                fontSize: 8.5,
                color: '#475569',
                margin: [0, 3, 0, 0],
              },
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: 'SHL PRO', fontSize: 8, bold: true, color: '#b45309', alignment: 'right' },
              { text: subregionMeta.name, fontSize: 8.5, color: '#334155', alignment: 'right' },
              { text: `Baza cenowa: ${sourceMeta.name}`, fontSize: 7.5, color: '#64748b', alignment: 'right' },
            ],
          },
        ],
        margin: [0, 0, 0, 14],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 531, y2: 0, lineWidth: 1, lineColor: '#cbd5e1' }],
        margin: [0, 0, 0, 12],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'WYKONAWCA', fontSize: 7.5, bold: true, color: '#64748b', margin: [0, 0, 0, 3] },
              { text: offer.contractorName, bold: true, fontSize: 9 },
              { text: `NIP: ${offer.contractorNip}`, fontSize: 8 },
              { text: offer.contractorAddress, fontSize: 8 },
              { text: `Tel: ${offer.contractorPhone} · ${offer.contractorEmail}`, fontSize: 8, color: '#475569' },
            ],
          },
          { width: 18, text: '' },
          {
            width: '*',
            stack: [
              { text: 'ZAMAWIAJĄCY / INWESTOR', fontSize: 7.5, bold: true, color: '#64748b', margin: [0, 0, 0, 3] },
              { text: offer.clientName, bold: true, fontSize: 9 },
              { text: `NIP: ${offer.clientNip}`, fontSize: 8 },
              { text: offer.clientAddress, fontSize: 8 },
              { text: `Lokalizacja prac: ${offer.projectLocation}`, fontSize: 8, color: '#b45309', margin: [0, 2, 0, 0] },
            ],
          },
        ],
        margin: [0, 0, 0, 14],
      },
      {
        text: '1. Zestawienie kosztów szczegółowych (roboty ziemne, rozbiórkowe i drogowe)',
        fontSize: 10.5,
        bold: true,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: [20, 72, '*', 28, 46, 62, 68],
          body: tableBody,
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? '#0f172a' : rowIndex % 2 === 0 ? '#f8fafc' : null),
          hLineColor: () => '#e2e8f0',
          vLineColor: () => '#e2e8f0',
          paddingTop: () => 5,
          paddingBottom: () => 5,
          paddingLeft: () => 5,
          paddingRight: () => 5,
        },
        margin: [0, 0, 0, 14],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: '2. Struktura kosztów (R / M / S)', fontSize: 10, bold: true, margin: [0, 0, 0, 5] },
              {
                table: {
                  widths: ['*', 75, 45],
                  body: [
                    [{ text: 'Składnik', style: 'thSub' }, { text: 'Kwota netto', style: 'thSubRight' }, { text: 'Udział', style: 'thSubRight' }],
                    ['Robocizna (R)', { text: formatPLN(summary.laborTotal), alignment: 'right' }, { text: `${summary.laborSharePct}%`, alignment: 'right' }],
                    ['Materiały i utylizacja (M)', { text: formatPLN(summary.materialsTotal), alignment: 'right' }, { text: `${summary.materialsSharePct}%`, alignment: 'right' }],
                    ['Sprzęt i transport (S)', { text: formatPLN(summary.equipmentTotal), alignment: 'right' }, { text: `${summary.equipmentSharePct}%`, alignment: 'right' }],
                    [`Koszty pośrednie (Kp ${settings.indirectCostsPct}%)`, { text: formatPLN(summary.indirectCost), alignment: 'right' }, { text: '—', alignment: 'right' }],
                    [`Zysk kalkulacyjny (Z ${settings.profitPct}%)`, { text: formatPLN(summary.profit), alignment: 'right' }, { text: '—', alignment: 'right' }],
                  ],
                },
                layout: 'lightHorizontalLines',
              },
            ],
          },
          { width: 16, text: '' },
          {
            width: 205,
            stack: [
              { text: '3. Podsumowanie finansowe', fontSize: 10, bold: true, margin: [0, 0, 0, 5] },
              {
                table: {
                  widths: ['*', 'auto'],
                  body: [
                    ['Koszty bezpośrednie (R+M+S):', { text: formatPLN(summary.directTotal), alignment: 'right' }],
                    ['Narzuty (Kp + Z):', { text: formatPLN(summary.indirectCost + summary.profit), alignment: 'right' }],
                    ...((summary.riskReserveAmount ?? 0) > 0
                      ? [[`Ryzyko gruntowe (+${settings.soilRiskPct ?? 0}%):`, { text: formatPLN(summary.riskReserveAmount ?? 0), alignment: 'right' }]]
                      : []),
                    ...(summary.discountAmount > 0
                      ? [[`Rabat (${settings.discountPct}%):`, { text: `-${formatPLN(summary.discountAmount)}`, alignment: 'right', color: '#b45309' }]]
                      : []),
                    [{ text: 'RAZEM NETTO:', bold: true }, { text: formatPLN(summary.netTotal), bold: true, alignment: 'right' }],
                    [`Podatek VAT (${settings.vatRate}%):`, { text: formatPLN(summary.vatAmount), alignment: 'right' }],
                    [
                      { text: 'WARTOŚĆ BRUTTO:', bold: true, fontSize: 9.5, fillColor: '#f1f5f9' },
                      { text: formatPLN(summary.grossTotal), bold: true, fontSize: 9.5, alignment: 'right', fillColor: '#f1f5f9' },
                    ],
                  ],
                },
                layout: 'lightHorizontalLines',
              },
            ],
          },
        ],
        margin: [0, 0, 0, 14],
      },
      ...(summary.bdoSummary.length > 0
        ? [
            { text: '4. Szacowany bilans odpadów BDO', fontSize: 9.5, bold: true, margin: [0, 0, 0, 4] },
            {
              text: summary.bdoSummary
                .map((b) => `• Kod ${b.code}: ${formatNumber(b.quantity, 2)} ${b.unit}`)
                .join('   |   '),
              fontSize: 8,
              color: '#334155',
              margin: [0, 0, 0, 12],
            },
          ]
        : []),
      {
        text: '5. Warunki realizacji i ustalenia handlowe',
        fontSize: 9.5,
        bold: true,
        margin: [0, 0, 0, 5],
      },
      {
        ul: [
          `Termin wykonania robót: ${offer.executionTimeline}`,
          `Warunki płatności: ${offer.paymentTerms}`,
          `Okres gwarancji na wykonane prace ziemne/zagęszczenia: ${offer.warrantyMonths} miesięcy`,
          `Wyłączenia z zakresu oferty: ${offer.exclusions}`,
          `Uwagi dodatkowe: ${offer.additionalNotes}`,
        ],
        fontSize: 8,
        color: '#334155',
        margin: [0, 0, 0, 22],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: '..................................................', alignment: 'center', color: '#94a3b8' },
              { text: 'Podpis i pieczęć Wykonawcy', alignment: 'center', fontSize: 7.5, color: '#64748b' },
            ],
          },
          {
            width: '*',
            stack: [
              { text: '..................................................', alignment: 'center', color: '#94a3b8' },
              { text: 'Akceptacja Zamawiającego', alignment: 'center', fontSize: 7.5, color: '#64748b' },
            ],
          },
        ],
      },
    ],
    styles: {
      th: { fontSize: 7.5, bold: true, color: '#ffffff' },
      thSub: { fontSize: 7.5, bold: true, color: '#334155' },
      thSubRight: { fontSize: 7.5, bold: true, color: '#334155', alignment: 'right' },
      td: { fontSize: 8, color: '#0f172a' },
      tdMono: { fontSize: 7, color: '#475569' },
      tdCenter: { fontSize: 8, alignment: 'center', color: '#334155' },
      tdRight: { fontSize: 8, alignment: 'right', color: '#0f172a' },
      tdRightBold: { fontSize: 8, bold: true, alignment: 'right', color: '#0f172a' },
    },
  };
}

export async function generateLocalOfferPdfBytes(
  input: LocalOfferPdfInput
): Promise<{ bytes: Uint8Array; filename: string }> {
  ensurePdfMakeFonts();
  const docDef = buildOfferPdfDocDefinition(input);
  const pdfDoc = (pdfMake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Uint8Array | Buffer> };
  }).createPdf(docDef);

  const rawBuf = await pdfDoc.getBuffer();
  const bytes = rawBuf instanceof Uint8Array ? new Uint8Array(rawBuf) : new Uint8Array(rawBuf);
  const safeFileName = `Oferta_${(input.offer.offerNumber || 'SHL_PRO').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

  return {
    bytes,
    filename: safeFileName,
  };
}
