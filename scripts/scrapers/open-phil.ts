/**
 * Coefficient Giving Scraper (formerly Open Philanthropy)
 * Primary: Official Coefficient Giving Grants Archive CSV
 * https://coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv
 *
 * Columns: Grant, Organization Name, Focus Area, Amount, Date, Details
 */

import { parse } from 'csv-parse/sync';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, normalizeDate, saveRawData, parseDollarAmount } from '../scraper-utils';
import focusAreaMapping from '../mappings/op-focus-areas.json';

const CSV_URL = 'https://coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv';
const ALGOLIA_APP_ID = 'WBC743WF65';
const ALGOLIA_API_KEY = 'da168b7a254a1f18a8fd0e6b65d7e0e2';
const ALGOLIA_INDEX = 'coefficientgiving_grants_award_date_desc';
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

interface AlgoliaGrant {
  post_id?: number;
  title?: string;
  url?: string;
  grant_amount?: number;
  award_date?: number;
  award_year?: number;
  organization_name?: string[];
  'focus-area'?: string[];
}

interface CGRawGrant {
  Grant: string;
  'Organization Name': string;
  'Focus Area': string;
  Amount: string;
  Date: string;
  Details?: string;
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
  if (lower.includes('ai') || lower.includes('artificial intelligence') || lower.includes('biosecurity') || lower.includes('pandemic') || lower.includes('catastrophic') || lower.includes('nuclear') || lower.includes('x-risk') || lower.includes('transformative')) return 'LTXR';
  if (lower.includes('health') || lower.includes('malaria') || lower.includes('givewell') || lower.includes('development') || lower.includes('economic growth') || lower.includes('air quality') || lower.includes('lead')) return 'GH';
  if (lower.includes('animal') || lower.includes('welfare') || lower.includes('cage') || lower.includes('farm') || lower.includes('chicken') || lower.includes('fish')) return 'AW';
  if (lower.includes('effective altruism') || lower.includes('ea ') || lower.includes('career') || lower.includes('giving') || lower.includes('forecasting')) return 'Meta';

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

function decodeHtmlEntities(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeOrgName(raw: string): string {
  return decodeHtmlEntities(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toMonthStartFromEpoch(epochSeconds?: number): string {
  if (!epochSeconds) return '';
  const d = new Date(epochSeconds * 1000);
  if (isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function isBrokenCoefficientGrantUrl(url?: string): boolean {
  if (!url) return false;
  return /^https?:\/\/coefficientgiving\.org\/grants\//i.test(url);
}

async function fetchAlgoliaGrants(): Promise<AlgoliaGrant[]> {
  const hits: AlgoliaGrant[] = [];
  let page = 0;
  let nbPages = 1;
  const hitsPerPage = 1000;

  while (page < nbPages) {
    const response = await fetchWithRetry(ALGOLIA_URL, {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': ALGOLIA_APP_ID,
        'X-Algolia-API-Key': ALGOLIA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '', hitsPerPage, page }),
    });

    const data = await response.json();
    nbPages = data.nbPages || 0;
    if (Array.isArray(data.hits)) {
      hits.push(...data.hits);
    }
    page += 1;
  }

  return hits;
}

export async function scrapeOpenPhil(): Promise<ScrapeResult> {
  const errors: string[] = [];
  console.log('[Coefficient] Fetching grants CSV from coefficientgiving.org...');

  const response = await fetchWithRetry(CSV_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });
  const csvText = await response.text();
  console.log(`[Coefficient] Received ${(csvText.length / 1024).toFixed(0)}KB of CSV data`);

  saveRawData('coefficient-giving', csvText);

  const records: CGRawGrant[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  console.log(`[Coefficient] Parsed ${records.length} records`);

  console.log('[Coefficient] Fetching Algolia grant index for URLs...');
  const algoliaGrants = await fetchAlgoliaGrants();
  console.log(`[Coefficient] Retrieved ${algoliaGrants.length} Algolia grant records`);

  const algoliaByKey = new Map<string, AlgoliaGrant[]>();
  for (const hit of algoliaGrants) {
    const org = hit.organization_name?.[0] || '';
    const amount = hit.grant_amount || 0;
    const date = toMonthStartFromEpoch(hit.award_date);
    if (!org || !amount || !date) continue;
    const key = `${normalizeOrgName(org)}|${amount}|${date}`;
    const list = algoliaByKey.get(key) || [];
    list.push(hit);
    algoliaByKey.set(key, list);
  }

  const grants: Grant[] = [];
  const existingKeys = new Set<string>();
  let urlMatches = 0;
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

    const focusArea = decodeHtmlEntities(r['Focus Area'] || '');
    const category = mapFocusArea(focusArea);

    // Flag GiveWell-recommended charity grants for dedup
    const isGiveWellRecommended = focusArea.toLowerCase().includes('givewell');

    // Build description from metadata rather than duplicating title
    const descParts: string[] = [];
    const grantTitle = decodeHtmlEntities(r.Grant || '');
    if (grantTitle) descParts.push(grantTitle);
    if (focusArea) descParts.push(`Focus area: ${focusArea}`);
    const description = descParts.length > 1 ? descParts.join('. ') : '';

    const grant: Grant = {
      id: `cg-${String(i).padStart(5, '0')}`,
      title: grantTitle || `Grant to ${decodeHtmlEntities(r['Organization Name'] || 'Unknown')}`,
      recipient: decodeHtmlEntities(r['Organization Name'] || 'Unknown'),
      amount,
      currency: 'USD',
      date,
      grantmaker: 'Coefficient Giving',
      description,
      category,
      focus_area: focusArea,
      fund: focusArea || undefined,
      source_id: `cg-row-${i}`,
      exclude_from_total: isGiveWellRecommended,
    };

    const matchKey = `${normalizeOrgName(grant.recipient)}|${amount}|${date}`;
    existingKeys.add(matchKey);
    const candidates = algoliaByKey.get(matchKey);
    if (candidates && candidates.length > 0) {
      const preferred = candidates.find(c => (c['focus-area'] || []).includes(focusArea)) || candidates[0];
      if (preferred?.url && !isBrokenCoefficientGrantUrl(preferred.url)) {
        grant.url = preferred.url;
        urlMatches += 1;
      }
      const algoliaTitle = decodeHtmlEntities(preferred?.title || '');
      if (algoliaTitle && (algoliaTitle.length > grant.title.length || /^Grant to\s+/i.test(grant.title))) {
        grant.title = algoliaTitle;
      }
    }

    grants.push(grant);
  }

  // Add Algolia grants not present in the CSV
  let algoliaAdded = 0;
  for (const hit of algoliaGrants) {
    const org = decodeHtmlEntities(hit.organization_name?.[0] || '');
    const amount = hit.grant_amount || 0;
    const date = toMonthStartFromEpoch(hit.award_date);
    if (!org || !amount || !date) continue;
    const key = `${normalizeOrgName(org)}|${amount}|${date}`;
    if (existingKeys.has(key)) continue;

    const focusArea = decodeHtmlEntities(hit['focus-area']?.[0] || '');
    const category = mapFocusArea(focusArea);
    const isGiveWellRecommended = focusArea.toLowerCase().includes('givewell');

    grants.push({
      id: `cg-alg-${String(algoliaAdded).padStart(5, '0')}`,
      title: decodeHtmlEntities(hit.title || '') || `Grant to ${org}`,
      recipient: org,
      amount,
      currency: 'USD',
      date,
      grantmaker: 'Coefficient Giving',
      description: focusArea ? `Focus area: ${focusArea}` : '',
      category,
      focus_area: focusArea,
      fund: focusArea || undefined,
      url: isBrokenCoefficientGrantUrl(hit.url) ? undefined : hit.url,
      source_id: `cg-alg-${hit.post_id ?? algoliaAdded}`,
      exclude_from_total: isGiveWellRecommended,
    });
    algoliaAdded += 1;
  }

  console.log(`[Coefficient] Processed ${grants.length} grants (${errors.length} errors)`);
  const gwExcluded = grants.filter(g => g.exclude_from_total).length;
  if (gwExcluded > 0) {
    console.log(`[Coefficient] ${gwExcluded} GiveWell-recommended grants flagged for dedup`);
  }
  if (urlMatches > 0) {
    console.log(`[Coefficient] Matched ${urlMatches} grants to Algolia URLs`);
  }
  if (algoliaAdded > 0) {
    console.log(`[Coefficient] Added ${algoliaAdded} newer Algolia grants not in CSV`);
  }

  // Log year breakdown
  const byYear: Record<string, number> = {};
  grants.forEach(g => {
    const y = g.date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  });
  console.log(`[Coefficient] Year breakdown: ${Object.entries(byYear).sort().map(([y, c]) => `${y}:${c}`).join(', ')}`);

  return {
    source: 'coefficient-giving',
    grants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
