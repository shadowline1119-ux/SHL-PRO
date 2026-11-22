import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ESTIMATE_SETTINGS } from '../data/dolnoslaskieRates';
import {
  buildAutoEstimateForTender,
  classifyTenderWorkProfile,
  extractPhysicalQuantities,
  extractTenderDataFromText,
  parsePolishNumber,
} from './tenderAutoEstimator';
import { mapBzpNoticeToTender } from './tenders';

describe('tenderAutoEstimator', () => {
  it('parses Polish decimal and thousand-separated numbers', () => {
    assert.equal(parsePolishNumber('2,560'), 2.56);
    assert.equal(parsePolishNumber('300 000,00'), 300000);
    assert.equal(parsePolishNumber('1.250'), 1250);
    assert.equal(parsePolishNumber('420,5'), 420.5);
  });

  it('extracts structured BZP metadata and physical quantities while ignoring legal boilerplate', () => {
    const plain = `
      1.4) Krajowy Numer Identyfikacyjny: REGON 000530643
      1.5.1.) Ulica: Al. Wojska Polskiego 25A 1.5.2.) Miejscowość: Lwówek Śląski 1.5.3.) Kod pocztowy: 59-600
      3.6.) Wymagania: pamięć min. 2 GB Ram, przepustowość 512 kb/s.
      4.1.2.) Numer referencyjny: IN.271.77.2026.AO
      4.2.2.) Krótki opis przedmiotu zamówienia Przebudowa drogi powiatowej nr 2491D o długości 2,560 km wraz z wykopem 1 450 m3 i rozbiórką starej nawierzchni na powierzchni 12 800 m2 (t.j. Dz.U. 2024 poz. 1292).
      4.2.10.) Okres realizacji zamówienia: 120 dni
      4.3.5.) Okres gwarancji min. 36 miesięcy
      5.4.) Nazwa i opis warunków udziału w postępowaniu. Wymagane doświadczenie o powierzchni nie mniejszej niż 2 500,00 m2 i wartości nie mniejszej niż 450 000,00 zł brutto.
      6.4.1.) Informacje dotyczące wadium: Wadium w wysokości: 8 000,00 zł (słownie: osiem tysięcy złotych).
    `;

    const extracted = extractTenderDataFromText({
      plainText: plain,
      orderObject: 'Remont drogi powiatowej nr 2491D Pławna - Wleń o dł. 2,560 km',
      organizationName: 'ZARZĄD DRÓG POWIATOWYCH W LWÓWKU ŚLĄSKIM',
      organizationCity: 'Lwówek Śląski',
      cpvCode: '45233120-6',
    });

    assert.equal(extracted.organizationRegon, '000530643');
    assert.equal(extracted.organizationStreet, 'Al. Wojska Polskiego 25A');
    assert.equal(extracted.organizationPostalCode, '59-600');
    assert.equal(extracted.referenceNumber, 'IN.271.77.2026.AO');
    assert.equal(extracted.executionPeriod, '120 dni');
    assert.equal(extracted.warrantyMonths, 36);
    assert.equal(extracted.experienceAreaM2, 2500);
    assert.equal(extracted.experienceValuePln, 450000);
    assert.equal(extracted.wadiumPln, 8000);
    assert.equal(extracted.detectedWorkProfile, 'drogi_nawierzchnie');
    assert.ok(extracted.detectedQuantities.some((q) => q.unit === 'km' && q.value === 2.56));
    assert.ok(extracted.detectedQuantities.some((q) => q.unit === 'm²' && q.value === 12800));
    assert.ok(extracted.detectedQuantities.some((q) => q.unit === 'm³' && q.value === 1450));
    assert.ok(!extracted.detectedQuantities.some((q) => q.unit === 't'));
  });

  it('classifies work profiles accurately across demolition, hydrotechnical, and utilities', () => {
    assert.equal(
      classifyTenderWorkProfile('Wyburzenie kotłowni z eternitem', '45111000-8', 'azbest'),
      'rozbiorka'
    );
    assert.equal(
      classifyTenderWorkProfile(
        'Konserwacja rzeki Kwisa i odmulenie koryta',
        '45246400-7',
        'PGW Wody Polskie Zarząd Zlewni w Lwówku Śląskim'
      ),
      'wodne_melioracje'
    );
    assert.equal(
      classifyTenderWorkProfile(
        'Budowa sieci kanalizacji sanitarnej wraz z odwodnieniem wykopu',
        '45232410-9',
        'wykop wąskoprzestrzenny'
      ),
      'sieci_wykopy'
    );
  });

  it('builds a full KNR estimate scaled from BZP notice dimensions and wadium', () => {
    const rawNotice = {
      noticeNumber: '2026/BZP 00519876/01',
      orderType: 'Works',
      publicationDate: '2026-11-03T10:00:00Z',
      orderObject: 'Rozbiórka budynku magazynowego w Bolesławcu',
      cpvCode: '45111000-8 (Roboty w zakresie burzenia, roboty ziemne)',
      submittingOffersDate: '2026-11-28T10:00:00Z',
      organizationName: 'Gmina Miejska Bolesławiec',
      organizationCity: 'Bolesławiec',
      organizationProvince: 'PL02',
      tenderId: 'ocds-demo-123',
      htmlBody: `
        <html><body>
          <p>1.5.1.) Ulica: Rynek 41</p>
          <p>1.5.2.) Miejscowość: Bolesławiec</p>
          <p>1.5.3.) Kod pocztowy: 59-700</p>
          <p>1.5.6.) Lokalizacja NUTS 3: PL515 - Jeleniogórski</p>
          <p>4.1.2.) Numer referencyjny: ZP.271.12.2026</p>
          <p>4.2.2.) Krótki opis przedmiotu zamówienia: Mechaniczne wyburzenie magazynu ceglanego o kubaturze 3200 m3, rozbiórka posadzki 640 m2 oraz wywóz gruzu ceglanego.</p>
          <p>4.2.10.) Okres realizacji zamówienia: 60 dni</p>
          <p>6.4.1.) Informacje dotyczące wadium: 6 000,00 zł</p>
        </body></html>
      `,
    };

    const tender = mapBzpNoticeToTender(rawNotice, Date.parse('2026-11-17T10:00:00Z'))!;
    const estimate = buildAutoEstimateForTender(tender, DEFAULT_ESTIMATE_SETTINGS);

    assert.equal(estimate.confidence, 'wysoka');
    assert.ok(estimate.items.length >= 4);
    assert.ok(estimate.items.some((it) => it.catalogId === 'rw-budynek-murowany'));
    assert.ok(estimate.items.some((it) => it.catalogId === 'tu-gruz-ceglany'));
    assert.ok(estimate.summary.netTotal > 100000);
    assert.equal(estimate.suggestedOfferPatch.clientName, 'Gmina Miejska Bolesławiec');
    assert.equal(estimate.suggestedOfferPatch.executionTimeline, '60 dni');
    assert.match(estimate.suggestedOfferPatch.clientAddress ?? '', /Rynek 41/);
  });

  it('handles wadium calibration when explicit dimensions are absent', () => {
    const qtyEmpty = extractPhysicalQuantities('Przebudowa placu manewrowego w Złotoryi.');
    assert.equal(qtyEmpty.length, 0);

    const tender = mapBzpNoticeToTender(
      {
        noticeNumber: '2026/BZP WADIUM-1',
        orderType: 'Works',
        publicationDate: '2026-11-10T10:00:00Z',
        orderObject: 'Przebudowa placu manewrowego w Złotoryi',
        cpvCode: '45233200-1',
        submittingOffersDate: '2026-11-29T10:00:00Z',
        organizationName: 'Gmina Złotoryja',
        organizationCity: 'Złotoryja',
        organizationProvince: 'PL02',
        htmlBody:
          '<p>4.2.2.) Krótki opis przedmiotu zamówienia: Przebudowa placu i podbudowy z kruszywa.</p><p>6.4.1.) Informacje dotyczące wadium: 12 000,00 zł</p>',
      },
      Date.parse('2026-11-17T10:00:00Z')
    )!;

    const estimate = buildAutoEstimateForTender(tender, DEFAULT_ESTIMATE_SETTINGS);
    assert.equal(estimate.confidence, 'srednia');
    assert.match(estimate.scaleBasis, /wadium/i);
    assert.ok(estimate.summary.netTotal > 50000);
  });
});
