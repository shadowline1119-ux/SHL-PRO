import type {
  DieselGoogleSearchResponse,
  DieselMonthlyPriceItem,
  DieselPriceBenchmarkMode,
  QuarrySearchSource,
} from '../types/estimator.ts';
import { extractGroundingSources } from './quarrySearch.ts';

export const DIESEL_HISTORY_MONTHS: ReadonlyArray<{
  monthKey: string;
  monthLabel: string;
  polishMonthName: string;
}> = [
  { monthKey: '2025-12', monthLabel: 'gru 25', polishMonthName: 'grudzień 2025' },
  { monthKey: '2026-01', monthLabel: 'sty 26', polishMonthName: 'styczeń 2026' },
  { monthKey: '2026-02', monthLabel: 'lut 26', polishMonthName: 'luty 2026' },
  { monthKey: '2026-03', monthLabel: 'mar 26', polishMonthName: 'marzec 2026' },
  { monthKey: '2026-04', monthLabel: 'kwi 26', polishMonthName: 'kwiecień 2026' },
  { monthKey: '2026-05', monthLabel: 'maj 26', polishMonthName: 'maj 2026' },
  { monthKey: '2026-06', monthLabel: 'cze 26', polishMonthName: 'czerwiec 2026' },
  { monthKey: '2026-07', monthLabel: 'lip 26', polishMonthName: 'lipiec 2026' },
  { monthKey: '2026-08', monthLabel: 'sie 26', polishMonthName: 'sierpień 2026' },
  { monthKey: '2026-09', monthLabel: 'wrz 26', polishMonthName: 'wrzesień 2026' },
  { monthKey: '2026-10', monthLabel: 'paź 26', polishMonthName: 'październik 2026' },
  { monthKey: '2026-11', monthLabel: 'lis 26', polishMonthName: 'listopad 2026' },
];

export const DEFAULT_DIESEL_BENCHMARK_SERIES: Record<
  DieselPriceBenchmarkMode,
  DieselMonthlyPriceItem[]
> = {
  retail_pl: [
    { monthKey: '2025-12', monthLabel: 'gru 25', pricePlnPerL: 6.08 },
    { monthKey: '2026-01', monthLabel: 'sty 26', pricePlnPerL: 6.04 },
    { monthKey: '2026-02', monthLabel: 'lut 26', pricePlnPerL: 6.07 },
    { monthKey: '2026-03', monthLabel: 'mar 26', pricePlnPerL: 6.15 },
    { monthKey: '2026-04', monthLabel: 'kwi 26', pricePlnPerL: 6.23 },
    { monthKey: '2026-05', monthLabel: 'maj 26', pricePlnPerL: 6.29 },
    { monthKey: '2026-06', monthLabel: 'cze 26', pricePlnPerL: 6.35 },
    { monthKey: '2026-07', monthLabel: 'lip 26', pricePlnPerL: 6.41 },
    { monthKey: '2026-08', monthLabel: 'sie 26', pricePlnPerL: 6.38 },
    { monthKey: '2026-09', monthLabel: 'wrz 26', pricePlnPerL: 6.34 },
    { monthKey: '2026-10', monthLabel: 'paź 26', pricePlnPerL: 6.31 },
    { monthKey: '2026-11', monthLabel: 'lis 26', pricePlnPerL: 6.27 },
  ],
  wholesale_orlen: [
    { monthKey: '2025-12', monthLabel: 'gru 25', pricePlnPerL: 4.72 },
    { monthKey: '2026-01', monthLabel: 'sty 26', pricePlnPerL: 4.69 },
    { monthKey: '2026-02', monthLabel: 'lut 26', pricePlnPerL: 4.71 },
    { monthKey: '2026-03', monthLabel: 'mar 26', pricePlnPerL: 4.78 },
    { monthKey: '2026-04', monthLabel: 'kwi 26', pricePlnPerL: 4.85 },
    { monthKey: '2026-05', monthLabel: 'maj 26', pricePlnPerL: 4.91 },
    { monthKey: '2026-06', monthLabel: 'cze 26', pricePlnPerL: 4.96 },
    { monthKey: '2026-07', monthLabel: 'lip 26', pricePlnPerL: 5.02 },
    { monthKey: '2026-08', monthLabel: 'sie 26', pricePlnPerL: 4.99 },
    { monthKey: '2026-09', monthLabel: 'wrz 26', pricePlnPerL: 4.95 },
    { monthKey: '2026-10', monthLabel: 'paź 26', pricePlnPerL: 4.92 },
    { monthKey: '2026-11', monthLabel: 'lis 26', pricePlnPerL: 4.89 },
  ],
};

