/**
 * Residual Grant Computation
 *
 * For grantmakers with published annual totals but incomplete individual grant data,
 * creates synthetic "residual" grants representing the gap.
 *
 * Residual = Published Total - Sum(Known Individual Grants)
 */

import { Grant } from '../types/grants';
import annualTotals from './mappings/annual-totals.json';

interface ResidualStats {
  generated: number;
  byGrantmaker: Record<string, { years: number; totalResidual: number }>;
}

// Map grantmaker names to their keys in annual-totals.json
const GRANTMAKER_KEYS: Record<string, string> = {
  'EA Funds': 'EA Funds',
  'Open Philanthropy': 'Open Philanthropy',
  'GiveWell': 'GiveWell',
  'SFF': 'SFF',
  'ACE': 'ACE',
  'Founders Pledge': 'Founders Pledge',
};

// Category distribution hints for residual grants (when we don't know the breakdown)
const RESIDUAL_CATEGORIES: Record<string, string> = {
  'GiveWell': 'GH',
  'SFF': 'LTXR',
  'ACE': 'AW',
  'Founders Pledge': 'Other',
};

export function computeResiduals(grants: Grant[]): { residuals: Grant[]; stats: ResidualStats } {
  console.log('[Residuals] Computing residual grants...');

  // Sum known grants by grantmaker and year
  const knownTotals = new Map<string, Map<string, number>>();
  for (const g of grants) {
    if (g.is_residual || g.exclude_from_total) continue;

    const year = g.date.slice(0, 4);
    if (!knownTotals.has(g.grantmaker)) knownTotals.set(g.grantmaker, new Map());
    const yearMap = knownTotals.get(g.grantmaker)!;
    yearMap.set(year, (yearMap.get(year) || 0) + g.amount);
  }

  const residuals: Grant[] = [];
  const byGrantmaker: Record<string, { years: number; totalResidual: number }> = {};

  const totalsData = annualTotals as Record<string, Record<string, number>>;

  for (const [grantmakerKey, yearTotals] of Object.entries(totalsData)) {
    if (grantmakerKey.startsWith('_')) continue; // skip comments

    const known = knownTotals.get(grantmakerKey) || new Map<string, number>();

    let yearsWithResidual = 0;
    let totalResidual = 0;

    for (const [year, publishedTotal] of Object.entries(yearTotals)) {
      if (year.startsWith('_')) continue; // skip comments
      const knownTotal = known.get(year) || 0;
      const residualAmount = publishedTotal - knownTotal;

      // Only create a residual if there's a meaningful gap (>$100k and >5%)
      if (residualAmount > 100000 && residualAmount / publishedTotal > 0.05) {
        const category = RESIDUAL_CATEGORIES[grantmakerKey] || 'Other';
        const pctCovered = ((knownTotal / publishedTotal) * 100).toFixed(1);

        const grant: Grant = {
          id: `residual-${grantmakerKey.toLowerCase().replace(/\s+/g, '-')}-${year}`,
          title: `${grantmakerKey} — Unpublished Grants (${year})`,
          recipient: `Various (${grantmakerKey})`,
          amount: residualAmount,
          currency: 'USD',
          date: `${year}-07-01`,
          grantmaker: grantmakerKey,
          category,
          focus_area: `Residual (${pctCovered}% itemized)`,
          is_residual: true,
          residual_note: `Published total: $${(publishedTotal / 1e6).toFixed(1)}M, Itemized: $${(knownTotal / 1e6).toFixed(1)}M (${pctCovered}%), Residual: $${(residualAmount / 1e6).toFixed(1)}M`,
        };

        residuals.push(grant);
        yearsWithResidual++;
        totalResidual += residualAmount;
      }
    }

    if (yearsWithResidual > 0) {
      byGrantmaker[grantmakerKey] = { years: yearsWithResidual, totalResidual };
      console.log(`[Residuals] ${grantmakerKey}: ${yearsWithResidual} years with residuals, $${(totalResidual / 1e6).toFixed(1)}M total`);
    }
  }

  const stats: ResidualStats = {
    generated: residuals.length,
    byGrantmaker,
  };

  console.log(`[Residuals] Generated ${residuals.length} residual grants`);
  return { residuals, stats };
}
