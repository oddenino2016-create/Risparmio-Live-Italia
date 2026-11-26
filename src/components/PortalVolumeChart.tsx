import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { BarChart3 } from 'lucide-react';
import type {
  PortalVolumeAnalytics,
  PortalVolumeSeriesDay,
  SourceId,
} from '../types/offers';

interface PortalVolumeChartProps {
  analytics: PortalVolumeAnalytics | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelectSourceFilter: (sourceId: SourceId) => void;
}

const PORTAL_COLORS: Record<SourceId, string> = {
  bestshopping: '#047857', // emerald-700
  widilo: '#0284c7', // sky-600
  letyshops: '#d97706', // amber-600
  codicerisparmio: '#dc2626', // red-600
  cashbackdeals: '#4f46e5', // indigo-600
  simplybestcoupons: '#0d9488', // teal-600
  pgperte: '#2563eb', // blue-600
  dimmicosacerchi: '#9333ea', // purple-600
  scontrinofelice: '#65a30d', // lime-600
  scontiomaggio: '#ea580c', // orange-600
  buyon: '#475569', // slate-600
};

const PORTAL_LABELS: Record<SourceId, string> = {
  bestshopping: 'Bestshopping',
  widilo: 'Widilo',
  letyshops: 'LetyShops',
  codicerisparmio: 'CodiceRisparmio',
  cashbackdeals: 'CashbackDeals',
  simplybestcoupons: 'SimplyBestCoupons',
  pgperte: 'P&G Per Te',
  dimmicosacerchi: 'DimmiCosaCerchi',
  scontrinofelice: 'ScontrinoFelice',
  scontiomaggio: 'ScontOmaggio',
  buyon: 'BuyOn',
};

const CATEGORY_COLORS = {
  codiceScontoCount: '#0f172a',
  cashbackCount: '#047857',
  provaGratisCount: '#d97706',
};

