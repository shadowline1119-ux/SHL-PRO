import type {
  DolnoslaskieTenderItem,
  LocalBipPortalLink,
  LocalBipRegionId,
  LocalBipSearchResponse,
  LocalBipTenderCandidate,
  SubregionId,
} from '../types/estimator.ts';
import { extractGroundingSources } from './quarrySearch.ts';
import { isEarthworksOrDemolitionTender } from './tenders.ts';

export interface LocalBipRegionMeta {
  id: LocalBipRegionId;
  shortLabel: string;
  label: string;
  subregionId: SubregionId;
  defaultLocality: string;
  description: string;
  searchHint: string;
}

export const LOCAL_BIP_REGIONS: Record<LocalBipRegionId, LocalBipRegionMeta> = {
  powiat_lwowecki: {
    id: 'powiat_lwowecki',
    shortLabel: 'Powiat lwówecki (BIP)',
    label: 'Powiat lwówecki — Starostwo, ZDP i Gminy (Lwówek Śl., Gryfów Śl., Mirsk, Lubomierz, Wleń)',
    subregionId: 'jelenia_gora',
    defaultLocality: 'Lwówek Śląski',
    description:
      'Ogłoszenia z BIP Starostwa Powiatowego, Zarządu Dróg Powiatowych oraz gmin powiatu lwóweckiego, w tym zamówienia poniżej progu PZP.',
    searchHint:
      'site:bip.powiatlwowecki.pl OR site:bip.lwowekslaski.pl OR site:platformazakupowa.pl/pn/lwowekslaski OR "Powiat Lwówecki" OR "Gmina Lwówek Śląski" OR "Gryfów Śląski" OR "Mirsk" OR "Lubomierz" OR "Wleń" OR "ZDP Lwówek Śląski" przetarg zapytanie ofertowe',
  },
  powiat_boleslawiecki: {
    id: 'powiat_boleslawiecki',
    shortLabel: 'Powiat bolesławiecki (BIP)',
    label: 'Powiat bolesławiecki — Starostwo, ZDP, Bolesławiec, Nowogrodziec, Osiecznica, Gromadka, Warta B.',
    subregionId: 'jelenia_gora',
    defaultLocality: 'Bolesławiec',
    description:
      'Ogłoszenia z BIP i platform zakupowych Powiatu Bolesławieckiego, Miasta Bolesławiec, ZDP oraz gmin ościennych.',
    searchHint:
      'site:platformazakupowa.pl/pn/powiatboleslawiecki OR site:bip.um.boleslawiec.pl OR "Powiat Bolesławiecki" OR "Gmina Bolesławiec" OR "Nowogrodziec" OR "Osiecznica" OR "Gromadka" OR "Warta Bolesławiecka" przetarg zapytanie ofertowe',
  },
  powiat_zlotoryjski: {
    id: 'powiat_zlotoryjski',
    shortLabel: 'Powiat złotoryjski (BIP)',
    label: 'Powiat złotoryjski — Starostwo, ZDP, Złotoryja, Świerzawa, Wojcieszów, Zagrodno, Pielgrzymka',
    subregionId: 'legnica_glogow',
    defaultLocality: 'Złotoryja',
    description:
      'Ogłoszenia z BIP Powiatu Złotoryjskiego (bip.powiat-zlotoryja.pl), ZDP Złotoryja oraz gmin Złotoryja, Świerzawa, Wojcieszów, Zagrodno i Pielgrzymka.',
    searchHint:
      'site:bip.powiat-zlotoryja.pl OR site:platformazakupowa.pl/pn/zlotoryja OR "Powiat Złotoryjski" OR "Gmina Złotoryja" OR "Świerzawa" OR "Wojcieszów" OR "Zagrodno" OR "Pielgrzymka" przetarg zapytanie ofertowe',
  },
  wody_polskie_lwowek: {
    id: 'wody_polskie_lwowek',
    shortLabel: 'Wody Polskie — ZZ Lwówek Śl.',
    label: 'PGW Wody Polskie — Zarząd Zlewni w Lwówku Śląskim (i RZGW Wrocław)',
    subregionId: 'jelenia_gora',
    defaultLocality: 'Lwówek Śląski',
    description:
      'Zamówienia na utrzymanie rzek i potoków (Bóbr, Kwisa, Kaczawa), konserwację wałów, udrażnianie koryt i prace hydrotechniczne.',
    searchHint:
      '"Zarząd Zlewni w Lwówku Śląskim" OR ("Wody Polskie" "Lwówek Śląski") OR ("Wody Polskie" ("Bolesławiec" OR "Złotoryja" OR "RZGW Wrocław")) przetarg zamówienie zapytanie ofertowe',
  },
  kowr_dolny_slask: {
    id: 'kowr_dolny_slask',
    shortLabel: 'KOWR (OT Wrocław / region)',
    label: 'KOWR — Krajowy Ośrodek Wsparcia Rolnictwa (OT Wrocław, pow. lwówecki, bolesławiecki, złotoryjski)',
    subregionId: 'jelenia_gora',
    defaultLocality: 'Dolny Śląsk',
    description:
      'Przetargi KOWR na roboty rozbiórkowe, uporządkowanie nieruchomości, melioracje, wycinki, a także przetargi na sprzedaż i dzierżawę działek.',
    searchHint:
      'site:kowr.gov.pl OR site:bip.kowr.gov.pl OR "KOWR" ("Wrocław" OR "Lwówek" OR "Bolesławiec" OR "Złotoryja" OR "dolnośląskie") przetarg zamówienie rozbiórka nieruchomości',
  },
  inne_instytucje: {
    id: 'inne_instytucje',
    shortLabel: 'Lasy, ZDP, DSDiK i inne',
    label: 'Nadleśnictwa (Lwówek Śl., Bolesławiec, Złotoryja, Świętoszów), DSDiK i spółki komunalne',
    subregionId: 'jelenia_gora',
    defaultLocality: 'Dolny Śląsk zachodni',
    description:
      'Przetargi na drogi leśne, wykopy, odtworzenia nawierzchni, wyburzenia i rekultywacje w Nadleśnictwach, DSDiK i zakładach komunalnych.',
    searchHint:
      '("Nadleśnictwo Lwówek Śląski" OR "Nadleśnictwo Bolesławiec" OR "Nadleśnictwo Złotoryja" OR "Nadleśnictwo Świętoszów" OR "DSDiK" OR "MZGK Bolesławiec" OR "RPK Złotoryja") przetarg roboty ziemne drogi rozbiórka',
  },
};

