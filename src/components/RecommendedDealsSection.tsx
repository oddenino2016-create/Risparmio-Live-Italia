import { useMemo } from 'react';
import { Bookmark, Sparkles } from 'lucide-react';
import type { OfferItem, SavedDeal } from '../types/offers';
import { buildTagBasedRecommendations } from '../utils/recommendations';
import { OfferCard } from './OfferCard';

interface RecommendedDealsSectionProps {
  isAuthenticated: boolean;
  catalogOffers: OfferItem[];
  savedDeals: SavedDeal[];
  savedIds: Set<string>;
  getSaveCount: (offerId: string) => number;
  onToggleSave: (offer: OfferItem) => void;
  onSignIn: () => void;
}

export function RecommendedDealsSection({
  isAuthenticated,
  catalogOffers,
  savedDeals,
  savedIds,
  getSaveCount,
  onToggleSave,
  onSignIn,
}: RecommendedDealsSectionProps) {
  const { topSavedTagLabels, recommendations } = useMemo(
    () => buildTagBasedRecommendations(catalogOffers, savedDeals, savedIds, 6),
    [catalogOffers, savedDeals, savedIds]
  );

  return (
    <section
      id="consigliate"
      aria-label="Offerte consigliate per te"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8"
    >
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Suggerimenti personalizzati sui tuoi tag</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1">
              Consigliate per te
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              {topSavedTagLabels.length > 0
                ? `In base ai tag delle tue ${savedDeals.length} offerte salvate: ${topSavedTagLabels.join(' · ')}`
                : 'Selezioniamo automaticamente offerte affini alle categorie dei tuoi preferiti salvati.'}
            </p>
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                Accedi per ricevere consigli personalizzati
              </p>
              <p className="text-xs text-slate-600">
                Salva le promozioni che preferisci e troverai qui nuove offerte con gli stessi tag
                merceologici.
              </p>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Accedi con Google
            </button>
          </div>
        ) : savedDeals.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center gap-3.5">
            <Bookmark className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Salva la tua prima offerta per attivare i consigli
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Clicca su &ldquo;Salva&rdquo; su qualsiasi codice sconto o cashback nel catalogo
                qui sotto: analizzeremo i relativi tag per proporti subito offerte affini.
              </p>
            </div>
          </div>
        ) : recommendations.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">
            Hai già salvato tutte le principali offerte affini disponibili al momento. Aggiorna
            il catalogo per scoprire nuove promozioni.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recommendations.map(({ offer, matchedTagLabels }) => (
              <div key={offer.id} className="flex flex-col">
                <p className="text-[11px] font-medium text-emerald-700 mb-1.5 px-0.5 truncate">
                  Affine per: {matchedTagLabels.join(' · ')}
                </p>
                <div className="flex-1 flex [&>article]:w-full">
                  <OfferCard
                    offer={offer}
                    isSaved={savedIds.has(offer.id)}
                    saveCount={getSaveCount(offer.id)}
                    onToggleSave={onToggleSave}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
