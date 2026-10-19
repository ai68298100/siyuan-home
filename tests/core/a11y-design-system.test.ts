import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Design System A11y & High-Contrast Contracts (Epoch 5)', () => {
  const scssPath = path.resolve(__dirname, '../../src/styles/design-system.scss');
  const indexPath = path.resolve(__dirname, '../../src/index.scss');
  const scssContent = fs.readFileSync(scssPath, 'utf8');
  const indexContent = fs.readFileSync(indexPath, 'utf8');

  it('declares forced-colors: active block with system color mappings', () => {
    expect(scssContent).toContain('@media (forced-colors: active)');
    expect(scssContent).toMatch(/--lv-accent:\s*Highlight;/);
    expect(scssContent).toMatch(/--lv-accent-contrast:\s*HighlightText;/);
    expect(scssContent).toMatch(/--lv-border:\s*CanvasText;/);
    expect(scssContent).toMatch(/--lv-line:\s*CanvasText;/);
    expect(scssContent).toMatch(/--lv-surface:\s*Canvas;/);
    expect(scssContent).toMatch(/--lv-canvas:\s*Canvas;/);
    expect(scssContent).toMatch(/--lv-tx:\s*CanvasText;/);
    expect(scssContent).toMatch(/--b3-theme-primary:\s*Highlight;/);
    expect(scssContent).toMatch(/--b3-theme-on-primary:\s*HighlightText;/);
    expect(scssContent).toMatch(/--b3-theme-background:\s*Canvas;/);
    expect(scssContent).toMatch(/--b3-border-color:\s*CanvasText;/);
  });

  it('declares card and workspace panel 1px CanvasText borders under forced-colors', () => {
    expect(scssContent).toMatch(/\.lv-card,\s*\.lv-mod,\s*\.lv-chip/);
    expect(scssContent).toMatch(/\.lv-tabbar,\s*\.lv-hero/);
    expect(scssContent).toMatch(/border:\s*1px\s+solid\s+CanvasText;/);
  });

  it('declares modal sheets, drawers, and body dialogs 2px CanvasText border and Canvas background', () => {
    expect(scssContent).toMatch(/\.lv-modal\s+\.lv-sheet,\s*\.lv-drawer\s*\{[^}]*border:\s*2px\s+solid\s+CanvasText;\s*background:\s*Canvas;/);
    expect(indexContent).toMatch(/\.b3-dialog__container\s*\{[^}]*border:\s*2px\s+solid\s+CanvasText\s*!important;\s*background:\s*Canvas\s*!important;/);
  });

  it('maps primary buttons and active navigation to Highlight and HighlightText', () => {
    expect(scssContent).toMatch(/\.lv-btn\.primary,\s*\.b3-button--primary,\s*\.lv-hero-open\s*\{[^}]*background:\s*Highlight\s*!important;\s*color:\s*HighlightText\s*!important;/);
    expect(scssContent).toMatch(/\.lv-tabs__item\.is-active,\s*\.lv-tabs__item\[aria-selected="true"\]/);
    expect(scssContent).toMatch(/outline:\s*2px\s+solid\s+Highlight\s*!important;/);
  });

  it('enforces accessible focus-visible rings with outline-color and offset', () => {
    expect(scssContent).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+Highlight\s*!important;\s*outline-color:\s*Highlight\s*!important;\s*outline-offset:\s*2px;/);
  });

  it('preserves visual indicators and state affordances with forced-color-adjust: none', () => {
    expect(scssContent).toMatch(/\.lv-avatar,\s*\.lv-miniava,\s*\.lv-mi,\s*\.lv-focus-icon/);
    expect(scssContent).toMatch(/input\[type="checkbox"\]\.b3-switch/);
    expect(scssContent).toMatch(/svg\s*\{[^}]*forced-color-adjust:\s*none;/);
  });

  it('declares prefers-contrast: more block with enhanced borders and focus outlines', () => {
    expect(scssContent).toContain('@media (prefers-contrast: more)');
    expect(scssContent).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px\s+solid\s+var\(--b3-theme-primary\);/);
    expect(scssContent).toMatch(/\.lv-tabs__item\.is-active,\s*\.lv-tabs__item\.on/);
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
