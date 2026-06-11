import type { Config } from 'tailwindcss'

// All themable colors reference CSS custom properties defined in
// src/index.css under :root (dark) and :root.light (light overrides).
// The `rgb(var(--token) / <alpha-value>)` syntax lets Tailwind keep its
// alpha modifier shorthand (e.g. `bg-bg-2/40`, `border-loss/30`).
//
// Accent colors (gold/win/loss/info/warning/danger) point to the same vars
// in both themes — they stay identical, by design.
//
// `accent-ink` is a FIXED hex value (not a var) — used as the dark-text
// color on gold/accent backgrounds so the contrast stays correct in light
// mode where bg-0 inverts to a light surface.

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Layered surfaces (var-driven, theme-aware)
        bg: {
          DEFAULT: 'rgb(var(--bg-0) / <alpha-value>)',
          0:     'rgb(var(--bg-0) / <alpha-value>)',
          1:     'rgb(var(--bg-1) / <alpha-value>)',
          2:     'rgb(var(--bg-2) / <alpha-value>)',
          3:     'rgb(var(--bg-3) / <alpha-value>)',
          4:     'rgb(var(--bg-4) / <alpha-value>)',
          inset:  'rgb(var(--bg-inset) / <alpha-value>)',
          // Table header surface — same as bg-1 in dark, slightly off-white
          // (#f8f9fb) in light so headers separate from card body.
          header: 'rgb(var(--bg-header) / <alpha-value>)',
        },
        // Borders
        border: {
          DEFAULT: 'rgb(var(--border-default) / <alpha-value>)',
          subtle:  'rgb(var(--border-subtle) / <alpha-value>)',
          strong:  'rgb(var(--border-strong) / <alpha-value>)',
        },
        // Foreground / text
        fg: {
          DEFAULT:   'rgb(var(--fg-primary) / <alpha-value>)',
          primary:   'rgb(var(--fg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--fg-secondary) / <alpha-value>)',
          tertiary:  'rgb(var(--fg-tertiary) / <alpha-value>)',
          muted:     'rgb(var(--fg-muted) / <alpha-value>)',
        },
        // Brand accent (locked, theme-independent)
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          hover:   'rgb(var(--gold-hover) / <alpha-value>)',
          dim:     'rgb(var(--gold-dim) / <alpha-value>)',
          // Fixed palette for sparse niche use (donut segments etc.) — not themed
          50:  '#faf3df',
          100: '#f4e8b8',
          200: '#ecd687',
          300: '#e0c160',
          400: '#d4af37',
          500: '#b59122',
          600: '#97751a',
          700: '#785a12',
          800: '#5a410c',
          900: '#3d2c08',
        },
        // P&L semantics (locked, theme-independent)
        win: {
          DEFAULT: 'rgb(var(--win) / <alpha-value>)',
          soft:    'rgb(var(--win) / 0.12)',
        },
        loss: {
          DEFAULT: 'rgb(var(--loss) / <alpha-value>)',
          soft:    'rgb(var(--loss) / 0.12)',
        },
        // MACD bucket palette (spec §G) — flat tokens; the v0.2.4 4-bucket
        // grid tints cells via bg-macd-{slug}/[0.12], the TierBadge idiom.
        'macd-pos-rising':  'rgb(var(--macd-pos-rising) / <alpha-value>)',
        'macd-pos-falling': 'rgb(var(--macd-pos-falling) / <alpha-value>)',
        'macd-neg-rising':  'rgb(var(--macd-neg-rising) / <alpha-value>)',
        'macd-neg-falling': 'rgb(var(--macd-neg-falling) / <alpha-value>)',
        // VWAP + EMA distance-band palettes (spec §A4 / §A5) — the designed
        // diverging ramps (RGB values in src/index.css); the Section 3 / 4
        // wrappers tint cells via bg-vwap-N/[0.12] / bg-ema-N/[0.12], the same
        // idiom as bg-macd-{slug}.
        'vwap-1': 'rgb(var(--vwap-1) / <alpha-value>)',
        'vwap-2': 'rgb(var(--vwap-2) / <alpha-value>)',
        'vwap-3': 'rgb(var(--vwap-3) / <alpha-value>)',
        'vwap-4': 'rgb(var(--vwap-4) / <alpha-value>)',
        'vwap-5': 'rgb(var(--vwap-5) / <alpha-value>)',
        'vwap-6': 'rgb(var(--vwap-6) / <alpha-value>)',
        'vwap-7': 'rgb(var(--vwap-7) / <alpha-value>)',
        'ema-1': 'rgb(var(--ema-1) / <alpha-value>)',
        'ema-2': 'rgb(var(--ema-2) / <alpha-value>)',
        'ema-3': 'rgb(var(--ema-3) / <alpha-value>)',
        'ema-4': 'rgb(var(--ema-4) / <alpha-value>)',
        'ema-5': 'rgb(var(--ema-5) / <alpha-value>)',
        'ema-6': 'rgb(var(--ema-6) / <alpha-value>)',
        // System
        neutral: 'rgb(var(--neutral) / <alpha-value>)',
        info:    'rgb(var(--info) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger:  'rgb(var(--danger) / <alpha-value>)',

        // Fixed text color for use on gold/accent backgrounds — always dark.
        // Replaces `text-bg-0` on accent buttons so contrast stays correct
        // when bg-0 inverts to a light surface in light mode.
        'accent-ink': '#0d0f14',

        // Legacy aliases — fixed hex values, kept for backwards-compat with
        // any code that hasn't been migrated. After the recent cleanup pass
        // these are unreferenced in the components/ tree. They do NOT theme.
        bgTop: '#06080c',
        bgBot: '#0d1117',
        sidebarTop: '#06080c',
        sidebarBot: '#0a0d13',
        sidebar: '#080a0f',
        // Legacy aliases — now themed via --win / --loss so any unmigrated
        // `text-green` / `bg-green/X` etc. still picks up the right value
        // in light mode (e.g. green-600 #16a34a) instead of the original
        // neon #34d399 baked-in literal. `dim` shades stay legacy hex.
        green: { DEFAULT: 'rgb(var(--win) / <alpha-value>)',  dim: '#0f3d2e' },
        red:   { DEFAULT: 'rgb(var(--loss) / <alpha-value>)', dim: '#3d1414' },
        panel: '#11141c',
        muted: '#6b7180',
        text:  '#e6e8ee',
        subtle: '#9ca3af',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        // Shadows are themed via CSS vars (see src/index.css). Dark mode
        // uses a rim-inset for the "framed" look; light mode uses a soft
        // drop shadow for the "lifted card" look. Same Tailwind classes
        // resolve to different visuals per theme automatically.
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        'glow-gold':   '0 0 0 3px rgba(212,175,55,0.13)',
        'glow-danger': '0 0 0 3px rgba(239,68,68,0.20)',
      },
      // textColor extension — overrides `text-gold` and `text-win` (with
      // their alpha variants) to use the themed --gold-text / --win-text
      // tokens. Background gold/win (bg-gold, bg-win-soft etc.), borders
      // (border-gold, border-win), and rings still resolve via the regular
      // colors.gold / colors.win so saturated accent surfaces and badges
      // stay constant across themes — only TEXT darkens in light mode for
      // contrast against white card surfaces.
      textColor: {
        gold: 'rgb(var(--gold-text) / <alpha-value>)',
        win:  'rgb(var(--win-text) / <alpha-value>)',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.2, 0, 0, 1)',
        'out-deep': 'cubic-bezier(0.16, 1, 0.3, 1)',
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
        280: '280ms',
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'modal-in': 'modal-in 280ms cubic-bezier(0.16,1,0.3,1)',
        'shimmer': 'shimmer 1.2s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
