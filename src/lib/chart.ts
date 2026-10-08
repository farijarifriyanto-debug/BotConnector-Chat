// Table → chart. Pure functions (unit-tested): read numbers from a table, build an SVG string. No library, no script in the SVG.
// Mirror of the web Chat's lib/chart.ts (DOM-free); render the string with react-native-svg's SvgXml.
export type ChartType = 'bar' | 'line' | 'pie';
export interface ChartData {
  labelHead: string;
  labels: string[];
  series: {name: string; values: (number | null)[]; color?: string}[];
}

export const ROWS_MAX = 40,
  PIE_MAX = 12;
const UNITS: Record<string, number> = {
  k: 1e3,
  rb: 1e3,
  ribu: 1e3,
  m: 1e6,
  mn: 1e6,
  jt: 1e6,
  juta: 1e6,
  b: 1e9,
  bn: 1e9,
  miliar: 1e9,
  tn: 1e12,
  triliun: 1e12,
};
const NUM =
  /^([+-])?\s*(?:rp\.?|idr|usd|eur|[$€£¥])?\s*([+-])?(\d[\d.,]*)\s*(%|[a-zA-Z]{1,8})?\s*$/i;

/** "1,234.5", "1.234,5", "Rp1.500.000", "12%", "(40)", "3,2 jt", "45 kg". `idStyle`: "." groups thousands and "," is the decimal mark (else the reverse), only decided when "1.234" is ambiguous. */
export function parseNumber(raw: string, idStyle = false): number | null {
  let s = raw.replace(/[  ]/g, ' ').replace(/[−–]/g, '-').trim();
  if (!s || s.length > 32) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  const m = NUM.exec(s);
  if (!m) return null;
  if (m[1] === '-' || m[2] === '-') neg = !neg;
  const body = m[3],
    dots = (body.match(/\./g) ?? []).length,
    commas = (body.match(/,/g) ?? []).length;
  const grouped = (sep: string) => {
    const g = body.split(sep);
    return (
      g[0].length >= 1 &&
      g[0].length <= 3 &&
      !/^0\d/.test(g[0]) &&
      g.slice(1).every(x => x.length === 3)
    );
  };
  let t: string;
  if (dots && commas) {
    // the later mark is the decimal one
    const dec = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',',
      thou = dec === '.' ? ',' : '.';
    const [ip, fp, ...rest] = body.split(dec);
    if (
      rest.length ||
      !ip
        .split(thou)
        .every((g, i) =>
          i === 0 ? g.length >= 1 && g.length <= 3 : g.length === 3,
        )
    )
      return null;
    t = ip.split(thou).join('') + '.' + fp;
  } else if (dots > 1 || commas > 1) {
    const sep = dots > 1 ? '.' : ',';
    if (!grouped(sep)) return null;
    t = body.split(sep).join('');
  } else if (dots || commas) {
    const sep = dots ? '.' : ',',
      [a, b] = body.split(sep);
    const thousands =
      b.length === 3 &&
      a.length >= 1 &&
      a.length <= 3 &&
      !/^0/.test(a) &&
      (sep === '.') === idStyle;
    t = thousands ? a + b : a + '.' + b;
  } else t = body;
  let v = Number(t);
  if (!Number.isFinite(v)) return null;
  const u = (m[4] ?? '').toLowerCase();
  if (u && u !== '%' && UNITS[u]) v *= UNITS[u];
  return neg ? -v : v;
}

const EMPTY = /^(|-|—|–|n\/a|na|null|none|tbd)$/i;
const TOTAL =
  /^(total|jumlah|sum|grand total|subtotal|rata-?rata|average|avg|mean)\b/i;

/** Reads a table given as text (header cells + body rows): first column = labels, every other column that is mostly numbers = a series. null when it is not chartable. */
export function chartDataFromRows(
  names: string[],
  bodyRows: string[][],
  idStyle = false,
): ChartData | null {
  let rows = bodyRows.map(r => r.map(c => c.replace(/\s+/g, ' ').trim()));
  if (rows.length > 2 && TOTAL.test(rows[rows.length - 1][0] ?? ''))
    rows = rows.slice(0, -1);
  if (rows.length < 2 || rows.length > ROWS_MAX || names.length < 2)
    return null;
  const series: ChartData['series'] = [];
  for (let c = 1; c < names.length; c++) {
    const cells = rows.map(r => r[c] ?? ''),
      filled = cells.filter(x => !EMPTY.test(x));
    const nums = cells.map(x =>
      EMPTY.test(x) ? null : parseNumber(x, idStyle),
    );
    if (
      filled.length >= 2 &&
      nums.filter(n => n !== null).length / filled.length >= 0.75
    )
      series.push({name: names[c] || String(c), values: nums});
  }
  if (!series.length) return null;
  return {
    labelHead: names[0],
    labels: rows.map((r, i) => r[0] || String(i + 1)),
    series,
  };
}

