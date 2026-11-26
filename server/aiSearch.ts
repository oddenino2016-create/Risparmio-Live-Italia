import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { OfferItem } from '../src/types/offers.js';

export interface AiWebSuggestion {
  merchant: string;
  title: string;
  rewardLabel: string;
  category: 'codice-sconto' | 'cashback' | 'prova-gratis';
  couponCode?: string;
  url?: string;
  notes: string;
}

export interface AiGroundingSource {
  title: string;
  uri: string;
}

export interface AiDiscountSearchResponse {
  query: string;
  summary: string;
  matchedOfferIds: string[];
  webSuggestions: AiWebSuggestion[];
  groundingSources: AiGroundingSource[];
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Chiave API Gemini non configurata sul server. Verifica Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function selectRelevantCatalogSample(offers: OfferItem[], query: string): OfferItem[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9àèéìòù]+/i)
    .filter((t) => t.length >= 2);

  const scored = offers.map((offer) => {
    const haystack =
      `${offer.merchant} ${offer.title} ${offer.description} ${offer.category} ${offer.tags.join(' ')} ${offer.sourceName}`.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (offer.merchant.toLowerCase().includes(tok)) score += 5;
      if (offer.title.toLowerCase().includes(tok)) score += 3;
      if (haystack.includes(tok)) score += 1;
    }
    return { offer, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topMatched = scored.filter((s) => s.score > 0).slice(0, 35).map((s) => s.offer);
  if (topMatched.length >= 20) return topMatched;

  const seen = new Set(topMatched.map((o) => o.id));
  for (const item of offers) {
    if (topMatched.length >= 40) break;
    if (!seen.has(item.id)) {
      seen.add(item.id);
      topMatched.push(item);
    }
  }
  return topMatched;
}

function sanitizeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!/^https?:\/\/.+/i.test(trimmed)) return undefined;
  try {
    return new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

export async function searchDiscountsWithAi(
  query: string,
  catalogOffers: OfferItem[]
): Promise<AiDiscountSearchResponse> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2 || cleanQuery.length > 300) {
    throw new Error('Inserisci una ricerca tra 2 e 300 caratteri.');
  }

  const ai = getGeminiClient();
  const sample = selectRelevantCatalogSample(catalogOffers, cleanQuery);
  const validIdSet = new Set(catalogOffers.map((o) => o.id));

  const catalogContext = sample
    .map(
      (o) =>
        `ID:${o.id} | ${o.merchant} | ${o.title} | ${o.rewardLabel} | Tipo:${o.category} | Fonte:${o.sourceName}${o.couponCode ? ` | Codice:${o.couponCode}` : ''}`
    )
    .join('\n');

  const prompt = `Richiesta dell'utente italiano: "${cleanQuery}"

Catalogo live attuale dai nostri 11 portali monitorati:
${catalogContext}

Obiettivo:
1. Individua eventuali ID esatti dal catalogo live sopra che soddisfano la richiesta dell'utente.
2. Usa anche Google Search per trovare codici sconto, promozioni cashback o iniziative provami gratis attualmente attive in Italia pertinenti alla richiesta (su negozi italiani o portali come Widilo, Bestshopping, LetyShops, BuyOn, CodiceRisparmio, ScontOmaggio, P&G Per Te).
3. Rispondi ESCLUSIVAMENTE con un oggetto JSON valido (senza testo fuori dal JSON) con questa struttura esatta:
{
  "summary": "Consiglio pratico in italiano (2-4 frasi) su come massimizzare il risparmio combinando sconti e cashback.",
  "matchedOfferIds": ["ID1", "ID2"],
  "webSuggestions": [
    {
      "merchant": "Nome Negozio o Brand",
      "title": "Titolo chiaro dell'offerta o codice sconto",
      "rewardLabel": "es. Sconto 15% o Cashback 6%",
      "category": "codice-sconto | cashback | prova-gratis",
      "couponCode": "CODICE_SE_NOTO_OPPURE_OMESSO",
      "url": "https://...",
      "notes": "Breve dettaglio sulle condizioni"
    }
  ]
}`;

  let response;
  try {
    response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Sei un esperto assistente italiano per il risparmio online, codici sconto, cashback e provami gratis. Rispondi sempre in italiano chiaro e concreto. Non inventare mai codici sconto inesistenti; se non c’è un codice testuale, lascia couponCode vuoto. Restituisci JSON valido.',
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(rawMsg)) {
      throw new Error(
        'Quota temporanea delle API Gemini esaurita o limite di richieste raggiunto. Riprova tra poco.'
      );
    }
    throw new Error(`Servizio IA temporaneamente non disponibile: ${rawMsg.slice(0, 180)}`);
  }

  const rawText = (response.text ?? '').trim();

  // Extract grounding sources from Google Search metadata
  const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundingSources: AiGroundingSource[] = [];
  const seenUris = new Set<string>();
  for (const chunk of rawChunks) {
    const uri = sanitizeHttpUrl(chunk.web?.uri);
    if (!uri || seenUris.has(uri)) continue;
    seenUris.add(uri);
    groundingSources.push({
      title: (chunk.web?.title || new URL(uri).hostname).trim().slice(0, 100),
      uri,
    });
  }

  let summary = '';
  let matchedOfferIds: string[] = [];
  let webSuggestions: AiWebSuggestion[] = [];

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        summary?: unknown;
        matchedOfferIds?: unknown;
        webSuggestions?: unknown;
      };

      if (typeof parsed.summary === 'string') {
        summary = parsed.summary.trim().slice(0, 800);
      }

      if (Array.isArray(parsed.matchedOfferIds)) {
        matchedOfferIds = parsed.matchedOfferIds
          .filter((id): id is string => typeof id === 'string' && validIdSet.has(id))
          .slice(0, 12);
      }

      if (Array.isArray(parsed.webSuggestions)) {
        for (const item of parsed.webSuggestions.slice(0, 6)) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const merchant = typeof rec.merchant === 'string' ? rec.merchant.trim().slice(0, 60) : '';
          const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, 160) : '';
          if (!merchant || !title) continue;

          const catRaw = typeof rec.category === 'string' ? rec.category : 'codice-sconto';
          const category: AiWebSuggestion['category'] =
            catRaw === 'cashback' || catRaw === 'prova-gratis' ? catRaw : 'codice-sconto';

          const codeRaw =
            typeof rec.couponCode === 'string' ? rec.couponCode.trim().slice(0, 40) : '';
          const couponCode =
            codeRaw && !/^(nessun|none|n\/a|null|vuoto|omesso)/i.test(codeRaw)
              ? codeRaw
              : undefined;

          webSuggestions.push({
            merchant,
            title,
            rewardLabel:
              typeof rec.rewardLabel === 'string' && rec.rewardLabel.trim()
                ? rec.rewardLabel.trim().slice(0, 50)
                : 'Offerta Web',
            category,
            couponCode,
            url: sanitizeHttpUrl(rec.url),
            notes:
              typeof rec.notes === 'string'
                ? rec.notes.trim().slice(0, 220)
                : 'Risultato rilevato tramite ricerca web IA.',
          });
        }
      }
    } catch {
      // Fallback to raw text summary if JSON parsing fails
      summary = rawText.replace(/```(?:json)?|```/g, '').trim().slice(0, 800);
    }
  } else {
    summary = rawText.slice(0, 800);
  }

  if (!summary) {
    summary =
      matchedOfferIds.length > 0 || webSuggestions.length > 0
        ? `Trovate ${matchedOfferIds.length} offerte nel catalogo live e ${webSuggestions.length} segnalazioni dal web per "${cleanQuery}".`
        : `Ecco i risultati della ricerca intelligente per "${cleanQuery}".`;
  }

  return {
    query: cleanQuery,
    summary,
    matchedOfferIds,
    webSuggestions,
    groundingSources: groundingSources.slice(0, 6),
  };
}
