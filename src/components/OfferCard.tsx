import { useMemo, useState } from 'react';
import {
  Bookmark,
  Calculator,
  CalendarCheck,
  CalendarPlus,
  Check,
  ChevronUp,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEAL_CATEGORIES, type OfferCategory, type OfferItem } from '../types/offers';
import { deriveOfferSavingBaseline, formatEur } from '../utils/savingsEstimator';

interface OfferCardProps {
  offer: OfferItem;
  isSaved: boolean;
  saveCount?: number;
  onToggleSave: (offer: OfferItem) => void;
}

const OFFER_TYPE_LABELS: Record<OfferCategory, string> = {
  'codice-sconto': 'Codice Sconto',
  cashback: 'Cashback',
  'prova-gratis': 'Prova Gratis',
};

const CATEGORY_MAP = new Map(DEAL_CATEGORIES.map((c) => [c.id, c.label]));

const FREQUENCY_PRESETS: Array<{ label: string; usesPerYear: number }> = [
  { label: '4x/anno', usesPerYear: 4 },
  { label: '1x/mese', usesPerYear: 12 },
  { label: '2x/mese', usesPerYear: 24 },
  { label: '1x/sett.', usesPerYear: 52 },
];

export function OfferCard({ offer, isSaved, saveCount = 0, onToggleSave }: OfferCardProps) {
  const { openCalendarSync, syncedCalendarEvents } = useAuth();
  const [imgFailed, setImgFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const baseline = useMemo(() => deriveOfferSavingBaseline(offer), [offer]);
  const hasValidExpiry = Boolean(
    offer.expiresAt && !Number.isNaN(Date.parse(offer.expiresAt))
  );
  const isCalendarSynced = Boolean(syncedCalendarEvents[offer.id]);

  const [calcOpen, setCalcOpen] = useState(false);
  const [usesPerYear, setUsesPerYear] = useState<number>(baseline.defaultAnnualUses);
  const [avgSpendEur, setAvgSpendEur] = useState<number>(baseline.defaultAvgSpendEur);
  const [percentRate, setPercentRate] = useState<number>(baseline.percentRate);
  const [fixedSavingEur, setFixedSavingEur] = useState<number>(baseline.fixedAmountEur);

  const perUseSaving = useMemo(() => {
    if (baseline.mode === 'percent') {
      return Math.max(0, avgSpendEur) * (Math.max(0, percentRate) / 100);
    }
    return Math.max(0, fixedSavingEur);
  }, [baseline.mode, avgSpendEur, percentRate, fixedSavingEur]);

  const annualSaving = perUseSaving * Math.max(1, usesPerYear);
  const monthlySaving = annualSaving / 12;

  const safeHref = /^https?:\/\//i.test(offer.offerUrl) ? offer.offerUrl : '#';
  const tagLabels = offer.tags.map((t) => CATEGORY_MAP.get(t) ?? t).slice(0, 2);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const initials = offer.merchant
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <article className="bg-white border border-slate-200 rounded-xl flex flex-col justify-between overflow-hidden hover:border-slate-300 transition-colors">
      <div>
        {/* Visual Header Slot with Zero-Broken-Image Policy */}
        <div className="h-28 bg-slate-50 border-b border-slate-100 flex items-center justify-center px-6 overflow-hidden">
          {offer.imageUrl && !imgFailed ? (
            <img
              src={offer.imageUrl}
              alt={offer.merchant}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="max-h-20 w-auto max-w-full object-contain rounded"
            />
          ) : (
            <div className="flex items-center gap-3 text-slate-400">
              <div className="w-11 h-11 rounded-lg bg-slate-200/80 text-slate-700 font-bold text-sm flex items-center justify-center font-display">
                {initials || 'RL'}
              </div>
              <span className="text-sm font-medium text-slate-600 truncate max-w-[160px]">
                {offer.merchant}
              </span>
            </div>
          )}
        </div>

        <div className="p-5">
          {/* Zero-Pill Metadata Kicker with typographic separators */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 mb-2">
            {offer.isNew && (
              <>
                <span className="font-semibold text-emerald-700">Nuova</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="font-medium text-slate-700">{offer.sourceName}</span>
            <span aria-hidden="true">·</span>
            <span>{OFFER_TYPE_LABELS[offer.category]}</span>
            {tagLabels.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">·</span>
                <span>{tag}</span>
              </span>
            ))}
            {offer.expiresAt && (
              <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium tabular-nums">
                <span aria-hidden="true">·</span>
                <span>
                  Scade il{' '}
                  {new Date(offer.expiresAt).toLocaleDateString('it-IT', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </span>
              </span>
            )}
            {saveCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium tabular-nums">
                <span aria-hidden="true">·</span>
                <span>
                  {saveCount} {saveCount === 1 ? 'salvataggio' : 'salvataggi'}
                </span>
              </span>
            )}
          </div>

          {/* Merchant + Title */}
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 truncate">
            {offer.merchant}
          </p>
          <h3 className="text-base font-semibold text-slate-900 leading-snug line-clamp-2 mb-2">
            {offer.title}
          </h3>

          <p className="text-sm text-slate-600 leading-relaxed line-clamp-2 mb-4">
            {offer.description}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-3">
        {/* Value & Optional Coupon Code Row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-emerald-700 font-mono tabular-nums truncate">
            {offer.rewardLabel}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            {offer.couponCode ? (
              <button
                type="button"
                onClick={() => void handleCopyCode(offer.couponCode!)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                title="Copia codice sconto"
              >
                <span>{offer.couponCode}</span>
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                )}
              </button>
            ) : offer.couponHint ? (
              <span className="text-xs font-mono text-slate-600 shrink-0">
                Codice: {offer.couponHint}
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => setCalcOpen((prev) => !prev)}
              aria-expanded={calcOpen}
              aria-label={`Stima risparmio annuo per ${offer.merchant}`}
              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors cursor-pointer shrink-0 ${
                calcOpen
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {calcOpen ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Calculator className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              )}
              <span>Stima annua</span>
            </button>
          </div>
        </div>

        {/* Interactive Annual Savings Mini-Calculator */}
        {calcOpen && (
          <div
            className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3"
            aria-label="Calcolatore risparmio annuo"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900">
                Simulatore Risparmio Annuo
              </span>
              <span className="text-[11px] font-medium text-emerald-700 truncate">
                {baseline.ruleLabel}
              </span>
            </div>

            {/* Frequency Presets & Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor={`uses-${offer.id}`}
                  className="text-slate-600 font-medium"
                >
                  Utilizzi all&apos;anno
                </label>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {usesPerYear} {usesPerYear === 1 ? 'volta' : 'volte'}/anno
                </span>
              </div>

              <input
                id={`uses-${offer.id}`}
                type="range"
                min={1}
                max={52}
                step={1}
                value={usesPerYear}
                onChange={(e) => setUsesPerYear(Number(e.target.value))}
                className="w-full accent-emerald-700 cursor-pointer h-1.5"
              />

              <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                {FREQUENCY_PRESETS.map((preset) => {
                  const active = usesPerYear === preset.usesPerYear;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setUsesPerYear(preset.usesPerYear)}
                      className={`py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer tabular-nums ${
                        active
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Spend / Value Inputs */}
            {baseline.mode === 'percent' ? (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor={`spend-${offer.id}`}
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Spesa media (€)
                  </label>
                  <input
                    id={`spend-${offer.id}`}
                    type="number"
                    min={1}
                    max={10000}
                    step={5}
                    value={avgSpendEur}
                    onChange={(e) =>
                      setAvgSpendEur(Math.max(0, Number.parseFloat(e.target.value) || 0))
                    }
                    className="w-full h-8 px-2.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`rate-${offer.id}`}
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Aliquota (%)
                  </label>
                  <input
                    id={`rate-${offer.id}`}
                    type="number"
                    min={0.5}
                    max={90}
                    step={0.5}
                    value={percentRate}
                    onChange={(e) =>
                      setPercentRate(
                        Math.min(90, Math.max(0, Number.parseFloat(e.target.value) || 0))
                      )
                    }
                    className="w-full h-8 px-2.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label
                  htmlFor={`fixed-${offer.id}`}
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Risparmio per singolo utilizzo (€)
                </label>
                <input
                  id={`fixed-${offer.id}`}
                  type="number"
                  min={0.5}
                  max={1000}
                  step={0.5}
                  value={fixedSavingEur}
                  onChange={(e) =>
                    setFixedSavingEur(Math.max(0, Number.parseFloat(e.target.value) || 0))
                  }
                  className="w-full h-8 px-2.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
            )}

            {/* Estimated Annual Result */}
            <div className="pt-2.5 border-t border-slate-200 flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium text-slate-500">
                  Risparmio annuo stimato
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {formatEur(monthlySaving)}/mese · {formatEur(perUseSaving)}/utilizzo
                </p>
              </div>
              <span className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                {formatEur(annualSaving)}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-10 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <span>Vai all&apos;offerta</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>

          <button
            type="button"
            onClick={() => onToggleSave(offer)}
            aria-label={isSaved ? 'Rimuovi dai salvati' : 'Salva offerta'}
            className={`h-10 px-3.5 inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              isSaved
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Bookmark
              className={`w-4 h-4 ${isSaved ? 'fill-emerald-700 text-emerald-700' : ''}`}
              aria-hidden="true"
            />
            <span>{isSaved ? 'Salvata' : 'Salva'}</span>
          </button>
        </div>

        {hasValidExpiry && (
          <button
            type="button"
            onClick={() =>
              openCalendarSync({
                id: offer.id,
                merchant: offer.merchant,
                title: offer.title,
                rewardLabel: offer.rewardLabel,
                sourceName: offer.sourceName,
                offerUrl: offer.offerUrl,
                expiresAt: offer.expiresAt!,
                couponCode: offer.couponCode,
              })
            }
            className={`w-full h-9 px-3 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              isCalendarSynced
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {isCalendarSynced ? (
              <>
                <CalendarCheck className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                <span>Aggiunto a Google Calendar</span>
              </>
            ) : (
              <>
                <CalendarPlus className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                <span>Aggiungi a Google Calendar</span>
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}