export const LOCAL_BIP_PORTAL_DIRECTORY: LocalBipPortalLink[] = [
  {
    id: 'dir-wody-lwowek',
    regionId: 'wody_polskie_lwowek',
    name: 'PGW Wody Polskie — Zamówienia RZGW Wrocław (ZZ Lwówek Śl.)',
    category: 'Wody Polskie',
    url: 'https://www.gov.pl/web/wody-polskie-wroclaw/zamowienia-publiczne',
  },
  {
    id: 'dir-wody-bip',
    regionId: 'wody_polskie_lwowek',
    name: 'BIP Wody Polskie — Zamówienia publiczne',
    category: 'BIP Wody Polskie',
    url: 'https://wodypolskie.bip.gov.pl/zamowienia-publiczne/',
  },
  {
    id: 'dir-kowr-wroc',
    regionId: 'kowr_dolny_slask',
    name: 'KOWR OT Wrocław — Zamówienia i przetargi',
    category: 'KOWR',
    url: 'https://www.gov.pl/web/kowr/zamowienia-publiczne-ot-wroclaw',
  },
  {
    id: 'dir-kowr-bip',
    regionId: 'kowr_dolny_slask',
    name: 'BIP KOWR — Przetargi i ogłoszenia',
    category: 'BIP KOWR',
    url: 'https://bip.kowr.gov.pl/',
  },
  {
    id: 'dir-lwowek-miasto',
    regionId: 'powiat_lwowecki',
    name: 'Platforma Zakupowa — Gmina i Miasto Lwówek Śląski',
    category: 'Powiat lwówecki',
    url: 'https://platformazakupowa.pl/pn/lwowekslaski',
  },
  {
    id: 'dir-pow-boleslawiec',
    regionId: 'powiat_boleslawiecki',
    name: 'Platforma Zakupowa — Powiat Bolesławiecki',
    category: 'Powiat bolesławiecki',
    url: 'https://platformazakupowa.pl/pn/powiatboleslawiecki',
  },
  {
    id: 'dir-osiecznica',
    regionId: 'powiat_boleslawiecki',
    name: 'Platforma Zakupowa — Gmina Osiecznica',
    category: 'Powiat bolesławiecki',
    url: 'https://platformazakupowa.pl/pn/osiecznica',
  },
  {
    id: 'dir-warta',
    regionId: 'powiat_boleslawiecki',
    name: 'Platforma Zakupowa — Gmina Warta Bolesławiecka',
    category: 'Powiat bolesławiecki',
    url: 'https://platformazakupowa.pl/pn/wartaboleslawiecka',
  },
  {
    id: 'dir-pow-zlotoryja',
    regionId: 'powiat_zlotoryjski',
    name: 'BIP Powiatu Złotoryjskiego',
    category: 'Powiat złotoryjski',
    url: 'https://bip.powiat-zlotoryja.pl/',
  },
  {
    id: 'dir-zlotoryja-miasto',
    regionId: 'powiat_zlotoryjski',
    name: 'Platforma Zakupowa — Gmina Miejska Złotoryja',
    category: 'Powiat złotoryjski',
    url: 'https://platformazakupowa.pl/pn/zlotoryja',
  },
  {
    id: 'dir-swierzawa',
    regionId: 'powiat_zlotoryjski',
    name: 'Platforma Zakupowa — Gmina Świerzawa',
    category: 'Powiat złotoryjski',
    url: 'https://platformazakupowa.pl/pn/swierzawa',
  },
  {
    id: 'dir-wojcieszow',
    regionId: 'powiat_zlotoryjski',
    name: 'Platforma Zakupowa — Gmina Wojcieszów',
    category: 'Powiat złotoryjski',
    url: 'https://platformazakupowa.pl/pn/wojcieszow',
  },
];

