import type {
  CatalogWorkItem,
  CountyMarginBenchmark,
  EstimateLineItem,
  EstimateSettings,
  OfferMetadata,
  PriceSourceId,
  PriceSourceMeta,
  RegionalClimateProfile,
  RegionalRateTrendProfile,
  SampleDocPreset,
  StructureParams,
  SubregionId,
  SubregionMeta,
  WorkCategory,
} from '../types/estimator.ts';

export const CATEGORY_LABELS: Record<WorkCategory, string> = {
  roboty_ziemne: 'Roboty ziemne',
  rozbiorki_wyburzenia: 'Rozbiórki i wyburzenia',
  odwodnienie_zabezpieczenia: 'Odwodnienie i zabezpieczenia',
  podbudowy_stabilizacja: 'Podbudowy i stabilizacja',
  transport_utylizacja: 'Transport urobku i utylizacja BDO',
};

export const PRICE_SOURCES: Record<PriceSourceId, PriceSourceMeta> = {
  sekocenbud: {
    id: 'sekocenbud',
    name: 'Sekocenbud (Dolny Śląsk)',
    shortName: 'Sekocenbud',
    quarter: 'III–IV kw. 2026',
    description: 'Ogólnopolski biuletyn cen robót ziemnych i inżynieryjnych z korektą regionalną dla woj. dolnośląskiego.',
    hourlyLaborAvg: 34.8,
    equipmentIndex: 1.04,
  },
  intercenbud: {
    id: 'intercenbud',
    name: 'Intercenbud (Baza Regionalna)',
    shortName: 'Intercenbud',
    quarter: 'IV kw. 2026',
    description: 'Zestawienie cen jednostkowych robót budowlano-rozbiórkowych dla przetargów publicznych i komercyjnych.',
    hourlyLaborAvg: 33.4,
    equipmentIndex: 1.0,
  },
  bistyp: {
    id: 'bistyp',
    name: 'Bistyp Consulting',
    shortName: 'Bistyp',
    quarter: 'III kw. 2026',
    description: 'Wskaźniki cenowe dla robót kubaturowych, przemysłowych oraz prac wyburzeniowych ciężkim sprzętem.',
    hourlyLaborAvg: 35.9,
    equipmentIndex: 1.07,
  },
  orgbud: {
    id: 'orgbud',
    name: 'Orgbud-Serwis (Katalog RMS)',
    shortName: 'Orgbud',
    quarter: 'III kw. 2026',
    description: 'Katalogowe nakłady rzeczowe z lokalnymi stawkami sprzętu ciężkiego i zagospodarowania odpadów.',
    hourlyLaborAvg: 32.6,
    equipmentIndex: 0.98,
  },
  rynek_dolnoslaski: {
    id: 'rynek_dolnoslaski',
    name: 'Średnie Stawki Wykonawcze Dolny Śląsk',
    shortName: 'Rynek DŚ',
    quarter: 'Bieżące 2026',
    description: 'Zagregowane oferty wykonawców z Wrocławia, Legnicy, Wałbrzycha i Jeleniej Góry wraz z aktualnymi cenami PSZOK/BDO.',
    hourlyLaborAvg: 38.5,
    equipmentIndex: 1.09,
  },
};

export const SUBREGIONS: Record<SubregionId, SubregionMeta> = {
  wroclaw: {
    id: 'wroclaw',
    name: 'Aglomeracja Wrocławska',
    cities: 'Wrocław, Oleśnica, Oława, Trzebnica, Środa Śląska',
    multiplier: 1.06,
    disposalFeeNote: 'Wyższe opłaty składowiskowe BDO i ograniczenia tonażowe w centrum Wrocławia (+6%).',
  },
  legnica_glogow: {
    id: 'legnica_glogow',
    name: 'Zagłębie Miedziowe (LGOM)',
    cities: 'Legnica, Lubin, Głogów, Polkowice, Jawor',
    multiplier: 1.02,
    disposalFeeNote: 'Konkurencyjny rynek ciężkiego sprzętu przemysłowego, standardowe stawki utylizacji (+2%).',
  },
  walbrzych: {
    id: 'walbrzych',
    name: 'Subregion Wałbrzyski',
    cities: 'Wałbrzych, Świdnica, Dzierżoniów, Kłodzko, Ząbkowice Śl.',
    multiplier: 0.98,
    disposalFeeNote: 'Tereny podgórskie o częstym udziale gruntów kat. IV (skała/rumosz), niższe stawki robocizny (-2%).',
  },
  jelenia_gora: {
    id: 'jelenia_gora',
    name: 'Subregion Jeleniogórski',
    cities: 'Jelenia Góra, Bolesławiec, Zgorzelec, Lubań, Kamienna Góra',
    multiplier: 1.0,
    disposalFeeNote: 'Poziom bazowy dla województwa dolnośląskiego, wydłużone trasy transportowe (0%).',
  },
};

