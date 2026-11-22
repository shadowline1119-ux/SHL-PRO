import type {
  DolnoslaskieTenderItem,
  RegionalTenderBucket,
  SubregionId,
  TenderScopeFilter,
} from '../types/estimator.ts';
import { extractTenderDataFromText } from './tenderAutoEstimator.ts';

export interface RawBzpNotice {
  noticeNumber?: string;
  bzpNumber?: string;
  orderType?: string;
  noticeType?: string;
  publicationDate?: string;
  orderObject?: string;
  cpvCode?: string;
  submittingOffersDate?: string | null;
  organizationName?: string;
  organizationCity?: string;
  organizationProvince?: string;
  tenderId?: string;
  objectId?: string;
  htmlBody?: string;
}

const EARTHWORK_CPV_PREFIXES = ['45111', '45112', '45233', '4524', '45100', '45110'];

const EARTHWORK_KEYWORDS = [
  'roboty ziemne',
  'robót ziemnych',
  'wykop',
  'rozbiór',
  'wyburz',
  'niwelac',
  'podbudow',
  'kruszyw',
  'utwardzen',
  'drogow',
  'odwodn',
  'drenaż',
  'meliorac',
  'kanalizac',
  'rekultyw',
  'wywóz gruz',
  'wymiana gruntu',
  'stabilizacj',
  'plac manewrow',
  'przebudowa drogi',
  'budowa drogi',
];

export function stripHtmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const REGIONAL_PATTERNS = {
  wody_polskie: /wody\s+polskie|rzgw|zarząd\s+zlewni|zarzad\s+zlewni|pgw\s+wp/i,
  kowr: /\bkowr\b|krajowy\s+ośrodek\s+wsparcia\s+rolnictwa|krajowego\s+ośrodka\s+wsparcia\s+rolnictwa/i,
  lwowek: /lwówek|lwówk|lwóweck|lwowek|lwowk|lwoweck|gryfów|gryfow|mirsk|lubomierz|wleń|wleni|wlen|płakowic|plakowic/i,
  boleslawiec: /bolesław|boleslaw|nowogrodz|nowogrodź|osiecznic|gromadk|warta\s+bolesław|świętosz|swietosz|kruszyn|łaziska|tomaszów\s+bolesław/i,
  zlotoryja: /złotory|zlotory|wojciesz|świerzaw|swierzaw|zagrodn|pielgrzym|sędziszow|nowy\s+kościół/i,
};

export function classifyRegionalBucket(
  organizationName: string,
  organizationCity: string,
  orderObject: string,
  shortDescription: string
): Exclude<RegionalTenderBucket, 'all'> {
  const haystack = `${organizationName} ${organizationCity} ${orderObject} ${shortDescription}`;
  if (REGIONAL_PATTERNS.wody_polskie.test(haystack)) return 'wody_polskie';
  if (REGIONAL_PATTERNS.kowr.test(haystack)) return 'kowr';
  if (REGIONAL_PATTERNS.lwowek.test(haystack)) return 'lwowek';
  if (REGIONAL_PATTERNS.boleslawiec.test(haystack)) return 'boleslawiec';
  if (REGIONAL_PATTERNS.zlotoryja.test(haystack)) return 'zlotoryja';
  return 'other';
}

export function matchesRegionalBucket(
  item: Pick<
    DolnoslaskieTenderItem,
    'organizationName' | 'organizationCity' | 'orderObject' | 'shortDescription' | 'regionalBucket'
  >,
  bucket: RegionalTenderBucket
): boolean {
  if (bucket === 'all') return true;
  if (bucket === 'other') return item.regionalBucket === 'other';
  const haystack = `${item.organizationName} ${item.organizationCity} ${item.orderObject} ${item.shortDescription}`;
  return REGIONAL_PATTERNS[bucket].test(haystack);
}

export function isDolnoslaskieRelevantNotice(raw: RawBzpNotice): boolean {
  if ((raw.organizationProvince ?? '').toUpperCase() === 'PL02') return true;
  const plain = stripHtmlToPlainText(raw.htmlBody || '');
  const haystack = `${raw.organizationName ?? ''} ${raw.organizationCity ?? ''} ${raw.orderObject ?? ''} ${plain}`;
  return /(?:dolnośl|dolnosl|(?<![a-ząćęłńóśźż])wrocław|(?<![a-z])wroclaw|rzgw\s+we\s+wrocław|ot\s+wrocław|ot\s+we\s+wrocław|lwówek|lwówk|lwowek|lwowk|bolesław|boleslaw|złotory|zlotory|legnic|jeleni|wałbrz|walbrz|\bbóbr|\bbobru\b|\bkwis[ayę]|\bkaczaw[ayę]|pl02|pl51[4-8])/i.test(
    haystack
  );
}