export function parseDieselPriceNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 3.2 && raw <= 11.5
      ? Math.round(raw * 100) / 100
      : null;
  }
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\s+/g, '')
    .replace(/zł\/l|zł|pln\/l|pln|netto|brutto/gi, '')
    .replace(',', '.');
  const match = cleaned.match(/\d+(\.\d+)?/);
  if (!match) return null;
  let val = Number(match[0]);
  // Jeśli cena hurtowa była podana w zł/m³ (np. 4920 zł/1000 l), przelicz na zł/l
  if (val > 1000 && val < 12000) {
    val = val / 1000;
  }
  if (!Number.isFinite(val) || val < 3.2 || val > 11.5) return null;
  return Math.round(val * 100) / 100;
}

export function buildDieselSearchPrompt(
  benchmarkMode: DieselPriceBenchmarkMode,
  subregionName = 'Dolny Śląsk'
): string {
  const modeDesc =
    benchmarkMode === 'wholesale_orlen'
      ? 'hurtowe ceny netto oleju napędowego Ekodiesel (PKN ORLEN / Aramco) przeliczone na zł/litr netto (bez VAT)'
      : `średnie detaliczne ceny oleju napędowego (ON) na stacjach paliw w Polsce (szczególnie ${subregionName}, e-petrol.pl, Autocentrum, BM Reflex) w zł/litr brutto`;

  const monthList = DIESEL_HISTORY_MONTHS.map(
    (m) => `${m.monthKey} (${m.polishMonthName})`
  ).join(', ');

  return [
    `Wyszukaj w Google rzeczywiste historyczne oraz bieżące średnie miesięczne ceny oleju napędowego (ON) w Polsce za okres ostatnich 12 miesięcy: ${monthList}.`,
    `Interesuje nas wskaźnik: ${modeDesc}.`,
    'Zwróć wynik WYŁĄCZNIE jako poprawny JSON (bez dodatkowego komentarza poza JSON-em) o następującej strukturze:',
    `{
  "fuelStationReference": "krótka nazwa źródła rynkowego, np. e-petrol.pl / PKN ORLEN Hurt",
  "summary": "2-3 zdania po polsku podsumowujące trend cen oleju napędowego w ostatnich 12 miesiącach na podstawie znalezionych źródeł",
  "monthlyPrices": [
    { "monthKey": "2025-12", "pricePlnPerL": 6.12 }
  ]
}`,
    'Podaj wpisy dla wszystkich 12 miesięcy od 2025-12 do 2026-11 w zł/l (liczba dziesiętna z dokładnością do 2 miejsc, np. 6.24). Jeśli dla któregoś starszego miesiąca brak dokładnej wartości w wynikach wyszukiwania, pomiń ten miesiąc zamiast wpisywać zero.',
  ].join('\n');
}

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    candidates.unshift(fenceMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export function normalizeMonthlyPricesTo12Months(
  rawEntries: Array<{ monthKey?: string; pricePlnPerL?: unknown }>
): DieselMonthlyPriceItem[] {
  const knownByIndex = new Array<number | null>(DIESEL_HISTORY_MONTHS.length).fill(null);

  for (const entry of rawEntries) {
    if (!entry || typeof entry.monthKey !== 'string') continue;
    const key = entry.monthKey.trim().slice(0, 7);
    const idx = DIESEL_HISTORY_MONTHS.findIndex((m) => m.monthKey === key);
    if (idx === -1) continue;
    const parsed = parseDieselPriceNumber(entry.pricePlnPerL);
    if (parsed !== null) {
      knownByIndex[idx] = parsed;
    }
  }

  const validIndices: number[] = [];
  knownByIndex.forEach((v, idx) => {
    if (v !== null) validIndices.push(idx);
  });

  if (validIndices.length < 4) {
    return [];
  }

  // Uzupełnij brakujące punkty pośrednie wyłącznie przez interpolację między zweryfikowanymi punktami
  const filled: number[] = knownByIndex.map((v) => v ?? 0);
  const firstValidIdx = validIndices[0];
  const lastValidIdx = validIndices[validIndices.length - 1];

  for (let i = 0; i < firstValidIdx; i++) {
    filled[i] = knownByIndex[firstValidIdx]!;
  }
  for (let i = lastValidIdx + 1; i < filled.length; i++) {
    filled[i] = knownByIndex[lastValidIdx]!;
  }

  for (let k = 0; k < validIndices.length - 1; k++) {
    const startIdx = validIndices[k];
    const endIdx = validIndices[k + 1];
    const startVal = knownByIndex[startIdx]!;
    const endVal = knownByIndex[endIdx]!;
    const span = endIdx - startIdx;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const t = (i - startIdx) / span;
      filled[i] = Math.round((startVal + (endVal - startVal) * t) * 100) / 100;
    }
  }

  return DIESEL_HISTORY_MONTHS.map((m, idx) => ({
    monthKey: m.monthKey,
    monthLabel: m.monthLabel,
    pricePlnPerL: filled[idx],
  }));
}

