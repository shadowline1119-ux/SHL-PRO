import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType, testConnection } from '../firebase';
import type {
  CloudConflictResolutionChoice,
  CloudSyncDiagnosticReport,
  CompanyProfile,
  EstimateLineItem,
  EstimateSettings,
  SavedProjectEstimate,
  SyncConflictItem,
} from '../types/estimator';
import {
  buildConflictItem,
  detectEstimateSyncAction,
  resolveEstimateConflict,
  sanitizeFirestoreId,
} from './cloudSyncConflict';

export interface CloudUserSession {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  providerId: string;
}

export interface BidirectionalSyncResult {
  status: 'synced' | 'offline' | 'unauthenticated' | 'email_unverified' | 'conflicts' | 'error';
  pushedCount: number;
  pulledCount: number;
  conflicts: SyncConflictItem[];
  mergedEstimates: SavedProjectEstimate[];
  pulledCompanyProfile: CompanyProfile | null;
  message: string;
}

const EMAIL_LINK_STORAGE_KEY = 'shadowline_pending_email_link';

function mapFirebaseUser(user: User | null): CloudUserSession | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Użytkownik',
    emailVerified: Boolean(user.emailVerified),
    providerId: user.providerData?.[0]?.providerId || 'password',
  };
}

export function subscribeCloudAuth(cb: (user: CloudUserSession | null) => void): () => void {
  return onAuthStateChanged(auth, (u) => {
    cb(mapFirebaseUser(u));
  });
}

export async function signInWithGoogleCloud(): Promise<CloudUserSession> {
  const cred = await signInWithPopup(auth, googleProvider);
  const mapped = mapFirebaseUser(cred.user);
  if (!mapped) throw new Error('Nie udało się odczytać danych konta Google.');
  return mapped;
}

export async function signInWithEmailPasswordCloud(
  email: string,
  password: string
): Promise<CloudUserSession> {
  const cleanEmail = email.trim();
  const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
  return mapFirebaseUser(cred.user)!;
}

export async function registerWithEmailPasswordCloud(
  email: string,
  password: string
): Promise<CloudUserSession> {
  const cleanEmail = email.trim();
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  try {
    await sendEmailVerification(cred.user);
  } catch {
    // Ignore verification mail throttling warnings
  }
  return mapFirebaseUser(cred.user)!;
}

export async function sendPasswordlessEmailLinkCloud(email: string): Promise<void> {
  const cleanEmail = email.trim();
  if (!cleanEmail.includes('@')) {
    throw new Error('Podaj prawidłowy adres e-mail.');
  }
  const actionCodeSettings = {
    url: window.location.href.split('#')[0],
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(auth, cleanEmail, actionCodeSettings);
  try {
    window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, cleanEmail);
  } catch {
    // Ignore storage restriction
  }
}

export async function completeEmailLinkSignInIfPresent(): Promise<CloudUserSession | null> {
  if (typeof window === 'undefined') return null;
  if (!isSignInWithEmailLink(auth, window.location.href)) return null;

  let storedEmail = '';
  try {
    storedEmail = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY) || '';
  } catch {
    storedEmail = '';
  }
  if (!storedEmail) return null;

  const cred = await signInWithEmailLink(auth, storedEmail, window.location.href);
  try {
    window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch {
    // Ignore history state errors
  }
  return mapFirebaseUser(cred.user);
}

export async function resendCloudEmailVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Najpierw zaloguj się na konto.');
  await sendEmailVerification(user);
}

export async function refreshCloudUserVerification(): Promise<CloudUserSession | null> {
  const user = auth.currentUser;
  if (!user) return null;
  await reload(user);
  return mapFirebaseUser(auth.currentUser);
}

export async function signOutCloud(): Promise<void> {
  await signOut(auth);
}

function formatFriendlyAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const msg = err instanceof Error ? err.message : String(err ?? '');

  if (code === 'auth/operation-not-allowed') {
    return 'Logowanie e-mail / hasłem nie jest jeszcze włączone w konsoli Firebase Authentication dla tego projektu. Włącz metodę „Email/Password” w Firebase Console > Authentication > Sign-in method lub zaloguj się kontem Google.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Nieprawidłowy adres e-mail lub hasło.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Konto dla tego adresu e-mail już istnieje — przełącz na logowanie.';
  }
  if (code === 'auth/weak-password') {
    return 'Hasło musi mieć co najmniej 6 znaków.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Zamknięto okno logowania Google przed ukończeniem autoryzacji.';
  }
  return msg || 'Wystąpił błąd uwierzytelniania.';
}