function extractJsonObject(rawText: string): Record<string, unknown> | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    candidates.unshift(fence[1].trim());
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
      // Try next JSON block
    }
  }
  return null;
}

export function buildLocalBipSearchPrompt(
  regionId: LocalBipRegionId,
  customQuery?: string,
  activeOnly = true,
  todayIso: string = new Date().toISOString().slice(0, 10)
): string {
  const meta = LOCAL_BIP_REGIONS[regionId];
  const cleanExtra = customQuery?.trim();

  return [
    `Dzisiejsza data: ${todayIso}.`,
    `Wyszukaj w Google aktualne przetargi, zapytania ofertowe (w tym poniżej progu PZP), zamówienia z BIP-ów, Platformy Zakupowej (platformazakupowa.pl), e-Zamówień oraz portali instytucjonalnych dla kategorii: "${meta.label}".`,
    `Wskazówka wyszukiwania: ${meta.searchHint}.`,
    cleanExtra
      ? `Dodatkowe kryterium użytkownika: "${cleanExtra}".`
      : 'Uwzględnij przede wszystkim roboty ziemne, wykopy, rozbiórki, wyburzenia, utrzymanie cieków wodnych, melioracje, drogi, kruszywa oraz prace porządkowe i przetargi terenowe.',
    activeOnly
      ? 'Priorytetyzuj postępowania otwarte / aktualne (z terminem składania ofert dzisiaj lub w przyszłości, albo z ostatnich kilku tygodni). Jeśli nie znajdziesz wystarczającej liczby otwartych postępowań, dopisz najnowsze ostatnio opublikowane z wyraźnym oznaczeniem statusLabel: "archiwalny".'
      : 'Uwzględnij zarówno otwarte, jak i ostatnie ogłoszenia opublikowane w tym roku.',
    'Zwracaj WYŁĄCZNIE realne ogłoszenia znalezione w wynikach wyszukiwania Google. Nie wymyślaj numerów spraw, adresów URL ani instytucji.',
    '',
    'Zwróć wynik WYŁĄCZNIE jako poprawny JSON o strukturze:',
    `{
  "overview": "krótkie (2-3 zdania po polsku) podsumowanie jakie przetargi i zapytania znaleziono w BIP, Wodach Polskich lub KOWR",
  "items": [
    {
      "title": "dokładny tytuł / przedmiot zamówienia lub przetargu",
      "institution": "nazwa zamawiającego (np. PGW Wody Polskie Zarząd Zlewni w Lwówku Śląskim, KOWR OT Wrocław, Gmina Lwówek Śląski, Powiat Bolesławiecki)",
      "locality": "miejscowość / gmina / powiat",
      "sourcePlatform": "np. BIP / platformazakupowa.pl / Wody Polskie / KOWR / e-Zamówienia / Baza Konkurencyjności",
      "referenceNumber": "sygnatura sprawy lub numer ogłoszenia jeśli podano (lub 'BIP / Zapytanie')",
      "publishedDate": "YYYY-MM-DD lub przybliżona data jeśli dostępna, inaczej ''",
      "deadlineDate": "YYYY-MM-DD HH:mm lub data składania ofert jeśli dostępna, inaczej ''",
      "statusLabel": "aktualny | archiwalny | nieznany",
      "summary": "krótki opis zakresu prac / lokalizacji / wymogów",
      "url": "bezpośredni adres URL ogłoszenia lub strony źródłowej jeśli znaleziono, inaczej ''"
    }
  ]
}`,
  ].join('\n');
}

