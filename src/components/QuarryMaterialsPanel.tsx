import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import { QUARRIES } from '../data/quarryMaterials';
import {
  EstimateLineItem,
  QuarryId,
  QuarryMaterialItem,
  QuarrySearchCandidate,
  QuarrySearchResponse,
  WorkCategory,
  WorkUnit,
} from '../types/estimator';
import { formatNumber, formatPLN } from '../utils/calculations';
import {
  buildEstimateLineFromQuarryMaterial,
  calculateDeliveredMaterialRate,
} from '../utils/quarryPricing';
import {
  candidateToQuarryMaterialItem,
  getQuarryDisplayLabel,
  getQuarryLocalityLabel,
} from '../utils/quarrySearch';

interface QuarryMaterialsPanelProps {
  materials: QuarryMaterialItem[];
  deliveryKm: number;
  transportRatePerTkm: number;
  existingEstimateItems: EstimateLineItem[];
  onChangeDeliveryKm: (km: number) => void;
  onChangeTransportRate: (rate: number) => void;
  onUpdateMaterialPrice: (id: string, priceNetPerUnit: number) => void;
  onAddCustomMaterial: (item: QuarryMaterialItem) => void;
  onRemoveCustomMaterial: (id: string) => void;
  onResetMaterials: () => void;
  onAddToEstimate: (lineItem: EstimateLineItem) => void;
}

const QUARRY_IDS: QuarryId[] = [
  'wojciechow',
  'czaple',
  'strzegom',
  'mietkow',
  'grzedy',
  'materialy_inz',
  'lokalna_wyszukana',
];

const MATERIAL_UNITS: WorkUnit[] = ['t', 'm³', 'm²', 'mb', 'szt.'];

const QUICK_QUARRY_EXAMPLES = [
  { label: 'Kopalnia Bazaltu Sulików', quarry: 'Kopalnia Bazaltu Sulików', material: 'mieszanka 0-31,5' },
  { label: 'Kopalnia Piaskowca Radków', quarry: 'Kopalnia Piaskowca Radków', material: 'kamień łamany' },
  { label: 'Kopalnia Granitu Rogoźnica', quarry: 'Kopalnia Granitu Rogoźnica', material: 'tłuczeń granitowy' },
];

const CONFIDENCE_LABELS: Record<QuarrySearchCandidate['priceConfidence'], string> = {
  verified: 'Cennik online',
  estimated: 'Cena orientacyjna z sieci',
  missing: 'Brak jawnej ceny — wpisz stawkę',
};

