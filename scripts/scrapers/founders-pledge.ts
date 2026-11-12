/**
 * Founders Pledge fund-grants scraper
 *
 * Source: the five Founders Pledge fund pages (founderspledge.com/funds/<slug>).
 * Each page is a Next.js App Router page whose grant tables ship in full inside the
 * page's flight payload (`self.__next_f.push([1,"…"])`) as content blocks of type
 * `content-blocks.fund-recipients`:
 *   { title, text, recipients: [{ id, date, name, recipientUrl, grant, amount, grantUrl }] }
 * The visible table only renders the first rows behind "Load More"; the payload
 * holds them all.
 *
 * Two kinds of block:
 *  - Fund grants ("Direct and co-funded grants", "Our Grants", "Pre 2025 Grants", …):
 *    money granted by the fund itself.
 *  - "Advised grants": per FP, "identified, evaluated and advised on by Fund
 *    Managers; resources were deployed by external philanthropists through their
 *    giving infrastructure, separately from the Fund." These are INCLUDED, under
 *    their own fund value ("<Fund> (Advised)"), and flagged `outside_baseline`
 *    because that money never passed through FP's books — so it must not reduce the
 *    990-based residual (scripts/residuals.ts).
 *
 * Names ending in "*" were paid in a non-USD currency; FP shows "converted reference
 * values", which we use as the USD amount.
 *
 * Relationship to the 990 residual: FP's annual totals (annual-totals.json) come from
 * the US entity's 990s and are cash PAID; the fund pages are grants COMMITTED, some
 * paid by FP's UK entity. Fund grants count against the residual like any itemized
 * grant (residual = max(990 total, itemized) - itemized), which is approximate — see
 * DATA_SOURCES.md → Founders Pledge.
 */

import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, saveRawData, sleep } from '../scraper-utils';

const BASE = 'https://www.founderspledge.com';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; EAGrantsDatabase/1.0)' };

export const FP_FUNDS: { slug: string; name: string; category: string; focus: string }[] = [
  { slug: 'climate-fund', name: 'Climate Fund', category: 'Other', focus: 'Climate change' },
  { slug: 'global-catastrophic-risks-fund', name: 'Global Catastrophic Risks Fund', category: 'LTXR', focus: 'Global catastrophic risks' },
  { slug: 'ghd-catalytic-impact-fund', name: 'Catalytic Impact Fund', category: 'GH', focus: 'Global health and development' },
  { slug: 'animal-welfare-fund', name: 'Animal Welfare Fund', category: 'AW', focus: 'Animal welfare' },
  { slug: 'patient-philanthropy-fund', name: 'Patient Philanthropy Fund', category: 'LTXR', focus: 'Patient philanthropy (long-term future)' },
];

type FpRecipient = {
  id: number; date: string; name: string; recipientUrl: string | null;
  grant: string; amount: string | number; grantUrl: string | null;
};
type FpBlock = { title: string; advised: boolean; recipients: FpRecipient[] };

/** Concatenate the Next.js flight chunks embedded in the page. */
export function decodeFlight(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  return [...html.matchAll(re)].map(m => JSON.parse(`"${m[1]}"`)).join('');
}

/** Extract every fund-recipients block from a decoded flight payload. */
export function extractBlocks(flight: string): FpBlock[] {
  const blocks: FpBlock[] = [];
  const MARK = '"__component":"content-blocks.fund-recipients"';
  let idx = 0;
  while ((idx = flight.indexOf(MARK, idx)) >= 0) {
    const rStart = flight.lastIndexOf('"recipients":[', idx);
    if (rStart < 0) { idx += MARK.length; continue; }
    const open = flight.indexOf('[', rStart);
    let depth = 0, end = open, inStr = false;
    for (; end < flight.length; end++) {
      const c = flight[end];
      if (inStr) { if (c === '\\') end++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) break;
    }
    const recipients = JSON.parse(flight.slice(open, end + 1)) as FpRecipient[];
    // The block's own "title"/"text" precede "recipients" within the same object.
    const objStart = flight.lastIndexOf('{"id":', rStart);
    const head = flight.slice(objStart >= 0 ? objStart : rStart - 2000, rStart);
    const title = (/"title":"((?:[^"\\]|\\.)*)"/.exec(head) || [])[1] || '';
    const text = (/"text":"((?:[^"\\]|\\.)*)"/.exec(head) || [])[1] || '';
    const advised = /advised/i.test(title) || /external philanthropists/i.test(text);
    blocks.push({ title, advised, recipients });
    // The recipients array sits BEFORE its marker, so always advance past the marker.
    idx += MARK.length;
  }
  return blocks;
}

export async function scrapeFoundersPledge(): Promise<ScrapeResult> {
  const errors: string[] = [];
  const grants: Grant[] = [];
  const raw: unknown[] = [];

  for (const fund of FP_FUNDS) {
    const pageUrl = `${BASE}/funds/${fund.slug}`;
    try {
      const html = await (await fetchWithRetry(pageUrl, { headers: UA })).text();
      const blocks = extractBlocks(decodeFlight(html));
      if (blocks.length === 0) errors.push(`${fund.slug}: no fund-recipients blocks found (page structure changed?)`);
      raw.push({ fund: fund.slug, blocks });
      let n = 0;
      for (const b of blocks) {
        for (const r of b.recipients) {
          const amount = typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount).replace(/,/g, ''));
          if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || !(amount > 0) || !r.name) {
            errors.push(`${fund.slug} #${r.id}: missing date/amount/name`);
            continue;
          }
          const converted = /\*\s*$/.test(r.name);
          const name = r.name.replace(/\*\s*$/, '').trim();
          const grantUrl = r.grantUrl ? new URL(r.grantUrl, BASE).toString() : null;
          grants.push({
            id: `fp-${r.id}`,
            title: r.grant || `${fund.name} grant`,
            recipient: name,
            amount,
            currency: 'USD',
            date: r.date,
            grantmaker: 'Founders Pledge',
            description: [
              b.advised ? 'Advised grant: identified and recommended by the Fund\'s managers, but paid by external philanthropists rather than by Founders Pledge.' : '',
              converted ? 'Not originally paid in USD; amount is Founders Pledge\'s converted reference value.' : '',
            ].filter(Boolean).join(' '),
            url: grantUrl || r.recipientUrl || pageUrl,
            category: fund.category,
            focus_area: fund.focus,
            fund: b.advised ? `${fund.name} (Advised)` : fund.name,
            source_id: String(r.id),
            ...(b.advised ? { outside_baseline: true } : {}),
          });
          n++;
        }
      }
      console.log(`  ${fund.name}: ${blocks.length} blocks, ${n} grants`);
    } catch (err: any) {
      errors.push(`${fund.slug}: ${err.message}`);
    }
    await sleep(500);
  }

  saveRawData('founders-pledge', raw);
  return { source: 'founders-pledge', grants, errors, scrapedAt: new Date().toISOString() };
}