export function parseDieselSearchResponse(
  rawText: string,
  benchmarkMode: DieselPriceBenchmarkMode,
  groundingMetadata?: unknown
): {
  result: DieselGoogleSearchResponse;
  sources: QuarrySearchSource[];
} {
  const { sources, webSearchQueries } = extractGroundingSources(groundingMetadata);
  const json = extractJsonObject(rawText);

  const rawList = Array.isArray(json?.monthlyPrices)
    ? (json.monthlyPrices as Array<{ monthKey?: string; pricePlnPerL?: unknown }>)
    : [];
  const monthlyPrices = normalizeMonthlyPricesTo12Months(rawList);

  const fuelStationReference =
    typeof json?.fuelStationReference === 'string' && json.fuelStationReference.trim()
      ? json.fuelStationReference.trim()
      : benchmarkMode === 'wholesale_orlen'
      ? 'PKN ORLEN Hurt (Ekodiesel)'
      : 'Średnie ceny stacji paliw w Polsce (Google Search)';

  const summary =
    typeof json?.summary === 'string' && json.summary.trim()
      ? json.summary.trim()
      : rawText.trim() ||
        'Pobrano historyczne notowania oleju napędowego z Google Search.';

  return {
    sources,
    result: {
      benchmarkMode,
      fetchedAt: new Date().toISOString(),
      summary,
      fuelStationReference,
      monthlyPrices,
      sources,
      webSearchQueries,
    },
  };
}

export function formatDieselSearchApiError(err: unknown): {
  status: number;
  message: string;
} {
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  let parsedCode: number | undefined;
  let parsedStatus = '';
  let parsedDetail = rawMessage;

  try {
    const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]) as {
        error?: { code?: number; status?: string; message?: string };
      };
      if (obj?.error) {
        parsedCode = obj.error.code;
        parsedStatus = obj.error.status ?? '';
        parsedDetail = obj.error.message ?? rawMessage;
      }
    }
  } catch {
    // Keep raw message if not JSON
  }

  if (
    parsedCode === 429 ||
    parsedStatus === 'RESOURCE_EXHAUSTED' ||
    rawMessage.includes('429')
  ) {
    return {
      status: 429,
      message:
        'Przekroczono limit zapytań lub kwotę Gemini API (429 RESOURCE_EXHAUSTED). Odczekaj chwilę lub sprawdź ustawienia klucza API, a następnie spróbuj ponownie.',
    };
  }

  if (
    parsedCode === 401 ||
    parsedCode === 403 ||
    rawMessage.includes('API_KEY_INVALID')
  ) {
    return {
      status: 403,
      message:
        'Klucz GEMINI_API_KEY jest nieprawidłowy lub nie ma uprawnień do Google Search Grounding. Zweryfikuj klucz w Settings > Secrets.',
    };
  }

  return {
    status: 500,
    message: `Błąd pobierania cen oleju napędowego z Google Search: ${
      parsedDetail || 'Nieznany błąd serwera.'
    }`,
  };
}
