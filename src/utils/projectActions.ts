import {
  DEFAULT_OFFER_METADATA,
  DEFAULT_STRUCTURE_PARAMS,
} from '../data/dolnoslaskieRates';
import type {
  EstimateLineItem,
  EstimateSettings,
  OfferMetadata,
  SavedProjectEstimate,
  StructureParams,
} from '../types/estimator';

export interface ProjectWorkspaceState {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  structureParams: StructureParams;
  offer: OfferMetadata;
}

function buildOfferNumber(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const suffix = String(date.getTime()).slice(-4);
  return `OF/${year}/${month}${day}-${suffix}`;
}

export function createBlankProjectWorkspace(params: {
  projectName: string;
  currentSettings: EstimateSettings;
  currentOffer: OfferMetadata;
  now?: Date;
}): ProjectWorkspaceState {
  const now = params.now ?? new Date();
  const cleanName = params.projectName.trim() || 'Nowy kosztorys robót';
  const issueDate = now.toISOString().slice(0, 10);
  const validDate = new Date(now.getTime() + 30 * 86400_000).toISOString().slice(0, 10);

  return {
    items: [],
    settings: { ...params.currentSettings },
    structureParams: {
      ...DEFAULT_STRUCTURE_PARAMS,
      projectName: cleanName,
    },
    offer: {
      ...DEFAULT_OFFER_METADATA,
      offerNumber: buildOfferNumber(now),
      issueDate,
      validUntil: validDate,
      // Zachowaj dane firmy wykonawczej użytkownika
      contractorName: params.currentOffer.contractorName,
      contractorNip: params.currentOffer.contractorNip,
      contractorAddress: params.currentOffer.contractorAddress,
      contractorPhone: params.currentOffer.contractorPhone,
      contractorEmail: params.currentOffer.contractorEmail,
      clientName: '',
      clientNip: '',
      clientAddress: '',
      projectLocation: '',
    },
  };
}

export function duplicateProjectWorkspace(params: {
  items: EstimateLineItem[];
  settings: EstimateSettings;
  structureParams: StructureParams;
  offer: OfferMetadata;
  now?: Date;
}): ProjectWorkspaceState {
  const now = params.now ?? new Date();
  const baseName = params.structureParams.projectName.trim() || 'Kosztorys';
  const copyName = baseName.endsWith('(kopia)') ? `${baseName} 2` : `${baseName} (kopia)`;

  const clonedItems: EstimateLineItem[] = params.items.map((item, idx) => ({
    ...item,
    id: `line-${now.getTime()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
  }));

  return {
    items: clonedItems,
    settings: { ...params.settings },
    structureParams: {
      ...params.structureParams,
      projectName: copyName,
    },
    offer: {
      ...params.offer,
      offerNumber: buildOfferNumber(now),
      issueDate: now.toISOString().slice(0, 10),
    },
  };
}

export function getLatestDistinctProjects(
  savedEstimates: SavedProjectEstimate[],
  limit = 6
): SavedProjectEstimate[] {
  const seenKeys = new Set<string>();
  const sorted = [...savedEstimates]
    .filter((est) => !est.deleted)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const distinct: SavedProjectEstimate[] = [];
  for (const est of sorted) {
    const key = (est.projectKey || est.name || est.id).trim().toLowerCase();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    distinct.push(est);
    if (distinct.length >= limit) break;
  }
  return distinct;
}
