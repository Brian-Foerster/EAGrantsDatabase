/**
 * Shared utilities for the scraping pipeline
 */

import * as fs from 'fs';
import * as path from 'path';
import { Grant, ScrapeResult } from '../types/grants';

const RAW_DATA_DIR = path.join(process.cwd(), 'data', 'raw');

export function ensureRawDir() {
  if (!fs.existsSync(RAW_DATA_DIR)) {
    fs.mkdirSync(RAW_DATA_DIR, { recursive: true });
  }
}

/** Save raw scrape results to disk for debugging and caching */
export function saveRawData(source: string, data: unknown) {
  ensureRawDir();
  const filename = `${source}-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(
    path.join(RAW_DATA_DIR, filename),
    JSON.stringify(data, null, 2)
  );
  console.log(`  Saved raw data to data/raw/${filename}`);
}

/** Save final scrape result */
export function saveScrapeResult(result: ScrapeResult) {
  ensureRawDir();
  const filename = `${result.source}-result.json`;
  fs.writeFileSync(
    path.join(RAW_DATA_DIR, filename),
    JSON.stringify(result, null, 2)
  );
}

/** Load a previously saved scrape result */
export function loadScrapeResult(source: string): ScrapeResult | null {
  const filepath = path.join(RAW_DATA_DIR, `${source}-result.json`);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  }
  return null;
}

/** Fetch with retries and timeout */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  delayMs = 2000
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) return response;

      if (response.status === 429 || response.status >= 500) {
        console.warn(`  Attempt ${attempt}/${maxRetries} got ${response.status}, retrying...`);
        await sleep(delayMs * attempt);
        continue;
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      console.warn(`  Attempt ${attempt}/${maxRetries} failed: ${err.message}, retrying...`);
      await sleep(delayMs * attempt);
    }
  }
  throw new Error('Max retries exceeded');
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Parse a dollar amount string like "$1,234,567" or "1234567" to number */
export function parseDollarAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Normalize a date string to ISO format (YYYY-MM-DD) */
export function normalizeDate(raw: string): string {
  if (!raw) return '';

  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  // Try parsing with Date
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  // Quarter format: "2025 Q3" → "2025-07-01"
  const qMatch = raw.match(/(\d{4})\s*Q(\d)/i);
  if (qMatch) {
    const year = qMatch[1];
    const quarter = parseInt(qMatch[2]);
    const month = String((quarter - 1) * 3 + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }

  // Year only: "2024" → "2024-07-01" (midpoint)
  const yMatch = raw.match(/^(\d{4})$/);
  if (yMatch) {
    return `${yMatch[1]}-07-01`;
  }

  return raw;
}

/** Generate a stable ID for a grant */
export function makeGrantId(source: string, index: number, extra?: string): string {
  const suffix = extra ? `-${extra.replace(/[^a-z0-9]/gi, '').slice(0, 30)}` : '';
  return `${source}-${String(index).padStart(5, '0')}${suffix}`;
}

/** Format bytes for display */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Summary stats for a scrape result */
export function summarize(result: ScrapeResult): string {
  const total = result.grants.reduce((s, g) => s + g.amount, 0);
  const years = new Set(result.grants.map(g => g.date.slice(0, 4)));
  const yearRange = years.size > 0
    ? `${Math.min(...[...years].map(Number))}-${Math.max(...[...years].map(Number))}`
    : 'none';
  return `${result.source}: ${result.grants.length} grants, $${(total / 1e6).toFixed(1)}M total, years ${yearRange}${result.errors.length ? `, ${result.errors.length} errors` : ''}`;
}
