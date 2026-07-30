/**
 * Source guard — aborts the pipeline when a scraper returns nothing, or far less
 * than it returned last time.
 *
 * Upstream sources fail in ways the orchestrator cannot distinguish from "no grants
 * this time": an API that 500s until retries are exhausted arrives here as an empty
 * result, and the run would otherwise continue and overwrite lib/scraped-grants.json
 * with a dataset missing thousands of real grants — exiting 0 while doing so. The
 * guard runs before any output is written so a broken scrape leaves the last good
 * data in place.
 *
 * Baselines are keyed by the orchestrator's registry key, never by ScrapeResult.source:
 * a scraper that throws never returns a source string, and the two disagree for at
 * least one source (Open Phil reports itself as "coefficient-giving").
 */

import * as fs from 'fs';
import * as path from 'path';

const BASELINES_PATH = path.join(process.cwd(), 'scripts', 'source-baselines.json');

export interface SourceBaseline {
  grants: number;
  /** Informational only — the guard compares counts, not amounts. */
  amount: number;
  updatedAt: string;
}

export type SourceBaselines = Record<string, SourceBaseline>;

export interface SourceObservation {
  key: string;
  grants: number;
  amount: number;
  errors: string[];
}

export interface GuardViolation {
  key: string;
  kind: 'empty' | 'regression';
  observed: number;
  baseline: number | null;
  message: string;
}

/** A source may shrink by this fraction of its baseline before the run is treated as broken. */
export const DEFAULT_TOLERANCE = 0.1;

export function checkSources(
  observations: SourceObservation[],
  baselines: SourceBaselines,
  tolerance: number = DEFAULT_TOLERANCE
): GuardViolation[] {
  const violations: GuardViolation[] = [];

  for (const obs of observations) {
    const baseline = baselines[obs.key];
    const baselineCount = baseline && baseline.grants > 0 ? baseline.grants : null;

    // A configured scraper returning nothing is always wrong, baseline or not.
    if (obs.grants === 0) {
      violations.push({
        key: obs.key,
        kind: 'empty',
        observed: 0,
        baseline: baselineCount,
        message: `returned 0 grants${obs.errors.length ? ` — ${obs.errors[0]}` : ''}`,
      });
      continue;
    }

    if (baselineCount === null) continue; // new or never-recorded source; nothing to compare

    const floor = baselineCount * (1 - tolerance);
    if (obs.grants < floor) {
      const dropPct = ((1 - obs.grants / baselineCount) * 100).toFixed(1);
      violations.push({
        key: obs.key,
        kind: 'regression',
        observed: obs.grants,
        baseline: baselineCount,
        message:
          `returned ${obs.grants} grants, down ${dropPct}% from baseline ${baselineCount} ` +
          `(expected at least ${Math.floor(floor)})`,
      });
    }
  }

  return violations;
}

/**
 * Fold a run's observations into the baselines. Sources that returned nothing are
 * left at their previous baseline — recording a zero would erase the very number a
 * later run needs to detect the same breakage.
 */
export function updateBaselines(
  observations: SourceObservation[],
  previous: SourceBaselines,
  now: string = new Date().toISOString()
): SourceBaselines {
  const next: SourceBaselines = { ...previous };
  for (const obs of observations) {
    if (obs.grants === 0) continue;
    next[obs.key] = { grants: obs.grants, amount: Math.round(obs.amount), updatedAt: now };
  }
  return Object.fromEntries(Object.keys(next).sort().map(k => [k, next[k]]));
}

export function loadBaselines(): SourceBaselines {
  if (!fs.existsSync(BASELINES_PATH)) return {};
  return JSON.parse(fs.readFileSync(BASELINES_PATH, 'utf-8'));
}

export function saveBaselines(baselines: SourceBaselines) {
  fs.writeFileSync(BASELINES_PATH, JSON.stringify(baselines, null, 2) + '\n');
}
