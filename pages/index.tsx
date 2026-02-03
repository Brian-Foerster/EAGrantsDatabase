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

interface MinGrant {
  id: string;
  title: string;
  recipient: string;
  amount: number;
  currency: string;
  date: string;
  grantmaker: string;
  category?: string;
  url?: string;
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

interface AggByYear {
  year: number;
  count: number;
  total: number;
  average: number;
}

interface AggByYearMonth {
  yearMonth: string;
  count: number;
  total: number;
  average: number;
}

interface AggByFunder {
  funder: string;
  count: number;
  total: number;
  average: number;
}

interface AggByCategory {
  category: string;
  count: number;
  total: number;
  average: number;
}

interface HomeProps {
  grants: MinGrant[];
  metadata: Metadata;
  searchIndexData: any;
  aggByYear: AggByYear[];
  aggByYearMonth: AggByYearMonth[];
  aggByFunder: AggByFunder[];
  aggByCategory: AggByCategory[];
}

export default function Home({ 
  grants, 
  metadata, 
  searchIndexData,
  aggByYear,
  aggByYearMonth,
  aggByFunder,
  aggByCategory 
}: HomeProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrantmaker, setSelectedGrantmaker] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [miniSearch, setMiniSearch] = useState<MiniSearch | null>(null);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [chartView, setChartView] = useState<'year' | 'month' | 'funder' | 'category'>('month');
  
  const parentRef = useRef<HTMLDivElement>(null);

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
    if (searchTerm.trim() && searchResults.length > 0) {
      const resultIds = new Set(searchResults);
      filtered = filtered.filter(grant => resultIds.has(grant.id));
    }

    // Apply grantmaker filter
    if (selectedGrantmaker !== 'all') {
      filtered = filtered.filter(grant => grant.grantmaker === selectedGrantmaker);
    }