export { formatFriendlyAuthError };

async function ensureUserProfileDoc(user: User, documentsLabel: string): Promise<void> {
  const profilePath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email || 'Kosztorysant',
        activeDocumentsLabel: documentsLabel.slice(0, 260),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        ref,
        {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email || 'Kosztorysant',
          activeDocumentsLabel: documentsLabel.slice(0, 260),
          createdAt: snap.data().createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, profilePath);
  }
}

async function pushEstimateToFirestore(uid: string, est: SavedProjectEstimate): Promise<SavedProjectEstimate> {
  const estId = sanitizeFirestoreId(est.id, 'est');
  const estPath = `users/${uid}/estimates/${estId}`;
  const estRef = doc(db, 'users', uid, 'estimates', estId);

  try {
    const existingSnap = await getDoc(estRef);
    const nextCloudRev = Math.max(est.localRevision ?? 1, (existingSnap.exists() ? Number(existingSnap.data().revision) || 0 : 0) + 1);
    const createdAtVal = existingSnap.exists() && existingSnap.data().createdAt instanceof Timestamp
      ? existingSnap.data().createdAt
      : serverTimestamp();

    const batch = writeBatch(db);
    batch.set(estRef, {
      id: estId,
      ownerId: uid,
      projectKey: (est.projectKey || est.name || 'projekt').slice(0, 160),
      name: (est.name || 'Kosztorys').slice(0, 240),
      versionNumber: Math.max(1, Number(est.versionNumber) || 1),
      versionTag: (est.versionTag || 'Wstępny').slice(0, 80),
      versionNote: (est.versionNote || '').slice(0, 1000),
      clientName: (est.clientName || est.offer?.clientName || '').slice(0, 240),
      location: (est.location || est.offer?.projectLocation || '').slice(0, 240),
      itemCount: est.items.length,
      netTotal: Math.max(0, Number(est.netTotal) || 0),
      revision: nextCloudRev,
      clientUpdatedAt: (est.updatedAt || new Date().toISOString()).slice(0, 64),
      deleted: Boolean(est.deleted),
      settings: {
        sourceId: est.settings.sourceId,
        subregionId: est.settings.subregionId,
        indirectCostsPct: est.settings.indirectCostsPct,
        profitPct: est.settings.profitPct,
        vatRate: est.settings.vatRate === 8 ? 8 : 23,
        discountPct: est.settings.discountPct,
      },
      structureParams: est.structureParams,
      offer: est.offer,
      createdAt: createdAtVal,
      updatedAt: serverTimestamp(),
    });

    est.items.slice(0, 450).forEach((item, idx) => {
      const itemId = sanitizeFirestoreId(item.id, `item_${idx}`);
      const itemRef = doc(db, 'users', uid, 'estimates', estId, 'items', itemId);
      batch.set(itemRef, {
        id: itemId,
        ownerId: uid,
        estimateId: estId,
        orderIndex: idx,
        catalogId: (item.catalogId || '').slice(0, 128),
        knr: (item.knr || 'KNR').slice(0, 80),
        name: (item.name || 'Pozycja').slice(0, 500),
        category: item.category,
        unit: item.unit,
        quantity: Math.max(0, Number(item.quantity) || 0),
        rateLabor: Math.max(0, Number(item.rateLabor) || 0),
        rateMaterials: Math.max(0, Number(item.rateMaterials) || 0),
        rateEquipment: Math.max(0, Number(item.rateEquipment) || 0),
        bdoCode: (item.bdoCode || '').slice(0, 32),
        notes: (item.notes || '').slice(0, 500),
        isCustom: Boolean(item.isCustom),
        createdAt: createdAtVal,
        updatedAt: serverTimestamp(),
      });
    });

    const histId = sanitizeFirestoreId(`sync_${estId}_${Date.now()}`);
    const histRef = doc(db, 'users', uid, 'changeHistory', histId);
    batch.set(histRef, {
      id: histId,
      ownerId: uid,
      entityType: 'estimate',
      entityId: estId,
      action: est.deleted ? 'delete_sync' : 'push_sync',
      summary: `Zsynchronizowano kosztorys "${est.name}" (v${est.versionNumber ?? 1} · ${est.versionTag ?? 'Wstępny'})`,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    const nowIso = new Date().toISOString();
    return {
      ...est,
      id: estId,
      syncStatus: 'synced',
      localRevision: nextCloudRev,
      cloudRevision: nextCloudRev,
      lastSyncedAt: nowIso,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, estPath);
  }
}

async function fetchCloudEstimates(uid: string): Promise<SavedProjectEstimate[]> {
  const estColPath = `users/${uid}/estimates`;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'estimates'));
    const results: SavedProjectEstimate[] = [];

    for (const d of snap.docs) {
      const data = d.data();
      const itemsPath = `users/${uid}/estimates/${d.id}/items`;
      let lineItems: EstimateLineItem[] = [];
      try {
        const itemsSnap = await getDocs(collection(db, 'users', uid, 'estimates', d.id, 'items'));
        lineItems = itemsSnap.docs
          .map((idDoc) => {
            const iv = idDoc.data();
            return {
              orderIndex: Number(iv.orderIndex) || 0,
              item: {
                id: String(iv.id || idDoc.id),
                catalogId: iv.catalogId ? String(iv.catalogId) : undefined,
                knr: String(iv.knr || ''),
                name: String(iv.name || ''),
                category: iv.category,
                unit: iv.unit,
                quantity: Number(iv.quantity) || 0,
                rateLabor: Number(iv.rateLabor) || 0,
                rateMaterials: Number(iv.rateMaterials) || 0,
                rateEquipment: Number(iv.rateEquipment) || 0,
                bdoCode: iv.bdoCode ? String(iv.bdoCode) : undefined,
                notes: iv.notes ? String(iv.notes) : undefined,
                isCustom: Boolean(iv.isCustom),
              } as EstimateLineItem,
            };
          })
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((x) => x.item);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, itemsPath);
      }

      const clientUpdatedAt = String(data.clientUpdatedAt || new Date().toISOString());
      results.push({
        id: String(data.id || d.id),
        projectKey: String(data.projectKey || data.name || ''),
        name: String(data.name || 'Projekt z chmury'),
        versionNumber: Number(data.versionNumber) || 1,
        versionTag: String(data.versionTag || 'Wstępny'),
        versionNote: String(data.versionNote || ''),
        clientName: String(data.clientName || ''),
        location: String(data.location || ''),
        createdAt: clientUpdatedAt,
        updatedAt: clientUpdatedAt,
        itemCount: lineItems.length,
        netTotal: Number(data.netTotal) || 0,
        items: lineItems,
        settings: data.settings as EstimateSettings,
        structureParams: data.structureParams,
        offer: data.offer,
        localRevision: Number(data.revision) || 1,
        cloudRevision: Number(data.revision) || 1,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
        deleted: Boolean(data.deleted),
      });
    }

    return results;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, estColPath);
  }
}