export function PortalVolumeChart({
  analytics,
  loading,
  error,
  onRetry,
  onSelectSourceFilter,
}: PortalVolumeChartProps) {
  const [viewMode, setViewMode] = useState<'timeline30d' | 'byPortal'>('timeline30d');
  const [focusedSource, setFocusedSource] = useState<SourceId | 'all'>('all');
  const [hoveredDay, setHoveredDay] = useState<PortalVolumeSeriesDay | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = Math.max(320, Math.floor(el.clientWidth));
      setContainerWidth(next);
    };
    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const portalOrder = useMemo(() => {
    if (!analytics) return [] as SourceId[];
    return [...analytics.portals]
      .sort((a, b) => b.currentCount - a.currentCount)
      .map((p) => p.sourceId);
  }, [analytics]);

  const totalCurrentOffers = useMemo(() => {
    if (!analytics) return 0;
    return analytics.portals.reduce((acc, p) => acc + p.currentCount, 0);
  }, [analytics]);

  const avgPerPortal = useMemo(() => {
    if (!analytics || analytics.portals.length === 0) return 0;
    return Math.round((totalCurrentOffers / analytics.portals.length) * 10) / 10;
  }, [analytics, totalCurrentOffers]);

  // Render D3.js SVG chart
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !analytics || analytics.days.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (viewMode === 'timeline30d') {
      const height = 310;
      const margin = { top: 18, right: 16, bottom: 38, left: 46 };
      const innerWidth = Math.max(200, containerWidth - margin.left - margin.right);
      const innerHeight = height - margin.top - margin.bottom;

      svg.attr('viewBox', `0 0 ${containerWidth} ${height}`).attr('height', height);

      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

      const activeKeys: SourceId[] =
        focusedSource === 'all' ? portalOrder : [focusedSource];

      const stackData = analytics.days.map((d) => {
        const row: Record<string, number | string> = {
          date: d.date,
          label: d.label,
        };
        for (const key of activeKeys) {
          row[key] = d.counts[key] ?? 0;
        }
        return row;
      });

      const stackGen = d3.stack<Record<string, number | string>>().keys(activeKeys);
      const series = stackGen(stackData);

      const xScale = d3
        .scaleBand<string>()
        .domain(analytics.days.map((d) => d.date))
        .range([0, innerWidth])
        .padding(0.24);

      const maxVal =
        d3.max(series, (layer) => d3.max(layer, (d) => d[1])) ?? 10;
      const yScale = d3
        .scaleLinear()
        .domain([0, Math.max(10, Math.ceil(maxVal * 1.12))])
        .nice()
        .range([innerHeight, 0]);

      // Horizontal hairline gridlines
      g.append('g')
        .attr('class', 'grid-lines')
        .call(
          d3
            .axisLeft(yScale)
            .ticks(5)
            .tickSize(-innerWidth)
            .tickFormat(() => '')
        )
        .call((axisG) => {
          axisG.select('.domain').remove();
          axisG
            .selectAll('line')
            .attr('stroke', '#e2e8f0')
            .attr('stroke-dasharray', '2,2');
        });

      // Y Axis
      g.append('g')
        .call(d3.axisLeft(yScale).ticks(5).tickSize(0).tickPadding(8))
        .call((axisG) => {
          axisG.select('.domain').attr('stroke', '#cbd5e1');
          axisG
            .selectAll('text')
            .attr('fill', '#64748b')
            .attr('font-size', '11px')
            .attr('font-family', 'JetBrains Mono, monospace');
        });

      // X Axis (tick every 4-5 days so labels never collide)
      const step = containerWidth < 640 ? 6 : 4;
      const tickDates = analytics.days
        .filter((_, idx) => idx % step === 0 || idx === analytics.days.length - 1)
        .map((d) => d.date);
      const labelByDate = new Map(analytics.days.map((d) => [d.date, d.label]));

      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .tickValues(tickDates)
            .tickFormat((d) => labelByDate.get(d) ?? d)
            .tickSize(4)
        )
        .call((axisG) => {
          axisG.select('.domain').attr('stroke', '#cbd5e1');
          axisG.selectAll('line').attr('stroke', '#cbd5e1');
          axisG
            .selectAll('text')
            .attr('fill', '#64748b')
            .attr('font-size', '11px')
            .attr('font-family', 'JetBrains Mono, monospace');
        });

      // Subtle baseline markers for unrecorded days before initial deployment
      g.selectAll('.unrecorded-slot')
        .data(analytics.days.filter((d) => !d.recorded))
        .enter()
        .append('rect')
        .attr('x', (d) => xScale(d.date) ?? 0)
        .attr('y', innerHeight - 3)
        .attr('width', xScale.bandwidth())
        .attr('height', 3)
        .attr('rx', 1)
        .attr('fill', '#e2e8f0');

      // Stacked bars per portal
      g.selectAll('.layer')
        .data(series)
        .enter()
        .append('g')
        .attr('fill', (d) => PORTAL_COLORS[d.key as SourceId] ?? '#334155')
        .selectAll('rect')
        .data((layer) => layer.map((pt) => ({ ...pt, key: layer.key as SourceId })))
        .enter()
        .append('rect')
        .attr('x', (d) => xScale(String(d.data.date)) ?? 0)
        .attr('y', (d) => yScale(d[1]))
        .attr('width', xScale.bandwidth())
        .attr('height', (d) => Math.max(0, yScale(d[0]) - yScale(d[1])))
        .attr('rx', 1.5);

      // Transparent hover columns across all 30 days
      const dayByDate = new Map(analytics.days.map((d) => [d.date, d]));
      g.selectAll('.hover-band')
        .data(analytics.days)
        .enter()
        .append('rect')
        .attr('x', (d) => xScale(d.date) ?? 0)
        .attr('y', 0)
        .attr('width', xScale.bandwidth())
        .attr('height', innerHeight)
        .attr('fill', 'transparent')
        .style('cursor', 'crosshair')
        .on('mouseenter', function (_, d) {
          d3.select(this).attr('fill', 'rgba(15, 23, 42, 0.04)');
          setHoveredDay(dayByDate.get(d.date) ?? null);
        })
        .on('mouseleave', function () {
          d3.select(this).attr('fill', 'transparent');
          setHoveredDay(null);
        });
    } else {
      // Horizontal stacked comparison bar chart by portal & offer type
      const sortedPortals = [...analytics.portals].sort(
        (a, b) => b.currentCount - a.currentCount
      );
      const barHeight = 28;
      const margin = { top: 12, right: 64, bottom: 28, left: 138 };
      const height = sortedPortals.length * barHeight + margin.top + margin.bottom;
      const innerWidth = Math.max(180, containerWidth - margin.left - margin.right);
      const innerHeight = height - margin.top - margin.bottom;

      svg.attr('viewBox', `0 0 ${containerWidth} ${height}`).attr('height', height);
      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

      const yScale = d3
        .scaleBand<string>()
        .domain(sortedPortals.map((p) => p.sourceId))
        .range([0, innerHeight])
        .padding(0.28);

      const maxCount = d3.max(sortedPortals, (p) => p.currentCount) ?? 10;
      const xScale = d3
        .scaleLinear()
        .domain([0, Math.max(10, Math.ceil(maxCount * 1.15))])
        .nice()
        .range([0, innerWidth]);

      // Vertical gridlines
      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .ticks(5)
            .tickSize(-innerHeight)
            .tickFormat((d) => String(d))
        )
        .call((axisG) => {
          axisG.select('.domain').attr('stroke', '#cbd5e1');
          axisG.selectAll('line').attr('stroke', '#e2e8f0').attr('stroke-dasharray', '2,2');
          axisG
            .selectAll('text')
            .attr('dy', '14px')
            .attr('fill', '#64748b')
            .attr('font-size', '11px')
            .attr('font-family', 'JetBrains Mono, monospace');
        });

      const nameMap = new Map(sortedPortals.map((p) => [p.sourceId, p.sourceName]));
      g.append('g')
        .call(
          d3
            .axisLeft(yScale)
            .tickSize(0)
            .tickPadding(10)
            .tickFormat((id) => nameMap.get(id as SourceId) ?? id)
        )
        .call((axisG) => {
          axisG.select('.domain').remove();
          axisG
            .selectAll('text')
            .attr('fill', '#0f172a')
            .attr('font-size', '12px')
            .attr('font-weight', '600');
        });

      const catKeys = ['codiceScontoCount', 'cashbackCount', 'provaGratisCount'] as const;
      const stackGen = d3.stack<(typeof sortedPortals)[number]>().keys(catKeys as unknown as string[]);
      const layers = stackGen(sortedPortals);

      g.selectAll('.cat-layer')
        .data(layers)
        .enter()
        .append('g')
        .attr(
          'fill',
          (layer) => CATEGORY_COLORS[layer.key as keyof typeof CATEGORY_COLORS] ?? '#475569'
        )
        .selectAll('rect')
        .data((layer) => layer)
        .enter()
        .append('rect')
        .attr('y', (d) => yScale(d.data.sourceId) ?? 0)
        .attr('x', (d) => xScale(d[0]))
        .attr('height', yScale.bandwidth())
        .attr('width', (d) => Math.max(0, xScale(d[1]) - xScale(d[0])))
        .attr('rx', 2)
        .style('cursor', 'pointer')
        .on('click', (_, d) => {
          onSelectSourceFilter(d.data.sourceId);
          const el = document.getElementById('offerte');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        });

      // Right-aligned numeric total labels
      g.selectAll('.bar-total-label')
        .data(sortedPortals)
        .enter()
        .append('text')
        .attr('x', (d) => xScale(d.currentCount) + 6)
        .attr('y', (d) => (yScale(d.sourceId) ?? 0) + yScale.bandwidth() / 2 + 4)
        .attr('fill', '#334155')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text((d) => `${d.currentCount}`);
    }
  }, [analytics, viewMode, focusedSource, containerWidth, portalOrder, onSelectSourceFilter]);

  return (
    <section
      id="statistiche"
      aria-label="Analisi volume offerte negli ultimi 30 giorni"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8"
    >
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        {/* Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <BarChart3 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              <span>Monitoraggio D3.js · Finestra mobile 30 giorni</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1">
              Volume Offerte Attive per Portale (Ultimi 30 Giorni)
            </h2>
          </div>

          {/* Segmented View Toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('timeline30d')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'timeline30d'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Andamento 30 Giorni
            </button>
            <button
              type="button"
              onClick={() => setViewMode('byPortal')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'byPortal'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Confronto Portali
            </button>
          </div>
        </div>

        {/* Tabular KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-3 border-y border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Offerte Rilevate Oggi</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {totalCurrentOffers}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Portali Monitorati</p>
            <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {analytics?.portals.length ?? 11}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Giorni Registrati (30 gg)</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {analytics?.recordedDaysCount ?? 0} / 30
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Media per Portale</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {avgPerPortal}
            </p>
          </div>
        </div>

        {/* Chart Body with Complete Loading/Error/Populated States */}
        {loading ? (
          <div className="h-[310px] bg-slate-50 border border-slate-100 rounded-lg animate-pulse flex items-center justify-center text-xs text-slate-400">
            Caricamento grafico D3.js…
          </div>
        ) : error ? (
          <div className="h-52 bg-slate-50 border border-slate-200 rounded-lg flex flex-col items-center justify-center p-6 text-center">
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              Riprova
            </button>
          </div>
        ) : (
          <>
            <div ref={containerRef} className="relative w-full overflow-x-auto">
              <svg
                ref={svgRef}
                className="w-full block select-none"
                role="img"
                aria-label="Grafico D3.js del volume di offerte attive per ciascun portale negli ultimi 30 giorni"
              />

              {/* Hover Inspector Readout */}
              {viewMode === 'timeline30d' && hoveredDay && (
                <div className="mt-2 p-3 bg-slate-900 text-white rounded-lg text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold tabular-nums">
                    {hoveredDay.date} ·{' '}
                    {hoveredDay.recorded
                      ? `${
                          focusedSource === 'all'
                            ? hoveredDay.total
                            : (hoveredDay.counts[focusedSource] ?? 0)
                        } offerte attive registrate`
                      : 'Nessuna rilevazione salvata in questa data'}
                  </span>
                  {hoveredDay.recorded && (
                    <span className="text-slate-300 truncate max-w-2xl">
                      {portalOrder
                        .filter((id) => (hoveredDay.counts[id] ?? 0) > 0)
                        .slice(0, 6)
                        .map((id) => `${PORTAL_LABELS[id]}: ${hoveredDay.counts[id]}`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Interactive Legend */}
            {viewMode === 'timeline30d' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFocusedSource('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      focusedSource === 'all'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Tutti ({totalCurrentOffers})
                  </button>
                  {portalOrder.map((id) => {
                    const active = focusedSource === id;
                    const count =
                      analytics?.portals.find((p) => p.sourceId === id)?.currentCount ?? 0;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          setFocusedSource((prev) => (prev === id ? 'all' : id))
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                          active
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: PORTAL_COLORS[id] }}
                          aria-hidden="true"
                        />
                        <span>
                          {PORTAL_LABELS[id]} ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: CATEGORY_COLORS.codiceScontoCount }}
                      aria-hidden="true"
                    />
                    <span>Codici Sconto</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: CATEGORY_COLORS.cashbackCount }}
                      aria-hidden="true"
                    />
                    <span>Cashback</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: CATEGORY_COLORS.provaGratisCount }}
                      aria-hidden="true"
                    />
                    <span>Prova Gratis &amp; Omaggio</span>
                  </span>
                </div>
                <span className="text-slate-500">
                  Clicca su una barra per filtrare le offerte del portale
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
