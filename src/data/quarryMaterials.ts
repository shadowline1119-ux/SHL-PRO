import { QuarryId, QuarryMaterialItem, QuarryMeta } from '../types/estimator';

export const QUARRIES: Record<QuarryId, QuarryMeta> = {
  wojciechow: {
    id: 'wojciechow',
    name: 'Kopalnia Bazaltu Wojciechów (rejon Lubomierz / Lwówek Śl.)',
    shortName: 'Kopalnia Wojciechów',
    locality: 'Wojciechów, gm. Lubomierz (pow. lwówecki)',
    rockTypes: 'Bazalt drogowy i kolejowy',
    notes:
      'Wysokowytrzymałe kruszywa bazaltowe (mieszanki drogowe 0–31,5 / 0–63, kliniec, tłuczeń, grysy) o wysokiej mrozoodporności — ceny orientacyjne netto loco kopalnia / skład regionalny.',
  },
  czaple: {
    id: 'czaple',
    name: 'Żwirownia i Kopalnia Kruszyw Czaple (rejon Pielgrzymka / Złotoryja)',
    shortName: 'Żwirownia Czaple',
    locality: 'Czaple, gm. Pielgrzymka (pow. złotoryjski)',
    rockTypes: 'Piasek płukany, żwir, pospółka, piaskowiec',
    notes:
      'Lokalne złoża piasku, żwiru i piaskowca („Wioska Piasku i Kamienia”) — materiały zasypowe, podsypki, kruszywa płukane i drenażowe.',
  },
  strzegom: {
    id: 'strzegom',
    name: 'Kopalnia Granitu Strzegom / Gniewków',
    shortName: 'Kopalnia Strzegom',
    locality: 'Strzegom / Gniewków (pow. świdnicki)',
    rockTypes: 'Granit łamany',
    notes:
      'Popularne kruszywa granitowe na podbudowy hal, dróg technologicznych i stabilizację grząskiego podłoża.',
  },
  mietkow: {
    id: 'mietkow',
    name: 'Żwirownia Mietków / Proszowice (aglomeracja wrocławska)',
    shortName: 'Żwirownia Mietków',
    locality: 'Mietków / Proszowice (pow. wrocławski)',
    rockTypes: 'Piasek zasypowy, pospółka, żwir',
    notes:
      'Złoża aluwialne obsługujące Wrocław i okolice — niskie koszty dowozu w aglomeracji wrocławskiej na wymiany gruntu i zasypki fundamentów.',
  },
  grzedy: {
    id: 'grzedy',
    name: 'Kopalnia Melafiru Grzędy / Borówno',
    shortName: 'Kopalnia Grzędy',
    locality: 'Grzędy, gm. Czarny Bór (pow. wałbrzyski)',
    rockTypes: 'Melafir drogowy',
    notes:
      'Ciężkie kruszywa melafirowe pod obciążone place manewrowe, drogi pożarowe i nasypy w subregionie wałbrzyskim.',
  },
  materialy_inz: {
    id: 'materialy_inz',
    name: 'Materiały inżynieryjne i geotechniczne (Dolny Śląsk)',
    shortName: 'Materiały i geotechnika',
    locality: 'Hurty budowlane / betoniarnie Dolny Śląsk',
    rockTypes: 'Geowłókniny, spoiwa, recykling',
    notes:
      'Materiały towarzyszące robotom ziemnym i podbudowom: geowłókniny separacyjne, spoiwa hydrauliczne, kruszywo z recyklingu betonu oraz rury drenażowe.',
  },
  lokalna_wyszukana: {
    id: 'lokalna_wyszukana',
    name: 'Inne kopalnie lokalne (Google Search i własne)',
    shortName: 'Inne kopalnie',
    locality: 'Dolny Śląsk i okolice',
    rockTypes: 'Kruszywa drogowe, żwiry, piaski',
    notes:
      'Pozycje dodane bezpośrednio z wyszukiwarki Google Search dla lokalnych kopalni lub wpisane ręcznie.',
  },
};

