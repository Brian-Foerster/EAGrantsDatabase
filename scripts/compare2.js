// Chart per-grantmaker values read from the stacked bar chart
// OpenPhil (ex GW), GiveWell, Founders Pledge, Longview, SFF, ACE, EA Funds (ex GW)
const chart = {
  'Open Philanthropy': { 2017: 219, 2018: 168, 2019: 337, 2020: 226, 2021: 538, 2022: 501, 2023: 569, 2024: 669 },
  'GiveWell':          { 2017: 130, 2018: 114, 2019: 116, 2020: 152, 2021: 393, 2022: 486, 2023: 346, 2024: 364 },
  'Founders Pledge':   { 2022: 29, 2023: 86, 2024: 144 },
};

const grants = require('../lib/scraped-grants.json');
const years = ['2019','2020','2021','2022','2023','2024'];
const byGmYear = {};
for (const g of grants) {
  const y = g.date.slice(0,4);
  const k = g.grantmaker + '|' + y;
  byGmYear[k] = (byGmYear[k]||0) + g.amount;
}

console.log('\n=== Per-Grantmaker Comparison (chart vs ours) ===\n');
for (const gm of ['Open Philanthropy', 'GiveWell', 'Founders Pledge']) {
  console.log(gm + ':');
  console.log('  Year'.padEnd(10) + 'Chart'.padStart(8) + 'Ours'.padStart(8) + 'Diff'.padStart(8) + 'Ratio'.padStart(8));
  for (const y of years) {
    const cv = (chart[gm] || {})[y] || 0;
    const ov = Math.round((byGmYear[gm+'|'+y] || 0) / 1e6);
    if (cv === 0 && ov === 0) continue;
    const diff = cv - ov;
    const ratio = ov > 0 ? (cv / ov).toFixed(2) : 'n/a';
    console.log(('  '+y).padEnd(10) + ('$'+cv+'M').padStart(8) + ('$'+ov+'M').padStart(8) + ((diff>=0?'+$':'-$')+Math.abs(diff)+'M').padStart(8) + (ratio+'x').padStart(8));
  }
  console.log();
}

// Check if inflation adjustment explains it
// US CPI inflation from each year to 2025 (approximate)
const cpi = { 2017: 1.27, 2018: 1.24, 2019: 1.21, 2020: 1.20, 2021: 1.12, 2022: 1.05, 2023: 1.03, 2024: 1.00 };
console.log('=== If chart uses 2025 inflation-adjusted dollars ===\n');
console.log('Year'.padEnd(8) + 'Ours (nom)'.padStart(12) + 'Ours (adj)'.padStart(12) + 'Chart'.padStart(12) + 'Remaining gap'.padStart(14));
for (const y of years) {
  let ourTotal = 0;
  for (const gm of Object.keys(byGmYear)) {
    if (gm.endsWith('|'+y)) ourTotal += byGmYear[gm];
  }
  const nominal = Math.round(ourTotal/1e6);
  const adjusted = Math.round(ourTotal * (cpi[y]||1) / 1e6);
  const chartTotal = { 2019: 474, 2020: 400, 2021: 992, 2022: 1097, 2023: 1085, 2024: 1288 }[y] || 0;
  const gap = chartTotal - adjusted;
  console.log(y.padEnd(8) + ('$'+nominal+'M').padStart(12) + ('$'+adjusted+'M').padStart(12) + ('$'+chartTotal+'M').padStart(12) + ((gap>=0?'+$':'-$')+Math.abs(gap)+'M').padStart(14));
}
