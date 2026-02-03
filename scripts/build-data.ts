/**
 * Data build pipeline
 * Processes raw grant data and generates:
 * 1. Minimized JSON for UI
 * 2. Pre-aggregated data cubes for charts
 * 3. Search index for client-side search
 */

import * as fs from 'fs';
import * as path from 'path';
import MiniSearch from 'minisearch';
import { Grant } from '../types/grants';
import { aggregateAllGrants } from '../lib/aggregator';

// Output directories
const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public', 'data');
const AGG_DIR = path.join(PUBLIC_DATA_DIR, 'agg');

// Ensure directories exist
function ensureDirectories() {
  [PUBLIC_DATA_DIR, AGG_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Normalize grant data at build time
function normalizeGrant(grant: Grant): Grant {
  return {
    ...grant,
    // Ensure consistent date format
    date: new Date(grant.date).toISOString(),
    // Normalize currency to USD (in real implementation, convert currencies)
    amount: grant.amount,
    currency: 'USD',
    // Clean up strings
    title: grant.title.trim(),
    recipient: grant.recipient.trim(),
    grantmaker: grant.grantmaker.trim(),
    description: grant.description?.trim() || '',
    category: grant.category?.trim() || '',
    focus_area: grant.focus_area?.trim() || '',
  };
}

// Extract year and month from date
function getYearMonth(dateString: string): { year: number; month: number; yearMonth: string } {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  return { year, month, yearMonth };
}

// Generate pre-aggregated data by year
function aggregateByYear(grants: Grant[]) {
  const byYear: { [year: string]: { count: number; total: number } } = {};
  
  grants.forEach(grant => {
    const { year } = getYearMonth(grant.date);
    const yearKey = String(year);
    
    if (!byYear[yearKey]) {
      byYear[yearKey] = { count: 0, total: 0 };
    }
    
    byYear[yearKey].count += 1;
    byYear[yearKey].total += grant.amount;
  });
  
  return Object.entries(byYear)
    .map(([year, data]) => ({
      year: parseInt(year),
      count: data.count,
      total: data.total,
      average: data.total / data.count,
    }))
    .sort((a, b) => a.year - b.year);
}

// Generate pre-aggregated data by year and month
function aggregateByYearMonth(grants: Grant[]) {
  const byYearMonth: { [yearMonth: string]: { count: number; total: number } } = {};
  
  grants.forEach(grant => {
    const { yearMonth } = getYearMonth(grant.date);
    
    if (!byYearMonth[yearMonth]) {
      byYearMonth[yearMonth] = { count: 0, total: 0 };
    }
    
    byYearMonth[yearMonth].count += 1;
    byYearMonth[yearMonth].total += grant.amount;
  });
  
  return Object.entries(byYearMonth)
    .map(([yearMonth, data]) => ({
      yearMonth,
      count: data.count,
      total: data.total,
      average: data.total / data.count,
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

// Generate pre-aggregated data by funder
function aggregateByFunder(grants: Grant[]) {
  const byFunder: { [funder: string]: { count: number; total: number } } = {};
  
  grants.forEach(grant => {
    const funder = grant.grantmaker;
    
    if (!byFunder[funder]) {
      byFunder[funder] = { count: 0, total: 0 };
    }
    
    byFunder[funder].count += 1;
    byFunder[funder].total += grant.amount;
  });
  
  return Object.entries(byFunder)
    .map(([funder, data]) => ({
      funder,
      count: data.count,
      total: data.total,
      average: data.total / data.count,
    }))
    .sort((a, b) => b.total - a.total);
}

// Generate pre-aggregated data by category
function aggregateByCategory(grants: Grant[]) {
  const byCategory: { [category: string]: { count: number; total: number } } = {};
  
  grants.forEach(grant => {
    const category = grant.category || 'Uncategorized';
    
    if (!byCategory[category]) {
      byCategory[category] = { count: 0, total: 0 };
    }
    
    byCategory[category].count += 1;
    byCategory[category].total += grant.amount;
  });
  
  return Object.entries(byCategory)
    .map(([category, data]) => ({
      category,
      count: data.count,
      total: data.total,
      average: data.total / data.count,
    }))
    .sort((a, b) => b.total - a.total);
}

// Generate pre-aggregated data by year and category
function aggregateByYearAndCategory(grants: Grant[]) {
  const byYearCategory: { [key: string]: { count: number; total: number } } = {};
  
  grants.forEach(grant => {
    const { year } = getYearMonth(grant.date);
    const category = grant.category || 'Uncategorized';
    const key = `${year}:${category}`;
    
    if (!byYearCategory[key]) {
      byYearCategory[key] = { count: 0, total: 0 };
    }
    
    byYearCategory[key].count += 1;
    byYearCategory[key].total += grant.amount;
  });
  
  return Object.entries(byYearCategory)
    .map(([key, data]) => {
      const [year, category] = key.split(':');
      return {
        year: parseInt(year),
        category,
        count: data.count,
        total: data.total,
        average: data.total / data.count,
      };
    })
    .sort((a, b) => a.year - b.year || a.category.localeCompare(b.category));
}

// Create search index
function createSearchIndex(grants: Grant[]) {
  const miniSearch = new MiniSearch({
    fields: ['title', 'recipient', 'description', 'category', 'grantmaker'],
    storeFields: ['id', 'title', 'recipient', 'amount', 'date', 'grantmaker', 'category'],
    searchOptions: {
      boost: { title: 2, recipient: 1.5, description: 1 },
      fuzzy: 0.2,
      prefix: true,
    }
  });

  miniSearch.addAll(grants.map(grant => ({
    id: grant.id,
    title: grant.title,
    recipient: grant.recipient,
    description: grant.description || '',
    category: grant.category || '',
    grantmaker: grant.grantmaker,
    amount: grant.amount,
    date: grant.date,
  })));

  return JSON.stringify(miniSearch);
}

// Create minimized grant data (only essential fields for listing)
function createMinimizedGrants(grants: Grant[]) {
  return grants.map(grant => ({
    id: grant.id,
    title: grant.title,
    recipient: grant.recipient,
    amount: grant.amount,
    currency: grant.currency,
    date: grant.date,
    grantmaker: grant.grantmaker,
    category: grant.category,
    url: grant.url,
  }));
}

// Main build function
async function buildData() {
  console.log('🚀 Starting data build pipeline...');
  
  // Ensure output directories exist
  ensureDirectories();
  
  // Fetch and normalize all grants
  console.log('📦 Fetching grants data...');
  const rawGrants = await aggregateAllGrants();
  const grants = rawGrants.map(normalizeGrant);
  console.log(`✅ Fetched ${grants.length} grants`);
  
  // Generate minimized grants
  console.log('📝 Generating minimized grants data...');
  const minGrants = createMinimizedGrants(grants);
  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, 'grants.min.json'),
    JSON.stringify(minGrants)
  );
  console.log('✅ Created grants.min.json');
  
  // Generate full grants (with descriptions)
  console.log('📝 Generating full grants data...');
  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, 'grants.full.json'),
    JSON.stringify(grants)
  );
  console.log('✅ Created grants.full.json');
  
  // Generate search index
  console.log('🔍 Creating search index...');
  const searchIndex = createSearchIndex(grants);
  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, 'search-index.json'),
    searchIndex
  );
  console.log('✅ Created search-index.json');
  
  // Generate aggregations
  console.log('📊 Generating aggregations...');
  
  const byYear = aggregateByYear(grants);
  fs.writeFileSync(
    path.join(AGG_DIR, 'by_year.json'),
    JSON.stringify(byYear)
  );
  console.log('✅ Created by_year.json');
  
  const byYearMonth = aggregateByYearMonth(grants);
  fs.writeFileSync(
    path.join(AGG_DIR, 'by_year_month.json'),
    JSON.stringify(byYearMonth)
  );
  console.log('✅ Created by_year_month.json');
  
  const byFunder = aggregateByFunder(grants);
  fs.writeFileSync(
    path.join(AGG_DIR, 'by_funder.json'),
    JSON.stringify(byFunder)
  );
  console.log('✅ Created by_funder.json');
  
  const byCategory = aggregateByCategory(grants);
  fs.writeFileSync(
    path.join(AGG_DIR, 'by_category.json'),
    JSON.stringify(byCategory)
  );
  console.log('✅ Created by_category.json');
  
  const byYearCategory = aggregateByYearAndCategory(grants);
  fs.writeFileSync(
    path.join(AGG_DIR, 'by_year_category.json'),
    JSON.stringify(byYearCategory)
  );
  console.log('✅ Created by_year_category.json');
  
  // Generate metadata
  const metadata = {
    totalGrants: grants.length,
    totalAmount: grants.reduce((sum, g) => sum + g.amount, 0),
    grantmakers: Array.from(new Set(grants.map(g => g.grantmaker))),
    categories: Array.from(new Set(grants.map(g => g.category).filter(Boolean))),
    dateRange: {
      earliest: grants.reduce((min, g) => g.date < min ? g.date : min, grants[0]?.date || ''),
      latest: grants.reduce((max, g) => g.date > max ? g.date : max, grants[0]?.date || ''),
    },
    lastUpdated: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  console.log('✅ Created metadata.json');
  
  console.log('🎉 Data build complete!');
  console.log(`   Total grants: ${grants.length}`);
  console.log(`   Total amount: $${(metadata.totalAmount / 1000000).toFixed(2)}M`);
}

// Run the build
buildData().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
