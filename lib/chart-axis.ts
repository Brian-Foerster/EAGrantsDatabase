// About four gridlines at a round spacing. If the next line above the tallest bar is close,
// the axis ends on it; otherwise the axis stops a little above the bar, with no line or label
// at that unround top, instead of jumping to a much higher round number.
export function yAxisScale(dataMax: number) {
  if (dataMax <= 0) return { max: 1, interval: 0.25, openTop: false };
  const magnitude = Math.pow(10, Math.floor(Math.log10(dataMax / 4)));
  const interval = [1, 2, 2.5, 5, 10]
    .map(m => m * magnitude)
    .reduce((best, step) => (Math.abs(dataMax / step - 4) < Math.abs(dataMax / best - 4) ? step : best));
  const nextLine = Math.ceil(dataMax / interval) * interval;
  return nextLine >= dataMax * 1.03 && nextLine <= dataMax * 1.12
    ? { max: nextLine, interval, openTop: false }
    : { max: dataMax * 1.06, interval, openTop: true };
}

// ECharts y-axis settings for a value in $M: the scale above, with the unround top hidden.
export function yAxisRange(dataMax: number) {
  const { max, interval, openTop } = yAxisScale(dataMax);
  return { max, interval, splitLine: { showMaxLine: !openTop }, showMaxLabel: !openTop };
}

// $M axis label: 1.5B, 1.25B, 500M, 2.5M.
export function formatMillions(val: number): string {
  if (val >= 1000) {
    const b = val / 1000;
    return (b % 1 === 0 ? b.toFixed(1) : String(+b.toFixed(2))) + 'B';
  }
  if (val >= 10) return Math.round(val) + 'M';
  const rounded = Math.round(val * 10) / 10;
  return (rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)) + 'M';
}
