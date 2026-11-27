/**
 * Refresh BlueDot Impact grants from BlueDot's own public API.
 *
 *   npx tsx scripts/refresh-bluedot.ts            # dry run: report what would change
 *   npx tsx scripts/refresh-bluedot.ts --write    # append to data/raw/bluedot-regrants.json
 *
 * SOURCE: bluedot.org's tRPC endpoints (the same ones its /grants pages call):
 *   grants.getAllPublicRapidGrantees        -> [{granteeName, projectTitle, amountUsd, monthLabel}]
 *   grants.getCareerTransitionGrantStats    -> {count, totalAmountUsd}   (cumulative)
 *   grants.getAllPublicCareerTransitionGrantees -> names/bios only, NO amounts or dates
 * This replaces the earlier Trace-derived import; Trace's BlueDot copy lags BlueDot's
 * own list by weeks.
 *
 * RAPID GRANTS — append-only. Existing rows are never modified or removed: BlueDot's
 * public list drops some older grantees over time (≈170 of our rows no longer appear),
 * so a full replace would silently lose real grants. A public grantee is "already held"
 * if we have a row with the same first name, amount and month (multiset matching, so
 * two identical-looking grants both count). Trace paraphrased project titles, so titles
 * can't be used as the key.
 *
 * CAREER TRANSITION GRANTS — BlueDot publishes only a cumulative count and total, so
 * these are carried as unitemized residual rows. Each refresh adds one row for the
 * increase since the previous snapshot, dated to the refresh month; the first row
 * holds the whole backlog to date (program dates are not published).
 *
 * All rows are regrants of BlueDot's own funding (regrant_of: ["BlueDot Impact"]), so
 * they are counted net of the tracked grants that funded BlueDot — see lib/aggregator
 * and the About page.
 */
import * as fs from 'fs';
import * as path from 'path';
import { recordNoLongerPublic } from './no-longer-public';

const API = 'https://bluedot.org/api/trpc';
const OUT = path.join(process.cwd(), 'data', 'raw', 'bluedot-regrants.json');
const WRITE = process.argv.includes('--write');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; EAGrantsDatabase/1.0)' };
const CT_FUND = 'Career Transition Grants (Unitemized)';

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

type Rapid = { granteeName: string; projectTitle: string; amountUsd: number; monthLabel: string };
type Row = {
  id: string; title: string; recipient: string; amount: number; currency: string; date: string;
  grantmaker: string; description: string; category: string; focus_area: string; fund: string;
  url: string; regrant: boolean; regrant_of: string[];
  is_residual?: boolean; residual_note?: string;
};

