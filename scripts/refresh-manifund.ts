/**
 * Refresh the Manifund regrant dataset from Manifund's own public API.
 *
 *   npx tsx scripts/refresh-manifund.ts            # dry run: report what would be added
 *   npx tsx scripts/refresh-manifund.ts --write    # append new projects to the data file
 *
 * WHY THIS SOURCE (and not Trace): our Manifund records are PROJECT-level — one row per
 * funded Manifund project, keyed by the project title, with the amount being the sum of
 * that project's transactions. Trace stores the same money as per-DONATION rows keyed by
 * the individual donor/recipient, so importing from Trace would double-count this data at
 * the wrong granularity under the wrong names. Manifund's API is the matching source.
 *
 * Field derivation (verified against the originally-imported records):
 *   amount      = sum of project.txns[].amount   (skip projects with no funding)
 *   date        = project.created_at (date part)
 *   recipient   = project.title       (Manifund projects are named, not person-keyed)
 *   description = project.causes[].title joined with ", "
 *   url         = https://manifund.org/projects/<slug>
 *   category    = CAUSE_RULES below (99.5% agreement with the original import)
 *
 * Existing records are never modified or removed — only genuinely new projects are
 * appended — so prior curation survives a refresh.
 */
import * as fs from 'fs';
import * as path from 'path';

const API = 'https://manifund.org/api/v0/projects';
const OUT = path.join(process.cwd(), 'data', 'raw', 'manifund-regrants.json');
const WRITE = process.argv.includes('--write');

type Txn = { amount?: number; token?: string };
type Cause = { title?: string };
type Project = {
  title?: string; slug?: string; created_at?: string;
  txns?: Txn[]; causes?: Cause[]; stage?: string; type?: string;
};
type Record_ = {
  id: string; title: string; recipient: string; amount: number; currency: string;
  date: string; grantmaker: string; description: string; category: string;
  focus_area: string; fund: string; url: string; regrant: boolean; regrant_of: string[];
};

/** Cause -> category, in priority order. Calibrated against the original 375 records. */
function categoryFor(causes: string[]): string {
  const has = (re: RegExp) => causes.some(c => re.test(c.toLowerCase()));
  if (has(/animal/)) return 'AW';
  if (has(/global health|development/)) return 'GH';
  if (has(/technical ai safety|ai governance|ai safety|global catastrophic|biosecurity|forecasting|grantmaking\.ai|existential/)) return 'LTXR';
  if (has(/science & technology|biomedical|scientific/)) return 'Science';
  if (has(/ea community|ea infrastructure|effective giving|community choice|meta/)) return 'Meta';
  return 'LTXR';
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Page backwards through the API using ?before=<oldest created_at>. */
async function fetchAllProjects(): Promise<Project[]> {
  const all = new Map<string, Project>();
  let before: string | undefined;
  for (let page = 0; page < 200; page++) {
    const url = API + (before ? `?before=${encodeURIComponent(before)}` : '');
    const res = await fetch(url, { headers: { 'User-Agent': 'EAGrantsDatabase/1.0' } });
    if (!res.ok) throw new Error(`Manifund API ${res.status} on page ${page + 1}`);
    const batch = (await res.json()) as Project[];
    if (!Array.isArray(batch) || batch.length === 0) break;

    const sizeBefore = all.size;
    for (const p of batch) if (p.slug) all.set(p.slug, p);
    const oldest = batch
      .map(p => p.created_at || '')
      .filter(Boolean)
      .sort()[0];
    process.stdout.write(`\r  fetched ${all.size} projects (page ${page + 1})…`);
    // Stop when a page adds nothing new or we can't advance the cursor.
    if (all.size === sizeBefore || !oldest || oldest === before) break;
    before = oldest;
    if (batch.length < 100) break;
    await sleep(150);
  }
  process.stdout.write('\n');
  return [...all.values()];
}

function fundedAmount(p: Project): number {
  return (p.txns || []).reduce((s, t) => s + (typeof t.amount === 'number' ? t.amount : 0), 0);
}

async function main() {
  const existing: Record_[] = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const haveSlug = new Set(existing.map(r => (r.url || '').replace(/^.*\/projects\//, '').toLowerCase()));
  const haveTitle = new Set(existing.map(r => (r.title || '').toLowerCase().trim()));

  console.log('Fetching Manifund projects…');
  const projects = await fetchAllProjects();
  console.log(`  total projects from API: ${projects.length}`);

  let skippedUnfunded = 0, skippedAcx = 0, skippedKnown = 0;
  const additions: Record_[] = [];
  let maxId = 0;
  for (const r of existing) { const m = /^mf-(\d+)$/.exec(r.id || ''); if (m) maxId = Math.max(maxId, +m[1]); }

  for (const p of projects) {
    const title = (p.title || '').trim();
    const slug = (p.slug || '').toLowerCase();
    if (!title || !slug) continue;
    const amount = fundedAmount(p);
    if (amount <= 0) { skippedUnfunded++; continue; }
    const causes = (p.causes || []).map(c => (c.title || '').trim()).filter(Boolean);
    // ACX-funded projects are tracked separately under the "ACX Grants" grantmaker.
    if (/\bacx\b/i.test(causes.join(' ') + ' ' + title)) { skippedAcx++; continue; }
    if (haveSlug.has(slug) || haveTitle.has(title.toLowerCase())) { skippedKnown++; continue; }

    const joined = causes.join(', ');
    additions.push({
      id: `mf-${String(++maxId).padStart(5, '0')}`,
      title, recipient: title,
      amount, currency: 'USD',
      date: (p.created_at || '').slice(0, 10),
      grantmaker: 'Manifund',
      description: joined,
      category: categoryFor(causes),
      focus_area: joined,
      fund: 'Regrants',
      url: `https://manifund.org/projects/${p.slug}`,
      regrant: true,
      regrant_of: ['Manifund'],
    });
  }

  additions.sort((a, b) => a.date.localeCompare(b.date));
  const addedTotal = additions.reduce((s, r) => s + r.amount, 0);
  console.log(`  unfunded skipped: ${skippedUnfunded} | ACX skipped: ${skippedAcx} | already have: ${skippedKnown}`);
  console.log(`  NEW funded projects: ${additions.length}  ($${addedTotal.toLocaleString()})`);
  if (additions.length) {
    const byCat: Record<string, number> = {};
    for (const r of additions) byCat[r.category] = (byCat[r.category] || 0) + 1;
    console.log(`  by category: ${JSON.stringify(byCat)}`);
    console.log(`  date range: ${additions[0].date} -> ${additions[additions.length - 1].date}`);
    console.log('  samples:');
    additions.slice(-5).forEach(r => console.log(`    ${r.date}  $${r.amount.toLocaleString().padStart(9)}  ${r.title.slice(0, 60)}`));
  }

  if (!WRITE) { console.log('\n(dry run — pass --write to append these to data/raw/manifund-regrants.json)'); return; }
  const out = existing.concat(additions);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\nmanifund-regrants.json: ${existing.length} -> ${out.length}`);
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
