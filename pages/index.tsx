import { useState, useMemo, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import MiniSearch from 'minisearch';
import ReactECharts from 'echarts-for-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GetStaticProps } from 'next';
import * as fs from 'fs';
import * as path from 'path';

// Funds/focus areas that are excluded by default (not generally considered core EA)
// These grants are only shown when explicitly selected in the Fund filter
const NON_CORE_EA_FUNDS: Record<string, string> = {
  'Abundance & Growth': 'Policy area not generally considered part of the EA movement',
  'Housing Policy Reform': 'US policy area outside traditional EA cause areas',
  'Immigration Policy': 'US policy area outside traditional EA cause areas',
  'Criminal Justice Reform': 'US policy area outside traditional EA cause areas',
  'Land Use Reform': 'US policy area outside traditional EA cause areas',
  'Macroeconomic Stabilization Policy': 'US policy area outside traditional EA cause areas',
  'Innovation Policy': 'US policy area outside traditional EA cause areas',
};

interface MinGrant {
  id: string;
  title: string;
  recipient: string;
  amount: number;
  currency: string;
  date: string;
  grantmaker: string;
  category?: string;
  focus_area?: string;
  fund?: string;
  url?: string;
  is_residual?: boolean;
}

interface Metadata {
  totalGrants: number;
  totalAmount: number;
  grantmakers: string[];
  categories: string[];
  dateRange: {
    earliest: string;
    latest: string;
  };
  lastUpdated: string;
}

interface HomeProps {
  grants: MinGrant[];
  metadata: Metadata;
  searchIndexData: any;
}

export default function Home({ grants, metadata, searchIndexData }: HomeProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrantmakers, setSelectedGrantmakers] = useState<string[]>([]);
  const [selectedFunds, setSelectedFunds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
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
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 400);
  const [expandedGrants, setExpandedGrants] = useState<Set<string>>(new Set());

  const parentRef = useRef<HTMLDivElement>(null);

  // Detect viewport width for responsive layout
  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Responsive breakpoints
  const isPhonePortrait = windowWidth < 480;
  const isPhoneLandscape = windowWidth >= 480 && windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const isMobile = windowWidth < 768;
  const isCompact = windowWidth < 1024;

  // Initialize MiniSearch
  useEffect(() => {
    const ms = MiniSearch.loadJS(searchIndexData, {
      fields: ['title', 'recipient', 'description', 'category', 'grantmaker'],
      storeFields: ['id'],
      searchOptions: {
        boost: { title: 2, recipient: 1.5, description: 1 },
        fuzzy: 0.2,
        prefix: true,
      }
    });
    setMiniSearch(ms);
  }, [searchIndexData]);

  // Perform search
  useEffect(() => {
    if (!miniSearch || !searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    
    const results = miniSearch.search(searchTerm);
    setSearchResults(results.map(r => r.id).slice(0, 1000));
  }, [miniSearch, searchTerm]);

  // Filter and sort grants
  const filteredAndSortedGrants = useMemo(() => {
    let filtered = grants;

    // Apply search filter
    if (searchTerm.trim()) {
      if (searchResults.length === 0) {
        filtered = [];
      } else {
        const resultIds = new Set(searchResults);
        filtered = filtered.filter(grant => resultIds.has(grant.id));
      }
    }

    // Apply grantmaker, fund, category, and sub-category filters with OR logic
    // If ANY filter matches, the grant is included
    // Non-core EA funds are excluded by default unless explicitly selected
    const hasGmFilter = selectedGrantmakers.length > 0;
    const hasFundFilter = selectedFunds.length > 0;
    const hasCatFilter = selectedCategories.length > 0;
    const hasSubFilter = selectedSubcategories.length > 0;
    const hasAnyFilter = hasGmFilter || hasFundFilter || hasCatFilter || hasSubFilter;

    if (hasAnyFilter) {
      filtered = filtered.filter(grant => {
        // Check if grant matches any selected filter (OR logic)
        const matchesGm = hasGmFilter && selectedGrantmakers.includes(grant.grantmaker);
        const matchesFund = hasFundFilter && grant.fund && selectedFunds.includes(grant.fund);
        const matchesCat = hasCatFilter && grant.category && selectedCategories.includes(grant.category);
        const matchesSub = hasSubFilter && grant.focus_area && selectedSubcategories.includes(grant.focus_area);

        if (matchesFund || matchesCat || matchesSub) {
          // Explicit fund/category/sub-category selection always includes
          return true;
        }
        if (matchesGm) {
          // Grantmaker selected - include if no more specific filters, excluding non-core EA
          // Unless a fund from this grantmaker is also selected (then only show that fund)
          const grantmakerHasSelectedFunds = selectedFunds.some(f => {
            const fundGrant = grants.find(g => g.fund === f);
            return fundGrant && fundGrant.grantmaker === grant.grantmaker;
          });
          if (grantmakerHasSelectedFunds) {
            return grant.fund && selectedFunds.includes(grant.fund);
          }
          return !grant.fund || !(grant.fund in NON_CORE_EA_FUNDS);
        }
        return false;
      });
    } else {
      // No filters - exclude non-core EA funds by default
      filtered = filtered.filter(grant => !grant.fund || !(grant.fund in NON_CORE_EA_FUNDS));
    }

    // Apply year filter
    if (selectedYears.length > 0) {
      filtered = filtered.filter(grant => selectedYears.includes(new Date(grant.date).getFullYear()));
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
        cmp = (a.category || '').localeCompare(b.category || '')
          || (a.focus_area || '').localeCompare(b.focus_area || '');
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [grants, searchTerm, searchResults, selectedGrantmakers, selectedFunds, selectedCategories, selectedSubcategories, selectedYears, amountMin, amountMax, sortBy, sortOrder]);

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

  const availableSubcategories = useMemo(() => {
    const subs = new Set(grants.map(g => g.focus_area).filter(Boolean) as string[]);
    return Array.from(subs).sort();
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
      // Select all funds from this grantmaker (including non-core EA)
      setSelectedFunds(prev => [...new Set([...prev, ...funds])]);
    }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleSubcategory = (sub: string) => {
    setSelectedSubcategories(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
    );
  };

  const toggleYear = (year: number) => {
    setSelectedYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
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
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
    '#9ca3af',
  ];

  const GRANTMAKER_COLORS: { [key: string]: string } = {
    'EA Funds': '#0a7b8a',
    'GiveWell': '#c44a2d',
    'Coefficient Giving': '#5b6abf',
    'SFF': '#8b5cf6',
    'Founders Pledge': '#06b6d4',
    'ACE': '#f59e0b',
  };

  const CATEGORY_DISPLAY: Record<string, string> = {
    'LTXR': 'Long-Term & Existential Risk',
    'GH': 'Global Health & Development',
    'AW': 'Animal Welfare',
    'Meta': 'EA Community & Infrastructure',
    'Science': 'Scientific Research',
    'Policy': 'Policy Reform',
    'Other': 'Other',
  };

  const GRANTMAKER_DISPLAY: Record<string, string> = {
    'EA Funds': 'Effective Altruism Funds',
    'SFF': 'Survival and Flourishing Fund',
    'ACE': 'Animal Charity Evaluators',
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
    'Policy': 'Policy',
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

  // Get URL for grant - use grant URL if available, otherwise link to grantmaker page
  const getGrantUrl = (grant: MinGrant): string | undefined => {
    if (grant.url) return grant.url;
    // Fallback to grantmaker's grants page
    switch (grant.grantmaker) {
      case 'Coefficient Giving':
        return 'https://coefficientgiving.org/grants/';
      case 'GiveWell':
        return 'https://www.givewell.org/research/grants';
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
  const normalizeSubcategory = (sub?: string): string => sub ? (SUBCATEGORY_NORMALIZE[sub] || sub) : '';

  const categoryColorMap = useMemo(() => {
    const cats = Array.from(new Set(grants.map(g => g.category).filter(Boolean))) as string[];
    const map: { [key: string]: string } = {};
    cats.forEach((c, i) => { map[c] = CHART_COLORS[i % CHART_COLORS.length]; });
    return map;
  }, [grants]);

  const chartData = useMemo(() => {
    const data = filteredAndSortedGrants;

    const byYearMap: { [y: string]: { count: number; total: number } } = {};
    const byMonthMap: { [ym: string]: { count: number; total: number } } = {};
    const byFunderMap: { [f: string]: { count: number; total: number } } = {};
    const byCatMap: { [c: string]: { count: number; total: number } } = {};

    data.forEach(g => {
      const d = new Date(g.date);
      const year = d.getFullYear().toString();
      const ym = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const funder = displayGrantmaker(g.grantmaker);
      const cat = displayCategory(g.category) || 'Uncategorized';

      if (!byYearMap[year]) byYearMap[year] = { count: 0, total: 0 };
      byYearMap[year].count += 1;
      byYearMap[year].total += g.amount;

      if (!byMonthMap[ym]) byMonthMap[ym] = { count: 0, total: 0 };
      byMonthMap[ym].count += 1;
      byMonthMap[ym].total += g.amount;

      if (!byFunderMap[funder]) byFunderMap[funder] = { count: 0, total: 0 };
      byFunderMap[funder].count += 1;
      byFunderMap[funder].total += g.amount;

      if (!byCatMap[cat]) byCatMap[cat] = { count: 0, total: 0 };
      byCatMap[cat].count += 1;
      byCatMap[cat].total += g.amount;
    });

    const byFunder = Object.entries(byFunderMap)
      .map(([f, d]) => ({ funder: f, count: d.count, total: d.total, average: d.count ? d.total / d.count : 0 }))
      .sort((a, b) => b.total - a.total);
    const byCategory = Object.entries(byCatMap)
      .map(([c, d]) => ({ category: c, count: d.count, total: d.total, average: d.count ? d.total / d.count : 0 }))
      .sort((a, b) => b.total - a.total);

    // Show all orgs and categories as individual series
    const funderGroups = byFunder.map(f => f.funder);
    const categoryGroups = byCategory.map(c => c.category);

    // Cross-tabulations: time x group
    const yearFunder: { [y: string]: { [g: string]: number } } = {};
    const yearCategory: { [y: string]: { [g: string]: number } } = {};
    const monthFunder: { [ym: string]: { [g: string]: number } } = {};
    const monthCategory: { [ym: string]: { [g: string]: number } } = {};

    data.forEach(g => {
      const d = new Date(g.date);
      const year = d.getFullYear().toString();
      const ym = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const fg = displayGrantmaker(g.grantmaker);
      const cg = displayCategory(g.category) || 'Uncategorized';

      if (!yearFunder[year]) yearFunder[year] = {};
      yearFunder[year][fg] = (yearFunder[year][fg] || 0) + g.amount;

      if (!yearCategory[year]) yearCategory[year] = {};
      yearCategory[year][cg] = (yearCategory[year][cg] || 0) + g.amount;

      if (!monthFunder[ym]) monthFunder[ym] = {};
      monthFunder[ym][fg] = (monthFunder[ym][fg] || 0) + g.amount;

      if (!monthCategory[ym]) monthCategory[ym] = {};
      monthCategory[ym][cg] = (monthCategory[ym][cg] || 0) + g.amount;
    });

    const byYear = Object.entries(byYearMap)
      .map(([y, d]) => ({ year: parseInt(y), count: d.count, total: d.total, average: d.count ? d.total / d.count : 0 }))
      .sort((a, b) => a.year - b.year);
    const byYearMonth = Object.entries(byMonthMap)
      .map(([ym, d]) => ({ yearMonth: ym, count: d.count, total: d.total, average: d.count ? d.total / d.count : 0 }))
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

    return {
      byYear, byYearMonth, byFunder, byCategory,
      funderGroups, categoryGroups,
      yearFunder, yearCategory, monthFunder, monthCategory,
    };
  }, [filteredAndSortedGrants]);

  // Virtualization
  // Estimate row height - expanded mobile rows need more space
  const getRowHeight = (index: number) => {
    if (isMobile) {
      const grant = filteredAndSortedGrants[index];
      if (grant && expandedGrants.has(grant.id)) {
        return 160; // Expanded mobile row
      }
      return 70; // Collapsed mobile row
    }
    return 85; // Desktop row
  };

  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedGrants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getRowHeight,
    overscan: 5,
  });

  // Re-measure when grants expand/collapse
  useEffect(() => {
    rowVirtualizer.measure();
  }, [expandedGrants, rowVirtualizer]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };


  // US CPI-U annual averages, indexed so that the most recent full year = 1.0
  // Source: Bureau of Labor Statistics, CPI-U All Items, adjusted to 2024 base
  const CPI_MULTIPLIERS: { [year: string]: number } = {
    '2012': 1.38, '2013': 1.36, '2014': 1.34, '2015': 1.34,
    '2016': 1.32, '2017': 1.29, '2018': 1.26, '2019': 1.23,
    '2020': 1.22, '2021': 1.16, '2022': 1.08, '2023': 1.04, '2024': 1.00, '2025': 1.00,
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
  ) => {
    return groups.map((group, i) => ({
      name: group,
      type: 'bar' as const,
      stack: 'total',
      data: timeLabels.map(t => {
        const val = crossTab[t]?.[group] || 0;
        return parseFloat((val * inflationMultiplier(t) / 1000000).toFixed(2));
      }),
      itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
    }));
  };

  // ECharts options (computed from filtered data)
  const getChartOption = () => {
    const {
      byYear, byYearMonth,
      funderGroups, categoryGroups,
      yearFunder, yearCategory, monthFunder, monthCategory,
    } = chartData;

    const gridYear = isMobile
      ? { left: '45px', right: '8px', top: '30px', bottom: '10%' }
      : { left: '7%', right: '20%', top: '55px', bottom: '15%' };
    const gridMonth = isMobile
      ? { left: '45px', right: '8px', top: '30px', bottom: '18%' }
      : { left: '7%', right: '20%', top: '55px', bottom: '20%' };

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

    const filteredTotal = filteredAndSortedGrants.reduce((s, g) => s + g.amount, 0);
    const totalGraphic = [{
      type: 'text' as const,
      right: 14,
      bottom: 6,
      style: {
        text: `Total: $${(filteredTotal / 1000000).toFixed(2)}M`,
        fontSize: 13,
        fontWeight: 'bold' as const,
        fill: '#666',
      },
    }];

    const breakdownTooltip = {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
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
    const legendConfig = isMobile
      ? { show: false }
      : { type: 'scroll' as const, orient: 'vertical' as const, right: 10, top: 20, bottom: 20 };
    const yAxisConfig = (max: number) => ({
      type: 'value' as const,
      name: isMobile ? '' : (adjustInflation ? '2024 USD ($M)' : 'Amount ($M)'),
      max: Math.ceil(max / 100) * 100, // Round to nearest 100
      nameTextStyle: { fontSize: 12 },
      axisLabel: {
        fontSize: isMobile ? 9 : 12,
        formatter: function(val: number) {
          if (val >= 1000) return (val / 1000).toFixed(1) + 'B';
          return Math.round(val) + 'M';
        },
      },
    });

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
            series: buildStackedSeries(yearLabels, yearFunder, funderGroups),
            grid: gridYear,
            graphic: isMobile ? [] : totalGraphic,
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
            series: buildStackedSeries(yearLabels, yearCategory, categoryGroups),
            grid: gridYear,
            graphic: isMobile ? [] : totalGraphic,
          };
        }
        return {
          animation: false,
          title: isMobile ? { show: false } : { text: 'Grants by Year', left: 'center', top: 8 },
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
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
          graphic: isMobile ? [] : totalGraphic,
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
            series: buildStackedSeries(monthLabels, monthFunder, funderGroups),
            grid: gridMonth,
            graphic: isMobile ? [] : totalGraphic,
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
            series: buildStackedSeries(monthLabels, monthCategory, categoryGroups),
            grid: gridMonth,
            graphic: isMobile ? [] : totalGraphic,
          };
        }
        return {
          animation: false,
          title: isMobile ? { show: false } : { text: 'Grants by Month', left: 'center', top: 8 },
          tooltip: {
            trigger: 'axis',
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
            itemStyle: { color: '#3b82f6' },
          }],
          grid: gridMonth,
          graphic: isMobile ? [] : totalGraphic,
        };
      }

      default:
        return {};
    }
  };

  return (
    <>
      <Head>
        <title>EA Grants Database</title>
        <meta name="description" content="Aggregated database of Effective Altruism grants" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{
        ...styles.main,
        padding: isPhonePortrait ? '12px 12px' : isMobile ? '16px 16px' : isTablet ? '20px 40px' : '20px 80px'
      }}>
        <header style={{
          ...styles.header,
          paddingTop: isMobile ? '16px' : '40px',
          marginBottom: isMobile ? '16px' : '40px'
        }}>
          <nav style={styles.nav}>
            <Link href="/" style={styles.navLink}>Home</Link>
            <Link href="/about" style={styles.navLink}>About</Link>
          </nav>
          <h1 style={{ ...styles.title, fontSize: isPhonePortrait ? '24px' : isMobile ? '28px' : '48px' }}>EA Grants Database</h1>
          <p style={{ ...styles.subtitle, fontSize: isMobile ? '13px' : '18px' }}>
            {isMobile
              ? `${metadata.totalGrants.toLocaleString()} grants · $${(metadata.totalAmount / 1e9).toFixed(1)}B`
              : `Aggregating ${metadata.totalGrants.toLocaleString()} grants totaling $${(metadata.totalAmount / 1e9).toFixed(1)}B from ${metadata.grantmakers.length} major EA grantmakers`
            }
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
            <div style={styles.resultCount}>
              {filteredAndSortedGrants.length === grants.length
                ? `${grants.length.toLocaleString()} grants`
                : `${filteredAndSortedGrants.length.toLocaleString()} of ${grants.length.toLocaleString()} grants`}
            </div>
            <div style={styles.filterAccordion}>
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('grantmaker')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Grantmaker</span>
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
                  <span style={styles.filterHeaderIcon}>{expandedFilters.fund ? '\u2212' : '+'}</span>
                </button>
                {expandedFilters.fund && (
                  <div style={styles.filterOptionsGrouped}>
                    {fundsByGrantmaker.map(group => {
                      const allSelected = group.funds.every(f => selectedFunds.includes(f));
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
                          {group.funds.map(fund => {
                            const isNonCore = fund in NON_CORE_EA_FUNDS;
                            const tooltip = isNonCore ? NON_CORE_EA_FUNDS[fund] : undefined;
                            return (
                              <label
                                key={fund}
                                style={{
                                  ...styles.filterOption,
                                  ...(isNonCore ? { opacity: 0.7, fontStyle: 'italic' } : {})
                                }}
                                title={tooltip}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedFunds.includes(fund)}
                                  onChange={() => toggleFund(fund)}
                                  style={styles.checkbox}
                                />
                                {fund}
                                {isNonCore && <span style={styles.nonCoreIndicator}>*</span>}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })}
                    <p style={styles.nonCoreNote}>
                      * Excluded by default — Policy Reform areas not generally considered part of the EA movement. Hover for details.
                    </p>
                  </div>
                )}
              </div>
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('category')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Category</span>
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
                        {displayCategory(cat)}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('subcategory')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Sub-Category</span>
                  <span style={styles.filterHeaderIcon}>{expandedFilters.subcategory ? '\u2212' : '+'}</span>
                </button>
                {expandedFilters.subcategory && (
                  <div style={styles.filterOptions}>
                    {availableSubcategories.map(sub => (
                      <label key={sub} style={styles.filterOption}>
                        <input
                          type="checkbox"
                          checked={selectedSubcategories.includes(sub)}
                          onChange={() => toggleSubcategory(sub)}
                          style={styles.checkbox}
                        />
                        {sub}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={styles.filterSection}>
                <button
                  onClick={() => toggleFilter('year')}
                  style={styles.filterHeader}
                >
                  <span style={styles.filterHeaderLabel}>Funding Year</span>
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
          <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? '22px' : '28px' }}>Visualizations</h2>
          <div style={{
            ...styles.chartControlsRow,
            ...(isPhonePortrait ? { gap: '4px', fontSize: '12px' } : isMobile ? { gap: '6px' } : {})
          }}>
              <button
                onClick={() => setChartView('year')}
                style={{
                  ...styles.chartTab,
                  ...(chartView === 'year' ? styles.chartTabActive : {}),
                  ...(isMobile ? { padding: '6px 10px', fontSize: '12px' } : {}),
                }}
              >
                {isPhonePortrait ? 'Year' : 'By Year'}
              </button>
              <button
                onClick={() => setChartView('month')}
                style={{
                  ...styles.chartTab,
                  ...(chartView === 'month' ? styles.chartTabActive : {}),
                  ...(isMobile ? { padding: '6px 10px', fontSize: '12px' } : {}),
                }}
              >
                {isPhonePortrait ? 'Month' : 'By Month'}
              </button>
              {!isPhonePortrait && <span style={styles.controlsDivider} />}
              {!isPhonePortrait && <span style={styles.breakdownLabel}>Break down by:</span>}
              <button
                onClick={() => setTimeBreakdown('total')}
                style={{
                  ...styles.breakdownTab,
                  ...(timeBreakdown === 'total' ? styles.breakdownTabActive : {}),
                  ...(isMobile ? { padding: '5px 8px', fontSize: '11px' } : {}),
                }}
              >
                Total
              </button>
              <button
                onClick={() => setTimeBreakdown('byFunder')}
                style={{
                  ...styles.breakdownTab,
                  ...(timeBreakdown === 'byFunder' ? styles.breakdownTabActive : {}),
                  ...(isMobile ? { padding: '5px 8px', fontSize: '11px' } : {}),
                }}
              >
                {isPhonePortrait ? 'Funder' : 'By Funder'}
              </button>
              <button
                onClick={() => setTimeBreakdown('byCategory')}
                style={{
                  ...styles.breakdownTab,
                  ...(timeBreakdown === 'byCategory' ? styles.breakdownTabActive : {}),
                  ...(isMobile ? { padding: '5px 8px', fontSize: '11px' } : {}),
                }}
              >
                {isPhonePortrait ? 'Category' : 'By Category'}
              </button>
              {!isMobile && <span style={styles.controlsDivider} />}
              <label style={{
                ...styles.inflationToggle,
                ...(isMobile ? { fontSize: '11px', flexBasis: '100%', marginTop: '4px' } : {})
              }}>
                <input
                  type="checkbox"
                  checked={adjustInflation}
                  onChange={() => setAdjustInflation(!adjustInflation)}
                  style={{ cursor: 'pointer' }}
                />
                {isMobile ? 'Inflation-adjusted (2024$)' : 'Adjust for inflation (constant 2024 dollars)'}
              </label>
            </div>
          <div style={{ ...styles.chartDisclaimer, fontSize: isMobile ? '11px' : '12px' }}>
            2025 data is partial and reflects only grants published to date.
          </div>
          <div style={{
            ...styles.chartContainer,
            padding: isPhonePortrait ? '4px 0' : isMobile ? '4px 0' : '6px 0',
          }}>
            <ReactECharts
              option={getChartOption()}
              notMerge={true}
              lazyUpdate={true}
              style={{ height: isPhonePortrait ? '260px' : isMobile ? '300px' : '400px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        </section>

        {/* Grants List with Virtualization */}
        <section style={styles.section}>
          <div style={{
            ...styles.grantsHeader,
            ...(isMobile ? { flexDirection: 'column', alignItems: 'flex-start', gap: '10px' } : {})
          }}>
            <h2 style={{ ...styles.sectionTitle, fontSize: isMobile ? '22px' : '28px', marginBottom: 0 }}>Grants</h2>
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
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {isMobile ? (
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
                        {grant.title && grant.title !== grant.recipient && (
                          <p style={styles.grantDesc}>{grant.title}</p>
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
                          <span style={styles.expandIndicator}>{expandedGrants.has(grant.id) ? '▲' : '▼'}</span>
                        </div>
                        {expandedGrants.has(grant.id) && (
                          <div style={styles.grantMobileExpanded}>
                            {grant.fund && (
                              <div style={styles.expandedRow}>
                                <span style={styles.expandedLabel}>Fund:</span>
                                <span>{grant.fund}</span>
                              </div>
                            )}
                            <div style={styles.expandedRow}>
                              <span style={styles.expandedLabel}>Category:</span>
                              <span>{displayCategory(grant.category)}</span>
                            </div>
                            {grant.focus_area && grant.focus_area !== displayCategory(grant.category) && (
                              <div style={styles.expandedRow}>
                                <span style={styles.expandedLabel}>Focus:</span>
                                <span>{grant.focus_area}</span>
                              </div>
                            )}
                            <div style={styles.expandedRow}>
                              <span style={styles.expandedLabel}>Date:</span>
                              <span>{format(parseISO(grant.date), 'MMMM d, yyyy')}</span>
                            </div>
                            {getGrantUrl(grant) && (
                              <div style={styles.expandedRow}>
                                <a
                                  href={getGrantUrl(grant)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={styles.expandedLink}
                                  onClick={e => e.stopPropagation()}
                                >
                                  View on {grant.grantmaker} →
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={styles.grantRow}>
                        <div style={styles.grantLeft}>
                          <h3 style={styles.grantTitle}>
                            {(() => {
                              const url = getGrantUrl(grant);
                              return url
                                ? <a href={url} target="_blank" rel="noopener noreferrer" style={styles.grantTitleLink}>{grant.recipient}</a>
                                : grant.recipient;
                            })()}
                          </h3>
                          {grant.title && grant.title !== grant.recipient && (
                            <p style={styles.grantDescFull}>{grant.title}</p>
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
                          {grant.focus_area && grant.focus_area !== grant.category && grant.focus_area !== displayCategory(grant.category) && (
                            <span style={{
                              ...styles.subTag,
                              borderColor: (categoryColorMap[grant.category || ''] || '#999') + 'aa',
                              color: categoryColorMap[grant.category || ''] || '#999',
                            }}>{grant.focus_area}</span>
                          )}
                        </div>
                        <div style={styles.grantAmountCol}>{formatCurrency(grant.amount)}</div>
                        <div style={styles.grantDateCol}>{format(parseISO(grant.date), 'MM/dd/yyyy')}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={{
          ...styles.footer,
          marginTop: isMobile ? '30px' : '60px',
          paddingTop: isMobile ? '20px' : '40px'
        }}>
          <p style={styles.footerText}>
            Last updated: {format(parseISO(metadata.lastUpdated), 'MMM d, yyyy')}
          </p>
          <p style={styles.footerLinks}>
            <a href="https://github.com/Brian-Foerster/EAGrantsDatabase" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>GitHub</a>
            {' · '}
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSceNe8T97Z36LvBmepyid68MYbyairBvZucnZFlREGROSBOZA/viewform" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>Feedback</a>
          </p>
        </footer>
      </main>
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px 80px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
    paddingTop: '40px',
  },
  nav: {
    display: 'flex',
    justifyContent: 'center',
    gap: '30px',
    marginBottom: '30px',
  },
  navLink: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#3b82f6',
    textDecoration: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  title: {
    fontSize: '48px',
    fontWeight: 'bold',
    marginBottom: '10px',
    color: '#1a202c',
  },
  subtitle: {
    fontSize: '18px',
    color: '#666',
  },
  resultCount: {
    fontSize: '13px',
    color: '#888',
    marginTop: '6px',
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
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
    backgroundColor: '#3b82f6',
    color: 'white',
    borderColor: '#3b82f6',
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
    marginBottom: '6px',
  },
  filtersContainer: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
  selectAllButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
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
    accentColor: '#3b82f6',
  },
  nonCoreIndicator: {
    marginLeft: '4px',
    color: '#999',
    fontSize: '12px',
  },
  nonCoreNote: {
    fontSize: '12px',
    color: '#888',
    fontStyle: 'italic',
    marginTop: '12px',
    paddingTop: '8px',
    borderTop: '1px solid #e5e5e5',
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
  sortControls: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  virtualListContainer: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '0 16px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  virtualListScroll: {
    height: '800px',
    overflow: 'auto',
  },
  listHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 220px 10px 280px 110px 100px',
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
  grantRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 220px 10px 280px 110px 100px',
    alignItems: 'start',
    gap: '8px',
    padding: '10px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  grantRowMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px 0',
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
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
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
    minWidth: '60px',
  },
  expandedLink: {
    color: '#3b82f6',
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
    margin: '3px 0 0 0',
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.4',
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
    color: '#3b82f6',
    textDecoration: 'none',
  },
};

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  
  const grants = JSON.parse(fs.readFileSync(path.join(dataDir, 'grants.min.json'), 'utf-8'));
  const metadata = JSON.parse(fs.readFileSync(path.join(dataDir, 'metadata.json'), 'utf-8'));
  const searchIndexData = JSON.parse(fs.readFileSync(path.join(dataDir, 'search-index.json'), 'utf-8'));

  return {
    props: {
      grants,
      metadata,
      searchIndexData,
    },
  };
};
