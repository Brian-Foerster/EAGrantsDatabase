/**
 * Survival and Flourishing Fund (SFF) Scraper
 * Source: https://survivalandflourishing.fund/recommendations
 * All grants are LTXR category
 */

import * as cheerio from 'cheerio';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, saveRawData, parseDollarAmount } from '../scraper-utils';

const RECOMMENDATIONS_URL = 'https://survivalandflourishing.fund/recommendations';

function parseAmount(raw: string): number {
  if (!raw) return 0;

  // Handle matching pledges: "$1,535,000 +$500,000‡" → take base amount only
  const baseMatch = raw.match(/^\$?([\d,]+)/);
  if (baseMatch) {
    return parseDollarAmount(baseMatch[1]);
  }
  return parseDollarAmount(raw);
}

function roundToDate(round: string): string {
  // "SFF-2025" → "2025-07-01", "SFF-2024-H1" → "2024-03-01", "SFF-2024-H2" → "2024-09-01"
  const yearMatch = round.match(/(\d{4})/);
  if (!yearMatch) return '';
  const year = yearMatch[1];

  if (round.includes('H1') || round.includes('Q1') || round.includes('Q2')) {
    return `${year}-03-01`;
  }
  if (round.includes('H2') || round.includes('Q3') || round.includes('Q4')) {
    return `${year}-09-01`;
  }
  return `${year}-07-01`;
}

export async function scrapeSFF(): Promise<ScrapeResult> {
  const errors: string[] = [];
  console.log('[SFF] Fetching recommendations page...');

  const response = await fetchWithRetry(RECOMMENDATIONS_URL);
  const html = await response.text();
  console.log(`[SFF] Received ${(html.length / 1024).toFixed(0)}KB of HTML`);

  saveRawData('sff', html);

  const $ = cheerio.load(html);
  const grants: Grant[] = [];

  // SFF uses table rows. Try to find table elements first.
  const tables = $('table');
  console.log(`[SFF] Found ${tables.length} tables`);

  if (tables.length > 0) {
    tables.each((_ti, table) => {
      const rows = $(table).find('tr');
      rows.each((ri, row) => {
        if (ri === 0) return; // skip header

        const cells = $(row).find('td');
        if (cells.length < 4) return;

        const cellTexts = cells.map((_ci, cell) => $(cell).text().trim()).get();

        // Expected: Round, Source, Organization, Amount, [Receiving Charity], [Purpose]
        const round = cellTexts[0] || '';
        const source = cellTexts[1] || '';
        const org = cellTexts[2] || '';
        const amountStr = cellTexts[3] || '';
        const receivingCharity = cellTexts.length > 4 ? cellTexts[4] : '';
        const purpose = cellTexts.length > 5 ? cellTexts[5] : '';

        const amount = parseAmount(amountStr);
        if (amount <= 0) {
          errors.push(`Row ${ri}: invalid amount "${amountStr}" for ${org}`);
          return;
        }

        const date = roundToDate(round);
        if (!date) {
          errors.push(`Row ${ri}: can't parse date from round "${round}" for ${org}`);
          return;
        }

        // Build distinct title and description
        const titleText = org
          ? `${org} — ${purpose || round}`
          : purpose || `SFF Grant (${round})`;
        const descParts: string[] = [];
        if (purpose) descParts.push(purpose);
        if (receivingCharity && receivingCharity !== org) descParts.push(`Receiving charity: ${receivingCharity}`);
        descParts.push(`Round: ${round}`);
        if (source) descParts.push(`Source: ${source}`);

        const grant: Grant = {
          id: `sff-${String(grants.length).padStart(5, '0')}`,
          title: titleText,
          recipient: org,
          amount,
          currency: 'USD',
          date,
          grantmaker: 'SFF',
          description: descParts.join('. '),
          category: 'LTXR',
          focus_area: 'Long-Term & X-Risk',
          fund: source || 'SFF',
          source_id: `sff-${round}-${org.replace(/\s+/g, '-').slice(0, 40)}`,
        };

        grants.push(grant);
      });
    });
  }

  // If no tables found, try parsing structured text/divs
  if (grants.length === 0) {
    console.log('[SFF] No table grants found, attempting text parsing...');

    // Look for structured data in divs or other elements
    const allText = $('body').text();
    const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);

    let currentRound = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect round headers
      const roundMatch = line.match(/^(SFF-\d{4}(?:-H[12])?)/i);
      if (roundMatch) {
        currentRound = roundMatch[1];
        continue;
      }

      // Try to detect amount patterns in lines
      const amountMatch = line.match(/\$[\d,]+/);
      if (amountMatch && currentRound) {
        const amount = parseAmount(amountMatch[0]);
        if (amount > 0) {
          // Try to extract organization name (before the dollar amount)
          const orgPart = line.slice(0, line.indexOf('$')).trim();
          if (orgPart && orgPart.length > 2) {
            const grant: Grant = {
              id: `sff-${String(grants.length).padStart(5, '0')}`,
              title: `Grant to ${orgPart}`,
              recipient: orgPart,
              amount,
              currency: 'USD',
              date: roundToDate(currentRound),
              grantmaker: 'SFF',
              category: 'LTXR',
              focus_area: 'Long-Term & X-Risk',
              source_id: `sff-${currentRound}-${grants.length}`,
            };
            grants.push(grant);
          }
        }
      }
    }
  }

  console.log(`[SFF] Processed ${grants.length} grants (${errors.length} errors)`);

  return {
    source: 'sff',
    grants,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}
