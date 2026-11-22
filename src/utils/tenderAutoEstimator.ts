import { SUBREGIONS, WORK_CATALOG } from '../data/dolnoslaskieRates.ts';
import type {
  AiAnalysisExtractedItem,
  CatalogWorkItem,
  DolnoslaskieTenderItem,
  EstimateLineItem,
  EstimateSettings,
  OfferMetadata,
  StructureParams,
  SubregionId,
  SubregionMeta,
  TenderAutoEstimate,
  TenderDetectedQuantity,
  TenderExtractedData,
  TenderWorkProfile,
} from '../types/estimator.ts';
import { calculateEstimateSummary } from './calculations.ts';

export const WORK_PROFILE_LABELS: Record<TenderWorkProfile, string> = {
  rozbiorka: 'Rozbiórki, wyburzenia i utylizacja BDO',
  drogi_nawierzchnie: 'Roboty drogowe, korytowanie i podbudowy',
  roboty_ziemne: 'Roboty ziemne, wykopy i wymiana gruntu',
  wodne_melioracje: 'Roboty wodne, cieki, wały i melioracje',
  sieci_wykopy: 'Wykopy liniowe pod sieci i odwodnienia',
  kruszywa: 'Dostawa i wbudowanie kruszyw drogowych',
  wycinka_teren: 'Wycinka drzew, karczowanie i niwelacja',
  ogolnobudowlane: 'Roboty przygotowawcze i towarzyszące',
};

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function parsePolishNumber(raw: string): number | null {
  if (!raw) return null;
  let cleaned = raw.replace(/[\s\u00a0]+/g, '').trim();
  if (!cleaned) return null;

  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '');
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyTenderWorkProfile(
  orderObject: string,
  cpvCode: string,
  description: string
): TenderWorkProfile {
  const hay = `${orderObject} ${cpvCode} ${description}`.toLowerCase();
  const titleLower = orderObject.toLowerCase();

  // Wyraźna rozbiórka obiektu / budynku / eternitu (a nie tylko frezowanie nawierzchni drogi)
  if (
    /wyburz|demontaż\s+hal|eternit|azbest|45111100/.test(hay) ||
    (/(?:rozbiórk|rozbior)/.test(hay) &&
      /(?:budynk|obiekt|hal[iaę]|magazyn|kotłown|gospodarcz|mieszkaln|most|wiadukt|komina|wiaty|45111000)/.test(
        hay
      ) &&
      !/przebudowa\s+drog|remont\s+drog|budowa\s+drog|alei/.test(titleLower))
  ) {
    return 'rozbiorka';
  }
  if (
    /wody\s+polskie|rzgw|zarząd\s+zlewni|potok|rzek|ciek|\bbóbr|\bbobru|\bkwis|\bkaczaw|wał\s+przeciw|udrażnian|odmulen|meliorac|hydrotechn|4524/.test(
      hay
    )
  ) {
    return 'wodne_melioracje';
  }
  if (
    (/kruszyw|tłuczeń|tłuczni|kliniec|niesort|bazalt|granit|żwir|piasek/.test(hay) ||
      cpvCode.includes('14210000')) &&
    !/przebudowa\s+drog|budowa\s+drog|remont\s+drog/.test(hay)
  ) {
    return 'kruszywa';
  }
  if (
    /drog|ulic|alei|alej|chodnik|parking|plac\s+manewr|nawierzchn|asfalt|bitumiczn|kostk|bruk|45233/.test(
      hay
    )
  ) {
    return 'drogi_nawierzchnie';
  }
  if (
    /wodociąg|kanalizac|rurociąg|sieci\s+wod|sieci\s+kan|przyłącz|drenaż|deszczów|odwodnien|452313|452324/.test(
      hay
    )
  ) {
    return 'sieci_wykopy';
  }
  if (
    /wycink|karczow|usunięcie\s+drzew|drzew|zieleni|rekultyw|uporządkowani|77211/.test(hay)
  ) {
    return 'wycinka_teren';
  }
  if (
    /roboty\s+ziemne|robót\s+ziemnych|wykop|niwelac|makroniwelac|nasyp|wymiana\s+gruntu|korytow|451112|45112/.test(
      hay
    )
  ) {
    return 'roboty_ziemne';
  }
  if (/rozbiórk|rozbior|45111000/.test(hay)) {
    return 'rozbiorka';
  }
  return 'ogolnobudowlane';
}

