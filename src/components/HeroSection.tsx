import { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { CatalogSnapshot } from '../types/offers';

interface HeroSectionProps {
  snapshot: CatalogSnapshot | null;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onSyncNow: () => void;
  isSyncing: boolean;
  sseConnected: boolean;
  onOpenOnboarding: () => void;
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '--:--:--';
  try {
    return new Date(iso).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--:--';
  }
}

export function HeroSection({
  snapshot,
  searchQuery,
  onSearchChange,
  onSyncNow,
  isSyncing,
  sseConnected,
  onOpenOnboarding,
}: HeroSectionProps) {
  const [imgError, setImgError] = useState(false);

  const totalOffers = snapshot?.offers.length ?? 0;
  const couponCount =
    snapshot?.offers.filter((o) => o.category === 'codice-sconto').length ?? 0;
  const cashbackCount =
    snapshot?.offers.filter((o) => o.category === 'cashback').length ?? 0;
  const freeTrialCount =
    snapshot?.offers.filter((o) => o.category === 'prova-gratis').length ?? 0;

  return (
    <section id="top" className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        {/* 2-Column Split Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 mb-3">
                App creata da <span className="text-slate-900 font-semibold">Andrea Oddenino</span>
                <span aria-hidden="true"> · </span>
                Aggregatore automatico da 11 portali italiani
              </p>

              <h1
                className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-slate-900 leading-[1.12] mb-4 max-w-2xl"
                style={{ textWrap: 'balance' }}
              >
                Codici sconto, cashback e prove gratis sempre aggiornati.
              </h1>

              <p className="text-base text-slate-600 leading-relaxed max-w-2xl mb-7">
                Raccoglie e categorizza in automatico le offerte pubblicate su Bestshopping, Widilo,
                LetyShops, CodiceRisparmio, CashbackDeals, SimplyBestCoupons, P&amp;G Per Te,
                DimmiCosaCerchi, ScontrinoFelice, ScontOmaggio e BuyOn in tempo reale.
              </p>
            </div>

            <div className="space-y-3">
              {/* Search + Manual Sync Toolbar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Cerca negozio, codice sconto, categoria o prodotto..."
                    aria-label="Cerca tra le offerte"
                    className="w-full h-11 pl-10 pr-4 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 transition-colors"
                  />
                </div>

                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={isSyncing}
                  className="h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{isSyncing ? 'Verifica in corso…' : 'Aggiorna Ora'}</span>
                </button>
              </div>

              {/* Clean unboxed sync status text */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 tabular-nums">
                <span>
                  {sseConnected
                    ? 'Monitoraggio automatico attivo'
                    : 'Connessione al feed in corso'}
                </span>
                <span aria-hidden="true">·</span>
                <span>Ultimo controllo: {formatTime(snapshot?.lastCheckedAt)}</span>
                <span aria-hidden="true">·</span>
                <span>Revisione #{snapshot?.revision ?? 0}</span>
                <span aria-hidden="true">·</span>
                <a
                  href="#ricerca-ia"
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  Cerca con IA
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href="#statistiche"
                  className="font-semibold text-slate-700 hover:text-slate-900 hover:underline"
                >
                  Analisi 30gg
                </a>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="font-semibold text-slate-700 hover:text-slate-900 hover:underline cursor-pointer"
                >
                  Guida rapida
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Hero Asset */}
          <div className="lg:col-span-5 min-h-[220px] lg:min-h-[300px]">
            {!imgError ? (
              <img
                src="/src/assets/images/hero_savings_editorial_1795408044803.jpg"
                alt="Pianificazione del risparmio con codici sconto, cashback e scontrini"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full lg:h-full object-cover rounded-xl border border-slate-200"
              />
            ) : (
              <div className="w-full h-full rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center p-8 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Risparmio Live Italia</p>
                  <p className="text-xs text-slate-500 mt-1">App creata da Andrea Oddenino</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Full-Width 4-Column KPI Strip Below Hero Split */}
        <div className="mt-10 pt-8 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-medium text-slate-500">Offerte Attive Totali</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {totalOffers}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Codici Sconto</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {couponCount}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Negozi con Cashback</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">
              {cashbackCount}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Prova Gratis &amp; Omaggio</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {freeTrialCount}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
