// Prepares the AI-tagging work list: distinct recipients whose grants the deterministic
// rules left in a "— general" bucket (i.e. the source signal was too coarse). Aggregate/
// residual rows are excluded (they are legitimately unspecified). Recipients already in the
// committed AI map are skipped, so re-runs only surface NEW recipients — the durable, cheap path.
//
//   npx tsx scripts/tag-subcategories.ts            # write work list + print sizing
//
// The work list is consumed by a tagging agent, which writes scripts/mappings/sub-categories-ai.json.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { assignSubCategory, subCategoryList, TAXONOMY, type AiOverrides } from './sub-categories';

const ROOT = path.resolve(__dirname, '..');
const AI_MAP = path.join(ROOT, 'scripts/mappings/sub-categories-ai.json');
const WORKLIST = path.join(ROOT, 'data/raw/subcat-worklist.json');
const TAXFILE = path.join(ROOT, 'data/raw/subcat-taxonomy.json');
// Recipients that can't be identified — leave them "— general" honestly, don't send to AI.
const ANON = /^\(?(anonymous|unknown|withheld|n\/a|confidential|various|multiple)\)?$/i;

const CURATED = path.join(ROOT, 'scripts/mappings/sub-categories-curated.json');
const grants = JSON.parse(readFileSync(path.join(ROOT, 'public/data/grants.min.json'), 'utf8'));
const ai: AiOverrides = existsSync(AI_MAP) ? JSON.parse(readFileSync(AI_MAP, 'utf8')) : {};
ai.byRecipient = ai.byRecipient || {};
if (existsSync(CURATED)) ai.curated = JSON.parse(readFileSync(CURATED, 'utf8')).curated;

const VALID = new Set(subCategoryList().map(s => s.id));
const CAT_OF: Record<string, string> = {};
for (const s of subCategoryList()) CAT_OF[s.id] = s.category;

// `validate` mode: check the committed AI map before a build trusts it.
if (process.argv[2] === 'validate') {
  const errs: string[] = [];
  for (const [rec, id] of Object.entries(ai.byRecipient)) {
    if (!VALID.has(id)) errs.push(`unknown id "${id}" for "${rec}"`);
  }
  let newRecip = 0, multiCat = 0;
  for (const g of grants as any[]) {
    if (assignSubCategory(g, ai).path !== 'fallback') continue;
    const r = (g.recipient || '').toLowerCase().trim();
    if (!r || ANON.test((g.recipient || '').trim())) continue; // anonymous → legitimately general
    if (ai.byRecipient[r]) multiCat++;   // recipient IS labeled, but for another L1 category
    else newRecip++;                     // genuinely un-tagged recipient
  }
  console.log(`AI map recipients: ${Object.keys(ai.byRecipient).length}`);
  console.log(`Invalid ids: ${errs.length}`);
  errs.slice(0, 20).forEach(e => console.log('  ✗ ' + e));
  console.log(`Genuinely un-tagged named recipients (should be ~0): ${newRecip}`);
  console.log(`Multi-category secondary grants left general (expected; needs category-aware tagging): ${multiCat}`);
  process.exit(errs.length ? 1 : 0);
}

// Emit the taxonomy the tagger must choose from (category → [{id,label}]).
writeFileSync(TAXFILE, JSON.stringify(
  Object.fromEntries(Object.entries(TAXONOMY).map(([c, rules]) => [c, rules.map(([id, label]) => ({ id, label }))])), null, 2));

type Row = { recipient: string; category: string; count: number; amount: number; focus_fund: Set<string>; titles: Set<string> };
const byRecip = new Map<string, Row>();

for (const g of grants) {
  const a = assignSubCategory(g, ai);
  if (a.path !== 'fallback') continue; // only rules-couldn't-place, non-residual grants
  const key = (g.recipient || '').toLowerCase().trim();
  if (!key || ai.byRecipient[key]) continue; // skip already-labeled
  if (ANON.test((g.recipient || '').trim())) continue; // unidentifiable → stays general
  let row = byRecip.get(key);
  if (!row) { row = { recipient: g.recipient, category: g.category, count: 0, amount: 0, focus_fund: new Set(), titles: new Set() }; byRecip.set(key, row); }
  row.count++; row.amount += g.amount || 0;
  if (g.focus_area || g.fund) row.focus_fund.add(`${g.focus_area || ''}/${g.fund || ''}`);
  if (g.title && row.titles.size < 3) row.titles.add(g.title);
}

const work = [...byRecip.values()]
  .sort((a, b) => b.count - a.count)
  .map(r => ({ recipient: r.recipient, category: r.category, count: r.count,
    amountM: +(r.amount / 1e6).toFixed(2), signals: [...r.focus_fund].slice(0, 2), sample_titles: [...r.titles] }));

writeFileSync(WORKLIST, JSON.stringify(work, null, 2));

const totalFallback = grants.reduce((n: number, g: any) => n + (assignSubCategory(g, ai).path === 'fallback' ? 1 : 0), 0);
console.log(`Grants still "— general" via rules: ${totalFallback}`);
console.log(`Distinct recipients to label (new): ${work.length}`);
console.log(`Already labeled in AI map: ${Object.keys(ai.byRecipient).length}`);
console.log(`Valid sub-category ids: ${subCategoryList().length}`);
console.log(`Work list → ${path.relative(ROOT, WORKLIST)}`);
console.log(`\nTop 15 recipients by grant count:`);
for (const w of work.slice(0, 15)) console.log(`  ${String(w.count).padStart(3)}× [${w.category}] ${w.recipient}  — ${w.sample_titles[0] || w.signals[0] || ''}`.slice(0, 110));
