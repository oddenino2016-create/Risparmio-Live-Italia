import {
  DEAL_CATEGORIES,
  type DealCategory,
  type OfferCategory,
  type OfferItem,
  type SavedDeal,
} from '../types/offers';

export interface RecommendedOffer {
  offer: OfferItem;
  matchedTags: DealCategory[];
  matchedTagLabels: string[];
  score: number;
}

const CATEGORY_LABEL_MAP = new Map(DEAL_CATEGORIES.map((c) => [c.id, c.label]));

/**
 * Computes top tag frequencies from the user's saved deals and recommends
 * unsaved catalog offers sharing those tags, ranked by tag affinity + diversity.
 */
export function buildTagBasedRecommendations(
  catalogOffers: OfferItem[],
  savedDeals: SavedDeal[],
  savedIds: Set<string>,
  limit = 6
): {
  topSavedTagLabels: string[];
  recommendations: RecommendedOffer[];
} {
  if (savedDeals.length === 0 || catalogOffers.length === 0) {
    return { topSavedTagLabels: [], recommendations: [] };
  }

  const tagWeights = new Map<DealCategory, number>();
  const typeCounts = new Map<OfferCategory, number>();

  for (const deal of savedDeals) {
    for (const tag of deal.tags) {
      tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + 1);
    }
    typeCounts.set(deal.category, (typeCounts.get(deal.category) ?? 0) + 1);
  }

  const topSavedTagLabels = [...tagWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => CATEGORY_LABEL_MAP.get(tag) ?? tag);

  const scored: RecommendedOffer[] = [];

  for (const offer of catalogOffers) {
    if (savedIds.has(offer.id)) continue;

    const matchedTags = offer.tags.filter((tag) => (tagWeights.get(tag) ?? 0) > 0);
    if (matchedTags.length === 0) continue;

    let score = 0;
    for (const tag of matchedTags) {
      score += (tagWeights.get(tag) ?? 0) * 2;
    }

    // Slight affinity boost if offer type matches user's saved deal mix
    if ((typeCounts.get(offer.category) ?? 0) > 0) {
      score += 0.5;
    }
    if (offer.isNew) {
      score += 0.25;
    }

    scored.push({
      offer,
      matchedTags,
      matchedTagLabels: matchedTags.map((t) => CATEGORY_LABEL_MAP.get(t) ?? t),
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Encourage merchant diversity across top recommendations while preserving relevance
  const picked: RecommendedOffer[] = [];
  const merchantCounts = new Map<string, number>();

  for (const item of scored) {
    if (picked.length >= limit) break;
    const merchantKey = item.offer.merchant.trim().toLowerCase();
    const seen = merchantCounts.get(merchantKey) ?? 0;
    if (seen < 2) {
      picked.push(item);
      merchantCounts.set(merchantKey, seen + 1);
    }
  }

  if (picked.length < limit) {
    const pickedIds = new Set(picked.map((p) => p.offer.id));
    for (const item of scored) {
      if (picked.length >= limit) break;
      if (!pickedIds.has(item.offer.id)) {
        picked.push(item);
      }
    }
  }

  return {
    topSavedTagLabels,
    recommendations: picked,
  };
}
