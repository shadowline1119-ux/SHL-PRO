import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  FolderCog,
  FolderOpen,
  HardDrive,
  History,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type {
  ChangeHistoryRecord,
  CloudConflictResolutionChoice,
  CloudSyncDiagnosticReport,
  CompanyProfile,
  LocalBackupEntry,
  LocalStorageStatus,
  LocalSubfolderKey,
  SavedProjectEstimate,
  SyncConflictItem,
} from '../types/estimator';
import type { CloudUserSession } from '../services/cloudSyncService';
import { formatPLN } from '../utils/calculations';

interface SettingsStoragePanelProps {
  isOnline: boolean;
  storageStatus: LocalStorageStatus | null;
  backups: LocalBackupEntry[];
  history: ChangeHistoryRecord[];
  savedEstimates: SavedProjectEstimate[];
  companyProfile: CompanyProfile;
  cloudUser: CloudUserSession | null;
  authBusy: boolean;
  authError: string | null;
  authInfo: string | null;
  isSyncingCloud: boolean;
  syncStatusMessage: string | null;
  syncConflicts: SyncConflictItem[];
  diagnosticReport: CloudSyncDiagnosticReport | null;
  onChangeCompanyProfile: (next: CompanyProfile) => void;
  onOpenDataFolder: (subfolder?: LocalSubfolderKey) => Promise<void>;
  onChangeDocumentsLocation: (newBaseDir: string, moveExistingFiles: boolean) => Promise<void>;
  onCreateBackup: (label?: string) => Promise<void>;
  onRestoreBackup: (backupId: string) => Promise<void>;
  onLoadEstimateVersion: (project: SavedProjectEstimate) => void;
  onSyncCloudNow: () => Promise<void>;
  onCheckSyncStatus: () => Promise<void>;
  onResolveConflict: (
    conflict: SyncConflictItem,
    choice: CloudConflictResolutionChoice
  ) => Promise<void>;
  onToggleAutoBackup: (enabled: boolean, intervalMinutes: number) => void;
  onGoogleLogin: () => Promise<void>;
  onEmailPasswordLogin: (email: string, password: string, mode: 'login' | 'register') => Promise<void>;
  onSendEmailLink: (email: string) => Promise<void>;
  onResendVerification: () => Promise<void>;
  onRefreshVerification: () => Promise<void>;
  onCloudSignOut: () => Promise<void>;
  onPurgeUserData: (confirmPhrase: string) => Promise<void>;
  onPickFolderNative: () => Promise<string | null>;
}

