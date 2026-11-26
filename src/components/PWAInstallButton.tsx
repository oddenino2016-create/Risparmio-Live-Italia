import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Nascondi completamente il pulsante se l'app è già installata
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setShowGuide(false);
      }
      return;
    }
    setShowGuide(true);
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        title="Installa l'app su Android"
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="sm:hidden">Installa</span>
        <span className="hidden sm:inline">
          {isIOS ? 'Installa App' : 'Installa su Android'}
        </span>
      </button>

      {showGuide &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
            aria-label="Installa Risparmio Live Italia"
          >
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
                  <h2 className="text-sm font-bold text-slate-900">
                    {isIOS ? 'Installa su iPhone / iPad' : 'Installa l’app su Android'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Chiudi finestra installazione"
                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-sm text-slate-700">
                {isIOS ? (
                  <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm leading-relaxed">
                    <li>
                      Apri questa pagina in <strong>Safari</strong>.
                    </li>
                    <li>
                      Tocca il pulsante <strong>Condividi</strong> nella barra in basso.
                    </li>
                    <li>
                      Scorri e seleziona <strong>Aggiungi alla schermata Home</strong>.
                    </li>
                  </ol>
                ) : (
                  <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm leading-relaxed">
                    <li>
                      Apri il sito in <strong>Google Chrome su Android</strong> (non dentro
                      un&apos;anteprima incorporata).
                    </li>
                    <li>
                      Tocca il menu <strong>⋮</strong> in alto a destra e seleziona{' '}
                      <strong>Installa app</strong> oppure{' '}
                      <strong>Aggiungi a schermata Home</strong>.
                    </li>
                    <li>
                      Conferma su <strong>Installa</strong>: l&apos;icona apparirà tra le tue app e
                      questo pulsante scomparirà automaticamente.
                    </li>
                  </ol>
                )}

                {shareUrl && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-slate-600 truncate">{shareUrl}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(shareUrl);
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedUrl ? (
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{copiedUrl ? 'Copiato' : 'Copia link'}</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Ho capito
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
