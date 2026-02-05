/**
 * Main scraping orchestrator
 *
 * Usage: npx tsx scripts/scrape-all.ts
 *
 * This script:
 *  1. Runs all scrapers in parallel
 *  2. Deduplicates cross-source grants
 *  3. Computes residual grants for coverage gaps
 *  4. Saves combined output to data/raw/all-grants.json
 *  5. Prints validation stats against published totals
 */

import * as fs from 'fs';
import * as path from 'path';
import { Grant, ScrapeResult } from '../types/grants';
import { scrapeEAFunds } from './scrapers/ea-funds';
import { scrapeOpenPhil } from './scrapers/open-phil';
import { scrapeSFF } from './scrapers/sff';
import { scrapeGiveWell } from './scrapers/givewell';
import { deduplicateGrants } from './dedup';
import { computeResiduals } from './residuals';
import { summarize, saveScrapeResult } from './scraper-utils';
import annualTotals from './mappings/annual-totals.json';

async function main() {
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('EA Grants Database — Scraping Pipeline');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  console.log();

  // ─── Phase 1: Run all scrapers ──────────────────────────────
  console.log('── Phase 1: Scraping Sources ──');
  console.log();

  const results: ScrapeResult[] = [];
  const scrapers = [
    { name: 'EA Funds', fn: scrapeEAFunds },
    { name: 'Open Phil', fn: scrapeOpenPhil },
    { name: 'SFF', fn: scrapeSFF },
    { name: 'GiveWell', fn: scrapeGiveWell },
  ];

  // Run scrapers sequentially to avoid rate limiting
  for (const scraper of scrapers) {
    try {
      console.log(`--- ${scraper.name} ---`);
      const result = await scraper.fn();
      results.push(result);
      saveScrapeResult(result);
      console.log(`  ${summarize(result)}`);
    } catch (err: any) {
      console.error(`  ERROR: ${scraper.name} failed: ${err.message}`);
      results.push({
        source: scraper.name.toLowerCase().replace(/\s+/g, '-'),
        grants: [],
        errors: [err.message],
        scrapedAt: new Date().toISOString(),
      });
    }
    console.log();
  }

  // ─── Phase 2: Combine and Deduplicate ───────────────────────
  console.log('── Phase 2: Deduplication ──');
  const allGrants = results.flatMap(r => r.grants);
  console.log(`Combined: ${allGrants.length} total grants from ${results.length} sources`);

  const { grants: dedupedGrants, stats: dedupStats } = deduplicateGrants(allGrants);
  console.log();

  // ─── Phase 3: Residual Grants ───────────────────────────────
  console.log('── Phase 3: Residual Computation ──');
  const { residuals, stats: residualStats } = computeResiduals(dedupedGrants);
  console.log();

  // ─── Phase 4: Final output ──────────────────────────────────
  const finalGrants = [...dedupedGrants, ...residuals];

  // Sort by date descending
  finalGrants.sort((a, b) => b.date.localeCompare(a.date));

  // Save
  const outputDir = path.join(process.cwd(), 'data', 'raw');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'all-grants.json');
  fs.writeFileSync(outputPath, JSON.stringify(finalGrants, null, 2));

  // Also save a lean version for the aggregator to use
  const leanPath = path.join(process.cwd(), 'lib', 'scraped-grants.json');
  fs.writeFileSync(leanPath, JSON.stringify(finalGrants));

  // ─── Validation Report ──────────────────────────────────────
  console.log('── Validation Report ──');
  console.log();

  // Summarize by grantmaker and year
  const byGM = new Map<string, Map<string, number>>();
  for (const g of finalGrants) {
    const year = g.date.slice(0, 4);
    if (!byGM.has(g.grantmaker)) byGM.set(g.grantmaker, new Map());
    const ym = byGM.get(g.grantmaker)!;
    ym.set(year, (ym.get(year) || 0) + g.amount);
  }

  const totals = annualTotals as Record<string, unknown>;
  const years = ['2019', '2020', '2021', '2022', '2023', '2024'];

  // Print comparison table
  const padR = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
  const padL = (s: string, n: number) => ' '.repeat(Math.max(0, n - s.length)) + s;
  const fmtM = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

  console.log(padR('Grantmaker', 20) + years.map(y => padL(y, 10)).join(''));
  console.log('-'.repeat(20 + years.length * 10));

  for (const gm of ['Open Philanthropy', 'GiveWell', 'SFF', 'EA Funds', 'ACE', 'Founders Pledge']) {
    const gmData = byGM.get(gm) || new Map();
    const published = totals[gm];
    if (!published || typeof published !== 'object') continue;

    const yearCells = years.map(y => {
      const scraped = gmData.get(y) || 0;
      const publishedValue = (published as Record<string, unknown>)[y];
      const pub = typeof publishedValue === 'number' ? publishedValue : 0;
      if (pub === 0 && scraped === 0) return padL('-', 10);
      const pct = pub > 0 ? Math.round((scraped / pub) * 100) : 0;
      return padL(`${fmtM(scraped)}`, 10);
    });

    console.log(padR(gm, 20) + yearCells.join(''));
  }

  console.log('-'.repeat(20 + years.length * 10));

  // Grand totals
  const yearTotals = years.map(y => {
    let total = 0;
    for (const [, ym] of byGM) total += ym.get(y) || 0;
    return total;
  });
  console.log(padR('TOTAL (scraped)', 20) + yearTotals.map(t => padL(fmtM(t), 10)).join(''));

  const pubTotals = years.map(y => {
    let total = 0;
    for (const gm of Object.keys(totals)) {
      if (gm.startsWith('_')) continue;
      total += ((totals[gm] as Record<string, number>)[y] || 0);
    }
    return total;
  });
  console.log(padR('TOTAL (published)', 20) + pubTotals.map(t => padL(fmtM(t), 10)).join(''));

  const coverageRow = years.map((_, i) => {
    const pct = pubTotals[i] > 0 ? Math.round((yearTotals[i] / pubTotals[i]) * 100) : 0;
    return padL(`${pct}%`, 10);
  });
  console.log(padR('Coverage', 20) + coverageRow.join(''));

  console.log();
  console.log('── Summary ──');
  console.log(`Total grants: ${finalGrants.length}`);
  console.log(`  Itemized: ${dedupedGrants.length}`);
  console.log(`  Residual: ${residuals.length}`);
  console.log(`  Excluded (dedup): ${dedupStats.excluded + dedupStats.fuzzyMerged}`);
  console.log(`Total amount: $${(finalGrants.reduce((s, g) => s + g.amount, 0) / 1e6).toFixed(1)}M`);
  console.log(`Output: ${outputPath}`);
  console.log(`Lean output: ${leanPath}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed}s`);

  // Return for programmatic use
  return {
    grants: finalGrants,
    dedupStats,
    residualStats,
    scrapedAt: new Date().toISOString(),
  };
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
