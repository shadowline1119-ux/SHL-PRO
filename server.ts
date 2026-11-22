import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { GoogleGenAI, Type } from '@google/genai';
import { PRICE_SOURCES, SUBREGIONS, WORK_CATALOG } from './src/data/dolnoslaskieRates.ts';
import { calculateEstimateSummary, calculateLineTotals, formatNumber, formatPLN } from './src/utils/calculations.ts';
import { sanitizeExportFilename } from './src/utils/przedmiarCsv.ts';
import { buildPrzedmiarWorkbookBuffer } from './src/utils/przedmiarExcel.ts';
import {
  buildQuarrySearchPrompt,
  formatQuarrySearchApiError,
  parseQuarrySearchResponse,
} from './src/utils/quarrySearch.ts';
import {
  isDolnoslaskieRelevantNotice,
  mapBzpNoticeToTender,
  type RawBzpNotice,
  stripHtmlToPlainText,
} from './src/utils/tenders.ts';
import {
  buildAutoEstimateForTender,
  extractTenderDataFromText,
} from './src/utils/tenderAutoEstimator.ts';
import {
  buildLocalBipSearchPrompt,
  formatLocalBipSearchError,
  LOCAL_BIP_REGIONS,
  parseLocalBipSearchResponse,
} from './src/utils/localBipTenders.ts';
import {
  buildDieselSearchPrompt,
  formatDieselSearchApiError,
  parseDieselSearchResponse,
} from './src/utils/dieselSearch.ts';
import type {
  AiAnalysisExtractedItem,
  DieselPriceBenchmarkMode,
  DolnoslaskieTenderItem,
  DolnoslaskieTendersResponse,
  EstimateLineItem,
  EstimateSettings,
  ExternalPriceListPackage,
  LocalBipRegionId,
  LocalSubfolderKey,
  OfferMetadata,
  SavedProjectEstimate,
} from './src/types/estimator.ts';
import {
  getSharedLocalStorageEngine,
  LOCAL_SUBFOLDERS,
  type WorkspaceAutosavePayload,
} from './server/localStorageEngine.ts';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
const RobotoFonts = require('pdfmake/fonts/Roboto');
pdfmake.addFonts(RobotoFonts);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '45mb' }));

const CATALOG_PROMPT_LIST = WORK_CATALOG.map(
  (c) => `${c.id} | ${c.knr} | ${c.name} | jedn: ${c.unit} | kat: ${c.category}${c.bdoCode ? ` | BDO: ${c.bdoCode}` : ''}`
).join('\n');