export const QUARRY_MATERIALS_CATALOG: QuarryMaterialItem[] = [
  // ================= KOPALNIA WOJCIECHÓW (BAZALT) =================
  {
    id: 'woj-bazalt-0-31',
    quarryId: 'wojciechow',
    name: 'Mieszanka bazaltowa niezwiązana 0–31,5 mm (podbudowa zasadnicza)',
    fraction: '0–31,5 mm',
    rockType: 'Bazalt',
    unit: 't',
    bulkDensityTPerM3: 2.05,
    priceNetPerUnit: 46.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Ciągłe uziarnienie z bazaltu do zagęszczania mechanicznego pod posadzki przemysłowe, drogi i place manewrowe (PN-EN 13285).',
  },
  {
    id: 'woj-bazalt-0-63',
    quarryId: 'wojciechow',
    name: 'Mieszanka bazaltowa grubofrakcyjna 0–63 mm (warstwa mrozoochronna / drogi techn.)',
    fraction: '0–63 mm',
    rockType: 'Bazalt',
    unit: 't',
    bulkDensityTPerM3: 2.02,
    priceNetPerUnit: 42.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Kruszywo łamane o wysokiej nośności do stabilizacji gruntów słabonośnych i dolnych warstw podbudowy.',
  },
  {
    id: 'woj-bazalt-tluczen-31-63',
    quarryId: 'wojciechow',
    name: 'Tłuczeń bazaltowy 31,5–63 mm (podbudowa / drenaż ciężki)',
    fraction: '31,5–63 mm',
    rockType: 'Bazalt',
    unit: 't',
    bulkDensityTPerM3: 1.68,
    priceNetPerUnit: 58.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Jednofrakcyjny tłuczeń ostrokrawędzisty do warstw drenujących, opasek i stabilizacji dna mokrych wykopów.',
  },
  {
    id: 'woj-bazalt-kliniec-4-31',
    quarryId: 'wojciechow',
    name: 'Kliniec bazaltowy 4–31,5 mm (klinowanie i stabilizacja)',
    fraction: '4–31,5 mm',
    rockType: 'Bazalt',
    unit: 't',
    bulkDensityTPerM3: 1.72,
    priceNetPerUnit: 62.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Kruszywo klinujące do zamykania porów w warstwie tłucznia oraz podbudów pod kostkę brukową.',
  },
  {
    id: 'woj-bazalt-grys-2-8',
    quarryId: 'wojciechow',
    name: 'Grys bazaltowy płukany 2–8 mm (podsypka / zasypka drenaży)',
    fraction: '2–8 mm',
    rockType: 'Bazalt',
    unit: 't',
    bulkDensityTPerM3: 1.65,
    priceNetPerUnit: 84.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Drobny grys bazaltowy o wysokiej odporności na ścieranie do warstw wyrównawczych i zasypki rurociągów.',
  },
  {
    id: 'woj-bazalt-niesort',
    quarryId: 'wojciechow',
    name: 'Niesort / kamień bazaltowy 0–150 mm na utwardzenie dojazdów',
    fraction: '0–150 mm',
    rockType: 'Bazalt',
    unit: 't',
    bulkDensityTPerM3: 1.9,
    priceNetPerUnit: 34.0,
    category: 'roboty_ziemne',
    description:
      'Ekonomiczny materiał kamienny pod tymczasowe drogi technologiczne dla ciężkiego sprzętu i wjazdy na budowę.',
  },

  // ================= ŻWIROWNIA I KOPALNIA CZAPLE =================
  {
    id: 'cza-piasek-0-2',
    quarryId: 'czaple',
    name: 'Piasek płukany 0–2 mm (podsypka pod rury / betony / posadzki)',
    fraction: '0–2 mm',
    rockType: 'Piasek kwarcowy',
    unit: 't',
    bulkDensityTPerM3: 1.6,
    priceNetPerUnit: 46.0,
    category: 'roboty_ziemne',
    description:
      'Czysty piasek płukany bez frakcji pylastych z rejonu Czapli do obsypki sieci podziemnych i warstw odsączających.',
  },
  {
    id: 'cza-piasek-siany',
    quarryId: 'czaple',
    name: 'Piasek budowlany siany / zasypowy (wymiana gruntu i fundamenty)',
    fraction: '0–4 mm',
    rockType: 'Piasek naturalny',
    unit: 't',
    bulkDensityTPerM3: 1.58,
    priceNetPerUnit: 38.0,
    category: 'roboty_ziemne',
    description:
      'Piasek siany do zasypki fundamentów i zagęszczeń warstwowych zagęszczarkami płytowymi.',
  },
  {
    id: 'cza-pospolka-0-31',
    quarryId: 'czaple',
    name: 'Pospółka żwirowo-piaskowa 0–31,5 mm (zasypka / nasypy budowlane)',
    fraction: '0–31,5 mm',
    rockType: 'Pospółka',
    unit: 't',
    bulkDensityTPerM3: 1.85,
    priceNetPerUnit: 42.0,
    category: 'roboty_ziemne',
    description:
      'Mieszanka piasku i żwiru o bardzo dobrym zagęszczaniu (Is ≥ 0,98) do wymiany gruntów wysadzinowych.',
  },
  {
    id: 'cza-zwir-8-16',
    quarryId: 'czaple',
    name: 'Żwir płukany 8–16 mm (drenaż opaskowy i obsypka studni)',
    fraction: '8–16 mm',
    rockType: 'Żwir płukany',
    unit: 't',
    bulkDensityTPerM3: 1.62,
    priceNetPerUnit: 78.0,
    category: 'odwodnienie_zabezpieczenia',
    description:
      'Płukany żwir filtracyjny o wysokiej przepuszczalności wody do drenaży liniowych i skrzynek rozsączających.',
  },
  {
    id: 'cza-zwir-16-32',
    quarryId: 'czaple',
    name: 'Żwir płukany gruby 16–32 mm / otoczak drenażowy',
    fraction: '16–32 mm',
    rockType: 'Żwir / otoczak',
    unit: 't',
    bulkDensityTPerM3: 1.6,
    priceNetPerUnit: 74.0,
    category: 'odwodnienie_zabezpieczenia',
    description:
      'Gruby żwir płukany do opasek chłonnych, studni chłonnych oraz zabezpieczenia skarp przed rozmyciem.',
  },
  {
    id: 'cza-piaskowiec-lamany',
    quarryId: 'czaple',
    name: 'Kamień łamany piaskowcowy / narzutowy (umocnienie skarp i nasypów)',
    fraction: '63–250 mm',
    rockType: 'Piaskowiec',
    unit: 't',
    bulkDensityTPerM3: 1.75,
    priceNetPerUnit: 65.0,
    category: 'roboty_ziemne',
    description:
      'Lokalny piaskowiec z rejonu Czapli do gabionów, narzutów skarpowych oraz stabilizacji rowów odwadniających.',
  },

  // ================= KOPALNIA STRZEGOM (GRANIT) =================
  {
    id: 'str-granit-0-31',
    quarryId: 'strzegom',
    name: 'Mieszanka granitowa 0–31,5 mm (podbudowa pod hale i drogi)',
    fraction: '0–31,5 mm',
    rockType: 'Granit',
    unit: 't',
    bulkDensityTPerM3: 1.98,
    priceNetPerUnit: 45.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Jasne kruszywo granitowe ze strzegomskich złóż o wysokiej nośności i stabilności po zagęszczeniu.',
  },
  {
    id: 'str-granit-0-63',
    quarryId: 'strzegom',
    name: 'Kruszywo granitowe 0–63 mm (warstwa wzmacniająca pod drogi pożarowe)',
    fraction: '0–63 mm',
    rockType: 'Granit',
    unit: 't',
    bulkDensityTPerM3: 1.95,
    priceNetPerUnit: 41.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Mieszanka łamana na podbudowy pomocnicze pod ciężki transport budowlany.',
  },
  {
    id: 'str-granit-niesort',
    quarryId: 'strzegom',
    name: 'Niesort granitowy / gruz skalny 0–120 mm (nasypy i drogi placowe)',
    fraction: '0–120 mm',
    rockType: 'Granit',
    unit: 't',
    bulkDensityTPerM3: 1.88,
    priceNetPerUnit: 31.0,
    category: 'roboty_ziemne',
    description:
      'Ekonomiczny materiał pod utwardzenie placu budowy i zasypanie głębokich niecek po wyburzeniach.',
  },

  // ================= ŻWIROWNIA MIETKÓW / PROSZOWICE =================
  {
    id: 'mie-piasek-zasyp',
    quarryId: 'mietkow',
    name: 'Piasek zasypowy niesiany z kopalni (zasypka wykopów pod Wrocławiem)',
    fraction: '0–4 mm',
    rockType: 'Piasek',
    unit: 't',
    bulkDensityTPerM3: 1.55,
    priceNetPerUnit: 34.0,
    category: 'roboty_ziemne',
    description:
      'Najtańszy materiał zasypowy na duże wymiany gruntu w aglomeracji wrocławskiej.',
  },
  {
    id: 'mie-pospolka',
    quarryId: 'mietkow',
    name: 'Pospółka naturalna 0–16 mm (zasypka i poduszki fundamentowe)',
    fraction: '0–16 mm',
    rockType: 'Pospółka',
    unit: 't',
    bulkDensityTPerM3: 1.82,
    priceNetPerUnit: 44.0,
    category: 'roboty_ziemne',
    description:
      'Mieszanka piaskowo-żwirowa spełniająca wymagania zagęszczenia pod płyty fundamentowe.',
  },

  // ================= KOPALNIA GRZĘDY (MELAFIR) =================
  {
    id: 'grz-melafir-0-31',
    quarryId: 'grzedy',
    name: 'Mieszanka melafirowa 0–31,5 mm (podbudowa ciężka przemysłowa)',
    fraction: '0–31,5 mm',
    rockType: 'Melafir',
    unit: 't',
    bulkDensityTPerM3: 2.0,
    priceNetPerUnit: 48.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Ciężkie kruszywo wulkaniczne z rejonu Wałbrzycha o podwyższonej odporności na obciążenia dynamiczne.',
  },

  // ================= MATERIAŁY INŻYNIERYJNE I RECYKLING =================
  {
    id: 'mat-kruszywo-beton-0-63',
    quarryId: 'materialy_inz',
    name: 'Kruszywo betonowe z recyklingu 0–63 mm (ekonomiczna podbudowa / drogi tymcz.)',
    fraction: '0–63 mm',
    rockType: 'Beton kruszony',
    unit: 't',
    bulkDensityTPerM3: 1.7,
    priceNetPerUnit: 29.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Materiał z dolnośląskich kruszarni gruzu — bardzo korzystny koszt na drogi tymczasowe i nasypy techniczne.',
  },
  {
    id: 'mat-spoiwo-cement',
    quarryId: 'materialy_inz',
    name: 'Cement / spoiwo hydrauliczne do stabilizacji gruntu na miejscu (luz/worki)',
    fraction: 'CEM II / 22,5',
    rockType: 'Spoiwo',
    unit: 't',
    bulkDensityTPerM3: 1.2,
    priceNetPerUnit: 560.0,
    category: 'podbudowy_stabilizacja',
    description:
      'Spoiwo do stabilizacji glin i gruntów spoistych pod place i hale (typowe zużycie 18–30 kg/m² przy gr. 20 cm).',
  },
  {
    id: 'mat-geowloknina-200',
    quarryId: 'materialy_inz',
    name: 'Geowłóknina separacyjno-filtracyjna 200 g/m² (rolka 5 × 100 m)',
    fraction: '200 g/m²',
    rockType: 'Geosyntetyk',
    unit: 'm²',
    priceNetPerUnit: 4.8,
    category: 'podbudowy_stabilizacja',
    description:
      'Oddzielenie gruntu spoistego od kruszywa łamanego zapobiegające mieszaniu warstw pod obciążeniem.',
  },
  {
    id: 'mat-geosiatka-30',
    quarryId: 'materialy_inz',
    name: 'Geosiatka dwukierunkowa wzmacniająca 30/30 kN/m (stabilizacja słabych podłoży)',
    fraction: '30/30 kN/m',
    rockType: 'Geosyntetyk',
    unit: 'm²',
    priceNetPerUnit: 9.4,
    category: 'podbudowy_stabilizacja',
    description:
      'Zbrojenie podbudowy z kruszywa pozwalające zredukować grubość wymiany gruntu nawet o 25–30%.',
  },
  {
    id: 'mat-rura-dren-110',
    quarryId: 'materialy_inz',
    name: 'Rura drenażowa karbowana PVC-U DN110 w otulinie z geowłókniny',
    fraction: 'DN 110 mm',
    rockType: 'PVC / Drenaż',
    unit: 'mb',
    priceNetPerUnit: 18.5,
    category: 'odwodnienie_zabezpieczenia',
    description:
      'Drenaż opaskowy fundamentów i skarp zapobiegający zamulaniu otworów przez grunty pylaste.',
  },
];
