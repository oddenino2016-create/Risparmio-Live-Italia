import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarPlus, Check, Download, ExternalLink, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  buildGoogleCalendarTemplateUrl,
  computeCalendarWindow,
  downloadCalendarIcs,
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
  const [createdEvent, setCreatedEvent] = useState<CreatedCalendarEvent | null>(null);

  useEffect(() => {
    if (!calendarTarget) return;
    setSummary(
      `Scadenza offerta: ${calendarTarget.merchant} (${calendarTarget.rewardLabel})`
    );
    setReminder24h(true);
    setReminder1h(true);
    setCreatedEvent(syncedCalendarEvents[calendarTarget.id] ?? null);
  }, [calendarTarget, syncedCalendarEvents]);

  useEffect(() => {
    if (!calendarTarget) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCalendarSync();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [calendarTarget, closeCalendarSync]);

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

  const googleCalendarUrl = useMemo(() => {
    if (!calendarTarget) return '#';
    try {
      return buildGoogleCalendarTemplateUrl(calendarTarget, { summary });
    } catch {
      return '#';
    }
  }, [calendarTarget, summary]);

  if (!calendarTarget) return null;

  const handleMarkGoogleOpened = () => {
    const eventInfo: CreatedCalendarEvent = {
      id: calendarTarget.id,
      htmlLink: googleCalendarUrl,
    };
    setCreatedEvent(eventInfo);
    markCalendarSynced(calendarTarget.id, eventInfo);
  };

  const handleDownloadIcs = () => {
    downloadCalendarIcs(calendarTarget, {
      summary,
      reminder24h,
      reminder1h,
    });
    const eventInfo: CreatedCalendarEvent = {
      id: calendarTarget.id,
      htmlLink: googleCalendarUrl,
    };
    setCreatedEvent(eventInfo);
    markCalendarSynced(calendarTarget.id, eventInfo);
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
                  ? 'Promemoria pronto per Google Calendar'
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
            aria-label="Chiudi finestra Google Calendar"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {createdEvent && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-emerald-900 leading-relaxed">
                Promemoria preparato per <span className="font-semibold">{calendarTarget.merchant}</span>.
                Puoi aprirlo su Google Calendar o scaricare il file <code className="font-mono">.ics</code>.
              </p>
            </div>
          )}

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
              Titolo evento sul calendario
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
              Avvisi inclusi nel file .ics (Apple / Google / Outlook)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={reminder24h}
                  onChange={(e) => setReminder24h(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span>24 ore prima</span>
              </label>
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={reminder1h}
                  onChange={(e) => setReminder1h(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span>1 ora prima</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={closeCalendarSync}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Chiudi
            </button>

            <button
              type="button"
              onClick={handleDownloadIcs}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Scarica .ics</span>
            </button>

            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleMarkGoogleOpened}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors"
            >
              <CalendarPlus className="w-4 h-4" aria-hidden="true" />
              <span>Apri in Google Calendar</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