    // Apply category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(grant => grant.category === selectedCategory);
    }

    // Sort grants
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else {
        return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
    });

    return sorted;
  }, [grants, searchTerm, searchResults, selectedGrantmaker, selectedCategory, sortBy, sortOrder]);

  // Virtualization
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedGrants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 5,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // ECharts options
  const getChartOption = () => {
    switch (chartView) {
      case 'year':
        return {
          title: {
            text: 'Grants by Year',
            left: 'center',
          },
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            },
            formatter: (params: any) => {
              const data = params[0];
              return `${data.name}<br/>Count: ${data.value.toLocaleString()}<br/>Total: $${(aggByYear[data.dataIndex].total / 1000000).toFixed(2)}M`;
            }
          },
          xAxis: {
            type: 'category',
            data: aggByYear.map(d => d.year),
          },
          yAxis: {
            type: 'value',
            name: 'Number of Grants',
          },
          series: [{
            name: 'Grants',
            type: 'bar',
            data: aggByYear.map(d => d.count),
            itemStyle: {
              color: '#10b981',
            },
          }],
          grid: {
            left: '10%',
            right: '10%',
            bottom: '15%',
          },
        };

      case 'month':
        return {
          title: {
            text: 'Grants Over Time',
            left: 'center',
          },
          tooltip: {
            trigger: 'axis',
            formatter: (params: any) => {
              const data = params[0];
              const monthData = aggByYearMonth[data.dataIndex];
              return `${data.name}<br/>Total: $${(monthData.total / 1000000).toFixed(2)}M<br/>Count: ${monthData.count}`;
            }
          },
          xAxis: {
            type: 'category',
            data: aggByYearMonth.map(d => d.yearMonth),
            axisLabel: {
              rotate: 45,
              interval: Math.floor(aggByYearMonth.length / 12),
            },
          },
          yAxis: {
            type: 'value',
            name: 'Total Amount ($M)',
          },
          series: [{
            name: 'Amount',
            type: 'line',
            smooth: true,
            data: aggByYearMonth.map(d => (d.total / 1000000).toFixed(2)),
            itemStyle: {
              color: '#3b82f6',
            },
            areaStyle: {
              color: 'rgba(59, 130, 246, 0.2)',
            },
          }],
          grid: {
            left: '10%',
            right: '10%',
            bottom: '20%',
          },
        };

      case 'funder':
        return {
          title: {
            text: 'Top Grantmakers',
            left: 'center',
          },
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            },
            formatter: (params: any) => {
              const data = params[0];
              const funder = aggByFunder[data.dataIndex];
              return `${data.name}<br/>Total: $${(funder.total / 1000000).toFixed(2)}M<br/>Count: ${funder.count}<br/>Avg: ${formatCurrency(funder.average)}`;
            }
          },
          xAxis: {
            type: 'value',
            name: 'Total Amount ($M)',
          },
          yAxis: {
            type: 'category',
            data: aggByFunder.map(d => d.funder),
          },
          series: [{
            name: 'Total',
            type: 'bar',
            data: aggByFunder.map(d => (d.total / 1000000).toFixed(2)),
            itemStyle: {
              color: '#8b5cf6',
            },
          }],
          grid: {
            left: '20%',
            right: '10%',
            bottom: '10%',
          },
        };

      case 'category':
        return {
          title: {
            text: 'Grants by Category',
            left: 'center',
          },
          tooltip: {
            trigger: 'item',
            formatter: (params: any) => {
              return `${params.name}<br/>Count: ${params.data.count}<br/>Total: $${(params.value / 1000000).toFixed(2)}M`;
            }
          },
          series: [{
            name: 'Category',
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: true,
              formatter: '{b}: {d}%'
            },
            data: aggByCategory.map(d => ({
              name: d.category,
              value: d.total,
              count: d.count,
            })),
          }],
        };

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
      <main style={styles.main}>
        <header style={styles.header}>
          <nav style={styles.nav}>
            <Link href="/" style={styles.navLink}>Home</Link>
            <Link href="/about" style={styles.navLink}>About</Link>
          </nav>
          <h1 style={styles.title}>EA Grants Database</h1>
          <p style={styles.subtitle}>
            Aggregating {metadata.totalGrants.toLocaleString()} grants from {metadata.grantmakers.length} major EA grantmakers
          </p>
        </header>

        {/* Search and Filter */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Search and Filter</h2>
          <div style={styles.filtersContainer}>
            <div style={styles.searchContainer}>
              <input
                type="text"
                placeholder="Search grants... (powered by MiniSearch)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <div style={styles.filterRow}>
              <select
                value={selectedGrantmaker}
                onChange={(e) => setSelectedGrantmaker(e.target.value)}
                style={styles.select}
              >
                <option value="all">All Grantmakers</option>
                {metadata.grantmakers.map(gm => (
                  <option key={gm} value={gm}>{gm}</option>
                ))}
              </select>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={styles.select}
              >
                <option value="all">All Categories</option>
                {metadata.categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Statistics */}
        <div style={styles.statsContainer}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{metadata.totalGrants.toLocaleString()}</div>
            <div style={styles.statLabel}>Total Grants</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{formatCurrency(metadata.totalAmount)}</div>
            <div style={styles.statLabel}>Total Amount</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{filteredAndSortedGrants.length.toLocaleString()}</div>
            <div style={styles.statLabel}>Filtered Results</div>
          </div>
        </div>

        {/* Charts */}
        <section style={styles.section}>
          <div style={styles.chartHeader}>
            <h2 style={styles.sectionTitle}>Visualizations</h2>
            <div style={styles.chartTabs}>
              <button
                onClick={() => setChartView('month')}
                style={{
                  ...styles.chartTab,
                  ...(chartView === 'month' ? styles.chartTabActive : {}),
                }}
              >
                Timeline
              </button>
              <button
                onClick={() => setChartView('year')}
                style={{
                  ...styles.chartTab,
                  ...(chartView === 'year' ? styles.chartTabActive : {}),
                }}
              >
                By Year
              </button>
              <button
                onClick={() => setChartView('funder')}
                style={{
                  ...styles.chartTab,
                  ...(chartView === 'funder' ? styles.chartTabActive : {}),
                }}
              >
                By Funder
              </button>
              <button
                onClick={() => setChartView('category')}
                style={{
                  ...styles.chartTab,
                  ...(chartView === 'category' ? styles.chartTabActive : {}),
                }}
              >
                By Category
              </button>
            </div>
          </div>
          <div style={styles.chartContainer}>
            <ReactECharts 
              option={getChartOption()} 
              style={{ height: '400px', width: '100%' }}
              opts={{ renderer: 'canvas' }}
            />
          </div>
        </section>

        {/* Grants List with Virtualization */}
        <section style={styles.section}>
          <div style={styles.grantsHeader}>
            <h2 style={styles.sectionTitle}>Grants ({filteredAndSortedGrants.length.toLocaleString()})</h2>
            <div style={styles.sortControls}>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'amount')}
                style={styles.select}
              >
                <option value="date">Sort by Date</option>
                <option value="amount">Sort by Amount</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                style={styles.sortButton}
              >
                {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
              </button>
            </div>
          </div>
          
          <div 
            ref={parentRef}
            style={styles.virtualListContainer}
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
                    <div style={styles.grantCard}>
                      <div style={styles.grantHeader}>
                        <h3 style={styles.grantTitle}>{grant.title}</h3>
                        <div style={styles.grantAmount}>{formatCurrency(grant.amount)}</div>
                      </div>
                      <div style={styles.grantMeta}>
                        <span style={styles.grantRecipient}>{grant.recipient}</span>
                        <span style={styles.grantDate}>
                          {format(parseISO(grant.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <div style={styles.grantTags}>
                        <span style={styles.tag}>{grant.grantmaker}</span>
                        {grant.category && <span style={styles.tag}>{grant.category}</span>}
                      </div>
                      {grant.url && (
                        <a href={grant.url} target="_blank" rel="noopener noreferrer" style={styles.grantLink}>
                          View Details →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer style={styles.footer}>
          <p style={styles.footerText}>
            Last updated: {format(parseISO(metadata.lastUpdated), 'MMM d, yyyy')}
          </p>
          <p style={styles.footerText}>
            Built with Next.js • Static Export • Pre-computed Analytics • Client-side Search
          </p>
        </footer>
      </main>
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
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
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '40px',
  },
  statCard: {
    backgroundColor: 'white',
    padding: '30px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: '8px',
  },
  statLabel: {
    fontSize: '14px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
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
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '15px',
  },
  chartTabs: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
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
  filterRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  select: {
    flex: '1',
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
    height: '800px',
    overflow: 'auto',
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '10px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  grantCard: {
    backgroundColor: '#f9fafb',
    padding: '20px',
    marginBottom: '10px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  grantHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
    gap: '15px',
  },
  grantTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1a202c',
    flex: 1,
    margin: 0,
  },
  grantAmount: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#10b981',
    whiteSpace: 'nowrap',
  },
  grantMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
    fontSize: '14px',
    color: '#666',
  },
  grantRecipient: {
    fontWeight: '500',
  },
  grantDate: {
    color: '#666',
  },
  grantTags: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  tag: {
    display: 'inline-block',
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#e5e7eb',
    borderRadius: '12px',
    color: '#374151',
  },
  grantLink: {
    display: 'inline-block',
    color: '#3b82f6',
    fontSize: '14px',
    fontWeight: '500',
    textDecoration: 'none',
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
};

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const aggDir = path.join(dataDir, 'agg');
  
  const grants = JSON.parse(fs.readFileSync(path.join(dataDir, 'grants.min.json'), 'utf-8'));
  const metadata = JSON.parse(fs.readFileSync(path.join(dataDir, 'metadata.json'), 'utf-8'));
  const searchIndexData = JSON.parse(fs.readFileSync(path.join(dataDir, 'search-index.json'), 'utf-8'));
  const aggByYear = JSON.parse(fs.readFileSync(path.join(aggDir, 'by_year.json'), 'utf-8'));
  const aggByYearMonth = JSON.parse(fs.readFileSync(path.join(aggDir, 'by_year_month.json'), 'utf-8'));
  const aggByFunder = JSON.parse(fs.readFileSync(path.join(aggDir, 'by_funder.json'), 'utf-8'));
  const aggByCategory = JSON.parse(fs.readFileSync(path.join(aggDir, 'by_category.json'), 'utf-8'));

  return {
    props: {
      grants,
      metadata,
      searchIndexData,
      aggByYear,
      aggByYearMonth,
      aggByFunder,
      aggByCategory,
    },
  };
};
