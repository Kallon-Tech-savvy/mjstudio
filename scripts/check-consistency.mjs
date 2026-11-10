#!/usr/bin/env node
/*
  Ma consistency check
  --------------------------------------------------------------
  Scans source files for styling that bypasses the design system.
  No dependencies. Node 18 or newer.

    node scripts/check-consistency.mjs [dir] [--warn] [--json] [--verbose]

  dir        folder to scan (default: src)
  --warn     report only, always exit 0 (use while migrating)
  --json     machine-readable output
  --verbose  list every offending line, not just the top files

  Add `ma-ignore` in a comment on the same line to skip that line.
*/
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'src');

const CODE = /\.(tsx?|jsx?|mjs|cjs|mdx)$/;
const CSS = /\.css$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'out', 'dist']);
const SKIP_CSS = new Set(['tokens.css', 'components.css', 'globals.css']);

/** kind: 'violation' fails the check, 'legacy' only tracks migration progress. */
const RULES = [
  { id: 'hex-literal', kind: 'violation', files: CODE, re: /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b/g,
    why: 'Use a colour token, never a hex value.', fix: 'bg-paper, text-ink, text-indigo, var(--ui-*)' },
  { id: 'colour-function', kind: 'violation', files: CODE, re: /\b(?:rgba?|hsla?)\(/g,
    why: 'Use a token. For tints use color-mix() on a token.', fix: 'color-mix(in srgb, var(--ui-accent) 10%, transparent)' },
  { id: 'arbitrary-tracking', kind: 'violation', files: CODE, re: /\btracking-\[[^\]]+\]/g,
    why: 'Tracking comes from the type role.', fix: 'type-label, text-heading, text-display' },
  { id: 'wide-tracking', kind: 'violation', files: CODE, re: /\btracking-(?:wide|wider|widest)\b/g,
    why: 'Labels use one tracking value (0.08em).', fix: 'type-label' },
  { id: 'arbitrary-font-size', kind: 'violation', files: CODE, re: /\btext-\[\s*-?[\d.]+(?:px|rem|em|vw|vh|%)\s*\]/g,
    why: 'Use a named size from the scale.', fix: 'text-label, text-caption, text-body, text-lead, text-title, text-heading' },
  { id: 'weight-off-scale', kind: 'violation', files: CODE, re: /\bfont-(?:bold|extrabold|black|light|thin)\b/g,
    why: 'Only 400, 500 and 600 are used.', fix: 'font-normal, font-medium, font-semibold' },
  { id: 'radius-off-scale', kind: 'violation', files: CODE, re: /\brounded(?:-[trbl]{1,2})?-(?:sm|md|lg|xl|2xl|3xl)\b|\brounded-\[[^\]]+\]/g,
    why: 'Radii come from the scale.', fix: 'rounded-seal, rounded-control, rounded-card, rounded-overlay, rounded-full, rounded-none' },
  { id: 'shadow-off-scale', kind: 'violation', files: CODE, re: /\bshadow-(?:xs|sm|md|lg|xl|2xl)\b|\bshadow-\[[^\]]+\]/g,
    why: 'Two elevations only.', fix: 'shadow-raised, shadow-overlay' },
  { id: 'retired-effect', kind: 'violation', files: CODE,
    re: /\b(?:glass-frost-light|glass-frost-bar|glass-frost|glass|text-gradient|terminal-panel|scanlines|glitch-entry|glitch-ambient|typewriter-line|cursor-text-blink|cursor-blink|glow-pulse|hover-lift)\b/g,
    why: 'Retired: decorative effects that conflict with the calm, grid-led system.', fix: 'ui-panel, ui-overlay, plain text' },
  { id: 'literal-in-css', kind: 'violation', files: CSS, skipNames: SKIP_CSS, re: /#[0-9a-fA-F]{6}\b|\brgba?\(/g,
    why: 'Stylesheets other than tokens.css use tokens only.', fix: 'var(--ui-*)' },
  { id: 'legacy-colour-name', kind: 'legacy', files: CODE,
    re: /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide)-(?:midnight|ivory|navy|gold|pride-blue|magenta)\b|var\(--color-(?:midnight|ivory|navy|gold|pride-blue|magenta)\)/g,
    why: 'Legacy colour name. Still works; rename when you touch the file.', fix: 'paper, ink, elevated, indigo' },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const hits = new Map(RULES.map((r) => [r.id, []]));
let scanned = 0;
for (const file of walk(root)) {
  const isCode = CODE.test(file);
  const isCss = CSS.test(file);
  if (!isCode && !isCss) continue;
  scanned++;
  const lines = readFileSync(file, 'utf8').split('\n');
  const rel = path.relative(process.cwd(), file);
  lines.forEach((line, i) => {
    if (line.includes('ma-ignore')) return;
    for (const rule of RULES) {
      if (!rule.files.test(file)) continue;
      if (rule.skipNames?.has(path.basename(file))) continue;
      const matches = line.match(rule.re);
      if (matches) for (const m of matches) hits.get(rule.id).push({ file: rel, line: i + 1, match: m });
    }
  });
}

const summary = RULES.map((r) => {
  const list = hits.get(r.id);
  const byFile = new Map();
  for (const h of list) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);
  return { id: r.id, kind: r.kind, why: r.why, fix: r.fix, count: list.length, files: byFile.size, byFile, list };
});
const violations = summary.filter((s) => s.kind === 'violation').reduce((n, s) => n + s.count, 0);
const legacy = summary.filter((s) => s.kind === 'legacy').reduce((n, s) => n + s.count, 0);

if (flags.has('--json')) {
  console.log(JSON.stringify({
    scanned, violations, legacy,
    rules: summary.map(({ id, kind, count, files, why, fix }) => ({ id, kind, count, files, why, fix })),
  }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\nMa consistency check: ${scanned} files scanned in ${path.relative(process.cwd(), root) || '.'}\n`);
  console.log(`${pad('rule', 22)}${pad('kind', 11)}${pad('hits', 7)}${pad('files', 7)}fix`);
  console.log('-'.repeat(86));
  for (const s of summary) console.log(`${pad(s.id, 22)}${pad(s.kind, 11)}${pad(s.count, 7)}${pad(s.files, 7)}${s.fix}`);
  console.log('-'.repeat(86));
  console.log(`${violations} violations, ${legacy} legacy names still in use.\n`);
  for (const s of summary.filter((x) => x.count > 0)) {
    console.log(`${s.id}: ${s.why}`);
    const rows = flags.has('--verbose')
      ? s.list.map((h) => `  ${h.file}:${h.line}  ${h.match}`)
      : [...s.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `  ${n}  ${f}`);
    console.log(rows.join('\n') + '\n');
  }
}

process.exit(flags.has('--warn') || violations === 0 ? 0 : 1);
