/**
 * Generate a large mock dataset for testing scalability
 * This creates ~4,000 grants to demonstrate the performance of the architecture
 */

import * as fs from 'fs';
import * as path from 'path';
import { Grant } from '../types/grants';

const grantmakers = ['EA Funds', 'GiveWell', 'Coefficient Giving', 'Open Philanthropy', 'FTX Future Fund'];
const categories = ['AI Safety', 'Global Health', 'Animal Welfare', 'Climate', 'Biosecurity', 'Nuclear Security', 'Pandemic Preparedness', 'Longtermism'];
const focusAreas = ['Long-term future', 'Global health and development', 'Animal welfare', 'Climate change', 'Pandemic preparedness', 'Nuclear security', 'AI alignment', 'Effective altruism meta'];

const recipients = [
  'AI Safety Institute', 'Health Research Organization', 'Farm Animal Welfare Coalition',
  'Climate Research Institute', 'Global Health Security Coalition', 'Malaria Consortium',
  'Against Malaria Foundation', 'Helen Keller International', 'GiveDirectly',
  'Center for Effective Altruism', 'Future of Humanity Institute', 'Machine Intelligence Research Institute',
  'Nuclear Threat Initiative', 'Open Source Pharma Foundation', 'Animal Charity Evaluators',
  'Good Food Institute', 'New Harvest', 'Wild Animal Initiative', 'Humane League',
  'StrongMinds', 'Evidence Action', 'GiveWell', 'Rethink Priorities', 'Charity Entrepreneurship',
  '80,000 Hours', 'Founders Pledge', 'Giving What We Can', 'Center for AI Safety',
  'Alignment Research Center', 'Anthropic', 'Redwood Research', 'Apollo Research',
  'Center for Security and Emerging Technology', 'Johns Hopkins Center for Health Security',
  'Nuclear Threat Initiative', 'Council on Strategic Risks', 'Future of Life Institute',
];

const titles = [
  'AI Safety Research Grant',
  'Malaria Prevention Program',
  'Farm Animal Welfare Initiative',
  'Climate Change Mitigation Research',
  'Pandemic Preparedness Initiative',
  'Nuclear Security Assessment',
  'AI Alignment Research',
  'Global Health Infrastructure',
  'Wild Animal Suffering Research',
  'Biosecurity Capacity Building',
  'Cash Transfer Program',
  'Malaria Net Distribution',
  'Alternative Protein Research',
  'Mental Health Treatment Scale-up',
  'Deworming Program',
  'Vaccine Development Support',
  'AI Governance Research',
  'Cage-Free Campaign',
  'Lead Exposure Reduction',
  'Tuberculosis Treatment Support',
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAmount(): number {
  const ranges = [
    { min: 10000, max: 50000, weight: 30 },      // Small grants
    { min: 50000, max: 200000, weight: 40 },     // Medium grants
    { min: 200000, max: 1000000, weight: 20 },   // Large grants
    { min: 1000000, max: 10000000, weight: 8 },  // Very large grants
    { min: 10000000, max: 50000000, weight: 2 }, // Huge grants
  ];
  
  const totalWeight = ranges.reduce((sum, r) => sum + r.weight, 0);
  const random = Math.random() * totalWeight;
  
  let cumulativeWeight = 0;
  for (const range of ranges) {
    cumulativeWeight += range.weight;
    if (random <= cumulativeWeight) {
      return randomInt(range.min, range.max);
    }
  }
  
  return randomInt(10000, 50000);
}

function randomDate(startYear: number, endYear: number): string {
  const start = new Date(startYear, 0, 1);
  const end = new Date(endYear, 11, 31);
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
}

function generateGrant(id: number): Grant {
  const category = randomChoice(categories);
  const grantmaker = randomChoice(grantmakers);
  const recipient = randomChoice(recipients);
  const title = `${randomChoice(titles)} - ${recipient}`;
  const amount = randomAmount();
  const date = randomDate(2018, 2024);
  
  return {
    id: `grant-${String(id).padStart(5, '0')}`,
    title,
    recipient,
    amount,
    currency: 'USD',
    date,
    grantmaker,
    description: `Supporting ${category.toLowerCase()} work through ${recipient}. This grant aims to advance effective altruism principles and maximize impact per dollar.`,
    url: `https://example.com/grants/${id}`,
    category,
    focus_area: randomChoice(focusAreas),
  };
}

export async function generateLargeMockDataset(count: number = 4000): Promise<Grant[]> {
  const grants: Grant[] = [];
  
  console.log(`Generating ${count} mock grants...`);
  
  for (let i = 1; i <= count; i++) {
    grants.push(generateGrant(i));
    
    if (i % 1000 === 0) {
      console.log(`  Generated ${i} grants...`);
    }
  }
  
  console.log(`✅ Generated ${count} grants`);
  
  return grants;
}

// Save to file if run directly
if (require.main === module) {
  const OUTPUT_FILE = path.join(process.cwd(), 'lib', 'large-mock-data.json');
  
  generateLargeMockDataset(4000).then(grants => {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(grants, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);
    console.log(`Total amount: $${(grants.reduce((sum, g) => sum + g.amount, 0) / 1000000).toFixed(2)}M`);
  });
}
