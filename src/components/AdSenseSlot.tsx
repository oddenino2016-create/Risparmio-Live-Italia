import { useEffect, useRef } from 'react';
import type { AdSenseConfig } from '../types/offers';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

interface AdSenseSlotProps {
  config: AdSenseConfig | null;
  slotId: string;
  placementLabel: string;
  format?: 'auto' | 'fluid' | 'horizontal';
  className?: string;
}

const VALID_PUB_RE = /^ca-pub-\d{10,20}$/;

export function ensureAdSenseScript(publisherId: string): void {
  if (typeof document === 'undefined' || !VALID_PUB_RE.test(publisherId)) return;
  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-risparmio-adsense="true"]'
  );
  if (existing) {
    if (existing.dataset.client === publisherId) return;
    existing.remove();
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
    publisherId
  )}`;
  script.crossOrigin = 'anonymous';
  script.dataset.risparmioAdsense = 'true';
  script.dataset.client = publisherId;
  document.head.appendChild(script);
}

export function AdSenseSlot({
  config,
  slotId,
  placementLabel,
  format = 'auto',
  className = '',
}: AdSenseSlotProps) {
  const pushedRef = useRef<string>('');
  const hasValidPub = Boolean(config && VALID_PUB_RE.test(config.publisherId));
  const hasValidSlot = /^\d{6,16}$/.test(slotId.trim());
  const isLiveAd = Boolean(config?.enabled && hasValidPub && hasValidSlot);
  const isPreview = Boolean(config?.enabled && config?.showAdminPreview && !isLiveAd);

  useEffect(() => {
    if (!config?.enabled || !hasValidPub) return;
    ensureAdSenseScript(config.publisherId);
  }, [config?.enabled, config?.publisherId, hasValidPub]);

  useEffect(() => {
    if (!isLiveAd || !config) return;
    const key = `${config.publisherId}:${slotId}`;
    if (pushedRef.current === key) return;
    pushedRef.current = key;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ignore AdSense push errors before script hydration
    }
  }, [isLiveAd, config, slotId]);

  if (!isLiveAd && !isPreview) return null;

  if (isPreview) {
    return (
      <div
        className={`border border-dashed border-slate-300 bg-slate-100/70 rounded-xl p-5 text-center ${className}`}
      >
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          Spazio Google AdSense — {placementLabel}
        </p>
        <p className="text-xs text-slate-600 mt-1">
          {hasValidPub
            ? `Publisher configurato (${config?.publisherId}). Inserisci uno Slot ID numerico nel Pannello di Controllo.`
            : 'Inserisci il tuo Publisher ID (ca-pub-…) e Slot ID nel Pannello di Controllo per attivare gli annunci reali.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`border border-slate-200 bg-white rounded-xl p-3 overflow-hidden ${className}`}
      aria-label={`Pubblicità Google AdSense (${placementLabel})`}
    >
      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 text-center">
        Pubblicità
      </p>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: '90px' }}
        data-ad-client={config!.publisherId}
        data-ad-slot={slotId.trim()}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
