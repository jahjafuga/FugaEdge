# FugaEdge — Design System (MASTER)

> **LOGIC:** When building a specific page, first check `design-system/pages/[page].md`.
> If that file exists, its rules **override** this Master. Otherwise, strictly follow the rules below.

**Project:** FugaEdge — desktop trading journal & analytics
**Audience:** Serious day traders, prop-firm traders, mentors
**Mood:** Bloomberg meets Linear — premium, focused, terminal-like, data-dense
**Style:** Data-Dense Dashboard + Drill-Down Analytics (dark-mode primary)
**Stack:** React + TypeScript + Electron + Tailwind + Recharts + Lucide

---

## 1. Color Tokens

> **Theming model:** All themable tokens are CSS custom properties defined
> in `src/index.css` under `:root` (dark default) and `:root.light` (light
> overrides). Stored as `R G B` triples so Tailwind composes them with
> `rgb(var(--bg-2) / <alpha-value>)` for alpha modifiers like `bg-bg-2/40`.
> Accent colors (gold, win, loss, info, warning, danger) are defined ONLY
> in `:root` — they stay identical in both themes.

### Surfaces

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg-0`    | `#0d0f14` | `#f4f5f7` | App background |
| `--bg-1`    | `#11141b` | `#ffffff` | Sidebar, page chrome |
| `--bg-2`    | `#161a23` | `#ffffff` | Cards, tiles |
| `--bg-3`    | `#1c2230` | `#f0f1f4` | Elevated cards, modal surface |
| `--bg-4`    | `#232a3b` | `#eaecf0` | Tooltips, popovers, hovered rows |
| `--bg-inset`| `#0a0c11` | `#f8f9fa` | Inset (chart canvas, code blocks) |

### Borders & Dividers

| Token | Dark | Light | Use |
|---|---|---|---|
| `--border-subtle` | `#1e2330` | `#eaecf0` | Card outline, table row sep |
| `--border-default`| `#2a3142` | `#e2e4ea` | Inputs, dropdowns at rest |
| `--border-strong` | `#3a4358` | `#d1d5db` | Focus ring base, active borders |
| `--border-gold`   | `#d4af3733` | (unchanged) | Selected/active accent borders (gold @ 20%) |

### Text

| Token | Dark | Light | Use |
|---|---|---|---|
| `--fg-primary`   | `#f3f5fa` | `#0d0f14` | Headlines, KPIs |
| `--fg-secondary` | `#c9cfdb` | `#4a4d5e` | Body, table cells |
| `--fg-tertiary`  | `#8a94a8` | `#8b8fa8` | Labels, captions |
| `--fg-muted`     | `#5d6678` | `#aaaeba` | Disabled, axis ticks (large only) |

### Always-dark text on accent backgrounds

| Token | Hex | Use |
|---|---|---|
| `text-accent-ink` | `#0d0f14` (fixed) | Dark text on gold/win/loss button backgrounds. Does NOT theme — accent surfaces stay saturated in both modes so the contrast text must stay constant. |

### Brand & Accent (LOCKED)

| Token | Hex | Use |
|---|---|---|
| `--gold`        | `#d4af37` | Primary accent, active nav, CTA |
| `--gold-hover`  | `#e4c252` | Gold on hover |
| `--gold-dim`    | `#a7892c` | Gold pressed, subdued accent |
| `--gold-glow`   | `#d4af3722` | Soft glow / focus-ring tint |

### Semantic — P&L (LOCKED)

| Token | Hex | Use |
|---|---|---|
| `--win`       | `#34d399` | Wins, positive P&L, up moves |
| `--win-soft`  | `#34d3991f` | Win row tint, win badge bg |
| `--loss`      | `#f87171` | Losses, negative P&L, down moves |
| `--loss-soft` | `#f871711f` | Loss row tint, loss badge bg |
| `--neutral`   | `#94a3b8` | Breakeven, zero, unchanged |

### Semantic — System

| Token | Hex | Use |
|---|---|---|
| `--info`    | `#60a5fa` | Informational notices |
| `--warning` | `#fbbf24` | Warnings (not gold — reserve gold for brand) |
| `--danger`  | `#ef4444` | Destructive (delete, irreversible) |
| `--success` | `#34d399` | Success state (same hue as win — intentional) |

