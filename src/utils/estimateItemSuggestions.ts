import { CATEGORY_LABELS, SUBREGIONS } from '../data/dolnoslaskieRates';
import {
  CatalogWorkItem,
  EstimateLineItem,
  EstimateSettings,
  SubregionId,
  SubregionMeta,
  WorkCategory,
  WorkUnit,
} from '../types/estimator';

export interface EstimateItemSuggestion {
  id: string;
  sourceType: 'estimate' | 'catalog';
  sourceLabel: string;
  catalogId?: string;
  knr: string;
  name: string;
  category: WorkCategory;
  unit: WorkUnit;
  rateLabor: number;
  rateMaterials: number;
  rateEquipment: number;
  directUnitCost: number;
  bdoCode?: string;
  isCustom: boolean;
  patch: Partial<EstimateLineItem>;
}

const POLISH_CHAR_MAP: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

export function normalizePolishSearchText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => POLISH_CHAR_MAP[ch] ?? ch)
    .replace(/\s+/g, ' ')
    .trim();
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function scoreMatch(
  normalizedQuery: string,
  tokens: string[],
  name: string,
  knr: string,
  extra: string
): number {
  const normName = normalizePolishSearchText(name);
  const normKnr = normalizePolishSearchText(knr);
  const normExtra = normalizePolishSearchText(extra);
  const combined = `${normName} ${normKnr} ${normExtra}`;

  for (const token of tokens) {
    if (!combined.includes(token)) {
      return -1;
    }
  }

  let score = 10;
  if (normName.startsWith(normalizedQuery) || normKnr.startsWith(normalizedQuery)) {
    score += 100;
  } else if (
    normName.split(/\s+/).some((w) => w.startsWith(normalizedQuery))
  ) {
    score += 65;
  } else if (normName.includes(normalizedQuery)) {
    score += 45;
  } else if (normKnr.includes(normalizedQuery)) {
    score += 40;
  }

  // Dodatkowe punkty za dopasowanie poszczególnych słów w nazwie
  for (const token of tokens) {
    if (normName.includes(token)) score += 12;
    if (normKnr.includes(token)) score += 10;
  }

  return score;
}

export function findEstimateItemSuggestions(input: {
  query: string;
  workCatalog: CatalogWorkItem[];
  existingEstimateItems: EstimateLineItem[];
  settings: EstimateSettings;
  subregions?: Record<SubregionId, SubregionMeta>;
  excludeItemId?: string;
  limit?: number;
}): EstimateItemSuggestion[] {
  const {
    query,
    workCatalog,
    existingEstimateItems,
    settings,
    subregions = SUBREGIONS,
    excludeItemId,
    limit = 8,
  } = input;

  const normQuery = normalizePolishSearchText(query);
  if (!normQuery) return [];

  const tokens = normQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  const subregionMult =
    (subregions[settings.subregionId] ?? SUBREGIONS[settings.subregionId])?.multiplier ?? 1;

  interface ScoredCandidate {
    score: number;
    dedupKey: string;
    suggestion: EstimateItemSuggestion;
  }

  const candidates: ScoredCandidate[] = [];

  // 1. Pozycje już obecne w aktywnym kosztorysie (w tym własne zdefiniowane przez użytkownika)
  for (const row of existingEstimateItems) {
    if (excludeItemId && row.id === excludeItemId) continue;
    if (!row.name.trim()) continue;

    const catLabel = CATEGORY_LABELS[row.category] ?? '';
    const baseScore = scoreMatch(
      normQuery,
      tokens,
      row.name,
      row.knr,
      `${catLabel} ${row.bdoCode ?? ''} ${row.notes ?? ''}`
    );
    if (baseScore < 0) continue;

    const directUnitCost = round2(
      row.rateLabor + row.rateMaterials + row.rateEquipment
    );
    const dedupKey = `${normalizePolishSearchText(row.knr)}::${normalizePolishSearchText(row.name)}`;

    candidates.push({
      score: baseScore + 8, // Lekki priorytet dla pozycji już użytych na liście
      dedupKey,
      suggestion: {
        id: `est:${row.id}`,
        sourceType: 'estimate',
        sourceLabel: 'Już w kosztorysie',
        catalogId: row.catalogId,
        knr: row.knr,
        name: row.name,
        category: row.category,
        unit: row.unit,
        rateLabor: row.rateLabor,
        rateMaterials: row.rateMaterials,
        rateEquipment: row.rateEquipment,
        directUnitCost,
        bdoCode: row.bdoCode,
        isCustom: Boolean(row.isCustom),
        patch: {
          catalogId: row.catalogId,
          knr: row.knr,
          name: row.name,
          category: row.category,
          unit: row.unit,
          rateLabor: row.rateLabor,
          rateMaterials: row.rateMaterials,
          rateEquipment: row.rateEquipment,
          bdoCode: row.bdoCode,
          isCustom: Boolean(row.isCustom),
        },
      },
    });
  }

  // 2. Pozycje z pełnego katalogu KNR (z przeliczeniem na aktualną bazę i subregion)
  for (const catItem of workCatalog) {
    const catLabel = CATEGORY_LABELS[catItem.category] ?? '';
    const baseScore = scoreMatch(
      normQuery,
      tokens,
      catItem.name,
      catItem.knr,
      `${catLabel} ${catItem.description} ${catItem.bdoCode ?? ''}`
    );
    if (baseScore < 0) continue;

    const rate = catItem.ratesBySource[settings.sourceId];
    const rateLabor = round2((rate?.labor ?? 0) * subregionMult);
    const rateMaterials = round2((rate?.materials ?? 0) * subregionMult);
    const rateEquipment = round2((rate?.equipment ?? 0) * subregionMult);
    const directUnitCost = round2(rateLabor + rateMaterials + rateEquipment);
    const dedupKey = `${normalizePolishSearchText(catItem.knr)}::${normalizePolishSearchText(catItem.name)}`;

    candidates.push({
      score: baseScore,
      dedupKey,
      suggestion: {
        id: `cat:${catItem.id}`,
        sourceType: 'catalog',
        sourceLabel: 'Katalog KNR',
        catalogId: catItem.id,
        knr: catItem.knr,
        name: catItem.name,
        category: catItem.category,
        unit: catItem.unit,
        rateLabor,
        rateMaterials,
        rateEquipment,
        directUnitCost,
        bdoCode: catItem.bdoCode,
        isCustom: false,
        patch: {
          catalogId: catItem.id,
          knr: catItem.knr,
          name: catItem.name,
          category: catItem.category,
          unit: catItem.unit,
          rateLabor,
          rateMaterials,
          rateEquipment,
          bdoCode: catItem.bdoCode,
          isCustom: false,
        },
      },
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.suggestion.name.localeCompare(b.suggestion.name, 'pl');
  });

  const seen = new Set<string>();
  const result: EstimateItemSuggestion[] = [];
  for (const c of candidates) {
    if (seen.has(c.dedupKey)) continue;
    seen.add(c.dedupKey);
    result.push(c.suggestion);
    if (result.length >= limit) break;
  }

  return result;
}
