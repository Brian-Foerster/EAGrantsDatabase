import * as fs from 'fs';
import * as path from 'path';
import { Grant } from '../types/grants';

const SCRAPED_DATA_PATH = path.join(process.cwd(), 'lib', 'scraped-grants.json');

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
      return data;
    } catch (err) {
      console.error('Error reading scraped data, falling back to mock:', err);
    }
  }

  console.log('No scraped data found, using mock data');
  console.log('Run "npm run scrape" to fetch real grant data');
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
