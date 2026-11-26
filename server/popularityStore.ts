import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const POPULARITY_FILE = path.join(DATA_DIR, 'offer-popularity.json');

interface PopularityStoreData {
  counts: Record<string, number>;
  updatedAt: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readPopularityCounts(): Record<string, number> {
  try {
    if (!fs.existsSync(POPULARITY_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(POPULARITY_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PopularityStoreData>;
    if (!parsed.counts || typeof parsed.counts !== 'object') {
      return {};
    }
    const clean: Record<string, number> = {};
    for (const [key, val] of Object.entries(parsed.counts)) {
      if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
        clean[key] = Math.floor(val);
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function adjustOfferPopularity(
  dealId: string,
  delta: 1 | -1
): Record<string, number> {
  const cleanId = dealId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (!cleanId) return readPopularityCounts();

  const counts = readPopularityCounts();
  const nextVal = Math.max(0, (counts[cleanId] ?? 0) + delta);
  if (nextVal > 0) {
    counts[cleanId] = nextVal;
  } else {
    delete counts[cleanId];
  }

  try {
    ensureDataDir();
    const payload: PopularityStoreData = {
      counts,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(POPULARITY_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Non-fatal persistence error
  }

  return counts;
}
