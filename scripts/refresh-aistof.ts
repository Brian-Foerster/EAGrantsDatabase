/**
 * Refresh AISTOF (AI Safety Tactical Opportunities Fund) grants made through Manifund.
 *
 *   npx tsx scripts/refresh-aistof.ts            # dry run: report what would be written
 *   npx tsx scripts/refresh-aistof.ts --write    # rewrite data/raw/aistof-regrants.json
 *
 * Run AFTER `npm run refresh:manifund`. AISTOF publishes no grants list; its public
 * grants are donations on Manifund projects from JueYan Zhang's account ("JueYan Zhang /
 * AISTOF"). Manifund's projects API has no donor on each txn, but each project page's
 * flight payload does (from_id + amount), so we read AISTOF's share from there.
 *
 * Those projects are already Manifund rows at their all-donor total. lib/aggregator.ts
 * subtracts AISTOF's share from the matching Manifund row (by project URL), so the money
 * is attributed to AISTOF once and not counted twice. The file is derived, so it is
 * rewritten in full each run.
 */
import * as fs from 'fs';
import * as path from 'path';
import { recordNoLongerPublic } from './no-longer-public';

const AISTOF_PROFILE_ID = '5a39569a-b0d6-40c3-89bf-54925c7d5ea0';
const MANIFUND = path.join(process.cwd(), 'data', 'raw', 'manifund-regrants.json');
const OUT = path.join(process.cwd(), 'data', 'raw', 'aistof-regrants.json');
const SINCE = '2024-01-01'; // AISTOF's first Manifund donations are in 2024
const WRITE = process.argv.includes('--write');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Row = { id: string; title: string; recipient: string; amount: number; date: string; category?: string; focus_area?: string; url?: string };
type Txn = { id: string; from_id: string | null; amount: number; token: string; created_at: string; project: string; type: string };

function flightPayload(html: string): string {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(m => m[1]);
  try { return JSON.parse('"' + chunks.join('') + '"'); } catch { return chunks.join('').replace(/\\"/g, '"'); }
}

/**
 * Txns for the page's own project. The payload also embeds other projects' txns
 * (related projects, the creator's earlier rounds), so keep only the project id that
 * sits next to this page's slug.
 */
export function txnsFromPage(html: string, slug: string): Txn[] {
  const blob = flightPayload(html);
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idm = new RegExp(`"id":"([0-9a-f-]{36})"[^{}]{0,600}?"slug":"${esc}"`).exec(blob);
  if (!idm) return [];
  const seen = new Map<string, Txn>();
  const re = /\{"id":"([0-9a-f-]{36})","from_id":(null|"[0-9a-f-]{36}"),"to_id":"[0-9a-f-]{36}","amount":([\d.]+),"token":"([^"]+)","created_at":"([^"]+)","project":"?([0-9a-f-]*)"?,[^{}]*?"type":"([^"]+)"/g;
  for (const m of blob.matchAll(re)) {
    if (m[6] !== idm[1]) continue;
    seen.set(m[1], { id: m[1], from_id: m[2] === 'null' ? null : m[2].slice(1, -1), amount: +m[3], token: m[4], created_at: m[5], project: m[6], type: m[7] });
  }
  return [...seen.values()];
}

async function main() {
  const rows: Row[] = JSON.parse(fs.readFileSync(MANIFUND, 'utf8'));
  const candidates = rows.filter(r => (r.date || '') >= SINCE && /manifund\.org\/projects\//.test(r.url || ''));
  console.log(`Scanning ${candidates.length} Manifund projects (dated ${SINCE}+) for AISTOF donations…`);

  const out: Record<string, unknown>[] = [];
  let failed = 0;
  for (const [i, r] of candidates.entries()) {
    process.stdout.write(`\r  ${i + 1}/${candidates.length}`);
    let html = '';
    try {
      const res = await fetch(r.url!, { headers: { 'User-Agent': 'EAGrantsDatabase/1.0' } });
      if (!res.ok) throw new Error(String(res.status));
      html = await res.text();
    } catch (e) { failed++; await sleep(300); continue; }
    const slug = r.url!.replace(/^.*\/projects\//, '').replace(/[/?#].*$/, '');
    const mine = txnsFromPage(html, slug).filter(t => t.from_id === AISTOF_PROFILE_ID && t.type === 'project donation' && t.token === 'USD');
    const amount = mine.reduce((s, t) => s + t.amount, 0);
    if (amount > 0) {
      const share = Math.min(amount, r.amount);
      const first = mine.map(t => t.created_at).sort()[0].slice(0, 10);
      out.push({
        id: `aistof-${r.id}`,
        title: r.title,
        recipient: r.recipient,
        amount: share,
        currency: 'USD',
        date: first,
        grantmaker: 'AISTOF',
        description: `AISTOF's donation to this Manifund project ($${share.toLocaleString('en-US')} of the project's $${r.amount.toLocaleString('en-US')}); the rest stays under Manifund.`,
        category: r.category || 'LTXR',
        focus_area: r.focus_area || 'AI safety',
        fund: 'Via Manifund',
        url: r.url,
        regrant: true,
        regrant_of: ['AI Safety Tactical Opportunities Fund', 'AISTOF'],
        manifund_id: r.id,
      });
    }
    await sleep(150);
  }
  process.stdout.write('\n');
  if (failed) console.warn(`  ${failed} project pages failed to load — re-run before writing.`);

  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = out.reduce((s, g) => s + (g.amount as number), 0);
  console.log(`AISTOF: ${out.length} projects, $${(total / 1e6).toFixed(2)}M`);
  for (const g of out) console.log(`  ${g.date}  $${String(g.amount).padStart(8)}  ${String(g.title).slice(0, 70)}`);

  // Donations held before but no longer visible (e.g. the project was made private).
  const previous: { manifund_id?: string; title?: string; amount?: number }[] =
    fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const nowIds = new Set(out.map(g => g.manifund_id));
  const dropped = previous.filter(g => !nowIds.has(g.manifund_id));
  if (dropped.length) {
    console.log(`  no longer visible: ${dropped.length} donation(s), $${dropped.reduce((s, g) => s + (g.amount || 0), 0).toLocaleString()}`);
    dropped.forEach(g => console.log(`    $${String(g.amount).padStart(8)}  ${String(g.title).slice(0, 70)}`));
  }

  if (!WRITE) { console.log('\n(dry run — pass --write to save)'); return; }
  if (failed) { console.error('Not writing: some pages failed.'); process.exit(1); }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  recordNoLongerPublic('data/raw/aistof-regrants.json', 'AISTOF donation no longer visible on its Manifund project page', dropped);
  console.log(`Wrote ${OUT}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
