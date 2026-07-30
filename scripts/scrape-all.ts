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
import { scrapeACE } from './scrapers/ace';
import { scrapeSupplemental } from './scrapers/supplemental';
import { deduplicateGrants } from './dedup';
import { computeResiduals } from './residuals';
import { summarize, saveScrapeResult } from './scraper-utils';
import { computeKnownTotals, findStaleBaselines, getEffectivePublishedTotal } from './annual-totals-utils';
import {
  checkSources,
  updateBaselines,
  loadBaselines,
  saveBaselines,
  DEFAULT_TOLERANCE,
  SourceObservation,
} from './source-guard';
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
  const observations: SourceObservation[] = [];
  // `key` is the guard's identity for a source and must stay stable: a scraper that
  // throws never returns a ScrapeResult.source to fall back on.
  const scrapers = [
    { name: 'EA Funds', key: 'ea-funds', fn: scrapeEAFunds },
    { name: 'Open Phil', key: 'coefficient-giving', fn: scrapeOpenPhil },
    { name: 'SFF', key: 'sff', fn: scrapeSFF },
    { name: 'GiveWell', key: 'givewell', fn: scrapeGiveWell },
    { name: 'ACE', key: 'ace', fn: scrapeACE },
    { name: 'Supplemental', key: 'supplemental', fn: scrapeSupplemental },
  ];

  // Run scrapers sequentially to avoid rate limiting
  for (const scraper of scrapers) {
    try {
      console.log(`--- ${scraper.name} ---`);
      const result = await scraper.fn();
      results.push(result);
      saveScrapeResult(result);
      console.log(`  ${summarize(result)}`);
      observations.push({
        key: scraper.key,
        grants: result.grants.length,
        amount: result.grants.reduce((s, g) => s + g.amount, 0),
        errors: result.errors,
      });
    } catch (err: any) {
      console.error(`  ERROR: ${scraper.name} failed: ${err.message}`);
      results.push({
        source: scraper.key,
        grants: [],
        errors: [err.message],
        scrapedAt: new Date().toISOString(),
      });
      observations.push({ key: scraper.key, grants: 0, amount: 0, errors: [err.message] });
    }
    console.log();
  }

  // ─── Phase 1.5: Source Guard ────────────────────────────────
  console.log('── Phase 1.5: Source Guard ──');
  const allowRegression = process.argv.includes('--allow-regression');
  const baselines = loadBaselines();
  const violations = checkSources(observations, baselines);

  if (violations.length === 0) {
    console.log(
      `All ${observations.length} sources within ${(DEFAULT_TOLERANCE * 100).toFixed(0)}% of baseline.`
    );
  } else {
    for (const v of violations) console.error(`  ${v.key}: ${v.message}`);
    if (!allowRegression) {
      console.error();
      console.error(`ABORTING: ${violations.length} source(s) look broken; no files were written.`);
      console.error('The previous lib/scraped-grants.json is untouched. Re-run once the upstream');
      console.error('source recovers, or pass --allow-regression if the drop is real and expected.');
      process.exit(1);
    }
    console.warn('  --allow-regression passed; continuing despite the above.');
  }
  console.log();

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

  // Only a run that got past the guard and wrote output is allowed to move the bar.
  saveBaselines(updateBaselines(observations, baselines));

  // ─── Validation Report ──────────────────────────────────────
  console.log('── Validation Report ──');
  console.log();

  // Summarize by grantmaker and year
  const byGM = new Map<string, Map<string, number>>();
  const knownByGM = computeKnownTotals(dedupedGrants);
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

  for (const gm of ['Coefficient Giving', 'GiveWell', 'SFF', 'EA Funds', 'ACE', 'Founders Pledge']) {
    const gmData = byGM.get(gm) || new Map();
    const published = totals[gm];
    if (!published || typeof published !== 'object') continue;

    const yearCells = years.map(y => {
      const scraped = gmData.get(y) || 0;
      const publishedValue = (published as Record<string, unknown>)[y];
      const pub = typeof publishedValue === 'number' ? publishedValue : 0;
      if (pub === 0 && scraped === 0) return padL('-', 10);
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

  const baselineTotals = years.map(y => {
    let total = 0;
    for (const gm of Object.keys(totals)) {
      if (gm.startsWith('_')) continue;
      const published = ((totals[gm] as Record<string, number>)[y] || 0);
      const known = knownByGM.get(gm)?.get(y) || 0;
      total += getEffectivePublishedTotal(published, known);
    }
    return total;
  });
  console.log(padR('TOTAL (baseline)', 20) + baselineTotals.map(t => padL(fmtM(t), 10)).join(''));

  const coverageRow = years.map((_, i) => {
    const pct = baselineTotals[i] > 0 ? Math.round((yearTotals[i] / baselineTotals[i]) * 100) : 0;
    return padL(`${pct}%`, 10);
  });
  console.log(padR('Coverage', 20) + coverageRow.join(''));

  const staleBaselines = findStaleBaselines(totals, knownByGM);
  if (staleBaselines.length > 0) {
    console.log();
    console.log(`Stale annual baselines detected (${staleBaselines.length} year(s)); baseline math used max(published, known):`);
    staleBaselines.slice(0, 10).forEach(entry => {
      console.log(
        `  - ${entry.grantmaker} ${entry.year}: published ${fmtM(entry.published)}, known ${fmtM(entry.known)}`
      );
    });
    if (staleBaselines.length > 10) {
      console.log(`  - ...and ${staleBaselines.length - 10} more`);
    }
  }

  console.log();
  console.log('── Summary ──');
  console.log(`Total grants: ${finalGrants.length}`);
  console.log(`  Itemized: ${dedupedGrants.length}`);
  console.log(`  Residual: ${residuals.length}`);
  console.log(`  Excluded (dedup): ${dedupStats.excluded + dedupStats.exactRemoved + dedupStats.fuzzyMerged}`);
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
