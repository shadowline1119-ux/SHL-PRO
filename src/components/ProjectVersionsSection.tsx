import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  FolderOpen,
  History,
  Minus,
  Save,
  Trash2,
} from 'lucide-react';
import {
  EstimateLineItem,
  SavedProjectEstimate,
} from '../types/estimator';
import { formatNumber, formatPLN } from '../utils/calculations';
import {
  computeActiveVsLatestSnapshotDelta,
  computeVersionTimeline,
  getNextVersionNumber,
  groupVersionsByProject,
  normalizeProjectKey,
  PRESET_VERSION_TAGS,
  suggestDefaultVersionTag,
  validateVersionSaveInput,
} from '../utils/projectVersions';
import { ConfirmDialog } from './ConfirmDialog';

export interface SaveProjectVersionPayload {
  projectName: string;
  versionTag: string;
  versionNote?: string;
}

interface ProjectVersionsSectionProps {
  savedEstimates: SavedProjectEstimate[];
  activeProjectName: string;
  activeItems: EstimateLineItem[];
  activeNetTotal: number;
  onSaveVersion: (payload: SaveProjectVersionPayload) => Promise<void>;
  onLoadVersion: (snapshot: SavedProjectEstimate) => void;
  onDeleteVersion: (id: string) => Promise<void>;
  idPrefix?: string;
  initialViewMode?: 'current' | 'all';
}

