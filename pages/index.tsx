import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import MiniSearch from 'minisearch';
import ReactECharts from 'echarts-for-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { writeupKey } from '../lib/writeup-key';

// Build timestamp for cache busting (set at build time)
const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_TIME || Date.now().toString();

// Base path for deployment (set via NEXT_PUBLIC_BASE_PATH when needed)
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Normalize an org name for matching a regrant's upstream grants (`regrant_of`)
// against recipients present in the current view.
const normalizeRegrantName = (name: string): string =>
  String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

interface MinGrant {
  id: string;
  title: string;
  blurb?: string;
  recipient: string;
  amount: number;
  currency: string;
  date: string;
  grantmaker: string;
  category?: string;
  sub_category?: string;
  fund?: string;
  focus_area?: string;
  url?: string;
  description?: string;
  is_residual?: boolean;
  regrant?: boolean;
  regrant_of?: string[];
}

interface Metadata {
  totalGrants: number;
  totalAmount: number;
  grantmakers: string[];
  categories: string[];
  subCategories?: { id: string; label: string; category: string }[];
  dateRange: {
    earliest: string;
    latest: string;
  };
  lastUpdated: string;
}

// Fixed display order for the Sub-Category filter, frozen from the relevance (grant-count)
// ranking so data refreshes don't reshuffle it. New sub-categories not listed here fall to
// the end of their group. Within each group the "…(unspecified)" bucket is forced first.
const SUBCATEGORY_ORDER = [
  'ltxr-ai-tech', 'ltxr-gcr', 'ltxr-ai-general', 'ltxr-bio', 'ltxr-general', 'ltxr-ai-gov', 'ltxr-nuclear',
  'aw-movement', 'aw-fish', 'aw-general', 'aw-broiler', 'aw-cagefree', 'aw-altprotein', 'aw-wild',
  'gh-general', 'gh-rnd', 'gh-malaria', 'gh-nutrition', 'gh-policy', 'gh-vaccines', 'gh-lead', 'gh-deworming', 'gh-air', 'gh-cash',
  'meta-community', 'meta-giving', 'meta-forecasting', 'meta-careers', 'meta-research', 'meta-general',
  'other-general', 'other-infectious', 'other-climate',
  'science-basic', 'science-general', 'science-tools',
];

interface RowHelpers {
  getGrantUrl: (grant: MinGrant) => string | undefined;
  formatCurrency: (amount: number) => string;
  GRANTMAKER_COLORS: { [key: string]: string };
  categoryColorMap: { [key: string]: string };
  shortCategory: (code?: string) => string;
  displayCategory: (code?: string) => string;
  displayGrantmaker: (name: string) => string;
  toggleGrantExpanded: (grantId: string) => void;
}

interface GrantRowProps {
  grant: MinGrant;
  isMobile: boolean;
  expanded: boolean;
  financialsOrg: string | undefined;
  expandedLabelStyle: React.CSSProperties;
  helpers: RowHelpers;
}

// Grantee links that describe the PERSON, not the funded project — a BlueDot grant only
// links through when the destination could actually tell you about the work, so these
// profile/social/aggregator hosts are treated as "no link".
function isLowValueProfileLink(url?: string): boolean {
  if (!url) return false;
  let host: string;
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return false; }
  const BAD = new Set([
    'linkedin.com', 'x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'threads.net',
    'scholar.google.com', 'orcid.org', 'researchgate.net', 'linktr.ee', 'bio.link', 'beacons.ai', 'about.me',
  ]);
  return BAD.has(host) || host.endsWith('.linkedin.com');
}

