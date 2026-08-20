import { useState, useMemo, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import React from 'react';
import ReactECharts from 'echarts-for-react';

const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_TIME || Date.now().toString();
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
const REPO_URL = 'https://github.com/Brian-Foerster/EAGrantsDatabase';
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSceNe8T97Z36LvBmepyid68MYbyairBvZucnZFlREGROSBOZA/viewform';

// Annual average GBP/USD rates (source: Bank of England / FRED)
const GBP_USD_RATES: Record<number, number> = {
  2010: 1.546, 2011: 1.604, 2012: 1.585, 2013: 1.564,
  2014: 1.648, 2015: 1.529, 2016: 1.355, 2017: 1.289,
  2018: 1.335, 2019: 1.277, 2020: 1.284, 2021: 1.376,
  2022: 1.237, 2023: 1.244, 2024: 1.281, 2025: 1.286,
};
const GBP_USD_FALLBACK = 1.27;

// CPI multipliers to express nominal amounts in constant 2025 prices, indexed
// so the most recent full year = 1.0 (same convention as the grants database).
// US_CPI matches the grants DB's figures (BLS CPI-U All Items, 2025 avg ≈ 322.6
// vs 2024 ≈ 314.2 → +2.67%); UK_CPI (ONS CPI All Items 2015=100, 2025 avg 138.4
// vs 2024 133.9 → +3.36%) is used for GBP-denominated orgs so real values use the
// right index. 2026 is partial → held at 1.0.
const US_CPI: Record<number, number> = {
  2010: 1.49, 2011: 1.45, 2012: 1.42, 2013: 1.40, 2014: 1.38, 2015: 1.38,
  2016: 1.36, 2017: 1.32, 2018: 1.29, 2019: 1.26, 2020: 1.25, 2021: 1.19,
  2022: 1.11, 2023: 1.07, 2024: 1.03, 2025: 1.00, 2026: 1.00,
};
const UK_CPI: Record<number, number> = {
  2010: 1.55, 2011: 1.49, 2012: 1.45, 2013: 1.41, 2014: 1.39, 2015: 1.39,
  2016: 1.37, 2017: 1.34, 2018: 1.30, 2019: 1.28, 2020: 1.27, 2021: 1.24,
  2022: 1.14, 2023: 1.06, 2024: 1.03, 2025: 1.00, 2026: 1.00,
};
function cpiMultiplier(year: number, currency: string): number {
  return (currency === 'GBP' ? UK_CPI : US_CPI)[year] ?? 1.0;
}

// viewBox coordinate system for all org charts
const CVW = 360;  // chart viewBox width
const CVH = 168;  // chart viewBox height
const CL  = 52;   // left margin (y-axis labels)
const CB  = 22;   // bottom margin (x-axis labels)
const CT  = 10;   // top margin (room for top label)
const CIW = CVW - CL;       // inner width
const CIH = CVH - CB - CT;  // inner height

type Metric = 'income' | 'expenses' | 'assets' | 'liabilities';

const METRIC_LABELS: Record<Metric, string> = {
  income: 'Revenue', expenses: 'Expenses', assets: 'Assets', liabilities: 'Liabilities',
};
const METRIC_COLORS: Record<Metric, string> = {
  income: '#10b981',
  expenses: '#f97316',
  assets: '#3b82f6',
  liabilities: '#ef4444',
};

interface Filing {
  year: number;
  income: number | null;
  contributions: number | null;
  expenses: number | null;
  assets: number | null;
  liabilities: number | null;
  net_assets: number | null;
  grants: number | null;
  grants_carryforward?: boolean;
  inferred?: boolean;
}

interface Org {
  name: string;
  legal_name: string | null;
  category: string;
  detail_category: string;
  country: string;
  currency: string;
  source: string;
  ein: string | null;
  cc_number: string | null;
  notes: string | null;
  fy_end_month?: number;
  grant_names?: string[];
  filings: Filing[];
}

const CATEGORY_COLORS: Record<string, string> = {
  GH: '#10b981', LTXR: '#f59e0b', AW: '#8b5cf6',
  Meta: '#06b6d4', Climate: '#14b8a6', Policy: '#ef4444', Other: '#3a6ea5',
};

const CATEGORY_DISPLAY: Record<string, string> = {
  GH: 'Global Health', LTXR: 'Long-Term / X-Risk', AW: 'Animal Welfare',
  Meta: 'EA Meta', Climate: 'Climate', Policy: 'Policy', Other: 'Other',
};

const COUNTRY_DISPLAY: Record<string, string> = {
  US: '🇺🇸 United States', GB: '🇬🇧 United Kingdom',
};

const CATEGORY_ORDER = ['GH', 'LTXR', 'AW', 'Meta', 'Climate', 'Policy', 'Other'];

function niceMax(value: number): number {
  if (value <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / magnitude;
  const step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : n <= 8 ? 8 : 10;
  return step * magnitude;
}

function formatIncome(amount: number, currency: string): string {
  const sym = currency === 'GBP' ? '£' : '$';
  if (amount >= 1e9) return `${sym}${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `${sym}${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `${sym}${(amount / 1e3).toFixed(0)}K`;
  return `${sym}${amount.toLocaleString()}`;
}

function formatYTick(val: number, currency: string): string {
  const sym = currency === 'GBP' ? '£' : '$';
  if (val === 0) return `${sym}0`;
  if (val >= 1e9) return `${sym}${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `${sym}${(val / 1e6).toFixed(0)}M`;
  if (val >= 1e3) return `${sym}${(val / 1e3).toFixed(0)}K`;
  return `${sym}${val}`;
}

function getLatestFiling(filings: Filing[]): Filing | null {
  const withIncome = filings.filter(f => f.income != null && f.income > 0);
  if (!withIncome.length) return null;
  return withIncome.reduce((a, b) => (a.year > b.year ? a : b));
}

function toUsd(amount: number, currency: string, year?: number): number {
  if (currency !== 'GBP') return amount;
  const rate = year ? (GBP_USD_RATES[year] ?? GBP_USD_FALLBACK) : GBP_USD_FALLBACK;
  return amount * rate;
}

function orgUrl(org: Org): string | null {
  if (org.ein) return `https://projects.propublica.org/nonprofits/organizations/${org.ein}`;
  if (org.cc_number) return `https://findthatcharity.uk/orgid/GB-CHC-${org.cc_number}`;
  return null;
}

const GRANTS_COLOR = '#a7f3d0'; // emerald-200 — substantially lighter than income (#10b981 emerald-500)

function BarChartWithAxis({ entries, color, currency = 'USD', minYear, maxYear, idPrefix = 'bc' }: {
  entries: { year: number; income: number; inferred?: boolean; grants?: number; grantsCf?: boolean }[];
  color: string;
  currency?: string;
  minYear?: number;
  maxYear?: number;
  idPrefix?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string; year: number } | null>(null);
  // Anchor the tooltip to the bar (not the cursor) and only reposition when the
  // hovered bar actually changes, so sweeping across bars glides instead of
  // jittering. cx/topY are SVG coords, converted to container px on hover.
  const showBar = (year: number, cx: number, topY: number, text: string) => () => {
    setHover(prev => {
      if (prev && prev.year === year) return prev; // same bar — no re-render
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return prev;
      const scale = rect.width / CVW;
      // The tooltip is centered on the bar (translate(-50%)) and is at most
      // ~200px wide, so clamp its center to keep it inside the chart box —
      // otherwise edge-year bars push it past the card and it gets clipped.
      const half = 100; // half of maxWidth
      const pad = 4;
      let x = cx * scale;
      x = rect.width >= 2 * (half + pad)
        ? Math.max(half + pad, Math.min(x, rect.width - half - pad))
        : rect.width / 2;
      return { x, y: topY * scale, text, year };
    });
  };
  const hideTip = () => setHover(null);

  if (entries.length < 1) return null;

  const effectiveMin = minYear ?? Math.min(...entries.map(e => e.year));
  const effectiveMax = maxYear ?? Math.max(...entries.map(e => e.year));
  const totalYears = effectiveMax - effectiveMin + 1;

  const incomeByYear: Record<number, number> = {};
  const inferredByYear: Record<number, boolean> = {};
  const grantsByYear: Record<number, number> = {};
  const grantsCfByYear: Record<number, boolean> = {};
  entries.forEach(e => {
    incomeByYear[e.year] = e.income;
    inferredByYear[e.year] = !!e.inferred;
    if (e.grants) grantsByYear[e.year] = e.grants;
    if (e.grantsCf) grantsCfByYear[e.year] = true;
  });

  const localMax = Math.max(...entries.map(e => e.income));
  // Inferred bars draw a fade extension (up to 14px) above the bar to signal
  // "actual revenue likely higher". If the tallest bar is inferred it can hit
  // the chart ceiling, leaving no room for that fade — so reserve headroom
  // above the tallest inferred bar before snapping to a nice axis maximum.
  const inferredMax = Math.max(0, ...entries.filter(e => e.inferred).map(e => e.income));
  const headroomFloor = inferredMax > 0 ? inferredMax / (1 - 15 / CIH) : 0;
  const yMax = niceMax(Math.max(localMax, headroomFloor));

  const yTicks = [0, yMax / 2, yMax];

  const gap = 3;
  const barW = Math.min(38, Math.max(5, Math.floor((CIW - (totalYears - 1) * gap) / totalYears)));
  const totalUsedW = totalYears * barW + (totalYears - 1) * gap;
  const xStart = CL + (CIW - totalUsedW) / 2;

  const xLabelSet = new Set([effectiveMin, effectiveMax]);
  if (totalYears > 4) xLabelSet.add(Math.round((effectiveMin + effectiveMax) / 2));

  const tickY = (tick: number) => CT + CIH - (tick / yMax) * CIH;

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onMouseLeave={hideTip}>
    <svg
      viewBox={`0 0 ${CVW} ${CVH}`}
      style={{ width: '100%', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Grid lines */}
      {yTicks.map(tick => (
        <line
          key={tick}
          x1={CL} y1={tickY(tick)} x2={CVW} y2={tickY(tick)}
          stroke={tick === 0 ? '#cbd5e1' : '#e5e7eb'}
          strokeWidth={1}
        />
      ))}

      {/* Y-axis labels */}
      {yTicks.map(tick => (
        <text
          key={tick}
          x={CL - 4} y={tickY(tick) + 4}
          textAnchor="end"
          fontSize={11}
          fontWeight={500}
          fill="#64748b"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {formatYTick(tick, currency)}
        </text>
      ))}

      {/* Bars */}
      {Array.from({ length: totalYears }, (_, i) => {
        const year = effectiveMin + i;
        const income = incomeByYear[year];
        if (!income) return null;
        const isInferred = inferredByYear[year];
        const barH = Math.max(0.5, (income / yMax) * CIH);
        const x = xStart + i * (barW + gap);
        const barY = CT + CIH - barH;
        const tooltip = `${year}: ${formatIncome(income, currency)}${isInferred ? ' (known EA grants only — actual revenue could be higher)' : ''}`;
        if (isInferred) {
          const extH = Math.min(14, Math.max(0, barY - CT));
          const extTop = barY - extH;
          const fgId = `${idPrefix}-fg-${year}`;
          const egId = `${idPrefix}-eg-${year}`;
          return (
            <g key={year}>
              <defs>
                <linearGradient id={fgId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={color} stopOpacity={0.30} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id={egId} x1="0" y1={extTop} x2="0" y2={barY} gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stopColor={color} stopOpacity={0} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.32} />
                </linearGradient>
              </defs>
              {extH > 0 && <rect x={x} y={extTop} width={barW} height={extH} fill={`url(#${egId})`} />}
              <rect x={x} y={barY} width={barW} height={barH} fill={`url(#${fgId})`} rx={1} />
              {/* Full-column hit area so tooltip fires above the bar too */}
              <rect x={x} y={CT} width={barW} height={CIH} fill="transparent"
                onMouseMove={showBar(year, x + barW / 2, barY, tooltip)} />
            </g>
          );
        }
        const grants = grantsByYear[year];
        const grantsH = grants ? Math.min(barH, Math.max(1, (Math.min(grants, income) / yMax) * CIH)) : 0;
        const grantsTooltip = grants ? ` (${formatIncome(grants, currency)} from tracked EA grants${grantsCfByYear[year] ? ', carryforward-adjusted' : ''})` : '';
        return (
          <g key={year}>
            {/* Full revenue bar in light mint */}
            <rect x={x} y={barY} width={barW} height={barH} fill={GRANTS_COLOR} opacity={0.85} rx={1} />
            {/* Grants portion — dark green at bottom */}
            {grantsH > 0 && (
              <rect x={x} y={barY + barH - grantsH} width={barW} height={grantsH}
                fill={color} opacity={0.9} />
            )}
            {/* Full-column hit area so tooltip fires above the bar too */}
            <rect x={x} y={CT} width={barW} height={CIH} fill="transparent"
              onMouseMove={showBar(year, x + barW / 2, barY, `${tooltip}${grantsTooltip}`)} />
          </g>
        );
      })}

      {/* X-axis labels */}
      {Array.from({ length: totalYears }, (_, i) => {
        const year = effectiveMin + i;
        if (!xLabelSet.has(year)) return null;
        const cx = xStart + i * (barW + gap) + barW / 2;
        const anchor = year === effectiveMax ? 'end' : year === effectiveMin ? 'start' : 'middle';
        const lx = year === effectiveMax ? Math.min(cx, CVW - 1) : year === effectiveMin ? Math.max(cx, CL) : cx;
        return (
          <text
            key={year}
            x={lx} y={CVH - 4}
            textAnchor={anchor}
            fontSize={10}
            fill="#94a3b8"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {year}
          </text>
        );
      })}
    </svg>
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: hover.x,
            top: hover.y,
            transform: 'translate(-50%, calc(-100% - 8px))',
            transition: 'left 0.12s ease, top 0.12s ease',
            background: 'rgba(17,24,39,0.92)',
            color: 'white',
            fontSize: '11px',
            lineHeight: 1.35,
            textAlign: 'center',
            padding: '4px 7px',
            borderRadius: '4px',
            maxWidth: '200px',
            width: 'max-content',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}

function OrgCard({ org, globalMinYear, globalMaxYear, globalMetric, cardRef, glow, adjustInflation }: {
  org: Org;
  globalMinYear: number;
  globalMaxYear: number;
  globalMetric: Metric;
  cardRef?: (el: HTMLDivElement | null) => void;
  glow?: boolean;
  adjustInflation?: boolean;
}) {
  const [metric, setMetric] = useState<Metric>(globalMetric);
  useEffect(() => { setMetric(globalMetric); }, [globalMetric]);

  const catColor = CATEGORY_COLORS[org.category] || '#9ca3af';
  const chartColor = METRIC_COLORS[metric];
  const chartIdPrefix = org.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
  const url = orgUrl(org);
  const isAnomaly = org.notes && /one-time|Vitalik|FTX|clawback|anomaly|unusual/i.test(org.notes);

  const getEntries = (m: Metric) => org.filings
    .filter(f => f[m] != null && (f[m] as number) > 0)
    .sort((a, b) => a.year - b.year)
    .map(f => {
      const mult = adjustInflation ? cpiMultiplier(f.year, org.currency) : 1;
      return {
        year: f.year,
        income: (f[m] as number) * mult,
        inferred: !!f.inferred,
        grants: m === 'income' && !f.inferred && f.grants ? f.grants * mult : undefined,
        grantsCf: m === 'income' && !f.inferred && f.grants_carryforward ? true : undefined,
      };
    });

  const chartEntries = getEntries(metric);
  const latestReal = chartEntries.filter(e => !e.inferred).at(-1) ?? null;
  const latest = latestReal ?? (chartEntries.length ? chartEntries[chartEntries.length - 1] : null);

  const sourceLabel = org.source === 'propublica'
    ? `EIN ${org.ein ? `${org.ein.slice(0, 2)}-${org.ein.slice(2)}` : '—'}`
    : `CC ${org.cc_number}`;

  const availableMetrics = (['income', 'expenses', 'assets', 'liabilities'] as Metric[])
    .filter(m => org.filings.some(f => f[m] != null && (f[m] as number) > 0));

  return (
    <div
      ref={cardRef}
      style={{
        ...styles.orgCard,
        scrollMarginTop: '16px',
        // appears quickly, then fades out slowly (asymmetric transition)
        transition: glow ? 'box-shadow 0.4s ease' : 'box-shadow 1.4s ease-out',
        // shadow is always present but transparent when idle, so the glow can
        // animate its alpha smoothly both in and out
        boxShadow: glow
          ? '0 0 22px 6px rgba(5,150,105,0.35)'
          : '0 0 22px 6px rgba(5,150,105,0)',
      }}
    >
      {/* Badges */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{ ...styles.tagColored, borderColor: catColor, color: catColor }}>
          {CATEGORY_DISPLAY[org.category] || org.category}
        </span>
        <span style={{ ...styles.tagColored, borderColor: '#e2e8f0', color: '#94a3b8', fontSize: '11px' }}>
          {org.country === 'GB' ? 'UK' : 'US'}
        </span>
      </div>

      {/* Name */}
      <h3 style={styles.cardTitle}>
        {url
          ? <a href={url} target="_blank" rel="noopener noreferrer" style={styles.grantTitleLink}>{org.name}</a>
          : org.name}
      </h3>

      {/* Metric selector tabs */}
      {availableMetrics.length > 1 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {availableMetrics.map(m => {
            const active = metric === m;
            const mColor = m === 'income' ? catColor : METRIC_COLORS[m];
            return (
              <button
                key={m}
                onClick={() => setMetric(m)}
                style={{
                  padding: '3px 8px', fontSize: '11px', fontWeight: '600',
                  border: `1px solid ${active ? mColor : '#e2e8f0'}`,
                  borderRadius: '3px', cursor: 'pointer',
                  backgroundColor: active ? mColor : 'white',
                  color: active ? 'white' : '#64748b',
                  transition: 'all 0.1s',
                }}
              >
                {METRIC_LABELS[m]}
              </button>
            );
          })}
        </div>
      )}

      {/* Latest value */}
      {latest ? (
        <div style={{ marginBottom: '14px' }}>
          <span style={{ fontSize: '20px', fontWeight: '700', color: latest.inferred ? '#94a3b8' : '#1a202c' }}>
            {formatIncome(latest.income, org.currency)}
          </span>
          <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '6px' }}>{latest.year}</span>
          {latest.inferred && (
            <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px', fontStyle: 'italic' }}>EA grants only</span>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: '14px', fontSize: '16px', color: '#d1d5db' }}>—</div>
      )}

      {/* Chart */}
      {chartEntries.length >= 1 && (
        <div style={{ marginBottom: '8px' }}>
          <BarChartWithAxis
            entries={chartEntries}
            color={chartColor}
            currency={org.currency}
            minYear={globalMinYear}
            maxYear={globalMaxYear}
            idPrefix={chartIdPrefix}
          />
        </div>
      )}

      {/* Anomaly note */}
      {isAnomaly && org.notes && (
        <div style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: '4px', padding: '5px 8px', lineHeight: '1.4', marginBottom: '8px' }}>
          {org.notes}
        </div>
      )}

      {/* Footer: cross-link to grants + data source */}
      <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
        {org.grant_names && org.grant_names.length > 0 && (
          <a href={`${BASE_PATH}/?org=${encodeURIComponent(org.name)}`} style={styles.crossLink}>
            View EA grants to this org →
          </a>
        )}
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
          {url
            ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#3a6ea5', textDecoration: 'none' }}>{sourceLabel}</a>
            : sourceLabel}
          {' · '}
          {org.source === 'propublica' ? 'ProPublica' : 'Charity Commission'}
        </div>
      </div>
    </div>
  );
}

export default function Recipients() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [expandedFilters, setExpandedFilters] = useState<Record<string, boolean>>({});
  const [chartBreakdown, setChartBreakdown] = useState<'total' | 'byCategory'>('byCategory');
  const [showEAGrants, setShowEAGrants] = useState(false);
  const [adjustInflation, setAdjustInflation] = useState(false);
  const [globalMetric, setGlobalMetric] = useState<Metric>('income');
  // Constant initial value so server and first client render agree (no hydration
  // mismatch); the effect sets the real width immediately after mount.
  const [windowWidth, setWindowWidth] = useState(400);
  // Deep-link target from the grants DB (?org=<name>). Read synchronously at
  // first render so we can keep the page hidden until it's positioned, avoiding
  // a flash of the (unscrolled) top of the list.
  const [focusOrg] = useState<string | null>(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('org') : null
  );
  const [hideForFocus, setHideForFocus] = useState<boolean>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('org')
  );
  const [glowOrg, setGlowOrg] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const didFocus = useRef(false);
  const fetchAttempted = useRef(false);

  useEffect(() => {
    const update = () => setWindowWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('v')) {
      url.searchParams.delete('v');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => {
    if (fetchAttempted.current) return;
    fetchAttempted.current = true;
    fetch(`${BASE_PATH}/data/recipient-orgs.json?v=${BUILD_VERSION}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setOrgs(d.orgs || []); setLastUpdated(d.generated_at || ''); setIsLoading(false); })
      .catch(() => { setLoadError(true); setIsLoading(false); });
  }, []);

  // Deep link from the grants database: once the target card is laid out, jump
  // straight to it (no animation) then reveal the page. The card is rendered
  // while hidden, so scrollIntoView still measures its real position.
  useEffect(() => {
    if (!focusOrg || didFocus.current || isLoading) return;
    const el = cardRefs.current.get(focusOrg);
    if (!el) return; // not rendered yet — re-runs when orgs populate
    didFocus.current = true;
    el.scrollIntoView({ block: 'center' });
    setHideForFocus(false);

    // On multi-column layouts the landed card isn't obvious, so flash a soft
    // glow. On a single column it fills the width, so skip it as unnecessary.
    const grid = el.parentElement;
    const cols = grid
      ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
      : 1;
    if (cols >= 2) {
      setGlowOrg(focusOrg);
      // brief hold, then trigger the slow (1.4s) fade-out
      const t = setTimeout(() => setGlowOrg(null), 450);
      return () => clearTimeout(t);
    }
  }, [focusOrg, isLoading, orgs]);

  // Safety net: never leave the page hidden (e.g. if the org can't be found).
  useEffect(() => {
    if (!hideForFocus) return;
    const t = setTimeout(() => setHideForFocus(false), 1500);
    return () => clearTimeout(t);
  }, [hideForFocus]);

  const isPhonePortrait = windowWidth < 480;
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  // Uniform sizing for chart-control tabs (matches the grants database), so they
  // shrink together on smaller screens and stay on one row as long as reasonable.
  const chartTabSize = isPhonePortrait
    ? { padding: '8px 12px', fontSize: '13px' }
    : isMobile
    ? { padding: '9px 15px', fontSize: '14px' }
    : { padding: '10px 17px', fontSize: '15px' };

  const categories = useMemo(() => {
    const seen = new Set<string>();
    orgs.forEach(o => seen.add(o.category));
    return CATEGORY_ORDER.filter(c => seen.has(c));
  }, [orgs]);

  const countries = useMemo(() => {
    const seen = new Set<string>();
    orgs.forEach(o => seen.add(o.country));
    return Array.from(seen).sort();
  }, [orgs]);

  const filteredOrgs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orgs.filter(o => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(o.category)) return false;
      if (selectedCountries.length > 0 && !selectedCountries.includes(o.country)) return false;
      if (q) {
        const nameMatch = o.name.toLowerCase().includes(q);
        const legalMatch = o.legal_name ? o.legal_name.toLowerCase().includes(q) : false;
        if (!nameMatch && !legalMatch) return false;
      }
      return true;
    });
  }, [orgs, searchTerm, selectedCategories, selectedCountries]);

  const { globalMinYear, globalMaxYear } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    filteredOrgs.forEach(o =>
      o.filings.filter(f => f.income != null && f.income > 0).forEach(f => {
        if (f.year < min) min = f.year;
        if (f.year > max) max = f.year;
      })
    );
    return { globalMinYear: isFinite(min) ? min : 2010, globalMaxYear: isFinite(max) ? max : 2023 };
  }, [filteredOrgs]);

  const toggleCategory = (cat: string) =>
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const toggleCountry = (c: string) =>
    setSelectedCountries(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  const clearFilters = () => { setSearchTerm(''); setSelectedCategories([]); setSelectedCountries([]); };

  const csvEscape = (value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const downloadFilteredCsv = () => {
    const headers = [
      'name', 'legal_name', 'category', 'country', 'currency', 'ein', 'cc_number',
      'year', 'income', 'contributions', 'expenses', 'assets', 'liabilities',
      'net_assets', 'ea_grants', 'inferred',
    ];
    const rows: (string | number | null)[][] = [];
    filteredOrgs.forEach(o => {
      [...o.filings].sort((a, b) => a.year - b.year).forEach(f => {
        rows.push([
          o.name, o.legal_name, o.category, o.country, o.currency, o.ein, o.cc_number,
          f.year, f.income, f.contributions, f.expenses, f.assets, f.liabilities,
          f.net_assets, f.grants, f.inferred ? 'true' : '',
        ]);
      });
    });
    const csv = [
      headers.map(csvEscape).join(','),
      ...rows.map(row => row.map(csvEscape).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ea-org-financials-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const chartOption = useMemo(() => {
    if (!filteredOrgs.length) return {};

    // The aggregate chart is in USD; deflate by US CPI to constant 2025 USD.
    const realUsd = (amount: number, currency: string, year: number) =>
      toUsd(amount, currency, year) * (adjustInflation ? (US_CPI[year] ?? 1) : 1);

    const yearsSet = new Set<number>();
    filteredOrgs.forEach(o =>
      o.filings.filter(f => f.income != null && f.income > 0 && !f.inferred).forEach(f => yearsSet.add(f.year))
    );
    if (!yearsSet.size) return {};
    const minY = Math.min(...yearsSet);
    const maxY = Math.max(...yearsSet);
    const years: number[] = [];
    for (let y = minY; y <= maxY; y++) years.push(y);
    const yearLabels = years.map(String);

    // EA grants by year: real filings use f.grants, inferred filings use f.income
    const eaGrantsByYear: Record<number, number> = {};
    filteredOrgs.forEach(o =>
      o.filings.forEach(f => {
        const amount = f.inferred ? (f.income || 0) : (f.grants || 0);
        if (amount > 0) eaGrantsByYear[f.year] = (eaGrantsByYear[f.year] || 0) + realUsd(amount, o.currency, f.year);
      })
    );
    const legendConfig = isMobile
      ? { show: false }
      : { type: 'scroll' as const, orient: 'vertical' as const, right: 10, top: 20, bottom: 20 };

    const grid = isMobile
      ? { left: '45px', right: '8px', top: '30px', bottom: '10%' }
      : { left: '7%', right: '20%', top: '55px', bottom: '15%' };

    const yAxis = {
      type: 'value' as const,
      name: isMobile ? '' : (adjustInflation ? '2025 USD ($M)' : 'Amount ($M)'),
      nameTextStyle: { fontSize: 12 },
      axisLabel: {
        fontSize: isMobile ? 10 : 13,
        formatter: (val: number) => {
          if (val >= 1000) return (val / 1000).toFixed(1) + 'B';
          if (val >= 10) return Math.round(val) + 'M';
          return (Math.round(val * 10) / 10) + 'M';
        },
      },
    };

    const tooltip = {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params];
        let total = 0;
        const lines = items
          .filter((p: any) => p.value > 0)
          .map((p: any) => { total += p.value; return `${p.marker} ${p.seriesName}: $${p.value.toFixed(1)}M`; });
        return `${items[0].name}<br/>${lines.join('<br/>')}<br/><b>Total: $${total.toFixed(1)}M</b>`;
      },
    };

    // EA Grants mode: completely replace the chart with grants-only data
    if (showEAGrants) {
      if (chartBreakdown === 'total') {
        const data = years.map(y => parseFloat(((eaGrantsByYear[y] || 0) / 1e6).toFixed(2)));
        const maxVal = Math.max(...data);
        return {
          animation: false,
          title: isMobile ? { show: false } : { text: 'Tracked EA Grants by Year', left: 'center', top: 8 },
          tooltip: {
            trigger: 'axis' as const,
            axisPointer: { type: 'shadow' as const },
            confine: true,
            formatter: (params: any) => {
              const p = Array.isArray(params) ? params[0] : params;
              return `${p.name}<br/>${p.marker} Tracked EA Grants: $${p.value}M`;
            },
          },
          xAxis: { type: 'category' as const, data: yearLabels, axisLabel: { fontSize: isMobile ? 9 : 12 } },
          yAxis: { ...yAxis, max: niceMax(maxVal * 1.05) },
          series: [{ name: 'Tracked EA Grants', type: 'bar', data, itemStyle: { color: '#059669' } }],
          grid,
        };
      }
      // By category: break EA grants down by org category
      const catGrantTotals: Record<string, Record<number, number>> = {};
      CATEGORY_ORDER.forEach(cat => { catGrantTotals[cat] = {}; });
      filteredOrgs.forEach(o =>
        o.filings.forEach(f => {
          const amount = f.inferred ? (f.income || 0) : (f.grants || 0);
          if (amount > 0) {
            const usd = realUsd(amount, o.currency, f.year);
            catGrantTotals[o.category][f.year] = (catGrantTotals[o.category][f.year] || 0) + usd;
          }
        })
      );
      const activeCatsG = CATEGORY_ORDER.filter(cat => years.some(y => (catGrantTotals[cat][y] || 0) > 0));
      const maxTotalG = years.reduce((m, y) => {
        const s = activeCatsG.reduce((sum, cat) => sum + (catGrantTotals[cat][y] || 0), 0);
        return Math.max(m, s);
      }, 0);
      return {
        animation: false,
        title: isMobile ? { show: false } : { text: 'Tracked EA Grants by Year (by Category)', left: 'center', top: 8 },
        tooltip,
        legend: legendConfig,
        xAxis: { type: 'category' as const, data: yearLabels, axisLabel: { fontSize: isMobile ? 9 : 12 } },
        yAxis: { ...yAxis, max: niceMax(maxTotalG / 1e6 * 1.05) },
        series: activeCatsG.map(cat => ({
          name: CATEGORY_DISPLAY[cat] || cat,
          type: 'bar' as const,
          stack: 'total',
          data: years.map(y => parseFloat(((catGrantTotals[cat][y] || 0) / 1e6).toFixed(2))),
          itemStyle: { color: CATEGORY_COLORS[cat] },
        })),
        grid,
      };
    }

    if (chartBreakdown === 'total') {
      const totals: Record<number, number> = {};
      filteredOrgs.forEach(o =>
        o.filings.forEach(f => {
          if (f.income != null && f.income > 0 && !f.inferred)
            totals[f.year] = (totals[f.year] || 0) + realUsd(f.income, o.currency, f.year);
        })
      );
      const data = years.map(y => parseFloat(((totals[y] || 0) / 1e6).toFixed(2)));
      const maxVal = Math.max(...data);
      return {
        animation: false,
        title: isMobile ? { show: false } : { text: 'Total Income by Year', left: 'center', top: 8 },
        tooltip: {
          trigger: 'axis' as const,
          axisPointer: { type: 'shadow' as const },
          confine: true,
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            return `${p.name}<br/>${p.marker} Total: $${p.value}M`;
          },
        },
        xAxis: { type: 'category' as const, data: yearLabels, axisLabel: { fontSize: isMobile ? 9 : 12 } },
        yAxis: { ...yAxis, max: niceMax(maxVal * 1.05) },
        series: [{ name: 'Total', type: 'bar', data, itemStyle: { color: '#10b981' } }],
        grid,
      };
    }

    const catYearTotals: Record<string, Record<number, number>> = {};
    CATEGORY_ORDER.forEach(cat => { catYearTotals[cat] = {}; });
    filteredOrgs.forEach(o =>
      o.filings.forEach(f => {
        if (f.income != null && f.income > 0 && !f.inferred)
          catYearTotals[o.category][f.year] =
            (catYearTotals[o.category][f.year] || 0) + realUsd(f.income, o.currency, f.year);
      })
    );
    const activeCats = CATEGORY_ORDER.filter(cat => years.some(y => (catYearTotals[cat][y] || 0) > 0));
    const maxTotal = years.reduce((m, y) => {
      const s = activeCats.reduce((sum, cat) => sum + (catYearTotals[cat][y] || 0), 0);
      return Math.max(m, s);
    }, 0);
    const series = activeCats.map(cat => ({
      name: CATEGORY_DISPLAY[cat] || cat,
      type: 'bar' as const,
      stack: 'total',
      data: years.map(y => parseFloat(((catYearTotals[cat][y] || 0) / 1e6).toFixed(2))),
      itemStyle: { color: CATEGORY_COLORS[cat] },
    }));

    return {
      animation: false,
      title: isMobile ? { show: false } : { text: 'Income by Year (by Category)', left: 'center', top: 8 },
      tooltip,
      legend: legendConfig,
      xAxis: { type: 'category' as const, data: yearLabels, axisLabel: { fontSize: isMobile ? 9 : 12 } },
      yAxis: { ...yAxis, max: niceMax(maxTotal / 1e6 * 1.05) },
      series,
      grid,
    };
  }, [filteredOrgs, isMobile, chartBreakdown, showEAGrants, adjustInflation]);

  if (isLoading) {
    return (
      <>
        <Head>
          <title>Org Financials — EA Grants Database</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
        </Head>
        <main style={styles.loadingContainer}>
          <div style={styles.loadingContent}>
            <h1 style={styles.loadingTitle}>Org Financials</h1>
            <div style={styles.loadingSpinner} />
            <p style={styles.loadingText}>Loading…</p>
          </div>
        </main>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <Head>
          <title>Org Financials — EA Grants Database</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <main style={styles.loadingContainer}>
          <div style={styles.loadingContent}>
            <p style={{ color: '#ef4444', fontSize: '16px' }}>Failed to load data.</p>
            <button onClick={() => window.location.reload()} style={styles.retryButton}>Retry</button>
          </div>
        </main>
      </>
    );
  }

  const orgsWithData = filteredOrgs.filter(o => o.filings.some(f => f.income != null && f.income > 0));
  const orgsNoData = filteredOrgs.filter(o => !o.filings.some(f => f.income != null && f.income > 0));

  return (
    <>
      <Head>
        <title>Org Financials — EA Grants Database</title>
        <meta name="description" content="Annual revenue and income for EA-adjacent organizations from public financial filings" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script data-goatcounter="https://brian-foerster.goatcounter.com/count" async src="//gc.zgo.at/count.js" />
      </Head>
      <main style={{
        ...styles.main,
        padding: isPhonePortrait ? '12px 12px' : isMobile ? '16px 16px' : isTablet ? '20px 40px' : '20px 80px',
        opacity: hideForFocus ? 0 : 1,
        transition: 'opacity 0.2s ease',
      }}>
        {/* Header */}
        <header style={{ ...styles.header, minHeight: isMobile ? '196px' : '244px', padding: isMobile ? '18px 16px' : '32px 36px', marginBottom: isMobile ? '20px' : '40px' }}>
          <nav style={styles.nav}>
            <Link href="/" style={styles.navLink}>Grants Database</Link>
            <Link href="/recipients" style={{ ...styles.navLink, ...styles.navLinkActive }}>Org Financials</Link>
            <Link href="/about" style={styles.navLink}>About</Link>
          </nav>
          <h1 style={{ ...styles.title, fontSize: isPhonePortrait ? '24px' : isMobile ? '28px' : '48px' }}>
            Org Financials
          </h1>
          <p style={{ ...styles.subtitle, fontSize: isMobile ? '13px' : '18px' }}>
            Annual revenue and income for {orgs.length} EA-adjacent organizations, from IRS Form 990 (US) and UK Charity Commission filings.
          </p>
        </header>

        {/* Filters */}
        <section style={styles.section}>
          <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? '22px' : '28px' }}>Search and Filter</h2>
          <div style={{ ...styles.filtersContainer, padding: isMobile ? '12px' : '20px' }}>
            <div style={styles.searchContainer}>
              <input
                type="text"
                placeholder="Search organizations..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <div style={styles.filterMetaRow}>
              <div style={styles.resultCount}>
                {filteredOrgs.length === orgs.length
                  ? `${orgs.length} organizations`
                  : `${filteredOrgs.length} of ${orgs.length} organizations`}
              </div>
              <button type="button" onClick={clearFilters} style={styles.clearFiltersButton}>Clear all</button>
            </div>
            <div style={styles.filterAccordion}>
              <div style={styles.filterSection}>
                <button onClick={() => setExpandedFilters(p => ({ ...p, country: !p.country }))} style={styles.filterHeader}>
                  <span style={styles.filterHeaderLabel}>Country</span>
                  <span style={styles.filterHeaderIcon}>{expandedFilters.country ? '−' : '+'}</span>
                </button>
                {expandedFilters.country && (
                  <div style={styles.filterOptions}>
                    {countries.map(c => (
                      <label key={c} style={styles.filterOption}>
                        <input type="checkbox" checked={selectedCountries.includes(c)} onChange={() => toggleCountry(c)} style={styles.checkbox} />
                        {COUNTRY_DISPLAY[c] || c}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={styles.filterSection}>
                <button onClick={() => setExpandedFilters(p => ({ ...p, category: !p.category }))} style={styles.filterHeader}>
                  <span style={styles.filterHeaderLabel}>Category</span>
                  <span style={styles.filterHeaderIcon}>{expandedFilters.category ? '−' : '+'}</span>
                </button>
                {expandedFilters.category && (
                  <div style={styles.filterOptions}>
                    {categories.map(cat => (
                      <label key={cat} style={styles.filterOption}>
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(cat)}
                          onChange={() => toggleCategory(cat)}
                          style={styles.checkbox}
                        />
                        {CATEGORY_DISPLAY[cat] || cat}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Chart */}
        <section style={styles.section}>
          <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? '22px' : '28px' }}>Charts</h2>
          <div style={{
            ...styles.chartControlsRow,
            ...(isPhonePortrait ? { gap: '6px' } : {}),
          }}>
            {!isMobile && <span style={styles.breakdownLabel}>Break down by:</span>}
            <button
              onClick={() => setChartBreakdown('total')}
              style={{ ...styles.breakdownTab, ...(chartBreakdown === 'total' ? styles.breakdownTabActive : {}), ...chartTabSize }}
            >
              Total
            </button>
            <button
              onClick={() => setChartBreakdown('byCategory')}
              style={{ ...styles.breakdownTab, ...(chartBreakdown === 'byCategory' ? styles.breakdownTabActive : {}), ...chartTabSize }}
            >
              {isMobile ? 'Category' : 'By Category'}
            </button>
            <button
              onClick={() => setShowEAGrants(v => !v)}
              style={{ ...styles.breakdownTab, ...(showEAGrants ? { ...styles.breakdownTabActive, backgroundColor: '#059669', borderColor: '#059669' } : {}), ...chartTabSize, marginLeft: '8px' }}
            >
              Tracked EA Grants
            </button>
            <label style={{ ...styles.inflationToggle, marginLeft: isPhonePortrait ? '0' : '8px' }}>
              <input
                type="checkbox"
                checked={adjustInflation}
                onChange={() => setAdjustInflation(v => !v)}
                style={{ cursor: 'pointer' }}
              />
              {isMobile ? 'Inflation-adjusted' : 'Adjust for inflation (constant 2025 prices)'}
            </label>
          </div>
          <div style={{ ...styles.chartContainer, padding: isPhonePortrait ? '4px 0' : '6px 0' }}>
            {Object.keys(chartOption).length > 0 ? (
              <ReactECharts
                option={chartOption}
                notMerge={true}
                lazyUpdate={true}
                style={{ height: isPhonePortrait ? '260px' : isMobile ? '300px' : '400px', width: '100%' }}
                opts={{ renderer: 'canvas' }}
              />
            ) : (
              <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                No data for selected filters
              </div>
            )}
            <div style={{ fontSize: isMobile ? '11px' : '12px', color: '#999', fontStyle: 'italic', padding: '0 16px 8px' }}>
              Only publicly available financial filings are shown; organizations without public filings are not included, and recent years lag as filings are published. UK figures (GBP) converted using annual average exchange rates (Bank of England / FRED) for chart only; native currency shown on cards. Sources: IRS Form 990 via ProPublica · UK Charity Commission annual returns.
            </div>
          </div>
        </section>

        {/* Organizations */}
        <section style={styles.section}>
          <div style={{ ...styles.grantsHeader, ...(isMobile ? { flexDirection: 'column', alignItems: 'flex-start', gap: '10px' } : {}) }}>
            <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? '22px' : '28px', marginBottom: 0 }}>Organizations</h2>
            <button
              onClick={downloadFilteredCsv}
              style={{ ...styles.downloadButton, ...(isMobile ? { padding: '8px 12px', fontSize: '13px' } : {}) }}
            >
              Download Results CSV
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {!isPhonePortrait && <span style={styles.breakdownLabel}>Show:</span>}
            {(['income', 'expenses', 'assets', 'liabilities'] as Metric[]).map(m => {
              const active = globalMetric === m;
              const mColor = METRIC_COLORS[m];
              return (
                <button
                  key={m}
                  onClick={() => setGlobalMetric(m)}
                  style={{
                    padding: '7px 14px', fontSize: '13px', fontWeight: '600',
                    border: `1px solid ${active ? mColor : '#ddd'}`,
                    borderRadius: '4px', cursor: 'pointer',
                    backgroundColor: active ? mColor : 'white',
                    color: active ? 'white' : '#333',
                    // On phones lay the four metrics out as a balanced 2×2 grid rather
                    // than a 3-then-1 orphaned wrap.
                    ...(isPhonePortrait ? { flex: '1 1 calc(50% - 4px)' } : {}),
                  }}
                >
                  {METRIC_LABELS[m]}
                </button>
              );
            })}
            {globalMetric === 'income' && (
              <span style={{ marginLeft: isPhonePortrait ? 0 : 'auto', ...(isPhonePortrait ? { flexBasis: '100%' } : {}), fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                {[
                  { sw: GRANTS_COLOR, label: 'Total revenue' },
                  { sw: METRIC_COLORS.income, label: 'From tracked EA grants' },
                  { sw: 'linear-gradient(to top, rgba(16,185,129,0.7), rgba(16,185,129,0.04))', label: 'only EA grants available' },
                ].map(({ sw, label }) => (
                  <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ display: 'inline-block', width: '11px', height: '13px', background: sw, borderRadius: '2px', flexShrink: 0 }} />
                    {label}
                  </span>
                ))}
              </span>
            )}
          </div>
          <div style={styles.cardGrid}>
            {orgsWithData.map(org => (
              <OrgCard
                key={`${org.country}-${org.ein || org.cc_number}`}
                org={org}
                globalMinYear={globalMinYear}
                globalMaxYear={globalMaxYear}
                globalMetric={globalMetric}
                cardRef={el => { if (el) cardRefs.current.set(org.name, el); else cardRefs.current.delete(org.name); }}
                glow={glowOrg === org.name}
                adjustInflation={adjustInflation}
              />
            ))}
          </div>

          {orgsNoData.length > 0 && (
            <div style={{ marginTop: '32px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                No financial data available ({orgsNoData.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {orgsNoData.map(org => {
                  const url = orgUrl(org);
                  const color = CATEGORY_COLORS[org.category] || '#9ca3af';
                  return (
                    <div
                      key={`${org.country}-${org.ein || org.cc_number}`}
                      ref={el => { if (el) cardRefs.current.set(org.name, el); else cardRefs.current.delete(org.name); }}
                      style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', color: '#4b5563', backgroundColor: 'white', display: 'flex', gap: '8px', alignItems: 'center', scrollMarginTop: '16px' }}
                    >
                      {url
                        ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#1a202c', textDecoration: 'none' }}>{org.name}</a>
                        : org.name}
                      <span style={{ fontSize: '11px', color, fontWeight: 600 }}>{CATEGORY_DISPLAY[org.category]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <footer style={{ ...styles.footer, marginTop: isMobile ? '30px' : '60px', paddingTop: isMobile ? '20px' : '40px' }}>
          {lastUpdated && (
            <p style={styles.footerText}>
              Data last updated on {new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
          <p style={styles.footerLinks}>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={styles.footerLink}>GitHub</a>
            {' · '}
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" style={styles.footerLink}>Feedback</a>
            {' · '}
            <a href="https://brianfoerster.com" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>brianfoerster.com</a>
          </p>
        </footer>
      </main>
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  loadingContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f9fafb' },
  loadingContent: { textAlign: 'center', padding: '40px' },
  loadingTitle: { fontSize: '32px', fontWeight: 'bold', color: '#1a202c', marginBottom: '30px' },
  loadingSpinner: { width: '50px', height: '50px', border: '4px solid #e5e7eb', borderTop: '4px solid #3a6ea5', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 1s linear infinite' },
  loadingText: { fontSize: '16px', color: '#6b7280' },
  retryButton: { marginTop: '20px', padding: '12px 24px', fontSize: '16px', fontWeight: '600', color: 'white', backgroundColor: '#3a6ea5', border: 'none', borderRadius: '6px', cursor: 'pointer' },
  main: { maxWidth: '1400px', margin: '0 auto', padding: '20px 80px' },
  header: { textAlign: 'left', marginBottom: '40px', borderRadius: '16px', border: '1px solid #e5e7eb', background: 'radial-gradient(82% 150% at 95% 52%, #a7f3d0 0%, #f8fafc 88%)' },
  nav: { display: 'flex', justifyContent: 'flex-start', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' },
  navLink: { fontSize: '14px', fontWeight: '600', color: '#64748b', textDecoration: 'none', padding: '5px 10px', borderRadius: '6px' },
  navLinkActive: { color: '#0f172a', backgroundColor: 'rgba(15,23,42,0.06)' },
  title: { fontSize: '48px', fontWeight: 'bold', marginBottom: '12px', color: '#0f172a', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '18px', color: '#475569', lineHeight: '1.5', maxWidth: '720px' },
  section: { marginBottom: '40px' },
  sectionTitle: { fontSize: '28px', fontWeight: 'bold', marginBottom: '20px', color: '#1a202c' },
  filtersContainer: { backgroundColor: 'white', padding: '20px', borderRadius: '4px', border: '1px solid #e5e7eb' },
  searchContainer: { display: 'flex', gap: '10px', marginBottom: '15px' },
  searchInput: { flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '4px' },
  filterAccordion: { display: 'flex', flexDirection: 'column' },
  filterSection: { borderBottom: '1px solid #e5e7eb' },
  filterHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '20px 0', fontSize: '17px', fontWeight: '500', color: '#1a202c', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  filterHeaderLabel: { fontSize: '17px' },
  filterHeaderIcon: { fontSize: '22px', lineHeight: '1', color: '#666' },
  filterOptions: { display: 'flex', flexWrap: 'wrap', gap: '8px 20px', paddingBottom: '16px' },
  filterOption: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: '#333', cursor: 'pointer' },
  checkbox: { width: '18px', height: '18px', cursor: 'pointer', accentColor: '#3a6ea5' },
  filterMetaRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '8px', flexWrap: 'wrap' },
  resultCount: { fontSize: '13px', color: '#888', marginTop: '6px' },
  clearFiltersButton: { fontSize: '12px', fontWeight: '600', color: '#1f2937', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' },
  downloadButton: { fontSize: '14px', fontWeight: '600', color: '#111827', backgroundColor: '#f9fafb', border: '1px solid #d1d5db', borderRadius: '6px', padding: '10px 16px', cursor: 'pointer' },
  grantsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' },
  chartControlsRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
  breakdownLabel: { fontSize: '14px', color: '#666', marginRight: '4px' },
  inflationToggle: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#555', cursor: 'pointer', userSelect: 'none' },
  breakdownTab: { padding: '7px 16px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: 'white', cursor: 'pointer', color: '#333' },
  breakdownTabActive: { backgroundColor: '#1a202c', color: 'white', borderColor: '#1a202c' },
  chartContainer: { backgroundColor: 'white', padding: '6px 0', borderRadius: '4px', border: '1px solid #e5e7eb' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', alignItems: 'start' },
  orgCard: { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' },
  cardTitle: { fontSize: '16px', fontWeight: '700', color: '#1a202c', margin: '0 0 8px', lineHeight: '1.3' },
  grantTitleLink: { color: '#1a202c', textDecoration: 'none' },
  crossLink: { display: 'inline-block', fontSize: '12px', fontWeight: '600', color: '#059669', textDecoration: 'none' },
  tagColored: { display: 'inline-block', padding: '2px 8px', fontSize: '12px', fontWeight: '600', border: '1px solid', borderRadius: '3px', whiteSpace: 'nowrap' },
  footer: { marginTop: '60px', paddingTop: '40px', borderTop: '1px solid #e5e7eb', textAlign: 'center' },
  footerText: { fontSize: '14px', color: '#666', marginBottom: '10px' },
  footerLinks: { fontSize: '14px', color: '#666', marginBottom: '10px' },
  footerLink: { color: '#3a6ea5', textDecoration: 'none' },
};
