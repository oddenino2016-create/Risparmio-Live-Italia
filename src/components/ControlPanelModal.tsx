import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Lock,
  LogOut,
  Megaphone,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { AdSenseConfig, BroadcastMessage, CatalogSnapshot } from '../types/offers';
import { sendBrowserPushNotification } from '../utils/notifications';

const ADMIN_PIN_STORAGE_KEY = 'risparmio_live_local_admin_pin_v1';
const ADSENSE_STORAGE_KEY = 'risparmio_live_local_adsense_v1';
const BROADCASTS_STORAGE_KEY = 'risparmio_live_local_broadcasts_v1';

interface ControlPanelModalProps {
  open: boolean;
  onClose: () => void;
  adminToken: string | null;
  onAdminTokenChange: (token: string | null) => void;
  adsenseConfig: AdSenseConfig | null;
  onAdsenseUpdated: (next: AdSenseConfig) => void;
  snapshot: CatalogSnapshot | null;
  onSyncAll: () => void;
  isSyncing: boolean;
  onBroadcastCreated: (msg: BroadcastMessage) => void;
  onBroadcastRemoved: (id: string) => void;
}

async function hashPin(pin: string): Promise<string> {
  const clean = pin.trim();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(`risparmio-live:${clean}`);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `plain:${clean}`;
}

function readLocalBroadcasts(): BroadcastMessage[] {
  try {
    const raw = localStorage.getItem(BROADCASTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BroadcastMessage[]) : [];
  } catch {
    return [];
  }
}

