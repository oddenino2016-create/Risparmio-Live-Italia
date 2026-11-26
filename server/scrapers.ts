import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import type { OfferCategory, OfferItem, SourceId } from '../src/types/offers.js';
import { categorizeDeal } from './categorizer.js';

type RawOffer = Omit<OfferItem, 'tags'>;

export interface ScrapeResult {
  sourceId: SourceId;
  sourceName: string;
  displayUrl: string;
  requestedUrl: string;
  status: 'live' | 'snapshot' | 'error';
  offers: OfferItem[];
  contentHash: string;
  etag?: string;
  lastModified?: string;
  note?: string;
}

type InternalScrapeResult = Omit<ScrapeResult, 'offers'> & { offers: RawOffer[] };

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
};

const ALLOWED_HOSTS = new Set([
  'www.buyon.it',
  'buyon.it',
  'www.scontiomaggio.com',
  'scontiomaggio.com',
  'www.scontomaggio.com',
  'scontomaggio.com',
  'letyshops.com',
  'www.letyshops.com',
  'it.bestshopping.com',
  'www.scontrinofelice.it',
  'scontrinofelice.it',
  'www.widilo.it',
  'widilo.it',
  'www.pgperte.it',
  'pgperte.it',
  'promozioni.pgperte.it',
  'www.dimmicosacerchi.it',
  'dimmicosacerchi.it',
  'www.codicerisparmio.it',
  'codicerisparmio.it',
  'www.cashbackdeals.it',
  'cashbackdeals.it',
  'it.simplybestcoupons.com',
  'www.simplybestcoupons.com',
  'archive.org',
  'web.archive.org',
]);

