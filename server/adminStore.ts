import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { AdSenseConfig, BroadcastMessage } from '../src/types/offers.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');
const ADSENSE_FILE = path.join(DATA_DIR, 'adsense-config.json');
const BROADCASTS_FILE = path.join(DATA_DIR, 'broadcasts.json');

const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

interface StoredPinHash {
  salt: string;
  hash: string;
  claimedAt: string;
}

const SESSION_SIGNING_KEY = process.env.ADMIN_SESSION_SECRET
  ? Buffer.from(process.env.ADMIN_SESSION_SECRET, 'utf8')
  : crypto.randomBytes(32);

const activeTokens = new Map<string, number>(); // tokenId -> expiresAtMs
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

const DEFAULT_ADSENSE_CONFIG: AdSenseConfig = {
  enabled: false,
  publisherId: '',
  autoAds: true,
  headerSlotId: '',
  inFeedSlotId: '',
  footerSlotId: '',
  inFeedInterval: 6,
  showAdminPreview: false,
  updatedAt: new Date().toISOString(),
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function readStoredPinHash(): StoredPinHash | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const raw = fs.readFileSync(AUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredPinHash>;
    if (
      typeof parsed.salt === 'string' &&
      typeof parsed.hash === 'string' &&
      parsed.salt.length >= 16 &&
      parsed.hash.length >= 32
    ) {
      return {
        salt: parsed.salt,
        hash: parsed.hash,
        claimedAt: typeof parsed.claimedAt === 'string' ? parsed.claimedAt : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

function hashPin(pin: string, saltHex: string): Buffer {
  return crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), 64);
}

function getEnvPin(): string {
  return (process.env.ADMIN_PIN ?? '').trim();
}

export function getAdminAuthStatus(): { configured: boolean; envConfigured: boolean } {
  const envConfigured = getEnvPin().length > 0;
  const claimed = readStoredPinHash() !== null;
  return {
    configured: envConfigured || claimed,
    envConfigured,
  };
}

export function bootstrapAdminPin(pin: string): { ok: boolean; error?: string } {
  const { configured } = getAdminAuthStatus();
  if (configured) {
    return { ok: false, error: 'PIN amministratore già configurato.' };
  }
  const cleanPin = pin.trim();
  if (!/^\d{4,12}$/.test(cleanPin)) {
    return { ok: false, error: 'Il PIN deve contenere tra 4 e 12 cifre numeriche.' };
  }

  ensureDataDir();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPin(cleanPin, salt).toString('hex');
  const record: StoredPinHash = {
    salt,
    hash,
    claimedAt: new Date().toISOString(),
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(record), { mode: 0o600 });
  return { ok: true };
}

export function verifyAdminPin(
  pin: string,
  clientKey: string
): { ok: boolean; token?: string; expiresInMs?: number; error?: string } {
  const now = Date.now();
  const rate = failedAttempts.get(clientKey);
  if (rate && rate.lockedUntil > now) {
    const secs = Math.ceil((rate.lockedUntil - now) / 1000);
    return { ok: false, error: `Troppi tentativi falliti. Riprova tra ${secs} secondi.` };
  }

  const cleanPin = pin.trim();
  const envPin = getEnvPin();
  let valid = false;

  if (envPin.length > 0) {
    const a = crypto.createHash('sha256').update(cleanPin).digest();
    const b = crypto.createHash('sha256').update(envPin).digest();
    valid = crypto.timingSafeEqual(a, b);
  } else {
    const stored = readStoredPinHash();
    if (!stored) {
      return { ok: false, error: 'Nessun PIN amministratore configurato.' };
    }
    const candidate = hashPin(cleanPin, stored.salt);
    const expected = Buffer.from(stored.hash, 'hex');
    if (candidate.length === expected.length) {
      valid = crypto.timingSafeEqual(candidate, expected);
    }
  }

  if (!valid) {
    const prevCount = rate && rate.lockedUntil <= now ? rate.count : 0;
    const nextCount = prevCount + 1;
    failedAttempts.set(clientKey, {
      count: nextCount,
      lockedUntil: nextCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0,
    });
    return { ok: false, error: 'PIN non valido.' };
  }

  failedAttempts.delete(clientKey);

  const tokenId = crypto.randomBytes(24).toString('hex');
  const expiresAt = now + SESSION_TTL_MS;
  const payload = `${tokenId}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', SESSION_SIGNING_KEY).update(payload).digest('hex');
  const token = `${payload}.${sig}`;
  activeTokens.set(tokenId, expiresAt);

  return { ok: true, token, expiresInMs: SESSION_TTL_MS };
}

export function verifyBearerToken(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokenId, expiresStr, sig] = parts;
  const expiresAt = Number(expiresStr);
  if (!tokenId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    if (tokenId) activeTokens.delete(tokenId);
    return false;
  }

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_KEY)
    .update(`${tokenId}.${expiresStr}`)
    .digest('hex');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  const storedExpiry = activeTokens.get(tokenId);
  return Boolean(storedExpiry && storedExpiry > Date.now());
}

export function revokeBearerToken(authHeader: string | undefined): void {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return;
  const tokenId = authHeader.slice(7).trim().split('.')[0];
  if (tokenId) activeTokens.delete(tokenId);
}

export function readAdSenseConfig(): AdSenseConfig {
  try {
    if (!fs.existsSync(ADSENSE_FILE)) return { ...DEFAULT_ADSENSE_CONFIG };
    const raw = fs.readFileSync(ADSENSE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AdSenseConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      publisherId: typeof parsed.publisherId === 'string' ? parsed.publisherId : '',
      autoAds: parsed.autoAds !== undefined ? Boolean(parsed.autoAds) : true,
      headerSlotId: typeof parsed.headerSlotId === 'string' ? parsed.headerSlotId : '',
      inFeedSlotId: typeof parsed.inFeedSlotId === 'string' ? parsed.inFeedSlotId : '',
      footerSlotId: typeof parsed.footerSlotId === 'string' ? parsed.footerSlotId : '',
      inFeedInterval:
        typeof parsed.inFeedInterval === 'number' &&
        parsed.inFeedInterval >= 3 &&
        parsed.inFeedInterval <= 24
          ? Math.round(parsed.inFeedInterval)
          : 6,
      showAdminPreview: Boolean(parsed.showAdminPreview),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { ...DEFAULT_ADSENSE_CONFIG };
  }
}

export function saveAdSenseConfig(
  input: Partial<AdSenseConfig>
): { ok: true; config: AdSenseConfig } | { ok: false; error: string } {
  const pubId = typeof input.publisherId === 'string' ? input.publisherId.trim() : '';
  if (pubId !== '' && !/^ca-pub-\d{10,20}$/.test(pubId)) {
    return {
      ok: false,
      error: 'Publisher ID non valido. Formato atteso: ca-pub-XXXXXXXXXXXXXXXX',
    };
  }

  const validateSlot = (val: unknown): string | null => {
    if (typeof val !== 'string') return '';
    const trimmed = val.trim();
    if (trimmed === '') return '';
    return /^\d{6,16}$/.test(trimmed) ? trimmed : null;
  };

  const headerSlot = validateSlot(input.headerSlotId);
  const inFeedSlot = validateSlot(input.inFeedSlotId);
  const footerSlot = validateSlot(input.footerSlotId);
  if (headerSlot === null || inFeedSlot === null || footerSlot === null) {
    return {
      ok: false,
      error: 'Gli ID degli slot AdSense devono contenere solo cifre (6-16 caratteri).',
    };
  }

  const intervalNum = Number(input.inFeedInterval);
  const inFeedInterval =
    Number.isFinite(intervalNum) && intervalNum >= 3 && intervalNum <= 24
      ? Math.round(intervalNum)
      : 6;

  const next: AdSenseConfig = {
    enabled: Boolean(input.enabled),
    publisherId: pubId,
    autoAds: input.autoAds !== undefined ? Boolean(input.autoAds) : true,
    headerSlotId: headerSlot,
    inFeedSlotId: inFeedSlot,
    footerSlotId: footerSlot,
    inFeedInterval,
    showAdminPreview: Boolean(input.showAdminPreview),
    updatedAt: new Date().toISOString(),
  };

  ensureDataDir();
  fs.writeFileSync(ADSENSE_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return { ok: true, config: next };
}

export function readBroadcasts(): BroadcastMessage[] {
  try {
    if (!fs.existsSync(BROADCASTS_FILE)) return [];
    const raw = fs.readFileSync(BROADCASTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BroadcastMessage =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.body === 'string' &&
        typeof item.createdAt === 'string'
    );
  } catch {
    return [];
  }
}

export function createBroadcast(input: {
  title?: unknown;
  body?: unknown;
  linkUrl?: unknown;
}): { ok: true; broadcast: BroadcastMessage } | { ok: false; error: string } {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const rawLink = typeof input.linkUrl === 'string' ? input.linkUrl.trim() : '';

  if (title.length < 2 || title.length > 100) {
    return {
      ok: false,
      error: 'Il titolo del messaggio deve contenere tra 2 e 100 caratteri.',
    };
  }
  if (body.length < 2 || body.length > 320) {
    return {
      ok: false,
      error: 'Il testo del messaggio deve contenere tra 2 e 320 caratteri.',
    };
  }

  let linkUrl: string | undefined;
  if (rawLink.length > 0) {
    if (rawLink.length > 500 || !/^https?:\/\/.+/i.test(rawLink)) {
      return {
        ok: false,
        error: 'Il link opzionale deve iniziare con http:// o https:// (max 500 caratteri).',
      };
    }
    try {
      linkUrl = new URL(rawLink).toString();
    } catch {
      return { ok: false, error: 'URL di destinazione non valido.' };
    }
  }

  const broadcast: BroadcastMessage = {
    id: `bc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    title,
    body,
    linkUrl,
    createdAt: new Date().toISOString(),
  };

  const existing = readBroadcasts();
  const next = [broadcast, ...existing].slice(0, 20);
  ensureDataDir();
  fs.writeFileSync(BROADCASTS_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return { ok: true, broadcast };
}

export function deleteBroadcast(id: string): boolean {
  const cleanId = id.trim();
  if (!cleanId) return false;
  const existing = readBroadcasts();
  const next = existing.filter((b) => b.id !== cleanId);
  if (next.length === existing.length) return false;
  ensureDataDir();
  fs.writeFileSync(BROADCASTS_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return true;
}
