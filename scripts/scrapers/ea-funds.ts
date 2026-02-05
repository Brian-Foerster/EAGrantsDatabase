/**
 * EA Funds Scraper
 * Source: https://funds.effectivealtruism.org/api/grants (CSV)
 * Funds: Long-Term Future Fund, EA Infrastructure Fund, Animal Welfare Fund, Global Health and Development Fund
 */

import { parse } from 'csv-parse/sync';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, normalizeDate, saveRawData, parseDollarAmount } from '../scraper-utils';
import fundMapping from '../mappings/eaf-funds.json';

const API_URL = 'https://funds.effectivealtruism.org/api/grants';

interface EAFRawGrant {
  id: string;
  fund: string;
  description: string;
  grantee: string;
  amount: string;
  round: string;
  published: string;
  year: string;
  highlighted: string;
}

function mapFundToCategory(fund: string): string {
  return (fundMapping as Record<string, string>)[fund] || 'Other';
}

function parseRound(round: string): string {
  if (!round) return '';
  // "2025 Q3" → "2025-07-01"
  const match = round.match(/(\d{4})\s*Q(\d)/i);
  if (match) {
    const year = match[1];
    const quarter = parseInt(match[2]);
    const month = String((quarter - 1) * 3 + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }
  return normalizeDate(round);
}

export async function scrapeEAFunds(): Promise<ScrapeResult> {
  const errors: string[] = [];
  console.log('[EA Funds] Fetching grants from API...');

  const response = await fetchWithRetry(API_URL);
  const csvText = await response.text();
  console.log(`[EA Funds] Received ${(csvText.length / 1024).toFixed(0)}KB of CSV data`);

  saveRawData('ea-funds', csvText);

  const records: EAFRawGrant[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  console.log(`[EA Funds] Parsed ${records.length} records`);

  const grants: Grant[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    const amount = parseDollarAmount(r.amount);
    if (amount <= 0) {
      errors.push(`Row ${i}: invalid amount "${r.amount}" for ${r.grantee}`);
      continue;
    }

    const date = parseRound(r.round);
    if (!date) {
      // Fall back to year field
      const fallbackDate = r.year ? `${r.year}-07-01` : '';
      if (!fallbackDate) {
        errors.push(`Row ${i}: no date for ${r.grantee}`);
        continue;
      }
    }

    // Build a meaningful title from grantee + fund, keep full description separate
    const descText = r.description || '';
    const titleText = r.grantee
      ? `${r.grantee} — ${r.fund || 'EA Funds'}`
      : descText.slice(0, 200) || 'EA Funds Grant';

    const grant: Grant = {
      id: `eaf-${String(i).padStart(5, '0')}`,
      title: titleText,
      recipient: r.grantee || 'Anonymous',
      amount,
      currency: 'USD',
      date: date || `${r.year}-07-01`,
      grantmaker: 'EA Funds',
      description: descText,
      category: mapFundToCategory(r.fund),
      fund: r.fund,
      source_id: r.id,
    };

    grants.push(grant);
  }

  console.log(`[EA Funds] Processed ${grants.length} grants (${errors.length} errors)`);

  return {
    source: 'ea-funds',
    grants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
