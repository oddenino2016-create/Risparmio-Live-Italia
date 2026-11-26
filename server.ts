import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SourceId } from './src/types/offers.js';
import { ALL_SOURCE_IDS } from './server/scrapers.js';
import { catalogWatcher } from './server/watcher.js';
import { getPortalVolumeAnalytics } from './server/volumeStore.js';
import { searchDiscountsWithAi } from './server/aiSearch.js';
import { adjustOfferPopularity, readPopularityCounts } from './server/popularityStore.js';
import {
  bootstrapAdminPin,
  createBroadcast,
  deleteBroadcast,
  getAdminAuthStatus,
  readAdSenseConfig,
  readBroadcasts,
  revokeBearerToken,
  saveAdSenseConfig,
  verifyAdminPin,
  verifyBearerToken,
} from './server/adminStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function requireAdminBearer(req: Request, res: Response, next: NextFunction): void {
  if (!verifyBearerToken(req.headers.authorization)) {
    res.status(401).json({ error: 'Accesso non autorizzato. Inserisci il PIN amministratore.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  let activeStreamClients = 0;

  // Start automatic background site watcher
  catalogWatcher.start();

  // Dynamic ads.txt for Google AdSense verification
  app.get('/ads.txt', (_req, res) => {
    const cfg = readAdSenseConfig();
    if (!cfg.enabled || !/^ca-pub-\d{10,20}$/.test(cfg.publisherId)) {
      res.status(404).type('text/plain').send('# Google AdSense non ancora configurato');
      return;
    }
    const pubNumeric = cfg.publisherId.replace(/^ca-/, '');
    res
      .status(200)
      .type('text/plain')
      .send(`google.com, ${pubNumeric}, DIRECT, f08c47fec0942fa0\n`);
  });

  // Public read-only Google AdSense display configuration
  app.get('/api/adsense', (_req, res) => {
    res.json(readAdSenseConfig());
  });

  // Admin Control Panel: status
  app.get('/api/admin/status', (req, res) => {
    const status = getAdminAuthStatus();
    const authenticated = verifyBearerToken(req.headers.authorization);
    res.json({ ...status, authenticated });
  });

  // Admin Control Panel: one-time first-run PIN setup (locks after claim or if ADMIN_PIN env is set)
  app.post('/api/admin/bootstrap', (req, res) => {
    const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
    const result = bootstrapAdminPin(pin);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const loginRes = verifyAdminPin(pin, req.ip || 'local');
    res.json(loginRes);
  });

  // Admin Control Panel: PIN login -> returns HMAC Bearer token (held in React memory)
  app.post('/api/admin/login', (req, res) => {
    const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
    const result = verifyAdminPin(pin, req.ip || 'local');
    if (!result.ok) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.json({ token: result.token, expiresInMs: result.expiresInMs });
  });

  app.post('/api/admin/logout', (req, res) => {
    revokeBearerToken(req.headers.authorization);
    res.json({ ok: true });
  });

  // Admin Control Panel: Save Google AdSense configuration (protected)
  app.put('/api/admin/adsense', requireAdminBearer, (req, res) => {
    const result = saveAdSenseConfig(req.body ?? {});
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.config);
  });

  // Public read-only recent broadcast push announcements
  app.get('/api/broadcasts', (_req, res) => {
    res.json({ broadcasts: readBroadcasts() });
  });

  // Admin Control Panel: list broadcasts with live connected recipient count
  app.get('/api/admin/broadcasts', requireAdminBearer, (_req, res) => {
    res.json({
      broadcasts: readBroadcasts(),
      connectedClients: activeStreamClients,
    });
  });

  // Admin Control Panel: send broadcast push alert to all users (protected)
  app.post('/api/admin/broadcast', requireAdminBearer, (req, res) => {
    const result = createBroadcast(req.body ?? {});
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    catalogWatcher.broadcastAlert(result.broadcast);
    res.json({
      broadcast: result.broadcast,
      connectedClients: activeStreamClients,
    });
  });

  // Admin Control Panel: remove a broadcast alert (protected)
  app.delete('/api/admin/broadcast/:id', requireAdminBearer, (req, res) => {
    const deleted = deleteBroadcast(String(req.params.id || ''));
    if (!deleted) {
      res.status(404).json({ error: 'Messaggio non trovato.' });
      return;
    }
    catalogWatcher.broadcastRemoved(String(req.params.id || ''));
    res.json({ ok: true });
  });

  // REST API: Get current aggregated catalog
  app.get('/api/offers', async (_req, res) => {
    try {
      const snapshot = await catalogWatcher.ensureLoaded();
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Errore nel caricamento delle offerte',
      });
    }
  });

  // REST API: Get & update persistent offer save counts for popularity sorting
  app.get('/api/offers/popularity', (_req, res) => {
    res.json({ counts: readPopularityCounts() });
  });

  app.post('/api/offers/popularity', (req, res) => {
    const dealId = typeof req.body?.dealId === 'string' ? req.body.dealId.trim() : '';
    const rawDelta = req.body?.delta;
    if (!dealId || (rawDelta !== 1 && rawDelta !== -1)) {
      res.status(400).json({ error: 'Parametri dealId o delta non validi.' });
      return;
    }
    const counts = adjustOfferPopularity(dealId, rawDelta);
    catalogWatcher.broadcastPopularity(counts);
    res.json({ counts });
  });

  // REST API: 30-day active offer volume analytics per portal for D3.js dashboard
  app.get('/api/analytics/volumes', async (_req, res) => {
    try {
      const snapshot = await catalogWatcher.ensureLoaded();
      const analytics = getPortalVolumeAnalytics(snapshot.sources, snapshot.offers);
      res.json(analytics);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Errore nel caricamento delle statistiche',
      });
    }
  });

  // REST API: AI-powered discount search using Gemini + live catalog + Google Search grounding
  app.post('/api/ai/search', async (req, res) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      if (query.length < 2 || query.length > 300) {
        res.status(400).json({ error: 'Inserisci una ricerca tra 2 e 300 caratteri.' });
        return;
      }

      const snapshot = await catalogWatcher.ensureLoaded();
      const result = await searchDiscountsWithAi(query, snapshot.offers);
      res.json(result);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Errore durante la ricerca con Intelligenza Artificiale';
      const status = /non configurata|API_KEY/i.test(msg)
        ? 503
        : /Quota temporanea|429/i.test(msg)
          ? 429
          : 502;
      res.status(status).json({ error: msg });
    }
  });

  // REST API: Trigger immediate live verification & sync
  app.post('/api/sync', async (req, res) => {
    try {
      const rawSource = req.body?.sourceId;
      let onlySourceId: SourceId | undefined;
      if (typeof rawSource === 'string' && rawSource.length > 0) {
        if (!ALL_SOURCE_IDS.includes(rawSource as SourceId)) {
          res.status(400).json({ error: 'Fonte non valida' });
          return;
        }
        onlySourceId = rawSource as SourceId;
      }

      const result = await catalogWatcher.syncAll('manuale', onlySourceId);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Errore durante la sincronizzazione',
      });
    }
  });

  // SSE endpoint: Pushes real-time updates whenever any source site changes or admin broadcasts
  app.get('/api/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    activeStreamClients += 1;

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const initial = await catalogWatcher.ensureLoaded();
      sendEvent('snapshot', initial);
      const recentBroadcasts = readBroadcasts().slice(0, 5);
      if (recentBroadcasts.length > 0) {
        sendEvent('broadcasts', recentBroadcasts);
      }
      sendEvent('popularity', readPopularityCounts());
    } catch {
      // Initial load error will be handled by client REST fetch
    }

    const onUpdate = (snapshot: unknown) => sendEvent('snapshot', snapshot);
    const onChecked = (snapshot: unknown) => sendEvent('checked', snapshot);
    const onBroadcast = (msg: unknown) => sendEvent('broadcast', msg);
    const onBroadcastRemoved = (payload: unknown) => sendEvent('broadcast_removed', payload);
    const onPopularity = (counts: unknown) => sendEvent('popularity', counts);

    catalogWatcher.on('update', onUpdate);
    catalogWatcher.on('checked', onChecked);
    catalogWatcher.on('broadcast', onBroadcast);
    catalogWatcher.on('broadcast_removed', onBroadcastRemoved);
    catalogWatcher.on('popularity', onPopularity);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
      activeStreamClients = Math.max(0, activeStreamClients - 1);
      clearInterval(heartbeat);
      catalogWatcher.off('update', onUpdate);
      catalogWatcher.off('checked', onChecked);
      catalogWatcher.off('broadcast', onBroadcast);
      catalogWatcher.off('broadcast_removed', onBroadcastRemoved);
      catalogWatcher.off('popularity', onPopularity);
    });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Risparmio Live Italia server attivo sulla porta ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Errore avvio server:', err);
  process.exit(1);
});
