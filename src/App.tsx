import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import {
  DEAL_CATEGORIES,
  type AdSenseConfig,
  type BroadcastMessage,
  type CatalogSnapshot,
  type DealCategory,
  type OfferCategory,
  type OfferItem,
  type OfferSortOption,
  type PortalVolumeAnalytics,
  type SourceId,
  type UserProfile,
} from './types/offers';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { OfferCard } from './components/OfferCard';
import { SourcesMonitor } from './components/SourcesMonitor';
import { ProfileDrawer } from './components/ProfileDrawer';
import { NotificationBanner } from './components/NotificationBanner';
import { BroadcastBanner } from './components/BroadcastBanner';
import { Footer } from './components/Footer';
import { AdSenseSlot, ensureAdSenseScript } from './components/AdSenseSlot';
import { ControlPanelModal } from './components/ControlPanelModal';
import { AiDealFinder } from './components/AiDealFinder';
import { PortalVolumeChart } from './components/PortalVolumeChart';
import { OnboardingModal } from './components/OnboardingModal';
import { RecommendedDealsSection } from './components/RecommendedDealsSection';
import { CalendarSyncModal } from './components/CalendarSyncModal';
import {
  evaluatePreferenceMatch,
  sendBrowserPushNotification,
  type PreferenceNotification,
} from './utils/notifications';

const SOURCE_FILTERS: Array<{ id: 'all' | SourceId; label: string }> = [
  { id: 'all', label: 'Tutti i portali' },
  { id: 'bestshopping', label: 'Bestshopping' },
  { id: 'widilo', label: 'Widilo' },
  { id: 'letyshops', label: 'LetyShops' },
  { id: 'codicerisparmio', label: 'CodiceRisparmio' },
  { id: 'cashbackdeals', label: 'CashbackDeals' },
  { id: 'simplybestcoupons', label: 'SimplyBestCoupons' },
  { id: 'pgperte', label: 'P&G Per Te' },
  { id: 'dimmicosacerchi', label: 'DimmiCosaCerchi' },
  { id: 'scontrinofelice', label: 'ScontrinoFelice' },
  { id: 'scontiomaggio', label: 'ScontOmaggio' },
  { id: 'buyon', label: 'BuyOn' },
];

const OFFER_TYPE_FILTERS: Array<{ id: 'all' | OfferCategory; label: string }> = [
  { id: 'all', label: 'Tutte le offerte' },
  { id: 'codice-sconto', label: 'Codici Sconto' },
  { id: 'cashback', label: 'Cashback' },
  { id: 'prova-gratis', label: 'Prova Gratis & Omaggio' },
];

const SORT_OPTIONS: Array<{ id: OfferSortOption; label: string }> = [
  { id: 'recent', label: 'Data di inserimento (Recenti)' },
  { id: 'expiring', label: 'Scadenza imminente' },
  { id: 'popularity', label: 'Popolarità (Numero salvataggi)' },
];

