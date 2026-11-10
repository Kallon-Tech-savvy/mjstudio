# Ma design system for alhajikallon.com

A blend of IBM, Airbnb, Apple, Swiss and Japanese design, expressed as tokens, component CSS, rules and a checker.

Nothing in this package has been applied to your repository.

| File | Purpose |
| --- | --- |
| `css/tokens.css` | Both themes (Washi light, Sumi dark), type scale, shape, motion, Tailwind v4 registration, legacy aliases |
| `css/components.css` | Base, layout, buttons, field, panel, figure, chip, status, seal, overlay, motion |
| `tokens.json` | The same values for design tools, with measured contrast |
| `scripts/check-consistency.mjs` | Finds hex and rgb literals, off-scale radius, weight, tracking and shadow, and retired effects |
| `docs/DESIGN_SYSTEM.md` | The rules. Replaces `DOCS/VISUAL_SYSTEM.md` |
| `docs/MIGRATION.md` | Four phases, find-and-replace tables, font code, CI step |

Start with `docs/MIGRATION.md`. To measure drift at any time:

```
node scripts/check-consistency.mjs src --warn
```

Requires Node 18 or newer. The CSS targets Tailwind v4 (your repo uses 4.3).
