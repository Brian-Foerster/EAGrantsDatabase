import { useEffect, type RefObject } from 'react';
import type { ECharts } from 'echarts';

// Width kept free to the right of the plot for a vertical legend.
export const LEGEND_COLUMN_PX = 210;
// Legend names longer than this are truncated (the full name shows on hover).
export const LEGEND_TEXT_PX = 150;

let measureCtx: CanvasRenderingContext2D | null = null;

// `right` offset that starts a vertical legend just after the plot whatever its names'
// lengths, so short names leave their spare room on the far side, not between plot and legend.
export function legendRightOffset(names: string[], font: string): number {
  if (typeof document === 'undefined') return 10;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 10;
  measureCtx.font = font;
  const ctx = measureCtx;
  const text = Math.min(LEGEND_TEXT_PX, Math.max(0, ...names.map(n => ctx.measureText(n).width)));
  const gap = 12, icon = 25, iconToText = 5;
  return Math.max(10, Math.round(LEGEND_COLUMN_PX - gap - icon - iconToText - text));
}

// On phones a tap shows a column's tooltip; tapping the same column again closes it.
export function closeTooltipOnSecondTap(chart: ECharts, isMobile: () => boolean) {
  let tappedIndex: number | null = null;
  const zr = chart.getZr();
  zr.on('click', (e: { offsetX: number; offsetY: number }) => {
    if (!isMobile()) return;
    const point = [e.offsetX, e.offsetY];
    if (!chart.containPixel({ gridIndex: 0 }, point)) { tappedIndex = null; return; }
    const [index] = chart.convertFromPixel({ gridIndex: 0 }, point) as number[];
    if (index === tappedIndex) {
      chart.dispatchAction({ type: 'hideTip' });
      tappedIndex = null;
    } else {
      tappedIndex = index;
    }
  });
  zr.on('globalout', () => { tappedIndex = null; });
}

// When a row of chart controls doesn't fit on one line, put `toggle` on its own line and
// drop the divider before it, which would then separate nothing. Measured with the divider
// shown: hiding it frees a little width, which mustn't flip the result.
export function useDividerHiddenOnWrap(
  dividerRef: RefObject<HTMLElement | null>,
  toggleRef: RefObject<HTMLElement | null>,
  deps: unknown[],
) {
  useEffect(() => {
    const divider = dividerRef.current;
    const toggle = toggleRef.current;
    const before = divider?.previousElementSibling as HTMLElement | null;
    if (!divider || !toggle || !before) return;
    const update = () => {
      divider.style.display = '';
      toggle.style.flexBasis = '';
      const t = toggle.getBoundingClientRect();
      const wrapped = t.top + t.height / 2 > before.getBoundingClientRect().bottom;
      divider.style.display = wrapped ? 'none' : '';
      toggle.style.flexBasis = wrapped ? '100%' : '';
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(divider.parentElement!);
    return () => observer.disconnect();
    // The caller's deps decide when the controls may have been (re)mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
