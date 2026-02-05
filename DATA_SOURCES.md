# EA Grants Database — Data Sources & Methodology

## Overview

The EA Grants Database aggregates individual grant data from the major Effective Altruism grantmakers. Where individual grant data is unavailable, residual grants are computed from published annual totals to ensure complete coverage of the EA funding universe.

**Current totals:** 4,705 grants, $5.7B, spanning 2012–2025.

**Pipeline:** `npm run scrape` → `npm run build:data` → site rebuild

---

## Data Sources

### 1. EA Funds

| Field | Value |
|-------|-------|
| **Endpoint** | `https://funds.effectivealtruism.org/api/grants` |
| **Format** | CSV (served directly from API) |
| **Scraper** | `scripts/scrapers/ea-funds.ts` |
| **Grants** | ~1,595 |
| **Coverage** | 2017–2025 |
| **Update frequency** | Quarterly (after each funding round) |

**How it works:** A single HTTP GET to the API returns a CSV with columns: `id, fund, description, grantee, amount, round, published, year, highlighted`. The `round` field (e.g., "2025 Q3") is converted to a date. Funds are mapped to the sector taxonomy via `scripts/mappings/eaf-funds.json`:

- Long-Term Future Fund → LTXR
- EA Infrastructure Fund → Meta
- Animal Welfare Fund → AW
- Global Health and Development Fund → GH

**Reliability:** Excellent. Clean API, stable format, no authentication required.

---

### 2. Open Philanthropy

| Field | Value |
|-------|-------|
| **Endpoint** | `https://raw.githubusercontent.com/rufuspollock/open-philanthropy-grants/main/OpenPhilGrants.csv` |
| **Format** | CSV (archived on GitHub) |
| **Scraper** | `scripts/scrapers/open-phil.ts` |
| **Grants** | ~2,361 |
| **Coverage** | 2012–October 2024 |
| **Update frequency** | Archive is static (last updated Dec 2024) |

**How it works:** Open Philanthropy's website (`openphilanthropy.org`) now redirects to `coefficientgiving.org`, which no longer has a public grants database. We use Rufus Pollock's GitHub archive of the grants CSV, which was scraped before the redirect.

CSV columns: `Grant, Organization Name, Focus Area, Amount, Date`. The `Focus Area` field is mapped to the sector taxonomy via `scripts/mappings/op-focus-areas.json`. Date is in "Month Year" format (e.g., "October 2024").

**Deduplication:** Grants with focus area containing "GiveWell" are flagged `exclude_from_total = true` to avoid double-counting with GiveWell's own data. This removes ~147 grants.

**Limitation:** This archive will not receive new data. Future Open Phil / Coefficient Giving grants will need a new data source.

**2024 annual total ($650M):** The EA historical grantmaking spreadsheet used $495M for Open Phil 2024, but this appears to undercount. Multiple sources point to a higher figure:

