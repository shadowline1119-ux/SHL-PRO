export type ActiveTab =
  | 'kosztorys'
  | 'parametry'
  | 'dokumentacja'
  | 'kruszywa'
  | 'przetargi'
  | 'baza_cen'
  | 'raporty'
  | 'oferta'
  | 'ustawienia';

export type NavGroupId = 'wycena' | 'rynek' | 'analiza' | 'system';

export interface NavItemConfig {
  id: ActiveTab;
  group: NavGroupId;
  label: string;
  shortLabel: string;
  sublabel: string;
  headerTitle: string;
}

export interface NavGroupConfig {
  id: NavGroupId;
  title: string;
  items: NavItemConfig[];
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'kosztorys',
    group: 'wycena',
    label: 'Kosztorys robót',
    shortLabel: 'Kosztorys',
    sublabel: 'Pozycje, katalog KNR i eksport',
    headerTitle: 'Kosztorys szczegółowy i katalog robót',
  },
  {
    id: 'parametry',
    group: 'wycena',
    label: 'Parametry obiektu',
    shortLabel: 'Parametry',
    sublabel: 'Kalkulator kubatury i wykopów',
    headerTitle: 'Parametry obiektu i kalkulator kubatury',
  },
  {
    id: 'dokumentacja',
    group: 'wycena',
    label: 'Analiza dokumentacji',
    shortLabel: 'Dokumentacja',
    sublabel: 'ZIP, PDF, rzuty i opis robót',
    headerTitle: 'Automatyczna analiza dokumentacji technicznej',
  },
  {
    id: 'kruszywa',
    group: 'rynek',
    label: 'Kruszywa i kopalnie',
    shortLabel: 'Kruszywa',
    sublabel: 'Wojciechów, Czaple, Strzegom',
    headerTitle: 'Cennik kruszyw z okolicznych kopalni i materiałów',
  },
  {
    id: 'przetargi',
    group: 'rynek',
    label: 'Przetargi (BZP / BIP)',
    shortLabel: 'Przetargi',
    sublabel: 'Dolny Śląsk, Wody Polskie, KOWR',
    headerTitle: 'Aktualne przetargi publiczne — woj. dolnośląskie (BZP / e-Zamówienia)',
  },
  {
    id: 'baza_cen',
    group: 'rynek',
    label: 'Baza cen KNR',
    shortLabel: 'Baza cen',
    sublabel: 'Stawki R/M/S i archiwum projektów',
    headerTitle: 'Lokalna baza stawek (IndexedDB), projekty offline i synchronizacja',
  },
  {
    id: 'raporty',
    group: 'analiza',
    label: 'Raporty i marża',
    shortLabel: 'Raporty',
    sublabel: 'Wykresy R/M/S, ON i powiaty',
    headerTitle: 'Raporty kosztów R / M / S, marż i korelacji rynkowych',
  },
  {
    id: 'oferta',
    group: 'analiza',
    label: 'Oferta PDF',
    shortLabel: 'Oferta PDF',
    sublabel: 'Podgląd A4 i wydruk dla klienta',
    headerTitle: 'Generator gotowej oferty PDF dla zleceniodawcy',
  },
  {
    id: 'ustawienia',
    group: 'system',
    label: 'Dane, kopie i chmura',
    shortLabel: 'Ustawienia',
    sublabel: 'Folder Dokumenty, SQLite i konto',
    headerTitle: 'Lokalny folder danych, SQLite, kopie zapasowe i chmura',
  },
];

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'wycena',
    title: '1. Wycena i przedmiar',
    items: NAV_ITEMS.filter((item) => item.group === 'wycena'),
  },
  {
    id: 'rynek',
    title: '2. Rynek i cenniki',
    items: NAV_ITEMS.filter((item) => item.group === 'rynek'),
  },
  {
    id: 'analiza',
    title: '3. Analiza i oferta',
    items: NAV_ITEMS.filter((item) => item.group === 'analiza'),
  },
  {
    id: 'system',
    title: '4. System i kopie',
    items: NAV_ITEMS.filter((item) => item.group === 'system'),
  },
];

const WORKFLOW_SEQUENCE: ActiveTab[] = ['parametry', 'kosztorys', 'raporty', 'oferta'];

export function getNavItemMeta(tab: ActiveTab): NavItemConfig {
  return NAV_ITEMS.find((item) => item.id === tab) ?? NAV_ITEMS[0];
}

export function getHeaderTitleForTab(tab: ActiveTab): string {
  return getNavItemMeta(tab).headerTitle;
}

export function getNextWorkflowStep(tab: ActiveTab): { tab: ActiveTab; label: string } | null {
  const idx = WORKFLOW_SEQUENCE.indexOf(tab);
  if (idx === -1 || idx >= WORKFLOW_SEQUENCE.length - 1) return null;
  const nextTab = WORKFLOW_SEQUENCE[idx + 1];
  const meta = getNavItemMeta(nextTab);
  return { tab: nextTab, label: meta.label };
}
