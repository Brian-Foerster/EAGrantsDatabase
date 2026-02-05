# EA Grants Universe - Comprehensive Scraping & Data Plan

## The Universe We're Tracking

Based on the [PUBLIC] EA historical grantmaking spreadsheet, the EA grants universe
totals approximately **$900M-$1B per year** (2023-2024) across 5 major grantmakers:

| Grantmaker | 2024 Total | Individual Grants Available? |
|---|---|---|
| Open Philanthropy (ex GW) | $495M | Yes - 2,715 grants on openphilanthropy.org |
| GiveWell | $353M | Yes - ~1,000 grants via Airtable |
| SFF | $36M | Yes - hundreds via HTML table |
| EA Funds (ex GW) | $12M | Yes - 1,593 grants via API |
| Animal Charity Evaluators | $10M | Totals only (284 grants, detail page TBD) |
| **Total** | **$906M** | |

Additional sources not in the spreadsheet (to add):
- **Founders Pledge** - 200+ grantees, fund-level grant pages
- **FTX Future Fund** - ~$133M total (archived, 2022)
- **Manifund** - project-based funding platform
- **Longview Philanthropy** - major EA funder, no public grant DB found
- **Effective Giving** orgs (e.g. Doneer Effectief, Effektiv Spenden) - appear as co-funders in GiveWell data

## Sector Taxonomy

The spreadsheet uses 5 sectors. We adopt these as our top-level categories:

| Code | Category | Description |
|---|---|---|
| LTXR | Long-Term & X-Risk | AI safety, biosecurity, pandemic prep, forecasting |
| GH | Global Health | Global health & development, poverty interventions |
| AW | Animal Welfare | Farm animal welfare, wild animal suffering |
| Meta | EA Meta/Infrastructure | Community building, effective giving, careers |
| Other | Other | Scientific research, policy, misc |

### Category Mapping Tables (from spreadsheet)

**Open Phil focus areas → Sector:**
- Navigating Transformative AI → LTXR
- Biosecurity & Pandemic Preparedness → LTXR
- Science Supporting Biosecurity → LTXR
- Forecasting → LTXR (or Other per spreadsheet)
- Farm Animal Welfare → AW
- Farm Animal Welfare in Asia → AW
- Global Health R&D → GH
- Global Public Health Policy → GH
- Economic Growth in LMICs → GH
- Global Aid Policy → GH
- Effective Giving & Careers → Meta
- Global Catastrophic Risks Capacity Building → Meta
- Abundance & Growth → Other
- Scientific Research → Other

**EA Funds → Sector:**
- Long-Term Future Fund → LTXR
- EA Infrastructure Fund → Meta
- Animal Welfare Fund → AW
- Global Health and Development Fund → GH

**GiveWell** → All GH (by definition)

**SFF** → All LTXR (AI safety, x-risk focus)

**ACE** → All AW (by definition)

---

## Double-Counting Problem

The spreadsheet already handles the main overlaps:
1. **Open Phil ↔ GiveWell**: Open Phil funds many GiveWell-recommended charities. The spreadsheet tracks "OpenPhil (ex GW)" - excluding grants that also appear in GiveWell's list. The GiveWell tab has a "GW Match?" column in the OpenPhil data and "Funders" column in GiveWell data showing which org originated the funding.
2. **EA Funds ↔ GiveWell**: EA Funds' Global Health fund overlaps with GiveWell grantees. The spreadsheet tracks "EA Funds (ex GW)" and the EA Funds tab has "Listed in GW tab" flags.

### Deduplication Strategy

**Layer 1 - Source-level flags (already done by spreadsheet)**
- OpenPhil grants tagged "GiveWell recommended charities" → exclude from OpenPhil, count under GiveWell
- EA Funds grants appearing in GiveWell tab → exclude from EA Funds, count under GiveWell

**Layer 2 - Cross-source matching (we need to implement)**
For each grant, generate a dedup key: `normalize(recipient) + year + round_amount_to_nearest_1000`
- Fuzzy match recipient names (e.g., "Against Malaria Foundation" vs "AMF")
- Same recipient + same year + amount within 5% → likely duplicate
- Flag for manual review rather than auto-removing

**Layer 3 - Co-funded grants**
GiveWell data shows "Funders" field with values like "Open Philanthropy", "All Grants Fund", "Board Designated", "Doneer Effectief", "Effektiv Spenden". These represent the *funding source*, not a separate grant. A single GiveWell grant may be co-funded by multiple sources. We should:
- Track the grant once under GiveWell
- Store the funding sources as metadata
- NOT double-count as both a GiveWell grant and an Open Phil grant

---

## Residual Grants

For grantmakers that publish annual totals but not all individual grants, we create
synthetic "residual" entries to capture the full universe.

### How Residual Grants Work

```
Residual Amount = Published Annual Total - Sum of Known Individual Grants
```

If a grantmaker reports $10M in "Animal Welfare 2024" but we only have $7M in
itemized grants, we create:

