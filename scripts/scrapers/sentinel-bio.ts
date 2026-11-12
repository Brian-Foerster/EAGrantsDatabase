/**
 * Sentinel Bio scraper
 *
 * Source: https://sentinelbio.org — a biosecurity grantmaker (WordPress site).
 * Every grant has its own page under /grant/<slug>/, and the WordPress sitemap
 * (/grant-sitemap.xml) lists all of them, so the sitemap is the index.
 *
 * Each grant page carries:
 *   <h1>                      recipient name
 *   <h3 class="title">        "<Month> <Year> <br/> <focus area>"
 *   section.general .text p   narrative, opening "We provided $X to …"
 *
 * Amounts are taken from the first currency figure in the narrative. Dates are
 * month-precision on the source, so they are set to the 1st of that month.
 */

import * as cheerio from 'cheerio';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, saveRawData, sleep } from '../scraper-utils';

const BASE = 'https://sentinelbio.org';
const SITEMAP = `${BASE}/grant-sitemap.xml`;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; EAGrantsDatabase/1.0)' };

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** First money figure in the text, e.g. "$574,750" or "$1.2 million". USD only. */
export function parseAmount(text: string): number | null {
  const m = /\$\s?([\d,]+(?:\.\d+)?)\s*(million|m\b|k\b|thousand)?/i.exec(text);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'million' || unit === 'm') n *= 1e6;
  else if (unit === 'k' || unit === 'thousand') n *= 1e3;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** "August 2026" -> "2026-08-01" */
export function parseMonthYear(text: string): string | null {
  const m = /\b([A-Za-z]+)\s+(\d{4})\b/.exec(text);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  return mm ? `${m[2]}-${mm}-01` : null;
}

/**
 * The page labels are hand-typed and drift ("Nucleic Acid Governance",
 * "Biosecurity and AI;  Nucleic acid governance", "…, Building the ecosystem").
 * Split multi-area labels and canonicalise case so the fund filter stays clean.
 */
export function normalizeAreas(focus: string): string[] {
  const out: string[] = [];
  for (const part of focus.split(/[;,]/)) {
    const p = part.replace(/\s+/g, ' ').trim();
    if (!p) continue;
    const canon = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase().replace(/\bai\b/g, 'AI');
    if (!out.includes(canon)) out.push(canon);
  }
  return out;
}

export async function scrapeSentinelBio(): Promise<ScrapeResult> {
  const errors: string[] = [];
  const grants: Grant[] = [];

  const sitemap = await (await fetchWithRetry(SITEMAP, { headers: UA })).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => m[1].trim())
    .filter(u => /\/grant\/[^/]+\/?$/.test(u)); // skip the /grant/ archive index
  console.log(`  sitemap lists ${urls.length} grant pages`);

  const raw: unknown[] = [];
  const skipped: string[] = [];
  for (const url of urls) {
    try {
      const html = await (await fetchWithRetry(url, { headers: UA })).text();
      const $ = cheerio.load(html);
      const recipient = $('main h1').first().text().trim() || $('h1').first().text().trim();
      // "<Month Year><br/><Focus area>"
      const titleHtml = $('section.general h3.title').first().html() || '';
      const [whenPart, ...focusParts] = titleHtml.split(/<br\s*\/?>/i).map(s => cheerio.load(s).text().trim());
      const focus = focusParts.join(' ').trim();
      const paras = $('section.general .text p').map((_, p) => $(p).text().trim()).get().filter(Boolean);
      const narrative = paras.join('\n\n');

      const date = parseMonthYear(whenPart || '');
      const amount = parseAmount(narrative);
      raw.push({ url, recipient, when: whenPart, focus, amount, narrative });

      if (!recipient || !date) {
        errors.push(`${url}: could not parse ${[!recipient && 'recipient', !date && 'date'].filter(Boolean).join(', ')}`);
        continue;
      }
      // A handful of grant pages publish no amount at all (some have no text) —
      // these are omitted, same policy as FLI's amount-less cohorts.
      if (!amount) { skipped.push(recipient); continue; }
      const areas = normalizeAreas(focus);
      const slug = url.replace(/\/$/, '').split('/').pop()!;
      grants.push({
        id: `sentinel-${slug}`,
        title: paras[0] || `${focus || 'Biosecurity'} grant`,
        recipient,
        amount,
        currency: 'USD',
        date,
        grantmaker: 'Sentinel Bio',
        description: paras.slice(1).join(' '),
        url,
        category: 'LTXR',
        focus_area: areas.length ? `Biosecurity — ${areas.join('; ')}` : 'Biosecurity',
        fund: areas[0] || 'Biosecurity',
        source_id: url,
      });
    } catch (err: any) {
      errors.push(`${url}: ${err.message}`);
    }
    await sleep(250);
  }

  if (skipped.length) console.log(`  skipped ${skipped.length} grant page(s) with no published amount: ${skipped.join('; ')}`);
  saveRawData('sentinel-bio', raw);
  return { source: 'sentinel-bio', grants, errors, scrapedAt: new Date().toISOString() };
}
