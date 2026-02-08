/**
 * EA Funds Scraper
 * Source: https://funds.effectivealtruism.org/api/grants (CSV)
 * Supplements with payout report pages from https://funds.effectivealtruism.org/payouts
 */

import { parse } from 'csv-parse/sync';
import * as cheerio from 'cheerio';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, normalizeDate, saveRawData, parseDollarAmount, makeGrantId } from '../scraper-utils';
import fundMapping from '../mappings/eaf-funds.json';

const API_URL = 'https://funds.effectivealtruism.org/api/grants';
const PAYOUT_SITEMAP_URL = 'https://funds.effectivealtruism.org/sitemap.xml';

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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function mapFundToCategory(fund: string): string {
  return (fundMapping as Record<string, string>)[fund] || 'Other';
}

function normalizeFundName(fund: string): string {
  if (!fund) return '';
  const cleaned = fund.trim();
  if (/^EA Meta Fund$/i.test(cleaned)) return 'EA Infrastructure Fund';
  if (/^EA Community Fund$/i.test(cleaned)) return 'EA Infrastructure Fund';
  if (/^Global Development Fund$/i.test(cleaned)) return 'Global Health and Development Fund';
  if (/^Far Future Fund$/i.test(cleaned)) return 'Long-Term Future Fund';
  return cleaned;
}

