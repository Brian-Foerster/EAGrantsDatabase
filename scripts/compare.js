const grants = require('../lib/scraped-grants.json');
const years = ['2017','2018','2019','2020','2021','2022','2023','2024'];
const gms = ['Open Philanthropy','GiveWell','Founders Pledge','SFF','ACE','EA Funds'];
const byGmYear = {};
for (const g of grants) {
  const y = g.date.slice(0,4);
  const k = g.grantmaker + '|' + y;
  byGmYear[k] = (byGmYear[k]||0) + g.amount;
}
console.log('Grantmaker'.padEnd(20) + years.map(y => y.padStart(8)).join(''));
console.log('-'.repeat(84));
const totals = {};
years.forEach(y => totals[y] = 0);
for (const gm of gms) {
  const cells = years.map(y => {
    const v = byGmYear[gm+'|'+y] || 0;
    totals[y] += v;
    return ('$'+Math.round(v/1e6)+'M').padStart(8);
  });
  console.log(gm.padEnd(20) + cells.join(''));
}
console.log('-'.repeat(84));
console.log('OUR TOTAL'.padEnd(20) + years.map(y => ('$'+Math.round(totals[y]/1e6)+'M').padStart(8)).join(''));

// Chart values (read from image)
const chart = {
  2017: 358, 2018: 295, 2019: 474, 2020: 400,
  2021: 992, 2022: 1097, 2023: 1085, 2024: 1288,
};
console.log('CHART TOTAL'.padEnd(20) + years.map(y => ('$'+(chart[y]||0)+'M').padStart(8)).join(''));
console.log('DIFFERENCE'.padEnd(20) + years.map(y => {
  const diff = (chart[y]||0) - Math.round(totals[y]/1e6);
  return ((diff >= 0 ? '+$' : '-$') + Math.abs(diff) + 'M').padStart(8);
}).join(''));
