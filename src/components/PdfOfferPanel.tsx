import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FileDown, Loader2, Printer } from 'lucide-react';
import { PRICE_SOURCES, SUBREGIONS } from '../data/dolnoslaskieRates';
import {
  EstimateLineItem,
  EstimateSettings,
  EstimateSummary,
  GeneratedPdfOfferRecord,
  OfferMetadata,
  PriceSourceId,
  PriceSourceMeta,
  SubregionId,
  SubregionMeta,
} from '../types/estimator';
import { calculateLineTotals, formatNumber, formatPLN } from '../utils/calculations';
import { generateLocalOfferPdfBytes } from '../utils/localPdfOffer';
import { desktopBridge } from '../services/desktopBridge';

interface PdfOfferPanelProps {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  summary: EstimateSummary;
  offer: OfferMetadata;
  priceSources?: Record<PriceSourceId, PriceSourceMeta>;
  subregions?: Record<SubregionId, SubregionMeta>;
  onChangeOffer: (next: OfferMetadata) => void;
  onExportCompleted?: (record: GeneratedPdfOfferRecord) => void;
}

export function PdfOfferPanel({
  items,
  settings,
  summary,
  offer,
  priceSources = PRICE_SOURCES,
  subregions = SUBREGIONS,
  onChangeOffer,
  onExportCompleted,
}: PdfOfferPanelProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSuccessNotice, setPdfSuccessNotice] = useState<string | null>(null);

  const update = <K extends keyof OfferMetadata>(key: K, val: OfferMetadata[K]) => {
    onChangeOffer({ ...offer, [key]: val });
  };

  const handleDownloadPdf = async () => {
    setPdfError(null);
    setPdfSuccessNotice(null);
    setIsDownloading(true);
    try {
      // 100% lokalne generowanie PDF w aplikacji — bez internetu, Gemini API ani serwera zewnętrznego
      const { bytes, filename } = await generateLocalOfferPdfBytes({
        items,
        settings,
        offer,
        priceSources,
        subregions,
      });

      const arrayCopy = new Uint8Array(bytes.byteLength);
      arrayCopy.set(bytes);
      const blob = new Blob([arrayCopy], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);

      const generatedRecord: GeneratedPdfOfferRecord = {
        offerNumber: offer.offerNumber,
        projectName: offer.projectLocation || offer.offerNumber,
        projectLocation: offer.projectLocation,
        subregionId: settings.subregionId,
        netTotal: summary.netTotal,
        grossTotal: summary.grossTotal,
        filename,
        generatedAt: new Date().toISOString(),
      };

      const diskRes = await desktopBridge.saveExportedFile('Oferty PDF', filename, bytes);
      if (diskRes.saved) {
        setPdfSuccessNotice(
          `Wygenerowano lokalnie (offline-ready) i zapisano w folderze „Oferty PDF”: ${filename}`
        );
      } else {
        setPdfSuccessNotice(`Wygenerowano lokalnie plik PDF: ${filename}`);
      }
      onExportCompleted?.(generatedRecord);
    } catch (err: unknown) {
      setPdfError(
        err instanceof Error
          ? err.message
          : 'Nie udało się wygenerować pliku PDF lokalnie. Spróbuj „Drukuj / Zapisz PDF”.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Editable Offer Form */}
      <div className="no-print xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="pb-3 border-b border-slate-200">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Dane handlowe oferty dla klienta
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Uzupełnij dane Wykonawcy, Zleceniodawcy i warunki umowy, a następnie pobierz gotowy PDF.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="offer-no" className="block text-xs font-medium text-slate-700 mb-1">
              Numer oferty
            </label>
            <input
              id="offer-no"
              type="text"
              value={offer.offerNumber}
              onChange={(e) => update('offerNumber', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="offer-date" className="block text-xs font-medium text-slate-700 mb-1">
              Data wystawienia
            </label>
            <input
              id="offer-date"
              type="date"
              value={offer.issueDate}
              onChange={(e) => update('issueDate', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="offer-valid" className="block text-xs font-medium text-slate-700 mb-1">
              Ważna do
            </label>
            <input
              id="offer-valid"
              type="date"
              value={offer.validUntil}
              onChange={(e) => update('validUntil', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700">Wykonawca</div>
          <input
            type="text"
            aria-label="Nazwa wykonawcy"
            value={offer.contractorName}
            onChange={(e) => update('contractorName', e.target.value)}
            placeholder="Nazwa firmy wykonawczej"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              aria-label="NIP wykonawcy"
              value={offer.contractorNip}
              onChange={(e) => update('contractorNip', e.target.value)}
              placeholder="NIP"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
            />
            <input
              type="text"
              aria-label="Telefon wykonawcy"
              value={offer.contractorPhone}
              onChange={(e) => update('contractorPhone', e.target.value)}
              placeholder="Telefon"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              aria-label="Adres wykonawcy"
              value={offer.contractorAddress}
              onChange={(e) => update('contractorAddress', e.target.value)}
              placeholder="Adres siedziby"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
            <input
              type="email"
              aria-label="Email wykonawcy"
              value={offer.contractorEmail}
              onChange={(e) => update('contractorEmail', e.target.value)}
              placeholder="Adres e-mail"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700">Zleceniodawca / Inwestor</div>
          <input
            type="text"
            aria-label="Nazwa zleceniodawcy"
            value={offer.clientName}
            onChange={(e) => update('clientName', e.target.value)}
            placeholder="Nazwa inwestora lub zleceniodawcy"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              aria-label="NIP zleceniodawcy"
              value={offer.clientNip}
              onChange={(e) => update('clientNip', e.target.value)}
              placeholder="NIP"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
            />
            <input
              type="text"
              aria-label="Adres zleceniodawcy"
              value={offer.clientAddress}
              onChange={(e) => update('clientAddress', e.target.value)}
              placeholder="Adres zamawiającego"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <input
            type="text"
            aria-label="Lokalizacja inwestycji"
            value={offer.projectLocation}
            onChange={(e) => update('projectLocation', e.target.value)}
            placeholder="Lokalizacja placu budowy (miejscowość, nr działki)"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
          />
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-700">Warunki realizacji</div>
          <div>
            <label htmlFor="offer-timeline" className="block text-[11px] text-slate-600 mb-1">
              Termin wykonania
            </label>
            <input
              id="offer-timeline"
              type="text"
              value={offer.executionTimeline}
              onChange={(e) => update('executionTimeline', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-2">
              <label htmlFor="offer-payment" className="block text-[11px] text-slate-600 mb-1">
                Warunki płatności
              </label>
              <input
                id="offer-payment"
                type="text"
                value={offer.paymentTerms}
                onChange={(e) => update('paymentTerms', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="offer-warranty" className="block text-[11px] text-slate-600 mb-1">
                Gwarancja (m-ce)
              </label>
              <input
                id="offer-warranty"
                type="number"
                min={0}
                value={offer.warrantyMonths}
                onChange={(e) =>
                  update('warrantyMonths', Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="offer-exclusions" className="block text-[11px] text-slate-600 mb-1">
              Wyłączenia z zakresu prac
            </label>
            <textarea
              id="offer-exclusions"
              rows={2}
              value={offer.exclusions}
              onChange={(e) => update('exclusions', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="offer-notes" className="block text-[11px] text-slate-600 mb-1">
              Uwagi i rozliczenie odpadów BDO
            </label>
            <textarea
              id="offer-notes"
              rows={2}
              value={offer.additionalNotes}
              onChange={(e) => update('additionalNotes', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        {pdfError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{pdfError}</span>
          </div>
        )}

        {pdfSuccessNotice && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
            <span>{pdfSuccessNotice}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2.5 pt-2">
          <button
            type="button"
            disabled={isDownloading || items.length === 0}
            onClick={handleDownloadPdf}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-amber-700 rounded-lg hover:bg-amber-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generowanie pliku PDF...</span>
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                <span>Pobierz PDF Oferty</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>Drukuj / Zapisz PDF</span>
          </button>
        </div>
      </div>

      {/* Right: Live A4 Print-Ready Offer Preview */}
      <div className="xl:col-span-7">
        <div className="print-sheet bg-white border border-slate-200 rounded-xl p-8 space-y-6 text-slate-900">
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="min-w-0">
              <div className="font-display text-xl font-bold tracking-tight text-slate-900">
                OFERTA KOSZTORYSOWA
              </div>
              <div className="text-xs text-slate-600 mt-1 font-mono">
                Nr: {offer.offerNumber} · Wystawiono: {offer.issueDate} · Ważna do: {offer.validUntil}
              </div>
            </div>
            <div className="text-right text-xs shrink-0">
              <div className="font-semibold text-amber-800 whitespace-nowrap">WOJ. DOLNOŚLĄSKIE</div>
              <div className="text-slate-700 whitespace-nowrap">{subregions[settings.subregionId].name}</div>
              <div className="text-slate-500">
                Baza: {priceSources[settings.sourceId].shortName}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Wykonawca
              </div>
              <div className="font-semibold text-sm text-slate-900">{offer.contractorName}</div>
              <div>NIP: {offer.contractorNip}</div>
              <div>{offer.contractorAddress}</div>
              <div className="text-slate-600">
                {offer.contractorPhone} · {offer.contractorEmail}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Zamawiający / Inwestor
              </div>
              <div className="font-semibold text-sm text-slate-900">{offer.clientName}</div>
              <div>NIP: {offer.clientNip}</div>
              <div>{offer.clientAddress}</div>
              <div className="text-amber-800 font-medium pt-0.5">
                Lokalizacja: {offer.projectLocation}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              1. Zakres robót i wycena szczegółowa
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="py-2 px-2 text-center w-7">Lp.</th>
                    <th className="py-2 px-2 w-24">KNR / BDO</th>
                    <th className="py-2 px-2">Opis prac</th>
                    <th className="py-2 px-1.5 text-center w-10">J.m.</th>
                    <th className="py-2 px-1.5 text-right w-14">Ilość</th>
                    <th className="py-2 px-2 text-right w-20">Cena j. netto</th>
                    <th className="py-2 px-2 text-right w-24">Wartość netto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, idx) => {
                    const t = calculateLineTotals(item, settings);
                    return (
                      <tr key={item.id} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
                        <td className="py-2 px-2.5 text-center font-mono text-slate-500">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-600">
                          <div>{item.knr}</div>
                          {item.bdoCode && (
                            <div className="text-amber-800">BDO {item.bdoCode}</div>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-slate-900">{item.name}</td>
                        <td className="py-2 px-2 text-center font-mono text-slate-700">
                          {item.unit}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-900">
                          {formatNumber(item.quantity, 2)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatPLN(t.unitNetRate)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatPLN(t.netTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="border border-slate-200 rounded-lg p-4 space-y-2">
              <div className="font-semibold text-slate-800">2. Udział kosztów R / M / S</div>
              <div className="flex justify-between">
                <span className="text-slate-600">Robocizna (R):</span>
                <span className="font-mono tabular-nums">
                  {formatPLN(summary.laborTotal)} ({summary.laborSharePct}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Materiały i BDO (M):</span>
                <span className="font-mono tabular-nums">
                  {formatPLN(summary.materialsTotal)} ({summary.materialsSharePct}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Sprzęt i transport (S):</span>
                <span className="font-mono tabular-nums">
                  {formatPLN(summary.equipmentTotal)} ({summary.equipmentSharePct}%)
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-100">
                <span className="text-slate-600">
                  Narzuty (Kp {settings.indirectCostsPct}% + Zysk {settings.profitPct}%):
                </span>
                <span className="font-mono tabular-nums">
                  {formatPLN(summary.indirectCost + summary.profit)}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50">
              <div className="font-semibold text-slate-800">3. Podsumowanie oferty</div>
              {(summary.riskReserveAmount ?? 0) > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">
                    Ryzyko gruntowe (+{formatNumber(settings.soilRiskPct ?? 0, 1)}%):
                  </span>
                  <span className="font-mono tabular-nums text-amber-800 font-medium">
                    +{formatPLN(summary.riskReserveAmount ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Wartość netto:</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatPLN(summary.netTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Podatek VAT ({settings.vatRate}%):</span>
                <span className="font-mono tabular-nums text-slate-800">
                  {formatPLN(summary.vatAmount)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-amber-800">
                <span>RAZEM BRUTTO:</span>
                <span className="font-mono tabular-nums">{formatPLN(summary.grossTotal)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 text-xs text-slate-600 space-y-1.5">
            <div>
              <span className="font-semibold text-slate-800">Termin realizacji:</span>{' '}
              {offer.executionTimeline}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Płatność i gwarancja:</span>{' '}
              {offer.paymentTerms} · Gwarancja {offer.warrantyMonths} mies.
            </div>
            <div>
              <span className="font-semibold text-slate-800">Wyłączenia:</span>{' '}
              {offer.exclusions}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Uwagi BDO:</span>{' '}
              {offer.additionalNotes}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