function formatDateTimePl(iso: string | null | undefined): string {
  if (!iso) return 'Brak';
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SettingsStoragePanel({
  isOnline,
  storageStatus,
  backups,
  history,
  savedEstimates,
  companyProfile,
  cloudUser,
  authBusy,
  authError,
  authInfo,
  isSyncingCloud,
  syncStatusMessage,
  syncConflicts,
  diagnosticReport,
  onChangeCompanyProfile,
  onOpenDataFolder,
  onChangeDocumentsLocation,
  onCreateBackup,
  onRestoreBackup,
  onLoadEstimateVersion,
  onSyncCloudNow,
  onCheckSyncStatus,
  onResolveConflict,
  onToggleAutoBackup,
  onGoogleLogin,
  onEmailPasswordLogin,
  onSendEmailLink,
  onResendVerification,
  onRefreshVerification,
  onCloudSignOut,
  onPurgeUserData,
  onPickFolderNative,
}: SettingsStoragePanelProps) {
  const backupsSectionRef = useRef<HTMLElement | null>(null);

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Zmiana lokalizacji dokumentów
  const [showChangeDirDialog, setShowChangeDirDialog] = useState(false);
  const [newDocsBaseDir, setNewDocsBaseDir] = useState(storageStatus?.documentsBaseDir || '');
  const [moveExistingOnRelocate, setMoveExistingOnRelocate] = useState(true);

  // Przywracanie kopii zapasowej (lista lub wybór konkretnej kopii)
  const [selectedBackupId, setSelectedBackupId] = useState<string>('');
  const [customBackupLabel, setCustomBackupLabel] = useState('');

  // Logowanie e-mail
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [emailMode, setEmailMode] = useState<'login' | 'register' | 'link'>('login');

  // Wyraźne potwierdzenie usunięcia danych użytkownika
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [purgeConfirmPhrase, setPurgeConfirmPhrase] = useState('');

  const runAction = async (key: string, fn: () => Promise<void>, successText?: string) => {
    setActionError(null);
    setActionNotice(null);
    setBusyAction(key);
    try {
      await fn();
      if (successText) setActionNotice(successText);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Wystąpił błąd operacji.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenFolderClick = () =>
    runAction('open_folder', async () => {
      await onOpenDataFolder();
    }, storageStatus ? `Lokalizacja folderu danych: ${storageStatus.documentsRootPath}` : undefined);

  const handlePickNativeOrOpenLocationModal = async () => {
    setActionError(null);
    const nativePicked = await onPickFolderNative();
    if (nativePicked) {
      setNewDocsBaseDir(nativePicked);
    } else if (storageStatus?.documentsBaseDir && !newDocsBaseDir) {
      setNewDocsBaseDir(storageStatus.documentsBaseDir);
    }
    setShowChangeDirDialog(true);
  };

  const handleConfirmChangeLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('change_loc', async () => {
      await onChangeDocumentsLocation(newDocsBaseDir, moveExistingOnRelocate);
      setShowChangeDirDialog(false);
    }, 'Zmieniono lokalizację folderu dokumentów SHL BASE.');
  };

  const handleCreateManualBackup = async () => {
    await runAction('create_backup', async () => {
      await onCreateBackup(customBackupLabel.trim() || undefined);
      setCustomBackupLabel('');
    }, 'Utworzono nową kopię zapasową w folderze „Kopie zapasowe”.');
  };

  const handleRestoreClick = async () => {
    if (backups.length === 0) {
      setActionError('Brak zapisanych kopii zapasowych do przywrócenia. Najpierw utwórz kopię zapasową.');
      return;
    }
    const targetId = selectedBackupId || backups[0].id;
    backupsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    await runAction('restore_backup', async () => {
      await onRestoreBackup(targetId);
    }, 'Przywrócono kosztorysy i ustawienia z wybranej kopii zapasowej.');
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailMode === 'link') {
      await onSendEmailLink(emailInput);
    } else {
      await onEmailPasswordLogin(emailInput, passwordInput, emailMode);
      setPasswordInput('');
    }
  };

  const handleConfirmPurge = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction('purge', async () => {
      await onPurgeUserData(purgeConfirmPhrase);
      setPurgeConfirmPhrase('');
      setShowPurgeDialog(false);
    }, 'Lokalne dokumenty użytkownika zostały usunięte zgodnie z potwierdzeniem.');
  };

  return (
    <div className="space-y-6">
      {/* KPI summary */}
      <section
        aria-label="Podsumowanie lokalnej pamięci danych SHL BASE"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Folder Dokumenty</span>
            <FolderOpen className="w-4 h-4 text-amber-700" />
          </div>
          <div className="mt-1.5 font-display text-base font-semibold text-slate-900 truncate">
            {storageStatus?.appFolderName || 'SHL BASE'}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-600 truncate" title={storageStatus?.documentsRootPath}>
            {storageStatus?.documentsRootPath || 'Inicjalizacja folderu...'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Baza SQLite (AppData)</span>
            <Database className="w-4 h-4 text-slate-700" />
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-base font-semibold text-slate-900">
            {storageStatus ? `${storageStatus.sqliteJournalMode} · ${storageStatus.sqliteSynchronous}` : 'WAL · FULL'}
          </div>
          <div className="mt-1 text-[11px] font-mono text-slate-600 truncate" title={storageStatus?.sqliteDbPath}>
            {storageStatus?.sqliteDbPath || 'AppData/SHL BASE'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Kopie zapasowe i projekty</span>
            <HardDrive className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="mt-1.5 font-mono tabular-nums text-base font-semibold text-slate-900 whitespace-nowrap">
            {storageStatus?.backupCount ?? backups.length} kopii · {storageStatus?.projectCount ?? savedEstimates.length} proj.
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Auto-kopie: {storageStatus?.autoBackupEnabled ? `co ${storageStatus.autoBackupIntervalMinutes} min` : 'wyłączone'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Chmura i bezpieczeństwo</span>
            {isOnline && cloudUser ? (
              <Cloud className="w-4 h-4 text-emerald-700" />
            ) : (
              <CloudOff className="w-4 h-4 text-amber-700" />
            )}
          </div>
          <div className="mt-1.5 font-display text-base font-semibold text-slate-900 truncate">
            {cloudUser ? cloudUser.email : 'Praca wyłącznie lokalna'}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Oczekujące sync: {storageStatus?.pendingSyncCount ?? 0} · Konflikty: {syncConflicts.length}
          </div>
        </div>
      </section>

      {/* Main Action Toolbar with all 6 required Settings buttons */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Zarządzanie folderem danych, kopiami zapasowymi i synchronizacją
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Wszystkie kosztorysy, oferty PDF i arkusze Excel są automatycznie zapisywane na dysku z użyciem bezpiecznych zapisów atomowych oraz lokalnej bazy SQLite w trybie WAL.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleOpenFolderClick}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Otwórz folder danych</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handlePickNativeOrOpenLocationModal()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <FolderCog className="w-3.5 h-3.5" />
            <span>Zmień lokalizację dokumentów</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleCreateManualBackup()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {busyAction === 'create_backup' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Utwórz kopię zapasową</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null || backups.length === 0}
            onClick={() => void handleRestoreClick()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Przywróć kopię zapasową</span>
          </button>

          <button
            type="button"
            disabled={isSyncingCloud}
            onClick={() => void onSyncCloudNow()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {isSyncingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Synchronizuj teraz</span>
          </button>

          <button
            type="button"
            disabled={isSyncingCloud}
            onClick={() => void onCheckSyncStatus()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sprawdź stan synchronizacji</span>
          </button>
        </div>

        {(actionNotice || actionError || syncStatusMessage) && (
          <div className="space-y-2">
            {actionNotice && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                <span>{actionNotice}</span>
              </div>
            )}
            {syncStatusMessage && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-950"
              >
                <Cloud className="w-4 h-4 text-sky-700 mt-0.5 shrink-0" />
                <span>{syncStatusMessage}</span>
              </div>
            )}
            {actionError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-900"
              >
                <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}
          </div>
        )}

        {diagnosticReport && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">
                Raport diagnostyczny stanu synchronizacji
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                Sprawdzono: {formatDateTimePl(diagnosticReport.checkedAt)}
              </span>
            </div>
            <p className="text-slate-700">{diagnosticReport.statusMessage}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-600 tabular-nums">
              <span>Sieć: {diagnosticReport.networkOnline ? 'Online' : 'Offline'}</span>
              <span>·</span>
              <span>Chmura: {diagnosticReport.firebaseReachable ? 'Dostępna' : 'Niedostępna'}</span>
              <span>·</span>
              <span>Konto: {diagnosticReport.authenticated ? diagnosticReport.userEmail : 'Niezalogowane'}</span>
              <span>·</span>
              <span>Oczekujące zmiany: {diagnosticReport.pendingLocalCount}</span>
              <span>·</span>
              <span>Konflikty: {diagnosticReport.conflictCount}</span>
            </div>
          </div>
        )}

        {showChangeDirDialog && (
          <form
            onSubmit={handleConfirmChangeLocation}
            className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Zmiana lokalizacji folderu dokumentów SHL BASE
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label htmlFor="new-docs-base-dir" className="block text-[11px] font-medium text-slate-700 mb-1">
                  Katalog nadrzędny (wewnątrz powstanie folder „SHL BASE”)
                </label>
                <input
                  id="new-docs-base-dir"
                  type="text"
                  required
                  value={newDocsBaseDir}
                  onChange={(e) => setNewDocsBaseDir(e.target.value)}
                  placeholder="np. C:\Users\TwojeKonto\Documents lub D:\Kosztorysy"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 pb-1.5">
                <input
                  type="checkbox"
                  checked={moveExistingOnRelocate}
                  onChange={(e) => setMoveExistingOnRelocate(e.target.checked)}
                  className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                />
                <span>Przenieś istniejące pliki</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowChangeDirDialog(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={busyAction === 'change_loc'}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg"
              >
                Zapisz nową lokalizację
              </button>
            </div>
          </form>
        )}

        {/* 6 Required Subfolders Status Grid */}
        <div className="space-y-2.5 pt-2">
          <div className="text-xs font-semibold text-slate-700">
            Struktura podkatalogów w folderze Dokumenty (tworzona automatycznie przy pierwszym uruchomieniu)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(storageStatus?.subfolders || []).map((sub) => (
              <div
                key={sub.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        sub.exists ? 'bg-emerald-600' : 'bg-amber-500'
                      }`}
                    />
                    <span className="truncate">{sub.name}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5" title={sub.path}>
                    {sub.fileCount} plik(ów) · {sub.path}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onOpenDataFolder(sub.name)}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  Otwórz
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cloud Sync Conflict Resolution Queue (if any detected) */}
      {syncConflicts.length > 0 && (
        <section className="bg-amber-50 border border-amber-300 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-display text-base font-semibold text-amber-950">
                Wykryto konflikty wersji między bazą lokalną a chmurą ({syncConflicts.length})
              </h2>
              <p className="text-xs text-amber-900 mt-0.5">
                Nowsze dane nie zostały automatycznie nadpisane. Wybierz, którą wersję zachować — najbezpieczniejsza opcja zachowuje oba warianty jako osobne wersje projektu.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {syncConflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="bg-white border border-amber-200 rounded-lg p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-900">{conflict.title}</div>
                  <span className="text-[11px] font-mono text-slate-500">ID: {conflict.id}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-1">
                    <div className="font-semibold text-slate-900">Wersja lokalna (SQLite)</div>
                    <div className="text-slate-600">Zmieniono: {formatDateTimePl(conflict.localUpdatedAt)}</div>
                    <div className="font-mono tabular-nums text-slate-800">
                      Rewizja {conflict.localRevision} · {conflict.localItemCount ?? 0} poz. · {formatPLN(conflict.localNetTotal ?? 0)}
                    </div>
                  </div>

                  <div className="rounded border border-sky-200 bg-sky-50/70 p-3 space-y-1">
                    <div className="font-semibold text-sky-950">Wersja w chmurze (Firestore)</div>
                    <div className="text-sky-900">Zmieniono: {formatDateTimePl(conflict.cloudUpdatedAt)}</div>
                    <div className="font-mono tabular-nums text-sky-950">
                      Rewizja {conflict.cloudRevision} · {conflict.cloudItemCount ?? 0} poz. · {formatPLN(conflict.cloudNetTotal ?? 0)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onResolveConflict(conflict, 'keep_both')}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg whitespace-nowrap"
                  >
                    Zachowaj obie jako osobne wersje (zalecane)
                  </button>
                  <button
                    type="button"
                    onClick={() => void onResolveConflict(conflict, 'keep_local')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                  >
                    Nadpisz chmurę moją wersją lokalną
                  </button>
                  <button
                    type="button"
                    onClick={() => void onResolveConflict(conflict, 'accept_cloud')}
                    className="px-3 py-1.5 text-xs font-medium text-sky-900 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg whitespace-nowrap"
                  >
                    Pobierz wersję z chmury (po kopii bezpieczeństwa)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Two-Column Grid: Cloud Account Auth & Company Profile ("Dane firmy") */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Cloud Account Section */}
        <section className="xl:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Konto chmurowe (Google lub dowolny adres e-mail)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Sesja logowania jest zarządzana wyłącznie przez zaszyfrowany mechanizm Firebase Auth — program nigdy nie zapisuje haseł ani tokenów w plikach tekstowych ani bazie SQLite.
            </p>
          </div>

          {cloudUser ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900">{cloudUser.displayName}</div>
                  <span
                    className={`font-semibold ${
                      cloudUser.emailVerified ? 'text-emerald-700' : 'text-amber-800'
                    }`}
                  >
                    {cloudUser.emailVerified ? 'E-mail zweryfikowany' : 'Oczekuje weryfikacji e-mail'}
                  </span>
                </div>
                <div className="font-mono text-slate-700">{cloudUser.email}</div>
                <div className="text-[11px] text-slate-500">
                  Przestrzeń chmurowa odizolowana wyłącznie dla Twojego konta UID.
                </div>
              </div>

              {!cloudUser.emailVerified && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-2">
                  <p>
                    Wysłaliśmy link weryfikacyjny na Twój adres e-mail. Kliknij link w skrzynce odbiorczej, a następnie odśwież status poniżej, aby włączyć zapis w chmurze.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={authBusy}
                      onClick={() => void onRefreshVerification()}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg"
                    >
                      Sprawdź potwierdzenie e-mail
                    </button>
                    <button
                      type="button"
                      disabled={authBusy}
                      onClick={() => void onResendVerification()}
                      className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                    >
                      Wyślij link ponownie
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={isSyncingCloud}
                  onClick={() => void onSyncCloudNow()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Synchronizuj teraz</span>
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void onCloudSignOut()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Wyloguj</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                disabled={authBusy || !isOnline}
                onClick={() => void onGoogleLogin()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                {authBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                <span>Zaloguj przez konto Google</span>
              </button>

              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <div className="flex-1 h-px bg-slate-200" />
                <span>lub zaloguj dowolnym adresem e-mail</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setEmailMode('login')}
                  className={`px-3 py-1 rounded-lg font-medium ${
                    emailMode === 'login' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Logowanie hasłem
                </button>
                <button
                  type="button"
                  onClick={() => setEmailMode('register')}
                  className={`px-3 py-1 rounded-lg font-medium ${
                    emailMode === 'register' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Rejestracja e-mail
                </button>
                <button
                  type="button"
                  onClick={() => setEmailMode('link')}
                  className={`px-3 py-1 rounded-lg font-medium ${
                    emailMode === 'link' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Link logowania bez hasła
                </button>
              </div>

              <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
                <div>
                  <label htmlFor="cloud-auth-email" className="block text-[11px] font-medium text-slate-700 mb-1">
                    Adres e-mail
                  </label>
                  <input
                    id="cloud-auth-email"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="np. biuro@twojafirma.pl"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>

                {emailMode !== 'link' && (
                  <div>
                    <label htmlFor="cloud-auth-pass" className="block text-[11px] font-medium text-slate-700 mb-1">
                      Hasło (niezapisywane na dysku)
                    </label>
                    <input
                      id="cloud-auth-pass"
                      type="password"
                      required
                      minLength={6}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Minimum 6 znaków"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authBusy || !isOnline}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-50 rounded-lg transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>
                    {emailMode === 'login'
                      ? 'Zaloguj adresem e-mail'
                      : emailMode === 'register'
                      ? 'Utwórz konto e-mail'
                      : 'Wyślij jednorazowy link logowania'}
                  </span>
                </button>
              </form>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
            >
              <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authInfo && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
              <span>{authInfo}</span>
            </div>
          )}
        </section>

        {/* Company Profile ("Dane firmy") */}
        <section className="xl:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Dane firmy (zapis w „Dane firmy” + oferty PDF + chmura)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Każda edycja zapisuje się automatycznie w SQLite i w pliku <span className="font-mono">Dane firmy/dane_firmy.json</span> oraz zasila nagłówki generowanych ofert PDF.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="comp-name" className="block text-[11px] font-medium text-slate-700 mb-1">
                Nazwa firmy wykonawczej
              </label>
              <input
                id="comp-name"
                type="text"
                value={companyProfile.companyName}
                onChange={(e) =>
                  onChangeCompanyProfile({ ...companyProfile, companyName: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="comp-nip" className="block text-[11px] font-medium text-slate-700 mb-1">
                  NIP
                </label>
                <input
                  id="comp-nip"
                  type="text"
                  value={companyProfile.companyNip}
                  onChange={(e) =>
                    onChangeCompanyProfile({ ...companyProfile, companyNip: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="comp-phone" className="block text-[11px] font-medium text-slate-700 mb-1">
                  Telefon kontaktowy
                </label>
                <input
                  id="comp-phone"
                  type="text"
                  value={companyProfile.companyPhone}
                  onChange={(e) =>
                    onChangeCompanyProfile({ ...companyProfile, companyPhone: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="comp-addr" className="block text-[11px] font-medium text-slate-700 mb-1">
                  Adres siedziby
                </label>
                <input
                  id="comp-addr"
                  type="text"
                  value={companyProfile.companyAddress}
                  onChange={(e) =>
                    onChangeCompanyProfile({ ...companyProfile, companyAddress: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="comp-email" className="block text-[11px] font-medium text-slate-700 mb-1">
                  E-mail firmowy
                </label>
                <input
                  id="comp-email"
                  type="email"
                  value={companyProfile.companyEmail}
                  onChange={(e) =>
                    onChangeCompanyProfile({ ...companyProfile, companyEmail: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Automatic Backups & Estimate Version Restoration */}
      <section ref={backupsSectionRef} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Automatyczne kopie zapasowe (Kopie zapasowe) i przywracanie poprzednich wersji
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Każda kopia zawiera kompletny zrzut JSON oraz bezpieczną migawkę bazy SQLite. Przed każdym przywróceniem automatycznie tworzona jest kopia zabezpieczająca bieżący stan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-2 font-medium text-slate-700">
              <input
                type="checkbox"
                checked={storageStatus?.autoBackupEnabled ?? true}
                onChange={(e) =>
                  onToggleAutoBackup(
                    e.target.checked,
                    storageStatus?.autoBackupIntervalMinutes ?? 15
                  )
                }
                className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
              />
              <span>Auto-kopia zapasowa</span>
            </label>

            <select
              aria-label="Częstotliwość automatycznej kopii zapasowej"
              value={storageStatus?.autoBackupIntervalMinutes ?? 15}
              onChange={(e) =>
                onToggleAutoBackup(
                  storageStatus?.autoBackupEnabled ?? true,
                  Number(e.target.value) || 15
                )
              }
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            >
              <option value={5}>Co 5 minut</option>
              <option value={15}>Co 15 minut</option>
              <option value={30}>Co 30 minut</option>
              <option value={60}>Co 60 minut</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={customBackupLabel}
            onChange={(e) => setCustomBackupLabel(e.target.value)}
            placeholder="Opcjonalna etykieta kopii (np. Przed wysłaniem oferty)"
            className="flex-1 min-w-[240px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
          />
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleCreateManualBackup()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Utwórz kopię zapasową teraz</span>
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            Brak zapisanych kopii w folderze „Kopie zapasowe”. Kliknij „Utwórz kopię zapasową”, aby wykonać pierwszy zrzut SQLite + JSON.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-3">Etykieta / Typ</th>
                  <th className="py-2.5 px-3">Data utworzenia</th>
                  <th className="py-2.5 px-3">Zawartość</th>
                  <th className="py-2.5 px-3 text-right">Rozmiar</th>
                  <th className="py-2.5 px-3 text-right">Akcja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {backups.map((b) => {
                  const isSel = selectedBackupId === b.id;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedBackupId(b.id)}
                      className={`cursor-pointer hover:bg-slate-50 ${isSel ? 'bg-amber-50/70' : ''}`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{b.label}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {b.backupType === 'auto'
                            ? 'Automatyczna'
                            : b.backupType === 'pre_restore'
                            ? 'Zabezpieczająca'
                            : b.backupType === 'pre_sync'
                            ? 'Przed synchronizacją'
                            : 'Ręczna'}{' '}
                          · {b.jsonFilename}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {formatDateTimePl(b.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {b.projectCount} proj. · {b.itemCount} poz.
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatBytes(b.sizeBytes)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBackupId(b.id);
                            void runAction(
                              `restore_${b.id}`,
                              async () => {
                                await onRestoreBackup(b.id);
                              },
                              `Przywrócono dane z kopii „${b.label}”.`
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded transition-colors whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Przywróć</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {savedEstimates.length > 0 && (
          <div className="pt-2 space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Szybkie przywracanie poprzednich wersji kosztorysów (SQLite + chmura)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {savedEstimates.slice(0, 6).map((est) => (
                <div
                  key={est.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {est.name} · v{est.versionNumber ?? 1} ({est.versionTag || 'Wstępny'})
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {formatPLN(est.netTotal)} · {formatDateTimePl(est.updatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLoadEstimateVersion(est)}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap shrink-0"
                  >
                    Wczytaj
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="pt-2 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>Historia zmian lokalnych w bazie SQLite</span>
            </div>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
              {history.slice(0, 12).map((h) => (
                <div key={h.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-slate-700 truncate">{h.summary}</span>
                  <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                    {formatDateTimePl(h.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Desktop & Offline Installation Guide */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <HardDrive className="w-4 h-4 text-amber-700" />
          <span>Instalacja na komputerze i praca offline (Windows / macOS)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
            <div className="font-semibold text-slate-900">1. Aplikacja na pulpit (PWA Offline)</div>
            <p className="leading-relaxed">
              W Google Chrome lub Microsoft Edge kliknij przycisk <span className="font-medium text-slate-800">„Zainstaluj offline”</span> na górnym pasku (lub ikonę instalacji na pasku adresu), aby uruchamiać program z pulpitu także bez internetu.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
            <div className="font-semibold text-slate-900">2. Tryb desktopowy z folderem Dokumenty</div>
            <p className="leading-relaxed">
              W środowisku lokalnym (Tauri / Node SQLite) pliki automatycznie zapisują się w <span className="font-mono text-slate-800">Dokumenty\SHL BASE</span> oraz w bazie SQLite w <span className="font-mono text-slate-800">AppData</span>.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
            <div className="font-semibold text-slate-900">3. Eksporty PDF i Excel bez chmury</div>
            <p className="leading-relaxed">
              Pliki PDF ofert i przedmiary <span className="font-mono text-slate-800">.xlsx</span> generują się w 100% lokalnie w przeglądarce lub na dysku — bez wysyłania danych do zewnętrznego serwera.
            </p>
          </div>
        </div>
      </section>

      {/* Security & Uninstall Protection */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Bezpieczeństwo danych i ochrona przed usunięciem przy deinstalacji</span>
            </div>
            <p className="text-xs text-slate-600">
              Katalogi danych (<span className="font-mono">0700</span>) oraz baza SQLite (<span className="font-mono">0600</span> / Windows ACL bieżącego użytkownika) są odizolowane od pozostałych kont systemowych. Odinstalowanie programu nigdy nie usuwa automatycznie folderu <span className="font-semibold">SHL BASE</span> w Dokumentach użytkownika.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowPurgeDialog((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Usuń lokalne dane użytkownika...</span>
          </button>
        </div>

        {showPurgeDialog && (
          <form
            onSubmit={handleConfirmPurge}
            className="rounded-xl border border-red-300 bg-red-50/70 p-4 space-y-3"
          >
            <div className="text-xs font-semibold text-red-900">
              Wymagane osobne, wyraźne potwierdzenie trwałego usunięcia folderu dokumentów
            </div>
            <p className="text-xs text-red-800">
              Ta operacja nieodwracalnie usunie pliki w folderze „SHL BASE” oraz lokalną historię projektów w SQLite. Aby potwierdzić, wpisz dokładnie <span className="font-mono font-bold">USUŃ DANE</span>:
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                required
                value={purgeConfirmPhrase}
                onChange={(e) => setPurgeConfirmPhrase(e.target.value)}
                placeholder="Wpisz: USUŃ DANE"
                className="flex-1 min-w-[220px] rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-red-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setShowPurgeDialog(false);
                  setPurgeConfirmPhrase('');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Anuluj
              </button>
              <button
                type="submit"
                disabled={purgeConfirmPhrase.trim() !== 'USUŃ DANE' || busyAction === 'purge'}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg"
              >
                Potwierdzam i usuwam dane
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
