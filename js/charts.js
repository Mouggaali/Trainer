// Tiny dependency-free SVG charts, pixel style (square bars, chunky lines, square dots).
// All colours come from CSS classes (.ch-*) in css/styles.css.
const W = 340;
const px = (v) => Math.round(v);

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

const shortDate = (ts) => {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

export function barChart({ labels, values, goal = 0, height = 180, highlight = -1 }) {
  const padL = 6, padR = 28, padT = 16, padB = 24;
  const iw = W - padL - padR, ih = height - padT - padB;
  const max = Math.max(goal, ...values, 1);
  const y = (v) => padT + ih - (v / max) * ih;
  const slot = iw / values.length;
  const bw = px(Math.min(24, slot * 0.55));
  const stepTick = max <= 6 ? 1 : Math.ceil(max / 4);
  let grid = '';
  for (let v = 0; v <= max; v += stepTick) {
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${px(y(v))}" y2="${px(y(v))}" class="${v ? 'ch-grid' : 'ch-axis'}"/>`;
  }
  const bars = values.map((v, i) => {
    const x = px(padL + i * slot + (slot - bw) / 2);
    const h = px(Math.max(v ? 4 : 0, ih - (y(v) - padT)));
    const cls = i === highlight ? 'ch-bar ch-bar-hi' : 'ch-bar';
    const top = h > 6 ? `<rect x="${x + 2}" y="${padT + ih - h + 2}" width="${bw - 4}" height="3" class="ch-bar-top"/>` : '';
    return `${h ? `<rect x="${x}" y="${padT + ih - h}" width="${bw}" height="${h}" class="${cls}"/>${top}` : ''}
      <text x="${x + bw / 2}" y="${height - 6}" class="ch-label" text-anchor="middle">${labels[i]}</text>`;
  }).join('');
  const goalLine = goal
    ? `<line x1="${padL}" x2="${W - padR}" y1="${px(y(goal))}" y2="${px(y(goal))}" class="ch-goal"/>
       <text x="${W - padR + 6}" y="${px(y(goal)) + 5}" class="ch-goal-label">${goal}</text>`
    : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img">${grid}${bars}${goalLine}
    <text x="${W - padR + 6}" y="${padT + ih + 4}" class="ch-label">0</text></svg>`;
}

/** series: [{ name, cls, points: [{ x: ts, y }] }] */
export function lineChart({ series, height = 190, unit = '' }) {
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return `<div class="chart-empty">Nog geen data</div>`;
  const padL = 40, padR = 12, padT = 14, padB = 24;
  const iw = W - padL - padR, ih = height - padT - padB;
  let xmin = Math.min(...pts.map((p) => p.x)), xmax = Math.max(...pts.map((p) => p.x));
  if (xmin === xmax) { xmin -= 86400000; xmax += 86400000; }
  let ymin = Math.min(...pts.map((p) => p.y)), ymax = Math.max(...pts.map((p) => p.y));
  const pad = (ymax - ymin) * 0.15 || Math.max(1, ymax * 0.05);
  const { lo, hi, ticks } = niceTicks(ymin - pad, ymax + pad);
  const x = (v) => padL + ((v - xmin) / (xmax - xmin)) * iw;
  const y = (v) => padT + ih - ((v - lo) / (hi - lo || 1)) * ih;

  const grid = ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${px(y(t))}" y2="${px(y(t))}" class="ch-grid"/>
    <text x="${padL - 6}" y="${px(y(t)) + 5}" class="ch-label" text-anchor="end">${t}</text>`).join('')
    + `<line x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}" class="ch-axis"/>`;

  const lines = series.map((s, si) => {
    const sorted = [...s.points].sort((a, b) => a.x - b.x);
    if (!sorted.length) return '';
    const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${px(x(p.x))},${px(y(p.y))}`).join('');
    const area = si === 0 && sorted.length > 1
      ? `<path d="${d}L${px(x(sorted.at(-1).x))},${padT + ih}L${px(x(sorted[0].x))},${padT + ih}Z" class="ch-area"/>`
      : '';
    const dots = sorted.map((p, i) => {
      const last = i === sorted.length - 1;
      const r = last ? 5 : 4;
      return `<rect x="${px(x(p.x)) - r}" y="${px(y(p.y)) - r}" width="${r * 2}" height="${r * 2}" class="ch-dot ${last ? 'last ' : ''}${s.cls || ''}"/>`;
    }).join('');
    return `${area}<path d="${d}" class="ch-line ${s.cls || ''}"/>${dots}`;
  }).join('');

  const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
  const xl = [xs[0], xs.length > 2 ? xs[Math.floor(xs.length / 2)] : null, xs.length > 1 ? xs.at(-1) : null]
    .filter((v) => v != null)
    .map((v, i, arr) => `<text x="${px(x(v))}" y="${height - 6}" class="ch-label" text-anchor="${i === 0 && arr.length > 1 ? 'start' : i === arr.length - 1 && arr.length > 1 ? 'end' : 'middle'}">${shortDate(v)}</text>`)
    .join('');

  const legend = series.length > 1
    ? `<div class="chart-legend">${series.map((s) => `<span><i class="lg ${s.cls || ''}"></i>${s.name}</span>`).join('')}</div>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${unit}">
    ${grid}${lines}${xl}</svg>${legend}`;
}
