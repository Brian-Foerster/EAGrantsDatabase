/**
 * Animal Charity Evaluators (ACE) Movement Grants scraper
 * Source: https://animalcharityevaluators.org/movement-grants/past-movement-grants-recipients/
 */

import * as cheerio from 'cheerio';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, parseDollarAmount, makeGrantId } from '../scraper-utils';

const PAST_GRANTS_URL = 'https://animalcharityevaluators.org/movement-grants/past-movement-grants-recipients/';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseHeadingDate(line: string): string {
  const yearMatch = line.match(/\b(20\d{2})\b/);
  if (!yearMatch) return '';
  const year = yearMatch[1];
  const monthMatches: { month: string; index: number }[] = [];
  for (const month of MONTHS) {
    const regex = new RegExp(`\\b${month}\\b`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      monthMatches.push({ month, index: match.index });
    }
  }
  monthMatches.sort((a, b) => a.index - b.index);
  if (monthMatches.length === 0) return `${year}-07-01`;
  const lastMonth = monthMatches[monthMatches.length - 1].month;
  const monthIndex = MONTHS.indexOf(lastMonth) + 1;
  const month = String(monthIndex).padStart(2, '0');
  return `${year}-${month}-01`;
}

function isHeading(line: string): boolean {
  if (!/\b20\d{2}\b/.test(line)) return false;
  return MONTHS.some(month => new RegExp(`\\b${month}\\b`, 'i').test(line));
}

function isNoise(line: string): boolean {
  return /For our|we (?:awarded|disbursed|granted)|More information|Movement Grants|Funds are disbursed|Total|Read more|Subscribe|Donate|Share this/i.test(line);
}

function extractAmount(line: string): string | null {
  const matches = line.match(/\$[0-9][0-9,]*(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}

export async function scrapeACE(): Promise<ScrapeResult> {
  const errors: string[] = [];
  console.log('[ACE] Fetching Movement Grants recipients page...');

  const response = await fetchWithRetry(PAST_GRANTS_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EAGrantsDatabase/1.0)',
    },
  });
  const html = await response.text();
  const $ = cheerio.load(html);

  const mainText = $('main').text() || $('article').text() || $('body').text();
  const rawLines = mainText.split('\n').map(l => l.trim()).filter(Boolean);

  let currentDate = '';
  let pendingRecipient = '';
  const grants: Grant[] = [];
  let index = 0;

  for (const line of rawLines) {
    if (isHeading(line)) {
      currentDate = parseHeadingDate(line);
      pendingRecipient = '';
      continue;
    }

    if (!currentDate) continue;
    if (isNoise(line)) continue;

    const amountStr = extractAmount(line);
    if (amountStr) {
      const amount = parseDollarAmount(amountStr);
      if (amount <= 0) continue;

      let recipient = '';
      let description = '';

      if (line.includes('|')) {
        const [left, right] = line.split('|');
        recipient = (left || '').replace(/\$/g, '').trim();
        const after = right || '';
        description = after.replace(amountStr, '').replace(/^[:\-\u2013\u2014]\s*/, '').trim();
      } else if (pendingRecipient) {
        recipient = pendingRecipient;
        description = line.replace(amountStr, '').replace(/^[:\-\u2013\u2014]\s*/, '').trim();
      } else {
        const splitIndex = line.lastIndexOf(amountStr);
        const before = line.slice(0, splitIndex).replace(/[-–—:\s]+$/, '').trim();
        const after = line.slice(splitIndex + amountStr.length).replace(/^[:\-\u2013\u2014]\s*/, '').trim();
        recipient = before.replace(/\$/g, '').trim();
        description = after;
      }

      pendingRecipient = '';
      if (!recipient) continue;

      grants.push({
        id: makeGrantId('ace-mg', index++, recipient),
        title: `${recipient} - ACE Movement Grant`,
        recipient,
        amount,
        currency: 'USD',
        date: currentDate,
        grantmaker: 'ACE',
        description: description || undefined,
        category: 'AW',
        fund: 'Movement Grants',
        url: PAST_GRANTS_URL,
      });
      continue;
    }

    if (!pendingRecipient && !isNoise(line) && line.length < 120) {
      pendingRecipient = line.replace(/\$/g, '').trim();
    }
  }

  console.log(`[ACE] Parsed ${grants.length} grants`);

  return {
    source: 'ace',
    grants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