export function parseLocalBipSearchResponse(
  rawText: string,
  regionId: LocalBipRegionId,
  customQuery: string,
  groundingMetadata?: unknown,
  nowIso: string = new Date().toISOString()
): LocalBipSearchResponse {
  const meta = LOCAL_BIP_REGIONS[regionId];
  const { sources, webSearchQueries } = extractGroundingSources(groundingMetadata);
  const json = extractJsonObject(rawText);

  if (!json) {
    return {
      regionId,
      query: customQuery.trim(),
      searchedAt: nowIso,
      overview:
        rawText.trim() ||
        'Nie udało się odczytać ustrukturyzowanej listy ogłoszeń z BIP / Wód Polskich / KOWR.',
      items: [],
      sources,
      webSearchQueries,
    };
  }

  const overview =
    typeof json.overview === 'string' && json.overview.trim()
      ? json.overview.trim()
      : `Wyniki wyszukiwania Google dla: ${meta.shortLabel}.`;

  const rawItems = Array.isArray(json.items) ? json.items : [];
  const items: LocalBipTenderCandidate[] = [];

  rawItems.forEach((rawItem, idx) => {
    if (!rawItem || typeof rawItem !== 'object') return;
    const obj = rawItem as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    if (!title) return;

    const institution =
      typeof obj.institution === 'string' && obj.institution.trim()
        ? obj.institution.trim()
        : meta.shortLabel;
    const locality =
      typeof obj.locality === 'string' && obj.locality.trim()
        ? obj.locality.trim()
        : meta.defaultLocality;
    const sourcePlatform =
      typeof obj.sourcePlatform === 'string' && obj.sourcePlatform.trim()
        ? obj.sourcePlatform.trim()
        : 'BIP / portal zamawiającego';
    const referenceNumber =
      typeof obj.referenceNumber === 'string' && obj.referenceNumber.trim()
        ? obj.referenceNumber.trim()
        : 'Ogłoszenie BIP';
    const publishedDate =
      typeof obj.publishedDate === 'string' ? obj.publishedDate.trim() : '';
    const deadlineDate =
      typeof obj.deadlineDate === 'string' ? obj.deadlineDate.trim() : '';
    const rawStatus =
      typeof obj.statusLabel === 'string' ? obj.statusLabel.trim().toLowerCase() : '';
    const statusLabel: LocalBipTenderCandidate['statusLabel'] =
      rawStatus === 'aktualny' || rawStatus === 'archiwalny' || rawStatus === 'nieznany'
        ? rawStatus
        : 'nieznany';
    const summary =
      typeof obj.summary === 'string' ? obj.summary.trim() : '';

    let url = typeof obj.url === 'string' ? obj.url.trim() : '';
    if (url && !/^https?:\/\//i.test(url)) {
      url = '';
    }
    if (!url && sources[idx]?.uri) {
      url = sources[idx].uri;
    } else if (!url && sources[0]?.uri) {
      url = sources[0].uri;
    }

    items.push({
      id: `bip-${regionId}-${idx}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}`,
      regionId,
      title,
      institution,
      locality,
      sourcePlatform,
      referenceNumber,
      publishedDate,
      deadlineDate,
      statusLabel,
      isEarthworksOrDemolition: isEarthworksOrDemolitionTender(title, '', summary),
      summary,
      url,
    });
  });

  return {
    regionId,
    query: customQuery.trim(),
    searchedAt: nowIso,
    overview,
    items,
    sources,
    webSearchQueries,
  };
}