```json
{
  "id": "ace-residual-aw-2024",
  "title": "Animal Charity Evaluators - Animal Welfare (2024, unitemized)",
  "recipient": "Various recipients",
  "amount": 3000000,
  "date": "2024-07-01",
  "grantmaker": "Animal Charity Evaluators",
  "category": "Animal Welfare",
  "fund": "Movement Grants",
  "is_residual": true,
  "residual_note": "Computed from published total ($10M) minus itemized grants ($7M)"
}
```

### Which Sources Need Residuals

| Source | Has Individual Grants? | Has Published Totals? | Needs Residuals? |
|---|---|---|---|
| Open Philanthropy | Yes (full DB) | Yes | No - grant DB is comprehensive |
| GiveWell | Yes (full DB) | Yes | No - Airtable has all grants |
| EA Funds | Yes (API, 1,593) | Yes | No - API appears complete |
| SFF | Yes (HTML table) | Yes ($152M) | Possibly - verify table vs total |
| ACE | Partial (detail page TBD) | Yes ($10M/yr) | Yes - likely |
| Founders Pledge | Partial (fund pages) | "not complete" per site | Yes |
| FTX Future Fund | Partial (archived) | Yes ($133M) | Yes |
| Manifund | Unknown | Unknown | TBD |

### Residual Grant Generation Process

1. For each grantmaker+year, look up published annual total (from spreadsheet or annual reports)
2. Sum all itemized grants for that grantmaker+year
3. If residual > 0 and residual > 5% of total, create a residual entry
4. Break residuals down by sector when sector-level totals are available
   - e.g., "ACE - Animal Welfare 2024" rather than just "ACE 2024"
5. Mark all residuals with `is_residual: true` flag
6. As more individual grants are discovered, residuals automatically shrink on rebuild

---

## Data Model (Updated)

```typescript
interface Grant {
  id: string;
  title: string;
  recipient: string;
  amount: number;
  currency: string;
  date: string;
  grantmaker: string;
  category?: string;       // LTXR, GH, AW, Meta, Other
  focus_area?: string;      // Sub-category (e.g., "Navigating Transformative AI")
  fund?: string;            // Fund within grantmaker
  description?: string;
  url?: string;

  // New fields for universe tracking
  is_residual?: boolean;    // True if this is a computed residual entry
  residual_note?: string;   // Explanation of how residual was computed
  source_id?: string;       // Original ID from source system
  funders?: string[];       // Co-funding sources (especially for GiveWell)
  country?: string;         // Recipient country when available
  topics?: string[];        // Fine-grained topic tags
  exclude_from_total?: boolean; // For known duplicates kept for reference
}
```

---

## Scraping Plan by Source

### Phase 1: Primary Sources (individual grant data)

#### 1a. EA Funds (~1,593 grants)
- **Method:** Fetch `https://funds.effectivealtruism.org/api/grants` (CSV)
- **Mapping:**
  - grantee → recipient
  - description → title + description
  - fund → fund (Long-Term Future Fund, etc.)
  - round → date (parse "2025 Q3" to "2025-07-01")
  - Use EAF mapping table for category
- **Dedup:** Flag grants also in GiveWell using "Listed in GW tab" logic
- **Exclude flag:** The spreadsheet excludes some grants; replicate this logic

#### 1b. Open Philanthropy (~2,715 grants)
- **Method:** Download CSV from GitHub + scrape openphilanthropy.org/grants/ for newest
- **Mapping:**
  - Organization Name → recipient
  - Grant title → title
  - Focus Area → focus_area (use OP mapping table for category)
  - Amount, Date → direct
- **Dedup:** Exclude "GiveWell recommended charities" focus area grants (counted under GiveWell)
- **Note:** Largest single source by dollar amount (~$500M/yr)

#### 1c. GiveWell (~1,000 grants)
- **Method:** Scrape from Airtable (via public embed or API), or use the website data
- **Mapping:**
  - Recipient → recipient
  - Grant description → title
  - Amount, Date → direct
  - Topics → focus_area / topics
  - Funders → funders array
  - Countries → country
- **Dedup:** All GH. Funders field shows co-funding sources - do NOT also count these under Open Phil
- **Category:** All GH by definition

#### 1d. SFF (hundreds of grants)
- **Method:** Parse HTML table from https://survivalandflourishing.fund/recommendations
- **Mapping:**
  - Organization → recipient
  - Amount → amount (handle "$X +$Y" matching pledge format)
  - Round → date (parse "SFF-2025" to year)
  - Source → fund/donor
  - Receiving Charity → fiscal sponsor (metadata)
  - Purpose → description
- **Dedup:** Unlikely to overlap with others (unique focus on x-risk orgs)
- **Category:** All LTXR
- **Residual check:** Compare sum vs published $152M total

### Phase 2: Secondary Sources (partial data + residuals)

#### 2a. ACE Movement Grants
- **Method:** Find and scrape "Past grants recipients" detail page
- **Published totals by year:** $0.1M (2014) → $9.8M (2024) from spreadsheet
- **Residual:** Compare itemized grants vs published annual total; create residual per year
- **Category:** All AW

