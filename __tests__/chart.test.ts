import {
  canPie,
  chartDataFromRows,
  chartSvg,
  niceScale,
  parseNumber,
} from '../src/lib/chart';

/** a markdown pipe table → header + rows, like the renderer hands them over */
const tbl = (md: string, id = false) => {
  const rows = md
    .trim()
    .split('\n')
    .filter(l => !/^\|[-| ]+\|$/.test(l))
    .map(l =>
      l
        .split('|')
        .slice(1, -1)
        .map(c => c.trim()),
    );
  return chartDataFromRows(rows[0], rows.slice(1), id);
};

describe('parseNumber', () => {
  it('handles English, Indonesian, currency, percent, negatives, units', () => {
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('Rp1.500.000', true)).toBe(1500000);
    expect(parseNumber('$1,200')).toBe(1200);
    expect(parseNumber('12%')).toBe(12);
    expect(parseNumber('(40)')).toBe(-40);
    expect(parseNumber('−3.5')).toBe(-3.5);
    expect(parseNumber('3,2 jt', true)).toBe(3200000);
    expect(parseNumber('2.5k')).toBe(2500);
    expect(parseNumber('45 kg')).toBe(45);
  });
  it('only treats a lone 3-digit group as thousands per language', () => {
    expect(parseNumber('1.234', true)).toBe(1234);
    expect(parseNumber('1.234', false)).toBe(1.234);
    expect(parseNumber('1,234', false)).toBe(1234);
    expect(parseNumber('1,234', true)).toBe(1.234);
    expect(parseNumber('0.500', true)).toBe(0.5);
  });
  it('rejects text, versions and empty', () => {
    for (const s of [
      '',
      'abc',
      '1.2.3',
      'n/a',
      '12 apples and pears',
      '2024-01-05',
    ])
      expect(parseNumber(s)).toBeNull();
  });
});

describe('tableData', () => {
  const md =
    '| Bulan | Pendapatan | Biaya | Catatan |\n|---|---|---|---|\n| Jan | 1.200 | 800 | ok |\n| Feb | 1.500 | 900 | naik |\n| Mar | 1.100 | 950 | turun |\n| Total | 3.800 | 2.650 | - |';
  it('takes first column as labels, numeric columns as series, drops the totals row', () => {
    const d = tbl(md, true)!;
    expect(d.labels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(d.series.map(s => s.name)).toEqual(['Pendapatan', 'Biaya']);
    expect(d.series[0].values).toEqual([1200, 1500, 1100]);
  });
  it('returns null for text-only or one-row tables', () => {
    expect(tbl('| a | b |\n|---|---|\n| x | y |\n| z | w |')).toBeNull();
    expect(tbl('| a | b |\n|---|---|\n| x | 1 |')).toBeNull();
  });
  it('keeps gaps as null', () => {
    expect(
      tbl('| k | v |\n|---|---|\n| a | 1 |\n| b | - |\n| c | 3 |')!.series[0]
        .values,
    ).toEqual([1, null, 3]);
  });
});

describe('chartSvg', () => {
  const d = tbl(
    '| m | a | b |\n|---|---|---|\n| <script>x</script> | 5 | -2 |\n| y | 10 | 4 |\n| z | 0 | 1 |',
  )!;
  it('draws bar, line and pie as plain SVG with escaped labels and no scripts', () => {
    for (const t of ['bar', 'line', 'pie'] as const) {
      const s = chartSvg(d, t);
      expect(s.startsWith('<svg')).toBe(true);
      expect(s).not.toMatch(/<script|onload|javascript:/i);
    }
    expect(chartSvg(d, 'bar')).toContain('<rect');
    expect(chartSvg(d, 'bar', {titles: false})).not.toContain('<title>');
    expect(chartSvg(d, 'line')).toContain('<path');
    expect(chartSvg(d, 'pie')).toContain('<path');
  });
  it('pie only for non-negative first series, up to 12 slices', () => {
    expect(canPie(d)).toBe(true);
    expect(canPie(tbl('| m | a |\n|---|---|\n| x | -1 |\n| y | 2 |')!)).toBe(
      false,
    );
  });
  it('nice axis starts at zero and covers the data', () => {
    const s = niceScale(3, 97);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(97);
    expect(niceScale(-5, -1).max).toBe(0);
  });
});
