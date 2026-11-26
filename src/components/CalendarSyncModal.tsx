import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarPlus, Check, ExternalLink, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  authorizeGoogleCalendar,
  computeCalendarWindow,
  createGoogleCalendarExpiryEvent,
  getCachedCalendarAccessToken,
  type CreatedCalendarEvent,
} from '../utils/googleCalendar';

export function CalendarSyncModal() {
  const {
    calendarTarget,
    syncedCalendarEvents,
    closeCalendarSync,
    markCalendarSynced,
  } = useAuth();

  const [summary, setSummary] = useState('');
  const [reminder24h, setReminder24h] = useState(true);
  const [reminder1h, setReminder1h] = useState(true);
  const [hasToken, setHasToken] = useState<boolean>(() =>
    Boolean(getCachedCalendarAccessToken())
  );
  const [authorizing, setAuthorizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<CreatedCalendarEvent | null>(null);

  useEffect(() => {
    if (!calendarTarget) return;
    setSummary(
      `Scadenza offerta: ${calendarTarget.merchant} (${calendarTarget.rewardLabel})`
    );
    setReminder24h(true);
    setReminder1h(true);
    setHasToken(Boolean(getCachedCalendarAccessToken()));
    setAuthorizing(false);
    setSubmitting(false);
    setError(null);
    setCreatedEvent(syncedCalendarEvents[calendarTarget.id] ?? null);
  }, [calendarTarget, syncedCalendarEvents]);

  useEffect(() => {
    if (!calendarTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting && !authorizing) {
        closeCalendarSync();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [calendarTarget, submitting, authorizing, closeCalendarSync]);

  const schedulePreview = useMemo(() => {
    if (!calendarTarget) return null;
    try {
      const win = computeCalendarWindow(calendarTarget.expiresAt);
      const start = new Date(win.startIso);
      const end = new Date(win.endIso);
      const dateStr = start.toLocaleDateString('it-IT', {
        weekday: 'short',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const startTime = start.toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const endTime = end.toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        dateStr,
        timeRange: `${startTime} – ${endTime}`,
        timeZone: win.timeZone,
      };
    } catch {
      return null;
    }
  }, [calendarTarget]);

  if (!calendarTarget) return null;

  const handleAuthorize = async () => {
    setError(null);
    setAuthorizing(true);
    try {
      await authorizeGoogleCalendar();
      setHasToken(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        setError(
          msg || 'Impossibile collegare Google Calendar. Riprova e concedi il permesso richiesto.'
        );
      }
    } finally {
      setAuthorizing(false);
    }
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await createGoogleCalendarExpiryEvent(calendarTarget, {
        summary,
        reminder24h,
        reminder1h,
      });
      setHasToken(Boolean(getCachedCalendarAccessToken()));
      setCreatedEvent(created);
      markCalendarSynced(calendarTarget.id, created);
    } catch (err) {
      setHasToken(Boolean(getCachedCalendarAccessToken()));
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('popup-closed-by-user')) {
        setError(
          msg || 'Errore durante la creazione del promemoria su Google Calendar.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-sync-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              {createdEvent ? (
                <CalendarCheck className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              ) : (
                <CalendarPlus className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="calendar-sync-modal-title"
                className="text-base font-bold text-slate-900 truncate"
              >
                {createdEvent
                  ? 'Promemoria aggiunto a Google Calendar'
                  : 'Aggiungi a Google Calendar'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {calendarTarget.merchant} · {calendarTarget.sourceName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeCalendarSync}
            disabled={submitting || authorizing}
            aria-label="Chiudi finestra Google Calendar"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdEvent ? (
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900">
                  Evento sincronizzato sul tuo calendario personale
                </p>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Il promemoria per <span className="font-semibold">{calendarTarget.merchant}</span>{' '}
                  è stato salvato nel tuo Google Calendar principale
                  {schedulePreview ? ` per ${schedulePreview.dateStr} (${schedulePreview.timeRange})` : ''}.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {createdEvent.htmlLink ? (
                <a
                  href={createdEvent.htmlLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <span>Apri in Google Calendar</span>
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-xs text-slate-500">Evento registrato con successo</span>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreatedEvent(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Crea un altro evento
                </button>
                <button
                  type="button"
                  onClick={closeCalendarSync}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleConfirmCreate(e)} className="p-6 space-y-5">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 leading-snug">
                  {calendarTarget.title}
                </p>
                <span className="text-xs font-mono font-semibold text-emerald-700 shrink-0">
                  {calendarTarget.rewardLabel}
                </span>
              </div>

              {schedulePreview && (
                <p className="text-xs text-slate-700 tabular-nums">
                  <span className="font-semibold text-slate-900">Data evento:</span>{' '}
                  {schedulePreview.dateStr} · {schedulePreview.timeRange}{' '}
                  <span className="text-slate-500">({schedulePreview.timeZone})</span>
                </p>
              )}

              {calendarTarget.couponCode && (
                <p className="text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Codice incluso:</span>{' '}
                  <span className="font-mono font-semibold">{calendarTarget.couponCode}</span>
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="calendar-event-summary"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Titolo evento su Google Calendar
              </label>
              <input
                id="calendar-event-summary"
                type="text"
                required
                maxLength={200}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Notifiche promemoria sul calendario
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={reminder24h}
                    onChange={(e) => setReminder24h(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>24 ore prima (popup)</span>
                </label>
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={reminder1h}
                    onChange={(e) => setReminder1h(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>1 ora prima (popup)</span>
                </label>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Confermando, verrà creato un nuovo evento sul tuo Google Calendar principale con i
              dettagli e il link dell&apos;offerta.
            </p>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
              >
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeCalendarSync}
                disabled={submitting || authorizing}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                Annulla
              </button>

              {!hasToken ? (
                <button
                  type="button"
                  onClick={() => void handleAuthorize()}
                  disabled={authorizing}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                  <span>{authorizing ? 'Connessione…' : 'Connetti Google Calendar'}</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <CalendarPlus className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {submitting
                      ? 'Salvataggio su Calendar…'
                      : 'Conferma e aggiungi a Google Calendar'}
                  </span>
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
