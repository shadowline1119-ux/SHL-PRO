import { EstimateLineItem, QuarryMaterialItem } from '../types/estimator';

export interface DeliveredMaterialQuote {
  baseUnitNet: number;
  transportUnitNet: number;
  deliveredUnitNet: number;
  deliveredPerM3Net: number | null;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Wylicza cenę materiału z dostawą na plac budowy.
 * - Dla jednostek wagowych ('t') transport liczony jest proporcjonalnie do odległości i stawki za t·km.
 * - Dla jednostek objętościowych ('m³') przeliczany przez gęstość nasypową (domyślnie 1,7 t/m³).
 * - Dla materiałów powierzchniowych/liniowych ('m²', 'mb', itp.) doliczana jest zryczałtowana dopłata dostawy paletowej/kurierskiej (~0,50 zł/j.m. przy >0 km).
 */
export function calculateDeliveredMaterialRate(
  item: QuarryMaterialItem,
  distanceKm: number,
  transportRatePerTonneKm: number
): DeliveredMaterialQuote {
  const baseUnitNet = round2(Math.max(0, Number(item.priceNetPerUnit) || 0));
  const km = Math.max(0, Number(distanceKm) || 0);
  const tkmRate = Math.max(0, Number(transportRatePerTonneKm) || 0);

  let transportUnitNet = 0;
  if (km > 0) {
    if (item.unit === 't') {
      transportUnitNet = round2(km * tkmRate);
    } else if (item.unit === 'm³') {
      const density = item.bulkDensityTPerM3 && item.bulkDensityTPerM3 > 0 ? item.bulkDensityTPerM3 : 1.7;
      transportUnitNet = round2(km * tkmRate * density);
    } else {
      transportUnitNet = round2(Math.min(6, km * 0.02));
    }
  }

  const deliveredUnitNet = round2(baseUnitNet + transportUnitNet);
  const deliveredPerM3Net =
    item.unit === 't' && item.bulkDensityTPerM3 && item.bulkDensityTPerM3 > 0
      ? round2(deliveredUnitNet * item.bulkDensityTPerM3)
      : item.unit === 'm³'
      ? deliveredUnitNet
      : null;

  return {
    baseUnitNet,
    transportUnitNet,
    deliveredUnitNet,
    deliveredPerM3Net,
  };
}

export function buildEstimateLineFromQuarryMaterial(
  item: QuarryMaterialItem,
  quarryShortName: string,
  quantity: number,
  distanceKm: number,
  transportRatePerTonneKm: number
): EstimateLineItem {
  const quote = calculateDeliveredMaterialRate(item, distanceKm, transportRatePerTonneKm);
  const safeQty = Math.max(0.1, round2(Number(quantity) || 1));

  return {
    id: `mat-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    knr: `MAT. ${quarryShortName.toUpperCase()}`,
    name: `${item.name} — dostawa ${quarryShortName} (${Math.round(Math.max(0, distanceKm))} km)`,
    category: item.category,
    unit: item.unit,
    quantity: safeQty,
    rateLabor: 0,
    rateMaterials: quote.baseUnitNet,
    rateEquipment: quote.transportUnitNet,
    notes: `${item.rockType} · frakcja ${item.fraction}`,
    isCustom: true,
  };
}
