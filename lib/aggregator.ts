import * as fs from 'fs';
import * as path from 'path';
import { Grant } from '../types/grants';

const SCRAPED_DATA_PATH = path.join(process.cwd(), 'lib', 'scraped-grants.json');
// PROTOTYPE: optional regrant sources (e.g. BlueDot) merged in at build time.
// Kept out of the committed scraped data; delete the file to disable.
const REGRANT_PROTOTYPE_PATHS = [
  path.join(process.cwd(), 'data', 'raw', 'bluedot-regrants.json'),
  path.join(process.cwd(), 'data', 'raw', 'manifund-regrants.json'),
];

function loadRegrantPrototypes(): Grant[] {
  const extra: Grant[] = [];
  for (const p of REGRANT_PROTOTYPE_PATHS) {
    if (!fs.existsSync(p)) continue;
    try {
      const g = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Array.isArray(g) && g.length) {
        extra.push(...g);
        console.log(`[prototype] Merged ${g.length} regrant grants from ${path.basename(p)}`);
      }
    } catch (err) {
      console.error(`[prototype] Failed to read ${p}:`, err);
    }
  }
  return extra;
}

/**
 * Load grants from scraped data file if available,
 * otherwise fall back to mock data.
 */
export async function aggregateAllGrants(): Promise<Grant[]> {
  // Use scraped data if available
  if (fs.existsSync(SCRAPED_DATA_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SCRAPED_DATA_PATH, 'utf-8'));
      console.log(`Loaded ${data.length} grants from scraped data`);
      return [...data, ...loadRegrantPrototypes()];
    } catch (err) {
      console.error('Error reading scraped data, falling back to mock:', err);
    }
  }

  console.log('No scraped data found, using mock data');
  console.log('To use real data:');
  console.log('  - If you have a CSV file in data/ea-grants-database.csv, run: npm run import-csv');
  console.log('  - Or scrape fresh data by running: npm run scrape');
  return getMockGrants();
}

function getMockGrants(): Grant[] {
  return [
    {
      id: 'eaf-001',
      title: 'AI Safety Research Grant',
      recipient: 'AI Safety Institute',
      amount: 500000,
      currency: 'USD',
      date: '2024-01-15',
      grantmaker: 'EA Funds',
      description: 'Research into AI alignment and safety',
      category: 'LTXR',
      focus_area: 'Alignment Research',
      fund: 'Long-Term Future Fund',
    },
    {
      id: 'eaf-002',
      title: 'Global Health Initiative',
      recipient: 'Health Research Organization',
      amount: 250000,
      currency: 'USD',
      date: '2024-02-20',
      grantmaker: 'EA Funds',
      description: 'Malaria prevention research',
      category: 'GH',
      focus_area: 'Disease Prevention',
      fund: 'Global Health & Development Fund',
    },
    {
      id: 'eaf-003',
      title: 'Animal Welfare Project',
      recipient: 'Farm Animal Welfare Coalition',
      amount: 150000,
      currency: 'USD',
      date: '2024-03-10',
      grantmaker: 'EA Funds',
      description: 'Improving conditions for farm animals',
      category: 'AW',
      focus_area: 'Factory Farming',
      fund: 'Animal Welfare Fund',
    },
    {
      id: 'gw-001',
      title: 'Malaria Consortium - Seasonal Malaria Chemoprevention',
      recipient: 'Malaria Consortium',
      amount: 15000000,
      currency: 'USD',
      date: '2024-01-01',
      grantmaker: 'GiveWell',
      description: 'Supporting seasonal malaria chemoprevention programs',
      category: 'GH',
      focus_area: 'Global Health & Development',
      fund: 'Top Charities',
    },
    {
      id: 'gw-002',
      title: 'Against Malaria Foundation',
      recipient: 'Against Malaria Foundation',
      amount: 20000000,
      currency: 'USD',
      date: '2024-02-15',
      grantmaker: 'GiveWell',
      description: 'Long-lasting insecticide-treated net distribution',
      category: 'GH',
      focus_area: 'Global Health & Development',
      fund: 'Top Charities',
    },
  ];
}
