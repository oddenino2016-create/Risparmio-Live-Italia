import { useEffect, useState } from 'react';
import {
  Bell,
  Bookmark,
  CalendarCheck,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  ExternalLink,
  History,
  LogOut,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  type BrowserPushStatus,
} from '../utils/notifications';
import {
  DEAL_CATEGORIES,
  type DealCategory,
  type OfferCategory,
  type SourceId,
} from '../types/offers';

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  onTestNotification: (draft?: {
    preferredCategories: DealCategory[];
    preferredOfferTypes: OfferCategory[];
    preferredSources: SourceId[];
  }) => void;
}

const OFFER_TYPE_OPTIONS: Array<{ id: OfferCategory; label: string }> = [
  { id: 'codice-sconto', label: 'Codici Sconto' },
  { id: 'cashback', label: 'Cashback' },
  { id: 'prova-gratis', label: 'Prova Gratis' },
];

const SOURCE_OPTIONS: Array<{ id: SourceId; label: string }> = [
  { id: 'buyon', label: 'BuyOn' },
  { id: 'scontiomaggio', label: 'ScontOmaggio' },
  { id: 'letyshops', label: 'LetyShops Italia' },
  { id: 'bestshopping', label: 'Bestshopping' },
  { id: 'scontrinofelice', label: 'ScontrinoFelice' },
  { id: 'widilo', label: 'Widilo' },
  { id: 'pgperte', label: 'P&G Per Te' },
  { id: 'dimmicosacerchi', label: 'DimmiCosaCerchi' },
  { id: 'codicerisparmio', label: 'CodiceRisparmio' },
  { id: 'cashbackdeals', label: 'CashbackDeals' },
  { id: 'simplybestcoupons', label: 'SimplyBestCoupons' },
];

