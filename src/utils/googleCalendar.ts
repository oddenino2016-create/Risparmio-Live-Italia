import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.owned',
];

const calendarProvider = new GoogleAuthProvider();
for (const scope of CALENDAR_SCOPES) {
  calendarProvider.addScope(scope);
}
calendarProvider.setCustomParameters({
  prompt: 'consent select_account',
});

// Strict in-memory token cache (never stored in localStorage/sessionStorage)
let cachedCalendarAccessToken: string | null = null;

export function getCachedCalendarAccessToken(): string | null {
  return cachedCalendarAccessToken;
}

export function clearCalendarAccessToken(): void {
  cachedCalendarAccessToken = null;
}

export async function authorizeGoogleCalendar(): Promise<string> {
  const result = await signInWithPopup(auth, calendarProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error(
      'Impossibile ottenere il token di accesso per Google Calendar. Riprova e concedi il permesso richiesto.'
    );
  }
  cachedCalendarAccessToken = credential.accessToken;
  return credential.accessToken;
}

export interface CalendarEventTarget {
  id: string;
  merchant: string;
  title: string;
  rewardLabel: string;
  sourceName: string;
  offerUrl: string;
  expiresAt: string;
  couponCode?: string;
  note?: string;
}

export interface CreatedCalendarEvent {
  id: string;
  htmlLink?: string;
}

export function computeCalendarWindow(expiresAtIso: string): {
  startIso: string;
  endIso: string;
  timeZone: string;
} {
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
  const parsed = new Date(expiresAtIso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Data di scadenza non valida.');
  }

  // If the upstream date came in at midnight UTC/local or 23:59, schedule a practical morning reminder (09:00-10:00) on that expiry day
  const hours = parsed.getHours();
  const minutes = parsed.getMinutes();
  let start: Date;
  let end: Date;

  if ((hours === 0 && minutes === 0) || (hours === 23 && minutes >= 55)) {
    start = new Date(parsed);
    start.setHours(9, 0, 0, 0);
    end = new Date(start.getTime() + 60 * 60 * 1000);
  } else {
    end = parsed;
    start = new Date(parsed.getTime() - 60 * 60 * 1000);
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    timeZone,
  };
}

export async function createGoogleCalendarExpiryEvent(
  target: CalendarEventTarget,
  options?: {
    summary?: string;
    reminder24h?: boolean;
    reminder1h?: boolean;
  }
): Promise<CreatedCalendarEvent> {
  let token = getCachedCalendarAccessToken();
  if (!token) {
    token = await authorizeGoogleCalendar();
  }

  const { startIso, endIso, timeZone } = computeCalendarWindow(target.expiresAt);
  const summary =
    options?.summary?.trim() ||
    `Scadenza offerta: ${target.merchant} (${target.rewardLabel})`;

  const lines: string[] = [
    target.title,
    `Negozio: ${target.merchant}`,
    `Fonte: ${target.sourceName}`,
    `Vantaggio: ${target.rewardLabel}`,
  ];
  if (target.couponCode) {
    lines.push(`Codice sconto: ${target.couponCode}`);
  }
  if (target.note) {
    lines.push(`Nota personale: ${target.note}`);
  }
  if (/^https?:\/\//i.test(target.offerUrl)) {
    lines.push(`Link offerta: ${target.offerUrl}`);
  }

  const overrides: Array<{ method: 'popup'; minutes: number }> = [];
  if (options?.reminder24h !== false) {
    overrides.push({ method: 'popup', minutes: 1440 });
  }
  if (options?.reminder1h !== false) {
    overrides.push({ method: 'popup', minutes: 60 });
  }

  const body = {
    summary: summary.slice(0, 200),
    description: lines.join('\n'),
    start: {
      dateTime: startIso,
      timeZone,
    },
    end: {
      dateTime: endIso,
      timeZone,
    },
    reminders:
      overrides.length > 0
        ? { useDefault: false, overrides }
        : { useDefault: true },
    source: /^https?:\/\//i.test(target.offerUrl)
      ? { title: 'Risparmio Live Italia', url: target.offerUrl }
      : undefined,
  };

  const sendInsert = (bearer: string) =>
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  let res = await sendInsert(token);
  if (res.status === 401 || res.status === 403) {
    clearCalendarAccessToken();
    token = await authorizeGoogleCalendar();
    res = await sendInsert(token);
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const apiMsg =
      (errBody as { error?: { message?: string } })?.error?.message ||
      `Errore Google Calendar (${res.status})`;
    throw new Error(apiMsg);
  }

  const data = (await res.json()) as { id?: string; htmlLink?: string };
  return {
    id: data.id || target.id,
    htmlLink: data.htmlLink,
  };
}
