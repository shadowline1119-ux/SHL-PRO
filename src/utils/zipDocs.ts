import JSZip from 'jszip';

export interface ExtractedAttachment {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
  kind: 'binary' | 'text';
  textPreview?: string;
  fromZip?: string;
}

export interface ZipExtractionResult {
  archiveName: string;
  attachments: ExtractedAttachment[];
  extractedTexts: { name: string; content: string }[];
  skippedFiles: { name: string; reason: string }[];
}

const BINARY_MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const TEXT_EXTENSIONS = new Set(['txt', 'csv', 'md', 'xml', 'json', 'log']);

function getExtension(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : '';
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function extractTechnicalDocsFromZip(
  data: ArrayBuffer | Uint8Array,
  archiveName: string
): Promise<ZipExtractionResult> {
  const zip = await JSZip.loadAsync(data);
  const attachments: ExtractedAttachment[] = [];
  const extractedTexts: { name: string; content: string }[] = [];
  const skippedFiles: { name: string; reason: string }[] = [];

  const entries = Object.values(zip.files).sort((a, b) =>
    a.name.localeCompare(b.name, 'pl')
  );

  for (const entry of entries) {
    if (entry.dir) continue;
    const normalized = entry.name.replace(/\\/g, '/');
    const baseName = normalized.split('/').pop() ?? normalized;

    // Pomiń pliki systemowe macOS / ukryte
    if (
      normalized.startsWith('__MACOSX/') ||
      baseName.startsWith('._') ||
      baseName === '.DS_Store' ||
      baseName === 'Thumbs.db'
    ) {
      continue;
    }

    const ext = getExtension(baseName);

    if (TEXT_EXTENSIONS.has(ext)) {
      const text = await entry.async('string');
      if (text.trim()) {
        extractedTexts.push({ name: normalized, content: text.trim() });
      } else {
        skippedFiles.push({ name: normalized, reason: 'Pusty plik tekstowy' });
      }
      continue;
    }

    const mimeType = BINARY_MIME_BY_EXT[ext];
    if (!mimeType) {
      skippedFiles.push({
        name: normalized,
        reason: `Nieobsługiwany format (.${ext || 'brak'}) — konwertuj do PDF lub PNG`,
      });
      continue;
    }

    const bytes = await entry.async('uint8array');
    if (bytes.byteLength === 0) {
      skippedFiles.push({ name: normalized, reason: 'Pusty plik (0 B)' });
      continue;
    }

    attachments.push({
      id: `zip-${normalized}-${bytes.byteLength}`,
      name: normalized,
      mimeType,
      base64: uint8ToBase64(bytes),
      sizeBytes: bytes.byteLength,
      kind: 'binary',
      fromZip: archiveName,
    });
  }

  return {
    archiveName,
    attachments,
    extractedTexts,
    skippedFiles,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
