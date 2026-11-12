# EA Grants Database — Data Sources & Methodology

## Overview

The EA Grants Database aggregates individual grant data from the major Effective Altruism grantmakers. Where individual grant data is unavailable, residual grants are computed from published annual totals to ensure complete coverage of the EA funding universe.

**Current totals:** See the live site for the latest totals (counts and amounts change with each data refresh).

**Pipeline:** `npm run scrape` → `npm run build:data` → site rebuild

---

## Licensing & Attribution

The application **code** is MIT-licensed ([LICENSE](LICENSE)). The aggregated
**dataset** is published under **CC BY 4.0** ([LICENSE-DATA](LICENSE-DATA)) —
reuse freely with credit to "EA Grants Database (www.eagrantsdatabase.org)".
The programmatic data contract is documented in [API.md](API.md).

Grant *facts* are compiled from the sources below; each has its own terms.
Credit the original grantmaker alongside this database when reusing their
records.

| Source | Grantmaker(s) surfaced | Underlying terms |
|---|---|---|
| Coefficient Giving grants archive (CSV + public Algolia index) | Coefficient Giving | Publicly published grants archive; facts. Algolia access uses Coefficient's own public, read-only search key. |
| EA Funds API + payout reports | EA Funds (LTFF, EAIF, AWF, GHDF), incl. Rapid Grants | Public API, no auth. |
| GiveWell Airtable shared view | GiveWell | Publicly shared grants database; manual CSV export. |
| Survival and Flourishing Fund recommendations | SFF | Public recommendations table. |
| Animal Charity Evaluators grants page | ACE | Public Movement Grants page. |
| Founders Pledge fund pages + 990 filings | Founders Pledge | Publicly published fund grant tables; IRS 990 filings (public record) via ProPublica. |
| BlueDot Impact public grants API | BlueDot (regrants) | Publicly listed grantees and program totals. |
| Manifund public API | Manifund | Public project data. |
| Sentinel Bio grant pages; CLR Fund grantmaking page | Sentinel Bio, CLR Fund | Publicly published grant listings. |
| **Manifund / Trace** (`trace.manifund.org`) | ACX Grants, The Audacious Project, OpenAI Foundation (and BlueDot's earlier rows) | **CC0 / public domain** — no attribution required (credit appreciated). |
| FLI grant program pages | FLI | Publicly published grant listings; manually curated into `data/raw/supplemental/`. |
| Meta Charity Funders; Navigation Fund | Meta Charity Funders, Navigation Fund | Publicly published grant listings; manually curated. |

Records ingested from **Trace are CC0**, which is what makes the ACX Grants,
Audacious Project, and OpenAI Foundation additions clean to redistribute.
Residual and regrant-apportioned figures are **derived estimates** produced by
this project's methodology (below), not values reported by the grantmakers —
attribute those to the EA Grants Database.

> **Sources not yet detailed below:** FLI, Meta Charity Funders, Navigation
> Fund, Manifund, and the Trace-sourced grantmakers (ACX, Audacious, OpenAI
> Foundation) have no numbered section; "Refresh workflow & cadence" says how
> each is maintained. The table above is the authoritative source list.

---

## Data Sources

### 1. EA Funds

| Field | Value |
|-------|-------|
| **Endpoint** | `https://funds.effectivealtruism.org/api/grants` (CSV) |
| **Supplement** | Payout reports listed in `https://funds.effectivealtruism.org/sitemap.xml` (`/payouts/` pages) |
| **Format** | CSV (served directly from API) |
| **Scraper** | `scripts/scrapers/ea-funds.ts` |
| **Grants** | ~1,595 |
| **Coverage** | 2017–2025 |
| **Update frequency** | Quarterly (after each funding round) |

**How it works:** A single HTTP GET to the API returns a CSV with columns: `id, fund, description, grantee, amount, round, published, year, highlighted`. The `round` field (e.g., "2025 Q3") is converted to a date. Funds are mapped to the sector taxonomy via `scripts/mappings/eaf-funds.json`. We also scrape payout report pages (from the public sitemap) to capture grants that appear on the site before they land in the API. Payout grants are parsed from the "All Grants We Approved" lists on each report page and deduplicated against the API.

- Long-Term Future Fund → LTXR
- EA Infrastructure Fund → Meta
- Animal Welfare Fund → AW
- Global Health and Development Fund → GH

**Reliability:** Excellent. Clean API, stable format, no authentication required.

---

### 2. Coefficient Giving (formerly Open Philanthropy)

| Field | Value |
|-------|-------|
| **Endpoint** | `https://coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv` |
| **Format** | CSV (official archive) |
| **Scraper** | `scripts/scrapers/open-phil.ts` |
| **Grants** | ~2,713 |
| **Coverage** | 2012–2025 |
| **Update frequency** | Updated periodically by Coefficient Giving |

**How it works:** We scrape the official Coefficient Giving Grants Archive CSV, which is published at `coefficientgiving.org`. This replaced the previous GitHub archive which only had data through October 2024. To capture newer grants not yet reflected in the CSV (and to attach per-grant URLs), we also pull the public Algolia grants index used on Coefficient’s site and merge any additional grants.

CSV columns: `Grant, Organization Name, Focus Area, Amount, Date, Details`. The `Focus Area` field is mapped to the sector taxonomy via `scripts/mappings/op-focus-areas.json`. Date is in "Month Year" format (e.g., "October 2024").

**Deduplication:** Grants with focus area containing "GiveWell" are flagged `exclude_from_total = true` to avoid double-counting with GiveWell's own data. This removes ~152 grants.

**2024 annual total ($650M):** Multiple sources support this figure:

- Good Ventures' 2024 report states they "funded $593 million in grants recommended by Open Philanthropy, including $113 million to GiveWell's top charities" ([Good Ventures](https://www.goodventures.org/our-portfolio/grantmaking-approach/))
- Inside Philanthropy reports Open Phil "directed over $100 million to causes from donors besides Good Ventures in 2024" ([Inside Philanthropy, Nov 2025](https://www.insidephilanthropy.com/home/open-philanthropy-is-now-coefficient-giving-heres-what-has-and-hasnt-changed))
- The MCF 2025 memo lists Open Phil at "~$650M" ([EA Forum](https://forum.effectivealtruism.org/posts/dm2uawLLeLbY8WNKM/updates-on-the-effective-giving-ecosystem-mcf-2025-memo))

We use $650M as a conservative estimate. Prior years (2014–2023) use the EA historical grantmaking spreadsheet figures.

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
| **Grants** | ~440 |
| **Coverage** | 2014–2026 |
| **Update frequency** | Ongoing (Airtable is kept current by GiveWell) |

**How it works:** GiveWell publishes its grants database as an Airtable shared view. There is no public API or CSV endpoint — the CSV must be downloaded manually:

1. Open the Airtable link above in a browser
2. Click the view menu (⋮) → "Download CSV"
3. Save to `data/raw/givewell-grants.csv`
4. Run `npm run scrape`

CSV columns: `Grant, Recipient, Amount, Date, Link to grant description, Topics, Funders, Countries`. All grants are categorized as GH (Global Health). The `Funders` and `Topics` fields are comma-separated lists preserved in the grant record.

**Reliability:** Good data quality. Manual download step is the main friction point.

---

### 5. Founders Pledge (Fund Grants + 990 Residuals)

| Field | Value |
|-------|-------|
| **Source (itemized)** | The five fund pages, `https://www.founderspledge.com/funds/<slug>` |
| **Source (totals)** | IRS 990 filings via [ProPublica Nonprofit Explorer](https://projects.propublica.org/nonprofits/organizations/371795297) |
| **Scraper** | `scripts/scrapers/founders-pledge.ts` |
| **Grants** | ~147 fund grants + ~8 advised grants + annual residuals |
| **Coverage** | 2020–present (fund grants); 2016–2024 (990 totals) |
| **Category** | By fund: Climate → Other, GCR → LTXR, Catalytic Impact (GHD) → GH, Animal Welfare → AW, Patient Philanthropy → LTXR |

**How it works:** each fund page is a Next.js page whose complete grant table ships
inside the page's flight payload (`self.__next_f.push(...)`) as
`content-blocks.fund-recipients` blocks — `{ id, date, name, recipientUrl, grant,
amount, grantUrl }`, with day-precision dates and exact amounts. The visible table shows
only the first rows behind "Load More"; the payload has them all. Names ending in `*`
were paid in a non-USD currency; FP's "converted reference value" is used as the USD
amount.

**Advised grants** (a separate block on some fund pages) were "identified, evaluated
and advised on by Fund Managers; resources were deployed by external philanthropists
through their giving infrastructure, separately from the Fund." They are included
under their own fund value — `<Fund> (Advised)` — and flagged `outside_baseline`, so
they do **not** reduce the 990 residual (that money never passed through FP's books).
As a result FP's yearly total can exceed its 990 total by the advised amount.

**Residuals:** the US entity's 990 grants-paid totals live in
`scripts/mappings/annual-totals.json`; a year's residual is the 990 total minus that
year's itemized fund grants. This is approximate, in both directions:
- Fund pages list grants when **committed**; 990s record **cash paid** (e.g. DeployUS:
  $1.75M committed in Dec 2023, $875K paid in 2023).
- Some fund grants are paid by **Founders Pledge Ltd (UK)**, which files no 990, so
  they are not part of the US total they are subtracted from. Only ~55% of 2020–24 fund
  grants appear in the US 990 grant lists.
- The 990 totals also include member-directed and pass-through grants (e.g. to CEA USA
  for the Long-Term Future Fund) that are not FP fund grantmaking.

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

**Not yet used: the 990 grant lists.** FP Inc filed 990-PF for 2020–2023 (Part XV lists
every grant paid, foreign included, with purpose) and a 990 for 2024 (Schedule I:
102 US grants, $26.3M; foreign grants by region only). These itemize 70–94% of each
year's total and could itemize the residual, but would first need reconciling against
the fund grants (commitment vs payment) and a scope decision on member-directed gifts.
ProPublica's XML download is bot-protected; its rendered schedule pages
(`/nonprofits/full_text/<object_id>/IRS990PF` or `/IRS990ScheduleI`) parse cleanly.

---

### 5a. Sentinel Bio

| Field | Value |
|-------|-------|
| **Source** | `https://sentinelbio.org/grant-sitemap.xml` → one page per grant |
| **Scraper** | `scripts/scrapers/sentinel-bio.ts` |
| **Coverage** | 2024–present, month precision |
| **Category** | LTXR (biosecurity) |

Each grant page carries the recipient (`<h1>`), "Month Year / focus area"
(`h3.title`) and a narrative opening "We provided $X to …". Pages that publish no
amount (a few, some with no text at all) are skipped and logged.

### 5b. CLR Fund (Center on Long-Term Risk)

| Field | Value |
|-------|-------|
| **Source** | `https://longtermrisk.org/grantmaking/` |
| **Scraper** | `scripts/scrapers/clr-fund.ts` |
| **Coverage** | 2018–present, day precision |
| **Category** | LTXR (s-risks) |

One page; each grant is a `<tbody class="grant" data-date data-amount data-type>`.
`data-amount` is CLR's own USD-converted value; the original GBP/EUR figure is kept in
the description. The page states its own grant count, which the scraper checks.

### 5c. BlueDot Impact (regrants)

| Field | Value |
|-------|-------|
| **Source** | bluedot.org tRPC API: `grants.getAllPublicRapidGrantees`, `grants.getCareerTransitionGrantStats` |
| **Script** | `npm run refresh:bluedot -- --write` (append-only, like Manifund) |
| **Data file** | `data/raw/bluedot-regrants.json` |
| **Category** | LTXR |

Rapid grants are matched to existing rows by first name + amount + month (multiset),
because BlueDot's public list drops some older grantees over time and the earlier
Trace import paraphrased project titles. Career Transition Grants publish only a
cumulative count and total, so they are carried as `Career Transition Grants
(Unitemized)` residual rows: the backlog as one row, then one row per refresh for
the increase. Rapid grants that BlueDot counts but does not list publicly are not
residualized.

---

### 6. Animal Charity Evaluators (Movement Grants + Residuals)

| Field | Value |
|-------|-------|
| **Source** | Movement grants recipients page + annual totals from EA historical grantmaking spreadsheet |
| **Grants** | Itemized movement grants + residual entries |
| **Coverage** | 2014–2025 (movement grants), 2014–2024 (totals) |
| **Category** | AW (Animal Welfare) |

**How it works:** ACE publishes a "past movement grants recipients" page with recipient + amount lines. We scrape those into itemized grants and use annual totals from `scripts/mappings/annual-totals.json` to compute residuals for remaining unitemized grantmaking.

---

## Processing Pipeline

### Deduplication (`scripts/dedup.ts`)

Two layers:

1. **Source-level flags:** Grants marked `exclude_from_total = true` are removed. Currently used for Coefficient Giving's "GiveWell-recommended charities" focus area grants (~152 grants), which would otherwise double-count with GiveWell's own data.

2. **Cross-source fuzzy matching:** For grants to the same recipient (normalized) within the same year with amounts within 10%, the duplicate is merged. The surviving grant gains a `funders[]` array listing all co-funding sources. This catches ~43 duplicates.

### Residual Computation (`scripts/residuals.ts`)

For each grantmaker with published annual totals in `scripts/mappings/annual-totals.json`:

```
Residual = Published Annual Total − Sum(Itemized Grants for that year)
```

A residual grant is generated only if the gap exceeds $100K. Baseline total is `max(published annual total, known itemized total)` to prevent stale annual totals from creating negative coverage artifacts. Residual grants are marked `is_residual = true` with the calculation in `residual_note`.

### Category Taxonomy

| Code | Name | Description |
|------|------|-------------|
| LTXR | Long-Term & X-Risk | AI safety, biosecurity, pandemic preparedness, nuclear, forecasting |
| GH | Global Health | Global health & development, malaria, nutrition, deworming |
| AW | Animal Welfare | Farm animal welfare, cage-free campaigns |
| Meta | EA Meta | EA infrastructure, effective giving, careers, capacity building |
| Science | Scientific Research | Scientific research grants |
| Policy | Policy Reform | Criminal justice, immigration, housing, macroeconomic policy |
| Other | Other | Grants that don't fit other categories |

Mappings from source-specific categories to this taxonomy are in:
- `scripts/mappings/op-focus-areas.json` (Coefficient Giving focus areas → category)
- `scripts/mappings/eaf-funds.json` (EA Funds fund names → category)

### Sub-category tagging (level-2, AI-assisted)

Every grant also gets a level-2 `sub_category` (e.g. `gh-malaria`, `ltxr-ai-tech`)
within its category. The taxonomy and the assignment logic live in
`scripts/sub-categories.ts`; `build:data` applies it automatically, so coverage
is always 100%. Assignment is, in priority order:

1. **Deterministic rules** on the structured signal (`focus_area` + `fund`), then
   on the grant title — pure, auditable lookups (~71% of grants).
2. **AI recipient map** (`scripts/mappings/sub-categories-ai.json`) — fills what
   the rules leave at the broad "— general" level, keyed by recipient. This map is
   produced by a tagging agent using the organization's identity + grant titles,
   constrained to the fixed sub-category ids.
3. **"— general"** bucket — honest fallback for aggregate/residual rows and
   unidentifiable recipients (anonymous/unknown).

**This step is part of the grant-update workflow.** After a scrape adds grants,
run `npm run tag:subcats` to regenerate the work list of *new* residual
recipients (`data/raw/subcat-worklist.json`); if any appear, have a tagging agent
extend `sub-categories-ai.json` for them, then `npm run tag:subcats validate`
(must report `Invalid ids: 0`) before building. Existing labels are keyed by
recipient and reused, so each refresh only classifies genuinely new recipients —
cheap and stable.

---

## Refresh workflow & cadence

```
npm run scrape             # auto sources + source guard
npm run refresh:manifund -- --write  # Manifund projects + ACX review list
npm run refresh:bluedot -- --write   # BlueDot rapid grants + career-transition total
npm run tag:subcats        # list NEW recipients needing sub-categories
                           #   → tag them, then: npm run tag:subcats validate
npm run build              # rebuild public/data + the site
```

**Automatic** (handled by `npm run scrape`): Coefficient Giving, EA Funds, SFF,
ACE, Founders Pledge (fund pages), Sentinel Bio, CLR Fund, and the residual
computation. The source guard aborts
the run if any source returns zero or regresses more than 10%.

**Manual, per refresh:**

| Source | How to refresh |
|---|---|
| **GiveWell** | No public API. Download the CSV from the Airtable shared view to `data/raw/givewell-grants.csv` (the file is gitignored), then re-scrape. This is the only step that cannot be automated. |
| **Manifund** | `npm run refresh:manifund -- --write` — pages Manifund's own API. Do **not** import Manifund from Trace: our rows are project-level aggregates, while Trace stores the same money as per-donation rows keyed by individual donors, so a Trace import would double-count at the wrong granularity. |
| **BlueDot** | `npm run refresh:bluedot -- --write` — BlueDot's own public API (Trace's copy lags by weeks). Append-only. |
| **ACX Grants** | `refresh:manifund` prints an **ACX REVIEW** list of funded ACX-tagged Manifund projects we don't hold. Manifund's API doesn't say which transactions were ACX's, so confirm ACX's grant (results post / project page) and add rows to `data/raw/supplemental/acx-grants.json` by hand. Some listed projects are ACX Forecasting mini-grants / impact certificates, not ACX Grants. |
| **Audacious, OpenAI Foundation** | No feed; curated in `data/raw/supplemental/trace-funders.json`. Optionally re-check `https://trace.manifund.org/grants.json`. OpenAI's People-First AI Fund is out of EA scope. |
| **FLI, Meta Charity Funders, Navigation Fund** | Hand-curated in `data/raw/supplemental/`; check the funders' pages for new rounds. FLI publishes grant *year* only, so dates are set to mid-year. |

### IRS Form 990 timing (Founders Pledge + Org Financials)

Founders Pledge's residuals are computed from 990 annual totals, and the Org
Financials dataset is built from 990 filings — so both are gated by the IRS
filing calendar, not by our scrape schedule. (FP's fund-page grants are not.)

For a calendar fiscal year, Form 990 is due the 15th day of the 5th month after
year end (**May 15**), and an automatic six-month extension (Form 8868) pushes
that to **November 15**. Most larger nonprofits extend. The IRS then releases
e-file data on a rolling, roughly monthly basis, and ProPublica/Candid ingest it
with a further lag — so a filing typically becomes queryable one to three months
after it is submitted.

Practical cadence: **check in January and again in March** for the prior fiscal
year's filings, which captures most extension filers; expect good coverage by
mid-year. Organisations with non-calendar fiscal years (tracked per-org as
`fy_end_month`) shift accordingly, so a given fiscal year never arrives all at
once.

---

## Known Limitations

### Itemization gaps

Not all grantmakers publish individual grant data. The database has full itemization for EA Funds, SFF, and GiveWell. Other sources have partial or zero itemization:

| Source | Itemization | Notes |
|--------|-------------|-------|
| EA Funds | ~100% | Full individual grant data via API + payout reports |
| GiveWell | ~90%+ | Full for 2019+, sparse for earlier years; Airtable CSV may not include all historical grants |
| SFF | ~100% | Full via HTML table |
| Coefficient Giving | Partial for 2024+ | The official archive CSV is updated periodically as grants are published. Earlier years are well-covered. |
| Founders Pledge | Partial | Fund grants itemized from fund pages (2020+); grants outside the funds remain 990 residuals. |
| ACE | Partial | Movement grants are itemized; remaining funding is residual. |

Residual grants fill the dollar-amount gaps but cannot provide recipient/project-level detail. ~100% dollar coverage does not mean ~100% itemization.

### Sparse metadata fields

- **SFF:** No country, topics, or URL data published. Description is limited to "General support" in many cases.
- **Coefficient Giving:** No country or topics data in the archive CSV. Only 5 columns available (Grant, Organization, Focus Area, Amount, Date).
- **EA Funds:** No country or topics. Description quality varies (some entries are detailed, many are brief).

These fields are empty because the upstream sources don't provide them, not because of scraping failures.

### Publication timing and year-over-year comparisons

Grants appear in public databases when they are **published**, not when they are committed or disbursed. This creates significant lag:

- **Coefficient Giving** may publish grants months after they are made, and some grants (particularly in global catastrophic risk areas) may never be published publicly
- **GiveWell** anticipated ~$350M in 2025 grantmaking but the database may show substantially less due to publication timing
- **EA Funds** publishes quarterly after each funding round

This timing issue affects year-over-year trend analysis. A decline in grants for the current or prior year may reflect publication lag rather than actual funding changes. For reliable trend analysis, use data from years where publication is substantially complete (typically 2+ years prior).

For more on this issue, see the [Historical EA Funding Data (2025 Update)](https://forum.effectivealtruism.org/posts/NWHb4nsnXRxDDFGLy/historical-ea-funding-data-2025-update) analysis on the EA Forum.

### Coefficient Giving data freshness

The Coefficient Giving archive at `coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv` is updated periodically by Coefficient Giving as grants are published. Per their [grant publishing process](https://coefficientgiving.org/grant-publishing-process/), grants are typically published within a few months of being made.

### Founders Pledge category assignment

Itemized fund grants take their fund's category (Climate → Other, GCR → LTXR, Catalytic Impact → GH, Animal Welfare → AW). The 990 residuals span every cause area with no breakdown, so they remain "Other".

### FTX Future Fund

The FTX Future Fund committed approximately $160M in grants during 2022 before the collapse of FTX. These grants are excluded because it is unclear which commitments were actually disbursed and which were clawed back during bankruptcy proceedings. There is no authoritative source distinguishing paid grants from unfulfilled commitments.

---

## Validation

The pipeline prints a validation report comparing scraped totals against baseline annual totals. Baseline uses `max(published, known itemized)` for each grantmaker-year and reports stale published baselines when itemized grants exceed published totals. Dollar coverage should be ~100% (within rounding). This validates that itemized grants + residuals account for the baseline funding universe. It does not validate itemization depth.

---

## Output Files

| File | Description |
|------|-------------|
| `data/raw/all-grants.json` | Full grant data with all fields |
| `data/ea-grants-database.csv` | CSV export for external use |
| `lib/scraped-grants.json` | Lean JSON consumed by the build pipeline |
| `data/raw/{source}-result.json` | Per-source scrape results with error logs |
| `data/raw/{source}-{date}.json` | Raw data snapshots for debugging |
| `public/data/grants.min.json` | Grant data for the UI (includes descriptions) |