export const LOWER_SILESIA_COUNTY_MARGINS: CountyMarginBenchmark[] = [
  {
    id: 'm_wroclaw',
    name: 'm. Wrocław',
    shortName: 'm. Wrocław',
    subregionId: 'wroclaw',
    avgMarginPct: 8.9,
    typicalRangeMinPct: 7.4,
    typicalRangeMaxPct: 10.8,
    marketNote: 'Wysoki popyt przemysłowo-komercyjny i logistyka w strefach śródmiejskich.',
  },
  {
    id: 'pow_wroclawski',
    name: 'powiat wrocławski',
    shortName: 'pow. wrocławski',
    subregionId: 'wroclaw',
    avgMarginPct: 8.4,
    typicalRangeMinPct: 6.9,
    typicalRangeMaxPct: 10.1,
    marketNote: 'Inwestycje magazynowe (Bielany, Kobierzyce, Długołęka) o stabilnych marżach.',
  },
  {
    id: 'pow_lubinski',
    name: 'powiat lubiński',
    shortName: 'pow. lubiński',
    subregionId: 'legnica_glogow',
    avgMarginPct: 9.3,
    typicalRangeMinPct: 7.8,
    typicalRangeMaxPct: 11.4,
    marketNote: 'Zlecenia przemysłowe i górniczo-hutnicze wymagające ciężkiego sprzętu.',
  },
  {
    id: 'pow_legnicki',
    name: 'powiat legnicki i m. Legnica',
    shortName: 'pow. legnicki',
    subregionId: 'legnica_glogow',
    avgMarginPct: 8.1,
    typicalRangeMinPct: 6.5,
    typicalRangeMaxPct: 9.6,
    marketNote: 'Duże tereny inwestycyjne LSSE i umiarkowana konkurencja wykonawców.',
  },
  {
    id: 'pow_boleslawiecki',
    name: 'powiat bolesławiecki',
    shortName: 'pow. bolesławiecki',
    subregionId: 'jelenia_gora',
    avgMarginPct: 7.6,
    typicalRangeMinPct: 6.2,
    typicalRangeMaxPct: 9.1,
    marketNote: 'Bliskość kopalń kruszyw i strefy ekonomiczne wzdłuż A4/A18.',
  },
  {
    id: 'pow_lwowecki',
    name: 'powiat lwówecki',
    shortName: 'pow. lwówecki',
    subregionId: 'jelenia_gora',
    avgMarginPct: 6.8,
    typicalRangeMinPct: 5.4,
    typicalRangeMaxPct: 8.3,
    marketNote: 'Przewaga przetargów samorządowych i melioracyjnych z silną presją cenową.',
  },
  {
    id: 'pow_zlotoryjski',
    name: 'powiat złotoryjski',
    shortName: 'pow. złotoryjski',
    subregionId: 'jelenia_gora',
    avgMarginPct: 7.1,
    typicalRangeMinPct: 5.7,
    typicalRangeMaxPct: 8.6,
    marketNote: 'Niskie koszty zakupu bazaltu (Wojciechów/Czaple), średnia konkurencja.',
  },
  {
    id: 'pow_swidnicki',
    name: 'powiat świdnicki',
    shortName: 'pow. świdnicki',
    subregionId: 'walbrzych',
    avgMarginPct: 7.5,
    typicalRangeMinPct: 6.0,
    typicalRangeMaxPct: 9.0,
    marketNote: 'Równowaga między zleceniami drogowymi a robotami kubaturowymi.',
  },
  {
    id: 'pow_walbrzyski',
    name: 'powiat wałbrzyski i m. Wałbrzych',
    shortName: 'pow. wałbrzyski',
    subregionId: 'walbrzych',
    avgMarginPct: 6.5,
    typicalRangeMinPct: 5.0,
    typicalRangeMaxPct: 8.1,
    marketNote: 'Trudniejsze grunty skaliste (kat. IV) przy napiętych budżetach przetargowych.',
  },
  {
    id: 'pow_karkonoski',
    name: 'powiat karkonoski i Jelenia Góra',
    shortName: 'pow. karkonoski',
    subregionId: 'jelenia_gora',
    avgMarginPct: 7.8,
    typicalRangeMinPct: 6.3,
    typicalRangeMaxPct: 9.4,
    marketNote: 'Wyższe stawki sprzętu w terenie górskim i dłuższe dojazdy na budowy.',
  },
];

export const BASE_EQUIPMENT_HOURLY_RATE_PLN = 205;

const HISTORY_12M_KEYS = [
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
];

const HISTORY_12M_LABELS = [
  'gru 25',
  'sty 26',
  'lut 26',
  'mar 26',
  'kwi 26',
  'maj 26',
  'cze 26',
  'lip 26',
  'sie 26',
  'wrz 26',
  'paź 26',
  'lis 26',
];

