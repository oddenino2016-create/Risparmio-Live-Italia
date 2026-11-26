import React, { createContext, useContext, useEffect, useState } from 'react';
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
  type CalendarEventTarget,
  type CreatedCalendarEvent,
} from '../utils/googleCalendar';

const PROFILE_STORAGE_KEY = 'risparmio_live_local_profile_v1';
const SAVED_STORAGE_KEY = 'risparmio_live_local_saved_v1';
const REMOVED_STORAGE_KEY = 'risparmio_live_local_removed_v1';
const POPULARITY_STORAGE_KEY = 'risparmio_live_local_popularity_v1';

const LOCAL_USER_ID = 'locale';

export interface LocalUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

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

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function createDefaultProfile(): UserProfile {
  const nowIso = new Date().toISOString();
  return {
    uid: LOCAL_USER_ID,
    displayName: 'Il mio profilo',
    email: 'Salvataggio locale nel browser',
    preferredCategories: [],
    preferredOfferTypes: [],
    preferredSources: [],
    notifyOnNewDeals: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

interface AuthContextValue {
  user: LocalUser;
  authLoading: boolean;
  authError: string | null;
  profile: UserProfile;
  savedDeals: SavedDeal[];
  removedDeals: RemovedDeal[];
  savedIds: Set<string>;
  popularityCounts: Record<string, number>;
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
  const [profile, setProfile] = useState<UserProfile>(() =>
    readJsonStorage<UserProfile>(PROFILE_STORAGE_KEY, createDefaultProfile())
  );
  const [savedDeals, setSavedDeals] = useState<SavedDeal[]>(() =>
    readJsonStorage<SavedDeal[]>(SAVED_STORAGE_KEY, [])
  );
  const [removedDeals, setRemovedDeals] = useState<RemovedDeal[]>(() =>
    readJsonStorage<RemovedDeal[]>(REMOVED_STORAGE_KEY, [])
  );
  const [popularityCounts, setPopularityCounts] = useState<Record<string, number>>(() =>
    readJsonStorage<Record<string, number>>(POPULARITY_STORAGE_KEY, {})
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [calendarTarget, setCalendarTarget] = useState<CalendarEventTarget | null>(null);
  const [syncedCalendarEvents, setSyncedCalendarEvents] = useState<
    Record<string, CreatedCalendarEvent>
  >({});

  useEffect(() => {
    writeJsonStorage(PROFILE_STORAGE_KEY, profile);
  }, [profile]);

  useEffect(() => {
    writeJsonStorage(SAVED_STORAGE_KEY, savedDeals);
  }, [savedDeals]);

  useEffect(() => {
    writeJsonStorage(REMOVED_STORAGE_KEY, removedDeals);
  }, [removedDeals]);

  useEffect(() => {
    writeJsonStorage(POPULARITY_STORAGE_KEY, popularityCounts);
  }, [popularityCounts]);

  const user: LocalUser = {
    uid: LOCAL_USER_ID,
    displayName: profile.displayName || 'Il mio profilo',
    email: profile.email || 'Salvataggio locale nel browser',
    photoURL: profile.photoURL,
  };

  const adjustPopularity = (dealId: string, delta: 1 | -1) => {
    setPopularityCounts((prev) => {
      const nextVal = Math.max(0, (prev[dealId] ?? 0) + delta);
      return { ...prev, [dealId]: nextVal };
    });
  };

  const savedIds = new Set(savedDeals.map((d) => d.id));

  const buildDealFields = (
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
    dealId: string
  ): Omit<SavedDeal, 'savedAt'> => {
    const validTags = deal.tags
      .filter((t) => VALID_DEAL_CATEGORY_IDS.includes(t))
      .slice(0, 4);
    if (validTags.length === 0) validTags.push('home-goods');

    const fallbackUrl = isValidHttpUrl(deal.offerUrl)
      ? deal.offerUrl
      : isValidHttpUrl(deal.sourceUrl)
        ? deal.sourceUrl
        : 'https://www.buyon.it';

    const base: Omit<SavedDeal, 'savedAt'> = {
      id: dealId,
      userId: LOCAL_USER_ID,
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

    if (deal.couponCode?.trim()) {
      base.couponCode = deal.couponCode.trim().slice(0, 50);
    }
    if (deal.couponHint?.trim()) {
      base.couponHint = deal.couponHint.trim().slice(0, 30);
    }
    if (isValidHttpUrl(deal.imageUrl)) {
      base.imageUrl = deal.imageUrl.slice(0, 600);
    }
    if (deal.note?.trim()) {
      base.note = deal.note.trim().slice(0, 280);
    }
    if (deal.expiresAt && deal.expiresAt.length >= 10) {
      base.expiresAt = deal.expiresAt.slice(0, 40);
    }

    return base;
  };

  const signInWithGoogle = async () => {
    // Local-only static mode: profile is always available in the browser
  };

  const signOutUser = async () => {
    setProfile(createDefaultProfile());
    setSavedDeals([]);
    setRemovedDeals([]);
    setSyncedCalendarEvents({});
    setCalendarTarget(null);
  };

  const updatePreferences = async (updates: {
    displayName: string;
    preferredCategories: DealCategory[];
    preferredOfferTypes: OfferCategory[];
    preferredSources: SourceId[];
    notifyOnNewDeals: boolean;
  }) => {
    const cleanName = updates.displayName.trim().slice(0, 80) || 'Il mio profilo';
    const cleanCats = Array.from(
      new Set(updates.preferredCategories.filter((c) => VALID_DEAL_CATEGORY_IDS.includes(c)))
    ).slice(0, 7);
    const cleanTypes = Array.from(
      new Set(updates.preferredOfferTypes.filter((t) => VALID_OFFER_TYPES.includes(t)))
    ).slice(0, 3);
    const cleanSources = Array.from(
      new Set(updates.preferredSources.filter((s) => VALID_SOURCES.includes(s)))
    ).slice(0, 11);

    setProfile((prev) => ({
      ...prev,
      displayName: cleanName,
      preferredCategories: cleanCats,
      preferredOfferTypes: cleanTypes,
      preferredSources: cleanSources,
      notifyOnNewDeals: Boolean(updates.notifyOnNewDeals),
      updatedAt: new Date().toISOString(),
    }));
  };

  const toggleSaveDeal = async (offer: OfferItem): Promise<boolean> => {
    const dealId = sanitizeId(offer.id);

    if (savedIds.has(dealId)) {
      const existingSaved = savedDeals.find((d) => d.id === dealId);
      const removedEntry: RemovedDeal = {
        ...buildDealFields(existingSaved ?? offer, dealId),
        removedAt: Date.now(),
      };
      setSavedDeals((prev) => prev.filter((d) => d.id !== dealId));
      setRemovedDeals((prev) => [removedEntry, ...prev.filter((r) => r.id !== dealId)]);
      adjustPopularity(dealId, -1);
      return false;
    }

    const fields = buildDealFields(offer, dealId);
    const savedEntry: SavedDeal = {
      ...fields,
      ...(typeof fields.expiresAt === 'string' ? { reminderEnabled: true } : {}),
      savedAt: Date.now(),
    };

    setSavedDeals((prev) => [savedEntry, ...prev.filter((d) => d.id !== dealId)]);
    setRemovedDeals((prev) => prev.filter((r) => r.id !== dealId));
    adjustPopularity(dealId, 1);
    return true;
  };

  const updateDealNote = async (dealId: string, note: string) => {
    const cleanId = sanitizeId(dealId);
    const trimmed = note.trim().slice(0, 280);
    setSavedDeals((prev) =>
      prev.map((d) => (d.id === cleanId ? { ...d, note: trimmed } : d))
    );
  };

  const updateDealReminder = async (
    dealId: string,
    updates: {
      expiresAt?: string;
      reminderEnabled?: boolean;
      reminderNotifiedAt?: string;
    }
  ) => {
    const cleanId = sanitizeId(dealId);
    setSavedDeals((prev) =>
      prev.map((d) => {
        if (d.id !== cleanId) return d;
        return {
          ...d,
          ...(updates.expiresAt !== undefined
            ? { expiresAt: updates.expiresAt.trim().slice(0, 40) }
            : {}),
          ...(updates.reminderEnabled !== undefined
            ? { reminderEnabled: Boolean(updates.reminderEnabled) }
            : {}),
          ...(updates.reminderNotifiedAt !== undefined
            ? { reminderNotifiedAt: updates.reminderNotifiedAt.trim().slice(0, 40) }
            : {}),
        };
      })
    );
  };

  const removeSavedDeal = async (dealId: string) => {
    const cleanId = sanitizeId(dealId);
    const existingSaved = savedDeals.find((d) => d.id === cleanId);
    setSavedDeals((prev) => prev.filter((d) => d.id !== cleanId));
    if (existingSaved) {
      const removedEntry: RemovedDeal = {
        ...buildDealFields(existingSaved, cleanId),
        removedAt: Date.now(),
      };
      setRemovedDeals((prev) => [removedEntry, ...prev.filter((r) => r.id !== cleanId)]);
    }
    adjustPopularity(cleanId, -1);
  };

  const restoreRemovedDeal = async (deal: RemovedDeal) => {
    const cleanId = sanitizeId(deal.id);
    const fields = buildDealFields(deal, cleanId);
    const restored: SavedDeal = {
      ...fields,
      ...(typeof fields.expiresAt === 'string' ? { reminderEnabled: true } : {}),
      savedAt: Date.now(),
    };
    setSavedDeals((prev) => [restored, ...prev.filter((d) => d.id !== cleanId)]);
    setRemovedDeals((prev) => prev.filter((r) => r.id !== cleanId));
    adjustPopularity(cleanId, 1);
  };

  const deleteRemovedDeal = async (dealId: string) => {
    const cleanId = sanitizeId(dealId);
    setRemovedDeals((prev) => prev.filter((r) => r.id !== cleanId));
  };

  const clearRemovedDeals = async () => {
    setRemovedDeals([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authLoading: false,
        authError,
        profile,
        savedDeals,
        removedDeals,
        savedIds,
        popularityCounts,
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
