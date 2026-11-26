import { EventEmitter } from 'events';
import type {
  BroadcastMessage,
  CatalogSnapshot,
  ChangeLogEntry,
  OfferItem,
  SourceId,
  SourceStatus,
} from '../src/types/offers.js';
import { ALL_SOURCE_IDS, scrapeSourceById, type ScrapeResult } from './scrapers.js';
import { recordDailyVolumes } from './volumeStore.js';

const AUTO_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes for upstream site updates
const MANUAL_SYNC_COOLDOWN_MS = 4000;

class CatalogWatcher extends EventEmitter {
  private revision = 0;
  private updatedAt = new Date().toISOString();
  private lastCheckedAt = new Date().toISOString();
  private lastSyncDurationMs = 0;
  private lastManualSyncAt = 0;
  private syncPromise: Promise<{ snapshot: CatalogSnapshot; changedSources: SourceId[] }> | null =
    null;
  private timer: NodeJS.Timeout | null = null;

  private sourceStates = new Map<SourceId, { status: SourceStatus; offers: OfferItem[] }>();
  private recentChanges: ChangeLogEntry[] = [];

  public start(): void {
    if (this.timer) return;
    // Kick off initial sync immediately in background
    void this.syncAll('avvio').catch((err) => {
      console.error('Errore sincronizzazione iniziale:', err);
    });
    this.timer = setInterval(() => {
      void this.syncAll('automatico').catch((err) => {
        console.error('Errore controllo automatico:', err);
      });
    }, AUTO_INTERVAL_MS);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async ensureLoaded(): Promise<CatalogSnapshot> {
    if (this.sourceStates.size === 0) {
      const { snapshot } = await this.syncAll('iniziale');
      return snapshot;
    }
    return this.buildSnapshot();
  }

  public getSnapshot(): CatalogSnapshot {
    return this.buildSnapshot();
  }

  public broadcastAlert(message: BroadcastMessage): void {
    this.emit('broadcast', message);
  }

  public broadcastRemoved(id: string): void {
    this.emit('broadcast_removed', { id });
  }

  public broadcastPopularity(counts: Record<string, number>): void {
    this.emit('popularity', counts);
  }

  public async syncAll(
    reason: 'avvio' | 'iniziale' | 'automatico' | 'manuale',
    onlySourceId?: SourceId
  ): Promise<{ snapshot: CatalogSnapshot; changedSources: SourceId[] }> {
    const nowMs = Date.now();
    if (reason === 'manuale' && nowMs - this.lastManualSyncAt < MANUAL_SYNC_COOLDOWN_MS) {
      return { snapshot: this.buildSnapshot(), changedSources: [] };
    }
    if (this.syncPromise) {
      return this.syncPromise;
    }

    if (reason === 'manuale') {
      this.lastManualSyncAt = nowMs;
    }

    this.syncPromise = this.performSync(reason, onlySourceId).finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private async performSync(
    reason: string,
    onlySourceId?: SourceId
  ): Promise<{ snapshot: CatalogSnapshot; changedSources: SourceId[] }> {
    const started = Date.now();
    const nowIso = new Date().toISOString();
    const targetIds = onlySourceId ? [onlySourceId] : ALL_SOURCE_IDS;

    const results = await Promise.all(
      targetIds.map((id) => scrapeSourceById(id, nowIso))
    );

    const changedSources: SourceId[] = [];

    for (const res of results) {
      const changed = this.applySourceResult(res, nowIso, reason);
      if (changed) {
        changedSources.push(res.sourceId);
      }
    }

    this.lastCheckedAt = nowIso;
    this.lastSyncDurationMs = Date.now() - started;

    const snapshot = this.buildSnapshot();
    try {
      recordDailyVolumes(snapshot.sources);
    } catch {
      // Non-fatal persistence error
    }

    if (changedSources.length > 0 || this.revision === 0) {
      this.revision += 1;
      this.updatedAt = nowIso;
      const updatedSnapshot = this.buildSnapshot();
      this.emit('update', updatedSnapshot);
      return { snapshot: updatedSnapshot, changedSources };
    }

    this.emit('checked', snapshot);
    return { snapshot, changedSources: [] };
  }

  private applySourceResult(res: ScrapeResult, nowIso: string, reason: string): boolean {
    const prev = this.sourceStates.get(res.sourceId);

    // Preserve previous working offers if a transient network error occurs
    if (res.status === 'error' && prev && prev.offers.length > 0) {
      this.sourceStates.set(res.sourceId, {
        offers: prev.offers,
        status: {
          ...prev.status,
          status: 'error',
          lastCheckedAt: nowIso,
          note: `${res.note ?? 'Errore temporaneo'} (mantenuti ultimi ${prev.offers.length} elementi)`,
        },
      });
      return false;
    }

    const prevHash = prev?.status.contentHash;
    const hashChanged = prevHash !== res.contentHash;

    const prevMap = new Map((prev?.offers ?? []).map((o) => [o.id, o]));
    const prevIds = new Set(prevMap.keys());
    const newIds = new Set(res.offers.map((o) => o.id));
    const addedCount = prev
      ? res.offers.filter((o) => !prevIds.has(o.id)).length
      : res.offers.length;
    const removedCount = prev
      ? prev.offers.filter((o) => !newIds.has(o.id)).length
      : 0;

    const taggedOffers = res.offers.map((o) => {
      const previous = prevMap.get(o.id);
      return {
        ...o,
        firstSeenAt: previous?.firstSeenAt ?? nowIso,
        isNew: Boolean(prev && !prevIds.has(o.id)),
      };
    });

    const lastChangedAt =
      !prev || hashChanged ? nowIso : prev.status.lastChangedAt;

    this.sourceStates.set(res.sourceId, {
      offers: taggedOffers,
      status: {
        id: res.sourceId,
        name: res.sourceName,
        displayUrl: res.displayUrl,
        requestedUrl: res.requestedUrl,
        status: res.status,
        itemCount: taggedOffers.length,
        lastCheckedAt: nowIso,
        lastChangedAt,
        contentHash: res.contentHash,
        etag: res.etag,
        lastModified: res.lastModified,
        note: res.note,
      },
    });

    if (prev && hashChanged) {
      const summary =
        addedCount > 0
          ? `+${addedCount} nuove offerte rilevate su ${res.displayUrl}`
          : `Contenuto aggiornato su ${res.displayUrl} (${res.offers.length} offerte attive)`;
      this.recentChanges.unshift({
        id: `${res.sourceId}-${Date.now()}`,
        sourceId: res.sourceId,
        sourceName: res.sourceName,
        timestamp: nowIso,
        addedCount,
        removedCount,
        summary,
      });
      this.recentChanges = this.recentChanges.slice(0, 15);
      return true;
    }

    if (!prev && res.offers.length > 0) {
      this.recentChanges.unshift({
        id: `${res.sourceId}-init-${Date.now()}`,
        sourceId: res.sourceId,
        sourceName: res.sourceName,
        timestamp: nowIso,
        addedCount: res.offers.length,
        removedCount: 0,
        summary: `Sincronizzazione ${reason}: ${res.offers.length} offerte importate da ${res.displayUrl}`,
      });
      this.recentChanges = this.recentChanges.slice(0, 15);
      return true;
    }

    return false;
  }

  private buildSnapshot(): CatalogSnapshot {
    const sources: SourceStatus[] = [];
    const pools: OfferItem[][] = [];

    for (const id of ALL_SOURCE_IDS) {
      const entry = this.sourceStates.get(id);
      if (entry) {
        sources.push(entry.status);
        pools.push(entry.offers);
      }
    }

    // Interleave offers round-robin across sources so all 11 sites appear naturally near the top
    const interleaved: OfferItem[] = [];
    const maxLen = Math.max(0, ...pools.map((p) => p.length));
    for (let i = 0; i < maxLen; i++) {
      for (const pool of pools) {
        if (pool[i]) interleaved.push(pool[i]);
      }
    }

    // Put newly detected items first
    interleaved.sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)));

    return {
      revision: this.revision,
      updatedAt: this.updatedAt,
      lastCheckedAt: this.lastCheckedAt,
      lastSyncDurationMs: this.lastSyncDurationMs,
      autoIntervalSec: Math.round(AUTO_INTERVAL_MS / 1000),
      sources,
      offers: interleaved,
      recentChanges: this.recentChanges,
    };
  }
}

export const catalogWatcher = new CatalogWatcher();