export function mapNuts3AndCityToSubregion(
  nuts3Text: string,
  city: string
): { subregionId: SubregionId; nuts3Label: string } {
  const upperNuts = nuts3Text.toUpperCase();
  if (upperNuts.includes('PL515')) {
    return { subregionId: 'jelenia_gora', nuts3Label: 'Jeleniogórski (PL515)' };
  }
  if (upperNuts.includes('PL516')) {
    return { subregionId: 'legnica_glogow', nuts3Label: 'Legnicko-głogowski (PL516)' };
  }
  if (upperNuts.includes('PL517')) {
    return { subregionId: 'walbrzych', nuts3Label: 'Wałbrzyski (PL517)' };
  }
  if (upperNuts.includes('PL514')) {
    return { subregionId: 'wroclaw', nuts3Label: 'M. Wrocław (PL514)' };
  }
  if (upperNuts.includes('PL518')) {
    return { subregionId: 'wroclaw', nuts3Label: 'Wrocławski (PL518)' };
  }

  const c = city.toLowerCase();
  if (/legnic|głogów|glogow|lubin|polkowic|jawor|złotory|zlotory|chojn|mściwoj/.test(c)) {
    return { subregionId: 'legnica_glogow', nuts3Label: 'Rejon Legnica–Głogów' };
  }
  if (/wałbrz|walbrz|świdnic|swidnic|dzierżoni|dzierzoni|kłodz|klodz|ząbkow|zabkow|bielaw|nowa ruda|strzegom/.test(c)) {
    return { subregionId: 'walbrzych', nuts3Label: 'Rejon Wałbrzyski' };
  }
  if (/jeleni|bolesław|boleslaw|zgorzel|lubań|luban|lwówek|lwowek|kamienn|karpacz|szklarsk|bogatyn|gryfów/.test(c)) {
    return { subregionId: 'jelenia_gora', nuts3Label: 'Rejon Jeleniogórski' };
  }
  return { subregionId: 'wroclaw', nuts3Label: 'Rejon Wrocławski' };
}

export function extractBzpDetailsFromHtml(
  htmlBody: string | undefined,
  organizationCity: string
): {
  subregionId: SubregionId;
  nuts3Label: string;
  shortDescription: string;
  procedureUrl: string;
  organizationEmail?: string;
} {
  const plain = stripHtmlToPlainText(htmlBody || '');
  const flat = plain.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  const nutsMatch = flat.match(/1\.5\.6\.\)?\s*Lokalizacja NUTS 3:\s*([^\n]+?)(?=\s+1\.5\.|$)/i);
  const nutsRaw = nutsMatch?.[1]?.trim() ?? '';
  const { subregionId, nuts3Label } = mapNuts3AndCityToSubregion(nutsRaw, organizationCity);

  const emailMatch = flat.match(/1\.5\.9\.\)?\s*Adres poczty elektronicznej:\s*([^\s]+)/i);
  const organizationEmail = emailMatch?.[1]?.trim();

  let shortDescription = '';
  const descMatch = flat.match(
    /4\.2\.2\.\)?\s*Krótki opis przedmiotu zamówienia\s*[:\-]?\s*([\s\S]{10,1200}?)(?=\s+4\.2\.\d|\s+4\.3\.|\s+SEKCJA\s+V|$)/i
  );
  if (descMatch?.[1]) {
    shortDescription = descMatch[1].trim();
    if (shortDescription.length > 520) {
      shortDescription = `${shortDescription.slice(0, 517).trim()}...`;
    }
  }

  let procedureUrl = '';
  const procUrlMatch = flat.match(
    /Adres strony internetowej prowadzonego postępowania\s*[:\-]?\s*(https?:\/\/[^\s,;]+|[a-z0-9.-]+\.[a-z]{2,}\/[^\s,;]*)/i
  );
  if (procUrlMatch?.[1]) {
    const rawUrl = procUrlMatch[1].trim();
    procedureUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
  }

  return {
    subregionId,
    nuts3Label,
    shortDescription,
    procedureUrl,
    organizationEmail,
  };
}

export function isEarthworksOrDemolitionTender(
  orderObject: string,
  cpvCode: string,
  shortDescription: string
): boolean {
  if (EARTHWORK_CPV_PREFIXES.some((prefix) => cpvCode.includes(prefix))) {
    return true;
  }
  const haystack = `${orderObject} ${cpvCode} ${shortDescription}`.toLowerCase();
  return EARTHWORK_KEYWORDS.some((kw) => haystack.includes(kw));
}

