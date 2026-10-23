import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const block = (selector: string) => {
  const i = tokens.indexOf(selector);
  return tokens.slice(i, tokens.indexOf('}', i));
};
const read = (css: string, name: string) => new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)?.[1];

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('design tokens', () => {
  it('keeps raw hex colours out of every stylesheet except tokens.css', () => {
    const offenders = walk('src').filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'))
      .filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  const light = block(':root {');
  const dark = block(':root[data-theme="dark"]');
  const v = (css: string, n: string) => read(css, n) ?? read(light, n)!;

  it.each([
    ['light', light], ['dark', dark]
  ])('meets WCAG AA for text in %s theme', (_n, css) => {
    const bg = v(css, '--color-bg'), panel = v(css, '--color-panel'), fg = v(css, '--color-fg'), muted = v(css, '--color-fg-muted');
    for (const surface of [bg, panel]) {
      expect(contrast(fg, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v(css, '--ra-accent-text'), surface)).toBeGreaterThanOrEqual(4.5);
      for (const s of ['--color-ok', '--color-bad', '--color-warn']) expect(contrast(v(css, s), surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps button and sidebar text readable', () => {
    expect(contrast(read(light, '--ra-on-primary')!, read(light, '--ra-primary')!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(read(light, '--ra-on-ink-muted')!, read(light, '--ra-ink')!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(read(light, '--ra-on-ink-muted')!, read(dark, '--ra-side-bg')!)).toBeGreaterThanOrEqual(4.5);
  });
});