// Względne indeksy historyczne (1.000 = listopad 2026) oddające sezonowość robót ziemnych oraz wzrost kosztów pracy i paliw w subregionach DŚ.
export const REGIONAL_12M_TREND_PROFILES: Record<SubregionId, RegionalRateTrendProfile> = {
  wroclaw: {
    subregionId: 'wroclaw',
    months: HISTORY_12M_KEYS,
    monthLabels: HISTORY_12M_LABELS,
    laborRelIndices: [0.922, 0.931, 0.935, 0.946, 0.959, 0.971, 0.982, 0.988, 0.994, 0.997, 0.999, 1.0],
    equipmentRelIndices: [0.938, 0.941, 0.939, 0.952, 0.964, 0.975, 0.986, 0.992, 0.997, 1.002, 1.001, 1.0],
    driverNote: 'Silna presja płacowa brygad wrocławskich (+8,5% r/r) i wyższe koszty pracy sprzętu przy inwestycjach kubaturowych.',
  },
  legnica_glogow: {
    subregionId: 'legnica_glogow',
    months: HISTORY_12M_KEYS,
    monthLabels: HISTORY_12M_LABELS,
    laborRelIndices: [0.934, 0.940, 0.943, 0.951, 0.962, 0.970, 0.979, 0.985, 0.991, 0.995, 0.998, 1.0],
    equipmentRelIndices: [0.945, 0.948, 0.946, 0.955, 0.963, 0.971, 0.981, 0.987, 0.994, 0.998, 0.999, 1.0],
    driverNote: 'Stabilne stawki operatorów w rejonie LGOM wsparte stałymi kontraktami przemysłowymi i dobrą dostępnością ciężkich maszyn.',
  },
  walbrzych: {
    subregionId: 'walbrzych',
    months: HISTORY_12M_KEYS,
    monthLabels: HISTORY_12M_LABELS,
    laborRelIndices: [0.944, 0.949, 0.947, 0.956, 0.966, 0.974, 0.981, 0.986, 0.992, 0.996, 0.999, 1.0],
    equipmentRelIndices: [0.930, 0.934, 0.936, 0.949, 0.962, 0.973, 0.984, 0.991, 0.996, 1.004, 1.002, 1.0],
    driverNote: 'Wolniejszy wzrost robocizny niż we Wrocławiu (+5,9% r/r), ale większa zmienność sprzętu przez pracę młotów w gruntach kat. IV.',
  },
  jelenia_gora: {
    subregionId: 'jelenia_gora',
    months: HISTORY_12M_KEYS,
    monthLabels: HISTORY_12M_LABELS,
    laborRelIndices: [0.936, 0.941, 0.940, 0.950, 0.961, 0.972, 0.980, 0.988, 0.994, 0.997, 0.998, 1.0],
    equipmentRelIndices: [0.934, 0.938, 0.937, 0.951, 0.964, 0.976, 0.985, 0.993, 0.999, 1.003, 1.001, 1.0],
    driverNote: 'Wyraźny szczyt sezonowy cen sprzętu w okresie wiosenno-jesiennym związany z dłuższym transportem i pracami drogowymi.',
  },
};

// Miesięczne sumy opadów (mm, Sty–Gru) oraz wskaźniki mrozu i roztopów dla subregionów woj. dolnośląskiego.
export const REGIONAL_CLIMATE_PROFILES: Record<SubregionId, RegionalClimateProfile> = {
  wroclaw: {
    subregionId: 'wroclaw',
    precipitationMm: [30, 27, 34, 38, 56, 68, 84, 67, 46, 37, 36, 33],
    frostThawIndices: [22, 20, 14, 5, 3, 5, 8, 6, 4, 7, 13, 19],
    climateNote: 'Nizina Śląska (~556 mm/rok): łagodniejsze zimy w dolinie Odry, ale wysokie ryzyko nawalnych burz w lipcu oraz jesiennego rozmakania glin.',
  },
  legnica_glogow: {
    subregionId: 'legnica_glogow',
    precipitationMm: [29, 26, 33, 36, 54, 64, 79, 64, 44, 36, 35, 32],
    frostThawIndices: [21, 19, 13, 5, 3, 4, 7, 5, 4, 7, 12, 18],
    climateNote: 'Równina Legnicka i LGOM (~532 mm/rok): najniższe opady w województwie, długie okno robót ziemnych od kwietnia do października.',
  },
  walbrzych: {
    subregionId: 'walbrzych',
    precipitationMm: [44, 40, 48, 52, 72, 85, 101, 82, 60, 49, 48, 46],
    frostThawIndices: [29, 27, 21, 9, 5, 7, 10, 8, 6, 11, 19, 26],
    climateNote: 'Przedgórze i Sudety Środkowe (~727 mm/rok): silne roztopy marcowe, wyższe opady letnie i częstsze przymrozki utrudniające zagęszczanie nasypów.',
  },
  jelenia_gora: {
    subregionId: 'jelenia_gora',
    precipitationMm: [50, 45, 54, 58, 79, 96, 114, 92, 68, 55, 54, 52],
    frostThawIndices: [33, 31, 24, 11, 6, 8, 12, 10, 7, 13, 22, 29],
    climateNote: 'Kotlina Jeleniogórska i Pogórze Izerskie (~817 mm/rok): najwyższe opady i wydłużone zaleganie pokrywy śnieżnej wymagające wyższych rezerw czasowych.',
  },
};

function makeRates(
  labor: number,
  materials: number,
  equipment: number
): Record<PriceSourceId, { labor: number; materials: number; equipment: number }> {
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    sekocenbud: { labor: r(labor), materials: r(materials), equipment: r(equipment) },
    intercenbud: { labor: r(labor * 0.96), materials: r(materials * 0.98), equipment: r(equipment * 0.97) },
    bistyp: { labor: r(labor * 1.03), materials: r(materials * 1.02), equipment: r(equipment * 1.05) },
    orgbud: { labor: r(labor * 0.94), materials: r(materials * 0.97), equipment: r(equipment * 0.95) },
    rynek_dolnoslaski: { labor: r(labor * 1.08), materials: r(materials * 1.04), equipment: r(equipment * 1.1) },
  };
}