export function mapBzpNoticeToTender(
  raw: RawBzpNotice,
  nowMs: number = Date.now()
): DolnoslaskieTenderItem | null {
  const orderObject = (raw.orderObject ?? '').trim();
  const noticeNumber = (raw.noticeNumber ?? '').trim();
  const tenderId = (raw.tenderId ?? raw.objectId ?? '').trim();
  if (!orderObject || !noticeNumber) return null;

  const organizationName = (raw.organizationName ?? 'Zamawiający publiczny').trim();
  const organizationCity = (raw.organizationCity ?? 'Dolny Śląsk').trim();
  const details = extractBzpDetailsFromHtml(raw.htmlBody, organizationCity);
  const cpvCode = (raw.cpvCode ?? '').replace(/\u00a0/g, ' ').trim();
  const submittingOffersDate = raw.submittingOffersDate ?? null;

  const deadlineMs = submittingOffersDate ? Date.parse(submittingOffersDate) : NaN;
  const isActiveDeadline = Number.isFinite(deadlineMs) ? deadlineMs >= nowMs : true;

  const ezamowieniaUrl = tenderId
    ? `https://ezamowienia.gov.pl/mp-client/search/list/${encodeURIComponent(tenderId)}`
    : 'https://ezamowienia.gov.pl/mp-client/search/list';

  const plainBody = stripHtmlToPlainText(raw.htmlBody || '');
  const extractedData = extractTenderDataFromText({
    plainText: plainBody,
    orderObject,
    organizationName,
    organizationCity,
    cpvCode,
    shortDescription: details.shortDescription,
  });

  return {
    id: `${noticeNumber}-${tenderId || raw.objectId || Math.random().toString(36).slice(2, 8)}`,
    tenderId,
    noticeNumber,
    bzpNumber: (raw.bzpNumber ?? noticeNumber).trim(),
    orderType: (raw.orderType ?? 'Works').trim(),
    orderObject,
    organizationName,
    organizationCity,
    organizationProvince: (raw.organizationProvince ?? 'PL02').trim(),
    subregionId: details.subregionId,
    nuts3Label: details.nuts3Label,
    regionalBucket: classifyRegionalBucket(
      organizationName,
      organizationCity,
      orderObject,
      details.shortDescription
    ),
    cpvCode,
    publicationDate: raw.publicationDate ?? new Date(nowMs).toISOString(),
    submittingOffersDate,
    isActiveDeadline,
    isEarthworksOrDemolition: isEarthworksOrDemolitionTender(
      orderObject,
      cpvCode,
      details.shortDescription
    ),
    shortDescription: details.shortDescription,
    procedureUrl: details.procedureUrl || ezamowieniaUrl,
    ezamowieniaUrl,
    organizationEmail: details.organizationEmail,
    extractedData,
  };
}

export function formatDeadlineInfo(
  submittingOffersDate: string | null,
  nowMs: number = Date.now()
): { label: string; formattedDate: string; urgency: 'soon' | 'open' | 'closed' | 'unknown' } {
  if (!submittingOffersDate) {
    return { label: 'Brak daty', formattedDate: '—', urgency: 'unknown' };
  }
  const ts = Date.parse(submittingOffersDate);
  if (!Number.isFinite(ts)) {
    return { label: 'Brak daty', formattedDate: '—', urgency: 'unknown' };
  }

  const d = new Date(ts);
  const formattedDate = d.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Warsaw',
  });

  const diffMs = ts - nowMs;
  if (diffMs < 0) {
    return { label: 'Termin minął', formattedDate, urgency: 'closed' };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 24) {
    return { label: `Za ${Math.max(1, diffHours)} godz.`, formattedDate, urgency: 'soon' };
  }
  if (diffDays <= 5) {
    return { label: `Za ${diffDays} dni`, formattedDate, urgency: 'soon' };
  }
  return { label: `Za ${diffDays} dni`, formattedDate, urgency: 'open' };
}

export function filterAndSortTenders(
  items: DolnoslaskieTenderItem[],
  options: {
    scope: TenderScopeFilter;
    subregionId: 'all' | SubregionId;
    regionalBucket?: RegionalTenderBucket;
    onlyActive: boolean;
    searchQuery: string;
  }
): DolnoslaskieTenderItem[] {
  const q = options.searchQuery.trim().toLowerCase();
  const bucket = options.regionalBucket ?? 'all';

  const filtered = items.filter((item) => {
    if (options.onlyActive && !item.isActiveDeadline) return false;
    if (options.scope === 'works' && item.orderType !== 'Works') return false;
    if (options.scope === 'earthworks_demolition' && !item.isEarthworksOrDemolition) {
      return false;
    }
    if (options.subregionId !== 'all' && item.subregionId !== options.subregionId) {
      return false;
    }
    if (!matchesRegionalBucket(item, bucket)) {
      return false;
    }
    if (!q) return true;
    return (
      item.orderObject.toLowerCase().includes(q) ||
      item.organizationName.toLowerCase().includes(q) ||
      item.organizationCity.toLowerCase().includes(q) ||
      item.noticeNumber.toLowerCase().includes(q) ||
      item.cpvCode.toLowerCase().includes(q) ||
      item.shortDescription.toLowerCase().includes(q)
    );
  });

  return filtered.sort((a, b) => {
    if (a.isActiveDeadline !== b.isActiveDeadline) {
      return a.isActiveDeadline ? -1 : 1;
    }
    const aDeadline = a.submittingOffersDate ? Date.parse(a.submittingOffersDate) : Infinity;
    const bDeadline = b.submittingOffersDate ? Date.parse(b.submittingOffersDate) : Infinity;
    if (a.isActiveDeadline && b.isActiveDeadline && aDeadline !== bDeadline) {
      return aDeadline - bDeadline;
    }
    return Date.parse(b.publicationDate) - Date.parse(a.publicationDate);
  });
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  Works: 'Roboty budowlane',
  Services: 'Usługi',
  Delivery: 'Dostawy',
};
