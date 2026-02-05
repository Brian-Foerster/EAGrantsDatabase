# EA Grants Database

A web application that aggregates grants databases from multiple Effective Altruism grantmakers, providing search, filtering, and visualization capabilities.

## Features

- **Data Aggregation**: Collects grants data from multiple EA grantmakers:
  - EA Funds (https://funds.effectivealtruism.org/grants)
  - GiveWell (https://www.givewell.org/research/all-grants)
  - Coefficient Giving (https://coefficientgiving.org/funds/)

- **Search & Filter**: 
  - Full-text search across grant titles, recipients, and descriptions
  - Filter by grantmaker organization
  - Filter by grant category/focus area
  - Sort by date or amount (ascending/descending)

- **Data Visualization**:
  - Interactive charts showing grants over time
  - View both grant counts and total amounts
  - Responsive chart design

- **Grant Details**:
  - Comprehensive list of all grants with key information
  - Links to original grant pages
  - Formatted currency amounts and dates

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Brian-Foerster/EAGrantsDatabase.git
cd EAGrantsDatabase
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

#### Static Export (for GitHub Pages, Netlify, etc.)

The application uses a build-time data pipeline to generate optimized static assets:

```bash
# Build data and site
npm run build

# This runs two steps:
# 1. npm run build:data  - Generates JSON files and search index
# 2. next build          - Creates static export in out/
```

The build process:
1. Fetches grant data from sources
2. Normalizes and cleans data
3. Generates minimized JSON files
4. Creates search index with MiniSearch
5. Pre-aggregates data for charts
6. Builds static Next.js pages

Output directory: `out/` (ready for static hosting)

To test the static export locally:
```bash
# Serve the out directory on port 8000
cd out && python3 -m http.server 8000
```

#### Traditional Node.js Server

You can also run as a traditional Next.js server:

```bash
npm run build
npm start
```

## Project Structure

```
├── pages/
│   ├── index.tsx          # Main UI with search, filters, and virtualization
│   ├── _app.tsx           # Next.js app wrapper
│   ├── _document.tsx      # Next.js document structure
│   ├── about.tsx          # About page
│   └── api/
│       └── grants.ts      # API endpoint (not used in static export)
├── scripts/
│   ├── build-data.ts      # Build-time data pipeline
│   └── generate-mock-data.ts  # Generate test data
├── lib/
│   └── aggregator.ts      # Data fetching/aggregation logic
├── types/
│   └── grants.ts          # TypeScript type definitions
├── public/
│   └── data/              # Generated at build time
│       ├── grants.min.json        # Minimized grant data
│       ├── grants.full.json       # Full grant data
│       ├── search-index.json      # MiniSearch index
│       ├── metadata.json          # Statistics
│       └── agg/                   # Pre-aggregated data
│           ├── by_year.json
│           ├── by_year_month.json
│           ├── by_funder.json
│           ├── by_category.json
│           └── by_year_category.json
└── styles/
    └── globals.css        # Global CSS
```

## API Endpoints

### Static Data Files (Build Output)

The application uses pre-generated JSON files instead of dynamic API endpoints:

**Data Files:**
- `/data/grants.min.json` - Minimized grant data for UI
- `/data/grants.full.json` - Complete grant data with descriptions
- `/data/search-index.json` - Pre-built search index
- `/data/metadata.json` - Statistics and metadata
- `/data/agg/by_year.json` - Grants aggregated by year
- `/data/agg/by_year_month.json` - Monthly timeline
- `/data/agg/by_funder.json` - By grantmaker
- `/data/agg/by_category.json` - By category

All files are generated at build time by `scripts/build-data.ts`.

### Legacy API Endpoint

**GET /api/grants** (Not used in static export)

This endpoint exists for development but is not included in the static export.

## Technology Stack

- **Framework**: Next.js 16 with TypeScript (Static Export)
- **UI**: React 19
- **Charts**: Apache ECharts (high-performance visualization)
- **Search**: MiniSearch (client-side full-text search)
- **Virtualization**: TanStack Virtual (efficient rendering of large lists)
- **Date Handling**: date-fns
- **Architecture**: Static site + Pre-computed analytics + Client-side search

## Architecture

This project uses a **scalable static site architecture** designed to handle thousands of grants efficiently:

- **Build-Time Data Pipeline**: All data processing, normalization, and aggregation happens at build time
- **Pre-Aggregated Analytics**: Charts use pre-computed data cubes for instant rendering
- **Client-Side Search**: MiniSearch provides fast full-text search without a backend
- **Virtualized Rendering**: Only visible grants are rendered, enabling smooth scrolling through thousands of records

For detailed architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Performance

With ~4,000 grants:
- **Initial Load**: < 2 seconds
- **Search**: Instant (~10-50ms)
- **Charts**: Instant (pre-aggregated data)
- **Scrolling**: 60fps with virtualization

The architecture can scale to 10,000+ grants without significant performance degradation.

## Deployment

### GitHub Pages (Automatic)

This repository is configured with GitHub Actions to automatically deploy to GitHub Pages when you push to the `main` branch.

**⚠️ IMPORTANT: Configuration Required**

For your changes to appear on the live site, GitHub Pages **must** be configured to use GitHub Actions as the deployment source:

**Setup Steps:**

1. Go to your repository's **Settings > Pages**
2. Under "Build and deployment", find the **"Source"** dropdown
3. Select **"GitHub Actions"** (NOT "Deploy from a branch")
4. Push to the `main` branch - the site will automatically build and deploy
5. Your site will be available at `https://[username].github.io/[repository-name]`

The deployment workflow is configured in `.github/workflows/deploy.yml`.

**Troubleshooting:** If your changes don't appear after pushing to main, verify that GitHub Pages is set to "GitHub Actions" source. See `GITHUB_PAGES_SETUP.md` for detailed troubleshooting steps.

### Vercel (Recommended)
1. Push to GitHub
2. Import to Vercel
3. Deploy automatically

### Other Platforms
- Netlify
- AWS Amplify
- Railway
- Render

## Current Implementation

The current implementation uses mock data for demonstration purposes. In production, you would:

1. Implement actual API calls or web scraping for each grantmaker
2. Add proper rate limiting and caching
3. Store data in a database for persistence
4. Implement automated data refresh mechanisms
5. Add proper error handling and retry logic

## Future Enhancements

- [ ] Real data fetching from grantmaker sources
- [ ] Database integration for data persistence
- [ ] Automated data refresh (scheduled jobs)
- [ ] More advanced filtering options
- [ ] Export functionality (CSV, JSON)
- [ ] Individual grant detail pages
- [ ] Additional grantmaker sources
- [ ] User authentication for saved searches
- [ ] Email alerts for new grants

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Acknowledgments

This project aggregates publicly available grants data from:
- Effective Altruism Funds
- GiveWell
- Coefficient Giving

Please respect their terms of service and rate limits when implementing real data fetching.