function MainWorkspace() {
  const {
    user,
    profile,
    savedDeals,
    savedIds,
    signInWithGoogle,
    toggleSaveDeal,
    updateDealReminder,
    authError,
    clearAuthError,
  } = useAuth();

  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncingTarget, setSyncingTarget] = useState<SourceId | 'all' | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [updateBanner, setUpdateBanner] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PreferenceNotification[]>([]);

  const [activeType, setActiveType] = useState<'all' | OfferCategory>('all');
  const [activeCategory, setActiveCategory] = useState<'all' | DealCategory>('all');
  const [activeSource, setActiveSource] = useState<'all' | SourceId>('all');
  const [onlyMyPreferences, setOnlyMyPreferences] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<OfferSortOption>('recent');
  const [popularityCounts, setPopularityCounts] = useState<Record<string, number>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [controlPanelOpen, setControlPanelOpen] = useState(
    () => typeof window !== 'undefined' && window.location.hash === '#admin'
  );
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adsenseConfig, setAdsenseConfig] = useState<AdSenseConfig | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);
  const [volumeAnalytics, setVolumeAnalytics] = useState<PortalVolumeAnalytics | null>(null);
  const [volumesLoading, setVolumesLoading] = useState(true);
  const [volumesError, setVolumesError] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (window.location.hash === '#admin') return false;
    try {
      return localStorage.getItem('risparmio_live_onboarding_v1_done') !== '1';
    } catch {
      return true;
    }
  });

  const dismissOnboarding = useCallback(() => {
    setOnboardingOpen(false);
    try {
      localStorage.setItem('risparmio_live_onboarding_v1_done', '1');
    } catch {
      // Ignore storage error
    }
  }, []);

  const lastRevisionRef = useRef<number>(0);
  const knownOfferIdsRef = useRef<Set<string>>(new Set());
  const profileRef = useRef<UserProfile | null>(null);
  const notifiedExpiryKeysRef = useRef<Set<string>>(new Set());
  const seenBroadcastIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const raw = localStorage.getItem('dismissed_broadcasts_v1');
        return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
      } catch {
        return new Set<string>();
      }
    })()
  );

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Fetch public Google AdSense display configuration and support #admin hash shortcut
  useEffect(() => {
    fetch('/api/adsense')
      .then((res) => (res.ok ? (res.json() as Promise<AdSenseConfig>) : null))
      .then((cfg) => {
        if (cfg) setAdsenseConfig(cfg);
      })
      .catch(() => {});

    const onHashChange = () => {
      if (window.location.hash === '#admin') {
        setControlPanelOpen(true);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (adsenseConfig?.enabled && adsenseConfig.autoAds && adsenseConfig.publisherId) {
      ensureAdSenseScript(adsenseConfig.publisherId);
    }
  }, [adsenseConfig]);

  // Promemoria Scadenza: invia notifica push 24 ore prima che un'offerta salvata termini
  useEffect(() => {
    if (!user || savedDeals.length === 0) return;

    const checkExpiryReminders = () => {
      const nowMs = Date.now();
      const window24hMs = 24 * 60 * 60 * 1000;

      for (const deal of savedDeals) {
        if (!deal.expiresAt || deal.reminderEnabled === false || deal.reminderNotifiedAt) {
          continue;
        }
        const expiryMs = Date.parse(deal.expiresAt);
        if (Number.isNaN(expiryMs)) continue;

        const remainingMs = expiryMs - nowMs;
        if (remainingMs <= 0 || remainingMs > window24hMs) continue;

        const sessionKey = `${deal.id}:${deal.expiresAt}`;
        if (notifiedExpiryKeysRef.current.has(sessionKey)) continue;
        notifiedExpiryKeysRef.current.add(sessionKey);

        const hoursLeft = Math.floor(remainingMs / (60 * 60 * 1000));
        const minsLeft = Math.max(1, Math.floor((remainingMs % (60 * 60 * 1000)) / 60000));
        const timeLabel = hoursLeft >= 1 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft} minuti`;

        const offerItem: OfferItem = {
          id: deal.id,
          title: deal.title,
          merchant: deal.merchant,
          description: deal.description,
          category: deal.category,
          tags: deal.tags,
          sourceId: deal.sourceId,
          sourceName: deal.sourceName,
          sourceUrl: deal.offerUrl,
          offerUrl: deal.offerUrl,
          rewardLabel: deal.rewardLabel,
          couponCode: deal.couponCode,
          couponHint: deal.couponHint,
          imageUrl: deal.imageUrl,
          expiresAt: deal.expiresAt,
          updatedAt: new Date().toISOString(),
        };

        const alertEntry: PreferenceNotification = {
          id: `expiry-${deal.id}-${nowMs}`,
          offer: offerItem,
          reasons: [`Promemoria Scadenza (-24h)`, `Termina tra ${timeLabel}`],
          createdAt: new Date().toISOString(),
          read: false,
        };

        setNotifications((prev) => [alertEntry, ...prev].slice(0, 15));

        sendBrowserPushNotification(
          `Promemoria Scadenza: ${deal.merchant}`,
          `L'offerta "${deal.title}" scade tra ${timeLabel}!`,
          deal.offerUrl
        );

        void updateDealReminder(deal.id, {
          reminderNotifiedAt: new Date(nowMs).toISOString(),
        });
      }
    };

    checkExpiryReminders();
    const timer = setInterval(checkExpiryReminders, 30_000);
    return () => clearInterval(timer);
  }, [user, savedDeals, updateDealReminder]);

  const dispatchPreferenceNotifications = useCallback(
    (newOffers: OfferItem[], activeProfile: UserProfile | null) => {
      if (!activeProfile || !activeProfile.notifyOnNewDeals || newOffers.length === 0) {
        return;
      }

      const matchedEntries: PreferenceNotification[] = [];
      const nowIso = new Date().toISOString();

      for (const offer of newOffers) {
        const { matched, reasons } = evaluatePreferenceMatch(offer, activeProfile);
        if (matched) {
          matchedEntries.push({
            id: `${offer.id}-${Date.now()}`,
            offer,
            reasons,
            createdAt: nowIso,
            read: false,
          });
        }
      }

      if (matchedEntries.length === 0) return;

      setNotifications((prev) => {
        const existingOfferIds = new Set(prev.map((n) => n.offer.id));
        const uniqueNew = matchedEntries.filter((m) => !existingOfferIds.has(m.offer.id));
        return [...uniqueNew, ...prev].slice(0, 15);
      });

      const top = matchedEntries[0];
      const pushTitle =
        matchedEntries.length === 1
          ? `Nuova offerta: ${top.offer.merchant} (${top.offer.rewardLabel})`
          : `${matchedEntries.length} nuove offerte per le tue preferenze`;
      const pushBody =
        matchedEntries.length === 1
          ? `${top.offer.title} · ${top.reasons.join(' · ')}`
          : `Ultima: ${top.offer.merchant} — ${top.offer.title}`;

      sendBrowserPushNotification(pushTitle, pushBody, top.offer.offerUrl);
    },
    []
  );

  const handleIncomingSnapshot = useCallback(
    (next: CatalogSnapshot, isFromUpdateEvent: boolean) => {
      const prevKnown = knownOfferIdsRef.current;
      const incomingIds = new Set(next.offers.map((o) => o.id));

      if (isFromUpdateEvent && prevKnown.size > 0 && next.revision > lastRevisionRef.current) {
        const newlyArrived = next.offers.filter(
          (o) => o.isNew || !prevKnown.has(o.id)
        );
        dispatchPreferenceNotifications(newlyArrived, profileRef.current);

        const latestChange = next.recentChanges[0];
        if (latestChange && (profileRef.current?.notifyOnNewDeals ?? true)) {
          setUpdateBanner(`${latestChange.sourceName}: ${latestChange.summary}`);
        }
      }

      knownOfferIdsRef.current = incomingIds;
      lastRevisionRef.current = next.revision;
      setSnapshot(next);
      setLoading(false);
    },
    [dispatchPreferenceNotifications]
  );

  const loadVolumeAnalytics = useCallback(async () => {
    try {
      setVolumesError(null);
      const res = await fetch('/api/analytics/volumes');
      if (!res.ok) throw new Error('Errore nel caricamento delle statistiche D3.js');
      const data = (await res.json()) as PortalVolumeAnalytics;
      setVolumeAnalytics(data);
    } catch (err) {
      setVolumesError(err instanceof Error ? err.message : 'Errore di rete');
    } finally {
      setVolumesLoading(false);
    }
  }, []);

  const loadOffers = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch('/api/offers');
      if (!res.ok) throw new Error('Errore nel caricamento delle offerte');
      const data = (await res.json()) as CatalogSnapshot;
      handleIncomingSnapshot(data, false);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Errore di rete');
      setLoading(false);
    }
  }, [handleIncomingSnapshot]);

  const dismissBroadcast = useCallback((id: string) => {
    seenBroadcastIdsRef.current.add(id);
    try {
      localStorage.setItem(
        'dismissed_broadcasts_v1',
        JSON.stringify(Array.from(seenBroadcastIdsRef.current).slice(-50))
      );
    } catch {
      // Ignore storage error
    }
    setBroadcasts((prev) => prev.filter((b) => b.id !== id));
  }, []);

  useEffect(() => {
    void loadOffers();
    void loadVolumeAnalytics();

    fetch('/api/offers/popularity')
      .then((res) => (res.ok ? (res.json() as Promise<{ counts?: Record<string, number> }>) : null))
      .then((data) => {
        if (data?.counts) setPopularityCounts(data.counts);
      })
      .catch(() => {});

    const eventSource = new EventSource('/api/stream');
    eventSource.onopen = () => setSseConnected(true);
    eventSource.onerror = () => setSseConnected(false);

    eventSource.addEventListener('snapshot', (ev) => {
      try {
        const next = JSON.parse((ev as MessageEvent).data) as CatalogSnapshot;
        handleIncomingSnapshot(next, true);
        void loadVolumeAnalytics();
      } catch {
        // Ignore malformed SSE payload
      }
    });

    eventSource.addEventListener('checked', (ev) => {
      try {
        const next = JSON.parse((ev as MessageEvent).data) as CatalogSnapshot;
        setSnapshot(next);
      } catch {
        // Ignore
      }
    });

    eventSource.addEventListener('broadcasts', (ev) => {
      try {
        const list = JSON.parse((ev as MessageEvent).data) as BroadcastMessage[];
        setBroadcasts(list.filter((b) => !seenBroadcastIdsRef.current.has(b.id)));
      } catch {
        // Ignore
      }
    });

    eventSource.addEventListener('broadcast', (ev) => {
      try {
        const msg = JSON.parse((ev as MessageEvent).data) as BroadcastMessage;
        setBroadcasts((prev) => [msg, ...prev.filter((item) => item.id !== msg.id)]);
        sendBrowserPushNotification(msg.title, msg.body, msg.linkUrl);
      } catch {
        // Ignore
      }
    });

    eventSource.addEventListener('broadcast_removed', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as { id?: string };
        if (payload.id) {
          setBroadcasts((prev) => prev.filter((b) => b.id !== payload.id));
        }
      } catch {
        // Ignore
      }
    });

    eventSource.addEventListener('popularity', (ev) => {
      try {
        const counts = JSON.parse((ev as MessageEvent).data) as Record<string, number>;
        if (counts && typeof counts === 'object') {
          setPopularityCounts(counts);
        }
      } catch {
        // Ignore
      }
    });

    return () => {
      eventSource.close();
    };
  }, [loadOffers, handleIncomingSnapshot]);

  const handleSync = async (sourceId?: SourceId) => {
    setSyncingTarget(sourceId ?? 'all');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          snapshot: CatalogSnapshot;
          changedSources: SourceId[];
        };
        handleIncomingSnapshot(data.snapshot, true);
        void loadVolumeAnalytics();
        if (data.changedSources.length > 0) {
          setUpdateBanner(
            `Aggiornamento completato: rilevate novità su ${data.changedSources.length} fonti.`
          );
        } else {
          setUpdateBanner('Tutte le fonti sono già all’ultima versione disponibile.');
        }
      }
    } finally {
      setSyncingTarget(null);
    }
  };

  const handleTestPreferenceNotification = (draft?: {
    preferredCategories: DealCategory[];
    preferredOfferTypes: OfferCategory[];
    preferredSources: SourceId[];
  }) => {
    const effectiveProfile: UserProfile | null = profile
      ? {
          ...profile,
          preferredCategories: draft?.preferredCategories ?? profile.preferredCategories,
          preferredOfferTypes: draft?.preferredOfferTypes ?? profile.preferredOfferTypes,
          preferredSources: draft?.preferredSources ?? profile.preferredSources,
          notifyOnNewDeals: true,
        }
      : null;

    if (!effectiveProfile) return;

    const offers = snapshot?.offers ?? [];
    const matching = offers.filter(
      (o) => evaluatePreferenceMatch(o, effectiveProfile).matched
    );

    if (matching.length === 0) {
      setUpdateBanner(
        'Seleziona almeno una categoria, tipologia o portale nelle preferenze per ricevere avvisi mirati.'
      );
      return;
    }

    // Pick a top matching offer and dispatch both banner & browser push notification
    const sampleOffer = matching[0];
    const { reasons } = evaluatePreferenceMatch(sampleOffer, effectiveProfile);
    const entry: PreferenceNotification = {
      id: `test-${sampleOffer.id}-${Date.now()}`,
      offer: sampleOffer,
      reasons,
      createdAt: new Date().toISOString(),
      read: false,
    };

    setNotifications((prev) => [entry, ...prev.filter((p) => p.offer.id !== sampleOffer.id)].slice(0, 15));
    sendBrowserPushNotification(
      `Offerta per te: ${sampleOffer.merchant} (${sampleOffer.rewardLabel})`,
      `${sampleOffer.title} · ${reasons.join(' · ')}`,
      sampleOffer.offerUrl
    );
    setProfileOpen(false);
  };

  const hasUserPrefs = Boolean(
    user &&
      profile &&
      (profile.preferredCategories.length > 0 ||
        profile.preferredOfferTypes.length > 0 ||
        profile.preferredSources.length > 0)
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<DealCategory, number>();
    for (const c of DEAL_CATEGORIES) counts.set(c.id, 0);
    for (const offer of snapshot?.offers ?? []) {
      for (const tag of offer.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [snapshot]);

  const getSaveCount = useCallback(
    (offerId: string): number =>
      Math.max(popularityCounts[offerId] ?? 0, savedIds.has(offerId) ? 1 : 0),
    [popularityCounts, savedIds]
  );

  const filteredOffers = useMemo(() => {
    const list = snapshot?.offers ?? [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = list.filter((offer) => {
      if (activeType !== 'all' && offer.category !== activeType) return false;
      if (activeCategory !== 'all' && !offer.tags.includes(activeCategory)) return false;
      if (activeSource !== 'all' && offer.sourceId !== activeSource) return false;
      if (onlySaved && !savedIds.has(offer.id)) return false;

      if (onlyMyPreferences && profile) {
        const catMatch =
          profile.preferredCategories.length === 0 ||
          offer.tags.some((t) => profile.preferredCategories.includes(t));
        const typeMatch =
          profile.preferredOfferTypes.length === 0 ||
          profile.preferredOfferTypes.includes(offer.category);
        const srcMatch =
          profile.preferredSources.length === 0 ||
          profile.preferredSources.includes(offer.sourceId);
        if (!catMatch || !typeMatch || !srcMatch) return false;
      }

      if (q) {
        const haystack =
          `${offer.title} ${offer.merchant} ${offer.description} ${offer.sourceName} ${offer.rewardLabel} ${offer.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    const indexMap = new Map(filtered.map((item, idx) => [item.id, idx]));
    const nowMs = Date.now();

    const parseOfferTimestamp = (offer: OfferItem): number => {
      const candidates = [offer.publishedAt, offer.firstSeenAt, offer.updatedAt];
      let latest = 0;
      for (const raw of candidates) {
        if (!raw) continue;
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed) && parsed > latest) {
          latest = parsed;
        }
      }
      return latest;
    };

    return [...filtered].sort((a, b) => {
      if (sortBy === 'popularity') {
        const countDiff = getSaveCount(b.id) - getSaveCount(a.id);
        if (countDiff !== 0) return countDiff;
      } else if (sortBy === 'expiring') {
        const expA = a.expiresAt ? Date.parse(a.expiresAt) : NaN;
        const expB = b.expiresAt ? Date.parse(b.expiresAt) : NaN;
        const validA = !Number.isNaN(expA);
        const validB = !Number.isNaN(expB);
        const futureA = validA && expA > nowMs;
        const futureB = validB && expB > nowMs;

        if (futureA !== futureB) return futureA ? -1 : 1;
        if (futureA && futureB && expA !== expB) return expA - expB;
        if (validA !== validB) return validA ? -1 : 1;
        if (validA && validB && expA !== expB) return expB - expA;
      } else {
        const newDiff = (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0);
        if (newDiff !== 0) return newDiff;
        const timeDiff = parseOfferTimestamp(b) - parseOfferTimestamp(a);
        if (timeDiff !== 0) return timeDiff;
      }

      return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
    });
  }, [
    snapshot,
    activeType,
    activeCategory,
    activeSource,
    onlySaved,
    onlyMyPreferences,
    profile,
    savedIds,
    searchQuery,
    sortBy,
    getSaveCount,
  ]);

  const resetFilters = () => {
    setActiveType('all');
    setActiveCategory('all');
    setActiveSource('all');
    setOnlyMyPreferences(false);
    setOnlySaved(false);
    setSearchQuery('');
    setSortBy('recent');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        activeType={activeType}
        onSelectType={setActiveType}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenControlPanel={() => setControlPanelOpen(true)}
      />

      {/* Admin Broadcast Push Announcements */}
      <BroadcastBanner broadcasts={broadcasts} onDismiss={dismissBroadcast} />

      {/* Preference-matched Real-Time Notification Banner */}
      <NotificationBanner
        notifications={notifications}
        onDismissOne={(id) => setNotifications((prev) => prev.filter((n) => n.id !== id))}
        onDismissAll={() => setNotifications([])}
        onMarkAllRead={() =>
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        }
        onOpenPreferences={() => setProfileOpen(true)}
      />

      {/* Real-time sync or auth notice bar */}
      {(updateBanner || authError) && (
        <div className="bg-slate-900 text-white text-xs py-2.5 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p className="truncate">{authError || updateBanner}</p>
            <button
              type="button"
              onClick={() => {
                setUpdateBanner(null);
                clearAuthError();
              }}
              className="text-slate-300 hover:text-white font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        <HeroSection
          snapshot={snapshot}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSyncNow={() => void handleSync()}
          isSyncing={syncingTarget === 'all'}
          sseConnected={sseConnected}
          onOpenOnboarding={() => setOnboardingOpen(true)}
        />

        {/* Top AdSense Leaderboard Placement */}
        {adsenseConfig?.enabled && (adsenseConfig.headerSlotId || adsenseConfig.showAdminPreview) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <AdSenseSlot
              config={adsenseConfig}
              slotId={adsenseConfig.headerSlotId}
              placementLabel="Banner Superiore"
              format="horizontal"
            />
          </div>
        )}

        {/* AI Discount & Coupon Finder */}
        <AiDealFinder
          catalogOffers={snapshot?.offers ?? []}
          savedIds={savedIds}
          onToggleSave={(item) => void toggleSaveDeal(item)}
        />

        {/* D3.js 30-Day Active Offer Volume Visualization */}
        <PortalVolumeChart
          analytics={volumeAnalytics}
          loading={volumesLoading}
          error={volumesError}
          onRetry={() => void loadVolumeAnalytics()}
          onSelectSourceFilter={(sourceId) => setActiveSource(sourceId)}
        />

        {/* Tag-Based Personalized Recommendations */}
        <RecommendedDealsSection
          isAuthenticated={Boolean(user)}
          catalogOffers={snapshot?.offers ?? []}
          savedDeals={savedDeals}
          savedIds={savedIds}
          getSaveCount={getSaveCount}
          onToggleSave={(item) => void toggleSaveDeal(item)}
          onSignIn={() => void signInWithGoogle()}
        />

        {/* Offers Catalog Section */}
        <section id="offerte" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          {/* Interactive Filter Controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
                role="tablist"
                aria-label="Filtra per tipologia"
              >
                {OFFER_TYPE_FILTERS.map((t) => {
                  const active = activeType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveType(t.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {user && (
                  <>
                    {hasUserPrefs && (
                      <button
                        type="button"
                        onClick={() => setOnlyMyPreferences((v) => !v)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          onlyMyPreferences
                            ? 'bg-emerald-700 border-emerald-700 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Le mie preferenze
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOnlySaved((v) => !v)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                        onlySaved
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Salvate ({savedIds.size})
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 mr-1">Categoria:</span>
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === 'all'
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Tutte
              </button>
              {DEAL_CATEGORIES.map((cat) => {
                const active = activeCategory === cat.id;
                const count = categoryCounts.get(cat.id) ?? 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                      active
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {cat.label} ({count})
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 mr-1">Portale:</span>
                {SOURCE_FILTERS.map((src) => {
                  const active = activeSource === src.id;
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => setActiveSource(src.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {src.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="offers-sort-select"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                    <span>Ordina per:</span>
                  </label>
                  <select
                    id="offers-sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as OfferSortOption)}
                    className="h-8 pl-2.5 pr-7 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-600 cursor-pointer"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
                  {filteredOffers.length} risultati mostrati
                </span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-xl h-80 animate-pulse p-5 flex flex-col justify-between"
                >
                  <div className="h-24 bg-slate-100 rounded-lg" />
                  <div className="space-y-2.5">
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                    <div className="h-4 bg-slate-100 rounded w-4/5" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                  </div>
                  <div className="h-10 bg-slate-100 rounded-lg" />
                </div>
              ))}
            </div>
          ) : fetchError ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <h2 className="text-base font-bold text-slate-900">
                Impossibile caricare le offerte
              </h2>
              <p className="text-sm text-slate-600 mt-1 mb-5">{fetchError}</p>
              <button
                type="button"
                onClick={() => void loadOffers()}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Riprova
              </button>
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <h2 className="text-base font-bold text-slate-900">
                Nessuna offerta corrisponde ai filtri selezionati
              </h2>
              <p className="text-sm text-slate-600 mt-1 mb-5">
                Prova a cambiare categoria merceologica, tipologia di risparmio o termine di ricerca.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Reimposta tutti i filtri
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOffers.map((offer, index) => {
                const interval = adsenseConfig?.inFeedInterval ?? 6;
                const showInFeedAd =
                  Boolean(
                    adsenseConfig?.enabled &&
                      (adsenseConfig.inFeedSlotId || adsenseConfig.showAdminPreview)
                  ) &&
                  (index + 1) % interval === 0 &&
                  index < filteredOffers.length - 1;

                return (
                  <Fragment key={offer.id}>
                    <OfferCard
                      offer={offer}
                      isSaved={savedIds.has(offer.id)}
                      saveCount={getSaveCount(offer.id)}
                      onToggleSave={(item) => void toggleSaveDeal(item)}
                    />
                    {showInFeedAd && (
                      <div className="md:col-span-2 lg:col-span-3">
                        <AdSenseSlot
                          config={adsenseConfig}
                          slotId={adsenseConfig?.inFeedSlotId ?? ''}
                          placementLabel="Annuncio In-Feed"
                          format="fluid"
                        />
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer AdSense Placement */}
        {adsenseConfig?.enabled && (adsenseConfig.footerSlotId || adsenseConfig.showAdminPreview) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
            <AdSenseSlot
              config={adsenseConfig}
              slotId={adsenseConfig.footerSlotId}
              placementLabel="Banner Footer"
              format="horizontal"
            />
          </div>
        )}

        <SourcesMonitor
          sources={snapshot?.sources ?? []}
          recentChanges={snapshot?.recentChanges ?? []}
          syncingSourceId={syncingTarget}
          onSyncSource={(id) => void handleSync(id)}
          onOpenControlPanel={() => setControlPanelOpen(true)}
        />
      </main>

      <Footer
        onOpenControlPanel={() => setControlPanelOpen(true)}
        onOpenOnboarding={() => setOnboardingOpen(true)}
      />

      <ProfileDrawer
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onTestNotification={handleTestPreferenceNotification}
      />

      <ControlPanelModal
        open={controlPanelOpen}
        onClose={() => setControlPanelOpen(false)}
        adminToken={adminToken}
        onAdminTokenChange={setAdminToken}
        adsenseConfig={adsenseConfig}
        onAdsenseUpdated={setAdsenseConfig}
        snapshot={snapshot}
        onSyncAll={() => void handleSync()}
        isSyncing={syncingTarget === 'all'}
      />

      <OnboardingModal
        open={onboardingOpen}
        onClose={dismissOnboarding}
        onComplete={dismissOnboarding}
        onOpenProfile={() => setProfileOpen(true)}
        onJumpToOffers={() => {
          const el = document.getElementById('offerte');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <CalendarSyncModal />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainWorkspace />
      </AuthProvider>
    </ErrorBoundary>
  );
}
