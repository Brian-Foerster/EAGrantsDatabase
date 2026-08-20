import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const REPO_URL = 'https://github.com/Brian-Foerster/EAGrantsDatabase';
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSceNe8T97Z36LvBmepyid68MYbyairBvZucnZFlREGROSBOZA/viewform';
const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_TIME || Date.now().toString();

export default function About() {
  // Initialize to a constant (not window.innerWidth) so the server and the first
  // client render agree — avoids a hydration mismatch that can otherwise leave the
  // width state stuck. The effect below sets the real width immediately after mount.
  const [windowWidth, setWindowWidth] = useState(400);

  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Remove legacy cache-bust query param without reloading
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('v')) {
      url.searchParams.delete('v');
      const next = url.pathname + url.search + url.hash;
      window.history.replaceState({}, '', next);
    }
  }, []);

  const isPhonePortrait = windowWidth < 480;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const isMobile = windowWidth < 768;

  return (
    <>
      <Head>
        <title>About - EA Grants Database</title>
        <meta name="description" content="About the EA Grants Database — data sources, methodology, and limitations" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://brian-foerster.github.io/EAGrantsDatabase/about" />
      </Head>
      <main style={{
        ...styles.main,
        padding: isPhonePortrait ? '12px 12px' : isMobile ? '16px 16px' : isTablet ? '20px 40px' : '20px 80px'
      }}>
        <header style={{
          ...styles.header,
          minHeight: isMobile ? '196px' : '244px',
          padding: isMobile ? '18px 16px' : '32px 36px',
          marginBottom: isMobile ? '20px' : '40px'
        }}>
          <nav style={styles.nav}>
            <Link href="/" style={styles.navLink}>
              Grants Database
            </Link>
            <Link href="/recipients" style={styles.navLink}>
              Org Financials
            </Link>
            <Link href="/about" style={{ ...styles.navLink, ...styles.navLinkActive }}>
              About
            </Link>
          </nav>
          <h1 style={{
            ...styles.title,
            fontSize: isPhonePortrait ? '24px' : isMobile ? '28px' : '48px'
          }}>About</h1>
          <p style={{
            ...styles.subtitle,
            fontSize: isMobile ? '13px' : '18px'
          }}>
            Sources, methodology, and known limitations of the EA Grants Database and its companion org financials data.
          </p>
        </header>

        <section style={styles.section}>
          <div style={{
            ...styles.content,
            padding: isMobile ? '20px' : '40px'
          }}>
            <h2 style={styles.sectionTitle}>What this is</h2>
            <p style={styles.paragraph}>
              This site aggregates publicly available grant data from grantmakers associated with
              the Effective Altruism community. It currently includes over 6,500 grants
              totaling approximately $7.5 billion, spanning 2012 to 2026.
            </p>
            <p style={styles.paragraph}>
              The site has two complementary parts: this grants database of individual grants, and a
              companion org financials database showing the annual revenues and expenses of the
              organizations that receive them. The grants database is described first, followed by
              the org financials database.
            </p>
            <p style={styles.paragraph}>
              Grantmakers, grants, and grantees are included in this database on the basis that
              information about them will be useful to the EA community. Whether a grantee or
              grant is actually "EA" is a question outside the scope of this project.
            </p>
            <p style={styles.paragraph}>
              The database is updated monthly via an automated scraping pipeline. The source
              code and full methodology documentation are available on{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>GitHub</a>.
            </p>

            <h2 style={styles.sectionTitle}>Data sources with individual grants</h2>

            <h3 style={styles.subheading}>Coefficient Giving (formerly Open Philanthropy)</h3>
            <p style={styles.paragraph}>
              Approximately 3,230 grants (2012 through 2026), sourced from the official{' '}
              <a href="https://coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Coefficient Giving Grants Archive
              </a>.
              Open Philanthropy rebranded to Coefficient Giving in 2025.
            </p>

            <h3 style={styles.subheading}>GiveWell</h3>
            <p style={styles.paragraph}>
              Approximately 450 grants (2014 through 2026), exported from GiveWell's public{' '}
              <a href="https://airtable.com/appaVhon0jdLt1rVs/shrixNMUWCSC5v1lh/tblykYPizxzYj3U1L/viwJ3DyqAUsL654Rm" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Airtable database
              </a>.
              All grants are categorized as Global Health &amp; Development.
            </p>
            <p style={styles.paragraph}>
              Public grant listings can lag behind internal grantmaking and may be incomplete or
              filtered for usability. As a result, public totals and counts may differ from
              grantmaker announcements that draw on internal systems or newer approvals.
            </p>

            <h3 style={styles.subheading}>Effective Altruism Funds</h3>
            <p style={styles.paragraph}>
              Approximately 1,820 grants (2017 through 2025) from the public API at{' '}
              <a href="https://funds.effectivealtruism.org/api/grants" target="_blank" rel="noopener noreferrer" style={styles.link}>
                funds.effectivealtruism.org
              </a>.
              Covers four funds: Long-Term Future Fund, Animal Welfare Fund, Global Health and
              Development Fund, and Infrastructure Fund.
            </p>

            <h3 style={styles.subheading}>Survival and Flourishing Fund</h3>
            <p style={styles.paragraph}>
              Approximately 470 grants (2018 through 2025), parsed from the HTML table on
              the{' '}
              <a href="https://survivalandflourishing.fund/recommendations" target="_blank" rel="noopener noreferrer" style={styles.link}>
                recommendations page
              </a>.
              All grants are categorized as Long-Term &amp; Existential Risk.
            </p>

            <h3 style={styles.subheading}>Animal Charity Evaluators</h3>
            <p style={styles.paragraph}>
              Approximately 320 grants (2015 through 2026) from{' '}
              <a href="https://animalcharityevaluators.org/" target="_blank" rel="noopener noreferrer" style={styles.link}>ACE</a>'s
              Movement Grants program, scraped from its{' '}
              <a href="https://animalcharityevaluators.org/movement-grants/past-movement-grants-recipients/" target="_blank" rel="noopener noreferrer" style={styles.link}>
                past grant recipients page
              </a>. All grants are categorized as Animal Welfare. Where itemized coverage falls
              short of ACE's published annual giving, a residual entry tops up the difference.
            </p>

            <h3 style={styles.subheading}>Future of Life Institute</h3>
            <p style={styles.paragraph}>
              Grants with individually published amounts from FLI's{' '}
              <a href="https://futureoflife.org/grant-program/2024-grants/" target="_blank" rel="noopener noreferrer" style={styles.link}>
                grant program pages
              </a>, manually curated. FLI's fellowship cohorts and request-for-proposal
              programs do not publish per-grant amounts and are therefore not included,
              so FLI's totals here understate its grantmaking.
            </p>

            <h3 style={styles.subheading}>Meta Charity Funders</h3>
            <p style={styles.paragraph}>
              All grants from this funding circle's round retrospectives published on the{' '}
              <a href="https://forum.effectivealtruism.org/topics/meta-charity-funders-mcf" target="_blank" rel="noopener noreferrer" style={styles.link}>
                EA Forum
              </a>{' '}
              (approximately $3.6M across four rounds since 2023), manually curated.
              Some grantees are anonymous in the source and are listed as anonymous here.
              One grant made in pounds is converted at the round's exchange rate.
            </p>

            <h3 style={styles.subheading}>The Navigation Fund</h3>
            <p style={styles.paragraph}>
              Grants in EA-relevant program areas from the Navigation Charitable Fund's
              complete IRS Form 990 Schedule I, manually classified. Both filed years were
              reviewed (FY2023 and FY2024); the included grants are farm-animal-welfare
              support (via Food System Innovations / Humane America Animal Foundation) and a
              digital-sentience grant. Excluded from every year are large transfers to a
              donor-advised fund (Vanguard Charitable), open-science and criminal-justice
              grants, and operational/PR vendor payments. The fund publishes no grants list
              of its own and its filings carry no award dates beyond the fiscal year-end, so
              dates are approximate and coverage lags by a year.
            </p>

            <h3 style={styles.subheading}>Macroscopic Ventures</h3>
            <p style={styles.paragraph}>
              Formerly Polaris Ventures and the Center for Emerging Risk Research.
              Its{' '}
              <a href="https://macroscopic.org/grants" target="_blank" rel="noopener noreferrer" style={styles.link}>
                grants page
              </a>{' '}
              lists about a dozen grantees but discloses amounts for only two grants
              (the Cooperative AI Foundation's founding commitment and Carnegie Mellon's
              FOCAL lab); only those two are included. As a Swiss foundation it files no
              public accounts, so coverage cannot be verified against totals.
            </p>

            <h2 style={styles.sectionTitle}>Data sources with annual totals only</h2>
            <p style={styles.paragraph}>
              The following grantmaker does not publish individual grant data with dollar
              amounts. Annual totals are used to generate residual entries that represent
              each year's total disbursements as a single record.
            </p>

            <h3 style={styles.subheading}>Founders Pledge</h3>
            <p style={styles.paragraph}>
              Annual grant totals from IRS 990 filings (2016 through 2024), sourced via{' '}
              <a href="https://projects.propublica.org/nonprofits/organizations/371795297" target="_blank" rel="noopener noreferrer" style={styles.link}>
                ProPublica Nonprofit Explorer
              </a>. These figures represent grants paid, not "money
              moved" (which is a larger figure). Grants span multiple cause areas but cannot
              be broken out by category.
            </p>

            <h2 style={styles.sectionTitle}>Processing</h2>

            <h3 style={styles.subheading}>Categories</h3>
            <p style={styles.paragraph}>
              Grants are classified into seven categories based on the source organization's own
              labeling: Long-Term &amp; Existential Risk, Global Health &amp; Development,
              Animal Welfare, EA Community &amp; Infrastructure, Scientific Research,
              Policy Reform, and Other. Mapping tables translate each source's terminology
              to this taxonomy.
            </p>

            <h3 style={styles.subheading}>Deduplication</h3>
            <p style={styles.paragraph}>
              Two deduplication layers are applied. First, approximately 157 Coefficient Giving
              grants labeled as funding to GiveWell-recommended charities are excluded to
              avoid double-counting with GiveWell's own records. Second, cross-source fuzzy
              matching identifies grants to the same recipient in the same year with amounts
              within 10%, merging approximately 55 additional duplicates.
            </p>
            <p style={styles.paragraph}>
              These safeguards prioritize consistent totals over perfect attribution when the
              same grant appears in multiple sources. Some grants may therefore appear under a
              different grantmaker than the original announcement.
            </p>
            <p style={styles.paragraph}>
              A direct consequence is that <strong>Coefficient Giving's (Open Philanthropy's)
              total understates its actual grantmaking</strong>. The roughly $0.9 billion it has
              granted to GiveWell-recommended charities is attributed to GiveWell — the proximate
              grantmaker — rather than counted again under Coefficient. Per-grantmaker totals are
              therefore de-duplicated, not additive: this avoids double-counting the GiveWell
              funding channel, at the cost of making Open Philanthropy look smaller than its
              headline figures, which typically include money it moves through GiveWell.
            </p>

            <h3 style={styles.subheading}>Residual grants</h3>
            <p style={styles.paragraph}>
              For grantmakers with published annual totals, a residual grant is generated when
              the gap between the published total and the sum of scraped individual grants
              exceeds both $100,000 and 5% of the published total. This provides approximate
              dollar coverage without itemization.
            </p>

            <h3 style={styles.subheading}>Inflation adjustment</h3>
            <p style={styles.paragraph}>
              An optional toggle on the chart converts historical amounts to constant 2025
              US dollars using{' '}
              <a href="https://www.bls.gov/cpi/" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Bureau of Labor Statistics
              </a>{' '}
              CPI-U annual averages.
            </p>

            <h3 style={styles.subheading}>Non-core EA focus areas</h3>
            <p style={styles.paragraph}>
              Approximately 605 grants ($337M) in the Policy Reform category are excluded
              from the default view. These include US policy areas such as Criminal Justice
              Reform, Housing Policy Reform, Immigration Policy, Macroeconomic Stabilization
              Policy, Innovation Policy, and Abundance &amp; Growth — areas that are not
              generally considered part of the EA movement. These grants can be viewed by
              selecting them explicitly in the Fund filter or the Policy Reform category.
            </p>

            <h2 style={styles.sectionTitle}>Limitations</h2>

            <h3 style={styles.subheading}>Publication timing</h3>
            <p style={styles.paragraph}>
              Grants appear in public databases when they are published, not when they are
              committed or disbursed. This creates significant lag: Coefficient Giving may
              publish grants months after they are made, and some grants may never be
              published. As a result, recent years will systematically undercount actual
              grantmaking until databases catch up.
            </p>
            <p style={styles.paragraph}>
              Publication timing issues also affect completeness within a year. A grantmaker may
              publish a subset of approvals, revise entries later, or maintain internal records
              that are more comprehensive than public listings.
            </p>
            <p style={styles.paragraph}>
              This timing issue affects year-over-year trend analysis. A decline in grants
              for the current or prior year may reflect publication lag rather than actual
              funding changes. For reliable trend analysis, use data from years where
              publication is substantially complete (typically 2+ years prior).
            </p>
            <p style={styles.paragraph}>
              For more on this issue, see the{' '}
              <a href="https://forum.effectivealtruism.org/posts/NWHb4nsnXRxDDFGLy/historical-ea-funding-data-2025-update" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Historical EA Funding Data (2025 Update)
              </a>{' '}
              analysis on the EA Forum.
            </p>

            <h3 style={styles.subheading}>Other limitations</h3>
            <ul style={styles.list}>
              <li style={styles.listItem}>
                Coefficient Giving data is sourced from their official archive CSV, which
                is updated periodically as grants are published.
              </li>
              <li style={styles.listItem}>
                Founders Pledge entries are entirely residual — they represent annual totals,
                not individual grants.
              </li>
              <li style={styles.listItem}>
                Metadata fields such as country, topics, and description are sparse for many
                sources because the upstream data does not include them.
              </li>
              <li style={styles.listItem}>
                2025 and 2026 data is partial and reflects only grants published to date.
              </li>
              <li style={styles.listItem}>
                Both databases contain only publicly available information — publicly
                disclosed grants and public financial filings. Grants made privately or not
                disclosed, funders that publish no grants list, and organizations without
                public filings are not captured, so totals are a lower bound on actual EA
                grantmaking and organizational revenue.
              </li>
              <li style={styles.listItem}>
                The database does not include donation platforms (e.g.,{' '}
                <a href="https://www.givingwhatwecan.org/" target="_blank" rel="noopener noreferrer" style={styles.link}>Giving What We Can</a>,{' '}
                <a href="https://www.thelifeyoucansave.org/" target="_blank" rel="noopener noreferrer" style={styles.link}>The Life You Can Save</a>)
                because their totals largely overlap with the grantmakers already tracked.
              </li>
              <li style={styles.listItem}>
                Some EA-adjacent grantmakers are not yet tracked, including{' '}
                <a href="https://www.longview.org/" target="_blank" rel="noopener noreferrer" style={styles.link}>Longview Philanthropy</a>,
                which sends fund reports privately to donors and publishes no grants list.
              </li>
              <li style={styles.listItem}>
                The FTX Future Fund committed approximately $160M in grants during 2022
                before the collapse of FTX. These grants are excluded because it is unclear
                which commitments were actually disbursed and which were clawed back during
                bankruptcy proceedings. There is no authoritative source distinguishing
                paid grants from unfulfilled commitments.
              </li>
            </ul>

            <h2 style={styles.sectionTitle}>The org financials database</h2>
            <p style={styles.paragraph}>
              A companion org financials database shows the annual finances — revenue, expenses,
              assets, and liabilities — of
              about 100 EA-adjacent organizations that appear as grant recipients, drawn from their
              public regulatory filings. It is meant to show how much money these organizations
              actually take in and spend, and what share of their revenue comes from tracked EA
              grants. Each organization card links to that organization's grants in the grants
              database, and each grant links back to the recipient's financials.
            </p>

            <h3 style={styles.subheading}>US organizations (IRS Form 990)</h3>
            <p style={styles.paragraph}>
              Annual total revenue, contributions, expenses, and end-of-year assets, liabilities,
              and net assets for approximately 87 US 501(c)(3) organizations, sourced from the{' '}
              <a href="https://projects.propublica.org/nonprofits/" target="_blank" rel="noopener noreferrer" style={styles.link}>
                ProPublica Nonprofit Explorer
              </a>{' '}
              API, which republishes the IRS's structured extract of Form 990 filings.
            </p>

            <h3 style={styles.subheading}>UK organizations (Charity Commission)</h3>
            <p style={styles.paragraph}>
              Gross income and total expenditure for approximately 12 England-and-Wales registered
              charities, taken from the{' '}
              <a href="https://register-of-charities.charitycommission.gov.uk/" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Charity Commission
              </a>{' '}
              public bulk data extract (the master register and annual-return history). These
              figures are reported in pounds.
            </p>

            <h3 style={styles.subheading}>Which organizations are included</h3>
            <p style={styles.paragraph}>
              Organizations are included when they appear as recipients in the grants database and
              publish their own financials. Pure grantmakers and regranters — for example Open
              Philanthropy, GiveWell, Founders Pledge, Animal Charity Evaluators, and ClimateWorks —
              are excluded, because their reported revenue reflects pass-through donations rather
              than programmatic income and would be misleading. Organizations whose tracked EA
              grants were both under 1% of total revenue and under $1M overall are also omitted, to
              keep the focus on organizations for which EA funding is material.
            </p>
            <p style={styles.paragraph}>
              Some clearly EA-funded organizations cannot be included: those that are fiscally
              sponsored by another entity and therefore have no separate filing (their finances are
              folded into the host's return), and organizations based outside the US and UK, for
              which no comparable open financial register is currently used.
            </p>

            <h3 style={styles.subheading}>Tracked EA grants and inferred years</h3>
            <p style={styles.paragraph}>
              Within each revenue bar, a darker segment marks the portion attributable to grants
              recorded in the grants database for that organization and year. For years in which an
              organization received tracked EA grants but has no filing on record — for instance
              before its first Form 990 or after its most recent one — an inferred bar is shown
              using the known grant total as a lower bound on revenue. These are drawn with a dashed
              outline and a faded extension to signal that actual revenue was likely higher.
            </p>

            <h3 style={styles.subheading}>Grant timing and carry-forward</h3>
            <p style={styles.paragraph}>
              Grantmakers date grants when they are awarded, and often record a multi-year grant as
              a single dated entry, so the grants logged for a given year can exceed an
              organization's filed revenue for that year. Because organizations generally recognize
              that money as revenue over the following year or two, the excess is carried forward —
              added to the next one or two years up to each year's revenue — rather than shown above
              revenue or discarded; affected figures are labeled in the chart tooltips. No grant
              money is dropped. The only amounts left above revenue are those landing in an
              organization's most recent filing year, where there is not yet a later filing to
              absorb them.
            </p>

            <h3 style={styles.subheading}>Currency and inflation</h3>
            <p style={styles.paragraph}>
              Per-organization charts are shown in each organization's reporting currency. The
              aggregate chart converts everything to US dollars using annual average GBP/USD
              exchange rates. An inflation toggle expresses amounts in constant 2025 prices, using
              Bureau of Labor Statistics CPI-U for dollar figures and{' '}
              <a href="https://www.ons.gov.uk/economy/inflationandpriceindices" target="_blank" rel="noopener noreferrer" style={styles.link}>
                ONS
              </a>{' '}
              CPI for pound figures, so each currency is deflated by the appropriate index.
            </p>

            <h3 style={styles.subheading}>Limitations</h3>
            <ul style={styles.list}>
              <li style={styles.listItem}>
                Regulatory filings lag much like grant publication: the most recent one to two years
                are frequently missing or incomplete, so recent revenue is undercounted.
              </li>
              <li style={styles.listItem}>
                A filing covers the organization's fiscal year, which may not match the calendar
                year used to date grants, adding up to a year of apparent timing mismatch on top of
                the carry-forward described above.
              </li>
              <li style={styles.listItem}>
                The IRS structured extract occasionally omits a filing year, or an organization
                entirely, even when a return was filed; affected years simply do not appear.
              </li>
              <li style={styles.listItem}>
                Assets and liabilities are point-in-time, end-of-year values, whereas revenue and
                expenses are annual flows; all are shown together but should be read accordingly.
              </li>
              <li style={styles.listItem}>
                The org financials CSV export reflects the raw filed figures and is not
                inflation-adjusted.
              </li>
            </ul>

            <h2 style={styles.sectionTitle}>Source code</h2>
            <p style={styles.paragraph}>
              The full source code, scraping pipeline, and detailed methodology documentation
              are available at{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>
                github.com/Brian-Foerster/EAGrantsDatabase
              </a>.
              See{' '}
              <a href={`${REPO_URL}/blob/main/DATA_SOURCES.md`} target="_blank" rel="noopener noreferrer" style={styles.link}>
                DATA_SOURCES.md
              </a>{' '}
              for the complete data sourcing notes. Contributions via pull request are welcome.
            </p>

            <h2 style={styles.sectionTitle}>Feedback</h2>
            <p style={styles.paragraph}>
              To report errors, suggest additional data sources, or provide other feedback,
              use the{' '}
              <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>
                feedback form
              </a>{' '}
              or{' '}
              <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" style={styles.link}>
                open an issue on GitHub
              </a>.
            </p>
          </div>
        </section>

        <footer style={styles.footer}>
          <p style={styles.footerText}>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={styles.footerLink}>GitHub</a>
            {' · '}
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" style={styles.footerLink}>Feedback</a>
            {' · '}
            <a href="https://brianfoerster.com" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>brianfoerster.com</a>
          </p>
        </footer>
      </main>
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px 80px',
  },
  header: {
    textAlign: 'left',
    marginBottom: '40px',
    borderRadius: '16px',
    border: '1px solid #e5e7eb',
    background: 'radial-gradient(82% 150% at 90% 82%, #e9d5ff 0%, #f8fafc 88%)',
  },
  nav: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: '8px',
    marginBottom: '18px',
    flexWrap: 'wrap',
  },
  navLink: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#64748b',
    textDecoration: 'none',
    padding: '5px 10px',
    borderRadius: '6px',
  },
  navLinkActive: {
    color: '#0f172a',
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  title: {
    fontSize: '48px',
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#0f172a',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '18px',
    color: '#475569',
    lineHeight: '1.5',
    maxWidth: '720px',
  },
  section: {
    marginBottom: '40px',
  },
  content: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '4px',
    border: '1px solid #e5e7eb',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginTop: '36px',
    marginBottom: '12px',
    color: '#1a202c',
  },
  subheading: {
    fontSize: '18px',
    fontWeight: '600',
    marginTop: '20px',
    marginBottom: '8px',
    color: '#374151',
  },
  paragraph: {
    fontSize: '16px',
    lineHeight: '1.7',
    color: '#4b5563',
    marginBottom: '16px',
  },
  link: {
    color: '#3a6ea5',
    textDecoration: 'none',
  },
  list: {
    marginLeft: '20px',
    marginBottom: '20px',
  },
  listItem: {
    fontSize: '16px',
    lineHeight: '1.7',
    color: '#4b5563',
    marginBottom: '10px',
  },
  footer: {
    marginTop: '60px',
    paddingTop: '40px',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'center',
  },
  footerText: {
    fontSize: '14px',
    color: '#666',
  },
  footerLink: {
    color: '#3a6ea5',
    textDecoration: 'none',
  },
};