function assertAllowedHost(urlStr: string): URL {
  const parsed = new URL(urlStr);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Protocollo non consentito: ${parsed.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Host non consentito: ${parsed.hostname}`);
  }
  return parsed;
}

async function safeFetch(url: string, timeoutMs = 14000): Promise<Response> {
  assertAllowedHost(url);
  let lastErr: unknown;
  const headerSets: Array<Record<string, string>> = [
    BROWSER_HEADERS,
    { Accept: 'application/json, text/html, */*' },
  ];

  for (const headers of headerSets) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastErr;
}

export function safeHttpUrl(raw: string | undefined | null, base: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) {
    return undefined;
  }
  try {
    // Strip Wayback prefix if present
    const waybackCleaned = trimmed.replace(/^\/web\/\d+\/(https?:\/\/)/i, '$1');
    const resolved = new URL(waybackCleaned, base);
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      return undefined;
    }
    return resolved.toString();
  } catch {
    return undefined;
  }
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&euro;': '€',
  '&#8217;': '’',
  '&#8216;': '‘',
  '&#8220;': '“',
  '&#8221;': '”',
  '&#8211;': '–',
  '&#8212;': '—',
  '&#8230;': '…',
  '&#038;': '&',
};

export function cleanText(raw: string | undefined | null, maxLen = 220): string {
  if (!raw) return '';
  let text = raw.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&#(\d+);/g, (_, dec) => {
    const code = Number(dec);
    return Number.isFinite(code) && code > 0 && code < 65536 ? String.fromCharCode(code) : '';
  });
  text = text.replace(/&[a-z0-9#]+;/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > maxLen) {
    text = text.slice(0, maxLen - 1).trimEnd() + '…';
  }
  return text;
}

function hashOffers(items: RawOffer[]): string {
  const canonical = items
    .map((i) => `${i.id}|${i.title}|${i.rewardLabel}|${i.couponCode ?? ''}|${i.offerUrl}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function classifyItalianOffer(text: string, fallback: OfferCategory = 'cashback'): OfferCategory {
  const lower = text.toLowerCase();
  if (
    /provami\s*gratis|prova\s*gratis|campion[ei]\s*omaggio|omaggio|gratis|100%\s*rimbors|rimborso\s*100%|free\s*trial/i.test(
      lower
    )
  ) {
    return 'prova-gratis';
  }
  if (
    /codic[ei]\s*sconto|coupon|buon[oi]\s*sconto|promo\s*code|voucher|sconto\s*del\s*\d+/i.test(
      lower
    )
  ) {
    return 'codice-sconto';
  }
  if (/cashback|spendi\s*e\s*riprendi|rimborso/i.test(lower)) {
    return 'cashback';
  }
  return fallback;
}

function extractRewardLabel(text: string, category: OfferCategory): string {
  const pctMatch = text.match(/(?:fino\s+al\s+|del\s+|-\s*)?(\d{1,3}(?:[,.]\d+)?\s*%)/i);
  const eurMatch = text.match(/(\d{1,4}(?:[,.]\d+)?\s*(?:€|euro))/i);

  if (category === 'prova-gratis') {
    if (/provami\s*gratis/i.test(text)) return 'Provami Gratis';
    if (/prova\s*gratis/i.test(text)) return 'Prova Gratis';
    if (/campion[ei]\s*omaggio/i.test(text)) return 'Campione Omaggio';
    if (eurMatch) return `Rimborso ${eurMatch[1].replace(/\s*euro/i, '€')}`;
    return 'Gratis / Omaggio';
  }

  if (category === 'codice-sconto') {
    if (pctMatch) return `Sconto ${pctMatch[1].replace(/\s+/g, '')}`;
    if (eurMatch) return `Sconto ${eurMatch[1].replace(/\s*euro/i, '€')}`;
    return 'Codice Sconto';
  }

  if (pctMatch) return `Cashback ${pctMatch[1].replace(/\s+/g, '')}`;
  if (eurMatch) return `Rimborso ${eurMatch[1].replace(/\s*euro/i, '€')}`;
  return 'Cashback';
}

function extractMerchantFromTitle(title: string, fallback: string): string {
  const colonSplit = title.split(':')[0]?.trim() ?? '';
  const cleaned = colonSplit
    .replace(
      /^(cashback|spendi\s*e\s*riprendi|provami\s*gratis|prova\s*gratis|codice\s*sconto|buono\s*sconto|promo|sconto|vinci)\s+/i,
      ''
    )
    .replace(/\s+\d{4}$/, '')
    .trim();
  if (cleaned.length >= 2 && cleaned.length <= 38) {
    return cleaned;
  }
  return fallback;
}

function makeId(sourceId: SourceId, key: string): string {
  return `${sourceId}_${crypto.createHash('md5').update(key).digest('hex').slice(0, 12)}`;
}

// ---------------------------------------------------------------------------
// 1. SCONTRINO FELICE (https://www.scontrinofelice.it/spendi-e-riprendi/)
// ---------------------------------------------------------------------------
export async function scrapeScontrinoFelice(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://www.scontrinofelice.it/spendi-e-riprendi/';
  const offers: RawOffer[] = [];
  const seenUrls = new Set<string>();

  try {
    const [htmlRes, wpRes] = await Promise.all([
      safeFetch(requestedUrl),
      safeFetch('https://www.scontrinofelice.it/wp-json/wp/v2/posts?per_page=20&_embed').catch(
        () => null
      ),
    ]);

    const etag = htmlRes.headers.get('etag') ?? undefined;
    const lastModified = htmlRes.headers.get('last-modified') ?? undefined;

    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const $ = cheerio.load(html);

      $('article, .elementor-post, .elementor-widget-theme-post-title').each((_, el) => {
        const anchor = $(el).find('h2 a, h3 a').first();
        const title = cleanText(anchor.text(), 150);
        const href = safeHttpUrl(anchor.attr('href'), requestedUrl);
        if (!title || !href || seenUrls.has(href)) return;
        seenUrls.add(href);

        const imgRaw =
          $(el).find('img').attr('data-src') ||
          $(el).find('img').attr('src') ||
          $(el).closest('.e-con, .elementor-section').find('img').first().attr('src');
        const imageUrl = safeHttpUrl(imgRaw, requestedUrl);

        const category = classifyItalianOffer(title, 'cashback');
        offers.push({
          id: makeId('scontrinofelice', href),
          title,
          merchant: extractMerchantFromTitle(title, 'ScontrinoFelice'),
          description:
            'Iniziativa attiva segnalata su ScontrinoFelice nella sezione Spendi e Riprendi, Cashback e Provami Gratis.',
          category,
          sourceId: 'scontrinofelice',
          sourceName: 'ScontrinoFelice',
          sourceUrl: requestedUrl,
          offerUrl: href,
          rewardLabel: extractRewardLabel(title, category),
          imageUrl,
          updatedAt: nowIso,
        });
      });
    }

    if (wpRes && wpRes.ok) {
      const posts = (await wpRes.json()) as Array<{
        link?: string;
        date?: string;
        title?: { rendered?: string };
        excerpt?: { rendered?: string };
        _embedded?: {
          'wp:featuredmedia'?: Array<{ source_url?: string }>;
        };
      }>;

      for (const post of posts) {
        const href = safeHttpUrl(post.link, requestedUrl);
        const title = cleanText(post.title?.rendered, 150);
        if (!href || !title) continue;

        const existing = offers.find((o) => o.offerUrl === href);
        const imageUrl = safeHttpUrl(
          post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
          requestedUrl
        );
        const excerpt = cleanText(post.excerpt?.rendered, 180);

        if (existing) {
          if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
          if (excerpt) existing.description = excerpt;
          if (post.date) existing.publishedAt = post.date;
          continue;
        }

        if (
          /spendi|riprendi|cashback|provami\s*gratis|prova\s*gratis|rimborso|sconto|coupon|omaggio/i.test(
            title + ' ' + excerpt
          )
        ) {
          seenUrls.add(href);
          const category = classifyItalianOffer(title + ' ' + excerpt, 'cashback');
          offers.push({
            id: makeId('scontrinofelice', href),
            title,
            merchant: extractMerchantFromTitle(title, 'ScontrinoFelice'),
            description:
              excerpt || 'Promozione attiva su ScontrinoFelice: scopri come richiedere il rimborso.',
            category,
            sourceId: 'scontrinofelice',
            sourceName: 'ScontrinoFelice',
            sourceUrl: requestedUrl,
            offerUrl: href,
            rewardLabel: extractRewardLabel(title + ' ' + excerpt, category),
            imageUrl,
            publishedAt: post.date,
            updatedAt: nowIso,
          });
        }
      }
    }

    const finalOffers = offers.slice(0, 28);
    return {
      sourceId: 'scontrinofelice',
      sourceName: 'ScontrinoFelice',
      displayUrl: 'www.scontrinofelice.it/spendi-e-riprendi/',
      requestedUrl,
      status: finalOffers.length > 0 ? 'live' : 'error',
      offers: finalOffers,
      contentHash: hashOffers(finalOffers),
      etag,
      lastModified,
      note: `${finalOffers.length} iniziative Spendi e Riprendi / Cashback`,
    };
  } catch (err) {
    return {
      sourceId: 'scontrinofelice',
      sourceName: 'ScontrinoFelice',
      displayUrl: 'www.scontrinofelice.it/spendi-e-riprendi/',
      requestedUrl,
      status: 'error',
      offers: [],
      contentHash: 'error',
      note: err instanceof Error ? err.message : 'Errore di connessione',
    };
  }
}

// ---------------------------------------------------------------------------
// 2. SCONTOMAGGIO (www.scontiomaggio.com -> www.scontomaggio.com)
// ---------------------------------------------------------------------------
export async function scrapeScontOmaggio(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://www.scontiomaggio.com';
  const jsonCandidates = [
    'https://www.scontiomaggio.com/wp-json/wp/v2/posts?per_page=20&_embed',
    'https://www.scontomaggio.com/wp-json/wp/v2/posts?per_page=20&_embed',
    'https://www.scontomaggio.com/wp-json/wp/v2/posts?per_page=15',
  ];

  for (const endpoint of jsonCandidates) {
    try {
      const res = await safeFetch(endpoint);
      if (!res.ok) continue;

      const posts = (await res.json()) as Array<{
        link?: string;
        date?: string;
        title?: { rendered?: string };
        excerpt?: { rendered?: string };
        _embedded?: {
          'wp:featuredmedia'?: Array<{ source_url?: string }>;
          'wp:term'?: Array<Array<{ name?: string; slug?: string }>>;
        };
      }>;

      const baseHost = new URL(endpoint).origin;
      const etag = res.headers.get('etag') ?? undefined;
      const lastModified = res.headers.get('last-modified') ?? undefined;
      const offers: RawOffer[] = [];

      for (const post of posts) {
        const href = safeHttpUrl(post.link, baseHost);
        const title = cleanText(post.title?.rendered, 150);
        if (!href || !title) continue;

        const excerpt = cleanText(post.excerpt?.rendered, 180);
        const terms = (post._embedded?.['wp:term'] ?? [])
          .flat()
          .map((t) => `${t.name ?? ''} ${t.slug ?? ''}`)
          .join(' ');
        const combined = `${title} ${excerpt} ${terms}`;

        let category = classifyItalianOffer(combined, 'prova-gratis');
        if (/buon[oi]-sconto|codic[ei]-sconto/i.test(terms)) {
          category = 'codice-sconto';
        }
        if (/provami\s*gratis|prova\s*gratis|campioni\s*omaggio|omaggio/i.test(combined)) {
          category = 'prova-gratis';
        } else if (/cashback|rimborso|spendi\s*e\s*riprendi/i.test(combined)) {
          category = 'cashback';
        }

        const imageUrl = safeHttpUrl(
          post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
          baseHost
        );

        offers.push({
          id: makeId('scontiomaggio', href),
          title,
          merchant: extractMerchantFromTitle(title, 'ScontOmaggio'),
          description: excerpt || 'Offerta e segnalazione pubblicata su ScontOmaggio.',
          category,
          sourceId: 'scontiomaggio',
          sourceName: 'ScontOmaggio',
          sourceUrl: baseHost,
          offerUrl: href,
          rewardLabel: extractRewardLabel(combined, category),
          imageUrl,
          publishedAt: post.date,
          updatedAt: nowIso,
        });
      }

      const finalOffers = offers.slice(0, 24);
      const usedDomain = new URL(endpoint).host;
      return {
        sourceId: 'scontiomaggio',
        sourceName: 'ScontOmaggio',
        displayUrl: usedDomain,
        requestedUrl,
        status: finalOffers.length > 0 ? 'live' : 'error',
        offers: finalOffers,
        contentHash: hashOffers(finalOffers),
        etag,
        lastModified,
        note:
          usedDomain === 'www.scontomaggio.com'
            ? `${finalOffers.length} offerte live (risolto su scontomaggio.com)`
            : `${finalOffers.length} offerte live`,
      };
    } catch {
      continue;
    }
  }

  // RSS Feed fallback
  try {
    const rssRes = await safeFetch('https://www.scontomaggio.com/feed/');
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      const offers: RawOffer[] = [];
      $('item').each((_, el) => {
        if (offers.length >= 20) return;
        const title = cleanText($(el).find('title').first().text(), 150);
        const href = safeHttpUrl($(el).find('link').first().text(), 'https://www.scontomaggio.com');
        const desc = cleanText($(el).find('description').first().text(), 180);
        const pubDate = cleanText($(el).find('pubDate').first().text(), 60);
        if (!title || !href) return;
        const category = classifyItalianOffer(`${title} ${desc}`, 'prova-gratis');
        offers.push({
          id: makeId('scontiomaggio', href),
          title,
          merchant: extractMerchantFromTitle(title, 'ScontOmaggio'),
          description: desc || 'Segnalazione pubblicata su ScontOmaggio.',
          category,
          sourceId: 'scontiomaggio',
          sourceName: 'ScontOmaggio',
          sourceUrl: 'https://www.scontomaggio.com',
          offerUrl: href,
          rewardLabel: extractRewardLabel(`${title} ${desc}`, category),
          publishedAt: pubDate || undefined,
          updatedAt: nowIso,
        });
      });
      if (offers.length > 0) {
        return {
          sourceId: 'scontiomaggio',
          sourceName: 'ScontOmaggio',
          displayUrl: 'www.scontomaggio.com',
          requestedUrl,
          status: 'live',
          offers,
          contentHash: hashOffers(offers),
          note: `${offers.length} offerte live (feed RSS)`,
        };
      }
    }
  } catch {
    // Fall through
  }

  return {
    sourceId: 'scontiomaggio',
    sourceName: 'ScontOmaggio',
    displayUrl: 'www.scontiomaggio.com',
    requestedUrl,
    status: 'error',
    offers: [],
    contentHash: 'error',
    note: 'Impossibile raggiungere scontiomaggio.com / scontomaggio.com',
  };
}