export function niceScale(
  lo: number,
  hi: number,
  ticks = 5,
): {min: number; max: number; step: number} {
  if (lo > 0) lo = 0;
  if (hi < 0) hi = 0;
  if (hi === lo) hi = lo + 1;
  const nice = (r: number, round: boolean) => {
    const e = Math.floor(Math.log10(r)),
      f = r / 10 ** e;
    const n = round
      ? f < 1.5
        ? 1
        : f < 3
          ? 2
          : f < 7
            ? 5
            : 10
      : f <= 1
        ? 1
        : f <= 2
          ? 2
          : f <= 5
            ? 5
            : 10;
    return n * 10 ** e;
  };
  const step = nice(nice(hi - lo, false) / (ticks - 1), true);
  return {
    min: Number((Math.floor(lo / step) * step).toPrecision(12)),
    max: Number((Math.ceil(hi / step) * step).toPrecision(12)),
    step,
  };
}

export const PALETTE = [
  '#0d7f55',
  '#3b82f6',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#ef4444',
  '#84cc16',
];
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const trunc = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + '…' : s;
const r1 = (n: number) => Math.round(n * 10) / 10;
const W = 640,
  H = 360;

export function canPie(d: ChartData): boolean {
  const v = d.series[0].values.map(x => x ?? 0);
  return (
    v.every(x => x >= 0) &&
    v.some(x => x > 0) &&
    v.filter(x => x > 0).length <= PIE_MAX
  );
}

export interface SvgOpts {
  compact?: (n: number) => string;
  full?: (n: number) => string;
  title?: string;
  /** hover tooltips as <title>; off for react-native-svg */ titles?: boolean;
}

export function chartSvg(
  d: ChartData,
  type: ChartType,
  o: SvgOpts = {},
): string {
  const svg = chartSvgRaw(d, type, o);
  return o.titles === false
    ? svg.replace(/<title>[\s\S]*?<\/title>/g, '')
    : svg;
}