### Chart Series Palette (dark-tuned, colorblind-safe order)

`#d4af37` · `#60a5fa` · `#34d399` · `#f87171` · `#a78bfa` · `#fb923c` · `#22d3ee` · `#f472b6`

> Use gold first only when the metric is the *primary* one on screen; otherwise lead with blue.

---

## 2. Typography

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

- **UI / body:** `Inter` (variable, fallback `-apple-system, "Segoe UI", system-ui, sans-serif`)
- **Numeric / tabular:** `JetBrains Mono` — required for **every** number, ticker, time, %, $ value, ratio
- **No serifs anywhere.** No display fonts. Terminal sobriety.

### Scale

| Token | Size / LH | Weight | Use |
|---|---|---|---|
| `text-display`  | 30px / 36px | 600 | Page H1, marquee P&L |
| `text-h1`       | 22px / 28px | 600 | Section heads |
| `text-h2`       | 17px / 24px | 600 | Card titles |
| `text-h3`       | 14px / 20px | 600 | Sub-blocks |
| `text-body`     | 14px / 20px | 400 | Default body |
| `text-sm`       | 13px / 18px | 400 | Tables, dense rows |
| `text-xs`       | 12px / 16px | 500 | Labels, axis ticks |
| `text-2xs`      | 11px / 14px | 600 | Eyebrow tags, uppercase chips |

### Numeric rules

- Always `font-feature-settings: "tnum" 1, "zero" 1;` (tabular nums) so columns align.
- Negative values: prepend `−` (U+2212), not `-`. Use `--loss` color.
- Positive monetary values: prepend `+` only inside change deltas, not balances.
- Percent: 2 decimals (`+12.34%`), currency: 2 decimals USD style (`$1,245.78`).
- R-multiple: 2 decimals (`+2.34R`).

---

## 3. Spacing, Radii, Shadows, Motion

### Spacing scale

`--s-1: 4px · --s-2: 8px · --s-3: 12px · --s-4: 16px · --s-5: 20px · --s-6: 24px · --s-8: 32px · --s-10: 40px · --s-12: 48px`

**Padding contract:**
- **Card inner:** `16px` (`--s-4`) all sides — never less.
- **Section / page gutter:** `24px` (`--s-6`).
- **Grid gap between cards:** `16px`.
- **Sidebar inner:** `12px` horizontal, `8px` vertical between items.
- **Table cell:** `10px` vertical, `12px` horizontal.

### Radii

| Token | Value | Use |
|---|---|---|
| `--r-sm` | `6px`  | Chips, badges, tiny pills |
| `--r-md` | `8px`  | Inputs, buttons, dropdowns |
| `--r-lg` | `12px` | Cards, modals, popovers (DEFAULT) |
| `--r-xl` | `16px` | Splash/empty-state hero illustrations |
| `--r-full` | `9999px` | Avatars, status dots |

> **Card radius is locked at 12px.** Sub-elements inside cards step down to 8px.

### Shadows (subtle — this is a terminal, not a marketing page)

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 0 #00000040, 0 0 0 1px #ffffff05 inset` | Resting card |
| `--shadow-md` | `0 4px 12px #00000059, 0 0 0 1px #ffffff08 inset` | Popover, dropdown |
| `--shadow-lg` | `0 16px 48px #00000080, 0 0 0 1px #ffffff0a inset` | Modal |
| `--glow-gold` | `0 0 0 3px #d4af3722` | Focus ring (gold) |
| `--glow-danger` | `0 0 0 3px #ef444433` | Focus ring (destructive) |

### Motion

```css
--motion-fast:   150ms cubic-bezier(0.2, 0, 0, 1);   /* hover, focus */
--motion-base:   200ms cubic-bezier(0.2, 0, 0, 1);   /* button, tab, dropdown */
--motion-slow:   280ms cubic-bezier(0.16, 1, 0.3, 1); /* modal, drawer */
--motion-chart-in: 320ms cubic-bezier(0.16, 1, 0.3, 1); /* INITIAL chart load only */
```

