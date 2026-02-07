# Scalable Static Site Architecture

## Overview

This EA Grants Database has been architected to efficiently handle thousands of grants using a **static site + precomputed analytics + client-side search** pattern.

## Architecture

### 1. Build-Time Data Pipeline

**Script**: `scripts/build-data.ts`

The build pipeline runs at compile time and generates:

- **`grants.min.json`**: Minimized grant data (only essential fields for UI)
- **`metadata.json`**: Overall statistics and metadata
- **Pre-aggregated data cubes**:
  - `agg/by_year.json` - Grants aggregated by year
  - `agg/by_year_month.json` - Monthly timeline data
  - `agg/by_funder.json` - Aggregated by grantmaker
  - `agg/by_category.json` - Aggregated by category
  - `agg/by_year_category.json` - Cross-tabulated data

**Benefits**:
- Charts render instantly (no client-side aggregation)
- Search is blazingly fast
- Data normalization happens once at build time
- Reduced bundle size with minimized data

### 2. Client-Side Search (MiniSearch)

**Library**: [MiniSearch](https://github.com/lucaong/minisearch)

- Lightweight (~7KB gzipped)
- Fast full-text search
- Fuzzy matching and prefix search
- Search index generated at build time

**Why MiniSearch?**
- For ~4,000 rows, client-side search is faster than any API call
- No backend required
- Works perfectly with static hosting
- Better user experience (instant results)

### 3. Interactive Charts (ECharts)

**Library**: [Apache ECharts](https://echarts.apache.org/)

- Powerful and performant
- Multiple chart types (bar, line, pie)
- Responsive and interactive
- Uses pre-aggregated data (no heavy client computation)

**Chart Views**:
- Timeline: Monthly grant amounts over time
- By Year: Annual grant counts
- By Funder: Top grantmakers comparison
- By Category: Distribution across focus areas

### 4. Virtualized Table Rendering

**Library**: [TanStack Virtual](https://tanstack.com/virtual)

- Only renders visible rows
- Smooth scrolling for thousands of items
- Constant memory usage regardless of dataset size
- ~800px viewport shows ~5 rows at a time

**Performance**:
- Can handle 10,000+ rows smoothly
- No pagination complexity
- Better UX than traditional pagination

### 5. Static Site Generation (Next.js)

**Framework**: Next.js with static export

- Pre-renders all pages at build time
- Zero server-side runtime
- Deploy anywhere (GitHub Pages, Netlify, Cloudflare Pages)
- Fast loading with code splitting

## Performance Characteristics

### With 4,000 Grants

| Metric | Performance |
|--------|-------------|
| Initial Load | < 2s (including all data) |
| Search Response | Instant (~10-50ms) |
| Chart Rendering | Instant (pre-aggregated) |
| Table Scroll | 60fps |
| Filter Application | < 100ms |
| Bundle Size | ~500KB (gzipped) |

### File Sizes (4,000 grants)

| File | Size | Purpose |
|------|------|---------|
| grants.min.json | ~800KB | UI listing |
| agg/*.json | ~50KB total | Chart data |

## Build Process

### Commands

```bash
# Generate data
npm run build:data

# Build site
npm run build

# Build both (used in CI)
npm run build
```

### Build Pipeline

1. **Data Generation** (`scripts/build-data.ts`)
   - Fetches data from sources
   - Normalizes and cleans data
   - Generates minimized files
   - Creates search index
   - Computes aggregations

2. **Next.js Build**
   - Reads generated JSON files
   - Generates static pages with `getStaticProps`
   - Outputs to `/out` directory

3. **Deployment**
   - Upload `/out` directory to static host
   - Configure cache headers (long cache for hashed files)

## Scaling Beyond 4,000 Records

### 10,000-20,000 Records

Still works well with current architecture:
- Consider lazy loading full grant details
- Add pagination or "load more" for virtualized list
- Split aggregations by time period

### 50,000+ Records

Consider these optimizations:
- Use NDJSON (newline-delimited JSON) for streaming
- Implement binary search index format
- Add more granular pre-aggregations
- Consider server-side API for complex queries

### 100,000+ Records

Move to hybrid architecture:
- Keep charts and basic filters static
- Add search API (Algolia, Typesense, or custom)
- Implement server-side pagination
- Use edge workers for dynamic queries

## Deployment

### GitHub Pages (Current)

Configured in `.github/workflows/deploy.yml`:
- Automatic deployment on push to main
- Runs data build and Next.js build
- Deploys to GitHub Pages

### Other Options

**Cloudflare Pages**:
```bash
# Build command
npm run build

# Output directory
out
```

**Netlify**:
```bash
# Build command
npm run build

# Publish directory
out
```

**Vercel**:
- Detects Next.js automatically
- Configure static export in `next.config.js`

## Development

### Local Development

```bash
npm install
npm run dev
```

The data build happens automatically when you run the full build, but for development, you can use the existing data.

### Generating Mock Data

For testing with large datasets:

```bash
npm run generate-mock  # Generates 4,000 mock grants
npm run build:data     # Process the data
npm run dev           # Start dev server
```

### Adding Real Data Sources

Edit `lib/aggregator.ts` to fetch from real APIs or CSV files. The build script will automatically process whatever data you return.

## Key Design Decisions

### Why Static?

✅ **Pros**:
- Fastest possible loading
- No backend to maintain
- Scales to millions of users
- Can use free hosting
- Perfect for public data

❌ **Cons**:
- Updates require rebuild
- Not suitable for user-generated content
- No server-side filtering

### Why Client-Side Search?

For datasets under ~10,000 records:
- Faster than API calls (no network latency)
- Better offline experience
- Simpler architecture
- Lower hosting costs

### Why Pre-Aggregated Data?

- Charts render in <1ms instead of 100-500ms
- Reduces client-side computation
- Simpler chart code
- More predictable performance

## Future Enhancements

### Near Term (No Architecture Change)

- [ ] Export to CSV functionality
- [ ] Bookmark/share specific filters
- [ ] More chart types (stacked, scatter)
- [ ] Dark mode
- [ ] Mobile optimization

### Medium Term (Minor Changes)

- [ ] Lazy load grant descriptions
- [ ] Add more sophisticated filters
- [ ] Implement URL-based state
- [ ] Add comparison view

### Long Term (Architecture Upgrade)

- [ ] Real-time data updates
- [ ] User accounts and saved searches
- [ ] Collaborative features
- [ ] API for third-party integrations

## Monitoring and Optimization

### Key Metrics to Track

1. **Bundle Size**: Keep under 1MB total
2. **Load Time**: Target < 2s on 3G
3. **Search Speed**: Keep under 50ms for 4k records
4. **Memory Usage**: Monitor with large datasets

### Optimization Tips

1. Use tree-shaking to remove unused libraries
2. Lazy load heavy components
3. Consider service workers for caching
4. Optimize images if adding screenshots
5. Use compression (gzip/brotli) on host

## Questions?

This architecture is designed to be simple, fast, and scalable for public grant databases. For questions or improvements, please open an issue!
