import fs from 'fs';
import path from 'path';
import type { OfferItem, SourceId, SourceStatus } from '../src/types/offers.js';
import { ALL_SOURCE_IDS } from './scrapers.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const VOLUMES_FILE = path.join(DATA_DIR, 'portal-volumes.json');

export interface DailyVolumeRecord {
  date: string; // YYYY-MM-DD (Europe/Rome)
  counts: Partial<Record<SourceId, number>>;
  updatedAt: string;
}

export interface PortalVolumeSeriesDay {
  date: string;
  label: string;
  total: number;
  recorded: boolean;
  counts: Record<SourceId, number>;
}

export interface PortalVolumeSummary {
  sourceId: SourceId;
  sourceName: string;
  currentCount: number;
  avg30d: number;
  max30d: number;
  codiceScontoCount: number;
  cashbackCount: number;
  provaGratisCount: number;
}

export interface PortalVolumeAnalytics {
  generatedAt: string;
  daysWindow: number;
  recordedDaysCount: number;
  days: PortalVolumeSeriesDay[];
  portals: PortalVolumeSummary[];
}

function getRomeDateKey(date = new Date()): string {
  // Format YYYY-MM-DD in Europe/Rome timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function readRecords(): DailyVolumeRecord[] {
  try {
    if (!fs.existsSync(VOLUMES_FILE)) return [];
    const raw = fs.readFileSync(VOLUMES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is DailyVolumeRecord =>
        Boolean(r) &&
        typeof r.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
        typeof r.counts === 'object' &&
        r.counts !== null
    );
  } catch {
    return [];
  }
}

export function recordDailyVolumes(sources: SourceStatus[], now = new Date()): void {
  if (sources.length === 0) return;
  const todayKey = getRomeDateKey(now);
  const records = readRecords();
  const byDate = new Map<string, DailyVolumeRecord>(records.map((r) => [r.date, r]));

  const existingCounts: Partial<Record<SourceId, number>> = {
    ...(byDate.get(todayKey)?.counts ?? {}),
  };

  for (const src of sources) {
    existingCounts[src.id] = src.itemCount;
  }

  byDate.set(todayKey, {
    date: todayKey,
    counts: existingCounts,
    updatedAt: now.toISOString(),
  });

  // Retain last 45 days on disk
  const sorted = Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-45);

  ensureDataDir();
  fs.writeFileSync(VOLUMES_FILE, JSON.stringify(sorted, null, 2), { mode: 0o600 });
}

const SOURCE_LABELS: Record<SourceId, string> = {
  bestshopping: 'Bestshopping',
  widilo: 'Widilo',
  letyshops: 'LetyShops',
  codicerisparmio: 'CodiceRisparmio',
  cashbackdeals: 'CashbackDeals',
  simplybestcoupons: 'SimplyBestCoupons',
  pgperte: 'P&G Per Te',
  dimmicosacerchi: 'DimmiCosaCerchi',
  scontrinofelice: 'ScontrinoFelice',
  scontiomaggio: 'ScontOmaggio',
  buyon: 'BuyOn',
};

export function getPortalVolumeAnalytics(
  currentSources: SourceStatus[],
  currentOffers: OfferItem[]
): PortalVolumeAnalytics {
  const daysWindow = 30;
  const records = readRecords();
  const byDate = new Map<string, DailyVolumeRecord>(records.map((r) => [r.date, r]));

  const today = new Date();
  const days: PortalVolumeSeriesDay[] = [];
  let recordedDaysCount = 0;

  for (let offset = daysWindow - 1; offset >= 0; offset--) {
    const dt = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000);
    const dateKey = getRomeDateKey(dt);
    const rec = byDate.get(dateKey);
    const isRecorded = Boolean(rec);
    if (isRecorded) recordedDaysCount += 1;

    const counts = {} as Record<SourceId, number>;
    let total = 0;
    for (const id of ALL_SOURCE_IDS) {
      const val = rec?.counts[id] ?? 0;
      counts[id] = val;
      total += val;
    }

    const [, mm, dd] = dateKey.split('-');
    days.push({
      date: dateKey,
      label: `${dd}/${mm}`,
      total,
      recorded: isRecorded,
      counts,
    });
  }

  const sourceMap = new Map(currentSources.map((s) => [s.id, s]));

  const portals: PortalVolumeSummary[] = ALL_SOURCE_IDS.map((sourceId) => {
    const srcStatus = sourceMap.get(sourceId);
    const portalOffers = currentOffers.filter((o) => o.sourceId === sourceId);

    const recordedValues = days
      .filter((d) => d.recorded)
      .map((d) => d.counts[sourceId] ?? 0);

    const currentCount = srcStatus?.itemCount ?? portalOffers.length;
    const sum30 = recordedValues.reduce((acc, v) => acc + v, 0);
    const avg30d =
      recordedValues.length > 0 ? Math.round((sum30 / recordedValues.length) * 10) / 10 : currentCount;
    const max30d =
      recordedValues.length > 0 ? Math.max(...recordedValues, currentCount) : currentCount;

    return {
      sourceId,
      sourceName: srcStatus?.name ?? SOURCE_LABELS[sourceId],
      currentCount,
      avg30d,
      max30d,
      codiceScontoCount: portalOffers.filter((o) => o.category === 'codice-sconto').length,
      cashbackCount: portalOffers.filter((o) => o.category === 'cashback').length,
      provaGratisCount: portalOffers.filter((o) => o.category === 'prova-gratis').length,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    daysWindow,
    recordedDaysCount,
    days,
    portals,
  };
}
