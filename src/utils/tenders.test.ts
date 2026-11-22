import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRegionalBucket,
  extractBzpDetailsFromHtml,
  filterAndSortTenders,
  formatDeadlineInfo,
  isDolnoslaskieRelevantNotice,
  isEarthworksOrDemolitionTender,
  mapBzpNoticeToTender,
  matchesRegionalBucket,
} from './tenders';

describe('tenders utilities', () => {
  it('extracts NUTS-3 subregion, email, short description, and procedure URL from BZP HTML', () => {
    const html = `
      <html><body>
        <p>1.5.6.) Lokalizacja NUTS 3: PL515 - Jeleniogórski</p>
        <p>1.5.9.) Adres poczty elektronicznej: przetargi@gmina.pl</p>
        <p>4.2.2.) Krótki opis przedmiotu zamówienia: Rozbiórka budynku magazynowego oraz roboty ziemne i podbudowa z kruszywa.</p>
        <p>4.2.3.) Wartość zamówienia: nie dotyczy</p>
        <p>Adres strony internetowej prowadzonego postępowania: https://platformazakupowa.pl/pn/msciwojow</p>
      </body></html>
    `;
    const details = extractBzpDetailsFromHtml(html, 'Mściwojów');
    assert.equal(details.subregionId, 'jelenia_gora');
    assert.equal(details.nuts3Label, 'Jeleniogórski (PL515)');
    assert.equal(details.organizationEmail, 'przetargi@gmina.pl');
    assert.match(details.shortDescription, /Rozbiórka budynku magazynowego/);
    assert.equal(details.procedureUrl, 'https://platformazakupowa.pl/pn/msciwojow');
  });

  it('detects earthworks and demolition tenders by CPV codes and Polish keywords', () => {
    assert.equal(
      isEarthworksOrDemolitionTender(
        'Zagospodarowanie terenu parku',
        '45111200-0 (Roboty w zakresie przygotowania terenu pod budowę i roboty ziemne)',
        ''
      ),
      true
    );
    assert.equal(
      isEarthworksOrDemolitionTender(
        'Wyburzenie starego magazynu przy ul. Krzywoustego',
        '45000000-7',
        ''
      ),
      true
    );
    assert.equal(
      isEarthworksOrDemolitionTender(
        'Dostawa artykułów biurowych dla urzędu',
        '30192000-1',
        'Papier ksero i długopisy.'
      ),
      false
    );
  });

  it('maps raw BZP notice to DolnoslaskieTenderItem and evaluates active deadline', () => {
    const nowMs = Date.parse('2026-11-17T12:00:00Z');
    const item = mapBzpNoticeToTender(
      {
        noticeNumber: '2026/BZP 00520082/01',
        bzpNumber: '2026/BZP 00520082',
        orderType: 'Works',
        publicationDate: '2026-11-03T14:09:50Z',
        orderObject: 'Budowa Parku Krzyckiego – roboty ziemne i nawierzchnie',
        cpvCode: '45111200-0 (Roboty ziemne)',
        submittingOffersDate: '2026-11-20T11:00:00Z',
        organizationName: 'ZARZĄD ZIELENI MIEJSKIEJ',
        organizationCity: 'Wrocław',
        organizationProvince: 'PL02',
        tenderId: 'ocds-148610-3e030270',
        htmlBody: '<p>1.5.6.) Lokalizacja NUTS 3: PL514 - Miasto Wrocław</p>',
      },
      nowMs
    );

    assert.ok(item);
    assert.equal(item.subregionId, 'wroclaw');
    assert.equal(item.isActiveDeadline, true);
    assert.equal(item.isEarthworksOrDemolition, true);
    assert.match(item.ezamowieniaUrl, /ocds-148610-3e030270/);

    const dl = formatDeadlineInfo(item.submittingOffersDate, nowMs);
    assert.equal(dl.urgency, 'soon');
    assert.equal(dl.label, 'Za 3 dni');
  });

  it('filters and sorts tenders by scope, subregion, active status, and query', () => {
    const nowMs = Date.parse('2026-11-17T12:00:00Z');
    const t1 = mapBzpNoticeToTender(
      {
        noticeNumber: '2026/BZP 001/01',
        orderType: 'Works',
        publicationDate: '2026-11-10T10:00:00Z',
        orderObject: 'Wyburzenie hali i roboty ziemne',
        cpvCode: '45111000-8',
        submittingOffersDate: '2026-11-22T10:00:00Z',
        organizationName: 'Urząd Miasta Legnica',
        organizationCity: 'Legnica',
        organizationProvince: 'PL02',
        tenderId: 'id-1',
      },
      nowMs
    )!;
    const t2 = mapBzpNoticeToTender(
      {
        noticeNumber: '2026/BZP 002/01',
        orderType: 'Services',
        publicationDate: '2026-11-12T10:00:00Z',
        orderObject: 'Obsługa informatyczna urzędu',
        cpvCode: '72000000-5',
        submittingOffersDate: '2026-11-19T10:00:00Z',
        organizationName: 'Urząd Gminy Wrocław',
        organizationCity: 'Wrocław',
        organizationProvince: 'PL02',
        tenderId: 'id-2',
      },
      nowMs
    )!;
    const t3 = mapBzpNoticeToTender(
      {
        noticeNumber: '2026/BZP 003/01',
        orderType: 'Works',
        publicationDate: '2026-10-20T10:00:00Z',
        orderObject: 'Zamknięty wykop kanalizacyjny',
        cpvCode: '45111200-0',
        submittingOffersDate: '2026-11-05T10:00:00Z',
        organizationName: 'Gmina Świdnica',
        organizationCity: 'Świdnica',
        organizationProvince: 'PL02',
        tenderId: 'id-3',
      },
      nowMs
    )!;

    const allActive = filterAndSortTenders([t1, t2, t3], {
      scope: 'all',
      subregionId: 'all',
      onlyActive: true,
      searchQuery: '',
    });
    assert.deepEqual(
      allActive.map((x) => x.noticeNumber),
      ['2026/BZP 002/01', '2026/BZP 001/01']
    );

    const earthworksOnly = filterAndSortTenders([t1, t2, t3], {
      scope: 'earthworks_demolition',
      subregionId: 'legnica_glogow',
      onlyActive: true,
      searchQuery: 'legnica',
    });
    assert.deepEqual(
      earthworksOnly.map((x) => x.noticeNumber),
      ['2026/BZP 001/01']
    );
  });

  it('classifies and filters Wody Polskie ZZ Lwówek Śląski, KOWR, Bolesławiec, and Złotoryja tenders', () => {
    const nowMs = Date.parse('2026-11-17T12:00:00Z');
    const wpNotice = mapBzpNoticeToTender(
      {
        noticeNumber: '2026/BZP WP-1',
        orderType: 'Works',
        publicationDate: '2026-11-12T10:00:00Z',
        orderObject: 'Utrzymanie rzeki Bóbr — Zarząd Zlewni w Lwówku Śląskim',
        cpvCode: '45246400-7',
        submittingOffersDate: '2026-11-26T10:00:00Z',
        organizationName: 'Państwowe Gospodarstwo Wodne Wody Polskie',
        organizationCity: 'Warszawa',
        organizationProvince: 'PL14',
        htmlBody: '<p>4.2.2.) Krótki opis przedmiotu zamówienia: Prace ziemne i ubezpieczenia na terenie RZGW Wrocław.</p>',
      },
      nowMs
    )!;
    const kowrNotice = mapBzpNoticeToTender(
      {
        noticeNumber: '2026/BZP KOWR-1',
        orderType: 'Works',
        publicationDate: '2026-11-11T10:00:00Z',
        orderObject: 'Rozbiórka budynku gospodarczego w powiecie bolesławieckim',
        cpvCode: '45111000-8',
        submittingOffersDate: '2026-11-27T10:00:00Z',
        organizationName: 'Krajowy Ośrodek Wsparcia Rolnictwa OT Wrocław',
        organizationCity: 'Wrocław',
        organizationProvince: 'PL02',
      },
      nowMs
    )!;

    assert.equal(wpNotice.regionalBucket, 'wody_polskie');
    assert.equal(matchesRegionalBucket(wpNotice, 'wody_polskie'), true);
    assert.equal(matchesRegionalBucket(wpNotice, 'lwowek'), true);

    assert.equal(kowrNotice.regionalBucket, 'kowr');
    assert.equal(matchesRegionalBucket(kowrNotice, 'kowr'), true);
    assert.equal(matchesRegionalBucket(kowrNotice, 'boleslawiec'), true);

    assert.equal(
      classifyRegionalBucket('Gmina Świerzawa', 'Świerzawa', 'Przebudowa drogi', ''),
      'zlotoryja'
    );

    assert.equal(
      isDolnoslaskieRelevantNotice({
        organizationProvince: 'PL14',
        organizationName: 'Wody Polskie',
        organizationCity: 'Warszawa',
        orderObject: 'Roboty dla RZGW we Wrocławiu — Zarząd Zlewni w Lwówku Śląskim',
      }),
      true
    );
    assert.equal(
      isDolnoslaskieRelevantNotice({
        organizationProvince: 'PL14',
        organizationName: 'Wody Polskie',
        organizationCity: 'Warszawa',
        orderObject: 'Dostawa paliwa dla Zarządu Zlewni w Inowrocławiu',
      }),
      false
    );

    const kowrFiltered = filterAndSortTenders([wpNotice, kowrNotice], {
      scope: 'all',
      subregionId: 'all',
      regionalBucket: 'kowr',
      onlyActive: true,
      searchQuery: '',
    });
    assert.deepEqual(
      kowrFiltered.map((x) => x.noticeNumber),
      ['2026/BZP KOWR-1']
    );
  });
});
