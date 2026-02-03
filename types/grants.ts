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
  category?: string;
  focus_area?: string;
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