app.post('/api/analyze-docs', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'Brak skonfigurowanego klucza GEMINI_API_KEY po stronie serwera. Ustaw klucz w panelu Settings > Secrets i spróbuj ponownie.',
      });
      return;
    }

    const { textContent, fileBase64, fileMimeType, fileName, files } = req.body as {
      textContent?: string;
      fileBase64?: string;
      fileMimeType?: string;
      fileName?: string;
      files?: Array<{ name: string; mimeType: string; base64: string }>;
    };

    const normalizedFiles: Array<{ name: string; mimeType: string; base64: string }> =
      Array.isArray(files) && files.length > 0
        ? files.filter((f) => f && f.base64 && f.mimeType)
        : fileBase64 && fileMimeType
        ? [{ name: fileName || 'dokumentacja', mimeType: fileMimeType, base64: fileBase64 }]
        : [];

    if ((!textContent || !textContent.trim()) && normalizedFiles.length === 0) {
      res.status(400).json({
        error: 'Prześlij plik dokumentacji technicznej (ZIP/PDF/obraz/TXT) lub wklej opis zakresu robót.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = `Jesteś doświadczonym kosztorysantem robót ziemnych, inżynieryjnych i wyburzeniowych w województwie dolnośląskim (Polska).
Twoim zadaniem jest przeanalizować przekazaną dokumentację techniczną (projekt rozbiórki, specyfikację techniczną, opis geotechniczny, rysunek lub przedmiar — również w postaci wielu plików rozpakowanych z paczki ZIP) i wygenerować dokładny przedmiar robót oraz parametry obiektu.
Dopasowuj pozycje przedmiarowe przede wszystkim do poniższego katalogu robót (podaj dokładne pole catalogId z listy). Jeśli w dokumentacji występuje pozycja spoza katalogu, możesz użyć najbliższego odpowiednika lub pominąć catalogId i podać opis oraz KNR.
Dostępne subregiony woj. dolnośląskiego: 'wroclaw', 'legnica_glogow', 'walbrzych', 'jelenia_gora'.
Dostępne kategorie prac: 'roboty_ziemne', 'rozbiorki_wyburzenia', 'odwodnienie_zabezpieczenia', 'podbudowy_stabilizacja', 'transport_utylizacja'.
Dostępne jednostki: 'm³', 'm²', 'mb', 'szt.', 't', 'm-g', 'kpl.'.
Dostępne kategorie gruntu: 'I-II', 'III', 'IV'.

KATALOG POZYCJI:
${CATALOG_PROMPT_LIST}`;

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
    for (const f of normalizedFiles) {
      parts.push({
        inlineData: {
          mimeType: f.mimeType,
          data: f.base64,
        },
      });
    }

    const fileListSummary =
      normalizedFiles.length > 0
        ? `Załączone pliki dokumentacji (${normalizedFiles.length}):\n${normalizedFiles
            .map((f) => `- ${f.name} (${f.mimeType})`)
            .join('\n')}`
        : '';

    const userPrompt = [
      fileListSummary,
      textContent && textContent.trim()
        ? `Treść dokumentacji technicznej:\n${textContent.trim()}`
        : 'Przeanalizuj załączone dokumenty techniczne i wyodrębnij pełny zakres robót ziemnych oraz rozbiórkowych wraz z ilościami.',
    ]
      .filter(Boolean)
      .join('\n\n');

    parts.push({ text: userPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectTitle: { type: Type.STRING },
            detectedLocation: { type: Type.STRING },
            summary: { type: Type.STRING },
            recommendedSubregion: { type: Type.STRING },
            estimatedDimensions: {
              type: Type.OBJECT,
              properties: {
                lengthM: { type: Type.NUMBER },
                widthM: { type: Type.NUMBER },
                heightM: { type: Type.NUMBER },
                floors: { type: Type.NUMBER },
                excavationDepthM: { type: Type.NUMBER },
                soilCategory: { type: Type.STRING },
              },
              required: ['lengthM', 'widthM', 'heightM', 'floors', 'excavationDepthM', 'soilCategory'],
            },
            detectedBdoCodes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            risksAndAssumptions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  catalogId: { type: Type.STRING },
                  knr: { type: Type.STRING },
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  unit: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  bdoCode: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                },
                required: ['knr', 'name', 'category', 'unit', 'quantity', 'reasoning'],
              },
            },
          },
          required: [
            'projectTitle',
            'detectedLocation',
            'summary',
            'recommendedSubregion',
            'estimatedDimensions',
            'detectedBdoCodes',
            'risksAndAssumptions',
            'items',
          ],
        },
      },
    });

    const raw = (response.text ?? '{}').trim();
    const parsed = JSON.parse(raw);
    res.json({ analysis: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Nieznany błąd podczas analizy dokumentacji.';
    console.error('Gemini analyze-docs error:', message);
    res.status(500).json({
      error: `Błąd analizy dokumentacji technicznej: ${message}`,
    });
  }
});

app.post('/api/offer-pdf', async (req, res) => {
  try {
    const { items, settings, offer } = req.body as {
      items: EstimateLineItem[];
      settings: EstimateSettings;
      offer: OfferMetadata;
    };

    if (!Array.isArray(items) || !settings || !offer) {
      res.status(400).json({ error: 'Brak danych kosztorysu do wygenerowania pliku PDF.' });
      return;
    }

    const summary = calculateEstimateSummary(items, settings);
    const sourceMeta = PRICE_SOURCES[settings.sourceId];
    const subregionMeta = SUBREGIONS[settings.subregionId];

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

    const docDefinition = {
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
            text: `Oferta ${offer.offerNumber} · ${offer.contractorName}`,
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
                { text: 'WOJ. DOLNOŚLĄSKIE', fontSize: 8, bold: true, color: '#b45309', alignment: 'right' },
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
            {
              width: 18,
              text: '',
            },
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
          text: '1. Zestawienie kosztów szczegółowych (roboty ziemne i rozbiórkowe)',
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

    const buffer: Buffer = await pdfmake.createPdf(docDefinition).getBuffer();
    const safeFileName = `Oferta_${offer.offerNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.send(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Błąd generowania PDF';
    console.error('PDF generation error:', message);
    res.status(500).json({ error: `Nie udało się wygenerować pliku PDF: ${message}` });
  }
});

app.post('/api/przedmiar-xlsx', async (req, res) => {
  try {
    const { items, settings, projectName, location } = req.body as {
      items: EstimateLineItem[];
      settings: EstimateSettings;
      projectName?: string;
      location?: string;
    };

    if (!Array.isArray(items) || !settings) {
      res.status(400).json({ error: 'Brak pozycji przedmiaru do wygenerowania arkusza.' });
      return;
    }

    const buffer = await buildPrzedmiarWorkbookBuffer({
      items,
      settings,
      projectName,
      location,
    });

    const baseName = sanitizeExportFilename(projectName || 'Przedmiar_robot');
    const safeFileName = `${baseName}_${settings.sourceId}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.send(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Błąd generowania arkusza Excel/Numbers';
    console.error('XLSX generation error:', message);
    res.status(500).json({ error: `Nie udało się wygenerować pliku XLSX: ${message}` });
  }
});

app.post('/api/search-quarry-prices', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'Brak skonfigurowanego klucza GEMINI_API_KEY po stronie serwera. Ustaw klucz w panelu Settings > Secrets, aby wyszukiwać ceny kopalni w Google.',
      });
      return;
    }

    const { quarryQuery, materialQuery } = req.body as {
      quarryQuery?: string;
      materialQuery?: string;
    };

    const cleanQuarry = typeof quarryQuery === 'string' ? quarryQuery.trim() : '';
    const cleanMaterial = typeof materialQuery === 'string' ? materialQuery.trim() : '';

    if (cleanQuarry.length < 2) {
      res.status(400).json({
        error: 'Podaj nazwę lub miejscowość lokalnej kopalni (minimum 2 znaki), np. Kopalnia Bazaltu Sulików.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = buildQuarrySearchPrompt(cleanQuarry, cleanMaterial);

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const result = parseQuarrySearchResponse(
      response.text ?? '',
      cleanQuarry,
      groundingMetadata
    );

    res.json({ result });
  } catch (err: unknown) {
    const formatted = formatQuarrySearchApiError(err);
    console.error('Quarry Google Search error:', formatted.status, formatted.message);
    res.status(formatted.status).json({
      error: formatted.message,
    });
  }
});

app.post('/api/diesel-history-search', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'Brak skonfigurowanego klucza GEMINI_API_KEY po stronie serwera. Ustaw klucz w panelu Settings > Secrets, aby pobierać historyczne ceny oleju napędowego z Google Search.',
      });
      return;
    }

    const { benchmarkMode, subregionName } = req.body as {
      benchmarkMode?: DieselPriceBenchmarkMode;
      subregionName?: string;
    };

    const effectiveMode: DieselPriceBenchmarkMode =
      benchmarkMode === 'wholesale_orlen' ? 'wholesale_orlen' : 'retail_pl';

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = buildDieselSearchPrompt(
      effectiveMode,
      typeof subregionName === 'string' && subregionName.trim()
        ? subregionName.trim()
        : 'Dolny Śląsk'
    );

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const { result } = parseDieselSearchResponse(
      response.text ?? '',
      effectiveMode,
      groundingMetadata
    );

    if (result.monthlyPrices.length < 4) {
      res.status(422).json({
        error:
          'Google Search nie zwróciło wystarczającej liczby miesięcznych notowań cen ON do zbudowania serii 12M. Spróbuj ponownie lub zmień tryb notowań (detaliczny / hurtowy).',
        sources: result.sources,
      });
      return;
    }

    res.json({ result });
  } catch (err: unknown) {
    const formatted = formatDieselSearchApiError(err);
    console.error('Diesel Google Search error:', formatted.status, formatted.message);
    res.status(formatted.status).json({
      error: formatted.message,
    });
  }
});

const tendersCache = new Map<string, { expiresAt: number; payload: DolnoslaskieTendersResponse }>();
const tenderFullTextCache = new Map<string, string>();

app.get('/api/tenders', async (req, res) => {
  try {
    const rawDays = Number(req.query.days);
    const daysBack = Number.isFinite(rawDays) ? Math.min(45, Math.max(7, Math.round(rawDays))) : 21;
    const orderTypeParam = req.query.orderType === 'Works' ? 'Works' : 'all';
    const forceRefresh = req.query.refresh === '1';

    const cacheKey = `${daysBack}:${orderTypeParam}`;
    const cached = tendersCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      res.json(cached.payload);
      return;
    }

    const now = new Date();
    const from = new Date(now.getTime() - daysBack * 86400 * 1000);
    const toIso = now.toISOString().slice(0, 19);
    const fromIso = from.toISOString().slice(0, 19);

    const fetchBatch = async (
      batchFromIso: string,
      extraParams: Record<string, string>
    ): Promise<RawBzpNotice[]> => {
      const params = new URLSearchParams({
        NoticeType: 'ContractNotice',
        PublicationDateFrom: batchFromIso,
        PublicationDateTo: toIso,
        PageSize: '500',
        ...extraParams,
      });
      if (orderTypeParam === 'Works') {
        params.set('OrderType', 'Works');
      }
      const upstream = await fetch(
        `https://ezamowienia.gov.pl/mo-board/api/v1/notice?${params.toString()}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!upstream.ok) {
        throw new Error(`HTTP ${upstream.status} z serwera ezamowienia.gov.pl`);
      }
      const json = (await upstream.json()) as unknown;
      return Array.isArray(json) ? (json as RawBzpNotice[]) : [];
    };

    const fetchPl02Promise = (async () => {
      let pl02: RawBzpNotice[] = [];
      let cursorIso = fromIso;
      for (let batchIdx = 0; batchIdx < 4; batchIdx++) {
        const batch = await fetchBatch(cursorIso, { OrganizationProvince: 'PL02' });
        pl02 = pl02.concat(batch);
        if (batch.length < 500) break;
        const lastPub = batch[batch.length - 1]?.publicationDate;
        if (!lastPub) break;
        const nextMs = Date.parse(lastPub) + 1000;
        if (!Number.isFinite(nextMs) || nextMs >= now.getTime()) break;
        cursorIso = new Date(nextMs).toISOString().slice(0, 19);
      }
      return pl02;
    })();

    // Wody Polskie i KOWR często publikują z NIP-em centrali (PL14 Warszawa),
    // mimo że roboty dotyczą ZZ Lwówek Śląski / RZGW Wrocław / OT Wrocław.
    const fetchInstitutionalPromise = Promise.allSettled([
      fetchBatch(fromIso, { OrganizationName: 'Wody Polskie' }),
      fetchBatch(fromIso, { OrganizationName: 'Krajowy Ośrodek Wsparcia Rolnictwa' }),
    ]);

    const [pl02Notices, instResults] = await Promise.all([
      fetchPl02Promise,
      fetchInstitutionalPromise,
    ]);

    const extraInstNotices: RawBzpNotice[] = [];
    for (const r of instResults) {
      if (r.status === 'fulfilled') {
        for (const notice of r.value) {
          if (isDolnoslaskieRelevantNotice(notice)) {
            extraInstNotices.push(notice);
          }
        }
      }
    }

    const combined = pl02Notices.concat(extraInstNotices);

    const nowMs = Date.now();
    const seen = new Set<string>();
    const items: DolnoslaskieTenderItem[] = [];
    for (const raw of combined) {
      const mapped = mapBzpNoticeToTender(raw, nowMs);
      if (!mapped) continue;
      const dedupeKey = mapped.noticeNumber || mapped.id;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      if (raw.htmlBody) {
        const fullPlain = stripHtmlToPlainText(raw.htmlBody);
        if (fullPlain) {
          tenderFullTextCache.set(mapped.id, fullPlain);
          tenderFullTextCache.set(mapped.noticeNumber, fullPlain);
        }
      }
      items.push(mapped);
    }

    const payload: DolnoslaskieTendersResponse = {
      fetchedAt: new Date(nowMs).toISOString(),
      provinceCode: 'PL02',
      provinceName: 'Województwo dolnośląskie',
      daysBack,
      totalFetched: items.length,
      items,
    };

    tendersCache.set(cacheKey, {
      expiresAt: nowMs + 120 * 1000,
      payload,
    });

    res.json(payload);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Nieznany błąd połączenia z Biuletynem Zamówień Publicznych.';
    console.error('Tenders API error:', message);
    res.status(502).json({
      error: `Nie udało się pobrać aktualnych przetargów z e-Zamówienia (BZP): ${message}`,
    });
  }
});

