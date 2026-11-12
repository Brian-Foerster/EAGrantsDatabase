/**
 * CLR Fund (Center on Long-Term Risk) scraper
 *
 * Source: https://longtermrisk.org/grantmaking/ — a single page listing every grant
 * the CLR Fund has made (2018 onward). Each grant is a
 *   <tbody class="grant" data-date data-type data-amount …>
 * whose first row holds the date, the recipient (td.grants-recipient), the purpose,
 * and the amount in its ORIGINAL currency (td.num, e.g. "39,180 GBP"). The detail
 * row has the full write-up and a "Disbursed by" fact.
 *
 * data-amount is CLR's own USD-converted value (39,180 GBP -> 50934; 2,500 EUR ->
 * 2750) — we use it as the USD amount and keep the original-currency figure in the
 * description, so no exchange-rate table is needed here.
 */

import * as cheerio from 'cheerio';
import { Grant, ScrapeResult } from '../../types/grants';
import { fetchWithRetry, saveRawData } from '../scraper-utils';

const URL = 'https://longtermrisk.org/grantmaking/';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; EAGrantsDatabase/1.0)' };

const TYPE_LABEL: Record<string, string> = {
  research: 'Research', career: 'Career development', study: 'Study',
  event: 'Event', organization: 'Organization', other: 'Other',
};

export async function scrapeCLRFund(): Promise<ScrapeResult> {
  const errors: string[] = [];
  const grants: Grant[] = [];
  const html = await (await fetchWithRetry(URL, { headers: UA })).text();
  const $ = cheerio.load(html);
  const raw: unknown[] = [];

  $('tbody.grant').each((_, el) => {
    const t = $(el);
    const id = (t.attr('id') || '').replace(/^grant-/, '');
    // Usually YYYY-MM-DD; a few older grants are month-precision (YYYY-MM).
    let date = t.attr('data-date') || '';
    if (/^\d{4}-\d{2}$/.test(date)) date += '-01';
    const usd = parseFloat(t.attr('data-amount') || '');
    const type = (t.attr('data-type') || '').toLowerCase();
    const first = t.find('tr').first();
    const recipient = first.find('td.grants-recipient').text().trim();
    const purposeCell = first.find('td').eq(2).clone();
    purposeCell.find('.grants-type').remove();
    const purpose = purposeCell.text().trim();
    const nativeAmount = first.find('td.num').text().trim(); // "39,180 GBP"
    const detail = t.find('tr.grants-detail');
    const facts: Record<string, string> = {};
    detail.find('dl.grants-facts dt').each((__, dt) => {
      facts[$(dt).text().trim().toLowerCase()] = $(dt).next('dd').text().trim();
    });
    const writeup = detail.find('.grants-panel').clone().find('dl').remove().end().text().replace(/\s+/g, ' ').trim();

    raw.push({ id, date, usd, type, recipient, purpose, nativeAmount, facts });
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !recipient || !(usd > 0)) {
      errors.push(`grant ${id || '(no id)'}: missing ${[!date && 'date', !recipient && 'recipient', !(usd > 0) && 'amount'].filter(Boolean).join(', ')}`);
      return;
    }
    const nonUsd = nativeAmount && !/USD$/i.test(nativeAmount);
    const descParts = [
      writeup,
      nonUsd ? `Paid as ${nativeAmount} (USD value as reported by CLR).` : '',
      facts['disbursed by'] ? `Disbursed by ${facts['disbursed by']}.` : '',
    ].filter(Boolean);

    grants.push({
      id: `clr-${id}`,
      title: purpose || `${TYPE_LABEL[type] || 'Grant'}`,
      recipient,
      amount: Math.round(usd * 100) / 100,
      currency: 'USD',
      date,
      grantmaker: 'CLR Fund',
      description: descParts.join(' '),
      url: `${URL}#grant-${id}`,
      category: 'LTXR',
      focus_area: `S-risks (${TYPE_LABEL[type] || 'Grant'})`,
      fund: 'CLR Fund',
      source_id: id,
    });
  });

  // The page states its own count ("of 46 grants") — use it as a completeness check.
  const stated = /of\s+(\d+)\s+grants/i.exec($.root().text());
  if (stated && +stated[1] !== $('tbody.grant').length) {
    errors.push(`page says ${stated[1]} grants but ${$('tbody.grant').length} rows were found`);
  }

  saveRawData('clr-fund', raw);
  return { source: 'clr-fund', grants, errors, scrapedAt: new Date().toISOString() };
}
