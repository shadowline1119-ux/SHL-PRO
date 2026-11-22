import test from 'node:test';
import assert from 'node:assert/strict';
import { QUARRIES, QUARRY_MATERIALS_CATALOG } from '../data/quarryMaterials';
import {
  buildEstimateLineFromQuarryMaterial,
  calculateDeliveredMaterialRate,
} from './quarryPricing';

test('QUARRY_MATERIALS_CATALOG includes Wojciechów basalt and Czaple sand/gravel quarries', () => {
  const wojciechówItems = QUARRY_MATERIALS_CATALOG.filter((i) => i.quarryId === 'wojciechow');
  const czapleItems = QUARRY_MATERIALS_CATALOG.filter((i) => i.quarryId === 'czaple');

  assert.ok(wojciechówItems.length >= 4, 'Should include multiple Wojciechów basalt fractions');
  assert.ok(czapleItems.length >= 4, 'Should include multiple Czaple sand/gravel fractions');
  assert.ok(QUARRIES.wojciechow.name.includes('Wojciechów'));
  assert.ok(QUARRIES.czaple.name.includes('Czaple'));
});

test('calculateDeliveredMaterialRate computes quarry price, transport cost, and m³ equivalent accurately', () => {
  const basalt = QUARRY_MATERIALS_CATALOG.find((i) => i.id === 'woj-bazalt-0-31')!;
  // 46 zł/t loco kopalnia, 20 km * 0.55 zł/tkm = 11 zł/t transport => 57 zł/t delivered
  // bulkDensityTPerM3 = 2.05 => 57 * 2.05 = 116.85 zł/m³
  const quote = calculateDeliveredMaterialRate(basalt, 20, 0.55);

  assert.equal(quote.baseUnitNet, 46);
  assert.equal(quote.transportUnitNet, 11);
  assert.equal(quote.deliveredUnitNet, 57);
  assert.equal(quote.deliveredPerM3Net, 116.85);

  // At 0 km (odbiór własny z kopalni), transport should be 0
  const pickupQuote = calculateDeliveredMaterialRate(basalt, 0, 0.55);
  assert.equal(pickupQuote.transportUnitNet, 0);
  assert.equal(pickupQuote.deliveredUnitNet, 46);
});

test('buildEstimateLineFromQuarryMaterial splits quarry material price (M) and transport (S) for R/M/S reporting', () => {
  const sand = QUARRY_MATERIALS_CATALOG.find((i) => i.id === 'cza-piasek-0-2')!;
  const line = buildEstimateLineFromQuarryMaterial(
    sand,
    QUARRIES.czaple.shortName,
    50,
    30,
    0.5
  );

  assert.equal(line.unit, 't');
  assert.equal(line.quantity, 50);
  assert.equal(line.rateLabor, 0);
  assert.equal(line.rateMaterials, 46); // loco Żwirownia Czaple
  assert.equal(line.rateEquipment, 15); // 30 km * 0.50 zł/tkm
  assert.equal(line.isCustom, true);
  assert.ok(line.name.includes('Żwirownia Czaple'));
});