- Hover → color/opacity/border. **Never** scale, translate, or shift layout on hover.
- Modal: backdrop fade 200ms + content fade+8px translate-y 280ms.
- Charts: animate on first render only; disable on subsequent data updates (`isAnimationActive={false}` after mount).
- Respect `prefers-reduced-motion: reduce` — set all durations to `0ms`, keep state changes.

### Focus

Every interactive element:
```css
outline: none;
box-shadow: var(--glow-gold);  /* 3px ring, --gold @ 13% */
border-color: var(--gold);
```

---

## 4. Density & Layout Grid

- **App shell:** Fixed sidebar (240px expanded · 64px collapsed) + content area.
- **Content max-width:** none — dashboards use full bleed; cap inner reading columns at 880px when text-only.
- **Breakpoints (Electron BrowserWindow):** `1280` (compact), `1440` (default), `1920` (wide), `2560` (4K).
  - Compact (≤1280): collapse sidebar, hide secondary KPI tiles, 2-col grid.
  - Default (1440): 4-col KPI grid, sidebar expanded.
  - Wide (1920+): 6-col KPI grid, denser tables.
  - 4K (2560+): scale base font 15px; keep token gaps; do not balloon.
- **Z-index scale:** sticky `10` · dropdown `20` · sidebar overlay `30` · toast `40` · modal backdrop `50` · modal `60` · lightbox `70`.

---

## 5. Component Primitives

All primitives live in `src/components/ui/` and consume the tokens above.

### 5.1 Button

Variants: `primary` (gold), `secondary` (bg-3 fill), `ghost` (transparent), `danger` (red), `icon` (square).
Sizes: `sm` (28px h), `md` (32px h, default), `lg` (40px h).

```
primary:    bg=gold      text=#0d0f14  hover=gold-hover  active=gold-dim   ring=glow-gold
secondary:  bg=bg-3      text=primary  hover=bg-4        border=border-default
ghost:      bg=transp    text=secondary hover=bg-2       border=transparent
danger:     bg=transp    text=loss     hover=loss-soft   border=loss/40%   ring=glow-danger
icon:       same as ghost, 32×32, lucide icon 16px
```

Disabled: opacity 0.45, cursor `not-allowed`, no hover.
Loading: replace label with `Loader2` 14px spinning, disable, keep width.

### 5.2 Card

```
bg: bg-2
border: 1px solid border-subtle
radius: 12px
padding: 16px
shadow: shadow-sm
```

Optional `Card.Header` (h2 title + actions row), `Card.Body`, `Card.Footer` (border-top subtle, 12px pad).
Hover-eligible cards add `hover:border-border-default transition-colors duration-150`.

### 5.3 Table (data-dense, the centerpiece)

```
Row height: 36px (default) / 32px (compact) / 40px (comfortable) — user toggleable
Header: bg-1, uppercase 11px 600, text-tertiary, sticky
Body row: bg-2, border-bottom border-subtle, hover:bg-3
Selected row: bg-bg-4, left-border 2px gold
Numeric cells: JetBrains Mono, right-aligned, tnum
Win row tint: bg overlay --win-soft 8%
Loss row tint: bg overlay --loss-soft 8%
Resizable columns (column resizer 2px wide, gold on hover)
Sort indicator: 10px chevron, gold when active
```

Expand affordance: **portal modal**, not in-row accordion (see Trades page).

### 5.4 Modal (portal)

```
Backdrop: rgba(8,10,14,0.72) + backdrop-blur(4px)
Surface: bg-3, radius 12px, shadow-lg, padding 24px (header/footer 16px)
Width: sm=480px, md=640px, lg=880px, xl=1120px, full=calc(100vw-96px)
Header: title h1, close icon-button top-right
Footer: right-aligned actions, separator border-top subtle
Enter: 280ms slow easing, fade+translateY(8px)
Exit: 150ms fast
Focus trap, Esc to close, click backdrop to close (unless dirty form)
```

### 5.5 Tabs

```
Track: border-bottom 1px border-subtle
Tab: 32px h, 12px h-padding, text-sm 500, text-tertiary
Hover: text-secondary
Active: text-primary, bottom-border 2px gold (animated 200ms)
Keyboard: ←/→ to switch, Home/End to jump
```

