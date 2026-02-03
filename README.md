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

The application is configured to generate a static export that can be deployed to any static hosting service:

```bash
npm run build
```

This creates a static export in the `out/` directory that can be deployed to:
- GitHub Pages (automatically via GitHub Actions)
- Netlify
- Vercel
- Any static file hosting service

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
│   ├── index.tsx          # Main page with UI components
│   ├── _app.tsx           # Next.js app wrapper
│   ├── _document.tsx      # Next.js document structure
│   └── api/
│       └── grants.ts      # API endpoint for grants data
├── lib/
│   └── aggregator.ts      # Data aggregation logic
├── types/
│   └── grants.ts          # TypeScript type definitions
├── styles/
│   └── globals.css        # Global styles
└── public/                # Static assets

```

## API Endpoints

### GET /api/grants

Returns aggregated grants data from all sources.

**Response:**
```json
{
  "grants": [
    {
      "id": "string",
      "title": "string",
      "recipient": "string",
      "amount": number,
      "currency": "string",
      "date": "ISO date string",
      "grantmaker": "string",
      "description": "string",
      "url": "string",
      "category": "string",
      "focus_area": "string"
    }
  ],
  "sources": [...],
  "totalGrants": number,
  "totalAmount": number,
  "lastUpdated": "ISO date string"
}
```

## Technology Stack

- **Framework**: Next.js 16 with TypeScript
- **UI**: React 19
- **Charts**: Recharts
- **Date Handling**: date-fns
- **HTTP Client**: Axios
- **Web Scraping**: Cheerio (for future implementation)

## Deployment

### GitHub Pages (Automatic)

This repository is configured with GitHub Actions to automatically deploy to GitHub Pages when you push to the `main` branch.

**Setup Steps:**

1. Go to your repository's Settings > Pages
2. Under "Build and deployment", select "GitHub Actions" as the source
3. Push to the `main` branch - the site will automatically build and deploy
4. Your site will be available at `https://[username].github.io/[repository-name]`

The deployment workflow is configured in `.github/workflows/deploy.yml`.

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