function chartSvgRaw(d: ChartData, type: ChartType, o: SvgOpts): string {
  const compact = o.compact ?? ((n: number) => String(n)),
    full = o.full ?? compact;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(o.title || 'Chart')}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="11">`;
  const legend = (
    items: {name: string; color: string}[],
    x: number,
    y: number,
  ) =>
    items
      .map(
        (it, i) =>
          `<g transform="translate(${x + 0},${y + i * 18})"><rect width="10" height="10" rx="2" fill="${it.color}"/><text x="15" y="9" fill="currentColor">${esc(trunc(it.name, 26))}<title>${esc(it.name)}</title></text></g>`,
      )
      .join('');
  if (type === 'pie') {
    const vals = d.series[0].values.map(x => Math.max(0, x ?? 0)),
      sum = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = 190,
      cy = H / 2,
      r = 135;
    let a0 = -Math.PI / 2,
      out = '';
    const items: {name: string; color: string}[] = [];
    vals.forEach((v, i) => {
      if (v <= 0) return;
      const color = PALETTE[items.length % PALETTE.length],
        frac = v / sum,
        a1 = a0 + frac * Math.PI * 2;
      const tip = `<title>${esc(d.labels[i])}: ${esc(full(v))} (${r1(frac * 100)}%)</title>`;
      out +=
        frac > 0.9999
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}">${tip}</circle>`
          : `<path d="M${cx},${cy} L${r1(cx + r * Math.cos(a0))},${r1(cy + r * Math.sin(a0))} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${r1(cx + r * Math.cos(a1))},${r1(cy + r * Math.sin(a1))} Z" fill="${color}" stroke="#fff" stroke-opacity=".6" stroke-width="1">${tip}</path>`;
      items.push({name: `${d.labels[i]} · ${r1(frac * 100)}%`, color});
      a0 = a1;
    });
    return (
      open +
      out +
      legend(items, 350, Math.max(14, cy - items.length * 9)) +
      `<text x="${cx}" y="${H - 6}" text-anchor="middle" fill="currentColor" fill-opacity=".7">${esc(trunc(d.series[0].name, 40))}</text></svg>`
    );
  }
  // bar / line share the axes
  const all = d.series
    .flatMap(s => s.values)
    .filter((x): x is number => x !== null);
  const sc = niceScale(Math.min(...all), Math.max(...all));
  const n = d.labels.length,
    S = d.series.length;
  const ml = 56,
    mr = 14,
    mt = S > 1 ? 34 : 14;
  const slot = (W - ml - mr) / n;
  const maxLabel = Math.max(...d.labels.map(l => l.length));
  const rot = slot < maxLabel * 6.4 && n > 2;
  const mb = rot ? 72 : 30;
  const ph = H - mt - mb;
  const y = (v: number) => mt + ph - ((v - sc.min) / (sc.max - sc.min)) * ph;
  let out = '';
  for (
    let v = sc.min;
    v <= sc.max + sc.step / 2;
    v = Number((v + sc.step).toPrecision(12))
  ) {
    out += `<line x1="${ml}" x2="${W - mr}" y1="${r1(y(v))}" y2="${r1(y(v))}" stroke="currentColor" stroke-opacity="${v === 0 ? '.45' : '.12'}"/><text x="${ml - 6}" y="${r1(y(v)) + 3.5}" text-anchor="end" fill="currentColor" fill-opacity=".75">${esc(compact(v))}</text>`;
  }
  const every = Math.max(1, Math.ceil((rot ? 13 : maxLabel * 6.4 + 6) / slot));
  d.labels.forEach((l, i) => {
    if (i % every) return;
    const x = ml + slot * (i + 0.5);
    out += rot
      ? `<text transform="translate(${r1(x + 3)},${H - mb + 12}) rotate(-38)" text-anchor="end" fill="currentColor" fill-opacity=".8">${esc(trunc(l, 18))}<title>${esc(l)}</title></text>`
      : `<text x="${r1(x)}" y="${H - mb + 16}" text-anchor="middle" fill="currentColor" fill-opacity=".8">${esc(trunc(l, Math.max(4, Math.floor(slot / 6.2))))}<title>${esc(l)}</title></text>`;
  });
  if (type === 'bar') {
    const bw = Math.min(46, (slot * 0.78) / S),
      gw = bw * S,
      showVal = n * S <= 14;
    d.series.forEach((s, si) =>
      s.values.forEach((v, i) => {
        if (v === null) return;
        const x = ml + slot * (i + 0.5) - gw / 2 + si * bw,
          y0 = y(0),
          y1 = y(v);
        out += `<rect x="${r1(x)}" y="${r1(Math.min(y0, y1))}" width="${r1(Math.max(1, bw - 1.5))}" height="${r1(Math.max(1, Math.abs(y1 - y0)))}" rx="2" fill="${s.color ?? PALETTE[si % PALETTE.length]}"><title>${esc(d.labels[i])} · ${esc(s.name)}: ${esc(full(v))}</title></rect>`;
        if (showVal)
          out += `<text x="${r1(x + bw / 2)}" y="${r1(v >= 0 ? y1 - 4 : y1 + 12)}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity=".8">${esc(compact(v))}</text>`;
      }),
    );
  } else {
    d.series.forEach((s, si) => {
      const color = s.color ?? PALETTE[si % PALETTE.length];
      const pts = s.values.map((v, i) =>
        v === null ? null : ([ml + slot * (i + 0.5), y(v), v, i] as const),
      );
      let path = '',
        pen = false;
      for (const p of pts) {
        if (!p) {
          pen = false;
          continue;
        }
        path += `${pen ? 'L' : 'M'}${r1(p[0])},${r1(p[1])} `;
        pen = true;
      }
      out += `<path d="${path.trim()}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      for (const p of pts)
        if (p)
          out += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${n > 24 ? 2 : 3.2}" fill="${color}"><title>${esc(d.labels[p[3]])} · ${esc(s.name)}: ${esc(full(p[2]))}</title></circle>`;
    });
  }
  if (S > 1) {
    let lx = ml;
    out += d.series
      .map((s, si) => {
        const g = `<g transform="translate(${lx},10)"><rect width="10" height="10" rx="2" fill="${s.color ?? PALETTE[si % PALETTE.length]}"/><text x="15" y="9" fill="currentColor">${esc(trunc(s.name, 18))}</text></g>`;
        lx += 15 + Math.min(18, s.name.length) * 6.4 + 14;
        return g;
      })
      .join('');
  }
  return open + out + `</svg>`;
}
