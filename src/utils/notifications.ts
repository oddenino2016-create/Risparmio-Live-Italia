import {
  DEAL_CATEGORIES,
  type OfferCategory,
  type OfferItem,
  type SourceId,
  type UserProfile,
} from '../types/offers';

export interface PreferenceNotification {
  id: string;
  offer: OfferItem;
  reasons: string[];
  createdAt: string;
  read: boolean;
}

const CATEGORY_LABEL_MAP = new Map(DEAL_CATEGORIES.map((c) => [c.id, c.label]));

const OFFER_TYPE_LABEL_MAP: Record<OfferCategory, string> = {
  'codice-sconto': 'Codice Sconto',
  cashback: 'Cashback',
  'prova-gratis': 'Prova Gratis',
};

const SOURCE_LABEL_MAP: Record<SourceId, string> = {
  buyon: 'BuyOn',
  scontiomaggio: 'ScontOmaggio',
  letyshops: 'LetyShops Italia',
  bestshopping: 'Bestshopping',
  scontrinofelice: 'ScontrinoFelice',
  widilo: 'Widilo',
  pgperte: 'P&G Per Te',
  dimmicosacerchi: 'DimmiCosaCerchi',
  codicerisparmio: 'CodiceRisparmio',
  cashbackdeals: 'CashbackDeals',
  simplybestcoupons: 'SimplyBestCoupons',
};

export function evaluatePreferenceMatch(
  offer: OfferItem,
  profile: UserProfile | null
): { matched: boolean; reasons: string[] } {
  if (!profile) return { matched: false, reasons: [] };

  const reasons: string[] = [];

  for (const cat of offer.tags) {
    if (profile.preferredCategories.includes(cat)) {
      reasons.push(`Categoria: ${CATEGORY_LABEL_MAP.get(cat) ?? cat}`);
    }
  }

  if (profile.preferredSources.includes(offer.sourceId)) {
    reasons.push(`Portale: ${SOURCE_LABEL_MAP[offer.sourceId] ?? offer.sourceName}`);
  }

  if (profile.preferredOfferTypes.includes(offer.category)) {
    reasons.push(`Tipo: ${OFFER_TYPE_LABEL_MAP[offer.category]}`);
  }

  return {
    matched: reasons.length > 0,
    reasons,
  };
}

export type BrowserPushStatus = NotificationPermission | 'unsupported';

export function getBrowserNotificationPermission(): BrowserPushStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserPushStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function sendBrowserPushNotification(
  title: string,
  body: string,
  offerUrl?: string
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }

  const safeTarget = offerUrl && /^https?:\/\//i.test(offerUrl) ? offerUrl : undefined;
  const options: NotificationOptions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: title.slice(0, 64),
    data: { url: safeTarget },
  };

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    void navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, options))
      .catch(() => {
        try {
          new Notification(title, options);
        } catch {
          // Ignore notification construction failure
        }
      });
    return true;
  }

  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      if (safeTarget) {
        window.open(safeTarget, '_blank', 'noopener,noreferrer');
      }
      notification.close();
    };
    return true;
  } catch {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, options))
        .catch(() => {});
      return true;
    }
    return false;
  }
}
