import { useEffect, useState } from 'react';
import {
  Bell,
  Bookmark,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  DEAL_CATEGORIES,
  type DealCategory,
  type OfferCategory,
} from '../types/offers';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  type BrowserPushStatus,
} from '../utils/notifications';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  onOpenProfile: () => void;
  onJumpToOffers: () => void;
}

const OFFER_TYPE_OPTIONS: Array<{ id: OfferCategory; label: string }> = [
  { id: 'codice-sconto', label: 'Codici Sconto' },
  { id: 'cashback', label: 'Cashback' },
  { id: 'prova-gratis', label: 'Prova Gratis' },
];

export function OnboardingModal({
  open,
  onClose,
  onComplete,
  onOpenProfile,
  onJumpToOffers,
}: OnboardingModalProps) {
  const { user, profile, savedDeals, signInWithGoogle, updatePreferences } = useAuth();

  const [step, setStep] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<DealCategory[]>([]);
  const [selectedOfferTypes, setSelectedOfferTypes] = useState<OfferCategory[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSavedFeedback, setPrefsSavedFeedback] = useState(false);
  const [pushStatus, setPushStatus] = useState<BrowserPushStatus>(() =>
    getBrowserNotificationPermission()
  );

  useEffect(() => {
    if (profile) {
      setSelectedCategories(profile.preferredCategories ?? []);
      setSelectedOfferTypes(profile.preferredOfferTypes ?? []);
    }
  }, [profile]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPrefsSavedFeedback(false);
    setPushStatus(getBrowserNotificationPermission());

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const totalSteps = 4;

  const toggleCategory = (catId: DealCategory) => {
    setPrefsSavedFeedback(false);
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const toggleOfferType = (typeId: OfferCategory) => {
    setPrefsSavedFeedback(false);
    setSelectedOfferTypes((prev) =>
      prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId]
    );
  };

  const handleSaveInlinePreferences = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setSavingPrefs(true);
    try {
      await updatePreferences({
        displayName: profile?.displayName || user.displayName || 'Utente',
        preferredCategories: selectedCategories,
        preferredOfferTypes: selectedOfferTypes,
        preferredSources: profile?.preferredSources ?? [],
        notifyOnNewDeals: profile?.notifyOnNewDeals ?? true,
      });
      setPrefsSavedFeedback(true);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleEnablePush = async () => {
    const next = await requestBrowserNotificationPermission();
    setPushStatus(next);
  };

  const handleFinish = () => {
    onComplete();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Progress Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Compass className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-700">
              Guida introduttiva · Passo {step + 1} di {totalSteps}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Salta tutorial
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi tutorial"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Step Indicator Bar */}
        <div className="grid grid-cols-4 gap-1 px-6 pt-4">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setStep(idx)}
              aria-label={`Vai al passo ${idx + 1}`}
              className={`h-1.5 rounded-sm transition-colors cursor-pointer ${
                idx <= step ? 'bg-emerald-700' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {step === 0 && (
            <div className="space-y-4">
              <h2
                id="onboarding-title"
                className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
              >
                Benvenuto su Risparmio Live Italia
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Questa applicazione raccoglie automaticamente codici sconto, cashback e promozioni
                prova gratis da 11 portali italiani. In meno di un minuto puoi personalizzare i tuoi
                avvisi e salvare le occasioni migliori.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <Bookmark className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900">Salva le offerte</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Conserva codici e link nei preferiti con note personali e scadenze.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900">Imposta preferenze</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Scegli categorie e portali che segui per filtrare e ricevere avvisi mirati.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-900">Ricerca IA &amp; Stima</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Cerca sconti con l&apos;IA e calcola il risparmio annuo su ogni scheda.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2
                id="onboarding-title"
                className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
              >
                Come salvare le offerte e stimare il risparmio
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Su ogni scheda offerta trovi due strumenti rapidi per organizzare i tuoi acquisti:
              </p>

              <div className="space-y-3">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
                    <Bookmark className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      1. Clicca su &ldquo;Salva&rdquo; nella scheda offerta
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      L&apos;offerta entra nel tuo elenco <strong>Profilo &rarr; Salvate</strong>.
                      Da lì puoi aggiungere un promemoria testuale e impostare la data di scadenza.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <Calculator className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">
                      2. Usa &ldquo;Stima annua&rdquo; per valutare la convenienza
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Imposta quante volte all&apos;anno usi quel tipo di promo e la tua spesa
                      media per vedere subito il risparmio totale annuo in euro.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-1 flex flex-wrap items-center gap-3">
                {user ? (
                  <span className="text-xs font-medium text-emerald-700 tabular-nums">
                    Account attivo ({savedDeals.length} offerte salvate al momento)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Accedi con Google per iniziare a salvare
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onComplete();
                    onJumpToOffers();
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Esplora il catalogo offerte
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2
                id="onboarding-title"
                className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
              >
                Imposta le tue preferenze di risparmio
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Seleziona subito le categorie e le tipologie che ti interessano: potrai filtrare la
                dashboard con il pulsante <strong>Le mie preferenze</strong> e ricevere avvisi
                quando arrivano nuove offerte compatibili.
              </p>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2">
                    Categorie di interesse
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {DEAL_CATEGORIES.map((cat) => {
                      const active = selectedCategories.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleCategory(cat.id)}
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
                    Tipologie di offerta preferite
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {OFFER_TYPE_OPTIONS.map((t) => {
                      const active = selectedOfferTypes.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleOfferType(t.id)}
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
              </div>

              <div className="pt-1 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={savingPrefs}
                  onClick={() => void handleSaveInlinePreferences()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {prefsSavedFeedback && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>
                    {user
                      ? savingPrefs
                        ? 'Salvataggio…'
                        : prefsSavedFeedback
                          ? 'Preferenze salvate!'
                          : 'Salva preferenze ora'
                      : 'Accedi con Google per salvare'}
                  </span>
                </button>

                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      onComplete();
                      onOpenProfile();
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Personalizza anche i portali
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2
                id="onboarding-title"
                className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
              >
                Avvisi in tempo reale e Promemoria Scadenza
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Quando un portale pubblica una nuova promozione in linea con le tue preferenze, o
                quando un&apos;offerta salvata sta per terminare entro 24 ore, ricevi un avviso
                diretto in app e una notifica push del browser.
              </p>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Notifiche Push del Browser
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {pushStatus === 'granted'
                        ? 'Notifiche push già attive su questo dispositivo.'
                        : pushStatus === 'denied'
                          ? 'Permesso negato nelle impostazioni del browser; puoi comunque usare i banner live in app.'
                          : pushStatus === 'unsupported'
                            ? 'Il browser attuale non supporta le notifiche push di sistema.'
                            : 'Attivale con un clic per non perdere nuove offerte o scadenze imminenti.'}
                    </p>
                  </div>
                </div>

                {pushStatus === 'default' && (
                  <button
                    type="button"
                    onClick={() => void handleEnablePush()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Attiva notifiche
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Puoi riaprire questa guida in qualsiasi momento dal collegamento{' '}
                <strong>Guida rapida</strong> sotto la barra di ricerca o nel footer.
              </p>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Indietro</span>
          </button>

          {step < totalSteps - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}
              className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <span>Avanti</span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Completa e inizia</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