function formatDateTimePl(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSignedPLN(val: number): string {
  const prefix = val > 0 ? '+' : val < 0 ? '−' : '';
  return `${prefix}${formatPLN(Math.abs(val))}`;
}

export function ProjectVersionsSection({
  savedEstimates,
  activeProjectName,
  activeItems,
  activeNetTotal,
  onSaveVersion,
  onLoadVersion,
  onDeleteVersion,
  idPrefix = 'ver',
  initialViewMode = 'all',
}: ProjectVersionsSectionProps) {
  const [projectSaveName, setProjectSaveName] = useState<string>(activeProjectName);
  const nextVersionForInput = useMemo(
    () => getNextVersionNumber(savedEstimates, projectSaveName),
    [savedEstimates, projectSaveName]
  );

  const [versionTag, setVersionTag] = useState<string>(() =>
    suggestDefaultVersionTag(
      getNextVersionNumber(savedEstimates, activeProjectName)
    )
  );
  const [tagTouchedByUser, setTagTouchedByUser] = useState(false);
  const [versionNote, setVersionNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<'current' | 'all'>(initialViewMode);
  const [pendingDeleteSnapshot, setPendingDeleteSnapshot] = useState<{
    id: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    setProjectSaveName(activeProjectName);
  }, [activeProjectName]);

  useEffect(() => {
    if (!tagTouchedByUser) {
      setVersionTag(suggestDefaultVersionTag(nextVersionForInput));
    }
  }, [nextVersionForInput, tagTouchedByUser]);

  const timeline = useMemo(
    () => computeVersionTimeline(savedEstimates),
    [savedEstimates]
  );

  const currentProjectKey = useMemo(
    () => normalizeProjectKey(projectSaveName || activeProjectName),
    [projectSaveName, activeProjectName]
  );

  const currentProjectEntries = useMemo(
    () => timeline.filter((e) => e.projectKey === currentProjectKey),
    [timeline, currentProjectKey]
  );

  const projectGroups = useMemo(
    () => groupVersionsByProject(timeline),
    [timeline]
  );

  const visibleGroups = useMemo(() => {
    if (scopeFilter === 'current') {
      return projectGroups.filter((g) => g.projectKey === currentProjectKey);
    }
    return projectGroups;
  }, [projectGroups, scopeFilter, currentProjectKey]);

  const activeDelta = useMemo(
    () =>
      computeActiveVsLatestSnapshotDelta({
        savedEstimates,
        projectName: projectSaveName,
        currentItems: activeItems,
        currentNetTotal: activeNetTotal,
      }),
    [savedEstimates, projectSaveName, activeItems, activeNetTotal]
  );

  const handleSelectPresetTag = (tag: string) => {
    setTagTouchedByUser(true);
    setVersionTag(tag);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveFeedback(null);

    const check = validateVersionSaveInput({
      projectName: projectSaveName,
      versionTag,
      versionNote,
    });

    if (!check.valid) {
      setFormError(check.error || 'Sprawdź nazwę projektu i tag wersji.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const assignedVersion = nextVersionForInput;
      await onSaveVersion({
        projectName: check.normalizedName,
        versionTag: check.normalizedTag,
        versionNote: check.normalizedNote,
      });
      setSaveFeedback(
        `Zapisano wersję v${assignedVersion} (${check.normalizedTag}) dla projektu „${check.normalizedName}”.`
      );
      setVersionNote('');
      setTagTouchedByUser(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label
              htmlFor={`${idPrefix}-project-name`}
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Nazwa projektu
            </label>
            <input
              id={`${idPrefix}-project-name`}
              type="text"
              list={`${idPrefix}-known-projects`}
              value={projectSaveName}
              onChange={(e) => {
                setProjectSaveName(e.target.value);
                setFormError(null);
                setSaveFeedback(null);
              }}
              placeholder="np. Rozbiórka hali — Wrocław"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
            <datalist id={`${idPrefix}-known-projects`}>
              {projectGroups.map((grp) => (
                <option key={grp.projectKey} value={grp.projectName} />
              ))}
            </datalist>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor={`${idPrefix}-version-tag`}
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Tag wersji
            </label>
            <input
              id={`${idPrefix}-version-tag`}
              type="text"
              value={versionTag}
              maxLength={48}
              onChange={(e) => {
                setTagTouchedByUser(true);
                setVersionTag(e.target.value);
                setFormError(null);
                setSaveFeedback(null);
              }}
              placeholder="np. Wstępny, Poprawiony"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4">
            <label
              htmlFor={`${idPrefix}-version-note`}
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Notatka (opcjonalnie)
            </label>
            <input
              id={`${idPrefix}-version-note`}
              type="text"
              value={versionNote}
              maxLength={140}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="np. Korekta wywozu gruzu po wizji lokalnej"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Szybki wybór tagu wersji">
            <span className="text-[11px] text-slate-500 mr-1">Szybkie tagi:</span>
            {PRESET_VERSION_TAGS.map((tag) => {
              const active = versionTag.trim().toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleSelectPresetTag(tag)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {saving
                ? 'Zapisywanie...'
                : `Zapisz wersję v${nextVersionForInput}`}
            </span>
          </button>
        </div>

        {/* Live preview against latest saved version */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-slate-900">
              Nowy zrzut: v{nextVersionForInput}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{activeItems.length} poz.</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {formatPLN(activeNetTotal)} netto
            </span>
          </div>

          {activeDelta ? (
            <div className="text-[11px] text-slate-600 font-mono tabular-nums">
              Względem v{activeDelta.referenceVersionNumber} ({activeDelta.referenceVersionTag}):{' '}
              <span
                className={`font-semibold ${
                  activeDelta.netDeltaPln > 0
                    ? 'text-amber-800'
                    : activeDelta.netDeltaPln < 0
                    ? 'text-emerald-700'
                    : 'text-slate-700'
                }`}
              >
                {activeDelta.hasChanges
                  ? `${formatSignedPLN(activeDelta.netDeltaPln)}${
                      activeDelta.netDeltaPct !== null
                        ? ` (${activeDelta.netDeltaPct > 0 ? '+' : ''}${formatNumber(
                            activeDelta.netDeltaPct,
                            1
                          )}%)`
                        : ''
                    } · ${activeDelta.changedItemsCount} zm. poz.`
                  : 'brak zmian w pozycjach i kwocie'}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">
              Pierwsza wersja bazowa tego projektu w IndexedDB
            </div>
          )}
        </div>

        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {saveFeedback && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700" />
            <span>{saveFeedback}</span>
          </div>
        )}
      </form>

      {/* Filter bar between active project timeline vs all projects */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setScopeFilter('current')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              scopeFilter === 'current'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Ten projekt ({currentProjectEntries.length})
          </button>
          <button
            type="button"
            onClick={() => setScopeFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              scopeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Wszystkie projekty ({savedEstimates.length})
          </button>
        </div>

        <div className="text-[11px] text-slate-500">
          Wersje przechowywane lokalnie w IndexedDB — pełna dostępność offline
        </div>
      </div>

      {/* Version Timeline Grouped by Project */}
      {visibleGroups.length === 0 ? (
        <div className="py-8 px-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl space-y-2">
          <History className="w-5 h-5 text-slate-400 mx-auto" />
          <p className="font-medium text-slate-700">
            {scopeFilter === 'current'
              ? `Brak zapisanych wersji dla projektu „${projectSaveName || activeProjectName}”.`
              : 'Brak zapisanych wersji kosztorysów w lokalnym archiwum IndexedDB.'}
          </p>
          <p>
            Wybierz tag (np. Wstępny, Poprawiony, Ostateczny) i kliknij przycisk zapisu powyżej, aby utworzyć punkt odniesienia.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <div
              key={group.projectKey}
              className="border border-slate-200 rounded-xl overflow-hidden bg-white"
            >
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {group.projectName}
                  </div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="font-mono tabular-nums">
                      {group.versionCount}{' '}
                      {group.versionCount === 1
                        ? 'wersja'
                        : group.versionCount < 5
                        ? 'wersje'
                        : 'wersji'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Najnowsza: v{group.latestVersionNumber} · {group.latestVersionTag}
                    </span>
                    {group.totalDeltaFromFirstPln !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Zmiana od v1: {formatSignedPLN(group.totalDeltaFromFirstPln)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums text-xs font-semibold text-slate-900 whitespace-nowrap">
                  {formatPLN(group.latestNetTotal)}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-white">
                      <th className="py-2 px-4">Wersja i tag</th>
                      <th className="py-2 px-3">Zmiana względem poprzedniej</th>
                      <th className="py-2 px-3 text-right">Pozycji</th>
                      <th className="py-2 px-3 text-right">Wartość netto</th>
                      <th className="py-2 px-3">Data zapisu</th>
                      <th className="py-2 px-4 text-right">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {group.versions.map((entry) => {
                      const { snapshot, versionNumber, versionTag: tag } = entry;
                      const tagLower = tag.toLowerCase();
                      const tagColorClass =
                        tagLower.includes('ostatecz')
                          ? 'text-emerald-800'
                          : tagLower.includes('popraw')
                          ? 'text-amber-800'
                          : 'text-slate-800';

                      return (
                        <tr key={snapshot.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono tabular-nums font-semibold text-slate-900">
                                v{versionNumber}
                              </span>
                              <span aria-hidden="true" className="text-slate-400">
                                ·
                              </span>
                              <span className={`font-semibold ${tagColorClass}`}>
                                {tag}
                              </span>
                            </div>
                            {snapshot.versionNote && (
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {snapshot.versionNote}
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3 font-mono tabular-nums text-[11px]">
                            {entry.netDeltaPln === null ? (
                              <span className="text-slate-500 font-sans">Wersja bazowa</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center gap-0.5 font-semibold ${
                                    entry.netDeltaPln > 0
                                      ? 'text-amber-800'
                                      : entry.netDeltaPln < 0
                                      ? 'text-emerald-700'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {entry.netDeltaPln > 0 ? (
                                    <ArrowUpRight className="w-3 h-3" />
                                  ) : entry.netDeltaPln < 0 ? (
                                    <ArrowDownRight className="w-3 h-3" />
                                  ) : (
                                    <Minus className="w-3 h-3" />
                                  )}
                                  {formatSignedPLN(entry.netDeltaPln)}
                                </span>
                                {entry.netDeltaPct !== null && (
                                  <span className="text-slate-500">
                                    ({entry.netDeltaPct > 0 ? '+' : ''}
                                    {formatNumber(entry.netDeltaPct, 1)}%)
                                  </span>
                                )}
                                {entry.changedItemsCount > 0 && (
                                  <span className="text-slate-500 font-sans">
                                    · {entry.changedItemsCount} zm. poz.
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {snapshot.itemCount}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatPLN(snapshot.netTotal)}
                          </td>

                          <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                            {formatDateTimePl(snapshot.updatedAt)}
                          </td>

                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                aria-label={`Wczytaj wersję v${versionNumber} (${tag}) projektu "${snapshot.name}"`}
                                onClick={() => onLoadVersion(snapshot)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors"
                              >
                                <FolderOpen className="w-3 h-3" />
                                <span>Wczytaj</span>
                              </button>
                              <button
                                type="button"
                                aria-label={`Usuń wersję v${versionNumber} (${tag}) projektu "${snapshot.name}"`}
                                onClick={() =>
                                  setPendingDeleteSnapshot({
                                    id: snapshot.id,
                                    label: `v${versionNumber} (${tag}) projektu „${snapshot.name}”`,
                                  })
                                }
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingDeleteSnapshot !== null}
        title="Usuń zapisaną wersję kosztorysu?"
        description={
          pendingDeleteSnapshot
            ? `Wersja ${pendingDeleteSnapshot.label} zostanie usunięta z lokalnej listy historii. Aktywny kosztorys pozostanie bez zmian.`
            : ''
        }
        confirmLabel="Usuń wersję"
        tone="danger"
        onCancel={() => setPendingDeleteSnapshot(null)}
        onConfirm={() => {
          const targetId = pendingDeleteSnapshot?.id;
          setPendingDeleteSnapshot(null);
          if (targetId) {
            void onDeleteVersion(targetId);
          }
        }}
      />
    </div>
  );
}