export const WORK_CATALOG: CatalogWorkItem[] = [
  // ================= ROBOTY ZIEMNE =================
  {
    id: 'rz-humus',
    knr: 'KNR 2-01 0126-01',
    name: 'Zdjęcie warstwy ziemi urodzajnej (humusu) spycharką z odłożeniem na pryzmę',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Mechaniczne usunięcie wierzchniej warstwy humusu gr. 20–30 cm wraz ze zgarnięciem na pryzmy tymczasowe.',
    ratesBySource: makeRates(3.8, 0, 14.5),
  },
  {
    id: 'rz-wykop-szeroko-1-2',
    knr: 'KNR 2-01 0205-02',
    name: 'Wykopy szerokoprzestrzenne koparką podsiębierną w gruncie kat. I–II z załadunkiem',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Wykopy pod budynki, hale i place w gruntach piaszczystych i gliniastych lekkich z załadunkiem na wywrotki.',
    ratesBySource: makeRates(4.2, 0, 19.6),
  },
  {
    id: 'rz-wykop-szeroko-3',
    knr: 'KNR 2-01 0206-02',
    name: 'Wykopy szerokoprzestrzenne koparką podsiębierną w gruncie kat. III z załadunkiem',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Wykopy w glinach zwięzłych, iłach i gruntach średnio spoistych typowych dla Dolnego Śląska.',
    ratesBySource: makeRates(5.6, 0, 24.8),
  },
  {
    id: 'rz-wykop-szeroko-4',
    knr: 'KNR 2-01 0217-04',
    name: 'Wykopy szerokoprzestrzenne w gruncie kat. IV (zwietrzelina, rumosz skalny) z kłuciem',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Wykopy w gruntach twardych i skalistych (Pogórze Sudeckie / okolice Wałbrzycha) z użyciem młota hydraulicznego.',
    ratesBySource: makeRates(11.4, 0, 56.0),
  },
  {
    id: 'rz-wykop-liniowy',
    knr: 'KNR 2-01 0218-02',
    name: 'Wykopy liniowe pod ławy fundamentowe i sieci uzbrojenia (kat. III)',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Kopanie rowów i wykopów wąskoprzestrzennych o szerokości do 1,5 m i głębokości do 3,0 m.',
    ratesBySource: makeRates(8.9, 0, 31.5),
  },
  {
    id: 'rz-wykop-reczny',
    knr: 'KNR 2-01 0306-02',
    name: 'Wykopy ręczne precyzyjne w pobliżu czynnego uzbrojenia podziemnego (kat. III)',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Odkrywki kabli SN/nN, gazociągów oraz wodociągów wraz z wyrównaniem dna wykopu.',
    ratesBySource: makeRates(98.0, 2.5, 4.0),
  },
  {
    id: 'rz-korytowanie',
    knr: 'KNR 2-31 0101-01',
    name: 'Korytowanie pod drogi wewnętrzne, place manewrowe i posadzki przemysłowe (gł. 30 cm)',
    category: 'roboty_ziemne',
    unit: 'm²',
    description: 'Mechaniczne wykonanie koryta równiarką lub koparką wraz z profilowaniem i zagęszczeniem podłoża.',
    ratesBySource: makeRates(3.4, 0, 12.8),
  },
  {
    id: 'rz-zasypka-zageszczenie',
    knr: 'KNR 2-01 0230-01',
    name: 'Zasypanie wykopów gruntem rodzimym z zagęszczeniem mechanicznym warstwami co 25 cm',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Obsypanie fundamentów i ścian przy użyciu koparko-ładowarki i zagęszczarek płytowych (Is ≥ 0,97).',
    ratesBySource: makeRates(14.5, 0, 22.0),
  },
  {
    id: 'rz-wymiana-gruntu',
    knr: 'KNR 2-01 0236-02',
    name: 'Wymiana gruntu na pospółkę lub piasek zasypowy z dostawą i zagęszczeniem (Is ≥ 0,98)',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Dostawa kruszywa naturalnego z dolnośląskich żwirowni (np. Mietków/Proszowice), wbudowanie warstwami i badanie płytą VSS.',
    ratesBySource: makeRates(16.0, 68.0, 26.0),
  },
  {
    id: 'rz-nasyp-budowlany',
    knr: 'KNR 2-01 0232-02',
    name: 'Formowanie i zagęszczanie nasypów budowlanych z gruntu dowiezionego (Is ≥ 0,98)',
    category: 'roboty_ziemne',
    unit: 'm³',
    description: 'Podniesienie rzędnej terenu z dostawą gruntu niewysadzinowego, rozplantowaniem spycharką i walcowaniem.',
    ratesBySource: makeRates(12.2, 54.0, 24.5),
  },
  {
    id: 'rz-niwelacja-terenu',
    knr: 'KNR 2-01 0501-01',
    name: 'Makroniwelacja i plantowanie powierzchni terenu spycharką z obsługą geodezyjną',
    category: 'roboty_ziemne',
    unit: 'm²',
    description: 'Wyrównanie i nadanie spadków terenu pod inwestycję wraz z tyczeniem punktów wysokościowych.',
    ratesBySource: makeRates(2.1, 0.3, 6.4),
  },
  {
    id: 'rz-wycinka-drzew',
    knr: 'KNR 2-21 0103-01',
    name: 'Wycinka drzew o średnicy pnia 26–50 cm wraz z pocięciem i zrębkowaniem gałęzi',
    category: 'roboty_ziemne',
    unit: 'szt.',
    description: 'Prace pilarzy oraz rębarki w obrębie placu budowy zgodnie z decyzją środowiskową.',
    ratesBySource: makeRates(245.0, 12.0, 145.0),
  },
  {
    id: 'rz-karczowanie-pni',
    knr: 'KNR 2-01 0106-03',
    name: 'Mechaniczne karczowanie pniaków po wycince wraz z zasypaniem dołów',
    category: 'roboty_ziemne',
    unit: 'szt.',
    description: 'Wyrywanie karp koparką z zębem zrywającym oraz wyrównanie śladów po wykopie.',
    ratesBySource: makeRates(42.0, 0, 175.0),
  },
  {
    id: 'rz-badanie-zageszczenia',
    knr: 'KNRW 2-01 0236-09',
    name: 'Badanie nośności i zagęszczenia podłoża płytą dynamiczną / VSS z protokołem',
    category: 'roboty_ziemne',
    unit: 'szt.',
    description: 'Punktowy odbiór zagęszczenia gruntu (E2, wskaźnik odkształcenia Io) przez laboratorium geotechniczne.',
    ratesBySource: makeRates(120.0, 15.0, 95.0),
  },

  // ================= ROZBIÓRKI I WYBURZENIA =================
  {
    id: 'rw-budynek-murowany',
    knr: 'KNR 4-04 0601-01',
    name: 'Mechaniczne wyburzenie budynku murowanego koparką wyburzeniową z kruszeniem wstępnym',
    category: 'rozbiorki_wyburzenia',
    unit: 'm³',
    description: 'Rozbiórka kubaturowa obiektów ceglanych i z pustaków wraz ze zraszaniem przeciwpyłowym.',
    ratesBySource: makeRates(9.5, 1.8, 34.0),
  },
  {
    id: 'rw-obiekt-zelbetowy',
    knr: 'KNR 4-04 0604-02',
    name: 'Wyburzenie konstrukcji żelbetowych ciężkich przy użyciu młota i nożyc kruszących',
    category: 'rozbiorki_wyburzenia',
    unit: 'm³',
    description: 'Wyburzenie szkieletów, ścian i stropów żelbetowych (rozliczane od m³ kubatury obiektu lub m³ betonu wg wyboru).',
    ratesBySource: makeRates(16.0, 2.5, 62.0),
  },
  {
    id: 'rw-hala-stalowa',
    knr: 'KNR 4-04 0701-02',
    name: 'Demontaż konstrukcji hali stalowej z cięciem palnikami i segregacją złomu',
    category: 'rozbiorki_wyburzenia',
    unit: 't',
    description: 'Rozbiórka słupów, dźwigarów kratowych i płatwi stalowych z użyciem podnośników oraz dźwigu.',
    ratesBySource: makeRates(420.0, 65.0, 490.0),
  },
  {
    id: 'rw-skuwanie-law-beton',
    knr: 'KNR 4-04 0202-02',
    name: 'Skuwanie podziemnych fundamentów, stóp i ław żelbetowych młotem hydraulicznym',
    category: 'rozbiorki_wyburzenia',
    unit: 'm³',
    description: 'Rozkucie zbrojonych fundamentów (m³ elementu betonowego) wraz z odcięciem zbrojenia.',
    ratesBySource: makeRates(48.0, 12.0, 265.0),
  },
  {
    id: 'rw-skuwanie-posadzek',
    knr: 'KNR 4-04 0401-03',
    name: 'Rozbiórka przemysłowych posadzek betonowych zbrojonych (gr. 15–25 cm)',
    category: 'rozbiorki_wyburzenia',
    unit: 'm²',
    description: 'Nacinanie dylatacji, podrywanie koparką oraz kruszenie płyt posadzkowych.',
    ratesBySource: makeRates(8.5, 2.2, 29.0),
  },
  {
    id: 'rw-rozbiorka-scian-reczna',
    knr: 'KNR 4-01 0348-01',
    name: 'Rozbiórka ręczna ścianek działowych i fragmentów murów w obiektach czynnych',
    category: 'rozbiorki_wyburzenia',
    unit: 'm²',
    description: 'Prace wyburzeniowe bez użycia ciężkiego sprzętu w sąsiedztwie zachowanej zabudowy.',
    ratesBySource: makeRates(46.0, 3.0, 9.5),
  },
  {
    id: 'rw-rozbiorka-dachu',
    knr: 'KNR 4-01 0535-01',
    name: 'Demontaż pokrycia dachowego z blachy/dachówki wraz z więźbą drewnianą',
    category: 'rozbiorki_wyburzenia',
    unit: 'm²',
    description: 'Zdjęcie pokrycia, łacenia i krokwi z opuszczeniem na poziom terenu oraz segregacją drewna.',
    ratesBySource: makeRates(29.0, 1.5, 11.0),
  },
  {
    id: 'rw-nawierzchnia-asfalt',
    knr: 'KNR 4-04 0502-01',
    name: 'Rozbiórka nawierzchni asfaltowych i podbudów z kruszywa łamanego (gr. do 20 cm)',
    category: 'rozbiorki_wyburzenia',
    unit: 'm²',
    description: 'Frezowanie lub zrywanie nawierzchni bitumicznej z załadunkiem destruktu.',
    ratesBySource: makeRates(4.8, 0.8, 22.4),
  },
  {
    id: 'rw-kruszenie-mobilne',
    knr: 'KNNR 1 0803-01',
    name: 'Kruszenie gruzu betonowo-ceglanego na placu budowy kruszarką szczękową (frakcja 0–63 mm)',
    category: 'rozbiorki_wyburzenia',
    unit: 't',
    description: 'Przerób gruzu na kruszywo wtórne do wykorzystania na podbudowy lub drogi tymczasowe (odzyskuje koszt zakupu kruszywa).',
    ratesBySource: makeRates(4.2, 0.5, 21.5),
  },
  {
    id: 'rw-azbest-eternit',
    knr: 'KNR-W 4-01 0519-04',
    name: 'Demontaż, pakowanie i przekazanie do utylizacji płyt azbestowo-cementowych (eternit)',
    category: 'rozbiorki_wyburzenia',
    unit: 'm²',
    bdoCode: '17 06 05*',
    description: 'Prace specjalistyczne przez uprawnioną brygadę z zabezpieczeniem folią, zgłoszeniem do PIP/SANEPID i kartą BDO.',
    ratesBySource: makeRates(38.0, 14.5, 19.0),
  },

  // ================= ODWODNIENIE I ZABEZPIECZENIA =================
  {
    id: 'oz-iglo-montaz',
    knr: 'KNR 2-01 0602-01',
    name: 'Odwodnienie wykopu zestawem igłofiltrowym — montaż, eksploatacja i demontaż (mb kolektora)',
    category: 'odwodnienie_zabezpieczenia',
    unit: 'mb',
    description: 'Wpłukiwanie igłofiltrów co 1,0 m, rurociąg zbiorczy oraz pompa próżniowa (stawka za mb obwodu na okres 14 dni).',
    ratesBySource: makeRates(68.0, 42.0, 148.0),
  },
  {
    id: 'oz-grodzice-larsen',
    knr: 'KNR 2-01 0322-03',
    name: 'Zabezpieczenie ścian wykopu ścianką szczelną z grodzic stalowych (wibrowanie + wyciąganie)',
    category: 'odwodnienie_zabezpieczenia',
    unit: 'm²',
    description: 'Pogrążenie i późniejsze wyciągnięcie grodzic typu Larssen wraz z dzierżawą profili stalowych.',
    ratesBySource: makeRates(54.0, 95.0, 185.0),
  },
  {
    id: 'oz-szalunek-box',
    knr: 'KNR 2-01 0312-01',
    name: 'Obudowa wykopów liniowych płytowymi systemami szalunkowymi (typu Box)',
    category: 'odwodnienie_zabezpieczenia',
    unit: 'm²',
    description: 'Montaż, przestawianie i demontaż rozporowych obudów wykopów głębokich powyżej 1,5 m.',
    ratesBySource: makeRates(18.5, 16.0, 32.0),
  },

  // ================= PODBUDOWY I STABILIZACJA =================
  {
    id: 'ps-stabilizacja-cement',
    knr: 'KNR 2-31 0110-02',
    name: 'Stabilizacja gruntu spoiwem hydraulicznym (cementem) Rm = 2,5 MPa gr. 20 cm',
    category: 'podbudowy_stabilizacja',
    unit: 'm²',
    description: 'Rozsypanie cementu, wymieszanie recyklerem gruntowym oraz zagęszczenie walcem gładkim.',
    ratesBySource: makeRates(5.2, 24.5, 13.8),
  },
  {
    id: 'ps-podbudowa-tluczen',
    knr: 'KNR 2-31 0114-05',
    name: 'Podbudowa z kruszywa łamanego granitowego/bazaltowego 0–31,5 mm gr. 25 cm (złoża DŚ)',
    category: 'podbudowy_stabilizacja',
    unit: 'm²',
    description: 'Kruszywo łamane z dolnośląskich kopalń (Strzegom/Sobótka) z rozłożeniem i zagęszczeniem.',
    ratesBySource: makeRates(6.4, 46.0, 14.2),
  },
  {
    id: 'ps-geowłoknina',
    knr: 'KNR 2-31 0104-01',
    name: 'Ułożenie geowłókniny separacyjno-filtracyjnej 200 g/m² na dnie wykopu',
    category: 'podbudowy_stabilizacja',
    unit: 'm²',
    description: 'Rozwinięcie z zakładem 30 cm celem oddzielenia podłoża spoistego od warstwy kruszywa.',
    ratesBySource: makeRates(2.6, 8.9, 0.8),
  },

  // ================= TRANSPORT I UTYLIZACJA BDO =================
  {
    id: 'tu-wywoz-urobku',
    knr: 'KNR 4-01 0108-11',
    name: 'Wywóz nadmiaru urobku ziemnego wywrotkami 4-osiowymi na odległość do 15 km',
    category: 'transport_utylizacja',
    unit: 'm³',
    bdoCode: '17 05 04',
    description: 'Transport ziemi niezanieczyszczonej (kod BDO 17 05 04) wraz z rozładunkiem na zwałce lub budowie docelowej.',
    ratesBySource: makeRates(2.5, 0, 34.5),
  },
  {
    id: 'tu-utylizacja-ziemia',
    knr: 'KNR 4-01 0108-99',
    name: 'Opłata za przyjęcie i zagospodarowanie gruntu z wykopów (BDO 17 05 04)',
    category: 'transport_utylizacja',
    unit: 't',
    bdoCode: '17 05 04',
    description: 'Koszt karty przekazania odpadu i przyjęcia na legalnym składowisku / rekultywacji wyrobisk w woj. dolnośląskim.',
    ratesBySource: makeRates(0, 26.0, 2.0),
  },
  {
    id: 'tu-gruz-betonowy',
    knr: 'KNR 4-04 1103-01',
    name: 'Wywóz i utylizacja czystego gruzu betonowego w zakładzie recyklingu (BDO 17 01 01)',
    category: 'transport_utylizacja',
    unit: 't',
    bdoCode: '17 01 01',
    description: 'Transport samowyładowczy do 15 km oraz opłata bramowa na kruszarni odpadów budowlanych.',
    ratesBySource: makeRates(2.2, 32.0, 24.5),
  },
  {
    id: 'tu-gruz-ceglany',
    knr: 'KNR 4-04 1103-02',
    name: 'Wywóz i utylizacja gruzu ceglanego i ceramicznego (BDO 17 01 02)',
    category: 'transport_utylizacja',
    unit: 't',
    bdoCode: '17 01 02',
    description: 'Transport gruzu ceglanego wraz z zagospodarowaniem odpadu i ewidencją w BDO.',
    ratesBySource: makeRates(2.2, 36.0, 24.5),
  },
  {
    id: 'tu-odpady-zmieszane',
    knr: 'KNR 4-04 1104-01',
    name: 'Wywóz i utylizacja zmieszanych odpadów z rozbiórki (papa, izolacje, drewno — BDO 17 09 04)',
    category: 'transport_utylizacja',
    unit: 't',
    bdoCode: '17 09 04',
    description: 'Kontenery KP-7 / KP-15 lub wanny transportowe wraz z wysoką opłatą marszałkowską za odpady zmieszane.',
    ratesBySource: makeRates(8.0, 485.0, 52.0),
  },
];

