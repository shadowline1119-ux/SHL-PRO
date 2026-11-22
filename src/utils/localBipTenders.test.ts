import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalBipSearchPrompt,
  LOCAL_BIP_PORTAL_DIRECTORY,
  LOCAL_BIP_REGIONS,
  localBipCandidateToEstimateTender,
  parseLocalBipSearchResponse,
} from './localBipTenders';

describe('localBipTenders utilities', () => {
  it('builds targeted Google Search prompt for Wody Polskie ZZ Lwówek Śląski and KOWR', () => {
    const wpPrompt = buildLocalBipSearchPrompt('wody_polskie_lwowek', 'udrażnianie koryta', true, '2026-11-17');
    assert.match(wpPrompt, /Zarząd Zlewni w Lwówku Śląskim/);
    assert.match(wpPrompt, /udrażnianie koryta/);
    assert.match(wpPrompt, /2026-11-17/);

    const kowrPrompt = buildLocalBipSearchPrompt('kowr_dolny_slask', '', false, '2026-11-17');
    assert.match(kowrPrompt, /kowr\.gov\.pl/);
    assert.ok(LOCAL_BIP_REGIONS.powiat_lwowecki);
    assert.ok(LOCAL_BIP_REGIONS.powiat_boleslawiecki);
    assert.ok(LOCAL_BIP_REGIONS.powiat_zlotoryjski);
    assert.ok(LOCAL_BIP_PORTAL_DIRECTORY.length >= 10);
  });

  it('parses fenced JSON response with grounding URLs and maps candidate to estimate tender', () => {
    const rawText = `\`\`\`json
    {
      "overview": "Znaleziono 2 ogłoszenia dla Zarządu Zlewni w Lwówku Śląskim oraz Powiatu Bolesławieckiego.",
      "items": [
        {
          "title": "Konserwacja potoku Płóczka i roboty ziemne na wałach",
          "institution": "PGW Wody Polskie — Zarząd Zlewni w Lwówku Śląskim",
          "locality": "Lwówek Śląski",
          "sourcePlatform": "Wody Polskie / BIP",
          "referenceNumber": "WR.ROZ.2710.14.2026",
          "publishedDate": "2026-11-12",
          "deadlineDate": "2026-11-28 10:00",
          "statusLabel": "aktualny",
          "summary": "Odmulenie koryta oraz wykop i ubezpieczenie skarp narzutem kamiennym.",
          "url": ""
        }
      ]
    }
    \`\`\``;

    const groundingMetadata = {
      groundingChunks: [
        {
          web: {
            uri: 'https://www.gov.pl/web/wody-polskie-wroclaw/zamowienia-publiczne',
            title: 'Zamówienia RZGW Wrocław',
          },
        },
      ],
      webSearchQueries: ['Wody Polskie Zarząd Zlewni w Lwówku Śląskim przetargi'],
    };

    const parsed = parseLocalBipSearchResponse(
      rawText,
      'wody_polskie_lwowek',
      'roboty ziemne',
      groundingMetadata,
      '2026-11-17T12:00:00Z'
    );

    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].institution, 'PGW Wody Polskie — Zarząd Zlewni w Lwówku Śląskim');
    assert.equal(parsed.items[0].isEarthworksOrDemolition, true);
    assert.equal(
      parsed.items[0].url,
      'https://www.gov.pl/web/wody-polskie-wroclaw/zamowienia-publiczne'
    );
    assert.equal(parsed.sources.length, 1);

    const tender = localBipCandidateToEstimateTender(parsed.items[0]);
    assert.equal(tender.subregionId, 'jelenia_gora');
    assert.equal(tender.organizationCity, 'Lwówek Śląski');
    assert.equal(tender.isActiveDeadline, true);
  });

  it('handles prose fallback cleanly when model does not emit JSON', () => {
    const parsed = parseLocalBipSearchResponse(
      'Aktualnie KOWR OT Wrocław publikuje nabór na rozbiórkę budynku gospodarczego w gminie Zagrodno.',
      'kowr_dolny_slask',
      'rozbiórka'
    );
    assert.equal(parsed.items.length, 0);
    assert.match(parsed.overview, /KOWR OT Wrocław/);
  });
});
