import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  VALID_DEAL_CATEGORY_IDS,
  type DealCategory,
  type OfferCategory,
  type OfferItem,
  type RemovedDeal,
  type SavedDeal,
  type SourceId,
  type UserProfile,
} from '../types/offers';
import {
  clearCalendarAccessToken,
  type CalendarEventTarget,
  type CreatedCalendarEvent,
} from '../utils/googleCalendar';

const VALID_OFFER_TYPES: OfferCategory[] = ['codice-sconto', 'cashback', 'prova-gratis'];
const VALID_SOURCES: SourceId[] = [
  'buyon',
  'scontiomaggio',
  'letyshops',
  'bestshopping',
  'scontrinofelice',
  'widilo',
  'pgperte',
  'dimmicosacerchi',
  'codicerisparmio',
  'cashbackdeals',
  'simplybestcoupons',
];

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function isValidHttpUrl(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\/.{4,}/i.test(url));
}

function recordPopularityDelta(dealId: string, delta: 1 | -1): void {
  void fetch('/api/offers/popularity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealId, delta }),
  }).catch(() => {});
}

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  profile: UserProfile | null;
  savedDeals: SavedDeal[];
  removedDeals: RemovedDeal[];
  savedIds: Set<string>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  updatePreferences: (updates: {
    displayName: string;
    preferredCategories: DealCategory[];
    preferredOfferTypes: OfferCategory[];
    preferredSources: SourceId[];
    notifyOnNewDeals: boolean;
  }) => Promise<void>;
  toggleSaveDeal: (offer: OfferItem) => Promise<boolean>;
  updateDealNote: (dealId: string, note: string) => Promise<void>;
  updateDealReminder: (
    dealId: string,
    updates: {
      expiresAt?: string;
      reminderEnabled?: boolean;
      reminderNotifiedAt?: string;
    }
  ) => Promise<void>;
  removeSavedDeal: (dealId: string) => Promise<void>;
  restoreRemovedDeal: (deal: RemovedDeal) => Promise<void>;
  deleteRemovedDeal: (dealId: string) => Promise<void>;
  clearRemovedDeals: () => Promise<void>;
  clearAuthError: () => void;
  calendarTarget: CalendarEventTarget | null;
  syncedCalendarEvents: Record<string, CreatedCalendarEvent>;
  openCalendarSync: (target: CalendarEventTarget) => void;
  closeCalendarSync: () => void;
  markCalendarSynced: (dealId: string, event: CreatedCalendarEvent) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [savedDeals, setSavedDeals] = useState<SavedDeal[]>([]);
  const [removedDeals, setRemovedDeals] = useState<RemovedDeal[]>([]);
  const [calendarTarget, setCalendarTarget] = useState<CalendarEventTarget | null>(null);
  const [syncedCalendarEvents, setSyncedCalendarEvents] = useState<
    Record<string, CreatedCalendarEvent>
  >({});

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        clearCalendarAccessToken();
        setProfile(null);
        setSavedDeals([]);
        setRemovedDeals([]);
        setCalendarTarget(null);
        setSyncedCalendarEvents({});
        setAuthLoading(false);
        return;
      }

      // Ensure user profile document exists in Firestore upon sign-up / first login
      try {
        const userRef = doc(db, 'users', nextUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const displayName = (nextUser.displayName || nextUser.email?.split('@')[0] || 'Utente')
            .trim()
            .slice(0, 80);
          const email = (nextUser.email || '').trim().slice(0, 160);
          const payload: Record<string, unknown> = {
            uid: nextUser.uid,
            displayName,
            email,
            preferredCategories: [],
            preferredOfferTypes: [],
            preferredSources: [],
            notifyOnNewDeals: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (isValidHttpUrl(nextUser.photoURL ?? undefined)) {
            payload.photoURL = nextUser.photoURL!.slice(0, 500);
          }
          await setDoc(userRef, payload);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${nextUser.uid}`);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;

    const userPath = `users/${user.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, userPath);
      }
    );

    const savedPath = `users/${user.uid}/savedDeals`;
    const q = query(collection(db, 'users', user.uid, 'savedDeals'), where('userId', '==', user.uid));
    const unsubSaved = onSnapshot(
      q,
      (snap) => {
        const items: SavedDeal[] = snap.docs.map((d) => d.data() as SavedDeal);
        items.sort((a, b) => {
          const ta = (a.savedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          const tb = (b.savedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setSavedDeals(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, savedPath);
      }
    );

    const removedPath = `users/${user.uid}/removedDeals`;
    const removedQuery = query(
      collection(db, 'users', user.uid, 'removedDeals'),
      where('userId', '==', user.uid)
    );
    const unsubRemoved = onSnapshot(
      removedQuery,
      (snap) => {
        const items: RemovedDeal[] = snap.docs.map((d) => d.data() as RemovedDeal);
        items.sort((a, b) => {
          const ta = (a.removedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          const tb = (b.removedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setRemovedDeals(items);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, removedPath);
      }
    );

    return () => {
      unsubProfile();
      unsubSaved();
      unsubRemoved();
    };
  }, [user]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Accesso non riuscito';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError('Impossibile completare l’accesso con Google. Riprova.');
      }
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    clearCalendarAccessToken();
    setCalendarTarget(null);
    setSyncedCalendarEvents({});
    await signOut(auth);
  };

  const updatePreferences = async (updates: {
    displayName: string;
    preferredCategories: DealCategory[];
    preferredOfferTypes: OfferCategory[];
    preferredSources: SourceId[];
    notifyOnNewDeals: boolean;
  }) => {
    if (!user) return;
    const cleanName = updates.displayName.trim().slice(0, 80) || 'Utente';
    const cleanCats = Array.from(
      new Set(updates.preferredCategories.filter((c) => VALID_DEAL_CATEGORY_IDS.includes(c)))
    ).slice(0, 7);
    const cleanTypes = Array.from(
      new Set(updates.preferredOfferTypes.filter((t) => VALID_OFFER_TYPES.includes(t)))
    ).slice(0, 3);
    const cleanSources = Array.from(
      new Set(updates.preferredSources.filter((s) => VALID_SOURCES.includes(s)))
    ).slice(0, 11);

    const path = `users/${user.uid}`;
    try {
      if (user.displayName !== cleanName) {
        await updateProfile(user, { displayName: cleanName }).catch(() => {});
      }
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: cleanName,
        preferredCategories: cleanCats,
        preferredOfferTypes: cleanTypes,
        preferredSources: cleanSources,
        notifyOnNewDeals: Boolean(updates.notifyOnNewDeals),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const savedIds = new Set(savedDeals.map((d) => d.id));

  const buildDealBaseFields = (
    deal: Pick<
      OfferItem,
      | 'title'
      | 'merchant'
      | 'description'
      | 'category'
      | 'tags'
      | 'sourceId'
      | 'sourceName'
      | 'offerUrl'
      | 'rewardLabel'
      | 'couponCode'
      | 'couponHint'
      | 'imageUrl'
      | 'expiresAt'
    > & { sourceUrl?: string; note?: string },
    userId: string,
    dealId: string
  ): Record<string, unknown> => {
    const validTags = deal.tags
      .filter((t) => VALID_DEAL_CATEGORY_IDS.includes(t))
      .slice(0, 4);
    if (validTags.length === 0) validTags.push('home-goods');

    const fallbackUrl = isValidHttpUrl(deal.offerUrl)
      ? deal.offerUrl
      : isValidHttpUrl(deal.sourceUrl)
        ? deal.sourceUrl
        : 'https://www.buyon.it';

    const base: Record<string, unknown> = {
      id: dealId,
      userId,
      title: deal.title.trim().slice(0, 200) || 'Offerta',
      merchant: deal.merchant.trim().slice(0, 80) || 'Partner',
      description: deal.description.trim().slice(0, 400),
      category: VALID_OFFER_TYPES.includes(deal.category) ? deal.category : 'cashback',
      tags: validTags,
      sourceId: VALID_SOURCES.includes(deal.sourceId) ? deal.sourceId : 'bestshopping',
      sourceName: deal.sourceName.trim().slice(0, 60) || 'Fonte',
      offerUrl: fallbackUrl.slice(0, 600),
      rewardLabel: deal.rewardLabel.trim().slice(0, 60) || 'Offerta',
    };

    if (deal.couponCode && deal.couponCode.trim()) {
      base.couponCode = deal.couponCode.trim().slice(0, 50);
    }
    if (deal.couponHint && deal.couponHint.trim()) {
      base.couponHint = deal.couponHint.trim().slice(0, 30);
    }
    if (isValidHttpUrl(deal.imageUrl)) {
      base.imageUrl = deal.imageUrl.slice(0, 600);
    }
    if (deal.note && deal.note.trim()) {
      base.note = deal.note.trim().slice(0, 280);
    }
    if (deal.expiresAt && deal.expiresAt.length >= 10) {
      base.expiresAt = deal.expiresAt.slice(0, 40);
    }

    return base;
  };

  const toggleSaveDeal = async (offer: OfferItem): Promise<boolean> => {
    if (!user) {
      await signInWithGoogle();
      return false;
    }

    const dealId = sanitizeId(offer.id);
    const savedRef = doc(db, 'users', user.uid, 'savedDeals', dealId);
    const removedRef = doc(db, 'users', user.uid, 'removedDeals', dealId);
    const savedPath = `users/${user.uid}/savedDeals/${dealId}`;

    if (savedIds.has(dealId)) {
      const existingSaved = savedDeals.find((d) => d.id === dealId);
      const removedPayload: Record<string, unknown> = {
        ...buildDealBaseFields(existingSaved ?? offer, user.uid, dealId),
        removedAt: serverTimestamp(),
      };
      try {
        const batch = writeBatch(db);
        batch.set(removedRef, removedPayload);
        batch.delete(savedRef);
        await batch.commit();
        recordPopularityDelta(dealId, -1);
        return false;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, savedPath);
      }
    }

    const payload: Record<string, unknown> = {
      ...buildDealBaseFields(offer, user.uid, dealId),
      savedAt: serverTimestamp(),
    };
    if (typeof payload.expiresAt === 'string') {
      payload.reminderEnabled = true;
    }

    try {
      const batch = writeBatch(db);
      batch.set(savedRef, payload);
      if (removedDeals.some((r) => r.id === dealId)) {
        batch.delete(removedRef);
      }
      await batch.commit();
      recordPopularityDelta(dealId, 1);
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, savedPath);
    }
  };

  const updateDealNote = async (dealId: string, note: string) => {
    if (!user) return;
    const cleanId = sanitizeId(dealId);
    const path = `users/${user.uid}/savedDeals/${cleanId}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'savedDeals', cleanId), {
        note: note.trim().slice(0, 280),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const updateDealReminder = async (
    dealId: string,
    updates: {
      expiresAt?: string;
      reminderEnabled?: boolean;
      reminderNotifiedAt?: string;
    }
  ) => {
    if (!user) return;
    const cleanId = sanitizeId(dealId);
    const path = `users/${user.uid}/savedDeals/${cleanId}`;
    const patch: Record<string, unknown> = {};
    if (updates.expiresAt !== undefined) {
      patch.expiresAt = updates.expiresAt.trim().slice(0, 40);
    }
    if (updates.reminderEnabled !== undefined) {
      patch.reminderEnabled = Boolean(updates.reminderEnabled);
    }
    if (updates.reminderNotifiedAt !== undefined) {
      patch.reminderNotifiedAt = updates.reminderNotifiedAt.trim().slice(0, 40);
    }
    if (Object.keys(patch).length === 0) return;

    try {
      await updateDoc(doc(db, 'users', user.uid, 'savedDeals', cleanId), patch);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const removeSavedDeal = async (dealId: string) => {
    if (!user) return;
    const cleanId = sanitizeId(dealId);
    const savedRef = doc(db, 'users', user.uid, 'savedDeals', cleanId);
    const removedRef = doc(db, 'users', user.uid, 'removedDeals', cleanId);
    const path = `users/${user.uid}/savedDeals/${cleanId}`;
    const existingSaved = savedDeals.find((d) => d.id === cleanId);

    try {
      if (existingSaved) {
        const batch = writeBatch(db);
        batch.set(removedRef, {
          ...buildDealBaseFields(existingSaved, user.uid, cleanId),
          removedAt: serverTimestamp(),
        });
        batch.delete(savedRef);
        await batch.commit();
        recordPopularityDelta(cleanId, -1);
      } else {
        await deleteDoc(savedRef);
        recordPopularityDelta(cleanId, -1);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const restoreRemovedDeal = async (deal: RemovedDeal) => {
    if (!user) return;
    const cleanId = sanitizeId(deal.id);
    const savedRef = doc(db, 'users', user.uid, 'savedDeals', cleanId);
    const removedRef = doc(db, 'users', user.uid, 'removedDeals', cleanId);
    const path = `users/${user.uid}/savedDeals/${cleanId}`;
    const payload: Record<string, unknown> = {
      ...buildDealBaseFields(deal, user.uid, cleanId),
      savedAt: serverTimestamp(),
    };
    if (typeof payload.expiresAt === 'string') {
      payload.reminderEnabled = true;
    }

    try {
      const batch = writeBatch(db);
      batch.set(savedRef, payload);
      batch.delete(removedRef);
      await batch.commit();
      recordPopularityDelta(cleanId, 1);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const deleteRemovedDeal = async (dealId: string) => {
    if (!user) return;
    const cleanId = sanitizeId(dealId);
    const path = `users/${user.uid}/removedDeals/${cleanId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'removedDeals', cleanId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const clearRemovedDeals = async () => {
    if (!user || removedDeals.length === 0) return;
    const path = `users/${user.uid}/removedDeals`;
    try {
      const batch = writeBatch(db);
      for (const item of removedDeals.slice(0, 450)) {
        batch.delete(doc(db, 'users', user.uid, 'removedDeals', sanitizeId(item.id)));
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading,
        authError,
        profile,
        savedDeals,
        removedDeals,
        savedIds,
        signInWithGoogle,
        signOutUser,
        updatePreferences,
        toggleSaveDeal,
        updateDealNote,
        updateDealReminder,
        removeSavedDeal,
        restoreRemovedDeal,
        deleteRemovedDeal,
        clearRemovedDeals,
        clearAuthError: () => setAuthError(null),
        calendarTarget,
        syncedCalendarEvents,
        openCalendarSync: (target) => setCalendarTarget(target),
        closeCalendarSync: () => setCalendarTarget(null),
        markCalendarSynced: (dealId, event) =>
          setSyncedCalendarEvents((prev) => ({ ...prev, [dealId]: event })),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return ctx;
}
