# Scixiv visual identity — Perseverance

Portable design system for apps that should share this notebook’s look: **scientific UI with a Mars 2020 / Perseverance reading** — basalt, dust, flight-hardware ochre, sky haze. Subtle mission chrome, not a fan site.

Use this file as the source of truth when theming other products. Implementation in this repo lives in `src/app/globals.css` and `tailwind.config.ts`.

---

## Thesis (one line)

> Warm near-black surfaces, a single Martian ochre accent, butterscotch atmosphere wash, and monospace “ops” labels — restrained, high contrast, no purple glow.

Everything new must pass this filter.

---

## Do / don’t

**Do**

- One accent only (ochre / rust).
- Warm gray hierarchy (ink → surface → raised).
- Mono for status, dates, SOL, metadata.
- Soft institution/place colors at reduced opacity so they never beat titles.
- One atmospheric wash on the root; keep the rest flat.

**Don’t**

- Default AI clusters: purple-on-white, cream + terracotta serif, broadsheet hairlines.
- Multi-layer glow, neon, or competing accent hues.
- Heavy card chrome when a borderless list would do.
- Literal Mars kitsch (GIFs, ground strips) unless the product *is* this notebook’s brand surface.

---

## Color tokens

Colors are stored as space-separated `R G B` so Tailwind / CSS can apply alpha: `rgb(var(--color-accent) / 0.55)`.

### Dark (`data-theme="dark"`)

| Token | RGB | Hex (approx.) | Role |
| --- | --- | --- | --- |
| `ink` | `8 7 6` | `#080706` | Page / app background (basalt) |
| `surface` | `22 18 15` | `#16120F` | Panels, inputs |
| `surface-raised` | `32 26 22` | `#201A16` | Elevated surface |
| `line` | `74 64 54` | `#4A4036` | Dividers |
| `line-strong` | `108 92 74` | `#6C5C4A` | Interactive borders (≥ 3:1 on ink) |
| `text` | `236 230 220` | `#ECE6DC` | Primary text |
| `muted` | `148 136 120` | `#948878` | Secondary text |
| `accent` | `216 148 74` | `#D8944A` | Links, emphasis, mission LED |
| `accent-dim` | `72 48 28` | `#48301C` | Soft accent fill |
| `place` | `120 138 148` | `#788A94` | Geography / location (low emphasis) |
| `haze` | `196 148 96` | `#C49460` | Atmosphere wash only |

### Light (`data-theme="light"`)

| Token | RGB | Hex (approx.) | Role |
| --- | --- | --- | --- |
| `ink` | `247 242 234` | `#F7F2EA` | Sky-haze paper background |
| `surface` | `252 249 244` | `#FCF9F4` | Panels |
| `surface-raised` | `238 232 222` | `#EEE8DE` | Elevated |
| `line` | `180 168 150` | `#B4A896` | Dividers |
| `line-strong` | `148 132 110` | `#94846E` | Controls |
| `text` | `36 28 22` | `#241C16` | Primary text |
| `muted` | `110 96 80` | `#6E6050` | Secondary |
| `accent` | `154 84 28` | `#9A541C` | Rust ochre (AA on paper) |
| `accent-dim` | `232 208 176` | `#E8D0B0` | Soft accent |
| `place` | `90 110 122` | `#5A6E7A` | Location |
| `haze` | `180 160 130` | `#B4A082` | Atmosphere wash |

### Emphasis rules

- Titles / primary actions: full `text` or full `accent`.
- Institutions / partners in timelines: `accent` at ~55% opacity.
- Places: `place` at ~80% opacity.
- Never use full vivid accent for long secondary metadata.

### Contrast

Target WCAG 2.1 AA: text pairs ≥ 4.5:1; UI borders that identify controls ≥ 3:1. Recheck if you tweak ochre.

---

## Atmosphere (signature wash)

Apply once on the root / `body`:

```css
background-color: rgb(var(--color-ink));
background-image: radial-gradient(
  ellipse 120% 55% at 50% -8%,
  rgb(var(--color-haze) / 0.16),
  transparent 58%
);
background-attachment: fixed;
```

Do not stack multiple decorative gradients on the same surface.

---

## Typography

Three roles:

| Role | This repo | Use for |
| --- | --- | --- |
| Display | Space Grotesk | Brand, page titles, section heads |
| Sans | Inter | Body, UI labels |
| Mono | JetBrains Mono | SOL, dates, status, code, captions |

Tracking for ops labels: uppercase + wide letter-spacing (e.g. `0.12em`–`0.14em`) at `2xs` / caption size.

---

## Gradients

### UI fades (utility)

- Timeline / marquee edges: `ink → transparent` (left/right). Not brand color — just overflow chrome.

