import { Grant } from '../types/grants';

export type YearTotals = Record<string, unknown>;
export type AnnualTotalsMap = Record<string, unknown>;

export interface StaleBaseline {
  grantmaker: string;
  year: string;
  published: number;
  known: number;
}

export function computeKnownTotals(grants: Grant[]): Map<string, Map<string, number>> {
  const knownTotals = new Map<string, Map<string, number>>();

  for (const g of grants) {
    if (g.is_residual || g.exclude_from_total) continue;
    const year = g.date.slice(0, 4);
    if (!knownTotals.has(g.grantmaker)) knownTotals.set(g.grantmaker, new Map());
    const yearMap = knownTotals.get(g.grantmaker)!;
    yearMap.set(year, (yearMap.get(year) || 0) + g.amount);
  }

  return knownTotals;
}

export function getEffectivePublishedTotal(publishedTotal: number, knownTotal: number): number {
  if (publishedTotal <= 0) return knownTotal;
  return Math.max(publishedTotal, knownTotal);
}

export function findStaleBaselines(
  annualTotals: AnnualTotalsMap,
  knownTotals: Map<string, Map<string, number>>,
): StaleBaseline[] {
  const stale: StaleBaseline[] = [];

  for (const [grantmakerKey, yearTotals] of Object.entries(annualTotals)) {
    if (grantmakerKey.startsWith('_')) continue;
    if (typeof yearTotals !== 'object' || yearTotals === null) continue;

    const known = knownTotals.get(grantmakerKey) || new Map<string, number>();
    for (const [year, published] of Object.entries(yearTotals as YearTotals)) {
      if (year.startsWith('_')) continue;
      if (typeof published !== 'number' || published <= 0) continue;
      const knownTotal = known.get(year) || 0;
      if (knownTotal > published) {
        stale.push({
          grantmaker: grantmakerKey,
          year,
          published,
          known: knownTotal,
        });
      }
    }
  }

  stale.sort((a, b) => b.known - b.published - (a.known - a.published));
  return stale;
}
