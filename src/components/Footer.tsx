import { Lock } from 'lucide-react';

interface FooterProps {
  onOpenControlPanel: () => void;
  onOpenOnboarding: () => void;
}

export function Footer({ onOpenControlPanel, onOpenOnboarding }: FooterProps) {
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <p className="text-base font-bold text-white">Risparmio Live Italia</p>
          <p className="text-sm text-slate-300 mt-1">
            App creata da <span className="font-semibold text-white">Andrea Oddenino</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Aggregatore automatico in tempo reale di codici sconto, cashback e prove gratis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
          <a
            href="https://www.buyon.it"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            buyon.it
          </a>
          <a
            href="https://www.scontomaggio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            scontiomaggio.com
          </a>
          <a
            href="https://letyshops.com/it"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            letyshops.com/it
          </a>
          <a
            href="https://it.bestshopping.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            it.bestshopping.com
          </a>
          <a
            href="https://www.scontrinofelice.it/spendi-e-riprendi/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            scontrinofelice.it
          </a>
          <a
            href="https://www.widilo.it"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            widilo.it
          </a>
          <a
            href="https://www.pgperte.it"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            pgperte.it
          </a>
          <a
            href="https://www.dimmicosacerchi.it"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            dimmicosacerchi.it
          </a>
          <a
            href="https://www.codicerisparmio.it"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            codicerisparmio.it
          </a>
          <a
            href="https://www.cashbackdeals.it"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            cashbackdeals.it
          </a>
          <a
            href="https://it.simplybestcoupons.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            it.simplybestcoupons.com
          </a>
          <button
            type="button"
            onClick={onOpenOnboarding}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
          >
            Guida rapida
          </button>
          <button
            type="button"
            onClick={onOpenControlPanel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>Pannello di Controllo</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
