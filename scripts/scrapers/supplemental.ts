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
 *
 * To update: edit/add JSON files in data/raw/supplemental/. Each file is an
 * array of Grant objects with stable ids.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Grant, ScrapeResult } from '../../types/grants';

const SUPPLEMENTAL_DIR = path.join(process.cwd(), 'data', 'raw', 'supplemental');

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
        if (Array.isArray(data)) grants.push(...data);
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
