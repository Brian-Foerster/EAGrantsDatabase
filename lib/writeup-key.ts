/**
 * Stable content key for attaching archived writeup links to grants.
 *
 * public/data/grant-writeups.json maps grants to archived Open Phil / Coefficient
 * writeup URLs. It used to be keyed by grant id (e.g. "cg-00001", "cg-alg-00011"),
 * but those ids are assigned by scrape position: a CSV whose rows shift, or an
 * Algolia index that grows, reassigns them, and every entry silently re-points at
 * a different grant. That is exactly what happened when the Algolia set grew from
 * 2,798 to 2,830 records — 25 writeups ended up on unrelated grants.
 *
 * Keying by grant content instead survives re-scrapes: recipient + amount + month
 * identifies the grant regardless of where it lands in the source. Month (not year)
 * granularity drives cross-grant collisions to zero on the current data while
 * keeping the key robust to day-level date jitter from quarter/round parsing.
 *
 * This function is the single source of truth for that key. Both the writeups file
 * (built once by scripts/ tooling) and the client lookup (pages/index.tsx) must
 * compute it identically, so any change here has to be applied to the data file too.
 */
export function writeupKey(recipient: string, amount: number, date: string): string {
  const rec = String(recipient || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const amt = Math.round(Number(amount) || 0);
  const month = String(date || '').slice(0, 7); // YYYY-MM
  return `${rec}|${amt}|${month}`;
}
