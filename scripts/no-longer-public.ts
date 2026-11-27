/**
 * The site shows only grants that are publicly documented right now. When a refresh drops
 * rows because their source stopped publishing them (a Manifund project made private, a grant
 * removed from a funder's database, a published total revised down), the dropped rows are
 * appended here so there is still a personal record of them.
 *
 * data/local/ is gitignored: this record is never committed or published.
 */
import * as fs from 'fs';
import * as path from 'path';

export const NO_LONGER_PUBLIC_FILE = path.join(process.cwd(), 'data', 'local', 'no-longer-public.json');

export interface NoLongerPublicEntry {
  recorded: string;   // YYYY-MM-DD
  source: string;     // the data file or scraper the rows came from
  reason: string;
  rows: unknown[];
}

export function recordNoLongerPublic(source: string, reason: string, rows: unknown[]): void {
  if (!rows.length) return;
  fs.mkdirSync(path.dirname(NO_LONGER_PUBLIC_FILE), { recursive: true });
  const log: NoLongerPublicEntry[] = fs.existsSync(NO_LONGER_PUBLIC_FILE)
    ? JSON.parse(fs.readFileSync(NO_LONGER_PUBLIC_FILE, 'utf8'))
    : [];
  log.push({ recorded: new Date().toISOString().slice(0, 10), source, reason, rows });
  fs.writeFileSync(NO_LONGER_PUBLIC_FILE, JSON.stringify(log, null, 1) + '\n');
  console.log(`  recorded ${rows.length} no-longer-public row(s) in data/local/no-longer-public.json`);
}