Use for Reports, Analytics, Settings, deep drill-downs inside Trades modal.

### 5.6 Stat / KPI Tile

```
Card variant, 16px padding
Eyebrow label: text-2xs uppercase tracking-wider text-tertiary
Value: JetBrains Mono 600, 28px/32px, color by sign
Delta row: small chevron-up/down 12px + value + period (e.g., "vs last week")
Optional sparkline: 80×24, no axes, single stroke 1.5px
Hover: border-subtle → border-default
```

### 5.7 Badge / Pill

```
Height 22px, radius 6px (sm pill = 9999px), padding 8px h
text-2xs 600 uppercase tracking-wider
Variants: gold, win, loss, neutral, info — all with --soft bg + full-color text
```

Tag pills (strategy tags) use the existing `tagColor.ts` hash mapping but on `bg-3` chips with gold border on selected.

### 5.8 Input / Select / Combobox

```
Height 32px (sm) / 36px (md, default)
bg: bg-1, border: border-default, radius 8px, padding 0 12px
text-sm, placeholder text-muted
Focus: border-gold + glow-gold
Invalid: border-loss + glow-danger
Prefix/suffix slot for icon (16px lucide)
```

Numeric inputs: `font-mono`, right-aligned, allow blank state.
Date pickers: snap to gold accent on hovered day.

### 5.9 Sidebar (Navigation)

```
Width: 240px expanded, 64px collapsed (user-toggle persists)
bg: bg-1, right-border border-subtle
Logo block: 56px tall, 16px padding — logo 32px square mark + "FugaEdge" wordmark 17/600 (FIX for "logo too small")
Nav item: 36px h, 12px h-padding, gap 12px, icon 18px (lucide), label text-sm 500
  rest: text-tertiary
  hover: text-secondary, bg-2
  active: text-primary, bg + left-border 2px gold, icon gold
Section dividers: 20px label text-2xs uppercase text-muted, 8px v-padding
Collapsed: icons only centered, tooltip on hover (right-side popover)
Footer: account chip with avatar, status dot (green if connected), kebab menu
```

### 5.10 Chart Wrapper

```tsx
<ChartCard title="..." tabs={[]} actions={...}>
  <ChartCanvas height={240}>
    <Recharts ... />
  </ChartCanvas>
</ChartCard>
```

- ResponsiveContainer **outside** memoization or window resize hits 60fps
- Tooltip: bg-4, border border-default, radius 8px, padding 8/12, mono numbers
- Grid lines: `stroke="#1e2330"` (border-subtle), `strokeDasharray="3 3"`
- Axes: text-xs text-tertiary, tick line off, axis line subtle
- Legend: 11px uppercase text-tertiary, swatches 8px radius-sm
- Disable animation after initial render (see Motion)

### 5.11 Empty State (premium, not bare)

```
Center stack inside card:
- 48px lucide icon outlined, gold @ 60%
- Headline: text-h2 text-primary
- Body: text-sm text-tertiary, max-w 360px
- Primary action button (gold)
- Optional secondary "Learn more" ghost button
- Subtle dotted grid background pattern (10% opacity gold dots)
```

### 5.12 Skeleton & Loaders

- Skeletons match the geometry they replace, bg `bg-3`, shimmer left→right 1.2s ease-in-out infinite.
- Spinner: `Loader2` lucide, 16px default, gold.
- Long-running ops use a progress bar (1px tall, gold, indeterminate slide).

### 5.13 Toast

- Bottom-right stack, 280px wide, bg-3, border-default, radius 12px, padding 12/16, shadow-md.
- Variants: info (blue bar 3px left), success (green), warning (amber), danger (red).
- Auto-dismiss 5s; pause on hover; close button.

---

## 6. Iconography