async function trpc<T>(proc: string): Promise<T> {
  const res = await fetch(`${API}/${proc}`, { headers: UA });
  if (!res.ok) throw new Error(`${proc}: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: { data?: T }; error?: unknown };
  if (!body.result || body.result.data === undefined) throw new Error(`${proc}: unexpected response ${JSON.stringify(body).slice(0, 200)}`);
  return body.result.data;
}

/** "Oct 2026" -> "2026-10-01" */
function monthToDate(label: string): string | null {
  const m = /^([A-Z][a-z]{2})\s+(\d{4})$/.exec((label || '').trim());
  return m && MONTHS[m[1]] ? `${m[2]}-${MONTHS[m[1]]}-01` : null;
}

const firstName = (s: string) => (s || '').toLowerCase().trim().split(/\s+/)[0] || '';
const keyOf = (name: string, amount: number, date: string) => `${firstName(name)}|${Math.round(amount)}|${date.slice(0, 7)}`;

async function main() {
  const existing: Row[] = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  let maxId = 0;
  for (const r of existing) { const m = /^bd-(\d+)$/.exec(r.id || ''); if (m) maxId = Math.max(maxId, +m[1]); }
  const nextId = () => `bd-${String(++maxId).padStart(5, '0')}`;

  // ── Rapid grants ──────────────────────────────────────────────
  const rapid = await trpc<Rapid[]>('grants.getAllPublicRapidGrantees');
  console.log(`Rapid grants listed publicly: ${rapid.length}`);
  const held = new Map<string, Row[]>();
  for (const r of existing) {
    if (r.is_residual) continue;
    const k = keyOf(r.recipient, r.amount, r.date);
    held.set(k, [...(held.get(k) || []), r]);
  }
  const additions: Row[] = [];
  let unparsable = 0;
  for (const g of rapid) {
    const date = monthToDate(g.monthLabel);
    const amount = Number(g.amountUsd);
    const name = (g.granteeName || '').trim();
    if (!date || !(amount > 0) || !name) { unparsable++; continue; }
    const k = keyOf(name, amount, date);
    const matched = held.get(k);
    if (matched?.length) { matched.pop(); continue; }
    const project = (g.projectTitle || '').replace(/\s+/g, ' ').trim();
    additions.push({
      id: '', // assigned after sorting
      title: project ? `${name} — ${project}` : name,
      recipient: name,
      amount: Math.round(amount * 100) / 100,
      currency: 'USD',
      date,
      grantmaker: 'BlueDot Impact',
      description: '',
      category: 'LTXR',
      focus_area: 'AI safety (BlueDot Rapid Grants)',
      fund: 'Rapid Grants',
      url: 'https://bluedot.org/grants/rapid',
      regrant: true,
      regrant_of: ['BlueDot Impact'],
    });
  }
  additions.sort((a, b) => a.date.localeCompare(b.date));
  for (const a of additions) a.id = nextId();
  const addTotal = additions.reduce((s, r) => s + r.amount, 0);
  console.log(`  NEW rapid grants: ${additions.length} ($${addTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })})${unparsable ? `  [${unparsable} unparsable skipped]` : ''}`);
  const byMonth: Record<string, number> = {};
  for (const a of additions) byMonth[a.date.slice(0, 7)] = (byMonth[a.date.slice(0, 7)] || 0) + 1;
  if (additions.length) console.log(`  by month: ${JSON.stringify(byMonth)}`);
  // Held rapid grants BlueDot no longer lists. Its list drops some grantees over time, but many
  // of those stay public in Trace (where our earlier rows came from), so a grant only leaves the
  // public data when neither source has it. Matching is loose (amount within 1%, month ±1)
  // because Trace's copies differ slightly.
  const notOnBlueDot = [...held.values()].flat();
  const unlisted: Row[] = [];
  if (notOnBlueDot.length) {
    const trace = (await (await fetch('https://trace.manifund.org/grants.json', { headers: UA })).json()) as
      { amountUsd?: number; amount?: number; date?: string; funderSlug?: string; funderName?: string }[];
    const monthIdx = (ym: string) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m; };
    const candidates = [
      ...trace.filter(g => /bluedot/i.test(`${g.funderSlug} ${g.funderName}`))
        .map(g => ({ amount: Number(g.amountUsd ?? g.amount ?? 0), ym: String(g.date || '').slice(0, 7) })),
      ...rapid.map(g => ({ amount: Number(g.amountUsd), ym: (monthToDate(g.monthLabel) || '').slice(0, 7) })),
    ].filter(c => /^\d{4}-\d{2}$/.test(c.ym));
    for (const r of notOnBlueDot) {
      const stillPublic = candidates.some(c => Math.abs(c.amount - r.amount) <= Math.max(5, r.amount * 0.01)
        && Math.abs(monthIdx(c.ym) - monthIdx(r.date.slice(0, 7))) <= 1);
      if (!stillPublic) unlisted.push(r);
    }
    console.log(`  not on BlueDot's list but still public in Trace: ${notOnBlueDot.length - unlisted.length} (kept)`);
  }
  if (unlisted.length) {
    console.log(`  NO LONGER PUBLIC: ${unlisted.length} held rapid grant(s), $${unlisted.reduce((s, r) => s + r.amount, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} — removed on --write:`);
    unlisted.forEach(r => console.log(`    ${r.date}  $${String(r.amount).padStart(8)}  ${r.title.slice(0, 60)}`));
  }

  // ── Career transition grants (cumulative stats -> residual deltas) ──
  const ct = await trpc<{ count: number; totalAmountUsd: number }>('grants.getCareerTransitionGrantStats');
  const ctRows = existing.filter(r => r.fund === CT_FUND);
  const ctHeld = ctRows.reduce((s, r) => s + r.amount, 0);
  const delta = Math.round((ct.totalAmountUsd - ctHeld) * 100) / 100;
  console.log(`Career transition (cumulative): ${ct.count} grants, $${Math.round(ct.totalAmountUsd).toLocaleString()} | already held: $${Math.round(ctHeld).toLocaleString()}`);
  const ctAdditions: Row[] = [];
  let ctReplaced: Row[] = [];
  if (delta > 1) {
    const now = new Date();
    const first = ctRows.length === 0;
    const date = first ? `${now.getUTCFullYear()}-07-01` : `${now.toISOString().slice(0, 7)}-01`;
    const asOf = now.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    ctAdditions.push({
      id: nextId(),
      title: first ? `Career Transition Grants to date (as of ${asOf})` : `Career Transition Grants added by ${asOf}`,
      recipient: 'Various recipients',
      amount: delta,
      currency: 'USD',
      date,
      grantmaker: 'BlueDot Impact',
      description: `BlueDot funds people to move full-time into AI safety or biosecurity work. It publishes only cumulative totals for this program (${ct.count} grants, $${(ct.totalAmountUsd / 1e6).toFixed(2)}M as of ${asOf}), not individual amounts or dates, so this row represents ${first ? 'all grants made before this date' : 'the increase since the previous snapshot'}.`,
      category: 'LTXR',
      focus_area: 'AI safety (BlueDot Career Transition Grants)',
      fund: CT_FUND,
      url: 'https://bluedot.org/grants/career-transition',
      regrant: true,
      regrant_of: ['BlueDot Impact'],
      is_residual: true,
      residual_note: `Cumulative program total $${(ct.totalAmountUsd / 1e6).toFixed(2)}M (${ct.count} grants) as of ${asOf}; this row: $${(delta / 1e6).toFixed(2)}M`,
    });
    console.log(`  NEW career-transition residual row: $${delta.toLocaleString()} dated ${date}`);
  } else if (delta < -1) {
    // The published total went down: follow it, with one row holding the current total.
    const now = new Date();
    const asOf = now.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const firstDate = ctRows.map(r => r.date).sort()[0];
    ctReplaced = ctRows;
    ctAdditions.push({
      ...ctRows.find(r => r.date === firstDate)!,
      id: nextId(),
      title: `Career Transition Grants to date (as of ${asOf})`,
      amount: Math.round(ct.totalAmountUsd * 100) / 100,
      description: `BlueDot funds people to move full-time into AI safety or biosecurity work. It publishes only cumulative totals for this program (${ct.count} grants, $${(ct.totalAmountUsd / 1e6).toFixed(2)}M as of ${asOf}), not individual amounts or dates, so this row represents all grants made before this date.`,
      residual_note: `Cumulative program total $${(ct.totalAmountUsd / 1e6).toFixed(2)}M (${ct.count} grants) as of ${asOf}; BlueDot lowered its published total from $${(ctHeld / 1e6).toFixed(2)}M`,
    });
    console.log(`  career-transition total fell by $${(-delta).toLocaleString()}: on --write, ${ctRows.length} held row(s) become one row of $${Math.round(ct.totalAmountUsd).toLocaleString()}`);
  } else {
    console.log('  career-transition total unchanged');
  }

  if (!WRITE) { console.log('\n(dry run — pass --write to apply these changes to data/raw/bluedot-regrants.json)'); return; }
  const drop = new Set([...unlisted, ...ctReplaced]);
  const out = existing.filter(r => !drop.has(r)).concat(additions, ctAdditions);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  recordNoLongerPublic('data/raw/bluedot-regrants.json', 'Rapid grant no longer listed on bluedot.org/grants/rapid', unlisted);
  recordNoLongerPublic('data/raw/bluedot-regrants.json', `Career-transition rows replaced: BlueDot lowered its published total to $${Math.round(ct.totalAmountUsd).toLocaleString()} (${ct.count} grants)`, ctReplaced);
  console.log(`\nbluedot-regrants.json: ${existing.length} -> ${out.length}`);
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