export const DEFAULT_ESTIMATE_SETTINGS: EstimateSettings = {
  sourceId: 'rynek_dolnoslaski',
  subregionId: 'wroclaw',
  indirectCostsPct: 12,
  profitPct: 8,
  vatRate: 23,
  discountPct: 0,
};

export const DEFAULT_STRUCTURE_PARAMS: StructureParams = {
  projectName: 'Rozbiórka magazynu i wykop pod halę usługową — Wrocław Psie Pole',
  objectType: 'budynek_murowany',
  scopeMode: 'kompleksowo',
  lengthM: 24,
  widthM: 14,
  heightM: 6.5,
  floors: 1,
  basementDepthM: 0,
  wallThicknessCm: 38,
  excavationDepthM: 1.8,
  overdigMarginM: 1.0,
  soilCategory: 'III',
  haulDistanceKm: 15,
  groundwaterLowering: false,
  shoringRequired: false,
  hasAsbestosRoof: false,
  treesToRemove: 4,
};

export const DEFAULT_OFFER_METADATA: OfferMetadata = {
  offerNumber: 'OF/DŚ/2026/114',
  issueDate: '2026-11-17',
  validUntil: '2026-12-17',
  contractorName: 'Dolnośląskie Przedsiębiorstwo Robót Ziemnych i Wyburzeń Sp. z o.o.',
  contractorNip: '895-214-88-30',
  contractorAddress: 'ul. Bierutowska 57, 51-317 Wrocław',
  contractorPhone: '+48 71 342 88 10',
  contractorEmail: 'wyceny@dprz-wroclaw.pl',
  clientName: 'Inwestycje Przemysłowe Odra Sp. z o.o.',
  clientNip: '897-182-44-19',
  clientAddress: 'ul. Legnicka 48, 54-202 Wrocław',
  projectLocation: 'Wrocław, obręb Psie Pole, dz. nr 142/8',
  executionTimeline: '21 dni roboczych od przekazania placu budowy',
  paymentTerms: '14 dni od daty wystawienia faktury (rozliczenie częściowe co 10 dni)',
  warrantyMonths: 36,
  exclusions:
    'Wycena nie obejmuje przełożenia niezinwentaryzowanych sieci podziemnych, uzyskania pozwolenia na rozbiórkę/wycinkę oraz kosztów zajęcia pasa drogowego.',
  additionalNotes:
    'Wszystkie odpady podlegają ewidencji w systemie BDO z przekazaniem Kart Przekazania Odpadów (KPO) Zamawiającemu. Złom stalowy pozostaje do rozliczenia wg uzgodnień.',
};

