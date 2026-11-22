import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ESTIMATE_SETTINGS, DEFAULT_OFFER_METADATA, buildInitialEstimateItems } from '../data/dolnoslaskieRates';
import { generateLocalOfferPdfBytes } from './localPdfOffer';

describe('localPdfOffer (100% offline client-side PDF)', () => {
  it('generates valid PDF bytes locally without external server or Gemini API', async () => {
    const items = buildInitialEstimateItems('sekocenbud', 'wroclaw');
    const result = await generateLocalOfferPdfBytes({
      items,
      settings: DEFAULT_ESTIMATE_SETTINGS,
      offer: {
        ...DEFAULT_OFFER_METADATA,
        contractorName: 'SHADOW-LINE Roboty Ziemne Sp. z o.o.',
        offerNumber: 'SL/2026/01',
      },
    });

    assert.equal(result.filename, 'Oferta_SL_2026_01.pdf');
    assert.ok(result.bytes.length > 2500);
    const header = new TextDecoder().decode(result.bytes.slice(0, 5));
    assert.equal(header, '%PDF-');
  });
});
