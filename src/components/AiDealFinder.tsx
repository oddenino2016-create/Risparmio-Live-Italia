import { useState } from 'react';
import { Check, Copy, ExternalLink, Search, Sparkles, X } from 'lucide-react';
import type { AiDiscountSearchResponse, OfferItem } from '../types/offers';
import { runLocalSmartSearch } from '../utils/localSmartSearch';
import { OfferCard } from './OfferCard';

interface AiDealFinderProps {
  catalogOffers: OfferItem[];
  savedIds: Set<string>;
  onToggleSave: (offer: OfferItem) => void;
}

const EXAMPLE_PROMPTS = [
  'Elettronica e smartphone con cashback o codice sconto',
  'Spesa supermercato, detersivi e provami gratis',
  'Viaggi, voli e prenotazioni hotel in sconto',
  'Abbigliamento sportivo e scarpe',
];

export function AiDealFinder({
  catalogOffers,
  savedIds,
  onToggleSave,
}: AiDealFinderProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiDiscountSearchResponse | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const runSearch = async (targetQuery: string) => {
    const clean = targetQuery.trim();
    if (clean.length < 2) {
      setError('Inserisci almeno 2 caratteri per avviare la ricerca.');
      return;
    }

    setQuery(clean);
    setSearching(true);
    setError(null);

    try {
      const data = runLocalSmartSearch(clean, catalogOffers);
      setResult(data);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  const matchedCatalogOffers = result
    ? result.matchedOfferIds
        .map((id) => catalogOffers.find((o) => o.id === id))
        .filter((o): o is OfferItem => Boolean(o))
    : [];

  return (
    <section
      id="ricerca-ia"
      aria-label="Ricerca sconti con Intelligenza Artificiale"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8"
    >
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Ricerca Intelligente Sconti · Motore Locale Gratuito</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1">
              Cerca Sconti, Cashback e Coupon in Tempo Reale
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl">
              Descrivi cosa desideri acquistare o il negozio: il motore semantico incrocia le
              offerte degli 11 portali monitorati e ti indirizza alle promozioni attive.
            </p>
          </div>

          {result && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-slate-900 transition-colors self-start md:self-auto cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Pulisci risultati</span>
            </button>
          )}
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={300}
              placeholder="Es. codice sconto MediaWorld elettrodomestici oppure cashback volo Roma..."
              aria-label="Cerca sconti e offerte per categoria o negozio"
              className="w-full h-11 pl-10 pr-4 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={searching}
            className="h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>{searching ? 'Analisi in corso…' : 'Trova sconti'}</span>
          </button>
        </form>

        {/* Interactive Quick Prompts */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Esempi:</span>
          {EXAMPLE_PROMPTS.map((sample) => (
            <button
              key={sample}
              type="button"
              disabled={searching}
              onClick={() => void runSearch(sample)}
              className="px-3 py-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              {sample}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {searching && (
          <div className="p-6 rounded-xl border border-slate-200 bg-slate-50 space-y-3 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/3" />
            <div className="h-3 bg-slate-200 rounded w-5/6" />
            <div className="h-3 bg-slate-200 rounded w-2/3" />
          </div>
        )}

        {/* Error State */}
        {!searching && error && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-medium text-rose-800">{error}</p>
            <button
              type="button"
              onClick={() => void runSearch(query)}
              className="px-3 py-1.5 text-xs font-semibold text-rose-800 bg-white border border-rose-200 rounded-lg hover:bg-rose-100 cursor-pointer"
            >
              Riprova
            </button>
          </div>
        )}

        {/* Results */}
        {!searching && result && (
          <div className="space-y-6 pt-2 border-t border-slate-100">
            {/* Strategy Summary */}
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wide mb-1">
                Suggerimento per &ldquo;{result.query}&rdquo;
              </p>
              <p className="text-sm text-slate-800 leading-relaxed">{result.summary}</p>
            </div>

            {/* Matched Catalog Deals */}
            {matchedCatalogOffers.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Offerte dal Catalogo ({matchedCatalogOffers.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {matchedCatalogOffers.map((offer) => (
                    <OfferCard
                      key={offer.id}
                      offer={offer}
                      isSaved={savedIds.has(offer.id)}
                      onToggleSave={onToggleSave}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Portal Suggestions */}
            {result.webSuggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Portali Consigliati ({result.webSuggestions.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.webSuggestions.map((item, idx) => {
                    const safeHref =
                      item.url && /^https?:\/\//i.test(item.url) ? item.url : undefined;
                    return (
                      <div
                        key={`${item.merchant}-${idx}`}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                            <span className="font-semibold text-slate-800">{item.merchant}</span>
                            <span className="font-mono font-semibold text-emerald-700">
                              {item.rewardLabel}
                            </span>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                            {item.notes}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                          {item.couponCode ? (
                            <button
                              type="button"
                              onClick={() => void handleCopy(item.couponCode!)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-semibold text-slate-900 bg-white border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                            >
                              <span>{item.couponCode}</span>
                              {copiedCode === item.couponCode ? (
                                <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">Nessun codice richiesto</span>
                          )}

                          {safeHref && (
                            <a
                              href={safeHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-emerald-700"
                            >
                              <span>Verifica offerta</span>
                              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty State when neither matched */}
            {matchedCatalogOffers.length === 0 && result.webSuggestions.length === 0 && (
              <p className="text-xs text-slate-500 py-2">
                Nessuna corrispondenza diretta trovata nel catalogo per questa richiesta. Prova con
                il nome di un negozio o una categoria più ampia.
              </p>
            )}

            {/* Grounding Sources */}
            {result.groundingSources.length > 0 && (
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-slate-600">Fonti consultate:</span>
                {result.groundingSources.map((src) => (
                  <a
                    key={src.uri}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                  >
                    <span className="truncate max-w-[200px]">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
