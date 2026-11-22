import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QUARRIES } from '../data/quarryMaterials';
import {
  buildQuarrySearchPrompt,
  candidateToQuarryMaterialItem,
  extractGroundingSources,
  formatQuarrySearchApiError,
  getQuarryDisplayLabel,
  getQuarryLocalityLabel,
  parsePolishNumber,
  parseQuarrySearchResponse,
} from './quarrySearch';

describe('quarrySearch utilities', () => {
  it('parses Polish comma numbers and currency suffixes cleanly', () => {
    assert.equal(parsePolishNumber('54,50 zł/t'), 54.5);
    assert.equal(parsePolishNumber('120 zł netto'), 120);
    assert.equal(parsePolishNumber(48.256), 48.26);
    assert.equal(parsePolishNumber(null), null);
    assert.equal(parsePolishNumber('zapytaj o cenę'), null);
  });

  it('extracts deduplicated grounding URLs and web search queries', () => {
    const metadata = {
      webSearchQueries: ['Kopalnia Bazaltu Sulików cennik kruszyw'],
      groundingChunks: [
        { web: { uri: 'https://example.pl/sulikow', title: 'Kopalnia Sulików - Cennik' } },
        { web: { uri: 'https://example.pl/sulikow', title: 'Duplikat' } },
        { web: { uri: 'https://example.pl/oferta', title: 'Oferta kruszyw' } },
      ],
    };

    const { sources, webSearchQueries } = extractGroundingSources(metadata);
    assert.equal(sources.length, 2);
    assert.equal(sources[0].uri, 'https://example.pl/sulikow');
    assert.equal(sources[1].title, 'Oferta kruszyw');
    assert.deepEqual(webSearchQueries, ['Kopalnia Bazaltu Sulików cennik kruszyw']);
  });

  it('parses fenced JSON response from Google Search grounding into structured candidates', () => {
    const raw = `Oto wynik wyszukiwania:
\`\`\`json
{
  "quarryOfficialName": "Kopalnia Bazaltu Sulików (Colas Kruszywa)",
  "locality": "Sulików, pow. zgorzelecki",
  "summary": "Znaleziono ofertę mieszanek i grysów bazaltowych z kopalni w Sulikowie.",
  "items": [
    {
      "quarryName": "Kopalnia Sulików",
      "locality": "Sulików",
      "name": "Mieszanka bazaltowa 0–31,5 mm",
      "fraction": "0–31,5 mm",
      "rockType": "Bazalt",
      "unit": "tona",
      "bulkDensityTPerM3": "2,05",
      "priceNetPerUnit": "52,50 zł",
      "priceConfidence": "verified",
      "priceNote": "Cennik netto loco kopalnia",
      "category": "podbudowy_stabilizacja",
      "description": "Kruszywo bazaltowe drogowe."
    },
    {
      "quarryName": "Kopalnia Sulików",
      "locality": "Sulików",
      "name": "Tłuczeń bazaltowy 31,5–63 mm",
      "fraction": "31,5–63 mm",
      "rockType": "Bazalt",
      "unit": "t",
      "priceNetPerUnit": null,
      "priceConfidence": "missing",
      "priceNote": "Cena ustalana telefonicznie",
      "category": "podbudowy_stabilizacja",
      "description": "Tłuczeń kolejowy i drogowy."
    }
  ]
}
\`\`\``;

    const parsed = parseQuarrySearchResponse(raw, 'Sulików', {
      groundingChunks: [{ web: { uri: 'https://colas.pl/sulikow', title: 'Colas Sulików' } }],
    });

    assert.equal(parsed.quarryOfficialName, 'Kopalnia Bazaltu Sulików (Colas Kruszywa)');
    assert.equal(parsed.items.length, 2);
    assert.equal(parsed.items[0].unit, 't');
    assert.equal(parsed.items[0].priceNetPerUnit, 52.5);
    assert.equal(parsed.items[0].bulkDensityTPerM3, 2.05);
    assert.equal(parsed.items[0].priceConfidence, 'verified');
    assert.equal(parsed.items[1].priceNetPerUnit, null);
    assert.equal(parsed.items[1].priceConfidence, 'missing');
    assert.equal(parsed.sources[0].uri, 'https://colas.pl/sulikow');
  });

  it('handles non-JSON prose fallback gracefully while keeping grounding sources', () => {
    const parsed = parseQuarrySearchResponse(
      'Kopalnia w Sulikowie sprzedaje bazalt, brak jawnego cennika w internecie.',
      'Kopalnia Sulików',
      {
        groundingChunks: [{ web: { uri: 'https://example.pl/info', title: 'Informacje' } }],
      }
    );

    assert.equal(parsed.items.length, 0);
    assert.match(parsed.summary, /Kopalnia w Sulikowie/);
    assert.equal(parsed.sources.length, 1);
  });

  it('converts a search candidate into a catalog QuarryMaterialItem with custom quarry label', () => {
    const parsed = parseQuarrySearchResponse(
      JSON.stringify({
        quarryOfficialName: 'Kopalnia Bazaltu Sulików',
        locality: 'Sulików',
        summary: 'OK',
        items: [
          {
            quarryName: 'Kopalnia Sulików',
            locality: 'Sulików',
            name: 'Grys bazaltowy 2–8 mm',
            fraction: '2–8 mm',
            rockType: 'Bazalt',
            unit: 't',
            bulkDensityTPerM3: 1.68,
            priceNetPerUnit: 86,
            priceConfidence: 'estimated',
            priceNote: 'Oferta z portalu lokalnego',
            category: 'podbudowy_stabilizacja',
            description: 'Grys drogowy.',
          },
        ],
      }),
      'Sulików'
    );

    const catalogItem = candidateToQuarryMaterialItem(parsed.items[0], 89.5, {
      title: 'Cennik Sulików',
      uri: 'https://example.pl/cennik',
    });

    assert.equal(catalogItem.quarryId, 'lokalna_wyszukana');
    assert.equal(catalogItem.priceNetPerUnit, 89.5);
    assert.equal(catalogItem.isCustom, true);
    assert.equal(catalogItem.sourceUrl, 'https://example.pl/cennik');
    assert.equal(getQuarryDisplayLabel(catalogItem, QUARRIES), 'Kopalnia Sulików');
    assert.equal(getQuarryLocalityLabel(catalogItem, QUARRIES), 'Sulików');
  });

  it('builds prompt including quarry and optional material query', () => {
    const prompt = buildQuarrySearchPrompt('Kopalnia Radków', 'piaskowiec łamany');
    assert.match(prompt, /Kopalnia Radków/);
    assert.match(prompt, /piaskowiec łamany/);
  });

  it('formats 429 quota JSON errors into a readable Polish message', () => {
    const formatted = formatQuarrySearchApiError(
      new Error('{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}')
    );
    assert.equal(formatted.status, 429);
    assert.match(formatted.message, /429 RESOURCE_EXHAUSTED/);
  });
});
