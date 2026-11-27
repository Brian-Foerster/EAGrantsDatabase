import type { CSSProperties } from 'react';

/**
 * Soft colour glow behind the top of the page, in place of a boxed header. It spans the
 * full window width and fades to transparent, so it blends into the page background
 * rather than ending at an edge. Render it before <main>, which sits above it.
 *
 * rgb: the glow colour as "r, g, b"; x: horizontal centre of the glow.
 */
export function HeroGlow({ rgb, x = '85%' }: { rgb: string; x?: string }) {
  const style: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '640px',
    pointerEvents: 'none',
    zIndex: 0,
    background: `radial-gradient(ellipse 60% 85% at ${x} 0%, rgba(${rgb}, 0.95) 0%, rgba(${rgb}, 0.45) 40%, rgba(${rgb}, 0) 100%)`,
  };
  return <div aria-hidden="true" style={style} />;
}

/** Header without a box: transparent, aligned with the page content. */
export const plainHeader: CSSProperties = {
  textAlign: 'left',
  marginBottom: '40px',
};
