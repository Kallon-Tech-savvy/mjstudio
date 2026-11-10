# Migrating alhajikallon.com to Ma

Nothing here has been applied to your repo. Work on a branch and review each phase.

## Decision to confirm first

Today the homepage and AEEM case study use the light paper palette, and every other route uses the dark midnight palette. Ma uses one palette in two themes that follow the visitor's system setting. After phase 1, routes that are dark today will render light for visitors whose system is set to light. If you want dark everywhere regardless, add `data-theme="dark"` to `<html>` in `layout.tsx`.

## Phase 1: tokens and fonts (small, visible everywhere)

1. Copy `css/tokens.css` and `css/components.css` to `src/styles/ma/`.
2. In `src/app/globals.css`, delete the `:root` block, the `@theme inline` block, the base, scrollbar, effect and `.editorial-page` sections. Keep `@import "tailwindcss";` and add:

   ```css
   @import "tailwindcss";
   @import "../styles/ma/tokens.css";
   @import "../styles/ma/components.css";
   ```
3. Swap fonts in `src/app/layout.tsx`:

   ```ts
   import { IBM_Plex_Sans, IBM_Plex_Mono, Zen_Old_Mincho } from "next/font/google";

   const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
   const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
   const mincho = Zen_Old_Mincho({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-mincho", display: "swap", preload: false });
   ```

   and use `className={`${plexSans.variable} ${plexMono.variable} ${mincho.variable} h-full antialiased`}` on `<html>`. Remove the Inter and JetBrains Mono imports. The seal uses a Japanese character, so load Mincho with `preload: false` and only on pages that show it if page weight matters.
4. Remove `className="editorial-page"` wrappers. The palette is global now.
5. Run `npm run build`, then `npm run test:browser-bundle`. The theme-utility test looks for `bg-midnight`, `bg-surface`, `text-ivory`, `text-muted`, `text-accent`, `font-display`, `font-body`, `site-gutter`, `section-space`. All remain defined as legacy aliases.

## Phase 2: remove retired effects

Use `node scripts/check-consistency.mjs src --verbose` for exact lines.

- Delete unused components: `CustomCursor`, `LoadingScreen`, `UnicornBackground`.
- Replace `MagneticButton` in `src/app/work/page.tsx` with `<Link className="ui-primary">` and delete `MagneticButton` and `useMagnetic` if nothing else uses them.
- Footer: remove the "AFRICA" watermark and the glow on the availability dot; use sentence-case navigation (Work, About, Writing, Knowledge, FAQ, Contact, Privacy); drop `uppercase tracking-[0.16em]` on the CTA and use `ui-primary` alone. The CTA currently combines `ui-primary` with conflicting Tailwind classes.
- Navbar: replace the blinking cursor and monospace "command" styling with a Plex wordmark and the `ui-seal` mark.
- Gallery page: remove the staggered offsets.

## Phase 3: snap values to the scale

| Find | Replace with |
| --- | --- |
| `rounded-lg` | `rounded-control` |
| `rounded-xl` | `rounded-card` |
| `rounded-2xl`, `rounded-3xl` | `rounded-overlay` (or `rounded-card`) |
| `shadow-sm` to `shadow-2xl`, `shadow-[...]` | `shadow-raised` or `shadow-overlay`, or none |
| `font-bold`, `font-black` | `font-semibold` |
| `font-light` | `font-normal` |
| `tracking-widest`, `tracking-[0.16em]` and similar | `type-label` on the element |
| `text-[12px]` and similar | `text-label` or `text-caption` |
| hex or `rgba()` in components | a token, or `color-mix(in srgb, var(--ui-accent) 10%, transparent)` |

Third-party SVG or canvas code that cannot read CSS variables may keep a literal. Add `ma-ignore` in a comment on that line.

## Phase 4: rename legacy colours as you touch files

| Legacy | New |
| --- | --- |
| `midnight` | `paper` |
| `ivory` | `ink` |
| `navy` | `elevated` |
| `accent`, `gold`, `blue`, `pride-blue` | `indigo` |
| `magenta` | `danger` |

When `check-consistency` reports zero legacy names, delete section 4 of `tokens.css`.

## Enforcing it

Add to `package.json`:

```json
"check:design": "node scripts/check-consistency.mjs src",
"check:design:warn": "node scripts/check-consistency.mjs src --warn"
```

Run `check:design:warn` in CI while migrating, then switch to `check:design` when the count is zero so regressions fail the build.

## Baseline (your repo, 8 November 2026)

Measured with the checker against the default branch as cloned on that date: 66 files scanned, 276 violations and 147 legacy colour names.

| Rule | Hits | Files |
| --- | --- | --- |
| hex-literal | 12 | 3 |
| colour-function | 17 | 5 |
| arbitrary-tracking | 55 | 19 |
| wide-tracking | 32 | 13 |
| arbitrary-font-size | 5 | 5 |
| weight-off-scale | 90 | 24 |
| radius-off-scale | 36 | 12 |
| shadow-off-scale | 10 | 7 |
| retired-effect | 19 | 10 |
| legacy-colour-name | 147 | 28 |