export async function syncWorkspaceWithCloud(params: {
  localEstimates: SavedProjectEstimate[];
  companyProfile: CompanyProfile;
  estimateDefaults: EstimateSettings;
  documentsLabel: string;
}): Promise<BidirectionalSyncResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      status: 'offline',
      pushedCount: 0,
      pulledCount: 0,
      conflicts: [],
      mergedEstimates: params.localEstimates,
      pulledCompanyProfile: null,
      message: 'Brak internetu — zmiany zostały oznaczone jako oczekujące na synchronizację i wyślą się automatycznie po odzyskaniu sieci.',
    };
  }

  const user = auth.currentUser;
  if (!user) {
    return {
      status: 'unauthenticated',
      pushedCount: 0,
      pulledCount: 0,
      conflicts: [],
      mergedEstimates: params.localEstimates,
      pulledCompanyProfile: null,
      message: 'Zaloguj się przez konto Google lub adres e-mail, aby włączyć synchronizację z chmurą.',
    };
  }

  if (!user.emailVerified) {
    return {
      status: 'email_unverified',
      pushedCount: 0,
      pulledCount: 0,
      conflicts: [],
      mergedEstimates: params.localEstimates,
      pulledCompanyProfile: null,
      message: 'Potwierdź adres e-mail (link w wiadomości), aby odblokować zapis w przestrzeni chmurowej.',
    };
  }

  await ensureUserProfileDoc(user, params.documentsLabel);

  // Sync company settings doc
  let pulledCompanyProfile: CompanyProfile | null = null;
  const settingsPath = `users/${user.uid}/settings/main`;
  try {
    const settingsRef = doc(db, 'users', user.uid, 'settings', 'main');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        id: 'main',
        ownerId: user.uid,
        companyName: params.companyProfile.companyName.slice(0, 200),
        companyNip: params.companyProfile.companyNip.slice(0, 32),
        companyAddress: params.companyProfile.companyAddress.slice(0, 240),
        companyPhone: params.companyProfile.companyPhone.slice(0, 64),
        companyEmail: params.companyProfile.companyEmail.slice(0, 254),
        estimateDefaults: params.estimateDefaults,
        revision: 1,
        clientUpdatedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const sData = settingsSnap.data();
      const cloudTs = Date.parse(String(sData.clientUpdatedAt || ''));
      const localTs = Date.parse(params.companyProfile.updatedAt || '');
      if (Number.isFinite(cloudTs) && (!Number.isFinite(localTs) || cloudTs > localTs)) {
        pulledCompanyProfile = {
          companyName: String(sData.companyName || ''),
          companyNip: String(sData.companyNip || ''),
          companyAddress: String(sData.companyAddress || ''),
          companyPhone: String(sData.companyPhone || ''),
          companyEmail: String(sData.companyEmail || ''),
          updatedAt: String(sData.clientUpdatedAt || new Date().toISOString()),
        };
      } else if (Number.isFinite(localTs) && localTs > (Number.isFinite(cloudTs) ? cloudTs : 0)) {
        await setDoc(
          settingsRef,
          {
            id: 'main',
            ownerId: user.uid,
            companyName: params.companyProfile.companyName.slice(0, 200),
            companyNip: params.companyProfile.companyNip.slice(0, 32),
            companyAddress: params.companyProfile.companyAddress.slice(0, 240),
            companyPhone: params.companyProfile.companyPhone.slice(0, 64),
            companyEmail: params.companyProfile.companyEmail.slice(0, 254),
            estimateDefaults: params.estimateDefaults,
            revision: (Number(sData.revision) || 1) + 1,
            clientUpdatedAt: params.companyProfile.updatedAt || new Date().toISOString(),
            createdAt: sData.createdAt ?? serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: false }
        );
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, settingsPath);
  }

  const cloudList = await fetchCloudEstimates(user.uid);
  const localById = new Map<string, SavedProjectEstimate>(
    params.localEstimates.map((e) => [sanitizeFirestoreId(e.id, 'est'), e])
  );
  const cloudById = new Map<string, SavedProjectEstimate>(
    cloudList.map((e) => [sanitizeFirestoreId(e.id, 'est'), e])
  );

  const allIds = new Set<string>([...localById.keys(), ...cloudById.keys()]);
  const mergedEstimates: SavedProjectEstimate[] = [];
  const conflicts: SyncConflictItem[] = [];
  let pushedCount = 0;
  let pulledCount = 0;

  for (const id of allIds) {
    const localEst = localById.get(id);
    const cloudEst = cloudById.get(id);
    const action = detectEstimateSyncAction(localEst, cloudEst);

    if (action === 'push_local' && localEst) {
      const pushed = await pushEstimateToFirestore(user.uid, localEst);
      if (!pushed.deleted) mergedEstimates.push(pushed);
      pushedCount += 1;
    } else if (action === 'pull_cloud' && cloudEst) {
      if (!cloudEst.deleted) {
        mergedEstimates.push({ ...cloudEst, syncStatus: 'synced' });
        pulledCount += 1;
      }
    } else if (action === 'conflict' && localEst && cloudEst) {
      conflicts.push(buildConflictItem(localEst, cloudEst));
      mergedEstimates.push({ ...localEst, syncStatus: 'conflict' });
    } else if (localEst && !localEst.deleted) {
      mergedEstimates.push({ ...localEst, syncStatus: 'synced' });
    }
  }

  mergedEstimates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (conflicts.length > 0) {
    return {
      status: 'conflicts',
      pushedCount,
      pulledCount,
      conflicts,
      mergedEstimates,
      pulledCompanyProfile,
      message: `Wykryto ${conflicts.length} konflikt(y) zmian — nowsze dane nie zostały nadpisane. Wybierz sposób scalenia.`,
    };
  }

  return {
    status: 'synced',
    pushedCount,
    pulledCount,
    conflicts: [],
    mergedEstimates,
    pulledCompanyProfile,
    message: `Zsynchronizowano przestrzeń w chmurze (wysłano: ${pushedCount}, pobrano: ${pulledCount}).`,
  };
}

