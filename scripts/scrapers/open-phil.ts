/**
 * Open Philanthropy Scraper
 * Primary: GitHub archive CSV (rufuspollock/open-philanthropy-grants)
 * Data through ~Oct 2024, columns: Grant, Organization Name, Focus Area, Amount, Date
 */

import { parse } from 'csv-parse/sync';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, normalizeDate, saveRawData, parseDollarAmount } from '../scraper-utils';
import focusAreaMapping from '../mappings/op-focus-areas.json';

const CSV_URL = 'https://raw.githubusercontent.com/rufuspollock/open-philanthropy-grants/main/OpenPhilGrants.csv';

interface OPRawGrant {
  Grant: string;
  'Organization Name': string;
  'Focus Area': string;
  Amount: string;
  Date: string;
}

function mapFocusArea(raw: string): string {
  if (!raw) return 'Other';

  // Direct match
  const direct = (focusAreaMapping as Record<string, string>)[raw];
  if (direct) return direct;

  // Partial match - check if any key is contained in the raw string
  for (const [key, value] of Object.entries(focusAreaMapping)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) {
      return value as string;
    }
  }

  // Keyword-based fallback
  const lower = raw.toLowerCase();
  if (lower.includes('ai') || lower.includes('artificial intelligence') || lower.includes('biosecurity') || lower.includes('pandemic') || lower.includes('catastrophic') || lower.includes('nuclear') || lower.includes('x-risk')) return 'LTXR';
  if (lower.includes('health') || lower.includes('malaria') || lower.includes('givewell') || lower.includes('development') || lower.includes('economic growth')) return 'GH';
  if (lower.includes('animal') || lower.includes('welfare') || lower.includes('cage') || lower.includes('farm')) return 'AW';
  if (lower.includes('effective altruism') || lower.includes('ea ') || lower.includes('career') || lower.includes('giving')) return 'Meta';

  return 'Other';
}

function parseDateString(raw: string): string {
  if (!raw) return '';

  // "October 2024" → "2024-10-01"
  const monthYear = raw.match(/^(\w+)\s+(\d{4})$/);
  if (monthYear) {
    const months: Record<string, string> = {
      January: '01', February: '02', March: '03', April: '04',
      May: '05', June: '06', July: '07', August: '08',
      September: '09', October: '10', November: '11', December: '12',
    };
    const m = months[monthYear[1]];
    if (m) return `${monthYear[2]}-${m}-01`;
  }

  return normalizeDate(raw);
}

export async function scrapeOpenPhil(): Promise<ScrapeResult> {
  const errors: string[] = [];
  console.log('[Open Phil] Fetching grants CSV from GitHub archive...');

  const response = await fetchWithRetry(CSV_URL);
  const csvText = await response.text();
  console.log(`[Open Phil] Received ${(csvText.length / 1024).toFixed(0)}KB of CSV data`);

  saveRawData('open-phil', csvText);

  const records: OPRawGrant[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  console.log(`[Open Phil] Parsed ${records.length} records`);

  const grants: Grant[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    const amount = parseDollarAmount(r.Amount);
    if (amount <= 0) {
      errors.push(`Row ${i}: invalid amount "${r.Amount}" for ${r['Organization Name']}`);
      continue;
    }

    const date = parseDateString(r.Date);
    if (!date) {
      errors.push(`Row ${i}: invalid date "${r.Date}" for ${r['Organization Name']}`);
      continue;
    }

    const focusArea = r['Focus Area'] || '';
    const category = mapFocusArea(focusArea);

    // Flag GiveWell-recommended charity grants for dedup
    const isGiveWellRecommended = focusArea.toLowerCase().includes('givewell');

    // Build description from metadata rather than duplicating title
    const descParts: string[] = [];
    if (r.Grant) descParts.push(r.Grant);
    if (focusArea) descParts.push(`Focus area: ${focusArea}`);
    const description = descParts.length > 1 ? descParts.join('. ') : '';

    const grant: Grant = {
      id: `op-${String(i).padStart(5, '0')}`,
      title: r.Grant || `Grant to ${r['Organization Name']}`,
      recipient: r['Organization Name'] || 'Unknown',
      amount,
      currency: 'USD',
      date,
      grantmaker: 'Open Philanthropy',
      description,
      category,
      focus_area: focusArea,
      source_id: `op-row-${i}`,
      exclude_from_total: isGiveWellRecommended,
    };

    grants.push(grant);
  }

  console.log(`[Open Phil] Processed ${grants.length} grants (${errors.length} errors)`);
  const gwExcluded = grants.filter(g => g.exclude_from_total).length;
  if (gwExcluded > 0) {
    console.log(`[Open Phil] ${gwExcluded} GiveWell-recommended grants flagged for dedup`);
  }

  return {
    source: 'open-phil',
    grants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
