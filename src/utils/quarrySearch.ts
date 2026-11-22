import type {
  QuarryId,
  QuarryMaterialItem,
  QuarryMeta,
  QuarrySearchCandidate,
  QuarrySearchResponse,
  QuarrySearchSource,
  WorkCategory,
  WorkUnit,
} from '../types/estimator.ts';

const VALID_CATEGORIES: WorkCategory[] = [
  'roboty_ziemne',
  'rozbiorki_wyburzenia',
  'odwodnienie_zabezpieczenia',
  'podbudowy_stabilizacja',
  'transport_utylizacja',
];

export function normalizeWorkUnit(raw: unknown): WorkUnit {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 't' || s === 'tona' || s === 'tony' || s === 'ton') return 't';
  if (s === 'm³' || s === 'm3' || s === 'm^3') return 'm³';
  if (s === 'm²' || s === 'm2' || s === 'm^2') return 'm²';
  if (s === 'mb' || s === 'm' || s === 'm.b.') return 'mb';
  if (s === 'szt.' || s === 'szt' || s === 'sztuka') return 'szt.';
  if (s === 'kpl.' || s === 'kpl') return 'kpl.';
  return 't';
}

export function normalizeWorkCategory(raw: unknown): WorkCategory {
  if (typeof raw === 'string' && VALID_CATEGORIES.includes(raw as WorkCategory)) {
    return raw as WorkCategory;
  }
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s.includes('odwod') || s.includes('dren')) return 'odwodnienie_zabezpieczenia';
  if (s.includes('ziemn') || s.includes('zasyp') || s.includes('piasek')) return 'roboty_ziemne';
  return 'podbudowy_stabilizacja';
}

export function parsePolishNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : null;
  }
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\s+/g, '')
    .replace(/zł|pln|netto|brutto|\/t|\/m3|\/m³/gi, '')
    .replace(',', '.');
  const match = cleaned.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

export function extractGroundingSources(groundingMetadata: unknown): {
  sources: QuarrySearchSource[];
  webSearchQueries: string[];
} {
  if (!groundingMetadata || typeof groundingMetadata !== 'object') {
    return { sources: [], webSearchQueries: [] };
  }

  const meta = groundingMetadata as {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    webSearchQueries?: unknown[];
  };

  const seenUris = new Set<string>();
  const sources: QuarrySearchSource[] = [];

  if (Array.isArray(meta.groundingChunks)) {
    for (const chunk of meta.groundingChunks) {
      const uri = chunk?.web?.uri?.trim();
      if (!uri || seenUris.has(uri)) continue;
      seenUris.add(uri);
      sources.push({
        uri,
        title: chunk?.web?.title?.trim() || uri,
      });
    }
  }

  const webSearchQueries = Array.isArray(meta.webSearchQueries)
    ? meta.webSearchQueries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : [];

  return { sources, webSearchQueries };
}

