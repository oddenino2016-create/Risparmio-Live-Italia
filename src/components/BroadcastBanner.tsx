import { useState } from 'react';
import { BellRing, ExternalLink, Megaphone, X } from 'lucide-react';
import type { BroadcastMessage } from '../types/offers';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  type BrowserPushStatus,
} from '../utils/notifications';

interface BroadcastBannerProps {
  broadcasts: BroadcastMessage[];
  onDismiss: (id: string) => void;
}

export function BroadcastBanner({ broadcasts, onDismiss }: BroadcastBannerProps) {
  const [pushStatus, setPushStatus] = useState<BrowserPushStatus>(() =>
    getBrowserNotificationPermission()
  );

  if (broadcasts.length === 0) return null;

  const latest = broadcasts[0];
  const safeHref =
    latest.linkUrl && /^https?:\/\//i.test(latest.linkUrl) ? latest.linkUrl : undefined;

  return (
    <section
      aria-label="Comunicazione globale dell'amministratore"
      className="bg-amber-950 text-white border-b border-amber-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start md:items-center gap-3 min-w-0">
          <Megaphone
            className="w-4 h-4 text-amber-300 shrink-0 mt-0.5 md:mt-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-amber-200">
              <span className="font-bold text-white">{latest.title}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {new Date(latest.createdAt).toLocaleString('it-IT', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {broadcasts.length > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">+{broadcasts.length - 1} altri avvisi</span>
                </>
              )}
            </div>
            <p className="text-sm text-amber-50 mt-0.5 break-words">{latest.body}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {pushStatus === 'default' && (
            <button
              type="button"
              onClick={() => {
                void requestBrowserNotificationPermission().then((next) => setPushStatus(next));
              }}
              className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-300 rounded-lg hover:bg-amber-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Attiva Push</span>
            </button>
          )}

          {safeHref && (
            <a
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-900 rounded-lg hover:bg-amber-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Apri link</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}

          <button
            type="button"
            onClick={() => onDismiss(latest.id)}
            aria-label="Chiudi avviso"
            className="p-1.5 text-amber-300 hover:text-white rounded-lg hover:bg-amber-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
