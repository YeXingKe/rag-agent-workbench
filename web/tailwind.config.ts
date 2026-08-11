import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          muted: 'var(--ink-muted)',
        },
        paper: {
          DEFAULT: 'var(--paper)',
          raised: 'var(--paper-raised)',
        },
        line: 'var(--line)',
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          deep: 'var(--accent-deep)',
        },
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['Syne', 'Figtree', 'sans-serif'],
      },
      boxShadow: {
        panel: 'var(--surface-shadow)',
      },
    },
  },
  plugins: [],
} satisfies Config
