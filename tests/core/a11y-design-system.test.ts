import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Design System A11y & High-Contrast Contracts', () => {
  const scssPath = path.resolve(__dirname, '../../src/styles/design-system.scss');
  const scssContent = fs.readFileSync(scssPath, 'utf8');

  it('declares forced-colors: active block with system color mappings', () => {
    expect(scssContent).toContain('@media (forced-colors: active)');
    expect(scssContent).toMatch(/Highlight/);
    expect(scssContent).toMatch(/CanvasText/);
    expect(scssContent).toMatch(/Canvas/);
  });

  it('declares prefers-contrast: more block with enhanced borders and focus outlines', () => {
    expect(scssContent).toContain('@media (prefers-contrast: more)');
    expect(scssContent).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px/);
  });

  it('declares prefers-reduced-motion: reduce block for motion sensitivity', () => {
    expect(scssContent).toContain('@media (prefers-reduced-motion: reduce)');
    expect(scssContent).toMatch(/animation:\s*none\s*!important/);
  });

  it('preserves essential container query breakpoints for mobile & split panes', () => {
    expect(scssContent).toContain('@container lv-home (max-width: 760px)');
    expect(scssContent).toContain('@container lv-home (max-width: 640px)');
    expect(scssContent).toContain('@container lv-home (max-width: 400px)');
  });
});
