export type OfferCategory = 'codice-sconto' | 'cashback' | 'prova-gratis';
export type OfferSortOption = 'recent' | 'expiring' | 'popularity';

export type DealCategory =
  | 'electronics'
  | 'fashion'
  | 'home-goods'
  | 'travel'
  | 'groceries'
  | 'entertainment'
  | 'beauty-health';

export interface DealCategoryMeta {
  id: DealCategory;
  label: string;
  labelIt: string;
}

export const DEAL_CATEGORIES: DealCategoryMeta[] = [
  { id: 'electronics', label: 'Elettronica', labelIt: 'Elettronica' },
  { id: 'fashion', label: 'Moda', labelIt: 'Moda' },
  { id: 'home-goods', label: 'Casa & Arredo', labelIt: 'Casa & Arredo' },
  { id: 'travel', label: 'Viaggi', labelIt: 'Viaggi' },
  { id: 'groceries', label: 'Spesa & Alimentari', labelIt: 'Spesa & Alimentari' },
  { id: 'entertainment', label: 'Intrattenimento', labelIt: 'Intrattenimento' },
  { id: 'beauty-health', label: 'Salute & Bellezza', labelIt: 'Salute & Bellezza' },
];

export const VALID_DEAL_CATEGORY_IDS: DealCategory[] = DEAL_CATEGORIES.map((c) => c.id);

export type SourceId =
  | 'buyon'
  | 'scontiomaggio'
  | 'letyshops'
  | 'bestshopping'
  | 'scontrinofelice'
  | 'widilo'
  | 'pgperte'
  | 'dimmicosacerchi'
  | 'codicerisparmio'
  | 'cashbackdeals'
  | 'simplybestcoupons';

export interface BroadcastMessage {
  id: string;
  title: string;
  body: string;
  linkUrl?: string;
  createdAt: string;
}

export interface OfferItem {
  id: string;
  title: string;
  merchant: string;
  description: string;
  category: OfferCategory;
  tags: DealCategory[];
  sourceId: SourceId;
  sourceName: string;
  sourceUrl: string;
  offerUrl: string;
  rewardLabel: string;
  couponCode?: string;
  couponHint?: string;
  imageUrl?: string;
  publishedAt?: string;
  updatedAt: string;
  firstSeenAt?: string;
  expiresAt?: string;
  isNew?: boolean;
}

export interface SourceStatus {
  id: SourceId;
  name: string;
  displayUrl: string;
  requestedUrl: string;
  status: 'live' | 'snapshot' | 'error';
  itemCount: number;
  lastCheckedAt: string;
  lastChangedAt: string;
  contentHash: string;
  etag?: string;
  lastModified?: string;
  note?: string;
}

export interface ChangeLogEntry {
  id: string;
  sourceId: SourceId;
  sourceName: string;
  timestamp: string;
  addedCount: number;
  removedCount: number;
  summary: string;
}

export interface CatalogSnapshot {
  revision: number;
  updatedAt: string;
  lastCheckedAt: string;
  lastSyncDurationMs: number;
  autoIntervalSec: number;
  sources: SourceStatus[];
  offers: OfferItem[];
  recentChanges: ChangeLogEntry[];
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  preferredCategories: DealCategory[];
  preferredOfferTypes: OfferCategory[];
  preferredSources: SourceId[];
  notifyOnNewDeals: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SavedDeal {
  id: string;
  userId: string;
  title: string;
  merchant: string;
  description: string;
  category: OfferCategory;
  tags: DealCategory[];
  sourceId: SourceId;
  sourceName: string;
  offerUrl: string;
  rewardLabel: string;
  couponCode?: string;
  couponHint?: string;
  imageUrl?: string;
  note?: string;
  expiresAt?: string;
  reminderEnabled?: boolean;
  reminderNotifiedAt?: string;
  savedAt?: unknown;
}

export interface RemovedDeal {
  id: string;
  userId: string;
  title: string;
  merchant: string;
  description: string;
  category: OfferCategory;
  tags: DealCategory[];
  sourceId: SourceId;
  sourceName: string;
  offerUrl: string;
  rewardLabel: string;
  couponCode?: string;
  couponHint?: string;
  imageUrl?: string;
  note?: string;
  expiresAt?: string;
  removedAt?: unknown;
}

export interface AdSenseConfig {
  enabled: boolean;
  publisherId: string;
  autoAds: boolean;
  headerSlotId: string;
  inFeedSlotId: string;
  footerSlotId: string;
  inFeedInterval: number;
  showAdminPreview: boolean;
  updatedAt: string;
}

export interface PortalVolumeSeriesDay {
  date: string;
  label: string;
  total: number;
  recorded: boolean;
  counts: Record<SourceId, number>;
}

export interface PortalVolumeSummary {
  sourceId: SourceId;
  sourceName: string;
  currentCount: number;
  avg30d: number;
  max30d: number;
  codiceScontoCount: number;
  cashbackCount: number;
  provaGratisCount: number;
}

export interface PortalVolumeAnalytics {
  generatedAt: string;
  daysWindow: number;
  recordedDaysCount: number;
  days: PortalVolumeSeriesDay[];
  portals: PortalVolumeSummary[];
}

export interface AiWebSuggestion {
  merchant: string;
  title: string;
  rewardLabel: string;
  category: OfferCategory;
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