export function ProfileDrawer({ open, onClose, onTestNotification }: ProfileDrawerProps) {
  const {
    user,
    profile,
    savedDeals,
    removedDeals,
    signOutUser,
    updatePreferences,
    updateDealNote,
    updateDealReminder,
    removeSavedDeal,
    restoreRemovedDeal,
    deleteRemovedDeal,
    clearRemovedDeals,
    openCalendarSync,
    syncedCalendarEvents,
  } = useAuth();

  const [tab, setTab] = useState<'preferences' | 'saved' | 'history'>('preferences');
  const [displayName, setDisplayName] = useState('');
  const [preferredCategories, setPreferredCategories] = useState<DealCategory[]>([]);
  const [preferredOfferTypes, setPreferredOfferTypes] = useState<OfferCategory[]>([]);
  const [preferredSources, setPreferredSources] = useState<SourceId[]>([]);
  const [notifyOnNewDeals, setNotifyOnNewDeals] = useState(true);
  const [pushPermission, setPushPermission] = useState<BrowserPushStatus>(() =>
    getBrowserNotificationPermission()
  );
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyOnlyCodes, setHistoryOnlyCodes] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || user?.displayName || '');
      setPreferredCategories(profile.preferredCategories ?? []);
      setPreferredOfferTypes(profile.preferredOfferTypes ?? []);
      setPreferredSources(profile.preferredSources ?? []);
      setNotifyOnNewDeals(profile.notifyOnNewDeals ?? true);
    }
  }, [profile, user]);

  useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const d of savedDeals) {
      drafts[d.id] = d.note ?? '';
    }
    setNoteDrafts(drafts);
  }, [savedDeals]);

  if (!open || !user) return null;

  const toggleInList = <T extends string>(list: T[], val: T): T[] =>
    list.includes(val) ? list.filter((item) => item !== val) : [...list, val];

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePreferences({
        displayName,
        preferredCategories,
        preferredOfferTypes,
        preferredSources,
        notifyOnNewDeals,
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2400);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Profilo utente e offerte salvate"
    >
      <div className="w-full max-w-lg bg-white h-full border-l border-slate-200 flex flex-col">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName || 'Avatar utente'}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-slate-900 text-white text-sm font-bold flex items-center justify-center shrink-0">
                {(displayName || user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {profile?.displayName || user.displayName || 'Profilo Utente'}
              </h2>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi pannello profilo"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('preferences')}
              className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                tab === 'preferences'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Preferenze
            </button>
            <button
              type="button"
              onClick={() => setTab('saved')}
              className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors tabular-nums cursor-pointer ${
                tab === 'saved'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Salvate ({savedDeals.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors tabular-nums cursor-pointer ${
                tab === 'history'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Storico ({removedDeals.length})
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'preferences' ? (
            <form onSubmit={(e) => void handleSavePreferences(e)} className="space-y-6">
              <div>
                <label
                  htmlFor="profile-display-name"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Nome visualizzato
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  maxLength={80}
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Categorie merceologiche preferite
                </p>
                <div className="flex flex-wrap gap-2">
                  {DEAL_CATEGORIES.map((cat) => {
                    const active = preferredCategories.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() =>
                          setPreferredCategories((prev) => toggleInList(prev, cat.id))
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-700 border-emerald-700 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Tipologie di risparmio preferite
                </p>
                <div className="flex flex-wrap gap-2">
                  {OFFER_TYPE_OPTIONS.map((t) => {
                    const active = preferredOfferTypes.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setPreferredOfferTypes((prev) => toggleInList(prev, t.id))
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Portali monitorati preferiti
                </p>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_OPTIONS.map((src) => {
                    const active = preferredSources.includes(src.id);
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() =>
                          setPreferredSources((prev) => toggleInList(prev, src.id))
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
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
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyOnNewDeals}
                    onChange={(e) => setNotifyOnNewDeals(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    Avvisami quando una nuova offerta corrisponde alle categorie o ai portali salvati
                  </span>
                </label>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-600">
                    Notifiche push browser:{' '}
                    <span className="font-semibold text-slate-900">
                      {pushPermission === 'granted'
                        ? 'Attive'
                        : pushPermission === 'denied'
                          ? 'Bloccate dal browser'
                          : pushPermission === 'unsupported'
                            ? 'Non supportate'
                            : 'Disattive'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {pushPermission === 'default' && (
                      <button
                        type="button"
                        onClick={() => {
                          void requestBrowserNotificationPermission().then((res) =>
                            setPushPermission(res)
                          );
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 border border-emerald-200 rounded-lg hover:bg-emerald-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Attiva Push</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onTestNotification({
                          preferredCategories,
                          preferredOfferTypes,
                          preferredSources,
                        })
                      }
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Testa notifica
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {saving ? 'Salvataggio…' : 'Salva Preferenze'}
                </button>

                {savedToast && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Check className="w-4 h-4" aria-hidden="true" />
                    <span>Preferenze salvate</span>
                  </span>
                )}
              </div>
            </form>
          ) : tab === 'saved' ? (
            <div className="space-y-4">
              {savedDeals.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl px-6">
                  <Bookmark className="w-7 h-7 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-800">
                    Nessuna offerta salvata
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Clicca su &quot;Salva&quot; in qualsiasi scheda per conservarla nel tuo profilo.
                  </p>
                </div>
              ) : (
                savedDeals.map((deal) => {
                  const safeHref = /^https?:\/\//i.test(deal.offerUrl) ? deal.offerUrl : '#';
                  const toLocalInput = (iso: string | undefined): string => {
                    if (!iso) return '';
                    const d = new Date(iso);
                    if (Number.isNaN(d.getTime())) return '';
                    const pad = (n: number) => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  };

                  const localValue = toLocalInput(deal.expiresAt);
                  const expiryMs = deal.expiresAt ? Date.parse(deal.expiresAt) : NaN;
                  const msRemaining = Number.isNaN(expiryMs) ? null : expiryMs - Date.now();
                  const isExpired = msRemaining !== null && msRemaining <= 0;
                  const isWithin24h =
                    msRemaining !== null && msRemaining > 0 && msRemaining <= 24 * 60 * 60 * 1000;

                  return (
                    <div
                      key={deal.id}
                      className="p-4 border border-slate-200 rounded-xl bg-white space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500">
                            {deal.sourceName} · {deal.merchant}
                          </p>
                          <h3 className="text-sm font-semibold text-slate-900 mt-0.5">
                            {deal.title}
                          </h3>
                        </div>
                        <span className="text-xs font-mono font-semibold text-emerald-700 shrink-0">
                          {deal.rewardLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={280}
                          placeholder="Aggiungi una nota personale…"
                          value={noteDrafts[deal.id] ?? ''}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [deal.id]: e.target.value }))
                          }
                          onBlur={() => {
                            const draft = (noteDrafts[deal.id] ?? '').trim();
                            if (draft !== (deal.note ?? '')) {
                              void updateDealNote(deal.id, draft);
                            }
                          }}
                          className="flex-1 h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600"
                        />
                      </div>

                      {/* Promemoria Scadenza (-24h) */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor={`expiry-${deal.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700"
                          >
                            <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            <span>Scadenza offerta</span>
                          </label>

                          <div className="flex items-center gap-2">
                            <input
                              id={`expiry-${deal.id}`}
                              type="datetime-local"
                              value={localValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) {
                                  void updateDealReminder(deal.id, {
                                    expiresAt: '',
                                    reminderEnabled: false,
                                    reminderNotifiedAt: '',
                                  });
                                  return;
                                }
                                const parsed = new Date(val);
                                if (!Number.isNaN(parsed.getTime())) {
                                  void updateDealReminder(deal.id, {
                                    expiresAt: parsed.toISOString(),
                                    reminderEnabled: true,
                                    reminderNotifiedAt: '',
                                  });
                                }
                              }}
                              className="h-7 px-2 text-xs font-mono bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:border-emerald-600"
                            />
                            {deal.expiresAt && (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateDealReminder(deal.id, {
                                    expiresAt: '',
                                    reminderEnabled: false,
                                    reminderNotifiedAt: '',
                                  })
                                }
                                className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                Rimuovi
                              </button>
                            )}
                          </div>
                        </div>

                        {deal.expiresAt && !Number.isNaN(expiryMs) && (
                          <div className="space-y-2 pt-1 border-t border-slate-200/70">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={deal.reminderEnabled !== false}
                                  onChange={(e) =>
                                    void updateDealReminder(deal.id, {
                                      reminderEnabled: e.target.checked,
                                    })
                                  }
                                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                                />
                                <span>Promemoria push 24h prima</span>
                              </label>

                              <span
                                className={`text-[11px] font-medium tabular-nums ${
                                  isExpired
                                    ? 'text-rose-700'
                                    : deal.reminderNotifiedAt
                                      ? 'text-emerald-700'
                                      : isWithin24h
                                        ? 'text-amber-700'
                                        : 'text-slate-500'
                                }`}
                              >
                                {isExpired
                                  ? 'Offerta scaduta'
                                  : deal.reminderNotifiedAt
                                    ? 'Notifica -24h inviata'
                                    : isWithin24h
                                      ? 'In scadenza (< 24h)'
                                      : 'Avviso programmato'}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                openCalendarSync({
                                  id: deal.id,
                                  merchant: deal.merchant,
                                  title: deal.title,
                                  rewardLabel: deal.rewardLabel,
                                  sourceName: deal.sourceName,
                                  offerUrl: deal.offerUrl,
                                  expiresAt: deal.expiresAt!,
                                  couponCode: deal.couponCode,
                                  note: deal.note,
                                })
                              }
                              className={`w-full h-8 px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                                syncedCalendarEvents[deal.id]
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {syncedCalendarEvents[deal.id] ? (
                                <>
                                  <CalendarCheck
                                    className="w-3.5 h-3.5 text-emerald-700"
                                    aria-hidden="true"
                                  />
                                  <span>Aggiunto a Google Calendar</span>
                                </>
                              ) : (
                                <>
                                  <CalendarPlus
                                    className="w-3.5 h-3.5 text-emerald-700"
                                    aria-hidden="true"
                                  />
                                  <span>Aggiungi a Google Calendar</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <a
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-emerald-700"
                        >
                          <span>Apri offerta</span>
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        </a>

                        <button
                          type="button"
                          onClick={() => void removeSavedDeal(deal.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-800 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Rimuovi</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {removedDeals.length > 0 && (
                <div className="space-y-2.5 pb-2 border-b border-slate-100">
                  <div className="relative">
                    <Search
                      className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={historyQuery}
                      onChange={(e) => setHistoryQuery(e.target.value)}
                      placeholder="Cerca nello storico per negozio, titolo o codice sconto…"
                      aria-label="Cerca nello storico offerte"
                      className="w-full h-9 pl-8 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={historyOnlyCodes}
                        onChange={(e) => setHistoryOnlyCodes(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span>Solo con codice sconto</span>
                    </label>

                    {!confirmClearHistory ? (
                      <button
                        type="button"
                        onClick={() => setConfirmClearHistory(true)}
                        className="text-xs font-medium text-rose-700 hover:text-rose-800 cursor-pointer"
                      >
                        Svuota storico
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void clearRemovedDeals();
                            setConfirmClearHistory(false);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-rose-700 rounded hover:bg-rose-800 cursor-pointer"
                        >
                          Conferma svuota
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearHistory(false)}
                          className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Annulla
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(() => {
                const q = historyQuery.trim().toLowerCase();
                const filteredHistory = removedDeals.filter((item) => {
                  if (historyOnlyCodes && !item.couponCode && !item.couponHint) return false;
                  if (!q) return true;
                  const hay =
                    `${item.merchant} ${item.title} ${item.sourceName} ${item.couponCode ?? ''} ${item.note ?? ''}`.toLowerCase();
                  return hay.includes(q);
                });

                if (removedDeals.length === 0) {
                  return (
                    <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl px-6">
                      <History className="w-7 h-7 text-slate-300 mx-auto mb-2" aria-hidden="true" />
                      <p className="text-sm font-semibold text-slate-800">
                        Nessuna offerta nello storico
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Quando rimuovi un&apos;offerta dalle salvate, viene archiviata qui così
                        puoi recuperare in ogni momento vecchi codici sconto o appunti.
                      </p>
                    </div>
                  );
                }

                if (filteredHistory.length === 0) {
                  return (
                    <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl px-6">
                      <p className="text-sm font-semibold text-slate-800">
                        Nessun risultato nello storico
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Prova a modificare il testo cercato o disattiva il filtro codice sconto.
                      </p>
                    </div>
                  );
                }

                return filteredHistory.map((deal) => {
                  const safeHref = /^https?:\/\//i.test(deal.offerUrl) ? deal.offerUrl : '#';
                  const removedMs =
                    typeof deal.removedAt === 'number'
                      ? deal.removedAt
                      : typeof deal.removedAt === 'string'
                        ? Date.parse(deal.removedAt)
                        : (deal.removedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ??
                          null;
                  const removedLabel =
                    removedMs && !Number.isNaN(removedMs)
                      ? new Date(removedMs).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : null;

                  return (
                    <div
                      key={deal.id}
                      className="p-4 border border-slate-200 rounded-xl bg-slate-50/60 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500">
                            {deal.sourceName} · {deal.merchant}
                            {removedLabel ? ` · Rimossa il ${removedLabel}` : ''}
                          </p>
                          <h3 className="text-sm font-semibold text-slate-900 mt-0.5">
                            {deal.title}
                          </h3>
                        </div>
                        <span className="text-xs font-mono font-semibold text-emerald-700 shrink-0">
                          {deal.rewardLabel}
                        </span>
                      </div>

                      {deal.couponCode ? (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white border border-slate-200">
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-slate-500">
                              Codice sconto salvato
                            </p>
                            <p className="text-xs font-mono font-bold text-slate-900 truncate">
                              {deal.couponCode}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(deal.couponCode!).then(() => {
                                setCopiedCode(deal.id);
                                setTimeout(() => setCopiedCode(null), 1800);
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                          >
                            {copiedCode === deal.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                                <span>Copiato</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                                <span>Copia</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : deal.couponHint ? (
                        <p className="text-xs font-mono text-slate-600">
                          Suggerimento codice: {deal.couponHint}
                        </p>
                      ) : null}

                      {deal.note && (
                        <p className="text-xs text-slate-600 bg-white border border-slate-200/80 rounded-lg px-3 py-2">
                          Nota: {deal.note}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <a
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-emerald-700"
                        >
                          <span>Apri offerta</span>
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        </a>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => void restoreRemovedDeal(deal)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Ripristina</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void deleteRemovedDeal(deal.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-800 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Elimina</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>

        {/* Footer Local Persistence */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">Salvataggio locale nel browser</span>
          <button
            type="button"
            onClick={() => {
              void signOutUser();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Azzera dati locali</span>
          </button>
        </div>
      </div>
    </div>
  );
}