app.post('/api/search-local-bip-tenders', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error:
          'Brak skonfigurowanego klucza GEMINI_API_KEY po stronie serwera. Ustaw klucz w Settings > Secrets, aby przeszukiwać BIP-y powiatowe, Wody Polskie i KOWR przez Google Search.',
      });
      return;
    }

    const { regionId, customQuery, activeOnly } = req.body as {
      regionId?: LocalBipRegionId;
      customQuery?: string;
      activeOnly?: boolean;
    };

    if (!regionId || !(regionId in LOCAL_BIP_REGIONS)) {
      res.status(400).json({
        error: 'Nieprawidłowy obszar wyszukiwania BIP / instytucji.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const prompt = buildLocalBipSearchPrompt(
      regionId,
      typeof customQuery === 'string' ? customQuery : '',
      activeOnly !== false
    );

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const result = parseLocalBipSearchResponse(
      response.text ?? '',
      regionId,
      typeof customQuery === 'string' ? customQuery : '',
      groundingMetadata
    );

    res.json({ result });
  } catch (err: unknown) {
    const formatted = formatLocalBipSearchError(err);
    console.error('Local BIP Google Search error:', formatted.status, formatted.message);
    res.status(formatted.status).json({
      error: formatted.message,
    });
  }
});

async function fetchExternalTenderPageSnapshot(targetUrl: string): Promise<{
  title?: string;
  excerpt?: string;
  docLinks?: { label: string; url: string }[];
}> {
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) return {};
  if (targetUrl.includes('ezamowienia.gov.pl/mp-client')) return {};

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain',
        'User-Agent': 'Mozilla/5.0 (compatible; TerenKosztBot/1.0)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(4500),
    });
    if (!resp.ok) return {};
    const ctype = (resp.headers.get('content-type') || '').toLowerCase();
    if (!ctype.includes('text/html') && !ctype.includes('text/plain')) {
      return {};
    }
    const html = await resp.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim();

    const docLinks: { label: string; url: string }[] = [];
    const seenUrls = new Set<string>();
    const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null && docLinks.length < 8) {
      const href = m[1].trim();
      const rawLabel = stripHtmlToPlainText(m[2]).replace(/\s+/g, ' ').trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      if (
        /\.(pdf|docx?|xlsx?|zip|rar|7z|csv|ath)(\?|$)/i.test(href) ||
        /przedmiar|kosztorys|swz|ogłoszen|ogloszen|załącznik|zalacznik|dokumentacj|specyfikacj/i.test(
          `${href} ${rawLabel}`
        )
      ) {
        try {
          const abs = new URL(href, targetUrl).toString();
          if (seenUrls.has(abs)) continue;
          seenUrls.add(abs);
          docLinks.push({
            label: rawLabel || abs.split('/').pop() || 'Załącznik SWZ',
            url: abs,
          });
        } catch {
          // Ignore malformed relative URL
        }
      }
    }

    const plain = stripHtmlToPlainText(html).replace(/\s+/g, ' ').trim();
    const excerpt = plain.length > 80 ? plain.slice(0, 3200) : undefined;

    return {
      title,
      excerpt,
      docLinks: docLinks.length > 0 ? docLinks : undefined,
    };
  } catch {
    return {};
  }
}