export function ControlPanelModal({
  open,
  onClose,
  adminToken,
  onAdminTokenChange,
  adsenseConfig,
  onAdsenseUpdated,
  snapshot,
  onSyncAll,
  isSyncing,
  onBroadcastCreated,
  onBroadcastRemoved,
}: ControlPanelModalProps) {
  const [pinConfigured, setPinConfigured] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [tab, setTab] = useState<'adsense' | 'push' | 'catalog'>('adsense');
  const [enabled, setEnabled] = useState(false);
  const [publisherId, setPublisherId] = useState('');
  const [autoAds, setAutoAds] = useState(true);
  const [headerSlotId, setHeaderSlotId] = useState('');
  const [inFeedSlotId, setInFeedSlotId] = useState('');
  const [footerSlotId, setFooterSlotId] = useState('');
  const [inFeedInterval, setInFeedInterval] = useState(6);
  const [showAdminPreview, setShowAdminPreview] = useState(false);

  const [savingAdsense, setSavingAdsense] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedAdsTxt, setCopiedAdsTxt] = useState(false);

  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushLinkUrl, setPushLinkUrl] = useState('');
  const [pushSending, setPushSending] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastMessage[]>([]);

  useEffect(() => {
    if (!open) return;
    setAuthError(null);
    setSaveMessage(null);
    setSaveError(null);
    setPushFeedback(null);
    setPushError(null);
    try {
      setPinConfigured(Boolean(localStorage.getItem(ADMIN_PIN_STORAGE_KEY)));
    } catch {
      setPinConfigured(false);
    }
    setBroadcasts(readLocalBroadcasts());
  }, [open]);

  useEffect(() => {
    if (!adsenseConfig) return;
    setEnabled(adsenseConfig.enabled);
    setPublisherId(adsenseConfig.publisherId);
    setAutoAds(adsenseConfig.autoAds);
    setHeaderSlotId(adsenseConfig.headerSlotId);
    setInFeedSlotId(adsenseConfig.inFeedSlotId);
    setFooterSlotId(adsenseConfig.footerSlotId);
    setInFeedInterval(adsenseConfig.inFeedInterval);
    setShowAdminPreview(adsenseConfig.showAdminPreview);
  }, [adsenseConfig]);

  if (!open) return null;

  const isAuthenticated = Boolean(adminToken);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const storedHash = localStorage.getItem(ADMIN_PIN_STORAGE_KEY);
      const enteredHash = await hashPin(pinInput);
      if (!storedHash || storedHash !== enteredHash) {
        setAuthError('PIN non valido.');
        return;
      }
      setPinInput('');
      onAdminTokenChange('local-admin-session');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleBootstrapPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const cleanPin = pinInput.trim();
    if (!/^\d{4,12}$/.test(cleanPin)) {
      setAuthError('Il PIN deve contenere da 4 a 12 cifre.');
      return;
    }
    if (cleanPin !== confirmPinInput.trim()) {
      setAuthError('I due PIN inseriti non coincidono.');
      return;
    }
    setAuthSubmitting(true);
    try {
      const hashed = await hashPin(cleanPin);
      localStorage.setItem(ADMIN_PIN_STORAGE_KEY, hashed);
      setPinInput('');
      setConfirmPinInput('');
      setPinConfigured(true);
      onAdminTokenChange('local-admin-session');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleExitPanel = () => {
    onAdminTokenChange(null);
    onClose();
  };

  const handleSaveAdsense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setSavingAdsense(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const cleanPub = publisherId.trim();
      if (enabled && !/^ca-pub-\d{10,20}$/.test(cleanPub)) {
        setSaveError('Inserisci un Publisher ID valido nel formato ca-pub-1234567890123456.');
        return;
      }

      const nextConfig: AdSenseConfig = {
        enabled,
        publisherId: cleanPub,
        autoAds,
        headerSlotId: headerSlotId.trim(),
        inFeedSlotId: inFeedSlotId.trim(),
        footerSlotId: footerSlotId.trim(),
        inFeedInterval: Math.min(24, Math.max(3, Number(inFeedInterval) || 6)),
        showAdminPreview,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem(ADSENSE_STORAGE_KEY, JSON.stringify(nextConfig));
      onAdsenseUpdated(nextConfig);
      setSaveMessage('Configurazione Google AdSense salvata in locale.');
    } catch {
      setSaveError('Impossibile salvare la configurazione nel browser.');
    } finally {
      setSavingAdsense(false);
    }
  };

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setPushSending(true);
    setPushFeedback(null);
    setPushError(null);

    try {
      const cleanTitle = pushTitle.trim();
      const cleanBody = pushBody.trim();
      const cleanLink = pushLinkUrl.trim();
      if (cleanTitle.length < 2 || cleanBody.length < 2) {
        setPushError('Inserisci titolo e testo del messaggio.');
        return;
      }
      if (cleanLink && !/^https?:\/\/.+/i.test(cleanLink)) {
        setPushError('Il link di destinazione deve iniziare con https:// o http://.');
        return;
      }

      const msg: BroadcastMessage = {
        id: `bcast-${Date.now()}`,
        title: cleanTitle.slice(0, 100),
        body: cleanBody.slice(0, 320),
        linkUrl: cleanLink || undefined,
        createdAt: new Date().toISOString(),
      };

      const nextList = [msg, ...broadcasts].slice(0, 20);
      localStorage.setItem(BROADCASTS_STORAGE_KEY, JSON.stringify(nextList));
      setBroadcasts(nextList);
      onBroadcastCreated(msg);
      sendBrowserPushNotification(msg.title, msg.body, msg.linkUrl);

      setPushTitle('');
      setPushBody('');
      setPushLinkUrl('');
      setPushFeedback('Avviso pubblicato nel banner dell’app e inviato come notifica browser.');
    } finally {
      setPushSending(false);
    }
  };

  const handleDeleteBroadcast = (id: string) => {
    const nextList = broadcasts.filter((b) => b.id !== id);
    localStorage.setItem(BROADCASTS_STORAGE_KEY, JSON.stringify(nextList));
    setBroadcasts(nextList);
    onBroadcastRemoved(id);
  };

  const cleanPubNumeric = publisherId.trim().replace(/^ca-/, '');
  const adsTxtPreview = /^pub-\d{10,20}$/.test(cleanPubNumeric)
    ? `google.com, ${cleanPubNumeric}, DIRECT, f08c47fec0942fa0`
    : 'google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Pannello di Controllo Amministratore"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Pannello di Controllo
              </h2>
              <p className="text-xs text-slate-500">
                Gestione locale Google AdSense, annunci e stato catalogo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExitPanel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isAuthenticated ? 'Esci dal pannello' : 'Esci'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi pannello di controllo"
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {!pinConfigured ? (
            <form onSubmit={(e) => void handleBootstrapPin(e)} className="max-w-sm mx-auto py-4 space-y-4">
              <div className="text-center space-y-1.5">
                <Lock className="w-7 h-7 text-slate-700 mx-auto" aria-hidden="true" />
                <h3 className="text-base font-bold text-slate-900">
                  Configura PIN Amministratore
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Primo avvio: imposta un PIN locale (4–12 cifre) per proteggere le impostazioni
                  AdSense e il pannello di controllo su questo dispositivo.
                </p>
              </div>

              <div>
                <label
                  htmlFor="bootstrap-pin"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nuovo PIN (solo cifre)
                </label>
                <input
                  id="bootstrap-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,12}"
                  required
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Inserisci PIN (es. 6 cifre)"
                  className="w-full h-10 px-3 text-sm font-mono tracking-widest bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div>
                <label
                  htmlFor="bootstrap-pin-confirm"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Conferma PIN
                </label>
                <input
                  id="bootstrap-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,12}"
                  required
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="Ripeti il PIN"
                  className="w-full h-10 px-3 text-sm font-mono tracking-widest bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              {authError && (
                <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full h-10 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {authSubmitting ? 'Salvataggio…' : 'Imposta PIN e Accedi'}
              </button>
            </form>
          ) : !isAuthenticated ? (
            <form onSubmit={(e) => void handleLogin(e)} className="max-w-sm mx-auto py-6 space-y-4">
              <div className="text-center space-y-1.5">
                <Lock className="w-7 h-7 text-slate-700 mx-auto" aria-hidden="true" />
                <h3 className="text-base font-bold text-slate-900">
                  Accesso Riservato
                </h3>
                <p className="text-xs text-slate-600">
                  Inserisci il PIN locale per sbloccare le impostazioni AdSense e il pannello di
                  controllo.
                </p>
              </div>

              <div>
                <label
                  htmlFor="admin-pin-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  PIN di Accesso
                </label>
                <input
                  id="admin-pin-input"
                  type="password"
                  inputMode="numeric"
                  required
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full h-11 px-3 text-center text-base font-mono tracking-[0.35em] bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              {authError && (
                <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full h-10 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {authSubmitting ? 'Verifica in corso…' : 'Sblocca Pannello'}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTab('adsense')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    tab === 'adsense'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Google AdSense
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('push');
                    setBroadcasts(readLocalBroadcasts());
                  }}
                  className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    tab === 'push'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Messaggi Push
                </button>
                <button
                  type="button"
                  onClick={() => setTab('catalog')}
                  className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    tab === 'catalog'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Stato Fonti
                </button>
              </div>

              {tab === 'adsense' ? (
                <form onSubmit={handleSaveAdsense} className="space-y-5">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Attiva monetizzazione Google AdSense
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Carica lo script ufficiale AdSense e mostra gli spazi pubblicitari in pagina.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label="Attiva Google AdSense"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer shrink-0"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="adsense-pub-id"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Publisher ID Google AdSense
                      </label>
                      <input
                        id="adsense-pub-id"
                        type="text"
                        value={publisherId}
                        onChange={(e) => setPublisherId(e.target.value)}
                        placeholder="ca-pub-1234567890123456"
                        className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="adsense-header-slot"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Slot ID Banner Superiore (opzionale)
                      </label>
                      <input
                        id="adsense-header-slot"
                        type="text"
                        value={headerSlotId}
                        onChange={(e) => setHeaderSlotId(e.target.value)}
                        placeholder="es. 1234567890"
                        className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="adsense-infeed-slot"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Slot ID In-Feed tra le offerte (opzionale)
                      </label>
                      <input
                        id="adsense-infeed-slot"
                        type="text"
                        value={inFeedSlotId}
                        onChange={(e) => setInFeedSlotId(e.target.value)}
                        placeholder="es. 2345678901"
                        className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="adsense-footer-slot"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Slot ID Banner Footer (opzionale)
                      </label>
                      <input
                        id="adsense-footer-slot"
                        type="text"
                        value={footerSlotId}
                        onChange={(e) => setFooterSlotId(e.target.value)}
                        placeholder="es. 3456789012"
                        className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="adsense-interval"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Frequenza annuncio In-Feed (ogni N offerte)
                      </label>
                      <input
                        id="adsense-interval"
                        type="number"
                        min={3}
                        max={24}
                        value={inFeedInterval}
                        onChange={(e) => setInFeedInterval(Number(e.target.value) || 6)}
                        className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoAds}
                        onChange={(e) => setAutoAds(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span>Abilita annunci automatici Google (Auto Ads script globale)</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showAdminPreview}
                        onChange={(e) => setShowAdminPreview(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span>
                        Mostra segnaposto di anteprima se gli Slot ID non sono ancora inseriti
                      </span>
                    </label>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        Riga da inserire in public/ads.txt
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <code className="text-xs font-mono text-slate-700 truncate">
                        {adsTxtPreview}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(adsTxtPreview);
                          setCopiedAdsTxt(true);
                          setTimeout(() => setCopiedAdsTxt(false), 1800);
                        }}
                        className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedAdsTxt ? (
                          <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{copiedAdsTxt ? 'Copiato' : 'Copia'}</span>
                      </button>
                    </div>
                  </div>

                  {saveError && (
                    <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {saveError}
                    </p>
                  )}
                  {saveMessage && (
                    <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      {saveMessage}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={savingAdsense}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {savingAdsense ? 'Salvataggio…' : 'Salva Configurazione AdSense'}
                    </button>

                    <button
                      type="button"
                      onClick={handleExitPanel}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Esci dal pannello</span>
                    </button>
                  </div>
                </form>
              ) : tab === 'push' ? (
                <div className="space-y-6">
                  <form onSubmit={handleSendBroadcast} className="space-y-4">
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-2.5">
                        <Megaphone className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Pubblica Annuncio &amp; Notifica Push Locale
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Mostra un banner in evidenza nell&apos;app e attiva la notifica push del
                            browser su questo dispositivo.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="push-broadcast-title"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Titolo messaggio
                      </label>
                      <input
                        id="push-broadcast-title"
                        type="text"
                        required
                        minLength={2}
                        maxLength={100}
                        value={pushTitle}
                        onChange={(e) => setPushTitle(e.target.value)}
                        placeholder="Es. Offerta Lampo Amazon -40%!"
                        className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="push-broadcast-body"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Testo della notifica
                      </label>
                      <textarea
                        id="push-broadcast-body"
                        required
                        minLength={2}
                        maxLength={320}
                        rows={3}
                        value={pushBody}
                        onChange={(e) => setPushBody(e.target.value)}
                        placeholder="Scrivi il messaggio dell’avviso…"
                        className="w-full p-3 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 resize-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="push-broadcast-link"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Link di destinazione opzionale (https://…)
                      </label>
                      <input
                        id="push-broadcast-link"
                        type="url"
                        maxLength={500}
                        value={pushLinkUrl}
                        onChange={(e) => setPushLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    {pushError && (
                      <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        {pushError}
                      </p>
                    )}
                    {pushFeedback && (
                      <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        {pushFeedback}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="submit"
                        disabled={pushSending}
                        className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 inline-flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Send className="w-4 h-4" aria-hidden="true" />
                        <span>{pushSending ? 'Invio in corso…' : 'Pubblica Avviso'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExitPanel}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Esci dal pannello</span>
                      </button>
                    </div>
                  </form>

                  <div className="space-y-2.5">
                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      Messaggi pubblicati ({broadcasts.length})
                    </h3>
                    {broadcasts.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-xl">
                        Nessun messaggio pubblicato.
                      </p>
                    ) : (
                      <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                        {broadcasts.map((msg) => (
                          <li
                            key={msg.id}
                            className="p-3.5 flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">{msg.title}</p>
                              <p className="text-slate-600 mt-0.5 break-words">{msg.body}</p>
                              <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                                {new Date(msg.createdAt).toLocaleString('it-IT')}
                                {msg.linkUrl ? ` · ${msg.linkUrl}` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteBroadcast(msg.id)}
                              aria-label="Elimina messaggio"
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 border border-slate-200 rounded-xl">
                      <p className="text-xs text-slate-500">Offerte Totali</p>
                      <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                        {snapshot?.offers.length ?? 0}
                      </p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-xl">
                      <p className="text-xs text-slate-500">Revisione</p>
                      <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                        #{snapshot?.revision ?? 0}
                      </p>
                    </div>
                    <div className="p-4 border border-slate-200 rounded-xl">
                      <p className="text-xs text-slate-500">Modalità Hosting</p>
                      <p className="text-sm font-bold text-emerald-700 mt-1.5">
                        Statica (Gratuita)
                      </p>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {(snapshot?.sources ?? []).map((src) => (
                      <div
                        key={src.id}
                        className="px-4 py-3 flex items-center justify-between gap-4 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{src.name}</p>
                          <p className="text-slate-500">{src.note}</p>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-slate-800 shrink-0">
                          {src.itemCount} offerte ({src.status})
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={onSyncAll}
                      disabled={isSyncing}
                      className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 inline-flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{isSyncing ? 'Aggiornamento…' : 'Aggiorna Catalogo'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExitPanel}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Esci dal pannello</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
