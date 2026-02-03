# Development Guide

## Getting Started

### Local Development
```bash
npm install
npm run dev
```

The site will be available at http://localhost:3000

### Production Build
```bash
npm run build
npm start
```

## Project Structure

```
├── pages/
│   ├── index.tsx          # Main UI page with all components
│   ├── _app.tsx           # Next.js app wrapper
│   ├── _document.tsx      # Next.js document structure
│   └── api/
│       └── grants.ts      # REST API endpoint
├── lib/
│   └── aggregator.ts      # Data fetching/aggregation logic
├── types/
│   └── grants.ts          # TypeScript interfaces
└── styles/
    └── globals.css        # Global CSS
```

## Key Components

### Data Flow
1. Frontend calls `/api/grants` endpoint
2. API calls `aggregateAllGrants()` from `lib/aggregator.ts`
3. Aggregator fetches from all sources in parallel
4. Data is returned as unified `Grant[]` array
5. Frontend renders with search, filters, and charts

### Adding a New Grantmaker

To add a new grantmaker source:

1. **Create a fetch function** in `lib/aggregator.ts`:
```typescript
export async function fetchNewGrantmakerGrants(): Promise<Grant[]> {
  // Implement API call or web scraping
  // Return array of Grant objects
}
```

2. **Add to aggregator**:
```typescript
export async function aggregateAllGrants(): Promise<Grant[]> {
  const [eaFunds, giveWell, coefficient, newGrantmaker] = await Promise.all([
    fetchEAFundsGrants(),
    fetchGiveWellGrants(),
    fetchCoefficientGrants(),
    fetchNewGrantmakerGrants() // Add here
  ]);
  
  return [...eaFunds, ...giveWell, ...coefficient, ...newGrantmaker];
}
```

3. **Update sources** in `pages/api/grants.ts`:
```typescript
const sources: GrantSource[] = [
  // ... existing sources
  {
    name: 'New Grantmaker',
    url: 'https://example.com/grants'
  }
];
```

## Implementing Real Data Fetching

### Option 1: REST APIs
If the grantmaker has a public API:

```typescript
export async function fetchGrantmakerGrants(): Promise<Grant[]> {
  const response = await axios.get('https://api.example.com/grants');
  return response.data.map((item: any) => ({
    id: item.id,
    title: item.title,
    recipient: item.recipient,
    amount: item.amount,
    currency: item.currency || 'USD',
    date: item.date,
    grantmaker: 'Grantmaker Name',
    description: item.description,
    url: item.url,
    category: item.category,
    focus_area: item.focus_area
  }));
}
```

### Option 2: Web Scraping
If no API is available, use Cheerio for scraping:

```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function fetchGrantmakerGrants(): Promise<Grant[]> {
  const response = await axios.get('https://example.com/grants');
  const $ = cheerio.load(response.data);
  
  const grants: Grant[] = [];
  $('.grant-item').each((index, element) => {
    grants.push({
      id: `gm-${index}`,
      title: $(element).find('.title').text(),
      recipient: $(element).find('.recipient').text(),
      amount: parseFloat($(element).find('.amount').text().replace(/[^0-9.]/g, '')),
      currency: 'USD',
      date: $(element).find('.date').attr('datetime') || '',
      grantmaker: 'Grantmaker Name',
      // ... other fields
    });
  });
  
  return grants;
}
```

**Important**: Always respect robots.txt and implement rate limiting!

## Database Integration

For production use, consider adding a database:

1. **Choose a database**: PostgreSQL, MongoDB, or Supabase
2. **Add caching**: Store fetched data to reduce API calls
3. **Scheduled updates**: Use cron jobs or Vercel Cron to refresh data

Example with a simple JSON file cache:

```typescript
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.cwd(), 'data', 'grants-cache.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getCachedGrants(): Promise<Grant[] | null> {
  if (fs.existsSync(CACHE_FILE)) {
    const stat = fs.statSync(CACHE_FILE);
    const age = Date.now() - stat.mtime.getTime();
    
    if (age < CACHE_DURATION) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  }
  return null;
}

export async function cacheGrants(grants: Grant[]): Promise<void> {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(grants, null, 2));
}
```

## Deployment

### GitHub Pages (Recommended for Static Sites)

The application is configured to automatically deploy to GitHub Pages using GitHub Actions:

1. **Enable GitHub Pages**:
   - Go to repository Settings > Pages
   - Under "Build and deployment", select "GitHub Actions" as the source

2. **Automatic Deployment**:
   - Push changes to the `main` branch
   - GitHub Actions will automatically build and deploy the static site
   - Your site will be available at `https://[username].github.io/[repository-name]`

3. **Manual Build**:
   ```bash
   npm run build
   # The static files will be in the out/ directory
   ```

The workflow is defined in `.github/workflows/deploy.yml`.

### Vercel (Recommended)
1. Push to GitHub
2. Import to Vercel
3. Deploy automatically

### Other Platforms
- Netlify
- AWS Amplify
- Railway
- Render

## Future Enhancements

- [ ] Real-time data updates
- [ ] More advanced charts (by category, by grantmaker, etc.)
- [ ] Export to CSV/Excel
- [ ] Saved searches (requires authentication)
- [ ] Email notifications for new grants
- [ ] Compare grants side-by-side
- [ ] Grant recommendations based on interests
- [ ] Historical trend analysis
- [ ] Mobile app version