export async function applyConflictResolution(
  conflict: SyncConflictItem,
  choice: CloudConflictResolutionChoice
): Promise<{
  primaryEstimate: SavedProjectEstimate | null;
  secondaryEstimate: SavedProjectEstimate | null;
}> {
  const resolved = resolveEstimateConflict(conflict, choice);
  const user = auth.currentUser;
  if (user && user.emailVerified && resolved.pushTargets.length > 0) {
    for (const target of resolved.pushTargets) {
      await pushEstimateToFirestore(user.uid, target);
    }
  }
  return {
    primaryEstimate: resolved.primaryEstimate,
    secondaryEstimate: resolved.secondaryEstimate,
  };
}

export async function diagnoseCloudSyncStatus(
  localEstimates: SavedProjectEstimate[]
): Promise<CloudSyncDiagnosticReport> {
  const checkedAt = new Date().toISOString();
  const networkOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const user = auth.currentUser;
  const pendingLocalCount = localEstimates.filter(
    (e) => e.syncStatus === 'pending_sync' || e.syncStatus === 'local_only'
  ).length;
  const existingConflictCount = localEstimates.filter((e) => e.syncStatus === 'conflict').length;

  if (!networkOnline) {
    return {
      checkedAt,
      networkOnline: false,
      firebaseReachable: false,
      authenticated: Boolean(user),
      userEmail: user?.email || null,
      emailVerified: Boolean(user?.emailVerified),
      pendingLocalCount,
      conflictCount: existingConflictCount,
      cloudEstimateCount: null,
      statusMessage: `Brak połączenia z internetem. Oczekuje na wysłanie lokalnych zmian: ${pendingLocalCount}.`,
    };
  }

  const conn = await testConnection();
  if (!user) {
    return {
      checkedAt,
      networkOnline: true,
      firebaseReachable: conn.reachable,
      authenticated: false,
      userEmail: null,
      emailVerified: false,
      pendingLocalCount,
      conflictCount: existingConflictCount,
      cloudEstimateCount: null,
      statusMessage: conn.reachable
        ? 'Internet i chmura dostępne. Zaloguj się przez Google lub e-mail, aby synchronizować projekty.'
        : 'Połączenie z chmurą tymczasowo niedostępne.',
    };
  }

  if (!user.emailVerified) {
    return {
      checkedAt,
      networkOnline: true,
      firebaseReachable: conn.reachable,
      authenticated: true,
      userEmail: user.email || null,
      emailVerified: false,
      pendingLocalCount,
      conflictCount: existingConflictCount,
      cloudEstimateCount: null,
      statusMessage: 'Konto zalogowane, ale adres e-mail wymaga potwierdzenia linkiem z wiadomości.',
    };
  }

  const cloudList = await fetchCloudEstimates(user.uid);
  const localById = new Map(localEstimates.map((e) => [sanitizeFirestoreId(e.id, 'est'), e]));
  const cloudById = new Map(cloudList.map((e) => [sanitizeFirestoreId(e.id, 'est'), e]));
  let detectedConflicts = 0;
  let updatesAvailable = 0;
  for (const id of new Set([...localById.keys(), ...cloudById.keys()])) {
    const decision = detectEstimateSyncAction(localById.get(id), cloudById.get(id));
    if (decision === 'conflict') detectedConflicts += 1;
    if (decision === 'pull_cloud') updatesAvailable += 1;
  }

  return {
    checkedAt,
    networkOnline: true,
    firebaseReachable: true,
    authenticated: true,
    userEmail: user.email || null,
    emailVerified: true,
    pendingLocalCount,
    conflictCount: detectedConflicts,
    cloudEstimateCount: cloudList.filter((c) => !c.deleted).length,
    statusMessage:
      detectedConflicts > 0
        ? `Wykryto ${detectedConflicts} konflikt(y), oczekujących lokalnych zmian: ${pendingLocalCount}.`
        : pendingLocalCount > 0 || updatesAvailable > 0
        ? `Oczekujące zmiany do wysłania: ${pendingLocalCount}, nowsze w chmurze: ${updatesAvailable}. Kliknij „Synchronizuj teraz”.`
        : `Stan synchronizacji wzorowy — wszystkie kosztorysy (${cloudList.filter((c) => !c.deleted).length}) są spójne z chmurą.`,
  };
}

export function subscribeRemoteEstimateUpdates(
  uid: string,
  onRemotePing: () => void,
  onError?: (err: unknown) => void
): () => void {
  const path = `users/${uid}/estimates`;
  return onSnapshot(
    collection(db, 'users', uid, 'estimates'),
    () => {
      onRemotePing();
    },
    (error) => {
      console.warn(`Firestore listener warning (${path}):`, error);
      onError?.(error);
    }
  );
}