- **Library:** `lucide-react` only. No emojis. No PNG icons.
- **Sizes:** 14px (inline), 16px (button), 18px (sidebar), 20px (header), 24px (empty state), 48px (hero empty state).
- **Stroke width:** `1.75` default; `2` for high-contrast contexts; `1.5` for 24px+.
- **Color:** `currentColor` — drive via text color tokens. Never hard-code icon fill.
- **Gamification identity (goal + badge icons, v0.2.5 S6 — A4/D26):** lucide,
  gold-tinted (`text-gold` for heroes / earned, `text-gold-dim` for quieter /
  unselected), `strokeWidth 1.75` — the SAME flat single-weight register as
  utility icons, NOT a separate emoji register (the S5 OS-emoji experiment for
  goal identity was reverted at the iteration-4 live-look). Goal- and badge-
  identity icons resolve from shared name→component maps (`goals/icons.ts`,
  `badges/badgeIcons.ts`) so the pure core stays UI-free.

---

## 7. Page Templates

### 7.1 Dashboard
Hero strip of KPI tiles (Net P&L, Win rate, Avg R, Trades, Best streak, Worst streak — 6-col @ wide, 4-col default).
Below: 2-col split — Equity curve (large) + P&L by Symbol (donut/bar).
Below: 2-col split — Recent Trades (compact table, 8 rows) + Today's Plan (playbook checklist).
Sticky toolbar at top: date range chips (1W/1M/3M/YTD/ALL/Custom), strategy filter, account selector.

### 7.2 Trades
Filter bar (sticky) + virtualized table (react-window).
Row click → **portal modal** (size `xl`) with tabs: *Overview · Notes · Chart · Attachments · Tags*.
Bulk actions appear when ≥1 row selected (toolbar slides in from top inside the page, 200ms).
No in-row accordion expand — fixes the "expand rows too tall" issue.

### 7.3 Calendar
Month grid 7×6, day cell 1:1 aspect, bg by net-P&L intensity (win-soft → win at max, loss-soft → loss at max).
Day cell shows: day number top-left, trade count top-right, net P&L center (mono, signed), tiny dot row at bottom (one dot per trade, win/loss colored).
Hover: bg-3, border-gold, tooltip mini-summary.
Click → opens Trades page filtered to that date (preserves stack).
Month switcher in header, year switcher beside, "Today" ghost button.

### 7.4 Reports (tabbed, no scroll-of-death)
Tabs: *Summary · By Symbol · By Strategy · By Day-of-Week · By Time-of-Day · Risk · Exports*.
Each tab: 2- or 3-card grid + one big chart, all within the viewport.

### 7.5 Analytics (tabbed)
Tabs: *Equity · Distribution · Streaks · Drawdown · Hold Time · Slippage*.
Drill-down pattern: click any chart segment → side panel (40% width, slide from right, 280ms) with detailed breakdown table.

### 7.6 Playbook
Two-pane: left list of plays (cards stacked, 12px gap), right detail (rules, criteria, entry/exit checklist, sample trades).
Create play → modal.

### 7.7 Journal
Left rail: timeline of entries by date.
Center: rich text entry (titled), tags, mood selector (5 icons), market notes.
Right rail: linked trades for the day.

### 7.8 Import
3-step stepper centered: *Select source → Map columns → Confirm & import*.
Dropzone card (radius 12px, dashed border-default, hover border-gold).
Preview table after step 1, mapping UI with auto-detect, summary diff before commit.

### 7.9 Settings
Tabs: *Account · Appearance · Data · Risk · Shortcuts · About*.
Form rows pattern: left label (240px fixed) + right control (flex-1) + helper text below, 16px row gap.

### 7.10 Profile (v0.2.5 — A4/D24; grows by session per L18)
The release's identity surface, built incrementally (S4 identity + level + streak;
S5 goals; S6 badges; Phase D Edge Score). Layout: a two-column grid — left an
Identity card (avatar + name/handle/style/markets/bio + member-since); right the
Level card (gold ring + gold mono XP total + "N XP to next") above the Streak
card. Full-width below: the **Challenges** section (process + equity goal cards;
create modal led by preset chips) then the **Badges** wall (the whole catalog —
earned in gold, locked dimmed with a threshold hint — plus the featured-3
picker). Icons follow the §6 gamification register. NO P&L on this page except
the named L28 exception (equity preset chips + equity goal cards only).
Completion and level-up fire the gold-particle CelebrationBurst
(reduced-motion-safe).

---

## 8. Tailwind Wiring (extend, don't replace)

Add to `tailwind.config.ts → theme.extend`:

