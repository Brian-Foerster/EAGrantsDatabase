// Site typeface: San Francisco on Apple devices (reachable only through the system-font
// keywords), Inter everywhere else. next/font downloads Inter at build time and serves it with
// the site (no request to Google from the browser), with a size-matched fallback to avoid
// layout shift while it loads. Inter must come before the generic system-ui, which on
// Windows would otherwise pick Segoe UI.
import { Inter } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], display: 'swap' });

// Also used where CSS can't reach: ECharts draws on a canvas, and SVG text attributes.
export const FONT_FAMILY = `-apple-system, BlinkMacSystemFont, ${inter.style.fontFamily}, system-ui, sans-serif`;