export function buildInitialEstimateItems(
  sourceId: PriceSourceId,
  subregionId: SubregionId
): EstimateLineItem[] {
  const mult = SUBREGIONS[subregionId].multiplier;
  const seedSpec: { id: string; quantity: number }[] = [
    { id: 'rw-budynek-murowany', quantity: 2184 },
    { id: 'rw-skuwanie-posadzek', quantity: 336 },
    { id: 'tu-gruz-ceglany', quantity: 385 },
    { id: 'rz-humus', quantity: 145 },
    { id: 'rz-wykop-szeroko-3', quantity: 720 },
    { id: 'rz-wymiana-gruntu', quantity: 165 },
    { id: 'tu-wywoz-urobku', quantity: 580 },
    { id: 'rz-wycinka-drzew', quantity: 4 },
  ];

  return seedSpec.map(({ id, quantity }, idx) => {
    const item = WORK_CATALOG.find((c) => c.id === id)!;
    const rate = item.ratesBySource[sourceId];
    return {
      id: `line-${idx + 1}-${id}`,
      catalogId: item.id,
      knr: item.knr,
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity,
      rateLabor: Math.round(rate.labor * mult * 100) / 100,
      rateMaterials: Math.round(rate.materials * mult * 100) / 100,
      rateEquipment: Math.round(rate.equipment * mult * 100) / 100,
      bdoCode: item.bdoCode,
      isCustom: false,
    };
  });
}