export function extractPhysicalQuantities(text: string): TenderDetectedQuantity[] {
  if (!text) return [];
  const results: TenderDetectedQuantity[] = [];
  const seen = new Set<string>();

  const regex =
    /(?<![\d.,/\-])(\d{1,3}(?:[\s\u00a0]\d{3})+|\d+(?:[.,]\d+)?)\s*(km|mb|m2|m²|ha|m3|m³|Mg|ton|t|szt\.?)(?![a-zA-Ząćęłńóśźż0-9])/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawNum = match[1];
    const rawUnit = match[2].toLowerCase();
    const val = parsePolishNumber(rawNum);
    if (val === null || val <= 0) continue;

    // Ignoruj pojedyncze metry z opisów formalnych typu "min. 10 m od granicy" jeśli bardzo małe dla km/ha itp.
    const start = Math.max(0, match.index - 42);
    const end = Math.min(text.length, match.index + match[0].length + 38);
    const context = text.slice(start, end).replace(/\s+/g, ' ').trim();

    // Odfiltruj typowe zapisy rozporządzeń / IT / wymagań OC ("min. 5 lat", "2 m od sieci" itp. nie łapią jednostek t/m2, ale "t.j." czasem bywa złapane jako "t.")
    if (/^t\.?j\b/i.test(text.slice(match.index + rawNum.length).trim())) continue;
    if (rawUnit === 't' && /\b(?:poz\.|ust\.|pkt|art\.)/i.test(context)) continue;

    let unit: TenderDetectedQuantity['unit'] = 'm²';
    let normalizedLabel = `${val}`;
    if (rawUnit === 'km') {
      unit = 'km';
      normalizedLabel = `${val} km (${Math.round(val * 1000)} mb)`;
    } else if (rawUnit === 'mb') {
      unit = 'mb';
      normalizedLabel = `${val} mb`;
    } else if (rawUnit === 'm2' || rawUnit === 'm²') {
      unit = 'm²';
      normalizedLabel = `${val} m²`;
    } else if (rawUnit === 'ha') {
      unit = 'ha';
      normalizedLabel = `${val} ha (${Math.round(val * 10000)} m²)`;
    } else if (rawUnit === 'm3' || rawUnit === 'm³') {
      unit = 'm³';
      normalizedLabel = `${val} m³`;
    } else if (rawUnit === 'mg' || rawUnit === 'ton' || rawUnit === 't') {
      unit = 't';
      normalizedLabel = `${val} t`;
    } else {
      unit = 'szt.';
      normalizedLabel = `${val} szt.`;
    }

    const dedupeKey = `${unit}:${val}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({
      value: val,
      unit,
      normalizedLabel,
      context,
    });

    if (results.length >= 12) break;
  }

  return results;
}

export function extractTenderDataFromText(params: {
  plainText: string;
  orderObject: string;
  organizationName: string;
  organizationCity: string;
  cpvCode: string;
  shortDescription?: string;
  externalPageTitle?: string;
  externalPageExcerpt?: string;
  externalDocLinks?: { label: string; url: string }[];
}): TenderExtractedData {
  const flat = params.plainText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  const regonMatch = flat.match(/1\.4\.?\)?\s*Krajowy\s+Numer\s+Identyfikacyjny:\s*REGON\s*([0-9-]+)/i);
  const nipMatch = flat.match(/\bNIP\s*[:\-]?\s*([0-9]{3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3})/i);
  const streetMatch = flat.match(/1\.5\.1\.?\)?\s*Ulica:\s*([^\n]+?)(?=\s+1\.5\.2|$)/i);
  const postalMatch = flat.match(/1\.5\.3\.?\)?\s*Kod pocztowy:\s*([0-9]{2}-[0-9]{3})/i);
  const refMatch = flat.match(
    /4\.1\.2\.?\)?\s*Numer referencyjny:\s*([^\s]+(?:\s+[^\s]+)?)(?=\s+\d+\.\d+|\s+SEKCJA|$)/i
  );

  // Wyciągnij pełny opis z sekcji 4.2.2 (może być kilka części w przetargu)
  const descMatches = Array.from(
    flat.matchAll(
      /4\.2\.2\.?\)?\s*Krótki opis przedmiotu zamówienia\s*[:\-]?\s*([\s\S]{8,1600}?)(?=\s+4\.2\.\d|\s+4\.3\.|\s+SEKCJA\s+V|$)/gi
    )
  );
  let fullDescription = descMatches
    .map((m) => m[1].trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n\n');
  if (!fullDescription) {
    fullDescription = (params.shortDescription || params.orderObject || '').trim();
  }
  if (fullDescription.length > 2600) {
    fullDescription = `${fullDescription.slice(0, 2597).trim()}...`;
  }

  // Okres realizacji 4.2.10
  const periodMatch = flat.match(
    /4\.2\.10\.?\)?\s*Okres realizacji zamówienia(?:\s+albo\s+umowy\s+ramowej)?:\s*([\s\S]{2,80}?)(?=\s+\d+\.\d+|\s+SEKCJA|$)/i
  );
  const executionPeriod = periodMatch?.[1]?.trim();

  // Okres gwarancji w opisie lub kryteriach 4.3
  let warrantyMonths: number | undefined;
  const warrantyYearsMatch = flat.match(/(?:okres\s+gwarancji|gwarancja)[^;\n]{0,60}?(\d{1,2})\s*(?:lata|lat)\b/i);
  const warrantyMonthsMatch = flat.match(/(?:okres\s+gwarancji|gwarancja)[^;\n]{0,60}?(\d{2,3})\s*(?:miesi[ęe]c|m-?c)/i);
  if (warrantyMonthsMatch) {
    const val = Number(warrantyMonthsMatch[1]);
    if (val >= 12 && val <= 120) warrantyMonths = val;
  } else if (warrantyYearsMatch) {
    const yrs = Number(warrantyYearsMatch[1]);
    if (yrs >= 1 && yrs <= 10) warrantyMonths = yrs * 12;
  }

  // Wadium 6.4.1
  let wadiumPln: number | undefined;
  const wadiumSection = flat.match(/6\.4\.1\.?\)?\s*Informacje dotyczące wadium:\s*([\s\S]{5,500}?)(?=\s+6\.5|\s+SEKCJA\s+VII|$)/i);
  if (wadiumSection?.[1]) {
    const moneyMatch = wadiumSection[1].match(/(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{1,2})?)\s*zł/i);
    if (moneyMatch) {
      const val = parsePolishNumber(moneyMatch[1]);
      if (val && val >= 500) wadiumPln = val;
    }
  }

  // Warunki doświadczenia 5.4 (powierzchnia i wartość referencyjna)
  let experienceValuePln: number | undefined;
  let experienceAreaM2: number | undefined;
  const sec5Match = flat.match(/5\.4\.?\)?\s*Nazwa i opis warunków udziału w postępowaniu\.?\s*([\s\S]{10,1800}?)(?=\s+5\.5|\s+SEKCJA\s+VI|$)/i);
  if (sec5Match?.[1]) {
    const areaM = sec5Match[1].match(/(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{1,2})?)\s*(?:m2|m²)/i);
    if (areaM) {
      const a = parsePolishNumber(areaM[1]);
      if (a && a >= 20) experienceAreaM2 = a;
    }
    const valM = sec5Match[1].match(/wartości[^.]{0,40}?(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{1,2})?)\s*zł/i);
    if (valM) {
      const v = parsePolishNumber(valM[1]);
      if (v && v >= 10000) experienceValuePln = v;
    }
  }

  const scopeTextForQty = [
    params.orderObject,
    fullDescription,
    params.externalPageExcerpt || '',
  ]
    .filter(Boolean)
    .join('\n');

  const detectedQuantities = extractPhysicalQuantities(scopeTextForQty);
  const detectedWorkProfile = classifyTenderWorkProfile(
    params.orderObject,
    params.cpvCode,
    `${fullDescription} ${params.externalPageExcerpt || ''}`
  );

  return {
    referenceNumber: refMatch?.[1]?.trim(),
    organizationNip: nipMatch?.[1]?.replace(/\s+/g, '').trim(),
    organizationRegon: regonMatch?.[1]?.trim(),
    organizationStreet: streetMatch?.[1]?.trim(),
    organizationPostalCode: postalMatch?.[1]?.trim(),
    executionPeriod: executionPeriod && executionPeriod.length <= 80 ? executionPeriod : undefined,
    warrantyMonths,
    wadiumPln,
    experienceValuePln,
    experienceAreaM2,
    fullDescription,
    detectedWorkProfile,
    detectedQuantities,
    externalPageTitle: params.externalPageTitle,
    externalPageExcerpt: params.externalPageExcerpt,
    externalDocLinks: params.externalDocLinks,
  };
}

interface CatalogSeed {
  catalogId: string;
  qty: number;
  note?: string;
}

function getCatalogRate(
  catalogId: string,
  settings: EstimateSettings,
  mult: number,
  catalog: CatalogWorkItem[] = WORK_CATALOG
): EstimateLineItem | null {
  const cat = catalog.find((c) => c.id === catalogId);
  if (!cat) return null;
  const r = cat.ratesBySource[settings.sourceId];
  return {
    id: `tnd-${catalogId}`,
    catalogId: cat.id,
    knr: cat.knr,
    name: cat.name,
    category: cat.category,
    unit: cat.unit,
    quantity: 1,
    rateLabor: round2(r.labor * mult),
    rateMaterials: round2(r.materials * mult),
    rateEquipment: round2(r.equipment * mult),
    bdoCode: cat.bdoCode,
    isCustom: false,
  };
}

function buildScaledSeeds(
  profile: TenderWorkProfile,
  orderObject: string,
  fullDesc: string,
  extracted: TenderExtractedData
): {
  seeds: CatalogSeed[];
  scaleBasis: string;
  confidence: TenderAutoEstimate['confidence'];
  confidenceNote: string;
  suggestedStructurePatch?: Partial<StructureParams>;
} {
  const hay = `${orderObject} ${fullDesc}`.toLowerCase();
  const hasAsphaltRemoval = /wymian|frezow|istniej|przebudow|rozbiór|demontaż|remont/.test(hay);
  const hasAsbestos = /azbest|eternit|17\s*06\s*05/.test(hay);
  const hasTrees = /wycink|karczow|drzew/.test(hay);
  const hasConcreteFoundation = /żelbet|zelbet|fundament|beton/.test(hay);
  const hasDewatering = /igłofiltr|odwodnien|wód\s+grunt|ciek|rzek|potok/.test(hay);
  const hasStabilization = /stabilizac|cement|chudym\s+beton/.test(hay);

  const kmQ = extracted.detectedQuantities.find((q) => q.unit === 'km');
  const mbQ = extracted.detectedQuantities.find((q) => q.unit === 'mb');
  const m2Q = extracted.detectedQuantities.find((q) => q.unit === 'm²');
  const haQ = extracted.detectedQuantities.find((q) => q.unit === 'ha');
  const m3Q = extracted.detectedQuantities.find((q) => q.unit === 'm³');
  const tQ = extracted.detectedQuantities.find((q) => q.unit === 't');
  const sztQ = extracted.detectedQuantities.find((q) => q.unit === 'szt.');

  let areaM2 = 0;
  let lengthMb = 0;
  let volumeM3 = 0;
  let tonnesT = 0;
  let scaleBasis = '';
  let confidence: TenderAutoEstimate['confidence'] = 'wstepna';
  let confidenceNote =
    'Wycena wygenerowana z szablonu robót KNR dopasowanego do przedmiotu zamówienia i kodów CPV. Przed złożeniem oferty zweryfikuj przedmiar SWZ.';

  if (kmQ) {
    lengthMb = round2(kmQ.value * 1000);
    const widthAssumed = /chodnik|alei|alej|ścieżk|rower/.test(hay) ? 2.2 : 5.0;
    areaM2 = round2(lengthMb * widthAssumed);
    scaleBasis = `Długość odcinka z ogłoszenia: ${kmQ.normalizedLabel} × szer. ${widthAssumed} m ≈ ${areaM2} m²`;
    confidence = 'srednia';
    confidenceNote =
      'Ilości robót ziemnych i podbudów przeliczone automatycznie na podstawie długości odcinka odczytanej z ogłoszenia.';
  } else if (m2Q) {
    areaM2 = round2(m2Q.value);
    scaleBasis = `Powierzchnia z ogłoszenia: ${m2Q.normalizedLabel}`;
    confidence = 'wysoka';
    confidenceNote =
      'Podstawowy obmiar przeliczony bezpośrednio na bazie powierzchni m² wyodrębnionej z treści ogłoszenia.';
  } else if (haQ) {
    areaM2 = round2(haQ.value * 10000);
    scaleBasis = `Powierzchnia z ogłoszenia: ${haQ.normalizedLabel}`;
    confidence = 'srednia';
    confidenceNote =
      'Powierzchnia przeliczona z hektarów podanych w ogłoszeniu na robocze metry kwadratowe.';
  } else if (m3Q) {
    volumeM3 = round2(m3Q.value);
    scaleBasis = `Kubatura / objętość z ogłoszenia: ${m3Q.normalizedLabel}`;
    confidence = 'wysoka';
    confidenceNote =
      'Ilości skalkulowane bezpośrednio z objętości / kubatury m³ odczytanej z opisu zamówienia.';
  } else if (mbQ) {
    lengthMb = round2(mbQ.value);
    areaM2 = round2(lengthMb * (profile === 'sieci_wykopy' ? 1.2 : 2.5));
    scaleBasis = `Długość liniowa z ogłoszenia: ${mbQ.normalizedLabel}`;
    confidence = 'wysoka';
    confidenceNote =
      'Ilości wykopów liniowych i robót towarzyszących obliczone bezpośrednio z długości mb w ogłoszeniu.';
  } else if (tQ) {
    tonnesT = round2(tQ.value);
    scaleBasis = `Tonaż z ogłoszenia: ${tQ.normalizedLabel}`;
    confidence = 'wysoka';
    confidenceNote =
      'Ilości skalkulowane na podstawie tonażu kruszywa lub odpadów odczytanego z ogłoszenia.';
  } else if (extracted.experienceAreaM2 && extracted.experienceAreaM2 >= 50) {
    areaM2 = round2(extracted.experienceAreaM2 * 1.35);
    scaleBasis = `Skala wg warunku powierzchni z BZP pkt 5.4 (${extracted.experienceAreaM2} m² × 1,35)`;
    confidence = 'srednia';
    confidenceNote =
      'W BZP nie podano pełnego przedmiaru — metraż oszacowano w oparciu o wymaganie doświadczenia (pkt 5.4).';
  } else if (extracted.wadiumPln && extracted.wadiumPln >= 1000) {
    // Szacowany budżet zamówienia ~ wadium / 0.015 (PZP dopuszcza do 1.5% wartości)
    const impliedNet = Math.min(2_800_000, Math.max(45_000, extracted.wadiumPln / 0.015));
    const scaleFactor = impliedNet / 180_000;
    areaM2 = round2(650 * scaleFactor);
    lengthMb = round2(280 * scaleFactor);
    volumeM3 = round2(850 * scaleFactor);
    tonnesT = round2(420 * scaleFactor);
    scaleBasis = `Kalibracja skali wg wadium BZP pkt 6.4.1 (${extracted.wadiumPln.toLocaleString('pl-PL')} zł)`;
    confidence = 'srednia';
    confidenceNote =
      'Skala robót została skalibrowana automatycznie na podstawie wysokości wadium z sekcji 6.4.1 BZP.';
  } else if (extracted.experienceValuePln && extracted.experienceValuePln >= 30000) {
    const scaleFactor = Math.min(12, Math.max(0.4, extracted.experienceValuePln / 250_000));
    areaM2 = round2(600 * scaleFactor);
    lengthMb = round2(240 * scaleFactor);
    volumeM3 = round2(800 * scaleFactor);
    tonnesT = round2(350 * scaleFactor);
    scaleBasis = `Skala wg progu wartości z BZP pkt 5.4 (${extracted.experienceValuePln.toLocaleString('pl-PL')} zł)`;
    confidence = 'srednia';
  } else {
    areaM2 = 650;
    lengthMb = 260;
    volumeM3 = 950;
    tonnesT = 320;
    scaleBasis = 'Wzorzec orientacyjny KNR (brak wymiarów ilościowych w samym tekście BZP)';
    confidence = 'wstepna';
  }

  // Uzupełnij zmienne pochodne jeśli znany był tylko jeden wymiar
  if (areaM2 > 0 && volumeM3 === 0) volumeM3 = round2(areaM2 * 0.45);
  if (volumeM3 > 0 && areaM2 === 0) areaM2 = round2(volumeM3 / 1.8);
  if (areaM2 > 0 && lengthMb === 0) lengthMb = round2(Math.sqrt(areaM2) * 4);
  if (tonnesT === 0) tonnesT = round2(Math.max(40, areaM2 * 0.45));

  const seeds: CatalogSeed[] = [];
  let suggestedStructurePatch: Partial<StructureParams> | undefined;

  switch (profile) {
    case 'rozbiorka': {
      const demoVol = volumeM3 > 200 ? volumeM3 : round2(Math.max(450, areaM2 * 3.8));
      const floorArea = areaM2 > 40 ? areaM2 : round2(demoVol / 4.2);
      if (hasAsbestos) {
        seeds.push({
          catalogId: 'rw-azbest-eternit',
          qty: round2(floorArea * 1.12),
          note: 'Wykryto azbest/eternit w opisie przetargu (BDO 17 06 05*)',
        });
      } else {
        seeds.push({ catalogId: 'rw-rozbiorka-dachu', qty: round2(floorArea * 1.1) });
      }
      if (hasConcreteFoundation) {
        seeds.push({ catalogId: 'rw-obiekt-zelbetowy', qty: demoVol });
        seeds.push({ catalogId: 'rw-skuwanie-law-beton', qty: round2(floorArea * 0.16) });
        seeds.push({ catalogId: 'tu-gruz-betonowy', qty: round2(demoVol * 0.35) });
      } else {
        seeds.push({ catalogId: 'rw-budynek-murowany', qty: demoVol });
        seeds.push({ catalogId: 'tu-gruz-ceglany', qty: round2(demoVol * 0.24) });
      }
      seeds.push({ catalogId: 'rw-skuwanie-posadzek', qty: floorArea });
      seeds.push({ catalogId: 'tu-odpady-zmieszane', qty: round2(Math.max(4, floorArea * 0.035)) });
      seeds.push({ catalogId: 'rz-niwelacja-terenu', qty: round2(floorArea * 1.25) });

      const side = Math.max(8, Math.round(Math.sqrt(floorArea)));
      suggestedStructurePatch = {
        objectType: hasConcreteFoundation ? 'obiekt_zelbetowy' : 'budynek_murowany',
        scopeMode: 'tylko_rozbiorka',
        lengthM: round2(floorArea / side),
        widthM: side,
        heightM: round2(Math.min(14, Math.max(4, demoVol / floorArea))),
        hasAsbestosRoof: hasAsbestos,
      };
      break;
    }

    case 'drogi_nawierzchnie': {
      const roadArea = Math.max(120, areaM2);
      if (hasAsphaltRemoval) {
        seeds.push({
          catalogId: 'rw-nawierzchnia-asfalt',
          qty: round2(roadArea * 0.75),
          note: 'Rozbiórka / frezowanie istniejącej nawierzchni przed przebudową',
        });
      }
      seeds.push({ catalogId: 'rz-korytowanie', qty: roadArea });
      seeds.push({ catalogId: 'ps-geowłoknina', qty: roadArea });
      if (hasStabilization) {
        seeds.push({ catalogId: 'ps-stabilizacja-cement', qty: roadArea });
      }
      seeds.push({ catalogId: 'ps-podbudowa-tluczen', qty: roadArea });
      seeds.push({ catalogId: 'tu-wywoz-urobku', qty: round2(roadArea * 0.3) });
      seeds.push({ catalogId: 'rz-niwelacja-terenu', qty: round2(roadArea * 1.15) });
      seeds.push({ catalogId: 'rz-badanie-zageszczenia', qty: Math.max(3, Math.round(roadArea / 200)) });

      suggestedStructurePatch = {
        objectType: 'budowla_ziemna',
        scopeMode: 'tylko_ziemne',
        lengthM: lengthMb > 20 ? lengthMb : round2(roadArea / 4.5),
        widthM: 4.5,
      };
      break;
    }

    case 'wodne_melioracje': {
      const channelMb = Math.max(120, lengthMb);
      const excVol = m3Q ? m3Q.value : round2(channelMb * 1.8);
      seeds.push({ catalogId: 'rz-wycinka-drzew', qty: Math.max(4, Math.round(channelMb / 60)) });
      seeds.push({ catalogId: 'rz-wykop-szeroko-3', qty: excVol });
      seeds.push({ catalogId: 'rz-niwelacja-terenu', qty: round2(channelMb * 4.5) });
      seeds.push({ catalogId: 'rz-zasypka-zageszczenie', qty: round2(excVol * 0.35) });
      seeds.push({ catalogId: 'tu-wywoz-urobku', qty: round2(excVol * 0.5) });
      if (hasDewatering) {
        seeds.push({ catalogId: 'oz-iglo-montaz', qty: round2(Math.min(140, channelMb * 0.25)) });
      }
      break;
    }

    case 'sieci_wykopy': {
      const trenchMb = Math.max(80, lengthMb);
      const trenchVol = m3Q ? m3Q.value : round2(trenchMb * 1.65);
      seeds.push({ catalogId: 'rz-wykop-liniowy', qty: trenchVol });
      seeds.push({ catalogId: 'oz-szalunek-box', qty: round2(trenchMb * 2.4) });
      seeds.push({ catalogId: 'rz-wymiana-gruntu', qty: round2(trenchVol * 0.28) });
      seeds.push({ catalogId: 'rz-zasypka-zageszczenie', qty: round2(trenchVol * 0.55) });
      seeds.push({ catalogId: 'tu-wywoz-urobku', qty: round2(trenchVol * 0.45) });
      if (hasDewatering) {
        seeds.push({ catalogId: 'oz-iglo-montaz', qty: round2(Math.min(120, trenchMb * 0.25)) });
      }
      seeds.push({ catalogId: 'rz-badanie-zageszczenia', qty: Math.max(3, Math.round(trenchMb / 80)) });
      break;
    }

    case 'kruszywa': {
      const matTonnes = Math.max(40, tonnesT);
      const roadEqM2 = round2(matTonnes / 0.45);
      seeds.push({
        catalogId: 'ps-podbudowa-tluczen',
        qty: roadEqM2,
        note: `Przeliczenie ok. ${matTonnes} t kruszywa na warstwę gr. 25 cm`,
      });
      seeds.push({ catalogId: 'rz-wymiana-gruntu', qty: round2(matTonnes / 1.75) });
      break;
    }

    case 'wycinka_teren': {
      const treeCount = sztQ ? Math.round(sztQ.value) : Math.max(6, Math.round(areaM2 / 140));
      seeds.push({ catalogId: 'rz-wycinka-drzew', qty: treeCount });
      seeds.push({ catalogId: 'rz-karczowanie-pni', qty: treeCount });
      seeds.push({ catalogId: 'rz-humus', qty: round2(Math.max(80, areaM2 * 0.2)) });
      seeds.push({ catalogId: 'rz-niwelacja-terenu', qty: Math.max(300, areaM2) });
      break;
    }

    case 'roboty_ziemne':
    default: {
      const excVol = Math.max(220, volumeM3);
      const siteArea = Math.max(250, areaM2);
      if (hasTrees) {
        const treeCnt = sztQ ? Math.round(sztQ.value) : 6;
        seeds.push({ catalogId: 'rz-wycinka-drzew', qty: treeCnt });
        seeds.push({ catalogId: 'rz-karczowanie-pni', qty: treeCnt });
      }
      seeds.push({ catalogId: 'rz-humus', qty: round2(siteArea * 0.25) });
      seeds.push({ catalogId: 'rz-wykop-szeroko-3', qty: excVol });
      seeds.push({ catalogId: 'rz-wymiana-gruntu', qty: round2(excVol * 0.25) });
      seeds.push({ catalogId: 'rz-zasypka-zageszczenie', qty: round2(excVol * 0.2) });
      seeds.push({ catalogId: 'tu-wywoz-urobku', qty: round2(excVol * 0.72) });
      seeds.push({ catalogId: 'tu-utylizacja-ziemia', qty: round2(excVol * 0.72 * 1.65) });
      seeds.push({ catalogId: 'rz-niwelacja-terenu', qty: siteArea });
      seeds.push({ catalogId: 'rz-badanie-zageszczenia', qty: Math.max(3, Math.round(siteArea / 150)) });
      break;
    }
  }

  return {
    seeds,
    scaleBasis,
    confidence,
    confidenceNote,
    suggestedStructurePatch,
  };
}

export function buildAutoEstimateForTender(
  tender: DolnoslaskieTenderItem,
  settings: EstimateSettings,
  options?: {
    extractedOverride?: TenderExtractedData;
    calculationMethod?: TenderAutoEstimate['calculationMethod'];
    aiItems?: AiAnalysisExtractedItem[];
    catalog?: CatalogWorkItem[];
    subregions?: Record<SubregionId, SubregionMeta>;
  }
): TenderAutoEstimate {
  const activeCatalog = options?.catalog ?? WORK_CATALOG;
  const activeSubregions = options?.subregions ?? SUBREGIONS;
  const extracted =
    options?.extractedOverride ??
    tender.extractedData ??
    extractTenderDataFromText({
      plainText: tender.shortDescription,
      orderObject: tender.orderObject,
      organizationName: tender.organizationName,
      organizationCity: tender.organizationCity,
      cpvCode: tender.cpvCode,
      shortDescription: tender.shortDescription,
    });

  const tenderSettings: EstimateSettings = {
    ...settings,
    subregionId: tender.subregionId,
  };
  const mult = activeSubregions[tenderSettings.subregionId].multiplier;

  let items: EstimateLineItem[] = [];
  let scaleBasis = '';
  let confidence: TenderAutoEstimate['confidence'] = 'wstepna';
  let confidenceNote = '';
  let suggestedStructurePatch: Partial<StructureParams> | undefined;

  if (options?.aiItems && options.aiItems.length > 0) {
    items = options.aiItems.map((aiItem, idx) => {
      const cat = aiItem.catalogId
        ? activeCatalog.find((c) => c.id === aiItem.catalogId)
        : activeCatalog.find((c) => c.knr === aiItem.knr);
      if (cat) {
        const rate = cat.ratesBySource[tenderSettings.sourceId];
        return {
          id: `tnd-ai-${idx + 1}-${cat.id}`,
          catalogId: cat.id,
          knr: cat.knr,
          name: cat.name,
          category: cat.category,
          unit: cat.unit,
          quantity: Math.max(0, round2(Number(aiItem.quantity) || 0)),
          rateLabor: round2(rate.labor * mult),
          rateMaterials: round2(rate.materials * mult),
          rateEquipment: round2(rate.equipment * mult),
          bdoCode: cat.bdoCode ?? aiItem.bdoCode,
          notes: aiItem.reasoning,
          isCustom: false,
        };
      }
      return {
        id: `tnd-ai-custom-${idx + 1}`,
        knr: aiItem.knr || 'KALK. PRZETARG',
        name: aiItem.name,
        category: aiItem.category || 'roboty_ziemne',
        unit: aiItem.unit || 'm³',
        quantity: Math.max(0, round2(Number(aiItem.quantity) || 0)),
        rateLabor: round2(28 * mult),
        rateMaterials: round2(18 * mult),
        rateEquipment: round2(42 * mult),
        bdoCode: aiItem.bdoCode,
        notes: aiItem.reasoning,
        isCustom: true,
      };
    });
    scaleBasis = 'Pogłębiona analiza AI Gemini na podstawie pobranej treści przetargu';
    confidence = 'wysoka';
    confidenceNote = 'Pozycje i ilości wyodrębnione automatycznie z dokumentacji/ogłoszenia przetargowego.';
  } else {
    const built = buildScaledSeeds(
      extracted.detectedWorkProfile,
      tender.orderObject,
      extracted.fullDescription,
      extracted
    );
    scaleBasis = built.scaleBasis;
    confidence = built.confidence;
    confidenceNote = built.confidenceNote;
    suggestedStructurePatch = built.suggestedStructurePatch;

    for (let i = 0; i < built.seeds.length; i++) {
      const seed = built.seeds[i];
      const baseLine = getCatalogRate(seed.catalogId, tenderSettings, mult, activeCatalog);
      if (!baseLine) continue;
      items.push({
        ...baseLine,
        id: `tnd-${tender.id.slice(0, 10)}-${i + 1}-${seed.catalogId}`,
        quantity: round2(seed.qty),
        notes: seed.note,
      });
    }
  }

  const summary = calculateEstimateSummary(items, tenderSettings);

  const addressParts = [
    extracted.organizationStreet,
    extracted.organizationPostalCode
      ? `${extracted.organizationPostalCode} ${tender.organizationCity}`
      : tender.organizationCity,
    'woj. dolnośląskie',
  ].filter(Boolean);

  const suggestedOfferPatch: Partial<OfferMetadata> = {
    clientName: tender.organizationName,
    clientNip:
      extracted.organizationNip ||
      (extracted.organizationRegon ? `REGON ${extracted.organizationRegon}` : 'Wg danych BZP'),
    clientAddress: addressParts.join(', '),
    projectLocation: `${tender.organizationCity} (${tender.noticeNumber}${
      extracted.referenceNumber ? ` · sprawa ${extracted.referenceNumber}` : ''
    })`,
    executionTimeline: extracted.executionPeriod || 'Zgodnie z terminem SWZ / ogłoszenia',
    warrantyMonths: extracted.warrantyMonths || 36,
    additionalNotes: [
      `Automatyczna wycena dla przetargu: ${tender.orderObject} (${tender.noticeNumber}).`,
      extracted.fullDescription ? `Zakres BZP: ${extracted.fullDescription.slice(0, 380)}` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };

  return {
    tenderId: tender.id,
    noticeNumber: tender.noticeNumber,
    calculatedAt: new Date().toISOString(),
    calculationMethod: options?.calculationMethod ?? 'bzp_auto',
    confidence,
    confidenceNote,
    scaleBasis,
    workProfileLabel: WORK_PROFILE_LABELS[extracted.detectedWorkProfile],
    extracted,
    items,
    suggestedOfferPatch,
    suggestedStructurePatch,
    summary,
  };
}
