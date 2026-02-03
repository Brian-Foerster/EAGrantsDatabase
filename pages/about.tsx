import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function About() {
  return (
    <>
      <Head>
        <title>About - EA Grants Database</title>
        <meta name="description" content="About the EA Grants Database" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={styles.main}>
        <header style={styles.header}>
          <nav style={styles.nav}>
            <Link href="/" style={styles.navLink}>Home</Link>
            <Link href="/about" style={styles.navLink}>About</Link>
          </nav>
          <h1 style={styles.title}>About EA Grants Database</h1>
        </header>

        <section style={styles.section}>
          <div style={styles.content}>
            <h2 style={styles.sectionTitle}>Overview</h2>
            <p style={styles.paragraph}>
              The EA Grants Database is a comprehensive web application that aggregates grants 
              information from multiple Effective Altruism (EA) grantmakers. Our mission is to 
              provide transparency and accessibility to the EA funding landscape, helping 
              researchers, organizations, and individuals understand where resources are being 
              allocated in the effective altruism movement.
            </p>

            <h2 style={styles.sectionTitle}>Features</h2>
            <ul style={styles.list}>
              <li style={styles.listItem}>
                <strong>Comprehensive Search:</strong> Full-text search across grant titles, 
                recipients, and descriptions to quickly find relevant information.
              </li>
              <li style={styles.listItem}>
                <strong>Advanced Filtering:</strong> Filter grants by grantmaker organization, 
                category, focus area, and more to narrow down results.
              </li>
              <li style={styles.listItem}>
                <strong>Data Visualization:</strong> Interactive charts showing grants over time, 
                helping identify trends and patterns in EA funding.
              </li>
              <li style={styles.listItem}>
                <strong>Detailed Grant Information:</strong> View comprehensive details for each 
                grant including amount, date, recipient, description, and links to original sources.
              </li>
            </ul>

            <h2 style={styles.sectionTitle}>Data Sources</h2>
            <p style={styles.paragraph}>
              We aggregate data from the following major EA grantmakers:
            </p>
            <ul style={styles.list}>
              <li style={styles.listItem}>
                <strong>EA Funds:</strong> Effective Altruism Funds provides funding across 
                multiple cause areas including global health, animal welfare, long-term future, 
                and more.
              </li>
              <li style={styles.listItem}>
                <strong>GiveWell:</strong> One of the most well-known EA organizations, focusing 
                on evidence-based global health and poverty interventions.
              </li>
              <li style={styles.listItem}>
                <strong>Coefficient Giving:</strong> Supporting high-impact causes including 
                climate change, biosecurity, and pandemic preparedness.
              </li>
            </ul>

            <h2 style={styles.sectionTitle}>Technology</h2>
            <p style={styles.paragraph}>
              This application is built with modern web technologies including:
            </p>
            <ul style={styles.list}>
              <li style={styles.listItem}><strong>Next.js 16:</strong> React framework for production</li>
              <li style={styles.listItem}><strong>TypeScript:</strong> Type-safe development</li>
              <li style={styles.listItem}><strong>Recharts:</strong> Interactive data visualization</li>
              <li style={styles.listItem}><strong>React 19:</strong> Latest UI library</li>
            </ul>

            <h2 style={styles.sectionTitle}>Contributing</h2>
            <p style={styles.paragraph}>
              This project is open source and welcomes contributions. Whether you want to add 
              new features, improve existing ones, or add support for additional grantmakers, 
              we'd love your help. Visit our GitHub repository to get started.
            </p>

            <h2 style={styles.sectionTitle}>Contact</h2>
            <p style={styles.paragraph}>
              For questions, suggestions, or feedback, please open an issue on our GitHub 
              repository. We're always looking to improve and appreciate community input.
            </p>
          </div>
        </section>

        <footer style={styles.footer}>
          <p style={styles.footerText}>
            &copy; 2024 EA Grants Database. Built for the Effective Altruism community.
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
    padding: '20px',
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
    fontSize: '28px',
    fontWeight: 'bold',
    marginTop: '30px',
    marginBottom: '15px',
    color: '#1a202c',
  },
  paragraph: {
    fontSize: '16px',
    lineHeight: '1.8',
    color: '#4b5563',
    marginBottom: '20px',
  },
  list: {
    marginLeft: '20px',
    marginBottom: '20px',
  },
  listItem: {
    fontSize: '16px',
    lineHeight: '1.8',
    color: '#4b5563',
    marginBottom: '12px',
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
};