export const SAMPLE_DOC_PRESETS: SampleDocPreset[] = [
  {
    id: 'wroclaw-magazyn',
    title: 'Projekt rozbiórki magazynu ceglanego i wymiany gruntu — Wrocław, ul. Krakowska',
    subregion: 'wroclaw',
    location: 'Wrocław Krzyki, ul. Krakowska 112',
    content: `OPIS TECHNICZNY PROJEKTU ROZBIÓRKI I PRZYGOTOWANIA TERENU
Lokalizacja inwestycji: Wrocław, obręb Południe, ul. Krakowska 112.
1. Zakres rozbiórki istniejącego obiektu:
- Budynek magazynowy murowany z cegły pełnej, 2-kondygnacyjny, niepodpiwniczony.
- Wymiary zewnętrzne w rzucie: długość 28,5 m, szerokość 14,0 m, wysokość do kalenicy 8,4 m (kubatura brutto ok. 3350 m³).
- Posadzka przemysłowa betonowa gr. 20 cm na gruncie o powierzchni 399 m².
- Ławy fundamentowe żelbetowe szer. 60 cm, wys. 80 cm na obwodzie 85 mb (ok. 41 m³ betonu).
- Pokrycie dachowe z płyt falistych azbestowo-cementowych (eternit) o pow. 430 m² (kod odpadu BDO 17 06 05*).
- Szacowana masa gruzu ceglanego: 510 t (kod 17 01 02), gruz betonowy: 260 t (17 01 01), odpady zmieszane papy i drewna: 18 t (17 09 04).
2. Roboty ziemne przygotowawcze pod nową zabudowę:
- Zdjęcie warstwy humusu gr. 25 cm na powierzchni 950 m² (237,5 m³).
- Wykop szerokoprzestrzenny pod płytę fundamentową do głębokości 2,2 m (grunty spoiste kat. III — gliny pylaste). Objętość wykopu z odkosami: ok. 1150 m³.
- Wymiana nienośnej warstwy nasypów na pospółkę zagęszczoną do Is >= 0,98: 290 m³.
- Wywóz nadmiaru ziemi na odkład poza plac budowy (odl. ok. 14 km): 860 m³.
- Wody gruntowe na głębokości 1,7 m ppt — wymagane czasowe odwodnienie zestawem igłofiltrowym po obwodzie ok. 92 mb.`,
  },
  {
    id: 'legnica-hala',
    title: 'Makroniwelacja i wykopy pod halę produkcyjną — Legnica (LSSE)',
    subregion: 'legnica_glogow',
    location: 'Legnica, Legnicka Specjalna Strefa Ekonomiczna',
    content: `SPECYFIKACJA TECHNICZNA ROBÓT ZIEMNYCH — HALA PRODUKCYJNO-LOGISTYCZNA
Inwestor: LSSE Park Przemysłowy. Lokalizacja: Legnica, działka nr 45/12.
Parametry projektowanej hali:
- Rzut budynku: 60,0 m x 32,0 m (powierzchnia zabudowy 1920 m²).
- Całkowity teren pod niwelację wraz z placem manewrowym i drogami: 4500 m².
Zakres prac ziemnych:
1. Wycinka 12 szt. drzew samosiejek (śr. 25-40 cm) wraz z mechanicznym karczowaniem pni (12 szt.).
2. Zdjęcie humusu na całym placu 4500 m² o śr. miąższości 30 cm (1350 m³).
3. Wykopy szerokoprzestrzenne w gruncie kat. III pod stopy fundamentowe i przegłębienia doków przeładunkowych: 2150 m³.
4. Korytowanie pod place manewrowe i drogi pożarowe o pow. 2400 m² na głębokość 35 cm.
5. Stabilizacja podłoża cementem Rm=2,5 MPa na powierzchni 2400 m² oraz wykonanie podbudowy z kruszywa łamanego granitowego 0-31,5 mm na pow. 2400 m².
6. Wywóz nadmiaru urobku ziemnego (17 05 04): 1800 m³.`,
  },
  {
    id: 'walbrzych-zelbet',
    title: 'Wyburzenie obiektu żelbetowego po byłej kotłowni — Wałbrzych',
    subregion: 'walbrzych',
    location: 'Wałbrzych, ul. Uczniowska 19',
    content: `EKSPERTYZA I PRZEDMIAR ROBÓT WYBURZENIOWYCH — OBIEKT KOTŁOWNI
Lokalizacja: Wałbrzych, teren poprzemysłowy przy ul. Uczniowskiej.
Charakterystyka obiektu:
- Konstrukcja szkieletowa żelbetowa ciężka, wypełnienie cegłą dziurawką, 3 kondygnacje + piwnica techniczna.
- Wymiary budynku: długość 18,0 m, szerokość 12,0 m, wysokość 11,5 m (kubatura: 2484 m³), podpiwniczenie gł. 2,8 m.
- Konstrukcja wsporcza stalowa estakady rurowej i zasobników węgla: masa stali ok. 38 t do demontażu palnikami.
- Fundamenty masywne żelbetowe pod kotły do skucia młotem hydraulicznym: ok. 145 m³.
- Kruszenie czystego gruzu żelbetowego na placu budowy kruszarką mobilną: ok. 620 t (materiał do pozostawienia na zasypkę wykopu po piwnicy).
- Wywóz i utylizacja zmieszanych odpadów izolacyjnych oraz papy (BDO 17 09 04): 24 t.
- Zasypanie i zagęszczenie niecki po piwnicy gruntem/kruszywem: 610 m³. Grunt w otoczeniu kat. IV (zwietrzelina skalna).`,
  },
];
