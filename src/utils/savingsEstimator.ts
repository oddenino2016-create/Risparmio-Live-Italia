import type { DealCategory, OfferItem } from '../types/offers';

export interface OfferSavingBaseline {
  mode: 'percent' | 'fixed';
  percentRate: number;
  fixedAmountEur: number;
  defaultAvgSpendEur: number;
  defaultAnnualUses: number;
  detectedFromOffer: boolean;
  ruleLabel: string;
}

const DEFAULT_SPEND_BY_TAG: Partial<Record<DealCategory, number>> = {
  travel: 240,
  electronics: 140,
  'home-goods': 85,
  fashion: 75,
  groceries: 65,
  'beauty-health': 45,
  entertainment: 40,
};

function getDefaultSpendForOffer(offer: OfferItem): number {
  for (const tag of offer.tags) {
    const val = DEFAULT_SPEND_BY_TAG[tag];
    if (val) return val;
  }
  return 70;
}

function getDefaultAnnualUses(offer: OfferItem): number {
  if (offer.tags.includes('travel')) return 4;
  if (offer.tags.includes('electronics')) return 4;
  if (offer.tags.includes('groceries')) return 24;
  if (offer.category === 'prova-gratis') return 12;
  return 12;
}

function parseNumericToken(raw: string): number | null {
  const normalized = raw.replace(',', '.').trim();
  const val = Number.parseFloat(normalized);
  if (!Number.isFinite(val) || val <= 0) return null;
  return val;
}

/**
 * Extracts a realistic baseline (% discount/cashback or fixed EUR value)
 * from the offer's rewardLabel/title/description.
 */
export function deriveOfferSavingBaseline(offer: OfferItem): OfferSavingBaseline {
  const defaultAvgSpendEur = getDefaultSpendForOffer(offer);
  const defaultAnnualUses = getDefaultAnnualUses(offer);

  const candidates = [offer.rewardLabel, offer.title, offer.description];

  // 1. Prefer explicit percentage when present (e.g. "6,5%", "20 %")
  for (const text of candidates) {
    const pctMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (pctMatch) {
      const rate = parseNumericToken(pctMatch[1]);
      if (rate !== null && rate <= 90) {
        return {
          mode: 'percent',
          percentRate: rate,
          fixedAmountEur: Math.round(defaultAvgSpendEur * (rate / 100) * 100) / 100,
          defaultAvgSpendEur,
          defaultAnnualUses,
          detectedFromOffer: true,
          ruleLabel: `Vantaggio rilevato: ${rate.toLocaleString('it-IT')}%`,
        };
      }
    }
  }

  // 2. Check explicit euro amount (e.g. "15€", "€ 10,00", "20 euro")
  for (const text of candidates) {
    const eurMatch =
      text.match(/€\s*(\d+(?:[.,]\d+)?)/i) ??
      text.match(/(\d+(?:[.,]\d+)?)\s*(?:€|(?:eur|euro)(?![a-zà-ù]))/i);
    if (eurMatch) {
      const eurVal = parseNumericToken(eurMatch[1]);
      if (eurVal !== null && eurVal <= 1000) {
        return {
          mode: 'fixed',
          percentRate: 10,
          fixedAmountEur: eurVal,
          defaultAvgSpendEur,
          defaultAnnualUses,
          detectedFromOffer: true,
          ruleLabel: `Valore fisso rilevato: € ${eurVal.toLocaleString('it-IT', {
            minimumFractionDigits: eurVal % 1 === 0 ? 0 : 2,
            maximumFractionDigits: 2,
          })}`,
        };
      }
    }
  }

  // 3. Sensible default by offer category when promotional copy has no explicit number
  if (offer.category === 'prova-gratis') {
    return {
      mode: 'fixed',
      percentRate: 100,
      fixedAmountEur: 5,
      defaultAvgSpendEur,
      defaultAnnualUses,
      detectedFromOffer: false,
      ruleLabel: 'Stima modificabile (media rimborso prova gratis)',
    };
  }

  const fallbackPct = offer.category === 'cashback' ? 4 : 10;
  return {
    mode: 'percent',
    percentRate: fallbackPct,
    fixedAmountEur: Math.round(defaultAvgSpendEur * (fallbackPct / 100) * 100) / 100,
    defaultAvgSpendEur,
    defaultAnnualUses,
    detectedFromOffer: false,
    ruleLabel: `Stima modificabile (base ${fallbackPct}% per ${
      offer.category === 'cashback' ? 'cashback' : 'codici sconto'
    })`,
  };
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