export function QuarryMaterialsPanel({
  materials,
  deliveryKm,
  transportRatePerTkm,
  existingEstimateItems,
  onChangeDeliveryKm,
  onChangeTransportRate,
  onUpdateMaterialPrice,
  onAddCustomMaterial,
  onRemoveCustomMaterial,
  onResetMaterials,
  onAddToEstimate,
}: QuarryMaterialsPanelProps) {
  const [selectedQuarry, setSelectedQuarry] = useState<'all' | QuarryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showAddForm, setShowAddForm] = useState(false);

  // Stan wyszukiwarki Google Search dla lokalnych kopalni
  const [googleQuarryQuery, setGoogleQuarryQuery] = useState('');
  const [googleMaterialQuery, setGoogleMaterialQuery] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleResult, setGoogleResult] = useState<QuarrySearchResponse | null>(null);
  const [candidatePrices, setCandidatePrices] = useState<Record<string, string>>({});
  const [addedCandidateIds, setAddedCandidateIds] = useState<Record<string, boolean>>({});

  // Formularz dodawania własnego kruszywa / materiału
  const [newName, setNewName] = useState('');
  const [newQuarryId, setNewQuarryId] = useState<QuarryId>('wojciechow');
  const [newCustomQuarryName, setNewCustomQuarryName] = useState('');
  const [newCustomLocality, setNewCustomLocality] = useState('');
  const [newRockType, setNewRockType] = useState('Bazalt');
  const [newFraction, setNewFraction] = useState('0–31,5 mm');
  const [newUnit, setNewUnit] = useState<WorkUnit>('t');
  const [newDensity, setNewDensity] = useState<number>(1.9);
  const [newPrice, setNewPrice] = useState<number>(50);
  const [newCategory, setNewCategory] = useState<WorkCategory>('podbudowy_stabilizacja');

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return materials.filter((item) => {
      if (selectedQuarry !== 'all' && item.quarryId !== selectedQuarry) return false;
      if (!q) return true;
      const quarryLabel = getQuarryDisplayLabel(item, QUARRIES).toLowerCase();
      const localityLabel = getQuarryLocalityLabel(item, QUARRIES).toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.fraction.toLowerCase().includes(q) ||
        item.rockType.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        quarryLabel.includes(q) ||
        localityLabel.includes(q)
      );
    });
  }, [materials, selectedQuarry, searchQuery]);

  const countsByEstimate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of existingEstimateItems) {
      for (const mat of materials) {
        if (row.id.includes(`mat-${mat.id}-`)) {
          map.set(mat.id, (map.get(mat.id) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [existingEstimateItems, materials]);

  const handleSearchGoogleQuarry = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuarry = googleQuarryQuery.trim();
    if (cleanQuarry.length < 2) {
      setGoogleError('Wpisz nazwę lub miejscowość kopalni (np. Kopalnia Bazaltu Sulików).');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setGoogleError(
        'Tryb offline — wyszukiwanie aktualnych cenników kopalni w Google wymaga połączenia z siecią. Nadal możesz przeglądać zapisany katalog kruszyw, edytować stawki oraz dodawać pozycje ręcznie.'
      );
      return;
    }

    setGoogleLoading(true);
    setGoogleError(null);
    setAddedCandidateIds({});

    try {
      const response = await fetch('/api/search-quarry-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quarryQuery: cleanQuarry,
          materialQuery: googleMaterialQuery.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Nie udało się wyszukać cen kopalni w Google.');
      }
      const searchRes = data.result as QuarrySearchResponse;
      setGoogleResult(searchRes);
      const initialPrices: Record<string, string> = {};
      for (const item of searchRes.items) {
        initialPrices[item.id] =
          item.priceNetPerUnit !== null ? String(item.priceNetPerUnit) : '';
      }
      setCandidatePrices(initialPrices);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Błąd połączenia z wyszukiwarką Google.';
      setGoogleError(message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAddCandidateToCatalog = (candidate: QuarrySearchCandidate) => {
    const rawOverride = candidatePrices[candidate.id];
    const parsedOverride =
      typeof rawOverride === 'string' && rawOverride.trim() !== ''
        ? Number(rawOverride.replace(',', '.'))
        : candidate.priceNetPerUnit;

    const finalPrice =
      typeof parsedOverride === 'number' && Number.isFinite(parsedOverride) && parsedOverride >= 0
        ? parsedOverride
        : 0;

    const primarySource = googleResult?.sources[0];
    const catalogItem = candidateToQuarryMaterialItem(candidate, finalPrice, primarySource);
    onAddCustomMaterial(catalogItem);
    setAddedCandidateIds((prev) => ({ ...prev, [candidate.id]: true }));
  };

  const handlePrefillManualFormFromSearch = () => {
    if (!googleResult) return;
    setNewQuarryId('lokalna_wyszukana');
    setNewCustomQuarryName(googleResult.quarryOfficialName);
    setNewCustomLocality(googleResult.locality);
    if (googleMaterialQuery.trim()) {
      setNewName(googleMaterialQuery.trim());
    }
    setShowAddForm(true);
  };

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const isExternalQuarry = newQuarryId === 'lokalna_wyszukana';
    const custom: QuarryMaterialItem = {
      id: `custom-mat-${Date.now()}`,
      quarryId: newQuarryId,
      customQuarryName: isExternalQuarry && newCustomQuarryName.trim() ? newCustomQuarryName.trim() : undefined,
      customLocality: isExternalQuarry && newCustomLocality.trim() ? newCustomLocality.trim() : undefined,
      name: newName.trim(),
      fraction: newFraction.trim() || '—',
      rockType: newRockType.trim() || 'Kruszywo',
      unit: newUnit,
      bulkDensityTPerM3: newUnit === 't' || newUnit === 'm³' ? Math.max(0.5, newDensity) : undefined,
      priceNetPerUnit: Math.max(0, newPrice),
      category: newCategory,
      description: 'Pozycja dodana ręcznie przez kosztorysanta.',
      isCustom: true,
    };
    onAddCustomMaterial(custom);
    setNewName('');
    setShowAddForm(false);
  };

  const handleExportPriceListCsv = () => {
    const sep = ';';
    const header = [
      'Kopalnia / Źródło',
      'Lokalizacja',
      'Surowiec',
      'Materiał',
      'Frakcja',
      'J.m.',
      'Gęstość [t/m3]',
      'Cena kopalnia netto [zł]',
      `Transport (${deliveryKm} km) [zł]`,
      'Cena z dostawą netto [zł]',
      'Przelicznik [zł/m3]',
    ].join(sep);

    const rows = filteredMaterials.map((item) => {
      const quarryLabel = getQuarryDisplayLabel(item, QUARRIES);
      const localityLabel = getQuarryLocalityLabel(item, QUARRIES);
      const quote = calculateDeliveredMaterialRate(item, deliveryKm, transportRatePerTkm);
      return [
        `"${quarryLabel.replace(/"/g, '""')}"`,
        `"${localityLabel.replace(/"/g, '""')}"`,
        `"${item.rockType}"`,
        `"${item.name.replace(/"/g, '""')}"`,
        `"${item.fraction}"`,
        item.unit,
        item.bulkDensityTPerM3 ? item.bulkDensityTPerM3.toFixed(2).replace('.', ',') : '',
        quote.baseUnitNet.toFixed(2).replace('.', ','),
        quote.transportUnitNet.toFixed(2).replace('.', ','),
        quote.deliveredUnitNet.toFixed(2).replace('.', ','),
        quote.deliveredPerM3Net !== null ? quote.deliveredPerM3Net.toFixed(2).replace('.', ',') : '',
      ].join(sep);
    });

    const csv = '\uFEFF' + [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cennik_kruszyw_dolny_slask_${deliveryKm}km.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const activeQuarryMeta = selectedQuarry !== 'all' ? QUARRIES[selectedQuarry] : null;

  return (
    <div className="space-y-6">
      {/* Kalkulator dostawy i filtry kopalni */}
      <section
        aria-label="Konfiguracja transportu i filtry kopalni"
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Cennik kruszyw i materiałów — kopalnie Dolnego Śląska
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Stawki netto loco kopalnia (m.in. Kopalnia Bazaltu Wojciechów, Żwirownia Czaple, Strzegom, Mietków) z kalkulacją dowozu wywrotką na budowę. Wszystkie ceny można edytować.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportPriceListCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Eksportuj cennik CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dodaj własne kruszywo</span>
            </button>
            <button
              type="button"
              onClick={onResetMaterials}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Domyślne stawki</span>
            </button>
          </div>
        </div>

        {/* Parametry dostawy z kopalni na plac budowy */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end pt-3 border-t border-slate-100">
          <div className="md:col-span-4">
            <label htmlFor="quarry-search" className="block text-xs font-medium text-slate-700 mb-1">
              Filtruj w katalogu (kruszywo, frakcja lub kopalnia)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="quarry-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="np. Wojciechów, Czaple, bazalt 0-31,5, piasek..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="quarry-distance" className="block text-xs font-medium text-slate-700 mb-1">
              Odległość z kopalni na budowę (km)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="quarry-distance"
                type="number"
                min={0}
                max={250}
                step={1}
                value={deliveryKm}
                onChange={(e) => onChangeDeliveryKm(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onChangeDeliveryKm(0)}
                title="Ustaw 0 km (odbiór własny na kopalni)"
                className={`px-2.5 py-2 text-[11px] font-medium rounded-lg border whitespace-nowrap transition-colors ${
                  deliveryKm === 0
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Odbiór 0 km
              </button>
            </div>
          </div>

          <div className="md:col-span-3">
            <label htmlFor="quarry-tkm-rate" className="block text-xs font-medium text-slate-700 mb-1">
              Stawka transportu wywrotką (zł / t·km)
            </label>
            <input
              id="quarry-tkm-rate"
              type="number"
              min={0}
              max={5}
              step={0.05}
              value={transportRatePerTkm}
              onChange={(e) =>
                onChangeTransportRate(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2 text-xs text-slate-600 flex items-center gap-2 pb-2">
            <Truck className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-mono tabular-nums">
              +{formatNumber(deliveryKm * transportRatePerTkm, 2)} zł/t
            </span>
          </div>
        </div>

        {/* Interaktywny pasek wyboru kopalni */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setSelectedQuarry('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              selectedQuarry === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Wszystkie ({materials.length})
          </button>
          {QUARRY_IDS.map((qId) => {
            const count = materials.filter((m) => m.quarryId === qId).length;
            const meta = QUARRIES[qId];
            return (
              <button
                key={qId}
                type="button"
                onClick={() => setSelectedQuarry(qId)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  selectedQuarry === qId
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {meta.shortName} ({count})
              </button>
            );
          })}
        </div>

        {activeQuarryMeta && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-900">{activeQuarryMeta.name}</span>
              <span aria-hidden="true"> · </span>
              <span>{activeQuarryMeta.locality}</span>
              <span aria-hidden="true"> · </span>
              <span className="text-amber-800 font-medium">{activeQuarryMeta.rockTypes}</span>
            </div>
            <div className="text-slate-500">{activeQuarryMeta.notes}</div>
          </div>
        )}
      </section>

      {/* Wyszukiwarka cen w konkretnej lokalnej kopalni (Google Search Grounding) */}
      <section
        aria-label="Wyszukaj aktualne ceny kopalni w Google Search"
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-700 shrink-0" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Wyszukaj aktualne ceny w innej lokalnej kopalni (Google Search)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Nie ma Twojej kopalni na liście powyżej? Wpisz jej nazwę lub miejscowość, aby sprawdzić w Google aktualne ceny kruszyw i dodać wybrane pozycje jednym kliknięciem do katalogu.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>Przykłady:</span>
            {QUICK_QUARRY_EXAMPLES.map((ex, i) => (
              <React.Fragment key={ex.label}>
                {i > 0 && <span aria-hidden="true">·</span>}
                <button
                  type="button"
                  onClick={() => {
                    setGoogleQuarryQuery(ex.quarry);
                    setGoogleMaterialQuery(ex.material);
                  }}
                  className="text-amber-800 hover:underline font-medium"
                >
                  {ex.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        <form onSubmit={handleSearchGoogleQuarry} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label htmlFor="google-quarry-query" className="block text-xs font-medium text-slate-700 mb-1">
              Nazwa kopalni, żwirowni lub miejscowość
            </label>
            <input
              id="google-quarry-query"
              type="text"
              value={googleQuarryQuery}
              onChange={(e) => setGoogleQuarryQuery(e.target.value)}
              placeholder="np. Kopalnia Bazaltu Sulików, Kopalnia Piaskowca Radków..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <div className="md:col-span-4">
            <label htmlFor="google-material-query" className="block text-xs font-medium text-slate-700 mb-1">
              Konkretne kruszywo lub frakcja (opcjonalnie)
            </label>
            <input
              id="google-material-query"
              type="text"
              value={googleMaterialQuery}
              onChange={(e) => setGoogleMaterialQuery(e.target.value)}
              placeholder="np. mieszanka 0-31,5, grys, piasek płukany"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <div className="md:col-span-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={googleLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-amber-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Wyszukiwanie w Google...</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>Szukaj cen w Google</span>
                </>
              )}
            </button>
          </div>
        </form>

        {googleError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <div>{googleError}</div>
          </div>
        )}

        {googleResult && (
          <div className="pt-3 border-t border-slate-200 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 max-w-4xl">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-semibold text-slate-900">{googleResult.quarryOfficialName}</span>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span className="text-slate-600">{googleResult.locality}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{googleResult.summary}</p>
              </div>
              <button
                type="button"
                onClick={handlePrefillManualFormFromSearch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Wpisz pozycję ręcznie dla tej kopalni</span>
              </button>
            </div>

            {googleResult.items.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <th className="py-2 px-3">Znaleziona pozycja · Frakcja · Weryfikacja ceny</th>
                      <th className="py-2 px-2 w-14 text-center">J.m.</th>
                      <th className="py-2 px-2 w-20 text-right">t/m³</th>
                      <th className="py-2 px-2 w-32 text-right">Cena netto (zł)</th>
                      <th className="py-2 px-3 w-40 text-right">Katalog kruszyw</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {googleResult.items.map((cand) => {
                      const isAdded = Boolean(addedCandidateIds[cand.id]);
                      const priceVal = candidatePrices[cand.id] ?? '';
                      return (
                        <tr key={cand.id} className="hover:bg-slate-50/70 align-top">
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-500">
                              <span className="font-semibold text-slate-700">{cand.quarryName}</span>
                              <span aria-hidden="true">·</span>
                              <span>{cand.rockType}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-800 font-medium">{cand.fraction}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  cand.priceConfidence === 'verified'
                                    ? 'text-emerald-700 font-medium'
                                    : cand.priceConfidence === 'estimated'
                                    ? 'text-amber-700'
                                    : 'text-slate-500'
                                }
                              >
                                {CONFIDENCE_LABELS[cand.priceConfidence]}
                              </span>
                            </div>
                            <div className="font-medium text-slate-900 mt-0.5">{cand.name}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{cand.priceNote}</div>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-slate-700">{cand.unit}</td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-500">
                            {cand.bulkDensityTPerM3 ? formatNumber(cand.bulkDensityTPerM3, 2) : '—'}
                          </td>
                          <td className="py-2.5 px-2">
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              placeholder="np. 52.00"
                              aria-label={`Cena netto dla ${cand.name}`}
                              value={priceVal}
                              onChange={(e) =>
                                setCandidatePrices((prev) => ({
                                  ...prev,
                                  [cand.id]: e.target.value,
                                }))
                              }
                              className="w-full text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-amber-600 focus:outline-none"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleAddCandidateToCatalog(cand)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                                isAdded
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-700 text-white hover:bg-amber-800'
                              }`}
                            >
                              {isAdded ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Dodano do katalogu</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Dodaj do katalogu</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
                W wynikach Google nie wykryto ustrukturyzowanej tabeli pozycji dla tej kopalni. Użyj przycisku „Wpisz pozycję ręcznie dla tej kopalni”, aby zapisać stawkę uzyskaną telefonicznie lub ze strony WWW.
              </div>
            )}

            {googleResult.sources.length > 0 && (
              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-slate-700">Źródła Google Search:</span>
                {googleResult.sources.map((src) => (
                  <a
                    key={src.uri}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-800 hover:underline"
                  >
                    <span className="truncate max-w-[260px]">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Formularz dodawania własnego kruszywa / materiału */}
      {showAddForm && (
        <section
          aria-label="Dodaj własny materiał lub kruszywo"
          className="bg-white border border-slate-200 rounded-xl p-5"
        >
          <form onSubmit={handleCreateCustom} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Dodaj nową pozycję kruszywa lub materiału z okolicznej kopalni
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label htmlFor="new-mat-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Nazwa materiału / kruszywa
                </label>
                <input
                  id="new-mat-name"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="np. Grys bazaltowy 8–16 mm"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="new-mat-quarry" className="block text-xs font-medium text-slate-700 mb-1">
                  Kopalnia / Źródło
                </label>
                <select
                  id="new-mat-quarry"
                  value={newQuarryId}
                  onChange={(e) => setNewQuarryId(e.target.value as QuarryId)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                >
                  {QUARRY_IDS.map((qId) => (
                    <option key={qId} value={qId}>
                      {QUARRIES[qId].shortName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-mat-fraction" className="block text-xs font-medium text-slate-700 mb-1">
                  Frakcja / typ
                </label>
                <input
                  id="new-mat-fraction"
                  type="text"
                  value={newFraction}
                  onChange={(e) => setNewFraction(e.target.value)}
                  placeholder="0–31,5 mm"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-mat-unit" className="block text-xs font-medium text-slate-700 mb-1">
                    J.m.
                  </label>
                  <select
                    id="new-mat-unit"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value as WorkUnit)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
                  >
                    {MATERIAL_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-mat-density" className="block text-xs font-medium text-slate-700 mb-1">
                    t/m³
                  </label>
                  <input
                    id="new-mat-density"
                    type="number"
                    min={0.5}
                    max={3.5}
                    step={0.05}
                    value={newDensity}
                    onChange={(e) => setNewDensity(Math.max(0.5, Number(e.target.value) || 1.7))}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-mat-price" className="block text-xs font-medium text-slate-700 mb-1">
                    Cena (zł)
                  </label>
                  <input
                    id="new-mat-price"
                    type="number"
                    min={0}
                    step={0.5}
                    value={newPrice}
                    onChange={(e) => setNewPrice(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  Zapisz
                </button>
              </div>
            </div>

            {newQuarryId === 'lokalna_wyszukana' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-mat-custom-quarry" className="block text-xs font-medium text-slate-700 mb-1">
                    Nazwa własnej kopalni / dostawcy
                  </label>
                  <input
                    id="new-mat-custom-quarry"
                    type="text"
                    value={newCustomQuarryName}
                    onChange={(e) => setNewCustomQuarryName(e.target.value)}
                    placeholder="np. Kopalnia Bazaltu Sulików"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="new-mat-custom-locality" className="block text-xs font-medium text-slate-700 mb-1">
                    Miejscowość / powiat
                  </label>
                  <input
                    id="new-mat-custom-locality"
                    type="text"
                    value={newCustomLocality}
                    onChange={(e) => setNewCustomLocality(e.target.value)}
                    placeholder="np. Sulików, pow. zgorzelecki"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-mat-rock" className="block text-xs font-medium text-slate-700 mb-1">
                  Surowiec
                </label>
                <input
                  id="new-mat-rock"
                  type="text"
                  value={newRockType}
                  onChange={(e) => setNewRockType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="new-mat-cat" className="block text-xs font-medium text-slate-700 mb-1">
                  Kategoria w kosztorysie
                </label>
                <select
                  id="new-mat-cat"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as WorkCategory)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                >
                  <option value="podbudowy_stabilizacja">Podbudowy i stabilizacja</option>
                  <option value="roboty_ziemne">Roboty ziemne</option>
                  <option value="odwodnienie_zabezpieczenia">Odwodnienie i zabezpieczenia</option>
                </select>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Główna tabela cennika kopalni i materiałów */}
      <section
        aria-label="Tabela cen kruszyw i materiałów"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4 min-w-[300px]">Kopalnia · Frakcja · Opis materiału</th>
                <th className="py-2.5 px-2.5 w-14 text-center">J.m.</th>
                <th className="py-2.5 px-2.5 w-20 text-right">Gęstość</th>
                <th className="py-2.5 px-2.5 w-28 text-right">Cena kopalnia (zł)</th>
                <th className="py-2.5 px-2.5 w-24 text-right">Transport</th>
                <th className="py-2.5 px-3 w-32 text-right">Razem z dostawą</th>
                <th className="py-2.5 px-2.5 w-24 text-right">Ilość</th>
                <th className="py-2.5 px-4 w-32 text-right">Do kosztorysu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredMaterials.map((item) => {
                const quarryLabel = getQuarryDisplayLabel(item, QUARRIES);
                const quote = calculateDeliveredMaterialRate(item, deliveryKm, transportRatePerTkm);
                const qty = quantities[item.id] ?? (item.unit === 't' ? 25 : 50);
                const addedCount = countsByEstimate.get(item.id) ?? 0;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors align-top">
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-500">
                        <span className="font-semibold text-slate-700">{quarryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.rockType}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-800 font-medium">{item.fraction}</span>
                        {item.sourceUrl && (
                          <>
                            <span aria-hidden="true">·</span>
                            <a
                              href={item.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={item.sourceTitle || item.sourceUrl}
                              className="inline-flex items-center gap-0.5 text-amber-800 hover:underline font-sans"
                            >
                              <span>Źródło Google</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </>
                        )}
                        {addedCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-medium">
                              W kosztorysie ({addedCount})
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-sm font-medium text-slate-900 mt-0.5">{item.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                    </td>
                    <td className="py-3 px-2.5 text-center font-mono text-slate-700">{item.unit}</td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {item.bulkDensityTPerM3 ? `${formatNumber(item.bulkDensityTPerM3, 2)} t/m³` : '—'}
                    </td>
                    <td className="py-3 px-2.5">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        aria-label={`Cena netto na kopalni dla ${item.name}`}
                        value={item.priceNetPerUnit}
                        onChange={(e) =>
                          onUpdateMaterialPrice(item.id, Math.max(0, Number(e.target.value) || 0))
                        }
                        className="w-full text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-amber-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatNumber(quote.transportUnitNet, 2)} zł
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatPLN(quote.deliveredUnitNet)}
                      </div>
                      {quote.deliveredPerM3Net !== null && item.unit === 't' && (
                        <div className="text-[11px] font-mono tabular-nums text-slate-500">
                          ≈ {formatNumber(quote.deliveredPerM3Net, 2)} zł/m³
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2.5">
                      <input
                        type="number"
                        min={0.1}
                        step={1}
                        aria-label={`Ilość do dodania dla ${item.name}`}
                        value={qty}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [item.id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full text-right rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-amber-600 focus:outline-none"
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onAddToEstimate(
                              buildEstimateLineFromQuarryMaterial(
                                item,
                                quarryLabel,
                                qty > 0 ? qty : 1,
                                deliveryKm,
                                transportRatePerTkm
                              )
                            )
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Dodaj</span>
                        </button>
                        {item.isCustom && (
                          <button
                            type="button"
                            aria-label={`Usuń własny materiał "${item.name}"`}
                            onClick={() => onRemoveCustomMaterial(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    Brak kruszyw lub materiałów spełniających kryteria wyszukiwania „{searchQuery}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
