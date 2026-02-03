import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Grant, AggregatedData, GrantSource } from '../types/grants';
import { format, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { aggregateAllGrants } from '../lib/aggregator';
import { GetStaticProps } from 'next';

const sources: GrantSource[] = [
  {
    name: 'EA Funds',
    url: 'https://funds.effectivealtruism.org/grants'
  },
  {
    name: 'GiveWell',
    url: 'https://www.givewell.org/research/all-grants'
  },
  {
    name: 'Coefficient Giving',
    url: 'https://coefficientgiving.org/funds/'
  }
];

interface HomeProps {
  data: AggregatedData;
}

export default function Home({ data }: HomeProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrantmaker, setSelectedGrantmaker] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredAndSortedGrants = useMemo(() => {
    if (!data) return [];

    let filtered = data.grants.filter(grant => {
      const matchesSearch = 
        grant.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        grant.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (grant.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
      
      const matchesGrantmaker = selectedGrantmaker === 'all' || grant.grantmaker === selectedGrantmaker;
      const matchesCategory = selectedCategory === 'all' || grant.category === selectedCategory;
      
      return matchesSearch && matchesGrantmaker && matchesCategory;
    });

    // Sort grants
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else {
        return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
    });

    return filtered;
  }, [data, searchTerm, selectedGrantmaker, selectedCategory, sortBy, sortOrder]);

  const chartData = useMemo(() => {
    if (!data) return [];

    // Group grants by month
    const groupedByMonth: { [key: string]: { count: number; total: number } } = {};
    
    data.grants.forEach(grant => {
      const monthKey = format(parseISO(grant.date), 'MMM yyyy');
      if (!groupedByMonth[monthKey]) {
        groupedByMonth[monthKey] = { count: 0, total: 0 };
      }
      groupedByMonth[monthKey].count += 1;
      groupedByMonth[monthKey].total += grant.amount;
    });

    return Object.entries(groupedByMonth)
      .map(([month, data]) => ({
        month,
        count: data.count,
        total: data.total / 1000000 // Convert to millions
      }))
      .sort((a, b) => {
        const dateA = parseISO('01 ' + a.month);
        const dateB = parseISO('01 ' + b.month);
        return dateA.getTime() - dateB.getTime();
      });
  }, [data]);

  const grantmakers = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.grants.map(g => g.grantmaker)));
  }, [data]);

  const categories = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.grants.map(g => g.category).filter(Boolean) as string[]));
  }, [data]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
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
            Aggregating grants from {data?.sources.length} major EA grantmakers
          </p>
        </header>

        {/* Statistics */}
        <div style={styles.statsContainer}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{data?.totalGrants}</div>
            <div style={styles.statLabel}>Total Grants</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{formatCurrency(data?.totalAmount ?? 0)}</div>
            <div style={styles.statLabel}>Total Amount</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{filteredAndSortedGrants.length}</div>
            <div style={styles.statLabel}>Filtered Results</div>
          </div>
        </div>

        {/* Charts */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Grants Over Time</h2>
          <div style={styles.chartContainer}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis label={{ value: 'Amount ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#10b981" name="Total Amount ($M)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Filters */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Search and Filter</h2>
          <div style={styles.filtersContainer}>
            <input
              type="text"
              placeholder="Search grants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
            <div style={styles.filterRow}>
              <select
                value={selectedGrantmaker}
                onChange={(e) => setSelectedGrantmaker(e.target.value)}
                style={styles.select}
              >
                <option value="all">All Grantmakers</option>
                {grantmakers.map(gm => (
                  <option key={gm} value={gm}>{gm}</option>
                ))}
              </select>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={styles.select}
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
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
        </section>

        {/* Grants List */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Grants ({filteredAndSortedGrants.length})</h2>
          <div style={styles.grantsList}>
            {filteredAndSortedGrants.map(grant => (
              <div key={grant.id} style={styles.grantCard}>
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
                {grant.description && (
                  <p style={styles.grantDescription}>{grant.description}</p>
                )}
                {grant.url && (
                  <a href={grant.url} target="_blank" rel="noopener noreferrer" style={styles.grantLink}>
                    View Details →
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Sources */}
        <footer style={styles.footer}>
          <h3 style={styles.footerTitle}>Data Sources</h3>
          <div style={styles.sourcesList}>
            {data?.sources.map(source => (
              <a
                key={source.name}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.sourceLink}
              >
                {source.name}
              </a>
            ))}
          </div>
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
  },
  loader: {
    fontSize: '18px',
    color: '#666',
  },
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
  filtersContainer: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  searchInput: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    marginBottom: '15px',
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
    transition: 'all 0.2s',
  },
  grantsList: {
    display: 'grid',
    gap: '20px',
  },
  grantCard: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  grantHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
    gap: '15px',
  },
  grantTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1a202c',
    flex: 1,
  },
  grantAmount: {
    fontSize: '20px',
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
  grantDescription: {
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.6',
    marginBottom: '12px',
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
  footerTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '15px',
    color: '#1a202c',
  },
  sourcesList: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    flexWrap: 'wrap',
  },
  sourceLink: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
};

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const grants = await aggregateAllGrants();
  const totalAmount = grants.reduce((sum, grant) => sum + grant.amount, 0);
  
  const data: AggregatedData = {
    grants,
    sources,
    totalGrants: grants.length,
    totalAmount,
    lastUpdated: new Date().toISOString()
  };

  return {
    props: {
      data,
    },
  };
};