function extractJsonObjectFromText(rawText: string): Record<string, unknown> | null {
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

export function buildQuarrySearchPrompt(quarryQuery: string, materialQuery?: string): string {
  const cleanQuarry = quarryQuery.trim();
  const cleanMaterial = materialQuery?.trim();
  return [
    `Wyszukaj w Google aktualne informacje handlowe, ofertę asortymentową oraz cenniki netto kruszyw budowlanych/drogowych dla konkretnej kopalni lub żwirowni w Polsce (preferencyjnie Dolny Śląsk): "${cleanQuarry}".`,
    cleanMaterial
      ? `Szczególnie uwzględnij materiał / frakcję: "${cleanMaterial}".`
      : 'Uwzględnij główne frakcje dostępne w tej kopalni (np. mieszanki 0-31,5 mm, 0-63 mm, tłuczeń, kliniec, grys, piasek, pospółka, kamień łamany).',
    'Jeśli cennik kopalni podaje ceny brutto (23% VAT), przelicz je na netto (podziel przez 1,23) i zaznacz to w priceNote.',
    'Jeśli kopalnia nie publikuje oficjalnego cennika w internecie, ale znaleziono jej asortyment lub orientacyjne ceny rynkowe w ogłoszeniach/hurtowniach lokalnych, oznacz priceConfidence jako "estimated" albo "missing" (i podaj priceNetPerUnit: null gdy brak wiarygodnej ceny). Nigdy nie zmyślaj cen jako "verified".',
    '',
    'Zwróć wynik WYŁĄCZNIE jako poprawny JSON (bez dodatkowego tekstu poza JSON-em) o następującej strukturze:',
    `{
  "quarryOfficialName": "pełna nazwa kopalni / żwirowni",
  "locality": "miejscowość, gmina / powiat",
  "summary": "zwięzłe podsumowanie (2-4 zdania po polsku) co znaleziono w Google Search, czy kopalnia publikuje cennik i z jakiego okresu pochodzą dane",
  "items": [
    {
      "quarryName": "krótka nazwa kopalni (np. Kopalnia Bazaltu Sulików)",
      "locality": "miejscowość",
      "name": "nazwa kruszywa / materiału z zastosowaniem",
      "fraction": "np. 0–31,5 mm",
      "rockType": "np. Bazalt / Granit / Żwir / Piasek / Melafir",
      "unit": "t",
      "bulkDensityTPerM3": 1.95,
      "priceNetPerUnit": 48.0,
      "priceConfidence": "verified | estimated | missing",
      "priceNote": "krótka informacja skąd pochodzi cena (np. cennik kopalni 2025/2026 netto loco kopalnia lub brak jawnej ceny)",
      "category": "podbudowy_stabilizacja | roboty_ziemne | odwodnienie_zabezpieczenia",
      "description": "krótki opis techniczny materiału"
    }
  ]
}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseQuarrySearchResponse(
  rawText: string,
  quarryQuery: string,
  groundingMetadata?: unknown
): QuarrySearchResponse {
  const { sources, webSearchQueries } = extractGroundingSources(groundingMetadata);
  const json = extractJsonObjectFromText(rawText);

  if (!json) {
    return {
      query: quarryQuery.trim(),
      quarryOfficialName: quarryQuery.trim(),
      locality: 'Dolny Śląsk / okolice',
      summary:
        rawText.trim() ||
        'Nie udało się odczytać ustrukturyzowanej listy pozycji z wyników wyszukiwania.',
      items: [],
      sources,
      webSearchQueries,
    };
  }

  const quarryOfficialName =
    typeof json.quarryOfficialName === 'string' && json.quarryOfficialName.trim()
      ? json.quarryOfficialName.trim()
      : quarryQuery.trim();

  const locality =
    typeof json.locality === 'string' && json.locality.trim()
      ? json.locality.trim()
      : 'Dolny Śląsk / okolice';

  const summary =
    typeof json.summary === 'string' && json.summary.trim()
      ? json.summary.trim()
      : `Wyniki wyszukiwania Google dla: ${quarryOfficialName}.`;

  const rawItems = Array.isArray(json.items) ? json.items : [];
  const items: QuarrySearchCandidate[] = [];

  rawItems.forEach((rawItem, idx) => {
    if (!rawItem || typeof rawItem !== 'object') return;
    const obj = rawItem as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) return;

    const parsedPrice = parsePolishNumber(obj.priceNetPerUnit);
    const rawConf = typeof obj.priceConfidence === 'string' ? obj.priceConfidence.trim() : '';
    let priceConfidence: QuarrySearchCandidate['priceConfidence'] =
      rawConf === 'verified' || rawConf === 'estimated' || rawConf === 'missing'
        ? rawConf
        : parsedPrice !== null
        ? 'estimated'
        : 'missing';

    if (parsedPrice === null) {
      priceConfidence = 'missing';
    }

    const density = parsePolishNumber(obj.bulkDensityTPerM3);
    const unit = normalizeWorkUnit(obj.unit);

    items.push({
      id: `gsearch-${idx}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
      quarryName:
        typeof obj.quarryName === 'string' && obj.quarryName.trim()
          ? obj.quarryName.trim()
          : quarryOfficialName,
      locality:
        typeof obj.locality === 'string' && obj.locality.trim()
          ? obj.locality.trim()
          : locality,
      name,
      fraction:
        typeof obj.fraction === 'string' && obj.fraction.trim() ? obj.fraction.trim() : '—',
      rockType:
        typeof obj.rockType === 'string' && obj.rockType.trim()
          ? obj.rockType.trim()
          : 'Kruszywo',
      unit,
      bulkDensityTPerM3:
        density !== null && density >= 0.5 && density <= 3.5
          ? density
          : unit === 't' || unit === 'm³'
          ? 1.85
          : undefined,
      priceNetPerUnit: parsedPrice,
      priceConfidence,
      priceNote:
        typeof obj.priceNote === 'string' && obj.priceNote.trim()
          ? obj.priceNote.trim()
          : parsedPrice !== null
          ? 'Cena orientacyjna znaleziona w Google Search'
          : 'Brak publicznego cennika — uzupełnij stawkę ręcznie',
      category: normalizeWorkCategory(obj.category),
      description:
        typeof obj.description === 'string' && obj.description.trim()
          ? obj.description.trim()
          : `Pozycja znaleziona przez Google Search dla ${quarryOfficialName}.`,
    });
  });

  return {
    query: quarryQuery.trim(),
    quarryOfficialName,
    locality,
    summary,
    items,
    sources,
    webSearchQueries,
  };
}

