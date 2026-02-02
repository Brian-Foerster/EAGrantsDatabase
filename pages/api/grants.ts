import type { NextApiRequest, NextApiResponse } from 'next';
import { aggregateAllGrants } from '../../lib/aggregator';
import { AggregatedData, GrantSource } from '../../types/grants';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AggregatedData | { error: string }>
) {
  try {
    const grants = await aggregateAllGrants();
    
    const totalAmount = grants.reduce((sum, grant) => sum + grant.amount, 0);
    
    const response: AggregatedData = {
      grants,
      sources,
      totalGrants: grants.length,
      totalAmount,
      lastUpdated: new Date().toISOString()
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error in grants API:', error);
    res.status(500).json({ error: 'Failed to fetch grants data' });
  }
}
