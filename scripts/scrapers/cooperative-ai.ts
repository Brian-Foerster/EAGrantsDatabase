/**
 * Cooperative AI Foundation (CAIF) scraper
 *
 * Source: https://www.cooperativeai.com/post/grant-summaries — one page listing every
 * CAIF grant in chronological order. Each grant is an <h4> project title followed by
 * <h5> PI(s), then paragraphs: "USD 500,000" (or GBP/EUR), a grant period ("2021-2025"),
 * and the institution (first line) plus a description.
 *
 * CAIF is funded by a $15M commitment from Macroscopic Ventures (tracked as a grant to
 * "Cooperative AI Foundation"), so its grants are regrants: they count net of tracked
 * grants to CAIF, as with BlueDot and Manifund.
 *
 * Dates: CAIF publishes only the grant period, so the start year is dated mid-year.
 * Non-USD amounts are converted at that year's annual average rate.
 */

import * as cheerio from 'cheerio';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, saveRawData, withTextFragment } from '../scraper-utils';

const URL = 'https://www.cooperativeai.com/post/grant-summaries';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; EAGrantsDatabase/1.0)' };

// Annual average rates (Bank of England / FRED), USD per unit.
const USD_PER: Record<string, Record<number, number>> = {
  GBP: { 2020: 1.284, 2021: 1.376, 2022: 1.237, 2023: 1.244, 2024: 1.281, 2025: 1.286, 2026: 1.31 },
  EUR: { 2020: 1.142, 2021: 1.183, 2022: 1.053, 2023: 1.081, 2024: 1.082, 2025: 1.12, 2026: 1.15 },
  SEK: { 2023: 0.0943, 2024: 0.0947, 2025: 0.1, 2026: 0.105 },
};

/** "USD 500,000" or "639,830 SEK". */
export function parseMoney(s: string): { cur: string; amount: number } | null {
  const m = /^\s*(?:(USD|GBP|EUR|SEK)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(USD|GBP|EUR|SEK))\s*$/i.exec(s);
  if (!m) return null;
  return { cur: (m[1] || m[4]).toUpperCase(), amount: parseFloat((m[2] || m[3]).replace(/,/g, '')) };
}

export async function scrapeCooperativeAI(): Promise<ScrapeResult> {
  const errors: string[] = [];
  const grants: Grant[] = [];
  const html = await (await fetchWithRetry(URL, { headers: UA })).text();
  const $ = cheerio.load(html);
  const raw: unknown[] = [];

  $('.u-rich-text h4').each((i, el) => {
    const title = $(el).text().replace(/‍/g, '').trim();
    if (!title) return;
    const pi = $(el).nextAll('h5').first().text().trim();
    // Paragraphs up to the next grant heading.
    const paras: string[] = [];
    let institution = '';
    let description = '';
    for (let n = $(el).next(); n.length && !n.is('h4'); n = n.next()) {
      if (!n.is('p')) continue;
      const lines = (n.html() || '').split(/<br\s*\/?>/i).map(h => cheerio.load(h).text().replace(/‍/g, '').trim()).filter(Boolean);
      if (lines.length) paras.push(...lines);
    }
    const money = paras.map(parseMoney).find(Boolean) || null;
    const period = paras.find(p => /^\d{4}(\s*[-–]\s*\d{4})?$/.test(p)) || '';
    const afterPeriod = paras.slice(paras.indexOf(period) + 1);
    // Usually an institution line follows the period; when the grantee is itself the
    // organisation (e.g. SIPRI) the next paragraph is already the description.
    const hasInstitutionLine = !!afterPeriod[0] && afterPeriod[0].length <= 100;
    institution = hasInstitutionLine ? afterPeriod[0] : pi;
    description = afterPeriod.slice(hasInstitutionLine ? 1 : 0).find(p => p.length > 60 && !/^Selected outputs/i.test(p)) || '';
    raw.push({ title, pi, money, period, institution });

    const year = parseInt(period.slice(0, 4), 10);
    if (!money || !year || !institution) {
      errors.push(`"${title}": missing ${[!money && 'amount', !year && 'period', !institution && 'institution'].filter(Boolean).join(', ')}`);
      return;
    }
    const rate = money.cur === 'USD' ? 1 : USD_PER[money.cur]?.[year];
    if (!rate) { errors.push(`"${title}": no ${money.cur} rate for ${year}`); return; }
    const usd = Math.round(money.amount * rate);
    const fmt = money.amount.toLocaleString('en-US');
    grants.push({
      id: `caif-${String(i + 1).padStart(3, '0')}`,
      title,
      recipient: institution,
      amount: usd,
      currency: 'USD',
      date: `${year}-07-01`,
      grantmaker: 'Cooperative AI Foundation',
      description: [
        pi ? `Grantee: ${pi}.` : '',
        `Grant period ${period}.`,
        money.cur !== 'USD' ? `Paid as ${money.cur} ${fmt}, converted at the ${year} average rate.` : '',
        description,
      ].filter(Boolean).join(' '),
      url: withTextFragment(URL, title),
      category: 'LTXR',
      focus_area: 'Cooperative AI',
      fund: 'Cooperative AI Grants',
      regrant: true,
      regrant_of: ['Cooperative AI Foundation'],
    });
  });

  saveRawData('cooperative-ai', raw);
  if (grants.length === 0) errors.push('no grants parsed — page structure may have changed');
  console.log(`[CAIF] Parsed ${grants.length} grants (${errors.length} errors)`);
  return { source: 'cooperative-ai', grants, errors, scrapedAt: new Date().toISOString() };
}
