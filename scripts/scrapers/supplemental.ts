/**
 * Supplemental (manually curated) grantmakers
 *
 * Loads hand-curated grant data from data/raw/supplemental/*.json for
 * grantmakers that publish grants but have no scrapeable feed:
 *  - FLI (Future of Life Institute): per-grant amounts from its grant-program
 *    pages (fellowship/RFP cohorts without published amounts are omitted)
 *  - Meta Charity Funders: round retrospectives posted on the EA Forum
 *  - Macroscopic Ventures (ex-Polaris/CERR): the publicly amount-disclosed
 *    grants from its grants page
 *  - Longview Philanthropy: Emerging Challenges Fund report grants (regrants,
 *    netted against tracked grants to Longview)
 *
 * To update: edit/add JSON files in data/raw/supplemental/. Each file is an
 * array of Grant objects with stable ids.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Grant, ScrapeResult } from '../../types/grants';
import { withTextFragment } from '../scraper-utils';

const SUPPLEMENTAL_DIR = path.join(process.cwd(), 'data', 'raw', 'supplemental');

// Sources whose pages list many grants and render recipient names in the page HTML
// (checked 2026-11: FLI 76/76, Longview 11/12, Macroscopic 2/2), so a text fragment
// lands on the grant. Drive PDFs don't support fragments; EA Forum posts are unchecked.
const FRAGMENT_SOURCES = new Set(['FLI', 'Longview Philanthropy', 'Macroscopic Ventures']);

export async function scrapeSupplemental(): Promise<ScrapeResult> {
  const errors: string[] = [];
  const grants: Grant[] = [];

  if (fs.existsSync(SUPPLEMENTAL_DIR)) {
    for (const file of fs.readdirSync(SUPPLEMENTAL_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(SUPPLEMENTAL_DIR, file), 'utf-8')
        );
        if (Array.isArray(data)) {
          for (const g of data as Grant[]) {
            if (g.url && FRAGMENT_SOURCES.has(g.grantmaker) && !/drive\.google\.com/.test(g.url))
              g.url = withTextFragment(g.url, g.recipient);
            grants.push(g);
          }
        }
        else errors.push(`${file}: not an array`);
      } catch (err: any) {
        errors.push(`${file}: ${err.message}`);
      }
    }
  } else {
    errors.push('supplemental directory missing');
  }

  return {
    source: 'supplemental',
    grants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
