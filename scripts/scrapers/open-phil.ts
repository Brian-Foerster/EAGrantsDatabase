/**
 * Coefficient Giving Scraper (formerly Open Philanthropy)
 * Primary: Official Coefficient Giving Grants Archive CSV
 * https://coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv
 *
 * Columns: Grant, Organization Name, Focus Area, Amount, Date, Details
 */

import { execSync } from 'child_process';
import { parse } from 'csv-parse/sync';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, normalizeDate, saveRawData, parseDollarAmount } from '../scraper-utils';
import focusAreaMapping from '../mappings/op-focus-areas.json';

const CSV_URL = 'https://coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv';
// Coefficient Giving's own PUBLIC, read-only (search-only) Algolia key — the
// same credentials shipped in their website's client-side JS. Not a secret; it
// only permits querying their public grants index. Safe to commit / open-source.
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

// Open Phil / Coefficient funds GiveWell's recommendations, and GiveWell records the
// disbursements — so a Coefficient grant to a GiveWell charity is the GiveWell channel
// and is excluded to avoid double-counting. This is matched on recipient/title, not
// just the focus-area label, because Coefficient has moved GiveWell-channel grants
// into other funds (e.g. a $212M AMF net grant filed under "Global Health & Wellbeing
// Opportunities" rather than the literal "GiveWell-Recommended Charities" tag).
//
// Orgs whose Coefficient funding is entirely their GiveWell top/standout program:
const GIVEWELL_ORGS = [
  'against malaria foundation',
  'malaria consortium',
  'new incentives',
  'helen keller',
  'schistosomiasis control',
  'unlimit health',
];
// GiveWell programs run by orgs that ALSO take non-GiveWell (direct) Coefficient
// funding — matched in recipient OR title so e.g. Evidence Action's Deworm the World
// is excluded while its incubator / No Lean Season / Iron & Folic grants are not, and
// Sightsavers deworming is excluded but its trachoma research is not.
const GIVEWELL_PROGRAMS = [
  'deworm the world',
  'dispensers for safe water',
];

function isGiveWellChannel(recipient: string, title: string, focusArea: string): boolean {
  if (focusArea.toLowerCase().includes('givewell')) return true;
  const r = (recipient || '').toLowerCase();
  if (GIVEWELL_ORGS.some(o => r.includes(o))) return true;
  const rt = r + ' ' + (title || '').toLowerCase();
  return GIVEWELL_PROGRAMS.some(p => rt.includes(p));
}

// Generic corporate/academic words dropped before comparing org identity, so that
// "RAND" and "RAND Corporation", or "University of Queensland" and "The University
// of Queensland in America", reduce to the same core.
const ORG_STOPWORDS =
  /\b(inc|llc|ltd|co|corp|corporation|foundation|fund|the|of|for|and|a|an|at|on|in|university|institute|center|centre|school|college|department|dept|research|america|usa)\b/g;

