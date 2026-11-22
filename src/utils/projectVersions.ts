import {
  EstimateLineItem,
  EstimateSettings,
  OfferMetadata,
  SavedProjectEstimate,
  StructureParams,
} from '../types/estimator';

export const PRESET_VERSION_TAGS = [
  'Wstępny',
  'Poprawiony',
  'Ostateczny',
  'Wariant alternatywny',
  'Do przetargu',
] as const;

export interface VersionInputValidation {
  valid: boolean;
  error?: string;
  normalizedName: string;
  normalizedTag: string;
  normalizedNote?: string;
}

export interface VersionTimelineEntry {
  snapshot: SavedProjectEstimate;
  projectKey: string;
  versionNumber: number;
  versionTag: string;
  previousVersion: SavedProjectEstimate | null;
  netDeltaPln: number | null;
  netDeltaPct: number | null;
  itemCountDelta: number | null;
  changedItemsCount: number;
}

export interface ProjectVersionGroup {
  projectKey: string;
  projectName: string;
  latestUpdatedAt: string;
  versionCount: number;
  latestNetTotal: number;
  latestVersionTag: string;
  latestVersionNumber: number;
  totalDeltaFromFirstPln: number | null;
  versions: VersionTimelineEntry[];
}

export interface ActiveVsSnapshotDelta {
  referenceSnapshot: SavedProjectEstimate;
  referenceVersionNumber: number;
  referenceVersionTag: string;
  netDeltaPln: number;
  netDeltaPct: number | null;
  itemCountDelta: number;
  changedItemsCount: number;
  hasChanges: boolean;
}

export function normalizeProjectKey(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pl-PL');
}

export function validateVersionSaveInput(input: {
  projectName: string;
  versionTag: string;
  versionNote?: string;
}): VersionInputValidation {
  const normalizedName = input.projectName.trim().replace(/\s+/g, ' ');
  const normalizedTag = input.versionTag.trim().replace(/\s+/g, ' ');
  const trimmedNote = input.versionNote?.trim();

  if (normalizedName.length < 2) {
    return {
      valid: false,
      error: 'Podaj nazwę projektu (minimum 2 znaki).',
      normalizedName,
      normalizedTag,
      normalizedNote: trimmedNote || undefined,
    };
  }

  if (normalizedTag.length === 0) {
    return {
      valid: false,
      error: 'Podaj lub wybierz tag wersji (np. Wstępny, Poprawiony, Ostateczny).',
      normalizedName,
      normalizedTag,
      normalizedNote: trimmedNote || undefined,
    };
  }

  if (normalizedTag.length > 48) {
    return {
      valid: false,
      error: 'Tag wersji może mieć maksymalnie 48 znaków.',
      normalizedName,
      normalizedTag,
      normalizedNote: trimmedNote || undefined,
    };
  }

  return {
    valid: true,
    normalizedName,
    normalizedTag,
    normalizedNote: trimmedNote || undefined,
  };
}

