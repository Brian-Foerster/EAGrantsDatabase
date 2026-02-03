import { Grant } from '../types/grants';

/**
 * Fetches grants data from EA Funds
 * Note: This is a mock implementation. In production, you would:
 * 1. Call their API if available
 * 2. Or scrape their website with proper rate limiting and permissions
 */
export async function fetchEAFundsGrants(): Promise<Grant[]> {
  try {
    // Mock data for EA Funds
    // In production, replace with actual API call or scraping logic
    const mockGrants: Grant[] = [
      {
        id: 'eaf-001',
        title: 'AI Safety Research Grant',
        recipient: 'AI Safety Institute',
        amount: 500000,
        currency: 'USD',
        date: '2024-01-15',
        grantmaker: 'EA Funds',
        description: 'Research into AI alignment and safety',
        url: 'https://funds.effectivealtruism.org/grants',
        category: 'AI Safety',
        focus_area: 'Long-term future'
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
        url: 'https://funds.effectivealtruism.org/grants',
        category: 'Global Health',
        focus_area: 'Global health and development'
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
        url: 'https://funds.effectivealtruism.org/grants',
        category: 'Animal Welfare',
        focus_area: 'Animal welfare'
      }
    ];
    
    return mockGrants;
  } catch (error) {
    console.error('Error fetching EA Funds grants:', error);
    return [];
  }
}

/**
 * Fetches grants data from GiveWell
 */
export async function fetchGiveWellGrants(): Promise<Grant[]> {
  try {
    // Mock data for GiveWell
    const mockGrants: Grant[] = [
      {
        id: 'gw-001',
        title: 'Malaria Consortium - Seasonal Malaria Chemoprevention',
        recipient: 'Malaria Consortium',
        amount: 15000000,
        currency: 'USD',
        date: '2024-01-01',
        grantmaker: 'GiveWell',
        description: 'Supporting seasonal malaria chemoprevention programs',
        url: 'https://www.givewell.org/research/all-grants',
        category: 'Global Health',
        focus_area: 'Malaria prevention'
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
        url: 'https://www.givewell.org/research/all-grants',
        category: 'Global Health',
        focus_area: 'Malaria prevention'
      },
      {
        id: 'gw-003',
        title: 'Helen Keller International - Vitamin A Supplementation',
        recipient: 'Helen Keller International',
        amount: 5000000,
        currency: 'USD',
        date: '2024-03-01',
        grantmaker: 'GiveWell',
        description: 'Vitamin A supplementation programs',
        url: 'https://www.givewell.org/research/all-grants',
        category: 'Global Health',
        focus_area: 'Nutrition'
      }
    ];
    
    return mockGrants;
  } catch (error) {
    console.error('Error fetching GiveWell grants:', error);
    return [];
  }
}

/**
 * Fetches grants data from Coefficient Giving
 */
export async function fetchCoefficientGrants(): Promise<Grant[]> {
  try {
    // Mock data for Coefficient Giving
    const mockGrants: Grant[] = [
      {
        id: 'coef-001',
        title: 'Climate Change Mitigation Research',
        recipient: 'Climate Research Institute',
        amount: 750000,
        currency: 'USD',
        date: '2024-01-20',
        grantmaker: 'Coefficient Giving',
        description: 'Research into carbon capture technologies',
        url: 'https://coefficientgiving.org/funds/',
        category: 'Climate',
        focus_area: 'Climate change'
      },
      {
        id: 'coef-002',
        title: 'Pandemic Preparedness Initiative',
        recipient: 'Global Health Security Coalition',
        amount: 1000000,
        currency: 'USD',
        date: '2024-02-10',
        grantmaker: 'Coefficient Giving',
        description: 'Strengthening global pandemic response capabilities',
        url: 'https://coefficientgiving.org/funds/',
        category: 'Biosecurity',
        focus_area: 'Pandemic preparedness'
      }
    ];
    
    return mockGrants;
  } catch (error) {
    console.error('Error fetching Coefficient grants:', error);
    return [];
  }
}

/**
 * Aggregates all grants from different sources
 */
export async function aggregateAllGrants(): Promise<Grant[]> {
  try {
    const [eaFunds, giveWell, coefficient] = await Promise.all([
      fetchEAFundsGrants(),
      fetchGiveWellGrants(),
      fetchCoefficientGrants()
    ]);
    
    return [...eaFunds, ...giveWell, ...coefficient];
  } catch (error) {
    console.error('Error aggregating grants:', error);
    return [];
  }
}
