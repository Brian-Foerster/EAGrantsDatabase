/**
 * Deduplication pipeline for cross-source grant data
 *
 * Three layers:
 * 1. Source-level flags (e.g., Open Phil "GiveWell-recommended" grants)
 * 2. Cross-source fuzzy matching (same recipient + year + similar amount)
 * 3. Co-funded grants (track funders[] without double-counting)
 */

import { Grant } from '../types/grants';

interface DedupStats {
  totalBefore: number;
  excluded: number;
  fuzzyMerged: number;
  totalAfter: number;
}

/** Normalize a recipient name for comparison */
function normalizeRecipient(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(inc|llc|ltd|corporation|corp|foundation|fund|the|of|for|and|university|institute|project)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Check if two amounts are within 10% of each other */
function amountsMatch(a: number, b: number): boolean {
  if (a === 0 || b === 0) return false;
  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio <= 1.10;
}

/** Check if two dates are in the same year */
function sameYear(a: string, b: string): boolean {
  return a.slice(0, 4) === b.slice(0, 4);
}

/** Check if two dates are within 3 months of each other */
function datesClose(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  const diffMs = Math.abs(da.getTime() - db.getTime());
  return diffMs < 90 * 24 * 60 * 60 * 1000; // 90 days
}

export function deduplicateGrants(grants: Grant[]): { grants: Grant[]; stats: DedupStats } {
  console.log(`[Dedup] Starting with ${grants.length} grants`);

  // Layer 1: Remove grants flagged exclude_from_total
  const layer1 = grants.filter(g => !g.exclude_from_total);
  const excluded = grants.length - layer1.length;
  if (excluded > 0) {
    console.log(`[Dedup] Layer 1: Excluded ${excluded} flagged grants`);
  }

  // Layer 2: Cross-source fuzzy matching
  // Group by normalized recipient name
  const byRecipient = new Map<string, Grant[]>();
  for (const g of layer1) {
    const key = normalizeRecipient(g.recipient);
    if (!byRecipient.has(key)) byRecipient.set(key, []);
    byRecipient.get(key)!.push(g);
  }

  let fuzzyMerged = 0;
  const dedupedGrants: Grant[] = [];
  const seen = new Set<string>();

  for (const [_key, group] of byRecipient) {
    if (group.length <= 1) {
      dedupedGrants.push(...group);
      continue;
    }

    // Check for cross-source duplicates within this recipient group
    for (let i = 0; i < group.length; i++) {
      if (seen.has(group[i].id)) continue;

      let isDuplicate = false;
      for (let j = 0; j < i; j++) {
        if (seen.has(group[j].id)) continue;

        // Only match across different sources
        if (group[i].grantmaker === group[j].grantmaker) continue;

        // Must have similar amount and close dates
        if (amountsMatch(group[i].amount, group[j].amount) && datesClose(group[i].date, group[j].date)) {
          // Merge: keep the one with more info, add funders from both
          const keeper = group[j]; // keep the first one
          if (!keeper.funders) keeper.funders = [keeper.grantmaker];
          keeper.funders.push(group[i].grantmaker);
          keeper.funders = [...new Set(keeper.funders)];

          seen.add(group[i].id);
          isDuplicate = true;
          fuzzyMerged++;
          break;
        }
      }

      if (!isDuplicate) {
        dedupedGrants.push(group[i]);
      }
    }
  }

  if (fuzzyMerged > 0) {
    console.log(`[Dedup] Layer 2: Merged ${fuzzyMerged} fuzzy duplicates`);
  }

  const stats: DedupStats = {
    totalBefore: grants.length,
    excluded,
    fuzzyMerged,
    totalAfter: dedupedGrants.length,
  };

  console.log(`[Dedup] Result: ${dedupedGrants.length} unique grants`);
  return { grants: dedupedGrants, stats };
}
