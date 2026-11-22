import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  CATEGORY_LABELS,
  PRICE_SOURCES,
  SAMPLE_DOC_PRESETS,
  SUBREGIONS,
} from '../data/dolnoslaskieRates';
import { AiDocAnalysisResult, EstimateSettings } from '../types/estimator';
import { formatNumber } from '../utils/calculations';
import {
  ExtractedAttachment,
  extractTechnicalDocsFromZip,
  formatFileSize,
} from '../utils/zipDocs';

interface DocAnalyzerPanelProps {
  settings: EstimateSettings;
  onApplyAnalysis: (result: AiDocAnalysisResult, replaceExisting: boolean) => void;
}

interface QueuedAttachment extends ExtractedAttachment {
  selected: boolean;
}

export function DocAnalyzerPanel({
  settings,
  onApplyAnalysis,
}: DocAnalyzerPanelProps) {
  const [textContent, setTextContent] = useState(SAMPLE_DOC_PRESETS[0].content);
  const [attachments, setAttachments] = useState<QueuedAttachment[]>([]);
  const [zipSummary, setZipSummary] = useState<{
    archiveName: string;
    skipped: { name: string; reason: string }[];
  } | null>(null);
  const [isUnpacking, setIsUnpacking] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AiDocAnalysisResult | null>(null);

  const readBinaryFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? '');
        resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
      };
      reader.onerror = () => reject(new Error(`Nie udało się odczytać pliku ${file.name}`));
      reader.readAsDataURL(file);
    });

  const processIncomingFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setErrorMsg(null);
    setIsUnpacking(true);

    try {
      const nextAttachments: QueuedAttachment[] = [];
      const extractedTextBlocks: string[] = [];
      let lastZipSummary: {
        archiveName: string;
        skipped: { name: string; reason: string }[];
      } | null = null;

      for (const file of files) {
        const lower = file.name.toLowerCase();

        if (lower.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
          const buffer = await file.arrayBuffer();
          const zipResult = await extractTechnicalDocsFromZip(buffer, file.name);

          for (const txt of zipResult.extractedTexts) {
            extractedTextBlocks.push(`--- ${txt.name} (z ${file.name}) ---\n${txt.content}`);
          }
          for (const att of zipResult.attachments) {
            nextAttachments.push({ ...att, selected: true });
          }
          lastZipSummary = {
            archiveName: file.name,
            skipped: zipResult.skippedFiles,
          };

          if (
            zipResult.attachments.length === 0 &&
            zipResult.extractedTexts.length === 0
          ) {
            setErrorMsg(
              `Archiwum "${file.name}" nie zawiera obsługiwanych plików (PDF, PNG, JPG, WEBP, TXT, CSV).`
            );
          }
          continue;
        }

        if (
          file.type === 'text/plain' ||
          lower.endsWith('.txt') ||
          lower.endsWith('.csv') ||
          lower.endsWith('.md')
        ) {
          const txt = await file.text();
          if (txt.trim()) {
            extractedTextBlocks.push(`--- ${file.name} ---\n${txt.trim()}`);
          }
          continue;
        }

        const base64 = await readBinaryFileAsBase64(file);
        const mimeType =
          file.type ||
          (lower.endsWith('.png')
            ? 'image/png'
            : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
            ? 'image/jpeg'
            : lower.endsWith('.webp')
            ? 'image/webp'
            : 'application/pdf');

        nextAttachments.push({
          id: `file-${Date.now()}-${file.name}`,
          name: file.name,
          mimeType,
          base64,
          sizeBytes: file.size,
          kind: 'binary',
          selected: true,
        });
      }

      if (extractedTextBlocks.length > 0) {
        setTextContent((prev) => {
          const isDefaultPreset = SAMPLE_DOC_PRESETS.some(
            (p) => p.content.trim() === prev.trim()
          );
          const merged = extractedTextBlocks.join('\n\n');
          return isDefaultPreset || !prev.trim() ? merged : `${prev.trim()}\n\n${merged}`;
        });
      }

      if (nextAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...nextAttachments]);
      }

      if (lastZipSummary) {
        setZipSummary(lastZipSummary);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Nie udało się rozpakować archiwum ZIP.';
      setErrorMsg(`Błąd odczytu pliku: ${msg}`);
    } finally {
      setIsUnpacking(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      void processIncomingFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processIncomingFiles(e.dataTransfer.files);
    }
  };

  const toggleAttachment = (id: string) => {
    setAttachments((prev) =>
      prev.map((att) => (att.id === id ? { ...att, selected: !att.selected } : att))
    );
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const selectedAttachments = attachments.filter((a) => a.selected);

  const handleAnalyze = async () => {
    setErrorMsg(null);
    if (!textContent.trim() && selectedAttachments.length === 0) {
      setErrorMsg(
        'Załącz paczkę ZIP, plik PDF/JPG/PNG/TXT lub wklej opis techniczny.'
      );
      return;
    }

    const totalSizeBytes = selectedAttachments.reduce((acc, f) => acc + f.sizeBytes, 0);
    if (totalSizeBytes > 30 * 1024 * 1024) {
      setErrorMsg(
        'Łączny rozmiar zaznaczonych załączników przekracza 30 MB. Odznacz zbędne rysunki przed analizą.'
      );
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorMsg(
        'Tryb offline — automatyczna analiza AI dokumentacji wymaga połączenia z internetem. Możesz jednak lokalnie rozpakować paczkę ZIP, przejrzeć opis techniczny i ręcznie uzupełnić kosztorys lub kalkulator parametrów obiektu.'
      );
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textContent: textContent.trim(),
          files: selectedAttachments.map((f) => ({
            name: f.name,
            mimeType: f.mimeType,
            base64: f.base64,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Błąd serwera (${res.status})`);
      }
      setAnalysis(data.analysis as AiDocAnalysisResult);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Nie udało się przeanalizować dokumentacji.';
      setErrorMsg(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Automatyczna analiza dokumentacji technicznej obiektu
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Wgraj paczkę <span className="font-mono font-medium text-slate-800">.zip</span> z dokumentacją, pojedyncze pliki (PDF, PNG, JPG, TXT) lub wklej specyfikację techniczną. System wyodrębni wymiary, kody odpadów BDO oraz pozycje przedmiarowe i wyceni je według bazy{' '}
            <span className="font-medium text-slate-900">
              {PRICE_SOURCES[settings.sourceId].name}
            </span>
            .
          </p>
        </div>

        {/* Sample technical documentation presets */}
        <div>
          <div className="text-xs font-medium text-slate-600 mb-2">
            Przykładowa dokumentacja z woj. dolnośląskiego (do szybkiego testu):
          </div>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_DOC_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setTextContent(preset.content);
                  setAttachments([]);
                  setZipSummary(null);
                  setErrorMsg(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-left"
              >
                {preset.title}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 space-y-3">
            <label
              htmlFor="doc-file-input"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center min-h-[190px] rounded-xl border border-dashed px-5 py-6 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-amber-600 bg-amber-50/60'
                  : 'border-slate-300 bg-slate-50 hover:border-amber-600 hover:bg-amber-50/30'
              }`}
            >
              {isUnpacking ? (
                <Loader2 className="w-7 h-7 text-amber-700 animate-spin mb-2" />
              ) : (
                <Upload className="w-7 h-7 text-slate-400 mb-2" />
              )}
              <span className="text-sm font-medium text-slate-800">
                {isUnpacking
                  ? 'Rozpakowywanie archiwum ZIP...'
                  : 'Upuść lub wybierz paczkę ZIP, PDF, rzuty (PNG/JPG) lub TXT'}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Obsługuje archiwa .zip z wieloma rysunkami i opisami (limit wysyłki 30 MB)
              </span>
              <input
                id="doc-file-input"
                type="file"
                multiple
                accept=".zip,.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            {attachments.length > 0 && (
              <div className="border border-slate-200 rounded-xl bg-slate-50/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>
                    Załączone pliki do analizy ({selectedAttachments.length}/{attachments.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachments([]);
                      setZipSummary(null);
                    }}
                    className="text-xs font-medium text-red-700 hover:underline"
                  >
                    Wyczyść pliki
                  </button>
                </div>
                <ul className="max-h-48 overflow-y-auto divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
                  {attachments.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={att.selected}
                          onChange={() => toggleAttachment(att.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                        />
                        <span className="truncate font-medium text-slate-800" title={att.name}>
                          {att.name}
                        </span>
                      </label>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] text-slate-500">
                          {formatFileSize(att.sizeBytes)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Usuń załącznik ${att.name}`}
                          onClick={() => removeAttachment(att.id)}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {zipSummary && zipSummary.skipped.length > 0 && (
              <div className="border border-slate-200 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-slate-800">
                  <FileArchive className="w-3.5 h-3.5 text-amber-700" />
                  <span>
                    Pominięte pliki z archiwum {zipSummary.archiveName} ({zipSummary.skipped.length}):
                  </span>
                </div>
                <ul className="space-y-0.5 pl-5 list-disc text-[11px] text-slate-500">
                  {zipSummary.skipped.slice(0, 5).map((s, idx) => (
                    <li key={idx} className="truncate">
                      {s.name} — {s.reason}
                    </li>
                  ))}
                  {zipSummary.skipped.length > 5 && (
                    <li>...oraz {zipSummary.skipped.length - 5} innych plików</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="lg:col-span-7">
            <label
              htmlFor="doc-text-area"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Opis techniczny / wytyczne z projektu budowlanego lub rozbiórki
            </label>
            <textarea
              id="doc-text-area"
              rows={attachments.length > 0 ? 12 : 8}
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Wklej opis techniczny, parametry obiektu, warunki gruntowo-wodne lub zestawienie materiałów z projektu..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-mono text-slate-800 leading-relaxed focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-500">
            Analiza uwzględnia katalog KNR/KNNR oraz klasyfikację odpadów BDO obowiązującą w Polsce.
          </div>
          <button
            type="button"
            disabled={isAnalyzing || isUnpacking}
            onClick={handleAnalyze}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-700 rounded-lg hover:bg-amber-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analizowanie dokumentacji...</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>Analizuj dokumentację i wygeneruj kosztorys</span>
              </>
            )}
          </button>
        </div>
      </div>

      {analysis && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>Dokumentacja przeanalizowana pomyślnie</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-600">{analysis.detectedLocation}</span>
              </div>
              <h3 className="font-display text-lg font-semibold text-slate-900 mt-1">
                {analysis.projectTitle}
              </h3>
              <p className="text-sm text-slate-600 mt-1">{analysis.summary}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onApplyAnalysis(analysis, false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Dopisz do kosztorysu
              </button>
              <button
                type="button"
                onClick={() => onApplyAnalysis(analysis, true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap"
              >
                Zastosuj jako nowy kosztorys
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Subregion</div>
              <div className="font-medium text-slate-900 mt-1">
                {SUBREGIONS[analysis.recommendedSubregion]?.name ?? analysis.recommendedSubregion}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Wymiary (dł × szer)</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 mt-1">
                {analysis.estimatedDimensions.lengthM} × {analysis.estimatedDimensions.widthM} m
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Wysokość / Kond.</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 mt-1">
                {analysis.estimatedDimensions.heightM} m / {analysis.estimatedDimensions.floors}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Głębokość wykopu</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 mt-1">
                {analysis.estimatedDimensions.excavationDepthM} m
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Kategoria gruntu</div>
              <div className="font-mono font-semibold text-slate-900 mt-1">
                Kat. {analysis.estimatedDimensions.soilCategory}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-slate-500">Kody BDO</div>
              <div className="font-mono font-medium text-amber-800 mt-1 truncate">
                {analysis.detectedBdoCodes.length > 0
                  ? analysis.detectedBdoCodes.join(', ')
                  : 'Brak odpadów'}
              </div>
            </div>
          </div>

          {analysis.risksAndAssumptions.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Zidentyfikowane założenia technologiczne i ryzyka:
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                {analysis.risksAndAssumptions.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-3">KNR / BDO</th>
                  <th className="py-2.5 px-3">Wyodrębniona pozycja robót</th>
                  <th className="py-2.5 px-3">Kategoria</th>
                  <th className="py-2.5 px-3 text-center">J.m.</th>
                  <th className="py-2.5 px-3 text-right">Ilość</th>
                  <th className="py-2.5 px-3">Uzasadnienie z dokumentacji</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {analysis.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      <div>{item.knr}</div>
                      {item.bdoCode && (
                        <div className="text-amber-800">BDO {item.bdoCode}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{item.name}</td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                      {item.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatNumber(item.quantity, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{item.reasoning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