app.post('/api/tenders/auto-estimate', async (req, res) => {
  try {
    const { tender, settings, useAiRefinement } = req.body as {
      tender?: DolnoslaskieTenderItem;
      settings?: EstimateSettings;
      useAiRefinement?: boolean;
    };

    if (!tender || !tender.orderObject || !settings) {
      res.status(400).json({
        error: 'Brak wymaganych danych przetargu lub ustawień bazy cenowej.',
      });
      return;
    }

    const cachedPlain =
      tenderFullTextCache.get(tender.id) ||
      tenderFullTextCache.get(tender.noticeNumber) ||
      tender.extractedData?.fullDescription ||
      tender.shortDescription ||
      '';

    const portalSnapshot = await fetchExternalTenderPageSnapshot(tender.procedureUrl);

    const extracted = extractTenderDataFromText({
      plainText: cachedPlain,
      orderObject: tender.orderObject,
      organizationName: tender.organizationName,
      organizationCity: tender.organizationCity,
      cpvCode: tender.cpvCode,
      shortDescription: tender.shortDescription,
      externalPageTitle: portalSnapshot.title,
      externalPageExcerpt: portalSnapshot.excerpt,
      externalDocLinks: portalSnapshot.docLinks,
    });

    // Zachowaj pola wyodrębnione wcześniej jeśli cache serwera wygasł
    if (tender.extractedData) {
      extracted.referenceNumber = extracted.referenceNumber ?? tender.extractedData.referenceNumber;
      extracted.organizationNip = extracted.organizationNip ?? tender.extractedData.organizationNip;
      extracted.organizationRegon = extracted.organizationRegon ?? tender.extractedData.organizationRegon;
      extracted.organizationStreet = extracted.organizationStreet ?? tender.extractedData.organizationStreet;
      extracted.organizationPostalCode =
        extracted.organizationPostalCode ?? tender.extractedData.organizationPostalCode;
      extracted.executionPeriod = extracted.executionPeriod ?? tender.extractedData.executionPeriod;
      extracted.warrantyMonths = extracted.warrantyMonths ?? tender.extractedData.warrantyMonths;
      extracted.wadiumPln = extracted.wadiumPln ?? tender.extractedData.wadiumPln;
      extracted.experienceValuePln =
        extracted.experienceValuePln ?? tender.extractedData.experienceValuePln;
      extracted.experienceAreaM2 =
        extracted.experienceAreaM2 ?? tender.extractedData.experienceAreaM2;
      if (
        extracted.detectedQuantities.length === 0 &&
        tender.extractedData.detectedQuantities.length > 0
      ) {
        extracted.detectedQuantities = tender.extractedData.detectedQuantities;
      }
    }

    let aiItems: AiAnalysisExtractedItem[] | undefined;
    let aiWarning: string | null = null;
    let method: 'bzp_auto' | 'bzp_plus_portal' | 'ai_refined' = portalSnapshot.excerpt
      ? 'bzp_plus_portal'
      : 'bzp_auto';

    if (useAiRefinement) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        aiWarning =
          'Brak klucza GEMINI_API_KEY w Settings > Secrets — kalkulacja została wykonana automatycznie na bazie danych BZP i KNR.';
      } else {
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const prompt = [
            `Przetarg: ${tender.orderObject}`,
            `Zamawiający: ${tender.organizationName} (${tender.organizationCity})`,
            `Kody CPV: ${tender.cpvCode}`,
            extracted.wadiumPln ? `Wadium: ${extracted.wadiumPln} zł` : '',
            extracted.experienceAreaM2
              ? `Wymagane doświadczenie pow.: ${extracted.experienceAreaM2} m²`
              : '',
            extracted.executionPeriod ? `Okres realizacji: ${extracted.executionPeriod}` : '',
            `Opis przedmiotu zamówienia:\n${extracted.fullDescription}`,
            portalSnapshot.excerpt
              ? `Treść ze strony postępowania (${tender.procedureUrl}):\n${portalSnapshot.excerpt.slice(0, 1800)}`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n');

          const aiResponse = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              systemInstruction: `Jesteś kosztorysantem robót ziemnych, drogowych, wodnych i wyburzeniowych na Dolnym Śląsku. Na podstawie danych z przetargu wygeneruj konkretny przedmiar robót dopasowany do poniższego katalogu KNR (podaj dokładne catalogId). Jeśli przetarg nie podaje dokładnego przedmiaru, oszacuj realistyczne ilości inżynieryjne na bazie opisu, długości, powierzchni lub wadium.\n\nKATALOG:\n${CATALOG_PROMPT_LIST}`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        catalogId: { type: Type.STRING },
                        knr: { type: Type.STRING },
                        name: { type: Type.STRING },
                        category: { type: Type.STRING },
                        unit: { type: Type.STRING },
                        quantity: { type: Type.NUMBER },
                        bdoCode: { type: Type.STRING },
                        reasoning: { type: Type.STRING },
                      },
                      required: ['knr', 'name', 'category', 'unit', 'quantity', 'reasoning'],
                    },
                  },
                },
                required: ['items'],
              },
            },
          });

          const parsed = JSON.parse((aiResponse.text ?? '{}').trim()) as {
            items?: AiAnalysisExtractedItem[];
          };
          if (Array.isArray(parsed.items) && parsed.items.length > 0) {
            aiItems = parsed.items;
            method = 'ai_refined';
          }
        } catch (aiErr: unknown) {
          const msg = aiErr instanceof Error ? aiErr.message : String(aiErr ?? '');
          aiWarning = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')
            ? 'Limit zapytań Gemini API (429 RESOURCE_EXHAUSTED) — zastosowano automatyczną kalkulację z parametrów BZP i norm KNR.'
            : `Nie udało się uruchomić analizy AI (${msg}) — zastosowano automatyczną kalkulację z danych BZP i norm KNR.`;
        }
      }
    }

    const estimate = buildAutoEstimateForTender(tender, settings, {
      extractedOverride: extracted,
      calculationMethod: method,
      aiItems,
    });

    res.json({
      estimate,
      aiWarning,
      fetchedPortal: Boolean(portalSnapshot.excerpt || portalSnapshot.docLinks?.length),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Błąd automatycznej kalkulacji przetargu.';
    console.error('Tender auto-estimate error:', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'terenkoszt',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/price-lists/latest', (_req, res) => {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const boostCatalogIds = [
    'rz-humus',
    'rz-wykop-szeroko-3',
    'rz-wymiana-gruntu',
    'rz-korytowanie',
    'rw-budynek-murowany',
    'rw-nawierzchnia-asfalt',
    'ps-podbudowa-tluczen',
    'tu-wywoz-urobku',
    'tu-odpady-zmieszane',
  ];

  const workCatalogUpdates = boostCatalogIds
    .map((id) => WORK_CATALOG.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((item) => ({
      id: item.id,
      ratesBySource: {
        sekocenbud: {
          labor: r2(item.ratesBySource.sekocenbud.labor * 1.035),
          materials: r2(item.ratesBySource.sekocenbud.materials * 1.025),
          equipment: r2(item.ratesBySource.sekocenbud.equipment * 1.04),
        },
        intercenbud: {
          labor: r2(item.ratesBySource.intercenbud.labor * 1.035),
          materials: r2(item.ratesBySource.intercenbud.materials * 1.025),
          equipment: r2(item.ratesBySource.intercenbud.equipment * 1.04),
        },
        bistyp: {
          labor: r2(item.ratesBySource.bistyp.labor * 1.03),
          materials: r2(item.ratesBySource.bistyp.materials * 1.025),
          equipment: r2(item.ratesBySource.bistyp.equipment * 1.035),
        },
        orgbud: {
          labor: r2(item.ratesBySource.orgbud.labor * 1.03),
          materials: r2(item.ratesBySource.orgbud.materials * 1.02),
          equipment: r2(item.ratesBySource.orgbud.equipment * 1.035),
        },
        rynek_dolnoslaski: {
          labor: r2(item.ratesBySource.rynek_dolnoslaski.labor * 1.045),
          materials: r2(item.ratesBySource.rynek_dolnoslaski.materials * 1.03),
          equipment: r2(item.ratesBySource.rynek_dolnoslaski.equipment * 1.045),
        },
      },
    }));

  const payload: ExternalPriceListPackage = {
    version: '2026.Q4-DŚ-v2',
    publishedAt: new Date().toISOString(),
    quarter: 'IV kw. 2026 (aktualizacja listopad)',
    publisher: 'Biuletyn Regionalny Dolny Śląsk (Sekocenbud / Intercenbud / Kopalnie)',
    changelog: [
      'Korekta stawki robocizny budowlano-ziemnej (+3,5% do +4,5% r/r w bazie Rynek DŚ i Sekocenbud).',
      'Aktualizacja wskaźnika pracy ciężkiego sprzętu wyburzeniowego i koparek (+4,0%).',
      'Zaktualizowane cenniki netto kopalni bazaltu Wojciechów, piaskowni Czaple oraz granitu Strzegom.',
      'Korekta kosztów zagospodarowania odpadów mieszanych BDO 17 09 04.',
    ],
    priceSources: {
      sekocenbud: {
        quarter: 'IV kw. 2026',
        hourlyLaborAvg: 36.1,
        equipmentIndex: 1.08,
      },
      intercenbud: {
        quarter: 'IV kw. 2026 (wyd. 2)',
        hourlyLaborAvg: 34.6,
        equipmentIndex: 1.04,
      },
      bistyp: {
        quarter: 'IV kw. 2026',
        hourlyLaborAvg: 37.1,
        equipmentIndex: 1.11,
      },
      orgbud: {
        quarter: 'IV kw. 2026',
        hourlyLaborAvg: 33.8,
        equipmentIndex: 1.02,
      },
      rynek_dolnoslaski: {
        quarter: 'Listopad 2026',
        hourlyLaborAvg: 40.2,
        equipmentIndex: 1.14,
      },
    },
    subregions: {
      wroclaw: { multiplier: 1.07 },
      legnica_glogow: { multiplier: 1.03 },
      walbrzych: { multiplier: 0.99 },
      jelenia_gora: { multiplier: 1.01 },
    },
    workCatalogUpdates,
    quarryMaterialUpdates: [
      { id: 'woj-bazalt-0-31', priceNetPerUnit: 48.5 },
      { id: 'woj-bazalt-0-63', priceNetPerUnit: 44.0 },
      { id: 'cza-piasek-0-2', priceNetPerUnit: 48.0 },
      { id: 'cza-pospolka-0-31', priceNetPerUnit: 44.5 },
      { id: 'str-granit-0-31', priceNetPerUnit: 47.0 },
    ],
  };

  res.json(payload);
});

// ============================================================================
// SHADOW-LINE KOSZTORYS — Lokalny folder danych + SQLite AppData + Kopie zapasowe
// ============================================================================
const localEngine = getSharedLocalStorageEngine();

app.get('/api/local-storage/status', (_req, res) => {
  try {
    localEngine.initFoldersAndDb();
    res.json({ status: localEngine.getStatus() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd odczytu lokalnego magazynu.' });
  }
});

app.get('/api/local-storage/workspace', (_req, res) => {
  try {
    res.json({ workspace: localEngine.loadWorkspaceSnapshot() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd odczytu bazy SQLite.' });
  }
});

app.post('/api/local-storage/autosave', (req, res) => {
  try {
    const body = req.body as WorkspaceAutosavePayload;
    if (!body || !body.activeDraft) {
      res.status(400).json({ error: 'Brak danych roboczych kosztorysu do zapisania.' });
      return;
    }
    const status = localEngine.autosaveWorkspace(body);
    res.json({ ok: true, status });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd automatycznego zapisu do SQLite.' });
  }
});

app.post('/api/local-storage/save-project', (req, res) => {
  try {
    const { project, incrementRevision } = req.body as {
      project?: SavedProjectEstimate;
      incrementRevision?: boolean;
    };
    if (!project || !project.id) {
      res.status(400).json({ error: 'Brak danych projektu kosztorysu.' });
      return;
    }
    localEngine.saveProjectRecord(project, {
      syncStatus: project.syncStatus ?? 'pending_sync',
      incrementRevision: Boolean(incrementRevision),
    });
    res.json({ ok: true, status: localEngine.getStatus() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd zapisu projektu.' });
  }
});

app.post('/api/local-storage/mark-synced', (req, res) => {
  try {
    const { projectId, cloudRevision } = req.body as {
      projectId?: string;
      cloudRevision?: number;
    };
    if (!projectId) {
      res.status(400).json({ error: 'Brak identyfikatora projektu.' });
      return;
    }
    localEngine.markProjectSynced(projectId, Number(cloudRevision) || 1);
    res.json({ ok: true, status: localEngine.getStatus() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd aktualizacji statusu synchronizacji.' });
  }
});

app.delete('/api/local-storage/project/:id', (req, res) => {
  try {
    localEngine.deleteProjectSnapshot(req.params.id);
    res.json({ ok: true, status: localEngine.getStatus() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd oznaczania usunięcia projektu.' });
  }
});

app.post('/api/local-storage/save-export', (req, res) => {
  try {
    const { subfolder, filename, contentBase64, contentUtf8 } = req.body as {
      subfolder?: LocalSubfolderKey;
      filename?: string;
      contentBase64?: string;
      contentUtf8?: string;
    };
    if (!subfolder || !LOCAL_SUBFOLDERS.includes(subfolder) || !filename) {
      res.status(400).json({ error: 'Nieprawidłowy podkatalog docelowy lub nazwa pliku.' });
      return;
    }
    const payload =
      typeof contentBase64 === 'string' && contentBase64.length > 0
        ? Uint8Array.from(Buffer.from(contentBase64, 'base64'))
        : String(contentUtf8 || '');
    const saved = localEngine.saveExportedFile(subfolder, filename, payload);
    res.json({ ok: true, ...saved, status: localEngine.getStatus() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd zapisu pliku na dysk.' });
  }
});

app.post('/api/local-storage/open-folder', async (req, res) => {
  try {
    const { subfolder } = (req.body || {}) as { subfolder?: LocalSubfolderKey };
    const result = await localEngine.openDataFolder(subfolder);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Nie udało się otworzyć folderu danych.' });
  }
});

app.post('/api/local-storage/change-documents-location', (req, res) => {
  try {
    const { newBaseDir, moveExistingFiles } = req.body as {
      newBaseDir?: string;
      moveExistingFiles?: boolean;
    };
    if (!newBaseDir || !newBaseDir.trim()) {
      res.status(400).json({ error: 'Podaj nową ścieżkę katalogu nadrzędnego dla folderu SHL BASE.' });
      return;
    }
    const result = localEngine.changeDocumentsLocation(newBaseDir, moveExistingFiles !== false);
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Nie udało się zmienić lokalizacji dokumentów.' });
  }
});

app.get('/api/local-storage/backups', (_req, res) => {
  try {
    res.json({ backups: localEngine.listBackups() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd odczytu listy kopii zapasowych.' });
  }
});

app.post('/api/local-storage/backups', (req, res) => {
  try {
    const { label, backupType } = (req.body || {}) as {
      label?: string;
      backupType?: 'manual' | 'auto' | 'pre_sync';
    };
    const backup = localEngine.createBackup(label, backupType || 'manual');
    res.json({ ok: true, backup, backups: localEngine.listBackups(), status: localEngine.getStatus() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Błąd tworzenia kopii zapasowej.' });
  }
});

app.post('/api/local-storage/backups/:id/restore', (req, res) => {
  try {
    const workspace = localEngine.restoreBackup(req.params.id);
    res.json({ ok: true, workspace });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Nie udało się przywrócić kopii zapasowej.' });
  }
});

app.post('/api/local-storage/purge-user-data', (req, res) => {
  try {
    const { confirmPhrase } = (req.body || {}) as { confirmPhrase?: string };
    const result = localEngine.purgeUserData(String(confirmPhrase || ''));
    res.json({ ok: true, ...result, status: localEngine.getStatus() });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Odmowa usunięcia danych.' });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ...(disableHmr
          ? { hmr: false, ws: false }
          : { hmr: { server: httpServer }, ws: { server: httpServer } }),
      },
      ...(disableHmr
        ? {
            plugins: [
              {
                name: 'disable-vite-client-ws-when-hmr-off',
                enforce: 'post',
                transform(code, id) {
                  if (id.replace(/\\/g, '/').endsWith('/vite/dist/client/client.mjs')) {
                    const replaced = code.replace(
                      /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
                      'const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, send() {} });'
                    );
                    if (replaced !== code) {
                      return { code: replaced, map: null };
                    }
                  }
                },
              },
            ],
          }
        : {}),
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SHL PRO server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
