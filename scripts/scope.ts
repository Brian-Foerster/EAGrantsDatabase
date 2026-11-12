import { Grant } from '../types/grants';

// Coefficient Giving focus areas outside EA cause areas. Other sources' non-EA grants are
// never imported, so these are dropped too. They still count toward Coefficient's published
// annual totals when residuals are computed, so the gap isn't backfilled as unitemized money.
export const OUT_OF_SCOPE_FUNDS: Record<string, string[]> = {
  'Coefficient Giving': [
    'Abundance & Growth',
    'Criminal Justice Reform',
    'Housing Policy Reform',
    'Immigration Policy',
    'Innovation Policy',
    'Land Use Reform',
    'Macroeconomic Stabilization Policy',
  ],
};

export function isOutOfScope(g: Grant): boolean {
  return !!g.fund && (OUT_OF_SCOPE_FUNDS[g.grantmaker] || []).includes(g.fund);
}
