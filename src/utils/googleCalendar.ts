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

  // If upstream date came in at midnight or 23:59, schedule a practical morning slot (09:00-10:00) on that expiry day
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

function toGoogleCalendarUtcStamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildEventTextAndDetails(
  target: CalendarEventTarget,
  summaryOverride?: string
): { summary: string; details: string } {
  const summary = (
    summaryOverride?.trim() ||
    `Scadenza offerta: ${target.merchant} (${target.rewardLabel})`
  ).slice(0, 200);

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

  return { summary, details: lines.join('\n') };
}

export function buildGoogleCalendarTemplateUrl(
  target: CalendarEventTarget,
  options?: { summary?: string }
): string {
  const { startIso, endIso, timeZone } = computeCalendarWindow(target.expiresAt);
  const { summary, details } = buildEventTextAndDetails(target, options?.summary);

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', summary);
  url.searchParams.set(
    'dates',
    `${toGoogleCalendarUtcStamp(startIso)}/${toGoogleCalendarUtcStamp(endIso)}`
  );
  url.searchParams.set('details', details);
  url.searchParams.set('ctz', timeZone);
  return url.toString();
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function downloadCalendarIcs(
  target: CalendarEventTarget,
  options?: {
    summary?: string;
    reminder24h?: boolean;
    reminder1h?: boolean;
  }
): void {
  const { startIso, endIso } = computeCalendarWindow(target.expiresAt);
  const { summary, details } = buildEventTextAndDetails(target, options?.summary);
  const nowStamp = toGoogleCalendarUtcStamp(new Date().toISOString());
  const startStamp = toGoogleCalendarUtcStamp(startIso);
  const endStamp = toGoogleCalendarUtcStamp(endIso);
  const safeUid = `${target.id.replace(/[^a-zA-Z0-9_-]/g, '_')}@risparmiolive.it`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Risparmio Live Italia//Promemoria Offerte//IT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${safeUid}`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(details)}`,
  ];

  if (/^https?:\/\//i.test(target.offerUrl)) {
    lines.push(`URL:${target.offerUrl}`);
  }

  if (options?.reminder24h !== false) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Scade domani: ${summary}`)}`,
      'TRIGGER:-P1D',
      'END:VALARM'
    );
  }

  if (options?.reminder1h !== false) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Scade tra 1 ora: ${summary}`)}`,
      'TRIGGER:-PT1H',
      'END:VALARM'
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `scadenza-${target.merchant.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'offerta'}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
