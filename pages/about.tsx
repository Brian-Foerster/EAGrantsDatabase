import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const REPO_URL = 'https://github.com/Brian-Foerster/EAGrantsDatabase';
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSceNe8T97Z36LvBmepyid68MYbyairBvZucnZFlREGROSBOZA/viewform';

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
      </Head>
      <main style={{
        ...styles.main,
        padding: isMobile ? '16px 16px' : '20px 40px'
      }}>
        <header style={{
          ...styles.header,
          paddingTop: isMobile ? '20px' : '40px',
          marginBottom: isMobile ? '20px' : '40px'
        }}>
          <nav style={styles.nav}>
            <Link href="/" style={styles.navLink}>Home</Link>
            <Link href="/about" style={styles.navLink}>About</Link>
          </nav>
          <h1 style={{
            ...styles.title,
            fontSize: isMobile ? '32px' : '48px'
          }}>About</h1>
        </header>

        <section style={styles.section}>
          <div style={{
            ...styles.content,
            padding: isMobile ? '20px' : '40px'
          }}>
            <h2 style={styles.sectionTitle}>What this is</h2>
            <p style={styles.paragraph}>
              A database of grants from EA-aligned grantmakers. It pulls together public data
              from several sources into one searchable interface. Currently covers about 5,050
              grants totaling $6.2 billion, from 2012 to present.
            </p>
            <p style={styles.paragraph}>
              Updated monthly. Source code is on{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>GitHub</a>.
            </p>

            <h2 style={styles.sectionTitle}>Data sources</h2>

            <h3 style={styles.subheading}>Coefficient Giving (formerly Open Philanthropy)</h3>
            <p style={styles.paragraph}>
              ~2,700 grants (2012–2025) from their{' '}
              <a href="https://coefficientgiving.org/wp-content/uploads/Coefficient-Giving-Grants-Archive.csv" target="_blank" rel="noopener noreferrer" style={styles.link}>
                official CSV archive
              </a>. Open Philanthropy rebranded to Coefficient Giving in 2025.
            </p>

            <h3 style={styles.subheading}>GiveWell</h3>
            <p style={styles.paragraph}>
              ~440 grants (2014–2026) from their public{' '}
              <a href="https://airtable.com/appaVhon0jdLt1rVs/shrixNMUWCSC5v1lh/tblykYPizxzYj3U1L/viwJ3DyqAUsL654Rm" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Airtable
              </a>. All categorized as Global Health &amp; Development.
            </p>

            <h3 style={styles.subheading}>EA Funds</h3>
            <p style={styles.paragraph}>
              ~1,600 grants (2017–2025) from their{' '}
              <a href="https://funds.effectivealtruism.org/api/grants" target="_blank" rel="noopener noreferrer" style={styles.link}>
                public API
              </a>. Includes Long-Term Future, Animal Welfare, Global Health &amp; Development, and Infrastructure funds.
            </p>

            <h3 style={styles.subheading}>Survival and Flourishing Fund</h3>
            <p style={styles.paragraph}>
              ~470 grants (2019–2025) from their{' '}
              <a href="https://survivalandflourishing.fund/recommendations" target="_blank" rel="noopener noreferrer" style={styles.link}>
                recommendations page
              </a>. All categorized as Long-Term &amp; Existential Risk.
            </p>

            <h3 style={styles.subheading}>Founders Pledge</h3>
            <p style={styles.paragraph}>
              Annual totals only (2016–2024) from IRS 990 filings via ProPublica. These are grants paid,
              not "money moved." Individual grants aren't published, so each year appears as a single entry.
            </p>

            <h3 style={styles.subheading}>Animal Charity Evaluators</h3>
            <p style={styles.paragraph}>
              Annual totals only (2014–2024). Individual grants aren't published. All categorized as Animal Welfare.
            </p>

            <h2 style={styles.sectionTitle}>How data is processed</h2>

            <h3 style={styles.subheading}>Categories</h3>
            <p style={styles.paragraph}>
              Grants are grouped into categories based on how each grantmaker labels them:
              Long-Term &amp; Existential Risk, Global Health &amp; Development, Animal Welfare,
              EA Community &amp; Infrastructure, Scientific Research, Policy Reform, and Other.
            </p>

            <h3 style={styles.subheading}>Deduplication</h3>
            <p style={styles.paragraph}>
              Some grants appear in multiple sources. Coefficient Giving grants to GiveWell-recommended
              charities (~147) are excluded to avoid double-counting. Fuzzy matching catches
              ~43 more duplicates (same recipient, same year, amounts within 10%).
            </p>

            <h3 style={styles.subheading}>Residual entries</h3>
            <p style={styles.paragraph}>
              When a grantmaker publishes annual totals but not individual grants, the difference
              between their stated total and what we have on record shows up as a "residual" entry.
            </p>

            <h3 style={styles.subheading}>Inflation adjustment</h3>
            <p style={styles.paragraph}>
              The chart has a toggle to show amounts in constant 2024 dollars (using CPI-U).
            </p>

            <h3 style={styles.subheading}>Policy grants</h3>
            <p style={styles.paragraph}>
              About 560 grants ($313M) in US policy areas (criminal justice, housing, immigration, etc.)
              are hidden by default since they're not typically considered core EA. You can view them
              by selecting Policy Reform in the filters.
            </p>

            <h2 style={styles.sectionTitle}>Limitations</h2>

            <h3 style={styles.subheading}>Publication lag</h3>
            <p style={styles.paragraph}>
              Grants show up here when grantmakers publish them, not when the money is actually sent.
              This can take months. Recent years (2024–2026) will undercount actual grantmaking until
              the data catches up. For trend analysis, use data from 2+ years ago.
            </p>
            <p style={styles.paragraph}>
              More on this:{' '}
              <a href="https://forum.effectivealtruism.org/posts/NWHb4nsnXRxDDFGLy/historical-ea-funding-data-2025-update" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Historical EA Funding Data (2025 Update)
              </a> on the EA Forum.
            </p>

            <h3 style={styles.subheading}>Other notes</h3>
            <ul style={styles.list}>
              <li style={styles.listItem}>
                Founders Pledge and ACE only have annual totals, not individual grants.
              </li>
              <li style={styles.listItem}>
                Details like country and topics are often missing because the source data doesn't include them.
              </li>
              <li style={styles.listItem}>
                2025 and 2026 data is incomplete.
              </li>
              <li style={styles.listItem}>
                Donation platforms (Giving What We Can, The Life You Can Save) aren't included since
                they overlap with grantmakers already tracked.
              </li>
              <li style={styles.listItem}>
                Some grantmakers aren't tracked yet: Longview Philanthropy, CEA regranting, Effective Ventures.
              </li>
            </ul>

            <h2 style={styles.sectionTitle}>Source code</h2>
            <p style={styles.paragraph}>
              Everything is on{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>
                GitHub
              </a>. See{' '}
              <a href={`${REPO_URL}/blob/main/DATA_SOURCES.md`} target="_blank" rel="noopener noreferrer" style={styles.link}>
                DATA_SOURCES.md
              </a>{' '}
              for details on how data is collected. Pull requests welcome.
            </p>

            <h2 style={styles.sectionTitle}>Feedback</h2>
            <p style={styles.paragraph}>
              Found an error or have a suggestion? Use the{' '}
              <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>
                feedback form
              </a>{' '}
              or{' '}
              <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer" style={styles.link}>
                open a GitHub issue
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