```ts
colors: {
  bg: { 0:'#0d0f14', 1:'#11141b', 2:'#161a23', 3:'#1c2230', 4:'#232a3b', inset:'#0a0c11' },
  border: { subtle:'#1e2330', DEFAULT:'#2a3142', strong:'#3a4358' },
  text: { primary:'#f3f5fa', secondary:'#c9cfdb', tertiary:'#8a94a8', muted:'#5d6678' },
  gold: { DEFAULT:'#d4af37', hover:'#e4c252', dim:'#a7892c' },
  win: { DEFAULT:'#34d399', soft:'#34d3991f' },
  loss: { DEFAULT:'#f87171', soft:'#f871711f' },
  neutral: '#94a3b8',
},
fontFamily: {
  sans: ['Inter','-apple-system','Segoe UI','system-ui','sans-serif'],
  mono: ['"JetBrains Mono"','ui-monospace','SFMono-Regular','Menlo','monospace'],
},
borderRadius: { sm:'6px', md:'8px', lg:'12px', xl:'16px' },
boxShadow: {
  sm:'0 1px 0 #00000040, 0 0 0 1px #ffffff05 inset',
  md:'0 4px 12px #00000059, 0 0 0 1px #ffffff08 inset',
  lg:'0 16px 48px #00000080, 0 0 0 1px #ffffff0a inset',
},
transitionTimingFunction: { 'out-soft':'cubic-bezier(0.2,0,0,1)', 'out-deep':'cubic-bezier(0.16,1,0.3,1)' },
transitionDuration: { 150:'150ms', 200:'200ms', 280:'280ms' },
```

Plugins: `@tailwindcss/forms` (strategy: `class`), small CSS layer for tabular-nums utility:
```css
.tnum { font-feature-settings: "tnum" 1, "zero" 1; }
```

---

## 9. Pre-Delivery Checklist (binds every PR)

- [ ] All numbers in `font-mono` + `tnum`
- [ ] Card padding 16px, page gutter 24px, card radius 12px
- [ ] Lucide icons only — no emoji, no PNG
- [ ] `cursor-pointer` on every clickable, `cursor-not-allowed` on disabled
- [ ] Hover transitions 150–300ms (`--motion-fast` / `--motion-base`)
- [ ] No layout-shifting hovers — colors/borders/opacity only
- [ ] Visible focus ring on every focusable (`--glow-gold` default)
- [ ] `prefers-reduced-motion` honored (durations → 0)
- [ ] Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text
- [ ] Empty states use the rich pattern (icon + headline + body + action), never just "No data."
- [ ] Tables: monospace right-aligned numerics, sticky header, row hover
- [ ] Charts: tooltip uses tokens, grid stroke `#1e2330`, animation off after first render
- [ ] Renders cleanly at 1280 / 1440 / 1920 / 2560 widths
- [ ] No light-mode bleed (we are dark-only)

---

## 10. Anti-Patterns (banned)

- ❌ Purple/pink gradients ("AI vibe") — gold is the only accent
- ❌ Neon, glow auras, harsh shadows
- ❌ Generic SaaS hero illustrations / 3D blobs
- ❌ Color as the sole signal (always pair with shape, sign char, or label)
- ❌ Trades list in-row accordion expand (use portal modal)
- ❌ Page-long vertical scroll for Reports/Analytics (tab it)
- ❌ Non-mono numbers anywhere
- ❌ Hard-coded hex in components — always tokens
- ❌ Mixing radii (8/10/12/14 — pick from the scale)
- ❌ `transform: scale()` on hover for cards/buttons

---

## 11. Phase E — coordinated premium visual sweep (v0.2.5, recorded target)

**This is the recorded TARGET for the Phase E sweep — not a build.** No current
surface changes until the sweep beat runs. Recorded 2026-06-13 while fresh.

**Frame (Path A deferral):** these five pieces are **ONE coordinated sweep**,
applied to every surface **together** so the app emerges coherent — NOT bolted on
piecemeal. They are interdependent: in particular **the background changes how
cards read**, so the card values below (glow / border / text contrast) were
specified against the *current flat* background and get **RE-TUNED against the
aurora in the same pass**. Applying cards and background in separate passes would
mean tuning the cards twice and shipping mismatched intermediate states. Treat
the package as atomic.

