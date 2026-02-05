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