export function candidateToQuarryMaterialItem(
  candidate: QuarrySearchCandidate,
  overridePrice?: number | null,
  primarySource?: QuarrySearchSource
): QuarryMaterialItem {
  const effectivePrice =
    typeof overridePrice === 'number' && Number.isFinite(overridePrice) && overridePrice >= 0
      ? Math.round(overridePrice * 100) / 100
      : candidate.priceNetPerUnit ?? 0;

  return {
    id: `google-mat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    quarryId: 'lokalna_wyszukana',
    customQuarryName: candidate.quarryName,
    customLocality: candidate.locality,
    sourceUrl: primarySource?.uri,
    sourceTitle: primarySource?.title,
    name: candidate.name,
    fraction: candidate.fraction || '—',
    rockType: candidate.rockType || 'Kruszywo',
    unit: candidate.unit,
    bulkDensityTPerM3: candidate.bulkDensityTPerM3,
    priceNetPerUnit: effectivePrice,
    category: candidate.category,
    description: candidate.description,
    isCustom: true,
  };
}

export function getQuarryDisplayLabel(
  item: QuarryMaterialItem,
  quarries: Record<QuarryId, QuarryMeta>
): string {
  if (item.customQuarryName && item.customQuarryName.trim()) {
    return item.customQuarryName.trim();
  }
  return quarries[item.quarryId]?.shortName ?? 'Inna kopalnia';
}

export function getQuarryLocalityLabel(
  item: QuarryMaterialItem,
  quarries: Record<QuarryId, QuarryMeta>
): string {
  if (item.customLocality && item.customLocality.trim()) {
    return item.customLocality.trim();
  }
  return quarries[item.quarryId]?.locality ?? 'Dolny Śląsk';
}

export function formatQuarrySearchApiError(err: unknown): {
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

  if (parsedCode === 429 || parsedStatus === 'RESOURCE_EXHAUSTED' || rawMessage.includes('429')) {
    return {
      status: 429,
      message:
        'Przekroczono limit zapytań lub kwotę Gemini API (429 RESOURCE_EXHAUSTED). Odczekaj chwilę albo sprawdź plan i limit rozliczeniowy dla klucza API, a następnie spróbuj ponownie.',
    };
  }

  if (parsedCode === 401 || parsedCode === 403 || rawMessage.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'Klucz GEMINI_API_KEY jest nieprawidłowy lub nie ma uprawnień do Google Search Grounding. Zweryfikuj klucz w Settings > Secrets.',
    };
  }

  return {
    status: 500,
    message: `Błąd wyszukiwania cen kopalni w Google: ${parsedDetail || 'Nieznany błąd serwera.'}`,
  };
}