function normalizeOrgCore(raw: string): string {
  return decodeHtmlEntities(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(ORG_STOPWORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Two org names refer to the same entity if their stopword-stripped cores are equal
// or one contains the other. The length floor keeps a short core (e.g. "ai") from
// matching unrelated names.
function orgCompatible(a: string, b: string): boolean {
  const na = normalizeOrgCore(a);
  const nb = normalizeOrgCore(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 5 && longer.includes(shorter);
}

function isAlgoliaGrant(g: Grant): boolean {
  return g.id.startsWith('cg-alg-');
}

/**
 * Collapse duplicate grants created by CSV/Algolia overlap. The CSV export and the
 * Algolia index both list the same grants; grants that match on
 * normalizeOrgName|amount|date are already de-duplicated inline, but name variants
 * ("RAND" vs "RAND Corporation") and Algolia's own repeated records (the same grant
 * indexed under two post_ids) slip through.
 *
 * Two Coefficient records are the same grant when they share an exact amount and
 * month and a compatible org name AND at least one is Algolia-sourced. The
 * "at least one Algolia" guard is essential: the CSV legitimately lists distinct
 * grants that share org + amount + month — two different researchers both recorded
 * as "Unknown", or two same-size grants to one university — so CSV records are never
 * dropped. Among Algolia records, one is kept; a CSV keeper (richer "Org — Project"
 * titles and co-funders) always wins, and inherits a URL the keeper lacked.
 */
export function dedupeCoefficientDuplicates(grants: Grant[]): { grants: Grant[]; removed: number } {
  const buckets = new Map<string, Grant[]>();
  for (const g of grants) {
    const key = `${Math.round(g.amount)}|${g.date.slice(0, 7)}`;
    const list = buckets.get(key);
    if (list) list.push(g);
    else buckets.set(key, [g]);
  }

  const drop = new Set<string>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const csv = list.filter(g => !isAlgoliaGrant(g));
    const keptAlgolia: Grant[] = [];
    for (const g of list) {
      if (!isAlgoliaGrant(g)) continue; // CSV records are authoritative — never dropped
      const match =
        csv.find(c => orgCompatible(c.recipient, g.recipient)) ||
        keptAlgolia.find(k => orgCompatible(k.recipient, g.recipient));
      if (match) {
        if (!match.url && g.url) match.url = g.url; // salvage a URL the keeper lacked
        drop.add(g.id);
      } else {
        keptAlgolia.push(g);
      }
    }
  }

  return { grants: grants.filter(g => !drop.has(g.id)), removed: drop.size };
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
  // Algolia enforces a paginationLimitedTo cap of 1,000 retrievable hits.
  // To get all ~2,500+ grant records we partition by award_year, since no
  // single year exceeds 1,000 grants.

  // First, discover all available years via a facet query
  const facetResponse = await fetchWithRetry(ALGOLIA_URL, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: '',
      hitsPerPage: 0,
      facets: ['award_year'],
      facetFilters: ['post_type:Grants'],
    }),
  });
  const facetData = await facetResponse.json();
  const years = Object.keys(facetData.facets?.award_year || {}).sort();

  const hits: AlgoliaGrant[] = [];

  // Fetch all grants for each year (each well under the 1,000 cap)
  for (const year of years) {
    let page = 0;
    let nbPages = 1;
    while (page < nbPages) {
      const response = await fetchWithRetry(ALGOLIA_URL, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': ALGOLIA_APP_ID,
          'X-Algolia-API-Key': ALGOLIA_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: '',
          hitsPerPage: 1000,
          page,
          facetFilters: ['post_type:Grants', `award_year:${year}`],
        }),
      });

      const data = await response.json();
      nbPages = data.nbPages || 0;
      if (Array.isArray(data.hits)) {
        hits.push(...data.hits);
      }
      page += 1;
    }
  }

  return hits;
}

export async function scrapeOpenPhil(): Promise<ScrapeResult> {
  const errors: string[] = [];
  console.log('[Coefficient] Fetching grants CSV from coefficientgiving.org...');

  // Cloudflare on coefficientgiving.org blocks Node's native fetch via TLS fingerprinting.
  // curl uses a different TLS stack that passes the WAF check.
  let csvText: string;
  try {
    csvText = execSync(
      `curl -sL` +
      ` -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"` +
      ` -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"` +
      ` -H "Accept-Language: en-US,en;q=0.9"` +
      ` -H "Referer: https://coefficientgiving.org/"` +
      ` "${CSV_URL}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    ).toString('utf-8');
  } catch (err: any) {
    throw new Error(`Failed to fetch Coefficient CSV via curl: ${err.message}`);
  }
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

    // Build description from metadata rather than duplicating title
    const descParts: string[] = [];
    const grantTitle = decodeHtmlEntities(r.Grant || '');

    // Flag GiveWell-recommended charity grants for dedup (by focus-area label,
    // recipient, or program title — see isGiveWellChannel).
    const isGiveWellRecommended = isGiveWellChannel(
      decodeHtmlEntities(r['Organization Name'] || ''),
      grantTitle,
      focusArea
    );
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
    const isGiveWellRecommended = isGiveWellChannel(org, decodeHtmlEntities(hit.title || ''), focusArea);

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

  // Collapse CSV/Algolia overlap duplicates that inline matching missed.
  const { grants: dedupedGrants, removed } = dedupeCoefficientDuplicates(grants);
  if (removed > 0) {
    console.log(`[Coefficient] Removed ${removed} intra-source duplicates (CSV/Algolia overlap)`);
  }

  // Log year breakdown
  const byYear: Record<string, number> = {};
  dedupedGrants.forEach(g => {
    const y = g.date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + 1;
  });
  console.log(`[Coefficient] Year breakdown: ${Object.entries(byYear).sort().map(([y, c]) => `${y}:${c}`).join(', ')}`);

  return {
    source: 'coefficient-giving',
    grants: dedupedGrants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