export function getVersionsForProject(
  savedEstimates: SavedProjectEstimate[],
  projectName: string
): SavedProjectEstimate[] {
  const key = normalizeProjectKey(projectName);
  if (!key) return [];
  return savedEstimates
    .filter((proj) => (proj.projectKey || normalizeProjectKey(proj.name)) === key)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getNextVersionNumber(
  savedEstimates: SavedProjectEstimate[],
  projectName: string
): number {
  const matching = getVersionsForProject(savedEstimates, projectName);
  if (matching.length === 0) return 1;
  let maxVersion = 0;
  for (let idx = 0; idx < matching.length; idx += 1) {
    const v = matching[idx].versionNumber ?? idx + 1;
    if (v > maxVersion) maxVersion = v;
  }
  return Math.max(maxVersion, matching.length) + 1;
}

export function suggestDefaultVersionTag(nextVersionNumber: number): string {
  if (nextVersionNumber <= 1) return 'Wstępny';
  return 'Poprawiony';
}

function itemFingerprint(item: EstimateLineItem): string {
  return [
    item.knr,
    item.name.trim(),
    item.unit,
    item.quantity.toFixed(4),
    item.rateLabor.toFixed(2),
    item.rateMaterials.toFixed(2),
    item.rateEquipment.toFixed(2),
  ].join('|');
}

export function countChangedItemsBetween(
  currentItems: EstimateLineItem[],
  previousItems: EstimateLineItem[]
): number {
  const prevById = new Map<string, string[]>();
  previousItems.forEach((item, idx) => {
    const key = item.id ? `id:${item.id}` : `idx:${idx}`;
    const fp = itemFingerprint(item);
    const list = prevById.get(key);
    if (list) {
      list.push(fp);
    } else {
      prevById.set(key, [fp]);
    }
  });

  const currById = new Map<string, string[]>();
  currentItems.forEach((item, idx) => {
    const key = item.id ? `id:${item.id}` : `idx:${idx}`;
    const fp = itemFingerprint(item);
    const list = currById.get(key);
    if (list) {
      list.push(fp);
    } else {
      currById.set(key, [fp]);
    }
  });

  const allKeys = new Set([...prevById.keys(), ...currById.keys()]);
  let changed = 0;
  for (const key of allKeys) {
    const prevList = prevById.get(key) ?? [];
    const currList = currById.get(key) ?? [];
    const minLen = Math.min(prevList.length, currList.length);
    for (let i = 0; i < minLen; i += 1) {
      if (prevList[i] !== currList[i]) {
        changed += 1;
      }
    }
    changed += Math.abs(currList.length - prevList.length);
  }
  return changed;
}

export function buildProjectVersionSnapshot(params: {
  existingSnapshots: SavedProjectEstimate[];
  projectName: string;
  versionTag: string;
  versionNote?: string;
  items: EstimateLineItem[];
  settings: EstimateSettings;
  structureParams: StructureParams;
  offer: OfferMetadata;
  netTotal: number;
  nowIso?: string;
  idOverride?: string;
}): SavedProjectEstimate {
  const validation = validateVersionSaveInput({
    projectName: params.projectName,
    versionTag: params.versionTag,
    versionNote: params.versionNote,
  });
  if (!validation.valid) {
    throw new Error(validation.error || 'Nieprawidłowe dane wersji projektu.');
  }

  const now = params.nowIso ?? new Date().toISOString();
  const projectKey = normalizeProjectKey(validation.normalizedName);
  const versionNumber = getNextVersionNumber(
    params.existingSnapshots,
    validation.normalizedName
  );
  const roundedNetTotal = Math.round(params.netTotal * 100) / 100;

  return {
    id:
      params.idOverride ??
      `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    projectKey,
    name: validation.normalizedName,
    versionNumber,
    versionTag: validation.normalizedTag,
    versionNote: validation.normalizedNote,
    clientName: params.offer.clientName,
    location: params.offer.projectLocation,
    createdAt: now,
    updatedAt: now,
    itemCount: params.items.length,
    netTotal: roundedNetTotal,
    items: JSON.parse(JSON.stringify(params.items)) as EstimateLineItem[],
    settings: { ...params.settings },
    structureParams: {
      ...params.structureParams,
      projectName: validation.normalizedName,
    },
    offer: { ...params.offer },
  };
}

export function computeVersionTimeline(
  savedEstimates: SavedProjectEstimate[]
): VersionTimelineEntry[] {
  // Grupujemy po projectKey i sortujemy chronologicznie rosnąco wewnątrz projektu, aby policzyć delty
  const byProject = new Map<string, SavedProjectEstimate[]>();
  for (const snap of savedEstimates) {
    const key = snap.projectKey || normalizeProjectKey(snap.name);
    const bucket = byProject.get(key);
    if (bucket) {
      bucket.push(snap);
    } else {
      byProject.set(key, [snap]);
    }
  }

  const entries: VersionTimelineEntry[] = [];

  for (const [projectKey, rawGroup] of byProject.entries()) {
    const chronological = [...rawGroup].sort((a, b) => {
      const va = a.versionNumber ?? 0;
      const vb = b.versionNumber ?? 0;
      if (va !== vb && va > 0 && vb > 0) return va - vb;
      return a.updatedAt.localeCompare(b.updatedAt);
    });

    for (let i = 0; i < chronological.length; i += 1) {
      const snap = chronological[i];
      const prev = i > 0 ? chronological[i - 1] : null;
      const versionNumber = snap.versionNumber ?? i + 1;
      const versionTag = snap.versionTag?.trim() || 'Wersja robocza';

      let netDeltaPln: number | null = null;
      let netDeltaPct: number | null = null;
      let itemCountDelta: number | null = null;
      let changedItemsCount = 0;

      if (prev) {
        netDeltaPln = Math.round((snap.netTotal - prev.netTotal) * 100) / 100;
        netDeltaPct =
          prev.netTotal > 0
            ? Math.round(((snap.netTotal - prev.netTotal) / prev.netTotal) * 1000) / 10
            : null;
        itemCountDelta = snap.itemCount - prev.itemCount;
        changedItemsCount = countChangedItemsBetween(snap.items, prev.items);
      }

      entries.push({
        snapshot: snap,
        projectKey,
        versionNumber,
        versionTag,
        previousVersion: prev,
        netDeltaPln,
        netDeltaPct,
        itemCountDelta,
        changedItemsCount,
      });
    }
  }

  return entries.sort((a, b) => {
    const dateDiff = b.snapshot.updatedAt.localeCompare(a.snapshot.updatedAt);
    if (dateDiff !== 0) return dateDiff;
    return b.versionNumber - a.versionNumber;
  });
}

export function groupVersionsByProject(
  timeline: VersionTimelineEntry[]
): ProjectVersionGroup[] {
  const byKey = new Map<string, VersionTimelineEntry[]>();
  for (const entry of timeline) {
    const list = byKey.get(entry.projectKey);
    if (list) {
      list.push(entry);
    } else {
      byKey.set(entry.projectKey, [entry]);
    }
  }

  const groups: ProjectVersionGroup[] = [];
  for (const [projectKey, versions] of byKey.entries()) {
    const sortedDesc = [...versions].sort((a, b) => {
      const dateDiff = b.snapshot.updatedAt.localeCompare(a.snapshot.updatedAt);
      if (dateDiff !== 0) return dateDiff;
      return b.versionNumber - a.versionNumber;
    });
    const latest = sortedDesc[0];
    const earliest = sortedDesc[sortedDesc.length - 1];
    const totalDeltaFromFirstPln =
      sortedDesc.length > 1
        ? Math.round((latest.snapshot.netTotal - earliest.snapshot.netTotal) * 100) / 100
        : null;

    groups.push({
      projectKey,
      projectName: latest.snapshot.name,
      latestUpdatedAt: latest.snapshot.updatedAt,
      versionCount: sortedDesc.length,
      latestNetTotal: latest.snapshot.netTotal,
      latestVersionTag: latest.versionTag,
      latestVersionNumber: latest.versionNumber,
      totalDeltaFromFirstPln,
      versions: sortedDesc,
    });
  }

  return groups.sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt));
}

export function computeActiveVsLatestSnapshotDelta(params: {
  savedEstimates: SavedProjectEstimate[];
  projectName: string;
  currentItems: EstimateLineItem[];
  currentNetTotal: number;
}): ActiveVsSnapshotDelta | null {
  const timeline = computeVersionTimeline(params.savedEstimates);
  const key = normalizeProjectKey(params.projectName);
  if (!key) return null;

  const latestEntry = timeline.find((entry) => entry.projectKey === key);
  if (!latestEntry) return null;

  const ref = latestEntry.snapshot;
  const netDeltaPln = Math.round((params.currentNetTotal - ref.netTotal) * 100) / 100;
  const netDeltaPct =
    ref.netTotal > 0
      ? Math.round(((params.currentNetTotal - ref.netTotal) / ref.netTotal) * 1000) / 10
      : null;
  const itemCountDelta = params.currentItems.length - ref.itemCount;
  const changedItemsCount = countChangedItemsBetween(params.currentItems, ref.items);

  return {
    referenceSnapshot: ref,
    referenceVersionNumber: latestEntry.versionNumber,
    referenceVersionTag: latestEntry.versionTag,
    netDeltaPln,
    netDeltaPct,
    itemCountDelta,
    changedItemsCount,
    hasChanges:
      Math.abs(netDeltaPln) >= 0.01 || itemCountDelta !== 0 || changedItemsCount > 0,
  };
}
