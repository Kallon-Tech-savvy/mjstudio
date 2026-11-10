# Ma design system

Ma (間) is the Japanese idea of the interval: the space between things is part of the design. This system blends five traditions into one set of rules for alhajikallon.com.

| Influence | What we take | Where it shows up |
| --- | --- | --- |
| IBM | Systems thinking: a base unit, named tokens, documented states, a Plex type family | 8px grid, `--ui-*` tokens, IBM Plex Sans and Mono |
| Airbnb | Warmth: soft controls, friendly copy, large touch targets | Pill buttons, 12px cards, 48px minimum control height, sentence-case labels |
| Apple | Clarity and depth: big quiet headlines, one focal action, easing that decelerates | Tight-tracked display type, one primary button per view, `--ease-out`, blur only on overlays |
| Swiss | Grid and hierarchy: columns, flush-left text, hairline rules | 12-column grid, 3/6/3 splits, `ui-rule`, square image frames |
| Japanese | Restraint and space: ma, washi paper, indigo and a single seal, asymmetry | Section spacing of 64 to 128px, paper and ink palette, one vermilion seal, Mincho used once |

## When influences disagree

Apply in this order.

1. **Accessibility** decides first: 4.5:1 text, 3:1 control outlines, visible focus, 48px targets, no meaning by colour alone.
2. **Swiss and Japanese restraint** beat Airbnb decoration. If an element has no job, remove it.
3. **IBM rigor** decides values. Anything repeated becomes a token.
4. **Apple depth** appears only on overlays (navigation over scrolling content, dialogs).
5. **Airbnb warmth** decides tone: copy, corner softness, spacing around controls.

## Themes

One palette, two themes, same roles. Themes follow the system setting; `data-theme="light"` or `"dark"` on `<html>` forces one.

| Role | Token | Washi (light) | Sumi (dark) |
| --- | --- | --- | --- |
| Page | `--ui-background` | `#F4F1EA` | `#0B1018` |
| Panel | `--ui-surface` | `#EAE6DC` | `#131C29` |
| Raised control | `--ui-elevated` | `#DEDACF` | `#1B293C` |
| Text | `--ui-text` | `#20221F` | `#F4F0E8` |
| Supporting text | `--ui-muted` | `#575D57` | `#BBC7D8` |
| Accent, links, focus, primary action | `--ui-accent` | `#174E72` | `#A8C9FF` |
| Text on accent | `--ui-on-accent` | `#F4F1EA` | `#0B1018` |
| Control outline | `--ui-border` | `#7C8075` | `#667994` |
| Hairline, divider | `--ui-rule` | `#C9C5B8` | `#2A3A52` |
| Seal | `--ui-seal` | `#B3321F` | `#F08A74` |
| Success / Warning / Danger | `--ui-success` / `--ui-warning` / `--ui-danger` | `#1F6B4A` / `#7A5400` / `#9B1C31` | `#8FE0B5` / `#F3D390` / `#FFB4BD` |

Measured contrast (WCAG 2.x): text on every surface is 11.4:1 or higher in Washi and 12.9:1 or higher in Sumi. Muted text is 4.84 to 5.99:1 in Washi and 8.59 to 11.14:1 in Sumi. Accent on page is 7.86:1 and 11.31:1. Control outline is 3.24 to 3.58:1 in Washi and 3.86 to 4.29:1 in Sumi.

Colour rules:

- Indigo is the only accent. It carries links, focus, the primary action and the current page.
- The seal appears at most once per view, as a mark and never as a status.
- Success, warning and danger describe state. They always come with a word.
- No gradients, no glow, no translucent colour except `ui-overlay` and `ui-scrim`.
- Components never use hex or rgb. They use tokens.

## Typography

| Family | Role | Token |
| --- | --- | --- |
| IBM Plex Sans | Interface, headings, body | `font-sans` (aliases `font-body`, `font-display`) |
| IBM Plex Mono | Code, data, technical labels | `font-mono` |
| Zen Old Mincho | One quotation or closing line per page | `font-mincho` |

Weights: 400 for text, 500 for controls and links, 600 for headings and labels. Nothing heavier.

| Role | Utility | Size | Line | Tracking | Weight |
| --- | --- | --- | --- | --- | --- |
| Display | `text-display` | 48 to 96px | 1.02 | -0.045em | 600 |
| Headline | `text-headline` / `.page-title` | 40 to 72px | 1.05 | -0.035em | 600 |
| Heading | `text-heading` / `.section-title` | 28 to 40px | 1.15 | -0.025em | 600 |
| Title | `text-title` | 24px | 1.3 | -0.015em | 600 |
| Lead | `text-lead` | 20px | 1.55 | -0.01em | 400 |
| Body | `text-body` | 16px | 1.65 | 0 | 400 |
| Reading | `.type-reading` | 17px | 1.8 | 0 | 400 |
| Caption | `text-caption` | 14px | 1.5 | 0 | 400 |
| Label | `text-label` + uppercase / `.type-label` | 12px | 1.5 | 0.08em | 600 |

