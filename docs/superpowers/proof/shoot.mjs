/**
 * Day 7 evidence spine proof harness.
 *
 * Renders the evidence spine from the repo's real `app/globals.css`, reads
 * computed styles back off the page, and exercises `lib/evidence/selection` in
 * real Chromium against the compiled real source.
 *
 * This exists because the DOM half of the selection module cannot be
 * unit-tested here. `require('jsdom')` against this repo does not complete
 * inside vitest's worker-ready window, so a jsdom test file times out its
 * worker and contributes zero tests while the suite still reports green.
 * Testing Range and Selection arithmetic in a real browser is stronger evidence
 * than testing it against a simulation anyway.
 *
 * Usage, from the repo root:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node docs/superpowers/proof/shoot.mjs
 *
 * Playwright is deliberately not a devDependency. This runs when someone
 * changes the evidence spine, not on every install.
 *
 * Nothing derived is committed: tokens.css and out/selection.js are generated
 * on each run, so the proof can never drift from the source it claims to prove.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PROOF_DIR = import.meta.dirname;
const REPO_ROOT = path.resolve(PROOF_DIR, '../../..');
const OUT_DIR = path.join(PROOF_DIR, 'out');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}  ${JSON.stringify(actual)}${ok ? '' : `  expected ${JSON.stringify(expected)}`}`);
}

/** Strips the Tailwind directives so the token block, type scale and evidence
 *  rules can be loaded as a plain stylesheet. */
function buildTokens() {
  const css = fs.readFileSync(path.join(REPO_ROOT, 'app/globals.css'), 'utf8')
    .replace(/@import[^\n]*\n/g, '')
    .replace(/@theme\s*\{/g, ':root {');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'tokens.css'), css);
}

/** Compiles the real selection module and drops `export` so a script tag
 *  defines its functions as globals a page.evaluate can call. */
function buildSelectionModule() {
  execFileSync('npx', ['tsc', 'lib/evidence/selection.ts',
    '--target', 'es2022', '--module', 'esnext', '--outDir', OUT_DIR, '--skipLibCheck'],
    { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  const file = path.join(OUT_DIR, 'selection.js');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^export /gm, ''));
}

(async () => {
  buildTokens();
  buildSelectionModule();

  // PLAYWRIGHT_CHROMIUM lets a preinstalled Chromium be used instead of a
  // per-project download.
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  );

  for (const [name, width, height] of [['desktop', 1440, 1180], ['mobile', 375, 1400]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    await page.goto(`file://${path.join(PROOF_DIR, 'index.html')}`);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(PROOF_DIR, '..', `evidence-spine-${name}.png`), fullPage: true });

    if (name !== 'desktop') { await page.close(); continue; }

    const styles = await page.evaluate(() => {
      const mark = document.querySelector('.evidence-mark');
      const cs = getComputedStyle(mark);
      return {
        display: cs.display,
        lineBoxes: mark.getClientRects().length,
        fill: cs.backgroundColor,
        rule: `${cs.borderBottomWidth} ${cs.borderBottomColor}`,
        transition: `${cs.transitionProperty} / ${cs.transitionDuration}`,
        cursor: cs.cursor,
        contentVisibility: getComputedStyle(document.querySelector('.transcript-block')).contentVisibility,
        columns: getComputedStyle(document.querySelector('.split')).gridTemplateColumns,
      };
    });

    console.log('\n--- computed styles, read off the page');
    // display: inline is why the mark is an anchor and not a button. Chromium
    // computes inline on a button as inline-block, which would stop a quote
    // wrapping across a line break.
    check('mark display', styles.display, 'inline');
    check('mark wraps across lines', styles.lineBoxes > 1, true);
    check('rest fill is accent-wash', styles.fill, 'rgb(228, 209, 225)');
    check('bottom rule is 2px accent', styles.rule, '2px rgb(123, 74, 116)');
    check('transitions colour and shadow only', styles.transition, 'background-color, box-shadow / 0.16s');
    check('cursor', styles.cursor, 'pointer');
    check('blocks skip offscreen paint', styles.contentVisibility, 'auto');
    check('two equal columns at 1440', styles.columns, '544px 544px');

    await page.addScriptTag({ path: path.join(OUT_DIR, 'selection.js') });
    const selection = await page.evaluate(() => {
      const root = document.querySelector('.pane');
      const seg = (i) => root.querySelectorAll('[data-start]')[i];
      const sel = window.getSelection();
      function pick(a, ao, b, bo) {
        const range = document.createRange();
        range.setStart(a, ao);
        range.setEnd(b, bo);
        sel.removeAllRanges();
        sel.addRange(range);
        return resolveSelectionSpan(root, sel);
      }
      const collapsed = document.createRange();
      collapsed.setStart(seg(0).firstChild, 5);
      collapsed.collapse(true);
      const outside = document.querySelector('h1');
      const quotes = [
        { text: 'a', theme: 'Theme A', char_start: 120, char_end: 170 },
        { text: 'b', theme: 'Theme B', char_start: 160, char_end: 200 },
      ];
      const result = {
        withinUnquoted: pick(seg(0).firstChild, 10, seg(0).firstChild, 20),
        acrossSegments: pick(seg(0).firstChild, 0, seg(2).firstChild, 5),
        insideMark: pick(seg(1).firstChild, 0, seg(1).firstChild, 6),
        elementBoundary: pick(seg(0), 0, seg(1), 1),
        outsidePane: pick(outside.firstChild, 0, outside.firstChild, 4),
        noSelection: resolveSelectionSpan(root, null),
        overlapBoth: quotesOverlapping({ start: 165, end: 168 }, quotes),
        overlapNone: quotesOverlapping({ start: 0, end: 100 }, quotes),
        sharedBoundary: quotesOverlapping({ start: 200, end: 220 }, quotes),
        themes: themesFor([0, 1, 0], quotes),
      };
      sel.removeAllRanges();
      sel.addRange(collapsed);
      result.collapsed = resolveSelectionSpan(root, sel);
      return result;
    });

    console.log('\n--- lib/evidence/selection, real Range and Selection');
    check('within one unquoted segment', selection.withinUnquoted, { start: 10, end: 20 });
    check('across three segments', selection.acrossSegments, { start: 0, end: 175 });
    check('inside the mark', selection.insideMark, { start: 120, end: 126 });
    check('element-level boundary collapses to the edge', selection.elementBoundary, { start: 0, end: 239 });
    check('collapsed selection resolves to null', selection.collapsed, null);
    check('selection outside the pane resolves to null', selection.outsidePane, null);
    check('no selection resolves to null', selection.noSelection, null);
    check('overlap finds both quotes', selection.overlapBoth, [0, 1]);
    check('no overlap when the span misses', selection.overlapNone, []);
    check('a shared boundary is not an overlap', selection.sharedBoundary, []);
    check('theme names dedupe in first-seen order', selection.themes, ['Theme A', 'Theme B']);

    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();