// Memoized so that scrolling — which re-renders the parent every frame —
// only re-renders rows whose props actually changed (newly mounted rows and
// the one being expanded/collapsed), not every visible row.
const GrantRow = memo(function GrantRow({
  grant, isMobile, expanded, financialsOrg, expandedLabelStyle, helpers,
}: GrantRowProps) {
  const {
    getGrantUrl, formatCurrency, GRANTMAKER_COLORS, categoryColorMap,
    shortCategory, displayCategory, displayGrantmaker, toggleGrantExpanded,
  } = helpers;

  // One consolidated description (computeBlurb in build-data collapses the overlapping
  // title/description fields into a single clean blurb). Falls back to title for any data
  // that predates the blurb field. Desktop clamps it to 2 lines with a toggle; the toggle
  // shows (and hooks run) only when it actually overflows. Hooks run unconditionally,
  // before the mobile early-return, so hook order stays stable if a row changes layout.
  const blurb = (grant.blurb ?? grant.title ?? '').trim();
  const hasDesc = !!(blurb && blurb !== grant.recipient);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [descOverflows, setDescOverflows] = useState(false);
  useEffect(() => {
    const el = descRef.current;
    if (el && !expanded) setDescOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [expanded, grant.id, hasDesc]);
  const canExpand = descOverflows || expanded;

  // Clicking the grant (its recipient/title) already goes to getGrantUrl(grant), so a
  // "View on {grantmaker}" panel link would always point to the same place — omit it.
  // The expand panel only carries the org-financials cross-link (a different destination).
  const url = getGrantUrl(grant);

  if (isMobile) {
    return (
      <div
        style={styles.grantRowMobile}
        onClick={() => toggleGrantExpanded(grant.id)}
      >
        <div style={styles.grantMobileTop}>
          <h3 style={styles.grantTitle}>
            {(() => {
              const url = getGrantUrl(grant);
              return url
                ? <a href={url} target="_blank" rel="noopener noreferrer" style={styles.grantTitleLink} onClick={e => e.stopPropagation()}>{grant.recipient}</a>
                : grant.recipient;
            })()}
          </h3>
          <div style={styles.grantMobileAmount}>{formatCurrency(grant.amount)}</div>
        </div>
        {hasDesc && (
          <p style={styles.grantDesc}>{blurb}</p>
        )}
        <div style={styles.grantMobileMeta}>
          <span style={{
            ...styles.tagTiny,
            borderColor: GRANTMAKER_COLORS[grant.grantmaker] || '#666',
            color: GRANTMAKER_COLORS[grant.grantmaker] || '#666',
          }}>{grant.grantmaker}</span>
          {grant.category && (
            <span style={{
              ...styles.tagTiny,
              borderColor: categoryColorMap[grant.category] || '#999',
              color: categoryColorMap[grant.category] || '#999',
            }}>{shortCategory(grant.category)}</span>
          )}
          <span style={styles.grantMobileDate}>{format(parseISO(grant.date), 'MM/yyyy')}</span>
          <span style={styles.expandIndicator}>{expanded ? '▲' : '▼'}</span>
        </div>
        {expanded && (
          <div style={styles.grantMobileExpanded}>
            <div style={styles.expandedRow}>
              <span style={{ ...styles.expandedLabel, ...expandedLabelStyle }}>Grantmaker:</span>
              <span>{grant.grantmaker}</span>
            </div>
            {grant.fund && (
              <div style={styles.expandedRow}>
                <span style={{ ...styles.expandedLabel, ...expandedLabelStyle }}>Fund:</span>
                <span>{grant.fund}</span>
              </div>
            )}
            <div style={styles.expandedRow}>
              <span style={{ ...styles.expandedLabel, ...expandedLabelStyle }}>Category:</span>
              <span>{displayCategory(grant.category)}</span>
            </div>
            <div style={styles.expandedRow}>
              <span style={{ ...styles.expandedLabel, ...expandedLabelStyle }}>Date:</span>
              <span>{format(parseISO(grant.date), 'MMMM d, yyyy')}</span>
            </div>
            {hasDesc && (
              <div style={styles.expandedDescRow}>
                <span style={{ ...styles.expandedLabel, ...expandedLabelStyle }}>Description:</span>
                <span style={styles.expandedDescText}>{blurb}</span>
              </div>
            )}
            {financialsOrg && (
              <div style={styles.expandedRow}>
                <a
                  href={`${BASE_PATH}/recipients?org=${encodeURIComponent(financialsOrg)}`}
                  style={styles.expandedLink}
                  onClick={e => e.stopPropagation()}
                >
                  View org financials →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ ...styles.grantRowWrap, ...(canExpand ? { cursor: 'pointer' } : {}) }}
      onClick={canExpand ? () => toggleGrantExpanded(grant.id) : undefined}
    >
      <div style={styles.grantRow}>
        <div style={styles.grantLeft}>
          <h3 style={styles.grantTitle}>
            {url
              ? <a href={url} target="_blank" rel="noopener noreferrer" style={styles.grantTitleLink} onClick={e => e.stopPropagation()}>{grant.recipient}</a>
              : grant.recipient}
          </h3>
          {hasDesc && (
            <div style={styles.grantDescLine}>
              <p ref={descRef} style={expanded ? styles.grantDescFull : styles.grantDescClamp}>{blurb}</p>
              {canExpand && (
                <span style={styles.grantExpandArrow}>{expanded ? '▲' : '▼'}</span>
              )}
            </div>
          )}
          {financialsOrg && !expanded && (
            <a href={`${BASE_PATH}/recipients?org=${encodeURIComponent(financialsOrg)}`} style={styles.crossLink} onClick={e => e.stopPropagation()}>
              View org financials →
            </a>
          )}
        </div>
        <div style={styles.grantFunderCol}>
          <span style={{
            ...styles.tagColored,
            borderColor: GRANTMAKER_COLORS[grant.grantmaker] || '#666',
            color: GRANTMAKER_COLORS[grant.grantmaker] || '#666',
          }}>{displayGrantmaker(grant.grantmaker)}</span>
          {grant.fund && (
            <span style={{
              ...styles.subTag,
              borderColor: (GRANTMAKER_COLORS[grant.grantmaker] || '#666') + 'aa',
              color: GRANTMAKER_COLORS[grant.grantmaker] || '#666',
            }}>{grant.fund === 'EA Infrastructure Fund' ? 'Infrastructure Fund' : grant.fund}</span>
          )}
        </div>
        <div />
        <div style={styles.grantCategoryCol}>
          {grant.category && (
            <span style={{
              ...styles.tagColored,
              borderColor: categoryColorMap[grant.category] || '#999',
              color: categoryColorMap[grant.category] || '#999',
            }}>{displayCategory(grant.category)}</span>
          )}
        </div>
        <div style={styles.grantAmountCol}>{formatCurrency(grant.amount)}</div>
        <div style={styles.grantDateCol}>{format(parseISO(grant.date), 'MM/dd/yyyy')}</div>
      </div>
      {expanded && financialsOrg && (
        <div style={styles.grantDesktopExpanded}>
          <div style={styles.grantExpandedLinks}>
            <a href={`${BASE_PATH}/recipients?org=${encodeURIComponent(financialsOrg)}`} style={styles.expandedLink} onClick={e => e.stopPropagation()}>
              View org financials →
            </a>
          </div>
        </div>
      )}
    </div>
  );
});

/** Top-level "Select All / Deselect All" button (rendered inline in the header). */
function SelectAllButton<T extends string | number>({ all, selected, onChange }: {
  all: T[]; selected: T[]; onChange: (next: T[]) => void;
}) {
  const allOn = all.length > 0 && all.every(v => selected.includes(v));
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(allOn ? [] : [...all]); }}
      style={{ ...styles.selectAllButtonTop, ...(allOn ? styles.selectAllButtonActive : {}) }}
    >
      {allOn ? 'Deselect All' : 'Select All'}
    </button>
  );
}

export default function Home() {
  // Data loading state
  const [grants, setGrants] = useState<MinGrant[]>([]);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [orgIndex, setOrgIndex] = useState<{ name: string; grant_names: string[] }[]>([]);
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState('Loading...');
  const [loadError, setLoadError] = useState(false);
  const fetchAttempted = useRef(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrantmakers, setSelectedGrantmakers] = useState<string[]>([]);
  const [selectedFunds, setSelectedFunds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [expandedFilters, setExpandedFilters] = useState<{ [key: string]: boolean }>({});
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'grantmaker' | 'recipient' | 'category'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [miniSearch, setMiniSearch] = useState<MiniSearch | null>(null);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [chartView, setChartView] = useState<'year' | 'month'>('year');
  const [timeBreakdown, setTimeBreakdown] = useState<'total' | 'byFunder' | 'byCategory'>('total');
  const [adjustInflation, setAdjustInflation] = useState(false);
  // Constant initial value so server and first client render agree (no hydration
  // mismatch); the effect sets the real width immediately after mount.
  const [windowWidth, setWindowWidth] = useState(400);
  const [expandedGrants, setExpandedGrants] = useState<Set<string>>(new Set());
  const [hoverTooltip, setHoverTooltip] = useState<{ text: string; visible: boolean }>({ text: '', visible: false });
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const parentRef = useRef<HTMLDivElement>(null);
  const grantsSectionRef = useRef<HTMLElement>(null);
  const didScrollToList = useRef(false);

  // Detect viewport width for responsive layout
  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Remove legacy cache-bust query param without reloading
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('v')) {
      url.searchParams.delete('v');
      const next = url.pathname + url.search + url.hash;
      window.history.replaceState({}, '', next);
    }
  }, []);

  // Deep link: hydrate filter/sort state from the URL so a filtered view is shareable.
  // Read (not the useState initializer) to keep server and first client render identical.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const csv = (k: string) => { const v = p.get(k); return v ? v.split(',').filter(Boolean) : null; };
    const org = p.get('org'); if (org) setOrgFilter(org);
    const q = p.get('q'); if (q) setSearchTerm(q);
    const gm = csv('gm'); if (gm) setSelectedGrantmakers(gm);
    const fund = csv('fund'); if (fund) setSelectedFunds(fund);
    const cat = csv('cat'); if (cat) setSelectedCategories(cat);
    const subcat = csv('subcat'); if (subcat) setSelectedSubCategories(subcat);
    const yr = csv('yr'); if (yr) setSelectedYears(yr.map(Number).filter(n => !Number.isNaN(n)));
    const min = p.get('min'); if (min) setAmountMin(min);
    const max = p.get('max'); if (max) setAmountMax(max);
    const sort = p.get('sort');
    if (sort && ['date', 'amount', 'grantmaker', 'recipient', 'category'].includes(sort)) setSortBy(sort as typeof sortBy);
    const dir = p.get('dir'); if (dir === 'asc' || dir === 'desc') setSortOrder(dir);
  }, []);

  // Reflect the current filter/sort state back into the URL (shareable / bookmarkable).
  // Skip the first run so we never clobber the incoming URL before the reader above applies.
  const urlSyncReady = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!urlSyncReady.current) { urlSyncReady.current = true; return; }
    const p = new URLSearchParams();
    if (orgFilter) p.set('org', orgFilter);
    if (searchTerm) p.set('q', searchTerm);
    if (selectedGrantmakers.length) p.set('gm', selectedGrantmakers.join(','));
    if (selectedFunds.length) p.set('fund', selectedFunds.join(','));
    if (selectedCategories.length) p.set('cat', selectedCategories.join(','));
    if (selectedSubCategories.length) p.set('subcat', selectedSubCategories.join(','));
    if (selectedYears.length) p.set('yr', selectedYears.join(','));
    if (amountMin) p.set('min', amountMin);
    if (amountMax) p.set('max', amountMax);
    if (sortBy !== 'date') p.set('sort', sortBy);
    if (sortOrder !== 'desc') p.set('dir', sortOrder);
    const qs = p.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
  }, [orgFilter, searchTerm, selectedGrantmakers, selectedFunds, selectedCategories, selectedSubCategories, selectedYears, amountMin, amountMax, sortBy, sortOrder]);

  // ...and scroll the grants list into view once it's rendered (one time).
  useEffect(() => {
    if (!orgFilter || didScrollToList.current || isLoading) return;
    const el = grantsSectionRef.current;
    if (!el) return;
    didScrollToList.current = true;
    el.scrollIntoView({ block: 'start' });
  }, [orgFilter, isLoading]);

  // Responsive breakpoints
  const isPhonePortrait = windowWidth < 480;
  const isPhoneLandscape = windowWidth >= 480 && windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const isMobile = windowWidth < 768;

  // Uniform sizing for all chart-control tabs, shrinking together on smaller
  // screens so they stay on one row as long as reasonable.
  const chartTabSize = isPhonePortrait
    ? { padding: '8px 12px', fontSize: '13px' }
    : isMobile
    ? { padding: '9px 15px', fontSize: '14px' }
    : { padding: '10px 17px', fontSize: '15px' };
  const isCompact = windowWidth < 1024;
  const canOverlayChartTotal = !isMobile && windowWidth >= 1200;
  const shouldAlignExpandedLabels = isMobile && windowWidth >= 360;
  const expandedLabelWidth = shouldAlignExpandedLabels
    ? Math.min(90, Math.max(60, Math.round(windowWidth * 0.22)))
    : 0;
  // Memoized so it stays referentially stable across scroll renders (keeps the
  // memoized GrantRow from re-rendering every frame).
  const expandedLabelStyle = useMemo<React.CSSProperties>(
    () => shouldAlignExpandedLabels
      ? { minWidth: expandedLabelWidth, flexBasis: expandedLabelWidth, flexShrink: 0 }
      : {},
    [shouldAlignExpandedLabels, expandedLabelWidth]
  );

  // Fetch data client-side only
  useEffect(() => {
    // Prevent double fetch in React strict mode or re-renders
    if (fetchAttempted.current) return;
    fetchAttempted.current = true;

    const fetchData = async () => {
      try {
        setLoadingProgress('Loading grants data...');
        const grantsRes = await fetch(`${BASE_PATH}/data/grants.min.json?v=${BUILD_VERSION}`);
        if (!grantsRes.ok) {
          throw new Error(`Failed to fetch grants: ${grantsRes.status}`);
        }
        const grantsData = await grantsRes.json();
        if (!Array.isArray(grantsData)) {
          throw new Error('Invalid grants data format');
        }

        // Merge manually identified per-grant writeup links (mostly archived Open
        // Phil grant pages). Keyed by a stable recipient|amount|month content key,
        // not grant id, so re-scrapes that reassign ids don't misalign them — see
        // lib/writeup-key.ts.
        try {
          const wRes = await fetch(`${BASE_PATH}/data/grant-writeups.json?v=${BUILD_VERSION}`);
          if (wRes.ok) {
            const writeups: Record<string, string> = await wRes.json();
            grantsData.forEach((g: MinGrant) => {
              const wk = writeupKey(g.recipient, g.amount, g.date);
              if (writeups[wk]) g.url = writeups[wk];
            });
          }
        } catch {
          /* writeup links are an optional enhancement */
        }

        setGrants(grantsData);

        setLoadingProgress('Loading metadata...');
        const metaRes = await fetch(`${BASE_PATH}/data/metadata.json?v=${BUILD_VERSION}`);
        if (!metaRes.ok) {
          throw new Error(`Failed to fetch metadata: ${metaRes.status}`);
        }
        const metaData = await metaRes.json();
        setMetadata(metaData);

        // Org financials index — used to cross-link grants to org cards.
        // Optional enhancement: a failure here must not break the grants page.
        try {
          const orgsRes = await fetch(`${BASE_PATH}/data/recipient-orgs.json?v=${BUILD_VERSION}`);
          if (orgsRes.ok) {
            const orgsData = await orgsRes.json();
            setOrgIndex(
              (orgsData.orgs || []).map((o: { name: string; grant_names?: string[] }) => ({
                name: o.name,
                grant_names: o.grant_names || [],
              }))
            );
          }
        } catch {
          /* cross-linking disabled if org data unavailable */
        }

        setLoadingProgress('Building search index...');
        // Build search index client-side (saves 2.5MB download)
        const ms = new MiniSearch({
          fields: ['title', 'recipient', 'description', 'category', 'grantmaker'],
          storeFields: ['id'],
          searchOptions: {
            boost: { title: 2, recipient: 1.5, description: 1 },
            fuzzy: 0,
            prefix: true,
          }
        });
        ms.addAll(grantsData);
        setMiniSearch(ms);

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load data:', err);
        setLoadError(true);
        setLoadingProgress(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    fetchData();
  }, []);

  // Perform search
  useEffect(() => {
    if (!miniSearch || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    
    const results = miniSearch.search(searchTerm, { combineWith: 'AND' });
    setSearchResults(results.map(r => r.id).slice(0, 1000));
  }, [miniSearch, searchTerm]);

  const getYearFromDate = (dateString: string): number => {
    if (dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return parseInt(dateString.slice(0, 4), 10);
    }
    const d = new Date(dateString);
    return d.getFullYear();
  };

  const getYearMonthFromDate = (dateString: string): { year: string; yearMonth: string } => {
    if (dateString && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const year = dateString.slice(0, 4);
      const month = dateString.slice(5, 7);
      return { year, yearMonth: `${year}-${month}` };
    }
    const d = new Date(dateString);
    const year = d.getFullYear().toString();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return { year, yearMonth: `${year}-${month}` };
  };

  // Cross-link maps between grant recipients and org financial cards
  const { recipientToOrg, orgGrantNameSet } = useMemo(() => {
    const r2o = new Map<string, string>();
    const ogn = new Map<string, Set<string>>();
    orgIndex.forEach(o => {
      const set = new Set<string>();
      o.grant_names.forEach(gn => {
        const key = gn.toLowerCase();
        set.add(key);
        r2o.set(key, o.name);
      });
      ogn.set(o.name, set);
    });
    return { recipientToOrg: r2o, orgGrantNameSet: ogn };
  }, [orgIndex]);

  // Filter and sort grants
  const filteredAndSortedGrants = useMemo(() => {
    let filtered = grants;

    // Restrict to a single org's grants (deep link from an org card)
    if (orgFilter) {
      const set = orgGrantNameSet.get(orgFilter);
      filtered = set
        ? filtered.filter(g => set.has(g.recipient.toLowerCase()))
        : filtered.filter(g => g.recipient.toLowerCase().includes(orgFilter.toLowerCase()));
    }

    // Apply search filter
    if (searchTerm.trim()) {
      if (searchResults.length === 0) {
        filtered = [];
      } else {
        const resultIds = new Set(searchResults);
        filtered = filtered.filter(grant => resultIds.has(grant.id));
      }
    }

    // Apply filters: AND between groups, OR within groups
    // Group 1 (Source): Grantmaker + Fund — OR within
    // Group 2 (Topic): Category + Sub-category — OR within
    // Between groups: AND
    const hasGmFilter = selectedGrantmakers.length > 0;
    const hasFundFilter = selectedFunds.length > 0;
    const hasCatFilter = selectedCategories.length > 0;
    const hasSubCatFilter = selectedSubCategories.length > 0;
    const hasSourceFilter = hasGmFilter || hasFundFilter;
    const hasTopicFilter = hasCatFilter || hasSubCatFilter;

    filtered = filtered.filter(grant => {
      const matchesSubCat = hasSubCatFilter && !!grant.sub_category && selectedSubCategories.includes(grant.sub_category);

      // --- Source group (Grantmaker / Fund) ---
      let passesSource: boolean;
      if (hasSourceFilter) {
        const matchesGm = hasGmFilter && selectedGrantmakers.includes(grant.grantmaker);
        const matchesFund = hasFundFilter && !!grant.fund && selectedFunds.includes(grant.fund);

        if (matchesFund) {
          passesSource = true;
        } else if (matchesGm) {
          // If user also selected specific funds for this grantmaker, only show those
          const grantmakerHasSelectedFunds = hasFundFilter && selectedFunds.some(f => {
            const fundGrant = grants.find(g => g.fund === f);
            return fundGrant && fundGrant.grantmaker === grant.grantmaker;
          });
          if (grantmakerHasSelectedFunds) {
            passesSource = !!grant.fund && selectedFunds.includes(grant.fund);
          } else {
            passesSource = true;
          }
        } else {
          passesSource = false;
        }
      } else {
        passesSource = true;
      }

      // --- Topic group (Category / Sub-category) — OR within ---
      let passesTopic: boolean;
      if (hasTopicFilter) {
        const matchesCat = hasCatFilter && !!grant.category && selectedCategories.includes(grant.category);
        passesTopic = matchesCat || matchesSubCat;
      } else {
        passesTopic = true;
      }

      return passesSource && passesTopic;
    });

    // Apply year filter
    if (selectedYears.length > 0) {
      filtered = filtered.filter(grant => selectedYears.includes(getYearFromDate(grant.date)));
    }

    // Apply amount filter
    const minAmt = amountMin ? parseFloat(amountMin) : null;
    const maxAmt = amountMax ? parseFloat(amountMax) : null;
    if (minAmt != null && !isNaN(minAmt)) {
      filtered = filtered.filter(grant => grant.amount >= minAmt);
    }
    if (maxAmt != null && !isNaN(maxAmt)) {
      filtered = filtered.filter(grant => grant.amount <= maxAmt);
    }

    // Sort grants
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortBy === 'amount') {
        cmp = a.amount - b.amount;
      } else if (sortBy === 'grantmaker') {
        cmp = a.grantmaker.localeCompare(b.grantmaker)
          || (a.fund || '').localeCompare(b.fund || '');
      } else if (sortBy === 'recipient') {
        cmp = a.recipient.localeCompare(b.recipient);
      } else if (sortBy === 'category') {
        cmp = (a.category || '').localeCompare(b.category || '');
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [grants, orgFilter, orgGrantNameSet, searchTerm, searchResults, selectedGrantmakers, selectedFunds, selectedCategories, selectedSubCategories, selectedYears, amountMin, amountMax, sortBy, sortOrder]);

  const fundsByGrantmaker = useMemo(() => {
    const gmDisplayNames: Record<string, string> = {
      'EA Funds': 'Effective Altruism Funds',
      'SFF': 'Survival and Flourishing Fund',
      'ACE': 'Animal Charity Evaluators',
    };
    const byGm: Record<string, Set<string>> = {};
    grants.forEach(g => {
      if (g.fund) {
        if (!byGm[g.grantmaker]) byGm[g.grantmaker] = new Set();
        byGm[g.grantmaker].add(g.fund);
      }
    });
    // Convert to sorted arrays and sort grantmakers by their display name
    const result: { grantmaker: string; displayName: string; funds: string[] }[] = [];
    for (const gm of Object.keys(byGm).sort()) {
      result.push({
        grantmaker: gm,
        displayName: gmDisplayNames[gm] || gm,
        funds: Array.from(byGm[gm]).sort(),
      });
    }
    return result;
  }, [grants]);


  const availableYears = useMemo(() => {
    const years = new Set(grants.map(g => new Date(g.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [grants]);

  const toggleFilter = (filterName: string) => {
    setExpandedFilters(prev => ({ ...prev, [filterName]: !prev[filterName] }));
  };

  const toggleGrantmaker = (gm: string) => {
    setSelectedGrantmakers(prev =>
      prev.includes(gm) ? prev.filter(g => g !== gm) : [...prev, gm]
    );
  };

  const toggleFund = (fund: string) => {
    setSelectedFunds(prev =>
      prev.includes(fund) ? prev.filter(f => f !== fund) : [...prev, fund]
    );
  };

  const selectAllFundsForGrantmaker = (grantmaker: string, funds: string[]) => {
    // Check if all funds are already selected
    const allSelected = funds.every(f => selectedFunds.includes(f));
    if (allSelected) {
      // Deselect all funds from this grantmaker
      setSelectedFunds(prev => prev.filter(f => !funds.includes(f)));
    } else {
      // Select all funds from this grantmaker
      setSelectedFunds(prev => [...new Set([...prev, ...funds])]);
    }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleSubCategory = (id: string) => {
    setSelectedSubCategories(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const selectAllSubsForCategory = (ids: string[]) => {
    setSelectedSubCategories(prev => {
      const allSelected = ids.every(id => prev.includes(id));
      return allSelected ? prev.filter(id => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
    });
  };

  // Sub-categories that actually occur in the data, grouped under their L1 category.
  // Order is frozen (SUBCATEGORY_ORDER) so data refreshes don't reshuffle it; within each
  // group the "…(unspecified)" bucket is forced first, then the frozen order, then any new
  // (unlisted) sub-categories by count. Groups follow the frozen order too.
  const subCategoriesByCategory = useMemo(() => {
    if (!metadata?.subCategories) return [] as { category: string; subs: { id: string; label: string; count: number }[] }[];
    const counts = new Map<string, number>();
    for (const g of grants) if (g.sub_category) counts.set(g.sub_category, (counts.get(g.sub_category) || 0) + 1);
    const rank = (id: string) => { const i = SUBCATEGORY_ORDER.indexOf(id); return i === -1 ? Number.MAX_SAFE_INTEGER : i; };
    const isGeneral = (id: string) => id.endsWith('-general');
    const byCat = new Map<string, { id: string; label: string; count: number }[]>();
    for (const s of metadata.subCategories) {
      const count = counts.get(s.id) || 0;
      if (!count) continue;
      if (!byCat.has(s.category)) byCat.set(s.category, []);
      byCat.get(s.category)!.push({ id: s.id, label: s.label, count });
    }
    return Array.from(byCat.entries())
      .map(([category, subs]) => ({
        category,
        subs: subs.sort((a, b) =>
          (Number(isGeneral(b.id)) - Number(isGeneral(a.id))) || (rank(a.id) - rank(b.id)) || (b.count - a.count)),
        order: Math.min(...subs.map(s => rank(s.id))),
      }))
      .sort((a, b) => a.order - b.order);
  }, [metadata, grants]);

  const toggleYear = (year: number) => {
    setSelectedYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
  };

  const csvEscape = (value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const downloadFilteredCsv = () => {
    const headers = [
      'id',
      'title',
      'recipient',
      'amount',
      'currency',
      'date',
      'grantmaker',
      'category',
      'sub_category',
      'fund',
      'url',
      'description',
      'is_residual',
    ];

    const rows = filteredAndSortedGrants.map(g => ([
      g.id,
      g.title,
      g.recipient,
      g.amount,
      g.currency,
      g.date,
      g.grantmaker,
      g.category || '',
      g.fund || '',
      g.url || '',
      g.description || '',
      g.is_residual ? 'true' : '',
    ]));

    const csv = [
      headers.map(csvEscape).join(','),
      ...rows.map(row => row.map(csvEscape).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = format(new Date(), 'yyyy-MM-dd');
    link.href = url;
    link.download = `ea-grants-filtered-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedGrantmakers([]);
    setSelectedFunds([]);
    setSelectedCategories([]);
    setSelectedSubCategories([]);
    setSelectedYears([]);
    setAmountMin('');
    setAmountMax('');
  };

  const toggleGrantExpanded = (grantId: string) => {
    setExpandedGrants(prev => {
      const next = new Set(prev);
      if (next.has(grantId)) {
        next.delete(grantId);
      } else {
        next.add(grantId);
      }
      return next;
    });
  };

  // Color constants
  const CHART_COLORS = [
    '#3a6ea5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
    '#9ca3af',
  ];

  // Grantmaker colors. Funders that work in a single cause area echo that cause's
  // color (see CATEGORY_COLORS); diversified funders and the crowded LTXR space
  // use distinct brand-ish colors that deliberately avoid the cause palette.
  // Funder colour encodes the cause area that funder concentrates on: each sits in the
  // hue family of its dominant category, stepped within the family so the pairs that sit
  // next to each other in the stacked chart stay separable. Funders with no dominant
  // cause take deliberately desaturated neutrals — "funds across the board".
  //
  // Validated (dataviz six-checks, light surface, adjacent pairlist): worst adjacent
  // CVD ΔE 10.8, normal-vision ΔE 16.5, all inside the L 0.43–0.77 band. The neutrals and
  // the shared muted clay sit below the chroma floor on purpose — low chroma is itself the
  // signal ("no single cause" / "minor funder") — and the grantmaker name is written in
  // every tag, so colour reinforces identity rather than carrying it alone.
  const GRANTMAKER_COLORS: { [key: string]: string } = {
    // ── Global Health (emerald) ──
    'GiveWell': '#10b981',              // 100% GH
    // ── Animal Welfare (violet) ──
    'ACE': '#8b5cf6',                   // 100% AW
    'Navigation Fund': '#6d28d9',       // 77% AW
    // ── EA Meta (cyan) ──
    'Meta Charity Funders': '#06b6d4',  // 100% Meta
    // ── Other / unspecified cause (steel blue) ──
    'Founders Pledge': '#3a6ea5',       // Other-dominant: 990 residuals + Climate Fund (largest itemized fund)
    // ── Long-Term & Existential Risk (warm family) ──
    // The three major LTXR funders get a dark→light amber ramp; they are mutually
    // separable under all-pairs testing (CVD ΔE 10.3, normal-vision 15.5).
    'BlueDot Impact': '#9a3412',        // 100% LTXR
    'SFF': '#ea580c',                   // 100% LTXR
    'Manifund': '#f59e0b',              // 93% LTXR
    // The minor LTXR funders share one muted clay: still warm (so the cause reads),
    // but desaturated to say "small share" rather than competing for amber space.
    'FLI': '#a3907c',                   // 100% LTXR (76 grants)
    'The Audacious Project': '#a3907c', // 100% LTXR (2 grants)
    'OpenAI Foundation': '#a3907c',     // 100% LTXR (1 grant)
    'Sentinel Bio': '#a3907c',          // 100% LTXR (biosecurity)
    'CLR Fund': '#a3907c',              // 100% LTXR (s-risks)
    // ── Diversified / no dominant cause (intentional neutrals) ──
    'Coefficient Giving': '#475569',    // LTXR only 45% of $ — funds every cause
    'EA Funds': '#9ca3af',              // GH 28% of $ / LTXR 40% of grants
    'ACX Grants': '#6b7280',            // 63% "Other" — mixed small grants
  };

  // Fixed per-cause palette, matching the org-financials database so a funder's
  // cause-tied color lines up with its category color across both databases.
  const CATEGORY_COLORS: Record<string, string> = {
    GH: '#10b981', LTXR: '#f59e0b', AW: '#8b5cf6', Meta: '#06b6d4',
    Science: '#14b8a6', Policy: '#ef4444', Other: '#3a6ea5',
  };

  const CATEGORY_DISPLAY: Record<string, string> = {
    'LTXR': 'Long-Term & Existential Risk',
    'GH': 'Global Health & Development',
    'AW': 'Animal Welfare',
    'Meta': 'EA Community & Infrastructure',
    'Science': 'Scientific Research',
    'Other': 'Other',
  };

  const GRANTMAKER_DISPLAY: Record<string, string> = {
    'EA Funds': 'Effective Altruism Funds',
    'SFF': 'Survival and Flourishing Fund',
    'ACE': 'Animal Charity Evaluators',
    'FLI': 'Future of Life Institute',
    'Macroscopic': 'Macroscopic Ventures',
  };

  const displayCategory = (code?: string): string => code ? (CATEGORY_DISPLAY[code] || code) : '';
  const displayGrantmaker = (name: string): string => GRANTMAKER_DISPLAY[name] || name;

  // Short names for mobile display
  const CATEGORY_SHORT: Record<string, string> = {
    'LTXR': 'LTXR',
    'GH': 'Global Health',
    'AW': 'Animal Welfare',
    'Meta': 'EA Infra',
    'Science': 'Science',
    'Other': 'Other',
  };
  const shortCategory = (code?: string): string => code ? (CATEGORY_SHORT[code] || CATEGORY_DISPLAY[code] || code) : '';

  // Shorten long fund names for mobile
  const shortFund = (fund: string): string => {
    if (fund === 'EA Infrastructure Fund') return 'Infra Fund';
    if (fund === 'Global Health & Development') return 'GH&D';
    if (fund === 'Global Health & Development Fund') return 'GH&D Fund';
    if (fund === 'Long-Term Future Fund') return 'LT Future';
    if (fund === 'Animal Welfare Fund') return 'AW Fund';
    if (fund === 'All Grants Fund') return 'All Grants';
    if (fund === 'Board Designated') return 'Board';
    if (fund.includes('Coefficient Giving')) return 'Coefficient';
    if (fund.length > 20) return fund.slice(0, 18) + '...';
    return fund;
  };

  const isBrokenCoefficientGrantUrl = (url?: string): boolean => {
    if (!url) return false;
    return /^https?:\/\/coefficientgiving\.org\/grants\//i.test(url);
  };

  const getCoefficientFallbackUrl = (grant: MinGrant): string => {
    const focus = (grant.fund || grant.focus_area || '').trim();
    if (focus) {
      const COEFFICIENT_FUND_URLS: Record<string, string> = {
        'Navigating Transformative AI': 'https://coefficientgiving.org/funds/navigating-transformative-ai',
        'Potential Risks from Advanced Artificial Intelligence': 'https://coefficientgiving.org/funds/navigating-transformative-ai',
        'Global Catastrophic Risks': 'https://coefficientgiving.org/funds/global-catastrophic-risks-opportunities/',
        'Global Catastrophic Risks Opportunities': 'https://coefficientgiving.org/funds/global-catastrophic-risks-opportunities/',
        'Global Catastrophic Risks Capacity Building': 'https://coefficientgiving.org/funds/global-catastrophic-risks-opportunities/',
        'Biosecurity & Pandemic Preparedness': 'https://coefficientgiving.org/funds/biosecurity-pandemic-preparedness/',
        'Biosecurity and Pandemic Preparedness': 'https://coefficientgiving.org/funds/biosecurity-pandemic-preparedness/',
        'Science Supporting Biosecurity': 'https://coefficientgiving.org/funds/biosecurity-pandemic-preparedness/',
        'Science Supporting Biosecurity and Pandemic Preparedness': 'https://coefficientgiving.org/funds/biosecurity-pandemic-preparedness/',
        'Farm Animal Welfare': 'https://coefficientgiving.org/funds/farm-animal-welfare/',
        'Farm Animal Welfare in Asia': 'https://coefficientgiving.org/funds/farm-animal-welfare/',
        'Broiler Chicken Welfare': 'https://coefficientgiving.org/funds/farm-animal-welfare/',
        'Cage-Free Reforms': 'https://coefficientgiving.org/funds/farm-animal-welfare/',
        'Alternatives to Animal Products': 'https://coefficientgiving.org/funds/farm-animal-welfare/',
        'Fish Welfare': 'https://coefficientgiving.org/funds/farm-animal-welfare/',
        'Global Health & Development': 'https://coefficientgiving.org/funds/global-health-wellbeing-opportunities/',
        'Global Health & Wellbeing': 'https://coefficientgiving.org/funds/global-health-wellbeing-opportunities/',
        'Human Health and Wellbeing': 'https://coefficientgiving.org/funds/global-health-wellbeing-opportunities/',
        'Global Health R&D': 'https://coefficientgiving.org/funds/science-and-global-health-rd/',
        'Science for Global Health': 'https://coefficientgiving.org/funds/science-and-global-health-rd/',
        'Global Public Health Policy': 'https://coefficientgiving.org/funds/global-health-wellbeing-opportunities/',
        'Global Health & Wellbeing Opportunities': 'https://coefficientgiving.org/funds/global-health-wellbeing-opportunities/',
        'Infectious Diseases': 'https://coefficientgiving.org/funds/global-health-wellbeing-opportunities/',
        'Noninfectious Diseases': 'https://coefficientgiving.org/funds/global-health-wellbeing-opportunities/',
        'Maternal and Newborn Health': 'https://coefficientgiving.org/funds/global-health-wellbeing-opportunities/',
        'Science and Global Health R&D': 'https://coefficientgiving.org/funds/science-and-global-health-rd/',
        'Strep A Vaccine Fund': 'https://coefficientgiving.org/funds/strep-a-vaccine-fund/',
        'Global Aid Policy': 'https://coefficientgiving.org/funds/global-aid-policy/',
        'Economic Growth in LMICs': 'https://coefficientgiving.org/funds/global-growth',
        'Global Growth': 'https://coefficientgiving.org/funds/global-growth',
        'South Asian Air Quality': 'https://coefficientgiving.org/funds/air-quality',
        'Air Quality': 'https://coefficientgiving.org/funds/air-quality',
        'Lead Exposure Action Fund': 'https://coefficientgiving.org/funds/lead-exposure-action-fund/',
        'Effective Giving': 'https://coefficientgiving.org/funds/effective-giving-and-careers/',
        'Effective Giving & Careers': 'https://coefficientgiving.org/funds/effective-giving-and-careers/',
        'Forecasting': 'https://coefficientgiving.org/funds/forecasting/',
        'Scientific Research': 'https://coefficientgiving.org/funds/science-and-global-health-rd/',
        'Transformative Basic Science': 'https://coefficientgiving.org/funds/science-and-global-health-rd/',
        'Scientific Innovation: Tools and Techniques': 'https://coefficientgiving.org/funds/science-and-global-health-rd/',
        'Other Scientific Research Areas': 'https://coefficientgiving.org/funds/science-and-global-health-rd/',
      };
      const direct = COEFFICIENT_FUND_URLS[focus];
      if (direct) return direct;
    }
    return 'https://coefficientgiving.org/funds/';
  };

  // Get URL for grant - use grant URL if available, otherwise link to grantmaker page
  const getGrantUrl = (grant: MinGrant): string | undefined => {
    if (grant.grantmaker === 'Coefficient Giving') {
      if (grant.url && !isBrokenCoefficientGrantUrl(grant.url)) return grant.url;
      return getCoefficientFallbackUrl(grant);
    }
    // BlueDot has no grant page: link straight to the grantee's provided link, but skip
    // profile/social links (LinkedIn, X, Scholar, …) that describe the person, not the work.
    if (grant.grantmaker === 'BlueDot Impact') {
      return grant.url && !isLowValueProfileLink(grant.url) ? grant.url : undefined;
    }
    if (grant.url) return grant.url;
    // Fallback to grantmaker's grants page
    switch (grant.grantmaker) {
      case 'GiveWell':
        return 'https://www.givewell.org/research/all-grants';
      case 'EA Funds':
        return 'https://funds.effectivealtruism.org/grants';
      case 'SFF':
        return 'https://survivalandflourishing.fund/recommendations';
      default:
        return undefined;
    }
  };

  // Normalize sub-categories to consolidate similar ones
  const SUBCATEGORY_NORMALIZE: Record<string, string> = {
    // GH consolidation
    'Global Health & Wellbeing': 'Global Health & Development',
    'Human Health and Wellbeing': 'Global Health & Development',
    'Science for Global Health': 'Health Research',
    'Global Health R&D': 'Health Research',
    'Global Public Health Policy': 'Health Policy',
    'Global Aid Policy': 'Development Policy',
    // LTXR consolidation
    'Science Supporting Biosecurity and Pandemic Preparedness': 'Biosecurity & Pandemic Preparedness',
    'Science Supporting Biosecurity': 'Biosecurity & Pandemic Preparedness',
    'Potential Risks from Advanced Artificial Intelligence': 'AI Safety',
    'Navigating Transformative AI': 'AI Safety',
    // Science consolidation
    'Transformative Basic Science': 'Basic Science',
    'Scientific Innovation: Tools and Techniques': 'Scientific Tools',
    'Other Scientific Research Areas': 'Scientific Research',
  };

  const categoryColorMap = useMemo(() => {
    const cats = Array.from(new Set(grants.map(g => g.category).filter(Boolean))) as string[];
    const map: { [key: string]: string } = {};
    let fallback = 0;
    cats.forEach((c) => {
      map[c] = CATEGORY_COLORS[c] ?? CHART_COLORS[fallback++ % CHART_COLORS.length];
    });
    return map;
  }, [grants]);

  // Same per-category colors as the badges/filters, but keyed by display name
  // so the stacked chart (whose series are display names) stays consistent.
  const categoryDisplayColors = useMemo(() => {
    const map: { [displayName: string]: string } = { Uncategorized: '#9ca3af' };
    Object.keys(categoryColorMap).forEach(code => {
      map[displayCategory(code) || code] = categoryColorMap[code];
    });
    return map;
    // displayCategory is a stable pure helper; categoryColorMap is the real input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryColorMap]);

  // Grantmaker colors keyed by display name, so the by-funder stacked chart
  // (whose series are display names) matches the grant-list badge colors.
  const grantmakerDisplayColors = useMemo(() => {
    const map: { [displayName: string]: string } = {};
    Object.keys(GRANTMAKER_COLORS).forEach(key => {
      map[displayGrantmaker(key)] = GRANTMAKER_COLORS[key];
    });
    return map;
    // GRANTMAKER_COLORS and displayGrantmaker are stable pure constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PROTOTYPE — regrant apportioning. A regrantor (BlueDot, Manifund) contributes its
  // regranting NET of the tracked upstream grants that funded it, so
  // funder -> regrantor -> recipient isn't double-counted. Per regrantor,
  //   factor = max(0, (R - U_scope) / R)
  // where R is its total regranting and U_scope is the grants TO it (matched by
  // recipient name via `regrant_of`) that fall in the current Grantmaker scope. Scope
  // is the Grantmaker selection ALONE — never the year/category/amount slice — because
  // regrantor funds roll over across years. Each regrant is then counted at its
  // regrantor's factor: BlueDot (U $32M > R $1.24M) floors to 0; Manifund
  // (U $0.16M << R $16M) keeps ~99%.
  const regrantFactor = useMemo(() => {
    const total = new Map<string, number>();
    const aliases = new Map<string, string[]>();
    for (const g of grants) {
      if (!g.regrant) continue;
      total.set(g.grantmaker, (total.get(g.grantmaker) || 0) + g.amount);
      if (g.regrant_of) aliases.set(g.grantmaker, g.regrant_of);
    }
    const inScope = selectedGrantmakers.length > 0
      ? grants.filter(g => selectedGrantmakers.includes(g.grantmaker))
      : grants;
    const upstream = new Map<string, number>();
    for (const g of inScope) {
      const k = normalizeRegrantName(g.recipient);
      upstream.set(k, (upstream.get(k) || 0) + g.amount);
    }
    const f = new Map<string, number>();
    for (const [name, R] of total) {
      const U = (aliases.get(name) || []).reduce((s, a) => s + (upstream.get(normalizeRegrantName(a)) || 0), 0);
      f.set(name, R > 0 ? Math.max(0, (R - U) / R) : 1);
    }
    return f;
  }, [grants, selectedGrantmakers]);
  const countedAmount = useCallback(
    (g: MinGrant) => (g.regrant ? g.amount * (regrantFactor.get(g.grantmaker) ?? 1) : g.amount),
    [regrantFactor]
  );
  // True when the view contains regrants whose dollars are being netted down (factor < 1),
  // so totals are below the sum of the listed grants — surfaced as a chart footnote.
  const hasNettedRegrants = useMemo(
    () => filteredAndSortedGrants.some(g => g.regrant && (regrantFactor.get(g.grantmaker) ?? 1) < 1),
    [filteredAndSortedGrants, regrantFactor]
  );

  const chartData = useMemo(() => {
    const data = filteredAndSortedGrants;

    const byYearMap: { [y: string]: { count: number; total: number } } = {};
    const byMonthMap: { [ym: string]: { count: number; total: number } } = {};
    const byFunderMap: { [f: string]: { count: number; total: number } } = {};
    const byCatMap: { [c: string]: { count: number; total: number } } = {};

    data.forEach(g => {
      const { year, yearMonth: ym } = getYearMonthFromDate(g.date);
      const funder = displayGrantmaker(g.grantmaker);
      const cat = displayCategory(g.category) || 'Uncategorized';
      const amt = countedAmount(g);

      if (!byYearMap[year]) byYearMap[year] = { count: 0, total: 0 };
      byYearMap[year].count += 1;
      byYearMap[year].total += amt;

      if (!byMonthMap[ym]) byMonthMap[ym] = { count: 0, total: 0 };
      byMonthMap[ym].count += 1;
      byMonthMap[ym].total += amt;

      if (!byFunderMap[funder]) byFunderMap[funder] = { count: 0, total: 0 };
      byFunderMap[funder].count += 1;
      byFunderMap[funder].total += amt;

      if (!byCatMap[cat]) byCatMap[cat] = { count: 0, total: 0 };
      byCatMap[cat].count += 1;
      byCatMap[cat].total += amt;
    });

    const byFunder = Object.entries(byFunderMap)
      .map(([f, d]) => ({ funder: f, count: d.count, total: d.total, average: d.count ? d.total / d.count : 0 }))
      .sort((a, b) => b.total - a.total);
    const byCategory = Object.entries(byCatMap)
      .map(([c, d]) => ({ category: c, count: d.count, total: d.total, average: d.count ? d.total / d.count : 0 }))
      .sort((a, b) => b.total - a.total);

    // Show all orgs and categories as individual series (skip funders whose dollars
    // are fully un-counted in this view, e.g. a regrantor while its parent is present).
    const funderGroups = byFunder.filter(f => f.total > 0).map(f => f.funder);
    const categoryGroups = byCategory.map(c => c.category);

    // Cross-tabulations: time x group
    const yearFunder: { [y: string]: { [g: string]: number } } = {};
    const yearCategory: { [y: string]: { [g: string]: number } } = {};
    const monthFunder: { [ym: string]: { [g: string]: number } } = {};
    const monthCategory: { [ym: string]: { [g: string]: number } } = {};

    data.forEach(g => {
      const { year, yearMonth: ym } = getYearMonthFromDate(g.date);
      const fg = displayGrantmaker(g.grantmaker);
      const cg = displayCategory(g.category) || 'Uncategorized';
      const amt = countedAmount(g);

      if (!yearFunder[year]) yearFunder[year] = {};
      yearFunder[year][fg] = (yearFunder[year][fg] || 0) + amt;

      if (!yearCategory[year]) yearCategory[year] = {};
      yearCategory[year][cg] = (yearCategory[year][cg] || 0) + amt;

      if (!monthFunder[ym]) monthFunder[ym] = {};
      monthFunder[ym][fg] = (monthFunder[ym][fg] || 0) + amt;

      if (!monthCategory[ym]) monthCategory[ym] = {};
      monthCategory[ym][cg] = (monthCategory[ym][cg] || 0) + amt;
    });

    let byYear = Object.entries(byYearMap)
      .map(([y, d]) => ({ year: parseInt(y), count: d.count, total: d.total, average: d.count ? d.total / d.count : 0 }))
      .sort((a, b) => a.year - b.year);
    if (byYear.length >= 2) {
      const minYear = byYear[0].year;
      const maxYear = byYear[byYear.length - 1].year;
      const byYearLookup = new Map(byYear.map(d => [d.year, d]));
      const fullByYear: { year: number; count: number; total: number; average: number }[] = [];
      for (let y = minYear; y <= maxYear; y++) {
        const found = byYearLookup.get(y);
        if (found) {
          fullByYear.push(found);
        } else {
          fullByYear.push({ year: y, count: 0, total: 0, average: 0 });
        }
      }
      byYear = fullByYear;
    }
    const byYearMonth = Object.entries(byMonthMap)
      .map(([ym, d]) => ({ yearMonth: ym, count: d.count, total: d.total, average: d.count ? d.total / d.count : 0 }))
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

    return {
      byYear, byYearMonth, byFunder, byCategory,
      funderGroups, categoryGroups,
      yearFunder, yearCategory, monthFunder, monthCategory,
    };
  }, [filteredAndSortedGrants, countedAmount]);

  const filteredTotal = useMemo(
    () => filteredAndSortedGrants.reduce((sum, grant) => sum + countedAmount(grant), 0),
    [filteredAndSortedGrants, countedAmount]
  );

  // Virtualization
  // Estimate row height - expanded mobile rows need more space
  // Initial estimate - actual heights measured by virtualizer via measureElement
  const getRowHeight = useCallback((index: number) => {
    if (isMobile) {
      const grant = filteredAndSortedGrants[index];
      if (grant && expandedGrants.has(grant.id)) {
        return 220; // Initial estimate for expanded - will be measured
      }
      return 100; // Collapsed mobile row
    }
    return 100; // Desktop row
  }, [isMobile, filteredAndSortedGrants, expandedGrants]);

  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedGrants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getRowHeight,
    overscan: 10,
    getItemKey: (index) => filteredAndSortedGrants[index]?.id || index,
  });

  // Track row elements for ResizeObserver
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const resizeObserver = useRef<ResizeObserver | null>(null);

  // Clamp hover tooltip position to viewport
  useEffect(() => {
    if (!hoverTooltip.visible || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    let x = tooltipPos.x;
    let y = tooltipPos.y;
    const padding = 8;

    if (x + rect.width > window.innerWidth - padding) {
      x = window.innerWidth - padding - rect.width;
    }
    if (y + rect.height > window.innerHeight - padding) {
      y = window.innerHeight - padding - rect.height;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;

    if (x !== tooltipPos.x || y !== tooltipPos.y) {
      setTooltipPos({ x, y });
    }
  }, [hoverTooltip.visible, hoverTooltip.text, tooltipPos.x, tooltipPos.y]);

  const showHoverTooltip = (text: string, e: React.MouseEvent<HTMLElement>) => {
    setHoverTooltip({ text, visible: true });
    setTooltipPos({ x: e.clientX + 12, y: e.clientY + 12 });
  };
  const moveHoverTooltip = (e: React.MouseEvent<HTMLElement>) => {
    if (!hoverTooltip.visible) return;
    setTooltipPos({ x: e.clientX + 12, y: e.clientY + 12 });
  };
  const hideHoverTooltip = () => {
    setHoverTooltip({ text: '', visible: false });
  };

  // Setup ResizeObserver to detect row height changes
  useEffect(() => {
    resizeObserver.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const index = Number(entry.target.getAttribute('data-index'));
        if (!isNaN(index)) {
          rowVirtualizer.resizeItem(index, entry.contentRect.height);
        }
      }
    });
    return () => resizeObserver.current?.disconnect();
  }, []);

  // Callback ref for row elements
  const setRowRef = useCallback((el: HTMLDivElement | null, index: number) => {
    if (el) {
      rowRefs.current.set(index, el);
      resizeObserver.current?.observe(el);
    } else {
      const oldEl = rowRefs.current.get(index);
      if (oldEl) resizeObserver.current?.unobserve(oldEl);
      rowRefs.current.delete(index);
    }
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Stable bundle of row helpers for the memoized GrantRow. The captured
  // functions are pure (or use stable setters), so capturing them once is
  // safe; only categoryColorMap can change, so it is the sole dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rowHelpers = useMemo<RowHelpers>(() => ({
    getGrantUrl, formatCurrency, GRANTMAKER_COLORS, categoryColorMap,
    shortCategory, displayCategory, displayGrantmaker, toggleGrantExpanded,
  }), [categoryColorMap]);


  // US CPI-U annual averages, indexed so that the most recent full year = 1.0
  // Source: Bureau of Labor Statistics, CPI-U All Items, adjusted to 2025 base
  // (2025 annual avg ≈ 322.6 vs 2024 ≈ 314.2). 2026 is partial → held at 1.0.
  const CPI_MULTIPLIERS: { [year: string]: number } = {
    '2012': 1.42, '2013': 1.40, '2014': 1.38, '2015': 1.38,
    '2016': 1.36, '2017': 1.32, '2018': 1.29, '2019': 1.26,
    '2020': 1.25, '2021': 1.19, '2022': 1.11, '2023': 1.07, '2024': 1.03, '2025': 1.00, '2026': 1.00,
  };

  const inflationMultiplier = (yearOrYm: string): number => {
    const year = yearOrYm.slice(0, 4);
    return adjustInflation ? (CPI_MULTIPLIERS[year] ?? 1.0) : 1.0;
  };

  // Build stacked series for time x group breakdowns
  const buildStackedSeries = (
    timeLabels: string[],
    crossTab: { [time: string]: { [group: string]: number } },
    groups: string[],
    colorMap?: { [group: string]: string },
  ) => {
    return groups.map((group, i) => ({
      name: group,
      type: 'bar' as const,
      stack: 'total',
      data: timeLabels.map(t => {
        const val = crossTab[t]?.[group] || 0;
        return parseFloat((val * inflationMultiplier(t) / 1000000).toFixed(2));
      }),
      itemStyle: { color: colorMap?.[group] ?? CHART_COLORS[i % CHART_COLORS.length] },
    }));
  };

  // ECharts options (computed from filtered data)
  const getChartOption = () => {
    const {
      byYear, byYearMonth,
      funderGroups, categoryGroups,
      yearFunder, yearCategory, monthFunder, monthCategory,
    } = chartData;

    // Fixed px (not %) on the right: the vertical legend has a bounded width, and a
    // percentage shrinks at narrower widths until the legend overlaps the plot.
    const gridYear = isMobile
      ? { left: '45px', right: '8px', top: '30px', bottom: '10%' }
      : { left: '7%', right: '210px', top: '55px', bottom: '15%' };
    const gridMonth = isMobile
      ? { left: '45px', right: '8px', top: '30px', bottom: '18%' }
      : { left: '7%', right: '210px', top: '55px', bottom: '20%' };

    // Calculate y-axis max that works for both nominal and inflation-adjusted
    // This ensures bars never shrink when inflation is toggled on
    const calcYearMax = () => {
      let nominalMax = 0;
      let inflatedMax = 0;
      byYear.forEach(d => {
        const nominal = d.total / 1000000;
        const inflated = d.total * (CPI_MULTIPLIERS[String(d.year)] ?? 1.0) / 1000000;
        nominalMax = Math.max(nominalMax, nominal);
        inflatedMax = Math.max(inflatedMax, inflated);
      });
      return Math.max(nominalMax, inflatedMax) * 1.05; // 5% padding
    };
    const calcMonthMax = () => {
      let nominalMax = 0;
      let inflatedMax = 0;
      byYearMonth.forEach(d => {
        const year = d.yearMonth.slice(0, 4);
        const nominal = d.total / 1000000;
        const inflated = d.total * (CPI_MULTIPLIERS[year] ?? 1.0) / 1000000;
        nominalMax = Math.max(nominalMax, nominal);
        inflatedMax = Math.max(inflatedMax, inflated);
      });
      return Math.max(nominalMax, inflatedMax) * 1.05;
    };
    const yearMax = calcYearMax();
    const monthMax = calcMonthMax();

    const breakdownTooltip = {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      confine: true,
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params];
        let total = 0;
        let lines = items
          .filter((p: any) => p.value > 0)
          .map((p: any) => {
            total += p.value;
            return `${p.marker} ${p.seriesName}: $${p.value.toFixed(2)}M`;
          });
        return `${items[0].name}<br/>${lines.join('<br/>')}<br/><b>Total: $${total.toFixed(2)}M</b>`;
      },
    };

    const titleStyle = isMobile ? { fontSize: 12 } : {};
    // Hide legend on mobile - tooltip provides enough info
    // Truncate long funder names so the legend's footprint is bounded and predictable —
    // the grid reserves a matching fixed pixel margin (see gridYear/gridMonth), which a
    // percentage margin could not guarantee at narrower widths.
    const legendConfig = isMobile
      ? { show: false }
      : {
          type: 'scroll' as const, orient: 'vertical' as const, right: 10, top: 20, bottom: 20,
          textStyle: { fontSize: 12, width: 150, overflow: 'truncate' as const },
          tooltip: { show: true },
        };
    const niceMax = (value: number) => {
      if (value <= 0) return 0;
      const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
      const normalized = value / magnitude;
      const step =
        normalized <= 1 ? 1 :
        normalized <= 1.2 ? 1.2 :
        normalized <= 1.5 ? 1.5 :
        normalized <= 2 ? 2 :
        normalized <= 3 ? 3 :
        normalized <= 4 ? 4 :
        normalized <= 5 ? 5 :
        normalized <= 6 ? 6 :
        normalized <= 8 ? 8 : 10;
      return step * magnitude;
    };

    const yAxisConfig = (max: number) => {
      const buffer = isMobile ? 1.06 : 1.04;
      const paddedMax = max * buffer;
      return {
      type: 'value' as const,
      name: isMobile ? '' : (adjustInflation ? '2025 USD ($M)' : 'Amount ($M)'),
      max: niceMax(paddedMax), // Smaller padding so scale tracks bars more closely
      nameTextStyle: { fontSize: 12 },
      axisLabel: {
        fontSize: isMobile ? 9 : 12,
        formatter: function(val: number) {
          if (val >= 1000) return (val / 1000).toFixed(1) + 'B';
          if (val >= 10) return Math.round(val) + 'M';
          const rounded = Math.round(val * 10) / 10;
          return (rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)) + 'M';
        },
      },
      };
    };

    switch (chartView) {
      case 'year': {
        const yearLabels = byYear.map(d => String(d.year));

        if (timeBreakdown === 'byFunder') {
          return {
            animation: false,
            title: isMobile ? { show: false } : { text: 'Grants by Year (by Funder)', left: 'center', top: 8 },
            tooltip: breakdownTooltip,
            legend: legendConfig,
            xAxis: { type: 'category', data: yearLabels, axisLabel: { fontSize: isMobile ? 10 : 12 } },
            yAxis: yAxisConfig(yearMax),
            series: buildStackedSeries(yearLabels, yearFunder, funderGroups, grantmakerDisplayColors),
            grid: gridYear,
          };
        }
        if (timeBreakdown === 'byCategory') {
          return {
            animation: false,
            title: isMobile ? { show: false } : { text: 'Grants by Year (by Category)', left: 'center', top: 8 },
            tooltip: breakdownTooltip,
            legend: legendConfig,
            xAxis: { type: 'category', data: yearLabels, axisLabel: { fontSize: isMobile ? 10 : 12 } },
            yAxis: yAxisConfig(yearMax),
            series: buildStackedSeries(yearLabels, yearCategory, categoryGroups, categoryDisplayColors),
            grid: gridYear,
          };
        }
        return {
          animation: false,
          title: isMobile ? { show: false } : { text: 'Grants by Year', left: 'center', top: 8 },
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            confine: true,
            formatter: (params: any) => {
              const d = params[0];
              const item = byYear[d.dataIndex];
              return `${d.name}<br/>Total: $${d.value}M<br/>Count: ${item.count}`;
            }
          },
          xAxis: { type: 'category', data: yearLabels, axisLabel: { fontSize: isMobile ? 10 : 12 } },
          yAxis: yAxisConfig(yearMax),
          series: [{
            name: 'Amount', type: 'bar',
            data: byYear.map(d => parseFloat((d.total * inflationMultiplier(String(d.year)) / 1000000).toFixed(2))),
            itemStyle: { color: '#10b981' },
          }],
          grid: gridYear,
        };
      }

      case 'month': {
        const monthLabels = byYearMonth.map(d => d.yearMonth);
        const monthAxisLabel = {
          rotate: 45,
          interval: Math.max(0, Math.floor(monthLabels.length / (isMobile ? 6 : 12))),
          fontSize: isMobile ? 9 : 12,
        };

        if (timeBreakdown === 'byFunder') {
          return {
            animation: false,
            title: isMobile ? { show: false } : { text: 'Grants by Month (by Funder)', left: 'center', top: 8 },
            tooltip: breakdownTooltip,
            legend: legendConfig,
            xAxis: { type: 'category', data: monthLabels, axisLabel: monthAxisLabel },
            yAxis: yAxisConfig(monthMax),
            series: buildStackedSeries(monthLabels, monthFunder, funderGroups, grantmakerDisplayColors),
            grid: gridMonth,
          };
        }
        if (timeBreakdown === 'byCategory') {
          return {
            animation: false,
            title: isMobile ? { show: false } : { text: 'Grants by Month (by Category)', left: 'center', top: 8 },
            tooltip: breakdownTooltip,
            legend: legendConfig,
            xAxis: { type: 'category', data: monthLabels, axisLabel: monthAxisLabel },
            yAxis: yAxisConfig(monthMax),
            series: buildStackedSeries(monthLabels, monthCategory, categoryGroups, categoryDisplayColors),
            grid: gridMonth,
          };
        }
        return {
          animation: false,
          title: isMobile ? { show: false } : { text: 'Grants by Month', left: 'center', top: 8 },
          tooltip: {
            trigger: 'axis',
            confine: true,
            formatter: (params: any) => {
              const d = params[0];
              const item = byYearMonth[d.dataIndex];
              return `${d.name}<br/>Total: $${(item.total * inflationMultiplier(item.yearMonth) / 1000000).toFixed(2)}M<br/>Count: ${item.count}`;
            }
          },
          xAxis: { type: 'category', data: monthLabels, axisLabel: monthAxisLabel },
          yAxis: yAxisConfig(monthMax),
          series: [{
            name: 'Amount', type: 'bar',
            data: byYearMonth.map(d => (d.total * inflationMultiplier(d.yearMonth) / 1000000).toFixed(2)),
            itemStyle: { color: '#3a6ea5' },
          }],
          grid: gridMonth,
        };
      }

      default:
        return {};
    }
  };

  // Loading screen
  if (isLoading || !metadata) {
    return (
      <>
        <Head>
          <title>EA Grants Database</title>
          <meta name="description" content="Aggregated database of Effective Altruism grants" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </Head>
        <main style={styles.loadingContainer}>
          <div style={styles.loadingContent}>
            <h1 style={styles.loadingTitle}>EA Grants Database</h1>
            {!loadError && <div style={styles.loadingSpinner} />}
            <p style={styles.loadingText}>{loadingProgress}</p>
            {loadError && (
              <button
                onClick={() => window.location.reload()}
                style={styles.retryButton}
              >
                Retry
              </button>
            )}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>EA Grants Database</title>
        <meta name="description" content="Aggregated database of Effective Altruism grants" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://brian-foerster.github.io/EAGrantsDatabase/" />
        <script
          data-goatcounter="https://brian-foerster.goatcounter.com/count"
          async
          src="//gc.zgo.at/count.js"
        />
      </Head>
      <main style={{
        ...styles.main,
        padding: isPhonePortrait ? '12px 12px' : isMobile ? '16px 16px' : isTablet ? '20px 40px' : '20px 80px'
      }}>
        <header style={{
          ...styles.header,
          minHeight: isMobile ? '196px' : '244px',
          padding: isMobile ? '18px 16px' : '32px 36px',
          marginBottom: isMobile ? '32px' : '40px'
        }}>
          <nav style={styles.nav}>
            <Link href="/" style={{ ...styles.navLink, ...styles.navLinkActive }}>
              Grants Database
            </Link>
            <Link href="/recipients" style={styles.navLink}>
              Org Financials
            </Link>
            <Link href="/about" style={styles.navLink}>
              About
            </Link>
          </nav>
          <h1 style={{ ...styles.title, fontSize: isPhonePortrait ? '24px' : isMobile ? '28px' : '48px' }}>EA Grants Database</h1>
          <p style={{ ...styles.subtitle, fontSize: isMobile ? '13px' : '18px' }}>
            {`${metadata.totalGrants.toLocaleString()} grants totaling $${(metadata.totalAmount / 1e9).toFixed(1)} billion from ${metadata.grantmakers.length} EA-aligned grantmakers (2012–present)`}
          </p>
        </header>

        {/* Search and Filter */}
        <section style={styles.section}>
          <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? '22px' : '28px' }}>Search and Filter</h2>
          <div style={{
            ...styles.filtersContainer,
            padding: isMobile ? '12px' : '20px'
          }}>
            <div style={styles.searchContainer}>
              <input
                type="text"
                placeholder="Search grants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <div style={styles.filterMetaRow}>
              <div style={styles.resultCount}>
                {filteredAndSortedGrants.length === grants.length
                  ? `${grants.length.toLocaleString()} grants`
                  : `${filteredAndSortedGrants.length.toLocaleString()} of ${grants.length.toLocaleString()} grants`}
              </div>
              <button
                type="button"
                onClick={clearAllFilters}
                style={styles.clearFiltersButton}
              >
                Clear all
              </button>
            </div>
            <div style={styles.filterAccordion}>
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('grantmaker')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Grantmaker</span>
                  {expandedFilters.grantmaker && <SelectAllButton all={metadata.grantmakers} selected={selectedGrantmakers} onChange={setSelectedGrantmakers} />}
                  <span style={styles.filterHeaderIcon}>{expandedFilters.grantmaker ? '\u2212' : '+'}</span>
                </button>
                {expandedFilters.grantmaker && (
                  <div style={styles.filterOptions}>
                    {metadata.grantmakers.map(gm => (
                      <label key={gm} style={styles.filterOption}>
                        <input
                          type="checkbox"
                          checked={selectedGrantmakers.includes(gm)}
                          onChange={() => toggleGrantmaker(gm)}
                          style={styles.checkbox}
                        />
                        {displayGrantmaker(gm)}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('fund')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Fund</span>
                  {expandedFilters.fund && <SelectAllButton all={fundsByGrantmaker.flatMap(g => g.funds)} selected={selectedFunds} onChange={setSelectedFunds} />}
                  <span style={styles.filterHeaderIcon}>{expandedFilters.fund ? '\u2212' : '+'}</span>
                </button>
                {expandedFilters.fund && (
                  <div style={styles.filterOptionsGrouped}>
                    {fundsByGrantmaker.map(group => {
                      // .every() is true for an empty list, which would mislabel an empty
                      // group as "Deselect All" — require at least one option.
                      const allSelected = group.funds.length > 0 && group.funds.every(f => selectedFunds.includes(f));
                      const someSelected = group.funds.some(f => selectedFunds.includes(f));
                      return (
                      <div key={group.grantmaker} style={styles.fundGroup}>
                        <div style={styles.fundGroupHeaderRow}>
                          <div style={styles.fundGroupHeader}>{group.displayName}</div>
                          <button
                            onClick={() => selectAllFundsForGrantmaker(group.grantmaker, group.funds)}
                            style={{
                              ...styles.selectAllButton,
                              ...(allSelected ? styles.selectAllButtonActive : {})
                            }}
                          >
                            {allSelected ? 'Deselect All' : someSelected ? 'Select All' : 'Select All'}
                          </button>
                        </div>
                        <div style={styles.fundGroupOptions}>
                          {group.funds.map(fund => (
                            <label key={fund} style={styles.filterOption}>
                              <input
                                type="checkbox"
                                checked={selectedFunds.includes(fund)}
                                onChange={() => toggleFund(fund)}
                                style={styles.checkbox}
                              />
                              <span>{fund}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('category')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Category</span>
                  {expandedFilters.category && <SelectAllButton all={metadata.categories} selected={selectedCategories} onChange={setSelectedCategories} />}
                  <span style={styles.filterHeaderIcon}>{expandedFilters.category ? '\u2212' : '+'}</span>
                </button>
                {expandedFilters.category && (
                  <div style={styles.filterOptions}>
                    {metadata.categories.map(cat => (
                      <label key={cat} style={styles.filterOption}>
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(cat)}
                          onChange={() => toggleCategory(cat)}
                          style={styles.checkbox}
                        />
                        <span>{displayCategory(cat)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {subCategoriesByCategory.length > 0 && (
                <div style={styles.filterSection}>
                  <button
                    onClick={() => toggleFilter('subcategory')}
                    style={styles.filterHeader}
                  >
                    <span style={styles.filterHeaderLabel}>Sub-Category</span>
                    {expandedFilters.subcategory && <SelectAllButton all={subCategoriesByCategory.flatMap(g => g.subs.map(s => s.id))} selected={selectedSubCategories} onChange={setSelectedSubCategories} />}
                    <span style={styles.filterHeaderIcon}>{expandedFilters.subcategory ? '−' : '+'}</span>
                  </button>
                  {expandedFilters.subcategory && (
                    <div style={styles.filterOptionsGrouped}>
                      {subCategoriesByCategory.map(group => {
                        const ids = group.subs.map(s => s.id);
                        const allSelected = ids.length > 0 && ids.every(id => selectedSubCategories.includes(id));
                        return (
                          <div key={group.category} style={styles.fundGroup}>
                            <div style={styles.fundGroupHeaderRow}>
                              <div style={styles.fundGroupHeader}>{displayCategory(group.category)}</div>
                              <button
                                onClick={() => selectAllSubsForCategory(ids)}
                                style={{
                                  ...styles.selectAllButton,
                                  ...(allSelected ? styles.selectAllButtonActive : {})
                                }}
                              >
                                {allSelected ? 'Deselect All' : 'Select All'}
                              </button>
                            </div>
                            <div style={styles.fundGroupOptions}>
                              {group.subs.map(sub => (
                                <label key={sub.id} style={styles.filterOption}>
                                  <input
                                    type="checkbox"
                                    checked={selectedSubCategories.includes(sub.id)}
                                    onChange={() => toggleSubCategory(sub.id)}
                                    style={styles.checkbox}
                                  />
                                  {sub.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('year')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Funding Year</span>
                  {expandedFilters.year && <SelectAllButton all={availableYears} selected={selectedYears} onChange={setSelectedYears} />}
                  <span style={styles.filterHeaderIcon}>{expandedFilters.year ? '\u2212' : '+'}</span>
                </button>
                {expandedFilters.year && (
                  <div style={styles.filterOptions}>
                    {availableYears.map(year => (
                      <label key={year} style={styles.filterOption}>
                        <input
                          type="checkbox"
                          checked={selectedYears.includes(year)}
                          onChange={() => toggleYear(year)}
                          style={styles.checkbox}
                        />
                        {year}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('amount')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Grant Size</span>
                  <span style={styles.filterHeaderIcon}>{expandedFilters.amount ? '\u2212' : '+'}</span>
                </button>
                {expandedFilters.amount && (
                  <div style={styles.amountFilterRow}>
                    <div style={styles.amountInputGroup}>
                      <label style={styles.amountLabel}>Min ($)</label>
                      <input
                        type="number"
                        value={amountMin}
                        onChange={(e) => setAmountMin(e.target.value)}
                        placeholder="0"
                        style={styles.amountInput}
                      />
                    </div>
                    <span style={styles.amountSeparator}>to</span>
                    <div style={styles.amountInputGroup}>
                      <label style={styles.amountLabel}>Max ($)</label>
                      <input
                        type="number"
                        value={amountMax}
                        onChange={(e) => setAmountMax(e.target.value)}
                        placeholder="No limit"
                        style={styles.amountInput}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Charts */}
        <section style={styles.section}>
          <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? '22px' : '28px' }}>Charts</h2>
          <div style={{
            ...styles.chartControlsRow,
            ...(isPhonePortrait ? { gap: '6px', fontSize: '13px' } : isMobile ? { gap: '8px' } : {})
          }}>
              <button
                onClick={() => setChartView('year')}
                style={{
                  ...styles.chartTab,
                  ...(chartView === 'year' ? styles.chartTabActive : {}),
                  ...chartTabSize,
                }}
              >
                {isMobile ? 'Year' : 'By Year'}
              </button>
              <button
                onClick={() => setChartView('month')}
                style={{
                  ...styles.chartTab,
                  ...(chartView === 'month' ? styles.chartTabActive : {}),
                  ...chartTabSize,
                }}
              >
                {isMobile ? 'Month' : 'By Month'}
              </button>
              <span style={{ ...styles.controlsDivider, ...(isMobile ? { height: '18px', margin: '0 3px' } : {}) }} />
              {!isMobile && <span style={styles.breakdownLabel}>Break down by:</span>}
              <button
                onClick={() => setTimeBreakdown('total')}
                style={{
                  ...styles.breakdownTab,
                  ...(timeBreakdown === 'total' ? styles.breakdownTabActive : {}),
                  ...chartTabSize,
                }}
              >
                Total
              </button>
              <button
                onClick={() => setTimeBreakdown('byFunder')}
                style={{
                  ...styles.breakdownTab,
                  ...(timeBreakdown === 'byFunder' ? styles.breakdownTabActive : {}),
                  ...chartTabSize,
                }}
              >
                {isMobile ? 'Funder' : 'By Funder'}
              </button>
              <button
                onClick={() => setTimeBreakdown('byCategory')}
                style={{
                  ...styles.breakdownTab,
                  ...(timeBreakdown === 'byCategory' ? styles.breakdownTabActive : {}),
                  ...chartTabSize,
                }}
              >
                {isMobile ? 'Category' : 'By Category'}
              </button>
              {!isMobile && <span style={styles.controlsDivider} />}
              <label style={{
                ...styles.inflationToggle,
                ...(isMobile ? { fontSize: '13px', flexBasis: '100%', marginTop: '6px' } : {})
              }}>
                <input
                  type="checkbox"
                  checked={adjustInflation}
                  onChange={() => setAdjustInflation(!adjustInflation)}
                  style={{ cursor: 'pointer' }}
                />
                {isMobile ? 'Inflation-adjusted (2025$)' : 'Adjust for inflation (constant 2025 dollars)'}
              </label>
            </div>
          <div style={{
            ...styles.chartContainer,
            padding: isPhonePortrait ? '4px 0' : isMobile ? '4px 0' : '6px 0',
          }}>
            <div style={{ position: 'relative' }}>
              {canOverlayChartTotal && (
                <div style={styles.chartTotalOverlay}>
                  Total: {'$'}
                  {(filteredTotal / 1000000).toFixed(2)}M
                </div>
              )}
              <ReactECharts
                option={getChartOption()}
                notMerge={true}
                lazyUpdate={true}
                style={{ height: isPhonePortrait ? '260px' : isMobile ? '300px' : '400px', width: '100%' }}
                opts={{ renderer: 'canvas' }}
              />
            </div>
            <div style={{ ...styles.chartDisclaimer, fontSize: isMobile ? '11px' : '12px', padding: '0 16px 8px' }}>
              2025 and 2026 data are partial and reflect only grants published to date.
              Only publicly disclosed grants are included; grants made privately are not captured.
              {hasNettedRegrants && (
                <>{' '}Regrantor totals (BlueDot, Manifund) are counted net of the tracked grants
                that funded them.</>
              )}
            </div>
          </div>
          {!canOverlayChartTotal && (
            <div style={{
              ...styles.chartMetaRow,
              ...(isMobile ? { fontSize: '12px' } : {})
            }}>
              <div style={styles.chartTotal}>
                Total: {'$'}
                {(filteredTotal / 1000000).toFixed(2)}M
              </div>
            </div>
          )}
        </section>

        {/* Grants List with Virtualization */}
        <section ref={grantsSectionRef} style={{ ...styles.section, scrollMarginTop: '12px' }}>
          <div style={{
            ...styles.grantsHeader,
            ...(isMobile ? { flexDirection: 'column', alignItems: 'flex-start', gap: '10px' } : {})
          }}>
            <div style={styles.grantsHeaderLeft}>
              <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? '22px' : '28px', marginBottom: 0, lineHeight: 1 }}>Grants</h2>
              <div style={styles.sortControls}>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'amount' | 'grantmaker' | 'recipient' | 'category')}
                  style={{
                    ...styles.select,
                    ...(isMobile ? { minWidth: 'auto', padding: '8px', fontSize: '13px' } : {})
                  }}
                >
                  <option value="date">{isMobile ? 'Date' : 'Sort by Date'}</option>
                  <option value="amount">{isMobile ? 'Amount' : 'Sort by Amount'}</option>
                  <option value="grantmaker">{isMobile ? 'Grantmaker' : 'Sort by Grantmaker'}</option>
                  <option value="recipient">{isMobile ? 'Grantee' : 'Sort by Grantee'}</option>
                  <option value="category">{isMobile ? 'Category' : 'Sort by Category'}</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  style={{
                    ...styles.sortButton,
                    ...(isMobile ? { padding: '8px 12px', fontSize: '13px' } : {})
                  }}
                >
                  {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
              </div>
            </div>
            <button
              onClick={downloadFilteredCsv}
              style={{
                ...styles.downloadButton,
                ...(isMobile ? { padding: '8px 12px', fontSize: '13px' } : {})
              }}
            >
              Download Results CSV
            </button>
          </div>

          {orgFilter && (
            <div style={styles.orgFilterBanner}>
              <span>
                Showing grants to <strong>{orgFilter}</strong>
              </span>
              <button onClick={() => setOrgFilter(null)} style={styles.orgFilterClear}>
                Clear ✕
              </button>
            </div>
          )}

          <div style={{
            ...styles.virtualListContainer,
            padding: isMobile ? '0 10px' : '0 16px'
          }}>
            {!isMobile && (
              <div style={styles.listHeaderRow}>
                <div style={styles.listHeaderCell}>Grantee</div>
                <div style={styles.listHeaderCell}>Grantmaker</div>
                <div />
                <div style={styles.listHeaderCell}>Category</div>
                <div style={{ ...styles.listHeaderCell, textAlign: 'right' }}>Amount</div>
                <div style={{ ...styles.listHeaderCell, textAlign: 'right' }}>Date</div>
              </div>
            )}
          <div
            ref={parentRef}
            className="grants-scroll"
            style={{
              ...styles.virtualListScroll,
              height: isMobile ? '600px' : '800px'
            }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const grant = filteredAndSortedGrants[virtualRow.index];
                const financialsOrg = recipientToOrg.get(grant.recipient.toLowerCase());
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={(el) => setRowRef(el, virtualRow.index)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <GrantRow
                      grant={grant}
                      isMobile={isMobile}
                      expanded={expandedGrants.has(grant.id)}
                      financialsOrg={financialsOrg}
                      expandedLabelStyle={expandedLabelStyle}
                      helpers={rowHelpers}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </section>

        {hoverTooltip.visible && (
          <div
            ref={tooltipRef}
            style={{
              ...styles.hoverTooltip,
              left: tooltipPos.x,
              top: tooltipPos.y,
            }}
          >
            {hoverTooltip.text}
          </div>
        )}

        {/* Footer */}
        <footer style={{
          ...styles.footer,
          marginTop: isMobile ? '30px' : '60px',
          paddingTop: isMobile ? '20px' : '40px'
        }}>
          <p style={styles.footerText}>
            Data last updated on {format(parseISO(metadata.lastUpdated), 'MMM d, yyyy')}
          </p>
          <p style={styles.footerLinks}>
            <a href="https://github.com/Brian-Foerster/EAGrantsDatabase" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>GitHub</a>
            {' · '}
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSceNe8T97Z36LvBmepyid68MYbyairBvZucnZFlREGROSBOZA/viewform" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>Feedback</a>
            {' · '}
            <a href="https://brianfoerster.com" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>brianfoerster.com</a>
          </p>
        </footer>
      </main>
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  loadingContent: {
    textAlign: 'center',
    padding: '40px',
  },
  loadingTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: '30px',
  },
  loadingSpinner: {
    width: '50px',
    height: '50px',
    border: '4px solid #e5e7eb',
    borderTop: '4px solid #3a6ea5',
    borderRadius: '50%',
    margin: '0 auto 20px',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '16px',
    color: '#6b7280',
  },
  retryButton: {
    marginTop: '20px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    backgroundColor: '#3a6ea5',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  main: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px 80px',
  },
  header: {
    textAlign: 'left',
    marginBottom: '40px',
    borderRadius: '16px',
    border: '1px solid #e5e7eb',
    background: 'radial-gradient(82% 150% at 88% 22%, #bfdbfe 0%, #f8fafc 88%)',
  },
  nav: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: '8px',
    marginBottom: '18px',
    flexWrap: 'wrap',
  },
  navLink: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#64748b',
    textDecoration: 'none',
    padding: '5px 10px',
    borderRadius: '6px',
  },
  navLinkActive: {
    color: '#0f172a',
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  title: {
    fontSize: '48px',
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#0f172a',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '18px',
    color: '#475569',
    lineHeight: '1.5',
    maxWidth: '720px',
  },
  resultCount: {
    fontSize: '13px',
    color: '#888',
    marginTop: '6px',
  },
  filterMetaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginTop: '8px',
    flexWrap: 'wrap',
  },
  clearFiltersButton: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#1f2937',
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  section: {
    marginBottom: '40px',
  },
  sectionTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#1a202c',
  },
  chartContainer: {
    backgroundColor: 'white',
    padding: '6px 0',
    borderRadius: '4px',
    border: '1px solid #e5e7eb',
    position: 'relative',
  },
  chartTotalOverlay: {
    position: 'absolute',
    right: '12px',
    bottom: '8px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#4b5563',
    backgroundColor: 'rgba(255,255,255,0.9)',
    border: '1px solid #e5e7eb',
    padding: '4px 8px',
    borderRadius: '6px',
    pointerEvents: 'none',
  },
  chartMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    color: '#6b7280',
    marginTop: '8px',
    flexWrap: 'wrap',
  },
  chartTotal: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#4b5563',
    whiteSpace: 'nowrap',
  },
  hoverTooltip: {
    position: 'fixed',
    zIndex: 1000,
    maxWidth: '260px',
    padding: '6px 8px',
    backgroundColor: '#111827',
    color: '#f9fafb',
    fontSize: '12px',
    lineHeight: '1.3',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    pointerEvents: 'none',
  },
  chartControlsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  controlsDivider: {
    width: '1px',
    height: '24px',
    backgroundColor: '#ddd',
    margin: '0 6px',
  },
  chartTab: {
    padding: '8px 16px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  chartTabActive: {
    backgroundColor: '#3a6ea5',
    color: 'white',
    borderColor: '#3a6ea5',
  },
  breakdownLabel: {
    fontSize: '14px',
    color: '#666',
    marginRight: '4px',
  },
  breakdownTab: {
    padding: '7px 16px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
    color: '#333',
  },
  breakdownTabActive: {
    backgroundColor: '#1a202c',
    color: 'white',
    borderColor: '#1a202c',
  },
  inflationToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#555',
    cursor: 'pointer',
    userSelect: 'none',
  },
  chartDisclaimer: {
    fontSize: '12px',
    color: '#999',
    fontStyle: 'italic',
  },
  filtersContainer: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '4px',
    border: '1px solid #e5e7eb',
  },
  searchContainer: {
    display: 'flex',
    gap: '10px',
    marginBottom: '15px',
  },
  searchInput: {
    flex: 1,
    padding: '12px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '4px',
  },
  filterAccordion: {
    display: 'flex',
    flexDirection: 'column',
  },
  filterSection: {
    borderBottom: '1px solid #e5e7eb',
  },
  filterHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '20px 0',
    fontSize: '17px',
    fontWeight: '500',
    color: '#1a202c',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  filterHeaderLabel: {
    fontSize: '17px',
  },
  filterHeaderIcon: {
    fontSize: '22px',
    lineHeight: '1',
    color: '#666',
  },
  filterOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px 20px',
    paddingBottom: '16px',
  },
  filterOptionsGrouped: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '16px',
  },
  fundGroup: {
    borderLeft: '3px solid #e5e7eb',
    paddingLeft: '12px',
  },
  fundGroupHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  fundGroupHeader: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  selectAllButton: {
    fontSize: '11px',
    padding: '2px 8px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#f9fafb',
    color: '#6b7280',
    cursor: 'pointer',
  },
  selectAllButtonTop: {
    fontSize: '11px',
    padding: '2px 10px',
    border: '1px solid #94a3b8',
    borderRadius: '4px',
    backgroundColor: '#e2e8f0',
    color: '#334155',
    fontWeight: '600',
    cursor: 'pointer',
    marginLeft: 'auto',
    marginRight: '12px',
  },
  selectAllButtonActive: {
    backgroundColor: '#3a6ea5',
    borderColor: '#3a6ea5',
    color: 'white',
  },
  fundGroupOptions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 16px',
  },
  filterOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '15px',
    color: '#333',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: '#3a6ea5',
  },
  amountFilterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    paddingBottom: '16px',
  },
  amountInputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  amountLabel: {
    fontSize: '12px',
    color: '#666',
  },
  amountInput: {
    padding: '8px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    width: '100%',
  },
  amountSeparator: {
    fontSize: '14px',
    color: '#666',
    marginTop: '18px',
  },
  select: {
    minWidth: '150px',
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
  },
  sortButton: {
    padding: '10px 20px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  grantsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '15px',
  },
  grantsHeaderLeft: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '12px',
    flexWrap: 'wrap',
  },
  sortControls: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  downloadButton: {
    padding: '10px 16px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#f9fafb',
    color: '#111827',
    fontWeight: '600',
    cursor: 'pointer',
  },
  virtualListContainer: {
    backgroundColor: 'white',
    borderRadius: '4px',
    padding: '0 16px',
    border: '1px solid #e5e7eb',
  },
  virtualListScroll: {
    height: '800px',
    overflow: 'auto',
  },
  listHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 220px 0px 220px 110px 100px',
    gap: '8px',
    padding: '10px 0',
    borderBottom: '2px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    backgroundColor: 'white',
    zIndex: 1,
  },
  listHeaderCell: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  grantRowWrap: {
    padding: '12px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  grantRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 220px 0px 220px 110px 100px',
    alignItems: 'start',
    gap: '8px',
  },
  grantDescLine: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
  },
  grantExpandArrow: {
    flexShrink: 0,
    fontSize: '10px',
    color: '#9ca3af',
    userSelect: 'none',
    paddingBottom: '2px',
  },
  grantExpandArrowSolo: {
    display: 'inline-block',
    marginTop: '4px',
    fontSize: '10px',
    color: '#9ca3af',
    userSelect: 'none',
  },
  grantDesktopExpanded: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px dashed #e5e7eb',
  },
  grantExpandedDesc: {
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.5',
  },
  grantExpandedDescLabel: {
    fontWeight: 600,
    color: '#374151',
  },
  grantExpandedLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '18px',
  },
  grantRowMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px 0',
    borderBottom: '1px solid #e5e7eb',
    cursor: 'pointer',
  },
  grantMobileTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  grantMobileAmount: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1a202c',
    whiteSpace: 'nowrap',
  },
  grantMobileTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
  },
  grantMobileTagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'center',
  },
  grantMobileMeta: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tagTiny: {
    display: 'inline-block',
    padding: '1px 5px',
    fontSize: '10px',
    fontWeight: '600',
    border: '1px solid',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
  },
  expandIndicator: {
    fontSize: '10px',
    color: '#999',
    marginLeft: 'auto',
  },
  grantMobileExpanded: {
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  expandedRow: {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    color: '#4b5563',
  },
  expandedLabel: {
    fontWeight: '600',
    color: '#6b7280',
    minWidth: '80px',
    flexShrink: 0,
  },
  expandedDescRow: {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    color: '#4b5563',
    flexWrap: 'wrap',
  },
  expandedDescText: {
    flex: 1,
    lineHeight: '1.4',
  },
  expandedLink: {
    color: '#3a6ea5',
    textDecoration: 'none',
    fontSize: '12px',
    fontWeight: '500',
  },
  grantMobileDate: {
    fontSize: '12px',
    color: '#888',
  },
  tagSmall: {
    display: 'inline-block',
    padding: '2px 6px',
    fontSize: '11px',
    fontWeight: '600',
    border: '1px solid',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
  },
  tagSmallSub: {
    display: 'inline-block',
    padding: '2px 6px',
    fontSize: '10px',
    fontWeight: '500',
    border: '1px solid',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
  },
  grantLeft: {
    minWidth: 0,
  },
  grantTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#1a202c',
    margin: 0,
    lineHeight: '1.3',
  },
  grantTitleLink: {
    color: '#1a202c',
    textDecoration: 'none',
  },
  crossLink: {
    display: 'inline-block',
    marginTop: '4px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#3a6ea5',
    textDecoration: 'none',
  },
  orgFilterBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    margin: '0 16px 12px',
    padding: '10px 14px',
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#065f46',
  },
  orgFilterClear: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#065f46',
    backgroundColor: 'white',
    border: '1px solid #a7f3d0',
    borderRadius: '6px',
    padding: '5px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  grantDesc: {
    margin: '3px 0 0 0',
    fontSize: '14px',
    color: '#1a202c',
    lineHeight: '1.3',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  grantDescFull: {
    flex: 1,
    minWidth: 0,
    margin: '3px 0 0 0',
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.4',
  },
  grantDescClamp: {
    flex: 1,
    minWidth: 0,
    margin: '3px 0 0 0',
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.4',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  grantTagCol: {
    display: 'flex',
    justifyContent: 'flex-start',
    paddingTop: '2px',
  },
  grantFunderCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'flex-start',
    paddingTop: '2px',
  },
  grantCategoryCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'flex-start',
    paddingTop: '2px',
  },
  tagColored: {
    display: 'inline-block',
    padding: '4px 10px',
    fontSize: '13.5px',
    fontWeight: '700',
    border: '1.5px solid',
    borderRadius: '4px',
    maxWidth: '100%',
    lineHeight: '1.3',
    whiteSpace: 'nowrap',
  },
  subTag: {
    display: 'inline-block',
    padding: '3px 8px',
    fontSize: '11px',
    fontWeight: '500',
    border: '1px solid',
    borderRadius: '4px',
    whiteSpace: 'normal',
    maxWidth: '210px',
    lineHeight: '1.3',
  },
  grantAmountCol: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1a202c',
    whiteSpace: 'nowrap',
    textAlign: 'right',
    paddingTop: '1px',
  },
  grantDateCol: {
    fontSize: '15px',
    fontWeight: '500',
    color: '#1a202c',
    whiteSpace: 'nowrap',
    textAlign: 'right',
    minWidth: '80px',
    paddingTop: '2px',
  },
  footer: {
    marginTop: '60px',
    paddingTop: '40px',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'center',
  },
  footerText: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '10px',
  },
  footerLinks: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '10px',
  },
  footerLink: {
    color: '#3a6ea5',
    textDecoration: 'none',
  },
};