### 11.1 Unified card design system (founder-provided 2026-06-13 — verbatim)

The unified card spec, applied to **all cards app-wide** in the sweep.

- **References:** Linear / Vercel / Arc / Stripe. **Avoid:** crypto / gaming /
  neon / heavy-shadow / glassmorphism. **Feel:** premium, institutional,
  minimal, confident.
- **App background:** `#050A14` / `#071224` / `#020611`, very subtle gradient,
  no texture / no noise.
- **Card:** bg `rgba(10,15,28,0.92)`; border `1px rgba(255,255,255,0.06)`;
  radius `20px`; padding `24px`; gap `24px`; hover `translateY(-2px)` `200ms`;
  shadow `0 8px 24px rgba(0,0,0,0.20)`.
- **Per-tone top-left radial glow (felt, not seen):** green
  `rgba(34,197,94,0.10)` / red `rgba(239,68,68,0.10)` / gold
  `rgba(212,175,55,0.10)` / purple `rgba(168,85,247,0.10)`.
- **Tone borders:** green `.25` / red `.25` / gold `.25`; normal `.06`.
- **Typography:** primary `#F8FAFC` / secondary `#94A3B8` / muted `#64748B`;
  section labels `12px / 700 / uppercase / 0.08em`; titles `20px / 700`; primary
  metric `56px / 700`; secondary `18px / 600`.
- **Icon containers:** `40×40` circle, bg `rgba(255,255,255,0.04)`, per-tone
  `.12` variants.
- **Charts:** gridlines `rgba(255,255,255,0.04)`, `2px` lines, no bright axes.
- **Spacing:** sections `32px` / cards `24px` / internal `≥16px`.

### 11.2 Premium background

The founder-provided **gold-aurora-on-near-black**. **Use the SVG**
(`FugaEdge_Premium_Background.svg`), **NOT the PNG** — vector scales crisp at any
window size and stays small; raster blurs on large windows and bloats the bundle.

⚠ **Coupling:** the 11.1 card glow / border / text-contrast values were
specified against the current flat background — they are **re-tuned against this
aurora in the same sweep** (see the Frame note). Do not apply cards and
background separately.

### 11.3 Futuristic Edge Intelligence skin

The **violet / teal glow + DNA / fingerprint motif** mockup — already the
recorded §F visual target. In the sweep, the Edge Intelligence **cards / score /
radar** get the premium treatment, consistent with the 11.1 card system. (Edge
SHIPS in its build phase with clean D26-grammar UI; this is the futuristic
realization, deferred here on purpose.)

### 11.4 Sentiment icon ladder

Upgrade to the glossy **fire / sun / snowflake / ice** set (svgrepo source —
**license-check for commercial use: CC0 or owned only**). This **builds the icon
ladder for the first time** (no ladder exists today; the sentiment surfaces show
numbers + colors) and inherits the already-correct **5 = best / 1 = worst**
polarity (schema-29 flip). Per §E: `5 = fire`, `4 = fire (small/dim)`, `3 = sun`,
`2 = snowflake`, `1 = ice`.

### 11.5 Trader DNA

Archetype + confidence % + best / weak conditions. **Design-blocked** (the
archetype taxonomy + thresholds are undefined) — its own beat, lands **in or
after** the sweep once the taxonomy is ruled. The "best/weak conditions" half is
derivable from existing dimension insights; the archetype classifier is net-new.

### 11.6 Anti-pattern reconciliation (supersedes parts of §10 — within the sweep ONLY)

The §10 bans on **"Purple/pink gradients (AI vibe)"** and **"Neon, glow auras"**
were aimed at *cheap* gradients and harsh neon. The Phase E package introduces a
**controlled** violet/teal (11.3) and **felt, not seen** per-tone radial glows
(11.1, `0.10` alpha) — the premium realization those bans were protecting the
product from cheapening, not banning outright. **Within the coordinated sweep**
these supersede the two bans; **for ad-hoc / piecemeal use the §10 bans still
hold.** The `transform: scale()` ban is untouched — 11.1 hover is `translateY`,
already compliant.