function parseRound(round: string): string {
  if (!round) return '';
  // "2025 Q3" â†’ "2025-07-01"
  const match = round.match(/(\d{4})\s*Q(\d)/i);
  if (match) {
    const year = match[1];
    const quarter = parseInt(match[2], 10);
    const month = String((quarter - 1) * 3 + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }
  return normalizeDate(round);
}

function normalizeRecipient(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferFundFromTitle(title: string): string | null {
  if (/Animal Welfare Fund/i.test(title)) return 'Animal Welfare Fund';
  if (/Long-Term Future Fund/i.test(title)) return 'Long-Term Future Fund';
  if (/EA Infrastructure Fund/i.test(title)) return 'EA Infrastructure Fund';
  if (/EA Meta Fund/i.test(title)) return 'EA Infrastructure Fund';
  if (/EA Community Fund/i.test(title)) return 'EA Infrastructure Fund';
  if (/Global Health and Development Fund/i.test(title)) return 'Global Health and Development Fund';
  if (/Global Development Fund/i.test(title)) return 'Global Health and Development Fund';
  if (/Far Future Fund/i.test(title)) return 'Long-Term Future Fund';
  return null;
}

function inferDateFromTitle(title: string): string {
  const yearMatches = title.match(/\b(20\d{2})\b/g) || [];
  const year = yearMatches.length ? yearMatches[yearMatches.length - 1] : '';
  const monthMatches: { month: string; index: number }[] = [];
  for (const month of MONTHS) {
    const regex = new RegExp(`\\b${month}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(title)) !== null) {
      monthMatches.push({ month, index: match.index });
    }
  }
  monthMatches.sort((a, b) => a.index - b.index);
  if (year && monthMatches.length > 0) {
    const firstMonth = monthMatches[0].month;
    const monthIndex = MONTHS.indexOf(firstMonth) + 1;
    const month = String(monthIndex).padStart(2, '0');
    return `${year}-${month}-01`;
  }
  if (year) return `${year}-07-01`;
  return '';
}

function extractGrantItems($: cheerio.CheerioAPI): string[] {
  const items: string[] = [];
  const headings = $('h2,h3,h4').filter((_, el) => {
    const text = $(el).text();
    return /All Grants|Grants We Approved|Grant Recommendations|Grant recommendations|All grants/i.test(text);
  });

  headings.each((_, el) => {
    let node = $(el).next();
    while (node.length && !node.is('h2,h3,h4')) {
      node.find('li').each((__, li) => {
        const text = $(li).text().replace(/\s+/g, ' ').trim();
        if (text) items.push(text);
      });
      node = node.next();
    }
  });

  if (items.length === 0) {
    $('li').each((_, li) => {
      const text = $(li).text().replace(/\s+/g, ' ').trim();
      if (text && /\$/.test(text)) items.push(text);
    });
  }

  return items;
}

function parseGrantItem(text: string): { recipient: string; amount: number; description: string } | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const matches = cleaned.match(/\$[0-9][0-9,]*(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const amountStr = matches[matches.length - 1];
  const amount = parseDollarAmount(amountStr);
  if (amount <= 0) return null;
  const splitIndex = cleaned.lastIndexOf(amountStr);
  const before = cleaned.slice(0, splitIndex).replace(/[-–—:\s]+$/, '').trim();
  const after = cleaned.slice(splitIndex + amountStr.length).replace(/^[:\-\u2013\u2014]\s*/, '').trim();
  const recipient = before || 'Anonymous';
  return { recipient, amount, description: after };
}

async function fetchPayoutUrls(): Promise<string[]> {
  const response = await fetchWithRetry(PAYOUT_SITEMAP_URL);
  const xml = await response.text();
  const urls: string[] = [];
  const regex = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const url = match[1];
    if (url.includes('/payouts/')) urls.push(url);
  }
  return [...new Set(urls)];
}

async function scrapePayoutReports(existingKeys: Set<string>): Promise<Grant[]> {
  const payoutUrls = await fetchPayoutUrls();
  console.log(`[EA Funds] Found ${payoutUrls.length} payout pages in sitemap`);

  const grants: Grant[] = [];
  let index = 0;

  for (const url of payoutUrls) {
    try {
      const response = await fetchWithRetry(url);
      const html = await response.text();
      const $ = cheerio.load(html);
      const title = $('meta[property=\"og:title\"]').attr('content') || $('title').text() || '';
      const cleanTitle = title.replace(/\s+\|.*$/, '').trim();
      const fundName = inferFundFromTitle(cleanTitle);
      if (!fundName) continue;

      const date = inferDateFromTitle(cleanTitle);
      const items = extractGrantItems($);
      if (items.length === 0) continue;

      for (const item of items) {
        const parsed = parseGrantItem(item);
        if (!parsed) continue;
        const key = `${normalizeRecipient(parsed.recipient)}|${Math.round(parsed.amount)}|${date.slice(0, 4)}|${fundName}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);

        grants.push({
          id: makeGrantId('eaf-payout', index++, parsed.recipient),
          title: `${parsed.recipient} - ${fundName}`,
          recipient: parsed.recipient,
          amount: parsed.amount,
          currency: 'USD',
          date: date || normalizeDate(cleanTitle),
          grantmaker: 'EA Funds',
          description: parsed.description || undefined,
          category: mapFundToCategory(fundName),
          fund: fundName,
          url,
          source_id: `payout:${url.split('/').pop()}`,
        });
      }
    } catch (err: any) {
      console.warn(`[EA Funds] Payout page failed ${url}: ${err.message}`);
    }
  }

  return grants;
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
  const existingKeys = new Set<string>();
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

    const fundName = normalizeFundName(r.fund);
    const dateKey = (date || `${r.year}-07-01`).slice(0, 4);
    const dedupKey = `${normalizeRecipient(r.grantee || 'Anonymous')}|${Math.round(amount)}|${dateKey}|${fundName}`;
    existingKeys.add(dedupKey);

    // Build a meaningful title from grantee + fund, keep full description separate
    const descText = r.description || '';
    const titleText = r.grantee
      ? `${r.grantee} - ${fundName || 'EA Funds'}`
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
      category: mapFundToCategory(fundName),
      fund: fundName,
      source_id: r.id,
    };

    grants.push(grant);
  }

  const payoutGrants = await scrapePayoutReports(existingKeys);
  if (payoutGrants.length > 0) {
    console.log(`[EA Funds] Added ${payoutGrants.length} payout grants`);
    grants.push(...payoutGrants);
  }

  console.log(`[EA Funds] Processed ${grants.length} grants (${errors.length} errors)`);

  return {
    source: 'ea-funds',
    grants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
