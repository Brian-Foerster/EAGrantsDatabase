import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const REPO_URL = 'https://github.com/Brian-Foerster/EAGrantsDatabase';
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSceNe8T97Z36LvBmepyid68MYbyairBvZucnZFlREGROSBOZA/viewform';

export default function About() {
  return (
    <>
      <Head>
        <title>About - EA Grants Database</title>
        <meta name="description" content="About the EA Grants Database — data sources, methodology, and limitations" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={styles.main}>
        <header style={styles.header}>
          <nav style={styles.nav}>
            <Link href="/" style={styles.navLink}>Home</Link>
            <Link href="/about" style={styles.navLink}>About</Link>
          </nav>
          <h1 style={styles.title}>About</h1>
        </header>

        <section style={styles.section}>
          <div style={styles.content}>
            <h2 style={styles.sectionTitle}>What this is</h2>
            <p style={styles.paragraph}>
              This site aggregates publicly available grant data from grantmakers associated with
              the Effective Altruism community. It currently includes approximately 4,700 grants
              totaling approximately $5.7 billion, spanning 2012 to 2025.
            </p>
            <p style={styles.paragraph}>
              The database is updated monthly via an automated scraping pipeline. The source
              code and full methodology documentation are available on{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>GitHub</a>.
            </p>

            <h2 style={styles.sectionTitle}>Data sources with individual grants</h2>

            <h3 style={styles.subheading}>Open Philanthropy</h3>
            <p style={styles.paragraph}>
              Approximately 2,361 grants (2012 through October 2024), sourced from a{' '}
              <a href="https://github.com/rufuspollock/open-philanthropy-grants" target="_blank" rel="noopener noreferrer" style={styles.link}>
                GitHub archive
              </a>{' '}
              of the Open Philanthropy grants database. Open Philanthropy rebranded to
              Coefficient Giving in 2025; this archive predates the transition. The original
              grants page now redirects and no longer hosts a public database.
            </p>

            <h3 style={styles.subheading}>GiveWell</h3>
            <p style={styles.paragraph}>
              Approximately 439 grants (2014 through 2025), exported from GiveWell's public{' '}
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
              Annual grant totals from IRS 990 filings (2016 through 2024), sourced via
              ProPublica Nonprofit Explorer. These figures represent grants paid, not "money
              moved" (which is a larger figure). Grants span multiple cause areas but cannot
              be broken out by category.
            </p>

            <h3 style={styles.subheading}>Animal Charity Evaluators</h3>
            <p style={styles.paragraph}>
              Annual totals from EA community grantmaking estimates (2014 through 2024).
              All entries are categorized as Animal Welfare.
            </p>

            <h2 style={styles.sectionTitle}>Processing</h2>

            <h3 style={styles.subheading}>Categories</h3>
            <p style={styles.paragraph}>
              Grants are classified into five categories based on the source organization's own
              labeling: Long-Term &amp; Existential Risk, Global Health &amp; Development,
              Animal Welfare, Community &amp; Infrastructure, and Other. Mapping tables
              translate each source's terminology to this taxonomy.
            </p>

            <h3 style={styles.subheading}>Deduplication</h3>
            <p style={styles.paragraph}>
              Two deduplication layers are applied. First, approximately 147 Open Philanthropy
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
              US dollars using the Bureau of Labor Statistics CPI-U annual averages.
            </p>

            <h2 style={styles.sectionTitle}>Limitations</h2>
            <ul style={styles.list}>
              <li style={styles.listItem}>
                Open Philanthropy data ends October 2024. No new data source has been
                identified for Coefficient Giving grants after that date.
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
                2025 data is partial and reflects only grants published to date.
              </li>
              <li style={styles.listItem}>
                The database does not include donation platforms (e.g., Giving What We Can,
                The Life You Can Save) because their totals largely overlap with the endpoint
                grantmakers already tracked.
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
    textAlign: 'center',
    marginBottom: '40px',
    paddingTop: '40px',
  },
  nav: {
    display: 'flex',
    justifyContent: 'center',
    gap: '30px',
    marginBottom: '30px',
  },
  navLink: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#3b82f6',
    textDecoration: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  title: {
    fontSize: '48px',
    fontWeight: 'bold',
    marginBottom: '10px',
    color: '#1a202c',
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
