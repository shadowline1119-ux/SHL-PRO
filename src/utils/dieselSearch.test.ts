import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDieselSearchPrompt,
  formatDieselSearchApiError,
  normalizeMonthlyPricesTo12Months,
  parseDieselPriceNumber,
  parseDieselSearchResponse,
} from './dieselSearch';

test('parseDieselPriceNumber parses PLN/l retail, comma decimals, and wholesale m3 quotes', () => {
  assert.equal(parseDieselPriceNumber('6,34 zł/l'), 6.34);
  assert.equal(parseDieselPriceNumber('4 920 zł'), 4.92);
  assert.equal(parseDieselPriceNumber(6.185), 6.19);
  assert.equal(parseDieselPriceNumber('0,50'), null);
  assert.equal(parseDieselPriceNumber('invalid'), null);
});

test('parseDieselSearchResponse extracts 12 monthly prices, interpolates sparse gaps, and keeps grounding sources', () => {
  const prompt = buildDieselSearchPrompt('retail_pl', 'Aglomeracja Wrocławska');
  assert.ok(prompt.includes('2025-12'));
  assert.ok(prompt.includes('2026-11'));

  const mockJson = `\`\`\`json
{
  "fuelStationReference": "e-petrol.pl / Reflex",
  "summary": "Ceny ON rosły wiosną i latem 2026, stabilizując się jesienią.",
  "monthlyPrices": [
    { "monthKey": "2025-12", "pricePlnPerL": 6.10 },
    { "monthKey": "2026-03", "pricePlnPerL": 6.25 },
    { "monthKey": "2026-06", "pricePlnPerL": 6.40 },
    { "monthKey": "2026-09", "pricePlnPerL": 6.32 },
    { "monthKey": "2026-11", "pricePlnPerL": 6.26 }
  ]
}
\`\`\``;

  const { result } = parseDieselSearchResponse(mockJson, 'retail_pl', {
    groundingChunks: [
      { web: { uri: 'https://www.e-petrol.pl/notowania', title: 'e-petrol.pl' } },
      { web: { uri: 'https://www.e-petrol.pl/notowania', title: 'duplicate' } },
    ],
    webSearchQueries: ['ceny oleju napedowego 2026 polska'],
  });

  assert.equal(result.monthlyPrices.length, 12);
  assert.equal(result.monthlyPrices[0].monthKey, '2025-12');
  assert.equal(result.monthlyPrices[0].pricePlnPerL, 6.1);
  // Interpolated Feb 2026 between 6.10 (Dec) and 6.25 (Mar)
  assert.equal(result.monthlyPrices[2].pricePlnPerL, 6.2);
  assert.equal(result.monthlyPrices[11].pricePlnPerL, 6.26);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].title, 'e-petrol.pl');
});

test('normalizeMonthlyPricesTo12Months refuses insufficient sparse data and formats API errors', () => {
  const tooSparse = normalizeMonthlyPricesTo12Months([
    { monthKey: '2026-10', pricePlnPerL: 6.2 },
    { monthKey: '2026-11', pricePlnPerL: 6.25 },
  ]);
  assert.equal(tooSparse.length, 0);

  const err429 = formatDieselSearchApiError(
    new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')
  );
  assert.equal(err429.status, 429);
  assert.ok(err429.message.includes('429'));
});