// ---------------------------------------------------------------------------
// 3. BESTSHOPPING (https://it.bestshopping.com/)
// ---------------------------------------------------------------------------
export async function scrapeBestshopping(nowIso: string): Promise<InternalScrapeResult> {
  const baseUrl = 'https://it.bestshopping.com/';
  const codesUrl = 'https://it.bestshopping.com/codici-sconto.html';
  const offers: RawOffer[] = [];
  const seenKeys = new Set<string>();

  try {
    const [homeRes, codesRes] = await Promise.all([safeFetch(baseUrl), safeFetch(codesUrl)]);
    const etag = codesRes.headers.get('etag') ?? homeRes.headers.get('etag') ?? undefined;
    const lastModified =
      codesRes.headers.get('last-modified') ?? homeRes.headers.get('last-modified') ?? undefined;

    // A. Discount codes from codici-sconto.html
    if (codesRes.ok) {
      const html = await codesRes.text();
      const $ = cheerio.load(html);

      $('#codici-section-list li.cc-element').each((_, el) => {
        const a = $(el).find('a[data-id]').first();
        const dataId = a.attr('data-id') || $(el).attr('id') || '';
        const redirect = a.attr('data-redirect') || '';
        const merchantParam = redirect.match(/merchant=([^&]+)/i)?.[1];
        const merchant = merchantParam ? decodeURIComponent(merchantParam) : 'Bestshopping Partner';

        const title = cleanText($(el).find('h3').first().text(), 150);
        if (!title) return;

        const desc = cleanText($(el).find('.dropdowned-item').first().text(), 180);
        const topLabel = cleanText($(el).find('.top-coupon small').first().text(), 40);
        const hintSuffix = cleanText($(el).find('.bottom-coupon button.sticker + div').text(), 12);
        const offerUrl =
          safeHttpUrl(`https://it.bestshopping.com/codici-sconto.html?ref=${dataId}`, codesUrl) ||
          codesUrl;

        const key = `code:${dataId || title}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        offers.push({
          id: makeId('bestshopping', key),
          title,
          merchant,
          description: desc || `Codice sconto attivo per ${merchant} su Bestshopping.`,
          category: 'codice-sconto',
          sourceId: 'bestshopping',
          sourceName: 'Bestshopping',
          sourceUrl: baseUrl,
          offerUrl,
          rewardLabel: topLabel || extractRewardLabel(title, 'codice-sconto'),
          couponHint: hintSuffix ? `…${hintSuffix}` : undefined,
          updatedAt: nowIso,
        });
      });
    }

    // B. Featured cashback stores from homepage
    if (homeRes.ok) {
      const html = await homeRes.text();
      const $ = cheerio.load(html);

      $('.big__card').each((_, el) => {
        const relHref = $(el).attr('bs-data-href');
        const offerUrl = safeHttpUrl(relHref, baseUrl);
        const title = cleanText($(el).find('.widget__title').text(), 140);
        const imgRaw =
          $(el).find('.big__visual-img img').attr('src') ||
          $(el).find('.big__visual-img source[type="image/jpeg"]').attr('data-srcset');
        const imageUrl = safeHttpUrl(imgRaw, baseUrl);
        if (!offerUrl || !title || seenKeys.has(offerUrl)) return;
        seenKeys.add(offerUrl);

        const slugName = relHref
          ?.replace(/^cashback-/, '')
          .replace(/\.html$/, '')
          .replace(/-/g, ' ');
        const merchant = slugName
          ? slugName.replace(/\b\w/g, (c) => c.toUpperCase())
          : extractMerchantFromTitle(title, 'Bestshopping');

        offers.push({
          id: makeId('bestshopping', offerUrl),
          title: `${merchant} — ${title}`,
          merchant,
          description: `Cashback Bestshopping attivo su ${merchant}.`,
          category: 'cashback',
          sourceId: 'bestshopping',
          sourceName: 'Bestshopping',
          sourceUrl: baseUrl,
          offerUrl,
          rewardLabel: extractRewardLabel(title, 'cashback'),
          imageUrl,
          updatedAt: nowIso,
        });
      });

      $('a[href^="cashback-"], a[href^="/cashback-"]').each((_, el) => {
        if (offers.length >= 34) return;
        const rel = $(el).attr('href');
        const offerUrl = safeHttpUrl(rel, baseUrl);
        const text = cleanText($(el).text(), 120);
        if (!offerUrl || !text || seenKeys.has(offerUrl)) return;
        if (!/%|€|cashback/i.test(text)) return;
        seenKeys.add(offerUrl);

        const slugName = rel
          ?.replace(/^\/?cashback-/, '')
          .replace(/\.html$/, '')
          .replace(/-/g, ' ');
        const merchant =
          cleanText($(el).find('img').attr('alt'), 40) ||
          (slugName ? slugName.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Negozio Partner');
        const imageUrl = safeHttpUrl(
          $(el).find('img').attr('data-src') || $(el).find('img').attr('src'),
          baseUrl
        );

        offers.push({
          id: makeId('bestshopping', offerUrl),
          title: `Cashback ${merchant}: ${text}`,
          merchant,
          description: `Rimborso cashback verificato su Bestshopping per gli acquisti su ${merchant}.`,
          category: 'cashback',
          sourceId: 'bestshopping',
          sourceName: 'Bestshopping',
          sourceUrl: baseUrl,
          offerUrl,
          rewardLabel: extractRewardLabel(text, 'cashback'),
          imageUrl,
          updatedAt: nowIso,
        });
      });
    }

    const finalOffers = offers.slice(0, 32);
    return {
      sourceId: 'bestshopping',
      sourceName: 'Bestshopping',
      displayUrl: 'it.bestshopping.com',
      requestedUrl: baseUrl,
      status: finalOffers.length > 0 ? 'live' : 'error',
      offers: finalOffers,
      contentHash: hashOffers(finalOffers),
      etag,
      lastModified,
      note: `${finalOffers.length} tra codici sconto e negozi cashback`,
    };
  } catch (err) {
    return {
      sourceId: 'bestshopping',
      sourceName: 'Bestshopping',
      displayUrl: 'it.bestshopping.com',
      requestedUrl: baseUrl,
      status: 'error',
      offers: [],
      contentHash: 'error',
      note: err instanceof Error ? err.message : 'Errore di connessione',
    };
  }
}

// ---------------------------------------------------------------------------
// 4. LETYSHOPS ITALIA (https://letyshops.com/it/shops)
// ---------------------------------------------------------------------------
export async function scrapeLetyShops(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://letyshops.com/it';
  const shopsUrl = 'https://letyshops.com/it/shops';
  const offers: RawOffer[] = [];
  const seen = new Set<string>();

  try {
    const res = await safeFetch(shopsUrl);
    const etag = res.headers.get('etag') ?? undefined;
    const lastModified = res.headers.get('last-modified') ?? undefined;

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $('a[href^="/it/shops/"]').each((_, el) => {
        if (offers.length >= 28) return;
        const href = $(el).attr('href');
        const offerUrl = safeHttpUrl(href, 'https://letyshops.com');
        if (!offerUrl || seen.has(offerUrl)) return;

        const img = $(el).find('img').first();
        const merchant =
          cleanText(img.attr('alt'), 50) ||
          cleanText(href?.replace('/it/shops/', '').replace(/-/g, ' '), 50);
        const rawText = cleanText($(el).text(), 150);
        if (!merchant || !rawText) return;
        seen.add(offerUrl);

        const imageUrl = safeHttpUrl(img.attr('data-src') || img.attr('src'), 'https://letyshops.com');
        const rateMatch = rawText.match(/(fino\s+al\s+)?(\d+(?:[,.]\d+)?\s*(?:%|€))/i);
        const rateClean = rateMatch
          ? rateMatch[0].replace(/\s*%/g, '%').replace(/\s+/g, ' ').trim()
          : '';
        const rewardLabel = rateClean ? `Cashback ${rateClean}` : 'Cashback';
        const categoriesText = rawText
          .replace(/(fino\s+al\s+)?\d+(?:[,.]\d+)?\s*(?:%|€)\s*cashback/i, '')
          .trim();

        offers.push({
          id: makeId('letyshops', offerUrl),
          title: rateClean ? `Cashback ${merchant}: ${rateClean}` : `Cashback ${merchant}`,
          merchant,
          description: categoriesText
            ? `Categorie: ${categoriesText}. Attiva LetyShops prima dell'acquisto.`
            : `Attiva il cashback LetyShops prima di acquistare su ${merchant}.`,
          category: 'cashback',
          sourceId: 'letyshops',
          sourceName: 'LetyShops Italia',
          sourceUrl: requestedUrl,
          offerUrl,
          rewardLabel,
          imageUrl,
          updatedAt: nowIso,
        });
      });
    }

    return {
      sourceId: 'letyshops',
      sourceName: 'LetyShops Italia',
      displayUrl: 'letyshops.com/it',
      requestedUrl,
      status: offers.length > 0 ? 'live' : 'error',
      offers,
      contentHash: hashOffers(offers),
      etag,
      lastModified,
      note: `${offers.length} negozi cashback italiani`,
    };
  } catch (err) {
    return {
      sourceId: 'letyshops',
      sourceName: 'LetyShops Italia',
      displayUrl: 'letyshops.com/it',
      requestedUrl,
      status: 'error',
      offers: [],
      contentHash: 'error',
      note: err instanceof Error ? err.message : 'Errore di connessione',
    };
  }
}