- Good Ventures' 2024 report states they "funded $593 million in grants recommended by Open Philanthropy, including $113 million to GiveWell's top charities" ([Good Ventures](https://www.goodventures.org/our-portfolio/grantmaking-approach/))
- Inside Philanthropy reports Open Phil "directed over $100 million to causes from donors besides Good Ventures in 2024" ([Inside Philanthropy, Nov 2025](https://www.insidephilanthropy.com/home/open-philanthropy-is-now-coefficient-giving-heres-what-has-and-hasnt-changed))
- The MCF 2025 memo lists Open Phil at "~$650M" ([EA Forum](https://forum.effectivealtruism.org/posts/dm2uawLLeLbY8WNKM/updates-on-the-effective-giving-ecosystem-mcf-2025-memo))

We use $650M as a conservative estimate. The true figure may be closer to $693M ($593M Good Ventures + $100M+ other donors). Prior years (2014–2023) use the EA historical grantmaking spreadsheet figures which have not been revised.

---

### 3. Survival and Flourishing Fund (SFF)

| Field | Value |
|-------|-------|
| **Endpoint** | `https://survivalandflourishing.fund/recommendations` |
| **Format** | HTML table |
| **Scraper** | `scripts/scrapers/sff.ts` |
| **Grants** | ~471 |
| **Coverage** | 2019–2025 |
| **Update frequency** | ~2x per year (after each funding round) |

**How it works:** The recommendations page contains a single `<table>` with all historical grants. Parsed with cheerio. Columns: `Round, Source, Organization, Amount, Receiving Charity, Purpose`.

The `Round` field (e.g., "SFF-2024") is converted to a date. Amounts with matching pledges (e.g., "$1,535,000 +$500,000‡") use only the base amount. All SFF grants are categorized as LTXR.

**Reliability:** Good. Stable HTML structure. Occasionally the amount column includes footnote markers that need parsing.

---

### 4. GiveWell

| Field | Value |
|-------|-------|
| **Endpoint** | Manual CSV export from Airtable shared view |
| **Airtable URL** | `https://airtable.com/appaVhon0jdLt1rVs/shrixNMUWCSC5v1lh/tblykYPizxzYj3U1L/viwJ3DyqAUsL654Rm` |
| **Format** | CSV |
| **Scraper** | `scripts/scrapers/givewell.ts` |
| **Grants** | ~439 |
| **Coverage** | 2014–2025 |
| **Update frequency** | Ongoing (Airtable is kept current by GiveWell) |

**How it works:** GiveWell publishes its grants database as an Airtable shared view. There is no public API or CSV endpoint — the CSV must be downloaded manually:

1. Open the Airtable link above in a browser
2. Click the view menu (⋮) → "Download CSV"
3. Save to `data/raw/givewell-grants.csv`
4. Run `npm run scrape`

CSV columns: `Grant, Recipient, Amount, Date, Link to grant description, Topics, Funders, Countries`. All grants are categorized as GH (Global Health). The `Funders` and `Topics` fields are comma-separated lists preserved in the grant record.

**Reliability:** Good data quality. Manual download step is the main friction point.

---

### 5. Founders Pledge (Residuals Only)

| Field | Value |
|-------|-------|
| **Source** | IRS 990 filings via ProPublica Nonprofit Explorer |
| **Grants** | Residual entries only (no individual grant data available) |
| **Coverage** | 2016–2024 |
| **Category** | Other (mixed: climate, GH, biosecurity, AI safety) |

**How it works:** Founders Pledge publishes a grantees page but without dollar amounts per grant. Annual grant totals are taken from their 990 filings and stored in `scripts/mappings/annual-totals.json`. Since we have no individual grant data, all Founders Pledge entries are residual grants representing their full annual disbursements.

**990 totals used:**
| Year | Grants Paid |
|------|------------|
| 2016 | $180K |
| 2017 | $630K |
| 2018 | $1.3M |
| 2020 | $4.9M |
| 2021 | $26.5M |
| 2022 | $28.1M |
| 2023 | $36.8M |
| 2024 | $30.1M |

---

### 6. Animal Charity Evaluators (Residuals Only)

| Field | Value |
|-------|-------|
| **Source** | Annual totals from EA historical grantmaking spreadsheet |
| **Grants** | Residual entries only |
| **Coverage** | 2014–2024 |
| **Category** | AW (Animal Welfare) |

**How it works:** ACE publishes giving metrics but no machine-readable grant database. Annual totals are stored in `scripts/mappings/annual-totals.json` and used to generate residual grants.

---

## Processing Pipeline

### Deduplication (`scripts/dedup.ts`)

Two layers:

1. **Source-level flags:** Grants marked `exclude_from_total = true` are removed. Currently used for Open Phil's "GiveWell-recommended charities" focus area grants (~147 grants), which would otherwise double-count with GiveWell's own data.

2. **Cross-source fuzzy matching:** For grants to the same recipient (normalized) within the same year with amounts within 10%, the duplicate is merged. The surviving grant gains a `funders[]` array listing all co-funding sources. This catches ~43 duplicates.

### Residual Computation (`scripts/residuals.ts`)

For each grantmaker with published annual totals in `scripts/mappings/annual-totals.json`:

```
Residual = Published Annual Total − Sum(Itemized Grants for that year)
```

A residual grant is generated only if the gap exceeds both $100K and 5% of the published total. Residual grants are marked `is_residual = true` with the calculation in `residual_note`.

### Category Taxonomy

| Code | Name | Description |
|------|------|-------------|
| LTXR | Long-Term & X-Risk | AI safety, biosecurity, pandemic preparedness, nuclear, forecasting |
| GH | Global Health | Global health & development, malaria, nutrition, deworming |
| AW | Animal Welfare | Farm animal welfare, cage-free campaigns |
| Meta | EA Meta | EA infrastructure, effective giving, careers, capacity building |
| Other | Other | Scientific research, criminal justice, immigration, climate, policy |

Mappings from source-specific categories to this taxonomy are in:
- `scripts/mappings/op-focus-areas.json` (Open Phil focus areas → category)
- `scripts/mappings/eaf-funds.json` (EA Funds fund names → category)

---

## Known Limitations

### Itemization gaps

Not all grantmakers publish individual grant data. The database has full itemization for EA Funds, SFF, and GiveWell. Other sources have partial or zero itemization:

| Source | Itemization | Notes |
|--------|-------------|-------|
| EA Funds | ~100% | Full individual grant data via API |
| GiveWell | ~90%+ | Full for 2019+, sparse for earlier years; Airtable CSV may not include all historical grants |
| SFF | ~100% | Full via HTML table |
| Open Philanthropy | ~58% for 2024 | GitHub archive ends Oct 2024. The original grants page now redirects to coefficientgiving.org with no public database. Earlier years are well-covered. |
| Founders Pledge | 0% | No public grant-level data with amounts. 100% residual. |
| ACE | 0% | No public grant-level data. 100% residual. |

Residual grants fill the dollar-amount gaps but cannot provide recipient/project-level detail. ~100% dollar coverage does not mean ~100% itemization.

### Sparse metadata fields

- **SFF:** No country, topics, or URL data published. Description is limited to "General support" in many cases.
- **Open Phil:** No country or topics data in the archived CSV. Only 5 columns available (Grant, Organization, Focus Area, Amount, Date).
- **EA Funds:** No country or topics. Description quality varies (some entries are detailed, many are brief).

These fields are empty because the upstream sources don't provide them, not because of scraping failures.

### Open Phil data freshness

The Open Phil archive at `github.com/rufuspollock/open-philanthropy-grants` was last updated December 2024 with data through October 2024. Open Philanthropy rebranded to Coefficient Giving and their grants page now redirects without a public database. New Open Phil/Coefficient grants after October 2024 will not appear until a new data source is identified.

### Founders Pledge category assignment

Founders Pledge grants span multiple cause areas (climate, global health, biosecurity, AI safety) but we don't have per-grant category data. All FP residuals are categorized as "Other" since we can't determine the breakdown.

---

## Validation

The pipeline prints a validation report comparing scraped totals against published annual totals. Dollar coverage should be ~100% (within rounding). This validates that the combination of itemized grants + residuals accounts for the full published funding universe. It does not validate itemization depth.

---

## Monthly Refresh Process

```bash
# 1. (Optional) Re-download GiveWell CSV from Airtable
#    Save to data/raw/givewell-grants.csv

# 2. Run the scraping pipeline
npm run scrape

# 3. Build the site data
npm run build:data

# 4. (Optional) Export CSV
npx tsx scripts/export-csv.ts

# 5. Start dev server to verify
npm run dev
```

---

## Output Files

| File | Description |
|------|-------------|
| `data/raw/all-grants.json` | Full grant data with all fields (4,705 grants) |
| `data/ea-grants-database.csv` | CSV export for external use |
| `lib/scraped-grants.json` | Lean JSON consumed by the build pipeline |
| `data/raw/{source}-result.json` | Per-source scrape results with error logs |
| `data/raw/{source}-{date}.json` | Raw data snapshots for debugging |
| `public/data/grants.min.json` | Minimized grants for the UI |
| `public/data/grants.full.json` | Full grants with descriptions |