Rules: sentence case for headings, buttons and links. Uppercase is for labels only. Text is flush left and ragged right. Line length stays near 65 characters. No more than three type sizes in one view.

## Space and grid

- Base unit 8px. Use Tailwind steps of 2 (8px), 3 (12px), 4 (16px), 6 (24px), 8 (32px), 12 (48px), 16 (64px), 24 (96px), 32 (128px). A half step (4px) is allowed inside a component.
- Container `--layout-max` 72rem. Gutter `--page-gutter` (24px on phones, 48px on desktop).
- 12 columns, gap `--grid-gap` (16 to 24px). Standard splits: **3 / 6 / 3** (label, content, action), **4 / 8**, **12**. Prefer asymmetry to equal halves.
- Between sections: `section-space` (64 to 96px). Hero and closing: `section-space-lg` (96 to 128px).
- Inside a card or control group: 16 to 24px. Between a heading and its text: 16px.

## Shape and elevation

| Token | Value | Use |
| --- | --- | --- |
| `rounded-seal` | 4px | Seal, keyboard hint |
| `rounded-control` | 8px | Fields, small controls |
| `rounded-card` | 12px | Panels, cards |
| `rounded-overlay` | 20px | Dialogs, chat, sheets |
| `rounded-full` | pill | Buttons, chips |
| `rounded-none` | 0 | Photographs, screenshots, figures |

Elevation is flat by default (a hairline does the work). `shadow-raised` for one lifted element; `shadow-overlay` for dialogs. No other shadows.

## Motion

Motion explains arrival and state, never decorates. Durations: 120ms hover and press, 200ms state change, 360ms reveal, 560ms route arrival. Use `--ease-out` for things arriving and `--ease-in-out` for state changes. No looping animation, no cursor effects, no glitch. `prefers-reduced-motion` removes all of it.

## Components

| Component | Class | Notes |
| --- | --- | --- |
| Primary button | `ui-primary` | Indigo, pill, 48px, sentence case. One per view. Hover inverts to ink. |
| Secondary button | `ui-secondary` | Outline in ink. For the second action only. |
| Link | `ui-link` | Underlined, indigo, 44px minimum hit area. Trailing arrow for external or case study. |
| Field | `ui-field` with `ui-label`, `ui-hint`, `ui-error` | Label always above. Error says what happened and how to fix it. |
| Panel | `ui-panel` | Surface, hairline, 12px. Use only when grouping needs a boundary. |
| Figure | `ui-figure` | Square, hairline frame, padding. For screenshots and photographs. |
| Chip | `ui-chip` | Non-interactive tag. |
| Status | `ui-status[data-tone]` | Border, light tint, bold word ("Success", "Warning", "Error"). |
| Seal | `ui-seal` | One per view. Mincho character in vermilion. |
| Overlay | `ui-overlay`, `ui-dialog`, `ui-scrim` | The only translucent, blurred or shadowed surfaces. |
| Rule | `ui-rule`, `ui-rule-strong` | Section dividers. Strong rule opens a major section. |

Section header: a rule, then a label and a text link on one line (`type-label` left, `ui-link` right). Number sections only when order is information, such as the four stages of the process.

Project row: 12 columns split 3 / 6 / 3. Left, label and meta. Centre, title (`text-title` or `text-heading`) and one sentence. Right, one link, aligned right on desktop.

## Content rules

- One idea per paragraph. Say what the reader can do.
- Buttons name the outcome: "Talk through your idea", never "Submit".
- Navigation labels are nouns in sentence case: Work, About, Writing, Contact. No command-line styling.
- Describe what evidence shows and what it does not.

## Retire

These effects conflict with the system. Remove them as you touch each file.

- Classes: `terminal-panel`, `glass`, `glass-frost`, `glass-frost-light`, `glass-frost-bar`, `text-gradient`, `scanlines`, `glitch-entry`, `glitch-ambient`, `typewriter-line`, `cursor-blink`, `cursor-text-blink`, `glow-pulse`, `float`, `hover-lift`, the staggered offsets in `.gallery-grid`.
- Components with no imports in `src` (safe to delete once you confirm): `CustomCursor`, `LoadingScreen`, `UnicornBackground`.
- `MagneticButton` (used once, in `work/page.tsx`): replace with `ui-primary`.
- Footer watermark "AFRICA", glowing availability dot, lowercase command-style navigation.

## Keeping it consistent

1. Run `node scripts/check-consistency.mjs src` before each commit, and in CI once the count reaches zero.
2. New values go into `tokens.css` first, then into components.
3. A page uses one primary button, one accent colour, at most one seal and at most one Mincho line.
4. When two components differ and should not, fix the component, not the page.