### Topic tiles (optional)

`linear-gradient(135deg, from, to)` for category avatars when you have a taxonomy. Defaults in this repo:

| Topic | From | To |
| --- | --- | --- |
| Computer Vision | `#3f3d63` | `#5b6b8c` |
| Machine Learning | `#4a3a5e` | `#7a5b8c` |
| Control Systems | `#4a3a28` | `#7a6248` |
| Spectroscopy | `#2a3848` | `#4a6070` |
| Signal Processing | `#2a4550` | `#3d7a8c` |
| Engineering | `#4a4038` | `#7a6a52` |
| Default / RS / robotics / notes | `#3a4550` | `#586878` |

Apps without topics can omit these entirely.

---

## Mission chrome (optional flavor)

Use sparingly so products feel related without cloning Scixiv:

- Status pill: monospace `Sol N · Active` (or product-specific ops string).
- Indicator dots: near-square (`1px`–`3px` radius), ochre fill.
- Prefer fewer hairline borders; drop top/bottom shell rules if the haze already separates regions.
- Overflow lists: hide scrollbars; show fade + chevron only when `scrollWidth > clientWidth`.

Product-specific art (Ingenuity GIF, Martian ground strip) is **Scixiv-only** unless you deliberately brand another surface the same way.

---

## Drop-in CSS skeleton

```css
:root,
:root[data-theme="dark"] {
  --color-ink: 8 7 6;
  --color-surface: 22 18 15;
  --color-surface-raised: 32 26 22;
  --color-line: 74 64 54;
  --color-line-strong: 108 92 74;
  --color-text: 236 230 220;
  --color-muted: 148 136 120;
  --color-accent: 216 148 74;
  --color-accent-dim: 72 48 28;
  --color-place: 120 138 148;
  --color-haze: 196 148 96;
}

:root[data-theme="light"] {
  --color-ink: 247 242 234;
  --color-surface: 252 249 244;
  --color-surface-raised: 238 232 222;
  --color-line: 180 168 150;
  --color-line-strong: 148 132 110;
  --color-text: 36 28 22;
  --color-muted: 110 96 80;
  --color-accent: 154 84 28;
  --color-accent-dim: 232 208 176;
  --color-place: 90 110 122;
  --color-haze: 180 160 130;
}
```

### Tailwind mapping (example)

```ts
colors: {
  ink: "rgb(var(--color-ink) / <alpha-value>)",
  surface: "rgb(var(--color-surface) / <alpha-value>)",
  "surface-raised": "rgb(var(--color-surface-raised) / <alpha-value>)",
  line: "rgb(var(--color-line) / <alpha-value>)",
  "line-strong": "rgb(var(--color-line-strong) / <alpha-value>)",
  text: "rgb(var(--color-text) / <alpha-value>)",
  muted: "rgb(var(--color-muted) / <alpha-value>)",
  accent: "rgb(var(--color-accent) / <alpha-value>)",
  "accent-dim": "rgb(var(--color-accent-dim) / <alpha-value>)",
  place: "rgb(var(--color-place) / <alpha-value>)",
}
```

### JSON theme (for RN / Electron / design tools)

```json
{
  "name": "perseverance",
  "dark": {
    "ink": "#080706",
    "surface": "#16120F",
    "surfaceRaised": "#201A16",
    "line": "#4A4036",
    "lineStrong": "#6C5C4A",
    "text": "#ECE6DC",
    "muted": "#948878",
    "accent": "#D8944A",
    "accentDim": "#48301C",
    "place": "#788A94",
    "haze": "#C49460"
  },
  "light": {
    "ink": "#F7F2EA",
    "surface": "#FCF9F4",
    "surfaceRaised": "#EEE8DE",
    "line": "#B4A896",
    "lineStrong": "#94846E",
    "text": "#241C16",
    "muted": "#6E6050",
    "accent": "#9A541C",
    "accentDim": "#E8D0B0",
    "place": "#5A6E7A",
    "haze": "#B4A082"
  }
}
```

---

## Checklist for a new app

1. Copy tokens + theme switch (`data-theme` or equivalent).
2. Wire display / sans / mono fonts.
3. Add the radial haze on the root once.
4. Map semantic classes (`bg-ink`, `text-accent`, `border-line`, `text-place`).
5. Style primary actions with ochre; keep secondary chrome quiet.
6. Verify AA contrast on both themes.
7. Add mission chrome only if it fits the product voice.

---

## Source files in this repo

- Tokens & haze: `src/app/globals.css`
- Tailwind bridge: `tailwind.config.ts`
- Topic gradients: `src/lib/site.ts` (`topics[].gradient`)
- Timeline overflow chrome: `src/components/HorizontalTimeline.tsx`
