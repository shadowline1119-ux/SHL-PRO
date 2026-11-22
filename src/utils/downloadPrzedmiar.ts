import {
  buildPrzedmiarCsv,
  CsvDelimiterMode,
  PrzedmiarExportInput,
  sanitizeExportFilename,
} from './przedmiarCsv';
import { buildPrzedmiarWorkbookBytes } from './przedmiarExcel';
import { desktopBridge } from '../services/desktopBridge';

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}

export async function downloadPrzedmiarCsv(
  input: PrzedmiarExportInput & { delimiterMode?: CsvDelimiterMode }
): Promise<{ savedToFolder: boolean; fullPath?: string }> {
  const csv = buildPrzedmiarCsv(input);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const baseName = sanitizeExportFilename(input.projectName || 'Przedmiar_robot');
  const suffix = input.delimiterMode === 'comma' ? '_Numbers' : '';
  const filename = `${baseName}_${input.settings.sourceId}${suffix}.csv`;
  triggerBlobDownload(blob, filename);

  const diskSave = await desktopBridge.saveExportedFile('Eksport Excel', filename, csv);
  return { savedToFolder: diskSave.saved, fullPath: diskSave.fullPath };
}

export async function downloadPrzedmiarXlsx(
  input: Omit<PrzedmiarExportInput, 'delimiterMode'>
): Promise<{ savedToFolder: boolean; fullPath?: string; filename: string }> {
  // 100% lokalne generowanie pliku Excel (.xlsx) w aplikacji — zero Gemini API lub zewnętrznego serwera
  const bytes = await buildPrzedmiarWorkbookBytes({
    items: input.items,
    settings: input.settings,
    projectName: input.projectName,
    location: input.location,
  });

  const arrayCopy = new Uint8Array(bytes.byteLength);
  arrayCopy.set(bytes);
  const blob = new Blob([arrayCopy], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const baseName = sanitizeExportFilename(input.projectName || 'Przedmiar_robot');
  const filename = `${baseName}_${input.settings.sourceId}.xlsx`;
  triggerBlobDownload(blob, filename);

  const diskSave = await desktopBridge.saveExportedFile('Eksport Excel', filename, bytes);
  return { savedToFolder: diskSave.saved, fullPath: diskSave.fullPath, filename };
}
