import { useState } from 'react';
import { Bell, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import type { PreferenceNotification } from '../utils/notifications';

interface NotificationBannerProps {
  notifications: PreferenceNotification[];
  onDismissOne: (id: string) => void;
  onDismissAll: () => void;
  onMarkAllRead: () => void;
  onOpenPreferences: () => void;
}

export function NotificationBanner({
  notifications,
  onDismissOne,
  onDismissAll,
  onMarkAllRead,
  onOpenPreferences,
}: NotificationBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (notifications.length === 0) return null;

  const latest = notifications[0];
  const unreadCount = notifications.filter((n) => !n.read).length;
  const safeHref = /^https?:\/\//i.test(latest.offer.offerUrl) ? latest.offer.offerUrl : '#';

  return (
    <section
      aria-label="Notifiche nuove offerte per le tue preferenze"
      className="bg-emerald-950 text-white border-b border-emerald-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Compact Primary Alert Row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start md:items-center gap-3 min-w-0">
            <Bell className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5 md:mt-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-emerald-200">
                <span className="font-semibold text-white">
                  {unreadCount > 0 ? `${unreadCount} nuove offerte per te` : 'Avviso preferenze'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{latest.reasons.join(' · ')}</span>
              </div>
              <p className="text-sm font-medium text-white truncate mt-0.5">
                {latest.offer.merchant} — {latest.offer.title}{' '}
                <span className="font-mono text-emerald-300 ml-1">{latest.offer.rewardLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onMarkAllRead}
              className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-900 rounded-lg hover:bg-emerald-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Apri offerta</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>

            {notifications.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setExpanded((v) => !v);
                  onMarkAllRead();
                }}
                className="px-3 py-1.5 text-xs font-medium text-emerald-100 border border-emerald-700 rounded-lg hover:bg-emerald-900 transition-colors inline-flex items-center gap-1 whitespace-nowrap cursor-pointer tabular-nums"
              >
                <span>Tutte ({notifications.length})</span>
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenPreferences}
              className="px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              Preferenze
            </button>

            <button
              type="button"
              onClick={onDismissAll}
              aria-label="Chiudi tutte le notifiche"
              className="p-1.5 text-emerald-300 hover:text-white rounded-lg hover:bg-emerald-900 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Expanded List of Matched Offers */}
        {expanded && notifications.length > 1 && (
          <ul className="mt-3 pt-3 border-t border-emerald-800/80 divide-y divide-emerald-900/80 max-h-60 overflow-y-auto">
            {notifications.map((item) => {
              const itemHref = /^https?:\/\//i.test(item.offer.offerUrl)
                ? item.offer.offerUrl
                : '#';
              return (
                <li
                  key={item.id}
                  className="py-2 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">
                      {item.offer.merchant} — {item.offer.title}
                    </p>
                    <p className="text-emerald-300 mt-0.5 truncate">
                      {item.offer.rewardLabel} · {item.reasons.join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={itemHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white underline hover:text-emerald-200 whitespace-nowrap"
                    >
                      Apri
                    </a>
                    <button
                      type="button"
                      onClick={() => onDismissOne(item.id)}
                      aria-label="Rimuovi notifica"
                      className="text-emerald-400 hover:text-white p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