// ---------------------------------------------------------------------------
// 5. BUYON (https://www.buyon.it)
// Direct fetch first -> Gemini Search Grounding (if key set) -> Wayback HTML fallback
// ---------------------------------------------------------------------------
function parseBuyonHtml(html: string, nowIso: string): RawOffer[] {
  const $ = cheerio.load(html);
  const offers: RawOffer[] = [];
  const seen = new Set<string>();
  const base = 'https://www.buyon.it';

  $('a[href*="cashback-"], a[href*="/negozi/"], a[href*="/codici-sconto"]').each((_, el) => {
    if (offers.length >= 24) return;
    const rawHref = $(el).attr('href');
    const offerUrl = safeHttpUrl(rawHref, base);
    const txt = cleanText($(el).text(), 140);
    if (!offerUrl || !txt || seen.has(offerUrl)) return;
    if (!/(%|€|cashback|sconto|codic)/i.test(txt) || txt.length < 6) return;
    if (/\/negozi\/?$/i.test(offerUrl)) return;

    seen.add(offerUrl);
    const slug = offerUrl.split('/').filter(Boolean).pop() ?? '';
    const merchant = slug
      .replace(/^cashback-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const category = classifyItalianOffer(txt + ' ' + offerUrl, 'cashback');
    offers.push({
      id: makeId('buyon', offerUrl),
      title: merchant ? `${merchant} — ${txt}` : txt,
      merchant: merchant || 'BuyOn Partner',
      description: `Offerta cashback e codici cumulabili su BuyOn per ${merchant || 'questo negozio'}.`,
      category,
      sourceId: 'buyon',
      sourceName: 'BuyOn',
      sourceUrl: base,
      offerUrl,
      rewardLabel: extractRewardLabel(txt, category),
      updatedAt: nowIso,
    });
  });

  return offers;
}

async function fetchBuyonViaGeminiSearch(nowIso: string): Promise<RawOffer[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents:
        'Trova le offerte cashback e codici sconto attualmente attive su buyon.it. Restituisci SOLO un array JSON valido di oggetti con campi: merchant, title, category ("cashback" o "codice-sconto"), rewardLabel, couponCode (opzionale), offerUrl (URL su buyon.it). Massimo 12 elementi reali.',
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const raw = response.text ?? '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      merchant?: string;
      title?: string;
      category?: string;
      rewardLabel?: string;
      couponCode?: string;
      offerUrl?: string;
    }>;

    const results: RawOffer[] = [];
    for (const item of parsed) {
      const offerUrl = safeHttpUrl(item.offerUrl, 'https://www.buyon.it') ?? 'https://www.buyon.it/negozi';
      const title = cleanText(item.title, 140);
      const merchant = cleanText(item.merchant, 50);
      if (!title || !merchant) continue;
      const category: OfferCategory =
        item.category === 'codice-sconto' ? 'codice-sconto' : 'cashback';
      results.push({
        id: makeId('buyon', `${merchant}:${title}`),
        title,
        merchant,
        description: `Offerta rilevata su BuyOn (${merchant}).`,
        category,
        sourceId: 'buyon',
        sourceName: 'BuyOn',
        sourceUrl: 'https://www.buyon.it',
        offerUrl,
        rewardLabel: cleanText(item.rewardLabel, 40) || extractRewardLabel(title, category),
        couponCode: item.couponCode ? cleanText(item.couponCode, 30) : undefined,
        updatedAt: nowIso,
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function scrapeBuyOn(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://www.buyon.it';

  // 1. Direct live fetch attempt
  try {
    const [homeRes, codesRes] = await Promise.all([
      safeFetch('https://www.buyon.it/'),
      safeFetch('https://www.buyon.it/codici-sconto').catch(() => null),
    ]);

    if (homeRes.ok) {
      const html = await homeRes.text();
      if (!/BuyOn:\s*Challenge|Just a moment/i.test(html)) {
        const directOffers = parseBuyonHtml(html, nowIso);
        if (codesRes && codesRes.ok) {
          const codeHtml = await codesRes.text();
          if (!/BuyOn:\s*Challenge|Just a moment/i.test(codeHtml)) {
            for (const o of parseBuyonHtml(codeHtml, nowIso)) {
              if (!directOffers.some((d) => d.offerUrl === o.offerUrl)) {
                directOffers.push(o);
              }
            }
          }
        }
        if (directOffers.length > 0) {
          return {
            sourceId: 'buyon',
            sourceName: 'BuyOn',
            displayUrl: 'www.buyon.it',
            requestedUrl,
            status: 'live',
            offers: directOffers.slice(0, 24),
            contentHash: hashOffers(directOffers.slice(0, 24)),
            etag: homeRes.headers.get('etag') ?? undefined,
            lastModified: homeRes.headers.get('last-modified') ?? undefined,
            note: `${directOffers.length} offerte cashback live`,
          };
        }
      }
    }
  } catch {
    // Continue to resilient live discovery / snapshot fallback
  }

  // 2. Gemini Google Search grounding (if GEMINI_API_KEY is available)
  const searchOffers = await fetchBuyonViaGeminiSearch(nowIso);
  if (searchOffers.length > 0) {
    return {
      sourceId: 'buyon',
      sourceName: 'BuyOn',
      displayUrl: 'www.buyon.it',
      requestedUrl,
      status: 'live',
      offers: searchOffers,
      contentHash: hashOffers(searchOffers),
      note: `${searchOffers.length} offerte indicizzate (protezione anti-bot attiva su BuyOn)`,
    };
  }

  // 3. Verified Archive HTML snapshot fallback (when Cloudflare blocks server fetch)
  try {
    const availRes = await safeFetch(
      'https://archive.org/wayback/available?url=https://www.buyon.it/'
    );
    if (availRes.ok) {
      const availJson = (await availRes.json()) as {
        archived_snapshots?: { closest?: { url?: string; timestamp?: string } };
      };
      const snapUrlRaw = availJson.archived_snapshots?.closest?.url?.replace('http://', 'https://');
      const ts = availJson.archived_snapshots?.closest?.timestamp;
      if (snapUrlRaw) {
        const snapRes = await safeFetch(snapUrlRaw, 15000);
        if (snapRes.ok) {
          const snapHtml = await snapRes.text();
          const parsed = parseBuyonHtml(snapHtml, nowIso);
          if (parsed.length > 0) {
            const formattedTs = ts
              ? `${ts.slice(6, 8)}/${ts.slice(4, 6)}/${ts.slice(0, 4)}`
              : 'recente';
            return {
              sourceId: 'buyon',
              sourceName: 'BuyOn',
              displayUrl: 'www.buyon.it',
              requestedUrl,
              status: 'snapshot',
              offers: parsed,
              contentHash: hashOffers(parsed),
              note: `Snapshot verificato (${formattedTs}) — BuyOn blocca richieste server dirette`,
            };
          }
        }
      }
    }
  } catch {
    // Fall through to error state
  }

  return {
    sourceId: 'buyon',
    sourceName: 'BuyOn',
    displayUrl: 'www.buyon.it',
    requestedUrl,
    status: 'error',
    offers: [],
    contentHash: 'error',
    note: 'BuyOn richiede verifica browser anti-bot (Challenge 403)',
  };
}

const ITALIAN_MONTHS: Record<string, number> = {
  gennaio: 0,
  febbraio: 1,
  marzo: 2,
  aprile: 3,
  maggio: 4,
  giugno: 5,
  luglio: 6,
  agosto: 7,
  settembre: 8,
  ottobre: 9,
  novembre: 10,
  dicembre: 11,
};

function extractExpiryIso(text: string): string | undefined {
  // Pattern 1: "fino al 31 dicembre 2026" / "entro il 15 gennaio 2027"
  const wordMatch = text.match(
    /(?:fino\s+al|entro\s+il|scade\s+il|valido\s+fino\s+al|termine)\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/i
  );
  if (wordMatch) {
    const day = Number(wordMatch[1]);
    const month = ITALIAN_MONTHS[wordMatch[2].toLowerCase()];
    const year = Number(wordMatch[3]);
    if (month !== undefined && day >= 1 && day <= 31 && year >= 2025 && year <= 2035) {
      const dt = new Date(Date.UTC(year, month, day, 22, 59, 0));
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }

  // Pattern 2: "fino al 31/12/2026" / "scadenza 30.11.2026" / "entro il 15-12-2026"
  const numMatch = text.match(
    /(?:fino\s+al|entro\s+il|scade\s+il|scadenza|valido\s+fino\s+al)\s+(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i
  );
  if (numMatch) {
    const day = Number(numMatch[1]);
    const month = Number(numMatch[2]) - 1;
    const year = Number(numMatch[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2025 && year <= 2035) {
      const dt = new Date(Date.UTC(year, month, day, 22, 59, 0));
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// 6. WIDILO ITALIA (https://www.widilo.it)
// ---------------------------------------------------------------------------
export async function scrapeWidilo(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://www.widilo.it';
  const offers: RawOffer[] = [];
  const seenUrls = new Set<string>();

  try {
    const [homeRes, popularRes] = await Promise.all([
      safeFetch(requestedUrl),
      safeFetch('https://www.widilo.it/cashback-piu-popolari').catch(() => null),
    ]);

    const etag = homeRes.headers.get('etag') ?? undefined;
    const lastModified = homeRes.headers.get('last-modified') ?? undefined;

    const parsePage = (html: string) => {
      const $ = cheerio.load(html);
      $('a[href*="/codice-sconto/"]').each((_, el) => {
        if (offers.length >= 28) return;
        const href = $(el).attr('href');
        const offerUrl = safeHttpUrl(href, requestedUrl);
        if (!offerUrl || seenUrls.has(offerUrl)) return;

        const slug = offerUrl.split('/codice-sconto/')[1]?.split(/[?#]/)[0] ?? '';
        const slugMerchant = slug
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim();

        const rawText = cleanText($(el).text(), 150);
        const cardText = cleanText($(el).parent().text(), 180);
        const combinedText = rawText.length >= 8 ? rawText : cardText;
        if (!combinedText || combinedText.length < 3) return;

        const img = $(el).find('img').first().length
          ? $(el).find('img').first()
          : $(el).closest('div, li, article').find('img').first();
        const imageUrl = safeHttpUrl(img.attr('data-src') || img.attr('src'), requestedUrl);

        const merchant = cleanText(img.attr('alt')?.replace(/logo/i, ''), 45) || slugMerchant || 'Widilo Partner';
        seenUrls.add(offerUrl);

        const category = classifyItalianOffer(combinedText, 'cashback');
        const cleanedRateText = combinedText
          .replace(/Potenziato$/i, '')
          .replace(/(\d+(?:[,.]\d+)?%)\s*(\d+(?:[,.]\d+)?%)/, '$1 (prima $2)')
          .trim();

        const title = cleanedRateText.toLowerCase().includes(merchant.toLowerCase())
          ? cleanedRateText
          : `${merchant} — ${cleanedRateText}`;

        offers.push({
          id: makeId('widilo', offerUrl),
          title,
          merchant,
          description: `Cashback e codici sconto verificati su Widilo Italia per ${merchant}.`,
          category,
          sourceId: 'widilo',
          sourceName: 'Widilo',
          sourceUrl: requestedUrl,
          offerUrl,
          rewardLabel: extractRewardLabel(cleanedRateText, category),
          imageUrl,
          updatedAt: nowIso,
        });
      });
    };

    if (homeRes.ok) {
      parsePage(await homeRes.text());
    }
    if (popularRes && popularRes.ok) {
      parsePage(await popularRes.text());
    }

    const finalOffers = offers.slice(0, 26);
    return {
      sourceId: 'widilo',
      sourceName: 'Widilo',
      displayUrl: 'www.widilo.it',
      requestedUrl,
      status: finalOffers.length > 0 ? 'live' : 'error',
      offers: finalOffers,
      contentHash: hashOffers(finalOffers),
      etag,
      lastModified,
      note: `${finalOffers.length} offerte cashback e codici sconto live`,
    };
  } catch (err) {
    return {
      sourceId: 'widilo',
      sourceName: 'Widilo',
      displayUrl: 'www.widilo.it',
      requestedUrl,
      status: 'error',
      offers: [],
      contentHash: 'error',
      note: err instanceof Error ? err.message : 'Errore di connessione',
    };
  }
}

// ---------------------------------------------------------------------------
// 7. P&G PER TE (https://www.pgperte.it)
// ---------------------------------------------------------------------------
function extractPgExpiryFromUrl(urlStr: string): string | undefined {
  // Pattern in PG urls: ..._DDMMYYYY_DDMMYYYY or _DDMMYY_DDMMYY
  const fullMatch = urlStr.match(/_(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})(\d{4})(?:\/|$)/);
  if (fullMatch) {
    const day = Number(fullMatch[4]);
    const month = Number(fullMatch[5]) - 1;
    const year = Number(fullMatch[6]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2025 && year <= 2035) {
      const dt = new Date(Date.UTC(year, month, day, 22, 59, 0));
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }
  return undefined;
}

export async function scrapePgPerTe(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://www.pgperte.it';
  const cashbackPageUrl = 'https://www.pgperte.it/Cashback';
  const promoPageUrl = 'https://www.pgperte.it/promozioni';
  const offers: RawOffer[] = [];
  const seenUrls = new Set<string>();

  try {
    const [cbRes, promoRes] = await Promise.all([
      safeFetch(cashbackPageUrl),
      safeFetch(promoPageUrl).catch(() => null),
    ]);

    const etag = cbRes.headers.get('etag') ?? promoRes?.headers.get('etag') ?? undefined;
    const lastModified =
      cbRes.headers.get('last-modified') ?? promoRes?.headers.get('last-modified') ?? undefined;

    if (cbRes.ok) {
      const html = await cbRes.text();
      const $ = cheerio.load(html);

      $('.pg-cashback-cards__card').each((_, el) => {
        const anchor = $(el).find('a[href]').first();
        const offerUrl = safeHttpUrl(anchor.attr('href'), cashbackPageUrl);
        if (!offerUrl || seenUrls.has(offerUrl)) return;

        const brandTitle = cleanText(
          $(el).find('h2, h3, .pg-cashback-cards__title').first().text() ||
            $(el).find('.pg-cashback-cards__body').text().replace(/Scopri l'offerta/i, ''),
          60
        );
        if (!brandTitle) return;
        seenUrls.add(offerUrl);

        const img = $(el).find('img').first();
        const imageUrl = safeHttpUrl(img.attr('data-src') || img.attr('src'), requestedUrl);
        const expiresAt = extractPgExpiryFromUrl(offerUrl);

        offers.push({
          id: makeId('pgperte', offerUrl),
          title: `Cashback ${brandTitle} — P&G Per Te`,
          merchant: brandTitle,
          description: `Iniziativa Cashback e Rimborso ufficiale P&G Per Te sui prodotti ${brandTitle}.`,
          category: 'cashback',
          sourceId: 'pgperte',
          sourceName: 'P&G Per Te',
          sourceUrl: requestedUrl,
          offerUrl,
          rewardLabel: 'Cashback P&G',
          imageUrl,
          expiresAt,
          updatedAt: nowIso,
        });
      });
    }

    if (promoRes && promoRes.ok) {
      const html = await promoRes.text();
      const $ = cheerio.load(html);

      $('a[href*="promozioni.pgperte.it"]').each((_, el) => {
        if (offers.length >= 26) return;
        const offerUrl = safeHttpUrl($(el).attr('href'), promoPageUrl);
        if (!offerUrl || seenUrls.has(offerUrl)) return;

        const card = $(el).closest('div[class*="card"], article, section, li');
        const heading = cleanText(
          card.find('h2, h3, h4').first().text() ||
            $(el).prevAll('h2, h3, h4, p').first().text() ||
            $(el).parent().text().replace(/PARTECIPA|CANDIDATI ORA|SCOPRI/gi, ''),
          130
        );
        if (!heading) return;

        const expiresAt = extractPgExpiryFromUrl(offerUrl);
        if (expiresAt && Date.parse(expiresAt) < Date.now()) {
          return; // Skip expired promotions
        }

        seenUrls.add(offerUrl);
        const img = card.find('img').first();
        const imageUrl = safeHttpUrl(img.attr('data-src') || img.attr('src'), requestedUrl);
        const category = classifyItalianOffer(heading, 'prova-gratis');

        offers.push({
          id: makeId('pgperte', offerUrl),
          title: heading,
          merchant: extractMerchantFromTitle(heading, 'P&G Per Te'),
          description: 'Promozione, premio certo o campione omaggio ufficiale su P&G Per Te.',
          category,
          sourceId: 'pgperte',
          sourceName: 'P&G Per Te',
          sourceUrl: requestedUrl,
          offerUrl,
          rewardLabel: /vinci/i.test(heading)
            ? 'Concorso P&G'
            : extractRewardLabel(heading, category),
          imageUrl,
          expiresAt,
          updatedAt: nowIso,
        });
      });
    }

    return {
      sourceId: 'pgperte',
      sourceName: 'P&G Per Te',
      displayUrl: 'www.pgperte.it',
      requestedUrl,
      status: offers.length > 0 ? 'live' : 'error',
      offers,
      contentHash: hashOffers(offers),
      etag,
      lastModified,
      note: `${offers.length} cashback e promozioni ufficiali P&G`,
    };
  } catch (err) {
    return {
      sourceId: 'pgperte',
      sourceName: 'P&G Per Te',
      displayUrl: 'www.pgperte.it',
      requestedUrl,
      status: 'error',
      offers: [],
      contentHash: 'error',
      note: err instanceof Error ? err.message : 'Errore di connessione',
    };
  }
}

// ---------------------------------------------------------------------------
// 8. DIMMICOSACERCHI (https://www.dimmicosacerchi.it)
// ---------------------------------------------------------------------------
export async function scrapeDimmiCosaCerchi(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://www.dimmicosacerchi.it';
  const wpEndpoint = 'https://www.dimmicosacerchi.it/wp-json/wp/v2/posts?per_page=24&_embed';

  try {
    const res = await safeFetch(wpEndpoint);
    if (res.ok) {
      const posts = (await res.json()) as Array<{
        link?: string;
        date?: string;
        title?: { rendered?: string };
        excerpt?: { rendered?: string };
        _embedded?: {
          'wp:featuredmedia'?: Array<{ source_url?: string }>;
          'wp:term'?: Array<Array<{ name?: string; slug?: string }>>;
        };
      }>;

      const etag = res.headers.get('etag') ?? undefined;
      const lastModified = res.headers.get('last-modified') ?? undefined;
      const offers: RawOffer[] = [];

      for (const post of posts) {
        const href = safeHttpUrl(post.link, requestedUrl);
        const title = cleanText(post.title?.rendered, 150);
        if (!href || !title) continue;

        const excerpt = cleanText(post.excerpt?.rendered, 190);
        const terms = (post._embedded?.['wp:term'] ?? [])
          .flat()
          .map((t) => `${t.name ?? ''} ${t.slug ?? ''}`)
          .join(' ');
        const combined = `${title} ${excerpt} ${terms}`;

        let category = classifyItalianOffer(combined, 'prova-gratis');
        if (/cashback|provami\s*gratis|rimbors|spendi\s*e\s*riprendi/i.test(combined)) {
          category = /provami\s*gratis|100%/i.test(combined) ? 'prova-gratis' : 'cashback';
        } else if (/buon[oi]\s*sconto|codic[ei]\s*sconto|coupon/i.test(combined)) {
          category = 'codice-sconto';
        }

        const imageUrl = safeHttpUrl(
          post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
          requestedUrl
        );

        offers.push({
          id: makeId('dimmicosacerchi', href),
          title,
          merchant: extractMerchantFromTitle(title, 'DimmiCosaCerchi'),
          description:
            excerpt || 'Segnalazione attiva su DimmiCosaCerchi tra campioni omaggio, cashback e sconti.',
          category,
          sourceId: 'dimmicosacerchi',
          sourceName: 'DimmiCosaCerchi',
          sourceUrl: requestedUrl,
          offerUrl: href,
          rewardLabel: extractRewardLabel(combined, category),
          imageUrl,
          publishedAt: post.date,
          updatedAt: nowIso,
        });
      }

      if (offers.length > 0) {
        return {
          sourceId: 'dimmicosacerchi',
          sourceName: 'DimmiCosaCerchi',
          displayUrl: 'www.dimmicosacerchi.it',
          requestedUrl,
          status: 'live',
          offers,
          contentHash: hashOffers(offers),
          etag,
          lastModified,
          note: `${offers.length} articoli live (campioni, cashback e buoni)`,
        };
      }
    }
  } catch {
    // Fall through to RSS
  }

  // RSS Feed fallback
  try {
    const rssRes = await safeFetch('https://www.dimmicosacerchi.it/feed/');
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      const offers: RawOffer[] = [];
      $('item').each((_, el) => {
        if (offers.length >= 20) return;
        const title = cleanText($(el).find('title').first().text(), 150);
        const href = safeHttpUrl($(el).find('link').first().text(), requestedUrl);
        const desc = cleanText($(el).find('description').first().text(), 180);
        const pubDate = cleanText($(el).find('pubDate').first().text(), 60);
        if (!title || !href) return;
        const category = classifyItalianOffer(`${title} ${desc}`, 'prova-gratis');
        offers.push({
          id: makeId('dimmicosacerchi', href),
          title,
          merchant: extractMerchantFromTitle(title, 'DimmiCosaCerchi'),
          description: desc || 'Segnalazione pubblicata su DimmiCosaCerchi.',
          category,
          sourceId: 'dimmicosacerchi',
          sourceName: 'DimmiCosaCerchi',
          sourceUrl: requestedUrl,
          offerUrl: href,
          rewardLabel: extractRewardLabel(`${title} ${desc}`, category),
          publishedAt: pubDate || undefined,
          updatedAt: nowIso,
        });
      });

      if (offers.length > 0) {
        return {
          sourceId: 'dimmicosacerchi',
          sourceName: 'DimmiCosaCerchi',
          displayUrl: 'www.dimmicosacerchi.it',
          requestedUrl,
          status: 'live',
          offers,
          contentHash: hashOffers(offers),
          note: `${offers.length} offerte live (feed RSS)`,
        };
      }
    }
  } catch {
    // Fall through
  }

  return {
    sourceId: 'dimmicosacerchi',
    sourceName: 'DimmiCosaCerchi',
    displayUrl: 'www.dimmicosacerchi.it',
    requestedUrl,
    status: 'error',
    offers: [],
    contentHash: 'error',
    note: 'Impossibile raggiungere dimmicosacerchi.it',
  };
}

// ---------------------------------------------------------------------------
// 9. CODICERISPARMIO (https://codicerisparmio.it)
// ---------------------------------------------------------------------------
export async function scrapeCodiceRisparmio(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://www.codicerisparmio.it';
  const base = 'https://codicerisparmio.it';
  const offers: RawOffer[] = [];
  const seenKeys = new Set<string>();

  try {
    const res = await safeFetch(requestedUrl);
    const etag = res.headers.get('etag') ?? undefined;
    const lastModified = res.headers.get('last-modified') ?? undefined;

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $('a[href*="codeid="]').each((_, el) => {
        if (offers.length >= 28) return;
        const offerUrl = safeHttpUrl($(el).attr('href'), base);
        if (!offerUrl || seenKeys.has(offerUrl)) return;

        const card = $(el).closest('div[class*="min-h-"], div.rounded-2xl, article, li, div.bg-white');
        const cardText = cleanText(card.text() || $(el).text(), 180)
          .replace(/\b(Scopri il Codice|Codice Esclusivo|ESCLUSIVO)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        const slug = offerUrl.match(/\/negozi\/([^/?#]+)/i)?.[1] ?? '';
        const merchant = slug
          ? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          : extractMerchantFromTitle(cardText, 'CodiceRisparmio');

        const title = cardText.length >= 8 ? cardText : `Codice sconto ${merchant}`;
        seenKeys.add(offerUrl);

        const img = card.find('img').first();
        const imageUrl = safeHttpUrl(img.attr('data-src') || img.attr('src'), base);
        const category = classifyItalianOffer(title, 'codice-sconto');

        offers.push({
          id: makeId('codicerisparmio', offerUrl),
          title,
          merchant,
          description: `Coupon e codice sconto verificato su CodiceRisparmio per ${merchant}.`,
          category,
          sourceId: 'codicerisparmio',
          sourceName: 'CodiceRisparmio',
          sourceUrl: requestedUrl,
          offerUrl,
          rewardLabel: extractRewardLabel(title, 'codice-sconto'),
          imageUrl,
          updatedAt: nowIso,
        });
      });

      // Fallback to top merchant pages if fewer than 10 coupon cards found
      if (offers.length < 10) {
        $('a[href*="/negozi/"]').each((_, el) => {
          if (offers.length >= 24) return;
          const offerUrl = safeHttpUrl($(el).attr('href'), base);
          const text = cleanText($(el).text(), 80);
          if (!offerUrl || !text || /\/negozi\/?$/i.test(offerUrl) || seenKeys.has(offerUrl)) {
            return;
          }
          seenKeys.add(offerUrl);
          offers.push({
            id: makeId('codicerisparmio', offerUrl),
            title: `Codici sconto e promo ${text}`,
            merchant: text,
            description: `Scopri tutti i buoni sconto attivi su ${text} via CodiceRisparmio.`,
            category: 'codice-sconto',
            sourceId: 'codicerisparmio',
            sourceName: 'CodiceRisparmio',
            sourceUrl: requestedUrl,
            offerUrl,
            rewardLabel: 'Codice Sconto',
            updatedAt: nowIso,
          });
        });
      }
    }

    return {
      sourceId: 'codicerisparmio',
      sourceName: 'CodiceRisparmio',
      displayUrl: 'www.codicerisparmio.it',
      requestedUrl,
      status: offers.length > 0 ? 'live' : 'error',
      offers,
      contentHash: hashOffers(offers),
      etag,
      lastModified,
      note: `${offers.length} codici sconto e coupon verificati`,
    };
  } catch (err) {
    return {
      sourceId: 'codicerisparmio',
      sourceName: 'CodiceRisparmio',
      displayUrl: 'www.codicerisparmio.it',
      requestedUrl,
      status: 'error',
      offers: [],
      contentHash: 'error',
      note: err instanceof Error ? err.message : 'Errore di connessione',
    };
  }
}

// ---------------------------------------------------------------------------
// 10. CASHBACKDEALS ITALIA (https://www.cashbackdeals.it/cashback)
// ---------------------------------------------------------------------------
interface CashbackDealsDeal {
  dealId?: string;
  type?: string;
  title?: string;
  details?: string | null;
  isActive?: boolean;
  imageUrl?: string | null;
  expiryDate?: string | null;
  voucherCode?: string | null;
  cashback?: {
    type?: string;
    percentage?: number | null;
    amount?: number | null;
  } | null;
}

interface CashbackDealsStore {
  storeId?: string;
  name?: string;
  isActive?: boolean;
  shortDescription?: string;
  logoUrl?: string;
  logoSquareUrl?: string | null;
  urlPathSegment?: string;
  deals?: CashbackDealsDeal[];
}

export async function scrapeCashbackDeals(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://www.cashbackdeals.it';
  const cashbackUrl = 'https://www.cashbackdeals.it/cashback';
  const offers: RawOffer[] = [];
  const seenIds = new Set<string>();

  try {
    const res = await safeFetch(cashbackUrl);
    const etag = res.headers.get('etag') ?? undefined;
    const lastModified = res.headers.get('last-modified') ?? undefined;

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const nextRaw = $('#__NEXT_DATA__').text();
      if (nextRaw) {
        const parsed = JSON.parse(nextRaw) as {
          props?: { pageProps?: { data?: { stores?: CashbackDealsStore[] } } };
        };
        const stores = parsed.props?.pageProps?.data?.stores ?? [];
        const nowMs = Date.now();

        for (const store of stores) {
          if (offers.length >= 28) break;
          if (!store.isActive || !store.name || !store.urlPathSegment) continue;

          const offerUrl = safeHttpUrl(
            `https://www.cashbackdeals.it/cashback/${store.urlPathSegment}`,
            requestedUrl
          );
          if (!offerUrl || seenIds.has(offerUrl)) continue;

          const activeDeals = (store.deals ?? []).filter((d) => {
            if (d.isActive === false) return false;
            if (d.expiryDate) {
              const expMs = Date.parse(d.expiryDate);
              if (!Number.isNaN(expMs) && expMs < nowMs) return false;
            }
            return true;
          });

          const primaryDeal =
            activeDeals.find((d) => d.voucherCode || (d.title && d.title !== 'Acquisto Online')) ??
            activeDeals[0];
          if (!primaryDeal) continue;

          seenIds.add(offerUrl);

          const cbPct = primaryDeal.cashback?.percentage;
          const cbAmt = primaryDeal.cashback?.amount;
          const rewardLabel =
            typeof cbPct === 'number' && cbPct > 0
              ? `Cashback ${String(cbPct).replace('.', ',')}%`
              : typeof cbAmt === 'number' && cbAmt > 0
                ? `Cashback ${String(cbAmt).replace('.', ',')}€`
                : 'Cashback';

          const dealTitle = cleanText(primaryDeal.title, 120);
          const fullTitle =
            dealTitle && dealTitle.toLowerCase() !== 'acquisto online'
              ? `${store.name} — ${dealTitle}`
              : `Cashback ${store.name}: ${rewardLabel.replace('Cashback ', '')}`;

          const category: OfferCategory = primaryDeal.voucherCode
            ? 'codice-sconto'
            : classifyItalianOffer(`${fullTitle} ${primaryDeal.details ?? ''}`, 'cashback');

          const imageUrl = safeHttpUrl(
            store.logoUrl || store.logoSquareUrl || primaryDeal.imageUrl,
            requestedUrl
          );

          let expiresAt: string | undefined;
          if (primaryDeal.expiryDate) {
            const parsedExp = Date.parse(primaryDeal.expiryDate);
            if (!Number.isNaN(parsedExp) && parsedExp > nowMs) {
              expiresAt = new Date(parsedExp).toISOString();
            }
          }

          offers.push({
            id: makeId('cashbackdeals', `${store.storeId ?? offerUrl}`),
            title: fullTitle,
            merchant: cleanText(store.name, 50),
            description:
              cleanText(primaryDeal.details || store.shortDescription, 190) ||
              `Guadagna CashCoin con gli acquisti online su ${store.name} tramite CashbackDeals Italia.`,
            category,
            sourceId: 'cashbackdeals',
            sourceName: 'CashbackDeals',
            sourceUrl: requestedUrl,
            offerUrl,
            rewardLabel,
            couponCode: primaryDeal.voucherCode
              ? cleanText(primaryDeal.voucherCode, 40)
              : undefined,
            imageUrl,
            expiresAt,
            updatedAt: nowIso,
          });
        }
      }
    }

    return {
      sourceId: 'cashbackdeals',
      sourceName: 'CashbackDeals',
      displayUrl: 'www.cashbackdeals.it',
      requestedUrl,
      status: offers.length > 0 ? 'live' : 'error',
      offers,
      contentHash: hashOffers(offers),
      etag,
      lastModified,
      note: `${offers.length} negozi e offerte cashback italiane`,
    };
  } catch (err) {
    return {
      sourceId: 'cashbackdeals',
      sourceName: 'CashbackDeals',
      displayUrl: 'www.cashbackdeals.it',
      requestedUrl,
      status: 'error',
      offers: [],
      contentHash: 'error',
      note: err instanceof Error ? err.message : 'Errore di connessione',
    };
  }
}

// ---------------------------------------------------------------------------
// 11. SIMPLYBESTCOUPONS ITALIA (https://it.simplybestcoupons.com)
// ---------------------------------------------------------------------------
export async function scrapeSimplyBestCoupons(nowIso: string): Promise<InternalScrapeResult> {
  const requestedUrl = 'https://it.simplybestcoupons.com';
  const offers: RawOffer[] = [];
  const seenKeys = new Set<string>();

  try {
    const res = await safeFetch(requestedUrl);
    const etag = res.headers.get('etag') ?? undefined;
    const lastModified = res.headers.get('last-modified') ?? undefined;

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $('.item-block').each((_, el) => {
        if (offers.length >= 28) return;
        const main = $(el).find('.item-block-main');
        const storeAnchor = main.find('a[href*="/buoni/"]').first();
        const offerUrl = safeHttpUrl(storeAnchor.attr('href'), requestedUrl);
        const merchant = cleanText(storeAnchor.text(), 50);
        if (!offerUrl || !merchant) return;

        const cashbackBadge = cleanText($(el).find('.store-logo-container').text(), 40);
        const rawMainText = cleanText(main.text(), 220)
          .replace(merchant, '')
          .replace(/Mostra buono|Scopri l'offerta/gi, '')
          .trim();

        const expiryMatch = rawMainText.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
        let expiresAt: string | undefined;
        if (expiryMatch) {
          const day = Number(expiryMatch[1]);
          const month = Number(expiryMatch[2]) - 1;
          const year = Number(expiryMatch[3]);
          if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2025) {
            const dt = new Date(Date.UTC(year, month, day, 22, 59, 0));
            if (!Number.isNaN(dt.getTime())) expiresAt = dt.toISOString();
          }
        }

        const cleanBody = rawMainText.replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '').trim();
        const title = cleanBody ? `${merchant} — ${cleanBody}` : `Coupon ${merchant}`;
        const uniqueKey = `${offerUrl}|${cleanBody}`;
        if (seenKeys.has(uniqueKey)) return;
        seenKeys.add(uniqueKey);

        const img = $(el).find('img').first();
        const imgSrc = img.attr('data-src') || img.attr('src');
        const imageUrl =
          imgSrc && !/defaultstore\.svg/i.test(imgSrc)
            ? safeHttpUrl(imgSrc, requestedUrl)
            : undefined;

        const category: OfferCategory = cleanBody
          ? classifyItalianOffer(cleanBody, 'codice-sconto')
          : 'cashback';

        const extractedLabel = cleanBody ? extractRewardLabel(cleanBody, category) : '';
        const rewardLabel =
          extractedLabel && extractedLabel !== 'Codice Sconto'
            ? extractedLabel
            : cashbackBadge || 'Codice Sconto';

        offers.push({
          id: makeId('simplybestcoupons', uniqueKey),
          title,
          merchant,
          description: cashbackBadge
            ? `${cleanBody || 'Buono sconto attivo'} (${cashbackBadge} su SimplyBestCoupons Italia).`
            : `${cleanBody || 'Codice sconto verificato su SimplyBestCoupons Italia.'}`,
          category,
          sourceId: 'simplybestcoupons',
          sourceName: 'SimplyBestCoupons',
          sourceUrl: requestedUrl,
          offerUrl,
          rewardLabel,
          imageUrl,
          expiresAt,
          updatedAt: nowIso,
        });
      });

      // Also include top Italian cashback stores shown on homepage
      $('.store-logo-container a[href*="/buoni/"]').each((_, el) => {
        if (offers.length >= 26) return;
        const offerUrl = safeHttpUrl($(el).attr('href'), requestedUrl);
        const rateText = cleanText($(el).text(), 40);
        const img = $(el).find('img').first();
        const merchant =
          cleanText(img.attr('alt')?.replace(/\s*logo/i, ''), 45) ||
          cleanText(
            offerUrl?.split('/buoni/')[1]?.replace(/\/$/, '').replace(/\.[a-z]{2,4}$/i, ''),
            45
          );
        if (!offerUrl || !merchant || !rateText) return;
        const cbKey = `cb:${offerUrl}`;
        if (seenKeys.has(cbKey)) return;
        seenKeys.add(cbKey);

        const imgSrc = img.attr('data-src') || img.attr('src');
        const imageUrl =
          imgSrc && !/defaultstore\.svg/i.test(imgSrc)
            ? safeHttpUrl(imgSrc, requestedUrl)
            : undefined;

        offers.push({
          id: makeId('simplybestcoupons', cbKey),
          title: `Cashback ${merchant}: ${rateText.replace(/\s*cashback/i, '')}`,
          merchant,
          description: `Attiva il cashback su ${merchant} tramite SimplyBestCoupons Italia.`,
          category: 'cashback',
          sourceId: 'simplybestcoupons',
          sourceName: 'SimplyBestCoupons',
          sourceUrl: requestedUrl,
          offerUrl,
          rewardLabel: extractRewardLabel(rateText, 'cashback'),
          imageUrl,
          updatedAt: nowIso,
        });
      });
    }

    return {
      sourceId: 'simplybestcoupons',
      sourceName: 'SimplyBestCoupons',
      displayUrl: 'it.simplybestcoupons.com',
      requestedUrl,
      status: offers.length > 0 ? 'live' : 'error',
      offers,
      contentHash: hashOffers(offers),
      etag,
      lastModified,
      note: `${offers.length} coupon e cashback italiani`,
    };
  } catch (err) {
    return {
      sourceId: 'simplybestcoupons',
      sourceName: 'SimplyBestCoupons',
      displayUrl: 'it.simplybestcoupons.com',
      requestedUrl,
      status: 'error',
      offers: [],
      contentHash: 'error',
      note: err instanceof Error ? err.message : 'Errore di connessione',
    };
  }
}

export async function scrapeSourceById(sourceId: SourceId, nowIso: string): Promise<ScrapeResult> {
  let raw: InternalScrapeResult;
  switch (sourceId) {
    case 'buyon':
      raw = await scrapeBuyOn(nowIso);
      break;
    case 'scontiomaggio':
      raw = await scrapeScontOmaggio(nowIso);
      break;
    case 'letyshops':
      raw = await scrapeLetyShops(nowIso);
      break;
    case 'bestshopping':
      raw = await scrapeBestshopping(nowIso);
      break;
    case 'scontrinofelice':
      raw = await scrapeScontrinoFelice(nowIso);
      break;
    case 'widilo':
      raw = await scrapeWidilo(nowIso);
      break;
    case 'pgperte':
      raw = await scrapePgPerTe(nowIso);
      break;
    case 'dimmicosacerchi':
      raw = await scrapeDimmiCosaCerchi(nowIso);
      break;
    case 'codicerisparmio':
      raw = await scrapeCodiceRisparmio(nowIso);
      break;
    case 'cashbackdeals':
      raw = await scrapeCashbackDeals(nowIso);
      break;
    case 'simplybestcoupons':
      raw = await scrapeSimplyBestCoupons(nowIso);
      break;
  }

  return {
    ...raw,
    offers: raw.offers.map((offer) => ({
      ...offer,
      tags: categorizeDeal(offer.title, offer.merchant, offer.description, offer.offerUrl),
      expiresAt: offer.expiresAt ?? extractExpiryIso(`${offer.title} ${offer.description}`),
    })),
  };
}

export const ALL_SOURCE_IDS: SourceId[] = [
  'bestshopping',
  'widilo',
  'letyshops',
  'codicerisparmio',
  'cashbackdeals',
  'simplybestcoupons',
  'pgperte',
  'dimmicosacerchi',
  'scontrinofelice',
  'scontiomaggio',
  'buyon',
];
