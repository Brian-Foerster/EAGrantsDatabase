/**
 * GiveWell Scraper
 * Source: Airtable CSV export (manual download)
 * All grants are GH (Global Health) category.
 *
 * CSV columns: Grant, Recipient, Amount, Date, Link to grant description, Topics, Funders, Countries
 *
 * Airtable shared view: https://airtable.com/appaVhon0jdLt1rVs/shrixNMUWCSC5v1lh/tblykYPizxzYj3U1L/viwJ3DyqAUsL654Rm
 *
 * To refresh GiveWell data:
 *   1. Open the Airtable link above in a browser
 *   2. Click "Download CSV" from the view menu (⋮ → Download CSV)
 *   3. Save to data/raw/givewell-grants.csv
 *   4. Re-run: npm run scrape
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { Grant, ScrapeResult } from '../../types/grants';
import { normalizeDate, parseDollarAmount } from '../scraper-utils';

const CSV_PATH = path.join(process.cwd(), 'data', 'raw', 'givewell-grants.csv');

interface GWRawGrant {
  Grant: string;
  Recipient: string;
  Amount: string;
  Date: string;
  'Link to grant description': string;
  Topics: string;
  Funders: string;
  Countries: string;
}

export async function scrapeGiveWell(): Promise<ScrapeResult> {
  const errors: string[] = [];

  if (!fs.existsSync(CSV_PATH)) {
    console.log('[GiveWell] No local CSV found at data/raw/givewell-grants.csv');
    console.log('[GiveWell] To get GiveWell data:');
    console.log('  1. Open https://airtable.com/appaVhon0jdLt1rVs/shrixNMUWCSC5v1lh/tblykYPizxzYj3U1L/viwJ3DyqAUsL654Rm');
    console.log('  2. Click the view menu (...) -> Download CSV');
    console.log('  3. Save to data/raw/givewell-grants.csv');
    console.log('  4. Re-run: npm run scrape');

    return {
      source: 'givewell',
      grants: [],
      errors: ['No GiveWell CSV file found. Manual download from Airtable required.'],
      scrapedAt: new Date().toISOString(),
    };
  }

  console.log('[GiveWell] Reading local CSV...');
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  console.log(`[GiveWell] Read ${(csvText.length / 1024).toFixed(0)}KB`);

  const records: GWRawGrant[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });

  console.log(`[GiveWell] Parsed ${records.length} records`);
  if (records.length > 0) {
    console.log(`[GiveWell] Columns: ${Object.keys(records[0]).join(', ')}`);
  }

  const grants: Grant[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    const amount = parseDollarAmount(r.Amount);
    if (amount <= 0) {
      errors.push(`Row ${i}: invalid amount "${r.Amount}" for ${r.Recipient || 'unknown'}`);
      continue;
    }

    const date = normalizeDate(r.Date);
    if (!date) {
      errors.push(`Row ${i}: invalid date "${r.Date}" for ${r.Recipient || 'unknown'}`);
      continue;
    }

    // Parse funders list (comma-separated)
    // Rename "Open Philanthropy" to clarify these are grants funded by Coefficient Giving but disbursed via GiveWell
    const funders = r.Funders
      ? r.Funders.split(',').map(f => f.trim()).filter(Boolean).map(f =>
          f === 'Open Philanthropy' ? 'Coefficient Giving (via GiveWell)' : f
        )
      : undefined;

    // Parse topics list
    const topics = r.Topics
      ? r.Topics.split(',').map(t => t.trim()).filter(Boolean)
      : undefined;

    // Build description from metadata rather than duplicating title
    const descParts: string[] = [];
    if (r.Grant) descParts.push(r.Grant);
    if (r.Countries) descParts.push(`Country: ${r.Countries}`);
    if (r.Topics) descParts.push(`Topics: ${r.Topics}`);
    if (r.Funders) descParts.push(`Funded by: ${r.Funders}`);
    const description = descParts.length > 1 ? descParts.join('. ') : '';

    const grant: Grant = {
      id: `gw-${String(i).padStart(5, '0')}`,
      title: r.Grant || `Grant to ${r.Recipient}`,
      recipient: r.Recipient || 'Unknown',
      amount,
      currency: 'USD',
      date,
      grantmaker: 'GiveWell',
      description,
      category: 'GH',
      focus_area: 'Global Health & Development',
      fund: funders?.[0] || undefined,
      source_id: `gw-row-${i}`,
      funders,
      country: r.Countries || undefined,
      topics,
      url: r['Link to grant description'] || undefined,
    };

    grants.push(grant);
  }

  console.log(`[GiveWell] Processed ${grants.length} grants (${errors.length} errors)`);

  return {
    source: 'givewell',
    grants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
