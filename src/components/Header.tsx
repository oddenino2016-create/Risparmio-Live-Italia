import { Lock } from 'lucide-react';
import type { OfferCategory } from '../types/offers';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  activeType: 'all' | OfferCategory;
  onSelectType: (type: 'all' | OfferCategory) => void;
  onOpenProfile: () => void;
  onOpenControlPanel: () => void;
}

export function Header({
  activeType,
  onSelectType,
  onOpenProfile,
  onOpenControlPanel,
}: HeaderProps) {
  const { savedDeals } = useAuth();

  const handleNavClick = (type: 'all' | OfferCategory) => {
    onSelectType(type);
    const el = document.getElementById('offerte');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const navItems: Array<{ id: 'all' | OfferCategory; label: string }> = [
    { id: 'all', label: 'Tutte' },
    { id: 'codice-sconto', label: 'Codici Sconto' },
    { id: 'cashback', label: 'Cashback' },
    { id: 'prova-gratis', label: 'Prova Gratis' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
        >
          Risparmio Live
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Navigazione principale"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          {navItems.map((item) => {
            const isActive = activeType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  isActive
                    ? 'text-slate-900 border-emerald-600 font-semibold'
                    : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <a
            href="#fonti"
            className="py-1 whitespace-nowrap shrink-0 border-b-2 border-transparent hover:text-slate-900 hover:border-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            Fonti
          </a>
        </nav>

        {/* Zone 3: Top Control Panel + Install PWA button + Auth button */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={onOpenControlPanel}
            title="Apri Pannello di Controllo"
            aria-label="Apri Pannello di Controllo"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <Lock className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span className="hidden sm:inline">Controllo</span>
          </button>
          <button
            type="button"
            onClick={onOpenProfile}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            Profilo ({savedDeals.length})
          </button>
        </div>
      </div>
    </header>
  );
}
