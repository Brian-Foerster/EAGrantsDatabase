import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const REPO_URL = 'https://github.com/Brian-Foerster/EAGrantsDatabase';
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSceNe8T97Z36LvBmepyid68MYbyairBvZucnZFlREGROSBOZA/viewform';
const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_TIME || Date.now().toString();
const CACHE_BUST_VERSION = process.env.NEXT_PUBLIC_BUILD_TIME;

export default function About() {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 800);

  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const isMobile = windowWidth < 768;

  return (
    <>
      <Head>
        <title>About - EA Grants Database</title>
        <meta name="description" content="About the EA Grants Database — data sources, methodology, and limitations" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {process.env.NODE_ENV === 'production' && CACHE_BUST_VERSION && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var v='${CACHE_BUST_VERSION}';var u=new URL(window.location.href);if(u.searchParams.get('v')!==v){u.searchParams.set('v',v);window.location.replace(u.toString());}}catch(e){}})();`,
            }}
          />
        )}
      </Head>
      <main style={{
        ...styles.main,
        padding: isMobile ? '16px 16px' : '20px 40px'
      }}>
        <header style={{
          ...styles.header,
          padding: isMobile ? '18px 16px' : '32px 36px',
          marginBottom: isMobile ? '20px' : '40px'
        }}>
          <nav style={styles.nav}>
            <Link
              href={CACHE_BUST_VERSION ? `/?v=${CACHE_BUST_VERSION}` : '/'}
              style={styles.navLink}
            >
              Home
            </Link>
            <Link
              href={CACHE_BUST_VERSION ? `/about?v=${CACHE_BUST_VERSION}` : '/about'}
              style={styles.navLink}
            >
              About
            </Link>
          </nav>
          <h1 style={{
            ...styles.title,
            fontSize: isMobile ? '32px' : '48px'
          }}>About</h1>
          <p style={{
            ...styles.subtitle,
            fontSize: isMobile ? '14px' : '18px'
          }}>
            Sources, methodology, and known limitations of the EA Grants Database.
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
              the Effective Altruism community. It currently includes approximately 5,050 grants
              totaling approximately $6.2 billion, spanning 2012 to 2026.
            </p>
            <p style={styles.paragraph}>
              The database is updated monthly via an automated scraping pipeline. The source
              code and full methodology documentation are available on{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>GitHub</a>.
            </p>

            <h2 style={styles.sectionTitle}>Data sources with individual grants</h2>

            <h3 style={styles.subheading}>Coefficient Giving (formerly Open Philanthropy)</h3>
            <p style={styles.paragraph}>
              Approximately 2,713 grants (2012 through 2025), sourced from the official{' '}
              <a href="https://coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Coefficient Giving Grants Archive
              </a>.
              Open Philanthropy rebranded to Coefficient Giving in 2025.
            </p>

            <h3 style={styles.subheading}>GiveWell</h3>
            <p style={styles.paragraph}>
              Approximately 440 grants (2014 through 2026), exported from GiveWell's public{' '}
              <a href="https://airtable.com/appaVhon0jdLt1rVs/shrixNMUWCSC5v1lh/tblykYPizxzYj3U1L/viwJ3DyqAUsL654Rm" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Airtable database
              </a>.
              All grants are categorized as Global Health &amp; Development.
            </p>

            <h3 style={styles.subheading}>Effective Altruism Funds</h3>
            <p style={styles.paragraph}>
              Approximately 1,595 grants (2017 through 2025) from the public API at{' '}
              <a href="https://funds.effectivealtruism.org/api/grants" target="_blank" rel="noopener noreferrer" style={styles.link}>
                funds.effectivealtruism.org
              </a>.
              Covers four funds: Long-Term Future Fund, Animal Welfare Fund, Global Health and
              Development Fund, and Infrastructure Fund.
            </p>

            <h3 style={styles.subheading}>Survival and Flourishing Fund</h3>
            <p style={styles.paragraph}>
              Approximately 471 grants (2019 through 2025), parsed from the HTML table on
              the{' '}
              <a href="https://survivalandflourishing.fund/recommendations" target="_blank" rel="noopener noreferrer" style={styles.link}>
                recommendations page
              </a>.
              All grants are categorized as Long-Term &amp; Existential Risk.
            </p>

            <h2 style={styles.sectionTitle}>Data sources with annual totals only</h2>
            <p style={styles.paragraph}>
              The following grantmakers do not publish individual grant data with dollar
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

            <h3 style={styles.subheading}>Animal Charity Evaluators</h3>
            <p style={styles.paragraph}>
              Annual totals (2014 through 2024) from the EA historical grantmaking spreadsheet.{' '}
              <a href="https://animalcharityevaluators.org/" target="_blank" rel="noopener noreferrer" style={styles.link}>
                ACE
              </a>{' '}
              publishes giving metrics but no machine-readable grant database.
              All entries are categorized as Animal Welfare.
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
              Two deduplication layers are applied. First, approximately 147 Coefficient Giving
              grants labeled as funding to GiveWell-recommended charities are excluded to
              avoid double-counting with GiveWell's own records. Second, cross-source fuzzy
              matching identifies grants to the same recipient in the same year with amounts
              within 10%, merging approximately 43 additional duplicates.
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
              An optional toggle on the chart converts historical amounts to constant 2024
              US dollars using{' '}
              <a href="https://www.bls.gov/cpi/" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Bureau of Labor Statistics
              </a>{' '}
              CPI-U annual averages.
            </p>

            <h3 style={styles.subheading}>Non-core EA focus areas</h3>
            <p style={styles.paragraph}>
              Approximately 560 grants ($313M) in the Policy Reform category are excluded
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
                Founders Pledge and Animal Charity Evaluators entries are entirely residual —
                they represent annual totals, not individual grants.
              </li>
              <li style={styles.listItem}>
                Metadata fields such as country, topics, and description are sparse for many
                sources because the upstream data does not include them.
              </li>
              <li style={styles.listItem}>
                2025 and 2026 data is partial and reflects only grants published to date.
              </li>
              <li style={styles.listItem}>
                The database does not include donation platforms (e.g.,{' '}
                <a href="https://www.givingwhatwecan.org/" target="_blank" rel="noopener noreferrer" style={styles.link}>Giving What We Can</a>,{' '}
                <a href="https://www.thelifeyoucansave.org/" target="_blank" rel="noopener noreferrer" style={styles.link}>The Life You Can Save</a>)
                because their totals largely overlap with the grantmakers already tracked.
              </li>
              <li style={styles.listItem}>
                Some EA-adjacent grantmakers are not yet tracked, including{' '}
                <a href="https://www.longview.org/" target="_blank" rel="noopener noreferrer" style={styles.link}>Longview Philanthropy</a>{' '}
                and regranting programs within CEA and Effective Ventures.
              </li>
              <li style={styles.listItem}>
                The FTX Future Fund committed approximately $160M in grants during 2022
                before the collapse of FTX. These grants are excluded because it is unclear
                which commitments were actually disbursed and which were clawed back during
                bankruptcy proceedings. There is no authoritative source distinguishing
                paid grants from unfulfilled commitments.
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
          </p>
        </footer>
      </main>
    </>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '20px 40px',
  },
  header: {
    textAlign: 'left',
    marginBottom: '40px',
    borderRadius: '16px',
    border: '1px solid #e5e7eb',
    background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 45%, #fef3c7 100%)',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
  },
  nav: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: '18px',
    marginBottom: '18px',
  },
  navLink: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#1f2937',
    textDecoration: 'none',
    padding: '6px 10px',
    borderRadius: '999px',
    border: '1px solid #d1d5db',
    backgroundColor: 'rgba(255,255,255,0.7)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    transition: 'background-color 0.2s',
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
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
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
    color: '#3b82f6',
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
    color: '#3b82f6',
    textDecoration: 'none',
  },
};
