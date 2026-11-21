/**
 * Lightcone Commons scraper
 *
 * Source: https://www.lightconecommons.com — a pooled AI-safety funding round. Evaluators
 * publish ranked "funding orders"; funders back evaluators, and money flows down each
 * backed order. The grant list itself is behind a login, but each public evaluator
 * profile (/profiles/<code>) embeds that evaluator's full order in the Next.js flight
 * payload, including `funded` (targetId -> how much of that line was funded) and `names`
 * (targetId -> name, organizationType).
 *
 * Amounts: where several evaluators recommend the same project, funders share its cost
 * rather than adding to it (Lightcone's FAQ: "up to $100k" + "up to $150k" = $150k). So
 * a project's grant is the LARGEST funded figure across the visible orders. This is a
 * lower bound — the project may also sit in an order that isn't public — and it
 * reproduces the homepage figures where they can be checked (Palisade $4.64M). Summing
 * the figures instead gives more than the round's published total.
 *
 * Coverage: not every evaluator has a public profile, so the itemized grants fall short
 * of the round's published "granted" total. The gap is one unitemized residual row per
 * round, so the round's headline total is right.
 *
 * Archive: the site only shows the current round, and the orders on the profile pages
 * will move on to the next round. Each scrape is saved by round (keyed by the round's
 * finalizedAt) in data/raw/lightcone-commons-rounds.json, which is versioned; grants are
 * emitted from every archived round. A live round only replaces its archived copy when it
 * itemizes at least as much, so a half-published next round can't erase the last one.
 *
 * Double counting: LTFF is one of the round's funders. Its share may later appear in
 * EA Funds' own grant data under the same recipients; scrape-all.ts warns when that
 * happens. Rows are regrants of "Lightcone Commons" so any tracked grant to the Commons
 * itself is netted out.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, sleep } from '../scraper-utils';

const BASE = 'https://www.lightconecommons.com';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; EAGrantsDatabase/1.0)' };
const ARCHIVE = path.join(process.cwd(), 'data', 'raw', 'lightcone-commons-rounds.json');

interface Target { id: string; name: string; type: string | null; amount: number; evaluators: Record<string, number> }
interface Round {
  finalizedAt: string; granted: number; orgsFunded: number; evaluators: number;
  publicOrders: string[]; scrapedAt: string; targets: Target[];
}
interface Archive { _comment?: string; rounds: Record<string, Round> }

// The round is AI-safety focused; these recipients belong elsewhere in the taxonomy.
const CATEGORY_OVERRIDES: Record<string, string> = {
  '80,000 Hours': 'Meta',
  'Rationality Meetups': 'Meta',
  'Mox': 'Meta',
  'Vibecamp': 'Meta',
  'Manifold Markets': 'Meta',
  'The Unjournal': 'Meta',
  'Community Archive': 'Meta',
  'DC Mini-Conference': 'Meta',
  'Cambridge AI Foresight: Quarterly Forecasts': 'Meta',
  'Humanitarian OpenStreetMap Team': 'Other',
  'More End Kidney Deaths campaigning': 'Other',
  'Education Progress': 'Other',
  'Berkeley Genomics Project': 'Other',
  'The Conversation': 'Other',
  'Signal Technology Foundation': 'Other',
  'The Consciousness Foundation': 'Other',
};

/** Concatenate the Next.js flight-payload chunks of a page. */
export function flightBlob(html: string): string {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) out += JSON.parse(`"${m[1]}"`);
  return out;
}

