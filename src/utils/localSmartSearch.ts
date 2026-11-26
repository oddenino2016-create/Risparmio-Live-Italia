import type { AiDiscountSearchResponse, AiWebSuggestion, OfferItem } from '../types/offers';

const SYNONYM_GROUPS: string[][] = [
  ['elettronica', 'smartphone', 'telefono', 'iphone', 'samsung', 'pc', 'laptop', 'tv', 'tech', 'elettrodomestici', 'mediaworld', 'unieuro', 'amazon'],
  ['spesa', 'alimentari', 'supermercato', 'cibo', 'detersivi', 'carrefour', 'esselunga', 'conad', 'coop', 'lidl'],
  ['viaggi', 'volo', 'voli', 'aereo', 'hotel', 'vacanza', 'treno', 'booking', 'expedia', 'trenitalia', 'italo'],
  ['moda', 'abbigliamento', 'scarpe', 'vestiti', 'sport', 'nike', 'adidas', 'zalando', 'asos', 'shein'],
  ['casa', 'arredo', 'mobili', 'giardino', 'ikea', 'leroy', 'brico'],
  ['bellezza', 'profumi', 'cosmetici', 'salute', 'farmacia', 'sephora', 'douglas', 'notino'],
  ['gratis', 'omaggio', 'campioni', 'provami', 'rimborso', 'spendi', 'riprendi', 'prova'],
  ['codice', 'sconto', 'coupon', 'buono', 'promo', 'voucher'],
  ['cashback', 'rimborso', 'percentuale', 'guadagno'],
];

const STOP_WORDS = new Set([
  'per', 'con', 'che', 'una', 'uno', 'gli', 'del', 'della', 'delle', 'dei',
  'nel', 'nella', 'sul', 'sulla', 'oppure', 'come', 'dove', 'quali', 'cerca',
  'cerco', 'vorrei', 'voglio', 'sconti', 'offerte', 'offerta', 'migliori', 'online',
]);

function expandTokens(rawQuery: string): string[] {
  const base = rawQuery
    .toLowerCase()
    .split(/[^a-z0-9àèéìòù&]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  const expanded = new Set<string>(base);
  for (const tok of base) {
    for (const group of SYNONYM_GROUPS) {
      if (group.some((word) => word.includes(tok) || tok.includes(word))) {
        for (const word of group) expanded.add(word);
      }
    }
  }
  return Array.from(expanded);
}

export function runLocalSmartSearch(
  query: string,
  catalogOffers: OfferItem[]
): AiDiscountSearchResponse {
  const cleanQuery = query.trim();
  const baseTokens = cleanQuery
    .toLowerCase()
    .split(/[^a-z0-9àèéìòù&]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  const expandedTokens = expandTokens(cleanQuery);

  const scored = catalogOffers.map((offer) => {
    const merchantLow = offer.merchant.toLowerCase();
    const titleLow = offer.title.toLowerCase();
    const descLow = offer.description.toLowerCase();
    const sourceLow = offer.sourceName.toLowerCase();
    const tagsLow = offer.tags.join(' ').toLowerCase();
    const catLow = offer.category.toLowerCase();

    let score = 0;

    for (const tok of baseTokens) {
      if (merchantLow.includes(tok)) score += 12;
      if (titleLow.includes(tok)) score += 7;
      if (sourceLow.includes(tok)) score += 5;
      if (tagsLow.includes(tok) || catLow.includes(tok)) score += 4;
      if (descLow.includes(tok)) score += 2;
    }

    for (const syn of expandedTokens) {
      if (baseTokens.includes(syn)) continue;
      if (merchantLow.includes(syn)) score += 4;
      if (titleLow.includes(syn)) score += 3;
      if (tagsLow.includes(syn) || catLow.includes(syn)) score += 2;
      if (descLow.includes(syn)) score += 1;
    }

    if (score > 0 && offer.couponCode) score += 2;
    if (score > 0 && offer.expiresAt) score += 1;

    return { offer, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const matched = scored.filter((item) => item.score >= 2).slice(0, 9).map((i) => i.offer);
  const matchedOfferIds = matched.map((o) => o.id);

  const portalMap = new Map<string, { name: string; url: string; count: number }>();
  for (const item of matched) {
    const existing = portalMap.get(item.sourceId);
    if (existing) {
      existing.count += 1;
    } else {
      portalMap.set(item.sourceId, {
        name: item.sourceName,
        url: item.sourceUrl,
        count: 1,
      });
    }
  }

  const topCategories = new Map<string, number>();
  let couponMatches = 0;
  let cashbackMatches = 0;
  let freeMatches = 0;

  for (const item of matched) {
    if (item.category === 'codice-sconto') couponMatches += 1;
    if (item.category === 'cashback') cashbackMatches += 1;
    if (item.category === 'prova-gratis') freeMatches += 1;
    for (const t of item.tags) {
      topCategories.set(t, (topCategories.get(t) ?? 0) + 1);
    }
  }

  let summary = '';
  if (matched.length > 0) {
    const parts: string[] = [];
    if (couponMatches > 0) parts.push(`${couponMatches} codici sconto`);
    if (cashbackMatches > 0) parts.push(`${cashbackMatches} cashback`);
    if (freeMatches > 0) parts.push(`${freeMatches} prove gratis`);

    const portalNames = Array.from(portalMap.values())
      .slice(0, 3)
      .map((p) => p.name)
      .join(', ');

    summary = `Trovate ${matched.length} offerte pertinenti nel catalogo per "${cleanQuery}" (${parts.join(', ')}). I portali più rilevanti in questo momento sono ${portalNames}. Consiglio: verifica se puoi applicare un codice sconto al checkout passando prima da un portale cashback per massimizzare il risparmio.`;
  } else {
    summary = `Nessuna corrispondenza diretta nel catalogo salvato per "${cleanQuery}". Prova a cercare il nome del negozio (es. Amazon, MediaWorld, Zalando) oppure una categoria più ampia come Elettronica, Spesa o Viaggi.`;
  }

  const webSuggestions: AiWebSuggestion[] = Array.from(portalMap.values())
    .slice(0, 4)
    .map((p) => ({
      merchant: p.name,
      title: `Controlla tutte le promo attive su ${p.name}`,
      rewardLabel: `${p.count} ${p.count === 1 ? 'offerta' : 'offerte'} trovate`,
      category: 'cashback',
      url: p.url,
      notes: `Collegamento diretto al portale ${p.name} per verificare ulteriori codici o percentuali aggiornate.`,
    }));

  const groundingSources = Array.from(portalMap.values())
    .slice(0, 4)
    .map((p) => ({
      title: p.name,
      uri: p.url,
    }));

  return {
    query: cleanQuery,
    summary,
    matchedOfferIds,
    webSuggestions,
    groundingSources,
  };
}
