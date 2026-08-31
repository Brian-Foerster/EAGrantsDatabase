export interface Grant {
  id: string;
  title: string;
  recipient: string;
  amount: number; // in USD
  currency: string;
  date: string; // ISO date string
  grantmaker: string;
  description?: string;
  url?: string;
  category?: string;       // LTXR, GH, AW, Meta, Other
  focus_area?: string;
  fund?: string;

  // Scraping pipeline fields
  is_residual?: boolean;
  residual_note?: string;
  source_id?: string;
  funders?: string[];
  country?: string;
  topics?: string[];
  exclude_from_total?: boolean;

  // Regrant handling: a grant made by a regrantor (e.g. BlueDot, Manifund) whose
  // money originates from grants already tracked in the database. `regrant_of` names
  // the recipient(s) under which those upstream grants appear (e.g. ["BlueDot Impact"]
  // or ["Manifund"]). A regrant's dollars are counted net of those upstream grants
  // when they are in scope, so funder -> regrantor -> recipient isn't double-counted.
  regrant?: boolean;
  regrant_of?: string[];
}

// Category codes used for sector taxonomy
export type CategoryCode = 'LTXR' | 'GH' | 'AW' | 'Meta' | 'Other';

// Result from a single scraper
export interface ScrapeResult {
  source: string;
  grants: Grant[];
  errors: string[];
  scrapedAt: string;
}

export interface GrantSource {
  name: string;
  url: string;
  lastUpdated?: string;
}

export interface AggregatedData {
  grants: Grant[];
  sources: GrantSource[];
  totalGrants: number;
  totalAmount: number;
  lastUpdated: string;
}