/** Parse the JSON object that starts at the first `{` at or after `from`. */
function objectAt(blob: string, from: number): any | null {
  const j = blob.indexOf('{', from);
  if (j < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let k = j; k < blob.length; k++) {
    const c = blob[k];
    if (inStr) { if (c === '\\') k++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(blob.slice(j, k + 1));
  }
  return null;
}

/** Parse the JSON object that is the value of `key` (e.g. '"order":'). */
export function objectAfter(blob: string, key: string): any | null {
  const i = blob.indexOf(key);
  if (i < 0 || blob[i + key.length] !== '{') return null; // absent, or e.g. "order":null
  return objectAt(blob, i + key.length);
}

async function page(p: string): Promise<string> {
  return (await fetchWithRetry(BASE + p, { headers: UA })).text();
}

/** Scrape the live round, or null if none is finalized. */
async function scrapeLiveRound(errors: string[]): Promise<Round | null> {
  const home = flightBlob(await page('/'));
  const at = home.indexOf('{"finalizedAt"');
  const summary = at < 0 ? null : objectAt(home, at);
  if (!summary?.finalizedAt || typeof summary.granted !== 'number') {
    errors.push('round summary (finalizedAt/granted) not found on the homepage');
    return null;
  }

  // Evaluator codes: links on /profiles plus codenames in the homepage payload.
  const codes = new Set<string>();
  for (const m of (await page('/profiles')).matchAll(/href="\/profiles\/([A-Za-z0-9]+)"/g)) codes.add(m[1]);
  for (const m of home.matchAll(/"codename":"([A-Za-z0-9]+)"/g)) codes.add(m[1]);

  const targets = new Map<string, Target>();
  const publicOrders: string[] = [];
  for (const code of Array.from(codes).sort()) {
    await sleep(500);
    let order: any;
    try { order = objectAfter(flightBlob(await page(`/profiles/${code}`)), '"order":'); }
    catch (e: any) { errors.push(`profile ${code}: ${e.message}`); continue; }
    if (!order?.funded) continue; // evaluator without a published order
    publicOrders.push(code);
    const names = new Map<string, any>((order.names || []).map((n: any) => [n.id, n]));
    for (const t of order.tranches || []) for (const a of t.allocations || [])
      if (!names.has(a.targetId)) names.set(a.targetId, { id: a.targetId, name: a.targetName });
    for (const [id, v] of Object.entries(order.funded as Record<string, number>)) {
      if (!(v > 0)) continue;
      const n = names.get(id);
      const t: Target = targets.get(id) || { id, name: (n?.name || id).trim(), type: n?.organizationType ?? null, amount: 0, evaluators: {} };
      t.evaluators[code] = Math.round(v);
      t.amount = Math.max(t.amount, Math.round(v));
      targets.set(id, t);
    }
  }
  if (!targets.size) { errors.push('no funded targets found in any evaluator profile'); return null; }
  return {
    finalizedAt: summary.finalizedAt,
    granted: summary.granted,
    orgsFunded: summary.orgsFunded ?? 0,
    evaluators: summary.evaluators ?? 0,
    publicOrders,
    scrapedAt: new Date().toISOString(),
    targets: Array.from(targets.values()).sort((a, b) => b.amount - a.amount),
  };
}

function roundGrants(r: Round): Grant[] {
  const date = r.finalizedAt.slice(0, 10);
  const label = new Date(`${date}T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const grants: Grant[] = r.targets.map(t => ({
    id: `lightcone-commons-${date}-${t.id.slice(0, 8)}`,
    title: t.name,
    recipient: t.name,
    amount: t.amount,
    currency: 'USD',
    date,
    grantmaker: 'Lightcone Commons',
    description: `${label} round. Amount is a minimum, from the public evaluator orders.`,
    // Project pages need a login; link the public order that funded it furthest.
    url: `${BASE}/profiles/${Object.entries(t.evaluators).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]}`,
    category: CATEGORY_OVERRIDES[t.name] || 'LTXR',
    fund: 'Lightcone Commons',
    regrant: true,
    regrant_of: ['Lightcone Commons'],
  }));
  const itemized = grants.reduce((s, g) => s + g.amount, 0);
  const gap = r.granted - itemized;
  if (gap > 100000) {
    grants.push({
      id: `lightcone-commons-${date}-residual`,
      title: `Unitemized grants, ${label} round`,
      recipient: 'Various recipients',
      amount: gap,
      currency: 'USD',
      date,
      grantmaker: 'Lightcone Commons',
      description: `The round granted $${(r.granted / 1e6).toFixed(2)}M to ${r.orgsFunded} organisations; ${r.targets.length} grants ($${(itemized / 1e6).toFixed(2)}M) are itemized from the ${r.publicOrders.length} public evaluator orders. This row is the rest.`,
      url: BASE,
      category: 'LTXR',
      fund: 'Lightcone Commons (Unitemized)',
      is_residual: true,
      residual_note: `Published round total: $${(r.granted / 1e6).toFixed(2)}M, Unitemized: $${(gap / 1e6).toFixed(2)}M (${((gap / r.granted) * 100).toFixed(0)}%)`,
      regrant: true,
      regrant_of: ['Lightcone Commons'],
    });
  }
  return grants;
}

export async function scrapeLightconeCommons(): Promise<ScrapeResult> {
  const errors: string[] = [];
  const archive: Archive = fs.existsSync(ARCHIVE)
    ? JSON.parse(fs.readFileSync(ARCHIVE, 'utf-8'))
    : { rounds: {} };
  archive._comment = 'Lightcone Commons rounds, archived per scrape (see scripts/scrapers/lightcone-commons.ts). The site only shows the current round, so do not delete past rounds.';

  let live: Round | null = null;
  try { live = await scrapeLiveRound(errors); }
  catch (e: any) { errors.push(`live round: ${e.message}`); }

  if (live) {
    const prev = archive.rounds[live.finalizedAt];
    const sum = (r: Round) => r.targets.reduce((s, t) => s + t.amount, 0);
    if (!prev || sum(live) >= sum(prev)) {
      archive.rounds[live.finalizedAt] = live;
      fs.writeFileSync(ARCHIVE, JSON.stringify(archive, null, 1) + '\n');
      console.log(`  Archived round ${live.finalizedAt}: ${live.targets.length} grants, $${(sum(live) / 1e6).toFixed(2)}M of $${(live.granted / 1e6).toFixed(2)}M (${live.publicOrders.length} public orders)`);
    } else {
      console.log(`  Live round itemizes less than the archived copy; keeping the archive`);
    }
  }

  const grants = Object.values(archive.rounds).flatMap(roundGrants);
  console.log(`[Lightcone Commons] ${Object.keys(archive.rounds).length} round(s), ${grants.length} grants (${errors.length} errors)`);
  return { source: 'lightcone-commons', grants, errors, scrapedAt: new Date().toISOString() };
}