export function localBipCandidateToEstimateTender(
  candidate: LocalBipTenderCandidate
): DolnoslaskieTenderItem {
  const meta = LOCAL_BIP_REGIONS[candidate.regionId];
  const parsedDeadline = candidate.deadlineDate ? Date.parse(candidate.deadlineDate) : NaN;
  const submittingOffersDate = Number.isFinite(parsedDeadline)
    ? new Date(parsedDeadline).toISOString()
    : null;

  return {
    id: candidate.id,
    tenderId: candidate.id,
    noticeNumber: candidate.referenceNumber || candidate.sourcePlatform,
    bzpNumber: candidate.referenceNumber || candidate.sourcePlatform,
    orderType: 'Works',
    orderObject: candidate.title,
    organizationName: candidate.institution,
    organizationCity: candidate.locality,
    organizationProvince: 'PL02',
    subregionId: meta.subregionId,
    nuts3Label: meta.shortLabel,
    cpvCode: candidate.sourcePlatform,
    publicationDate: candidate.publishedDate || new Date().toISOString(),
    submittingOffersDate,
    isActiveDeadline: candidate.statusLabel !== 'archiwalny',
    isEarthworksOrDemolition: candidate.isEarthworksOrDemolition,
    shortDescription:
      candidate.summary ||
      `${candidate.sourcePlatform} · Termin: ${candidate.deadlineDate || 'wg ogłoszenia'}`,
    procedureUrl: candidate.url || 'https://ezamowienia.gov.pl/mp-client/search/list',
    ezamowieniaUrl: candidate.url || 'https://ezamowienia.gov.pl/mp-client/search/list',
  };
}

export function formatLocalBipSearchError(err: unknown): {
  status: number;
  message: string;
} {
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  if (rawMessage.includes('429') || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Przekroczono limit zapytań lub kwotę Gemini API (429 RESOURCE_EXHAUSTED). Odczekaj chwilę i spróbuj ponownie.',
    };
  }
  if (rawMessage.includes('401') || rawMessage.includes('403') || rawMessage.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'Klucz GEMINI_API_KEY jest nieprawidłowy lub nie ma uprawnień do Google Search Grounding. Sprawdź ustawienia w Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: `Błąd wyszukiwania przetargów w BIP / Wodach Polskich / KOWR: ${rawMessage || 'Nieznany błąd serwera.'}`,
  };
}