#### 2b. Founders Pledge
- **Method:** Scrape individual fund grant pages (Climate, Global Health, etc.)
- **Fund pages to discover:** Crawl https://www.founderspledge.com/funds/ for all fund URLs
- **Note:** Self-described as "not a complete list" - residuals likely needed
- **Residual:** Would need published annual totals (check annual reports)

#### 2c. FTX Future Fund (archived)
- **Method:** Parse Wayback Machine snapshots
- **Published total:** ~$133M
- **Residual:** Compare archived grants vs $133M; create residual for difference
- **Category:** Likely mostly LTXR/Meta

### Phase 3: Supplementary Sources

#### 3a. Vipul Naik Donations List
- **Use as:** Validation layer, not primary source
- **Value:** Cross-reference our scraped totals against their 207K records
- **Also useful for:** Discovering grantmakers we missed

#### 3b. OpenBook
- **Use as:** Validation/comparison only (aggregates same sources)

#### 3c. Manifund
- **Method:** Investigate Supabase endpoints via open-source code
- **Priority:** LOW - different model (market-based funding, not traditional grants)

---

## Avoiding Double-Counting: Decision Tree

```
For each scraped grant:

1. Is it an Open Phil grant with focus area "GiveWell recommended charities"?
   → Exclude (counted under GiveWell)

2. Is it an EA Funds grant that also appears in GiveWell's database?
   → Exclude from EA Funds count (counted under GiveWell)

3. Is it a GiveWell grant with "Open Philanthropy" in Funders field?
   → Keep under GiveWell only. Record "Open Philanthropy" in funders array.
     Do NOT create a separate Open Phil entry.

4. Does fuzzy match (recipient + year + ~amount) find a match in another source?
   → Flag for manual review. Keep the more detailed record.

5. Otherwise → include as-is
```

---

## Build Pipeline (Updated)

```
scripts/
  scrapers/
    ea-funds.ts            # API fetch, CSV parse
    open-phil.ts           # GitHub CSV + website scrape
    givewell.ts            # Airtable scrape
    sff.ts                 # HTML table parse
    ace.ts                 # HTML scrape + residuals
    founders-pledge.ts     # Multi-page HTML scrape + residuals
    ftx-archive.ts         # Wayback Machine parse + residuals
    manifund.ts            # TBD
  mappings/
    op-focus-areas.json    # Open Phil focus area → category
    eaf-funds.json         # EA Funds fund → category
    recipient-aliases.json # Fuzzy match aliases for dedup
  normalize.ts             # Map all sources to unified Grant schema
  dedup.ts                 # Cross-source deduplication
  residuals.ts             # Compute and generate residual grants
  build-data.ts            # Existing build pipeline (updated)
```

### Dependencies
- `csv-parse` / `csv-stringify` - CSV processing
- `cheerio` - HTML parsing
- `date-fns` - date normalization (already installed)
- Node 18+ built-in `fetch` - HTTP requests

---

## Annual Totals Reference (from spreadsheet, pre-inflation)

For residual computation and validation:

| Grantmaker | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|---|---|
| Open Phil (ex GW) | $270M | $185M | $444M | $433M | $531M | $495M |
| GiveWell | $93M | $124M | $325M | $420M | $323M | $353M |
| SFF | $1.8M | $5.4M | $19.4M | $18.2M | $31.2M | $36.5M |
| EA Funds (ex GW) | $5.3M | $1.2M | $19.8M | $31.0M | $13.8M | $11.7M |
| ACE | $8.9M | $10.9M | $10.8M | $8.3M | $8.8M | $9.8M |
| **Total** | **$379M** | **$326M** | **$819M** | **$910M** | **$908M** | **$906M** |

### Sector Breakdown (2024, pre-inflation)

| Sector | Open Phil | EA Funds | GiveWell | SFF | ACE | Total |
|---|---|---|---|---|---|---|
| LTXR | $109M | $5.4M | - | $36.5M | - | $151M |
| GH | $152M | $0 | $353M | - | - | $505M |
| AW | $66M | $4.0M | - | - | $9.8M | $80M |
| Meta | $113M | $2.2M | - | - | - | $115M |
| Other | $55M | $0 | - | - | - | $55M |
| **Total** | **$495M** | **$11.7M** | **$353M** | **$36.5M** | **$9.8M** | **$906M** |

---

## Spreadsheet Methodology Notes (important caveats)

The spreadsheet applies several adjustments we should replicate:
- **EA Funds:** "Only counting Q1 2025 and *4ing" for partial-year estimates
- **GiveWell:** "Excluding all H2 2025 and doubling" for partial-year estimates
- **Open Phil:** "Excluding all H2 2025 and doubling"; removed "GiveWell recommended charities" grants; manually cross-checked GH&D grants against GW tab
- **SFF:** "1.5x 2025 value assuming grants updated thru ~September"
- **ACE:** Annual totals from a Google Sheets source (linked in spreadsheet)

For our database, we should:
- Use actual individual grants (not annualized estimates)
- Only apply residuals for gaps, not for projection
- Store the spreadsheet totals as validation benchmarks
