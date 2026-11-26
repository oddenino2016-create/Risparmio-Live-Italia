import { CheckCircle2, Clock, AlertTriangle, RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import type { ChangeLogEntry, SourceId, SourceStatus } from '../types/offers';

interface SourcesMonitorProps {
  sources: SourceStatus[];
  recentChanges: ChangeLogEntry[];
  syncingSourceId: SourceId | 'all' | null;
  onSyncSource: (sourceId: SourceId) => void;
  onOpenControlPanel: () => void;
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--';
  }
}

export function SourcesMonitor({
  sources,
  recentChanges,
  syncingSourceId,
  onSyncSource,
  onOpenControlPanel,
}: SourcesMonitorProps) {
  return (
    <section id="fonti" className="bg-white border-t border-slate-200 py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Fonti Monitorate e Rilevamento Aggiornamenti
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Il sistema verifica periodicamente l&apos;impronta dei contenuti di ciascun portale e
              aggiorna automaticamente l&apos;app non appena compaiono nuovi codici sconto, cashback o
              prove gratis.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenControlPanel}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200/70 transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <span>Pannello di Controllo &amp; AdSense</span>
          </button>
        </div>

        {/* Sources Status Table */}
        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Portale</th>
                <th className="py-3 px-4">Stato</th>
                <th className="py-3 px-4 text-right">Offerte</th>
                <th className="py-3 px-4">Ultimo Controllo</th>
                <th className="py-3 px-4">Impronta Contenuto</th>
                <th className="py-3 px-4">Dettagli</th>
                <th className="py-3 px-4 text-right">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {sources.map((src) => {
                const isChecking = syncingSourceId === src.id || syncingSourceId === 'all';
                return (
                  <tr key={src.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{src.name}</div>
                      <a
                        href={src.requestedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-700"
                      >
                        <span>{src.displayUrl}</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {src.status === 'live' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          <span>Live</span>
                        </span>
                      ) : src.status === 'snapshot' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                          <Clock className="w-4 h-4" aria-hidden="true" />
                          <span>Snapshot</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
                          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                          <span>Errore</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {src.itemCount}
                    </td>

                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      {formatDateTime(src.lastCheckedAt)}
                    </td>

                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                      {src.contentHash.slice(0, 10)}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {src.note ?? 'Sincronizzato'}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSyncSource(src.id)}
                        disabled={isChecking}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>Verifica</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Recent Detected Changes */}
        {recentChanges.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Cronologia Sincronizzazioni e Variazioni Rilevate
            </h3>
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50">
              {recentChanges.slice(0, 6).map((entry) => (
                <li
                  key={entry.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs"
                >
                  <div className="text-slate-700">
                    <span className="font-semibold text-slate-900">{entry.sourceName}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{entry.summary}</span>
                  </div>
                  <span className="font-mono tabular-nums text-slate-500 shrink-0">
                    {formatDateTime(entry.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
