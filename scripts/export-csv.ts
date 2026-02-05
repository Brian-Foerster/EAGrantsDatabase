/**
 * Export all scraped grants to CSV
 * Usage: npx tsx scripts/export-csv.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { Grant } from '../types/grants';

const INPUT = path.join(process.cwd(), 'lib', 'scraped-grants.json');
const OUTPUT = path.join(process.cwd(), 'data', 'ea-grants-database.csv');

function escapeCsv(val: string): string {
  if (!val) return '';
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function main() {
  const grants: Grant[] = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));

  const headers = [
    'id',
    'title',
    'recipient',
    'amount_usd',
    'date',
    'grantmaker',
    'category',
    'focus_area',
    'fund',
    'is_residual',
    'country',
    'topics',
    'funders',
    'url',
    'description',
  ];

  const rows = grants.map(g => [
    escapeCsv(g.id),
    escapeCsv(g.title),
    escapeCsv(g.recipient),
    String(g.amount),
    escapeCsv(g.date),
    escapeCsv(g.grantmaker),
    escapeCsv(g.category || ''),
    escapeCsv(g.focus_area || ''),
    escapeCsv(g.fund || ''),
    g.is_residual ? 'TRUE' : '',
    escapeCsv(g.country || ''),
    escapeCsv((g.topics || []).join('; ')),
    escapeCsv((g.funders || []).join('; ')),
    escapeCsv(g.url || ''),
    escapeCsv((g.description || '').slice(0, 500)),
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');

  const dir = path.dirname(OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT, csv, 'utf-8');

  console.log(`Exported ${grants.length} grants to ${OUTPUT}`);
  console.log(`File size: ${(fs.statSync(OUTPUT).size / 1024).toFixed(0)}KB`);
}

main();
