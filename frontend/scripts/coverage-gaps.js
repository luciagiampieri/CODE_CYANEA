const summary = require('../coverage/coverage-summary.json');

const filas = Object.entries(summary)
  .filter(([archivo]) => archivo !== 'total')
  .map(([archivo, d]) => ({
    archivo: archivo.replace(/.*[\\/]src[\\/]/, 'src/'),
    lineas: d.lines.pct + '%',
    branches: d.branches.pct + '%',
    sinCubrir: d.lines.total - d.lines.covered,
  }))
  .filter((f) => f.sinCubrir > 0)
  .sort((a, b) => b.sinCubrir - a.sinCubrir)
  .slice(0, 40);

console.table(filas);