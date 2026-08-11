export type AppTheme = 'paper' | 'glass'

export const themeLabels: Record<AppTheme, string> = {
  paper: '纸片感',
  glass: '玻璃科技感',
}

export const colors = {
  bg: {
    base: 'var(--paper)',
    elevated: 'var(--paper-raised)',
    hover: 'var(--accent-soft)',
  },
  text: {
    primary: 'var(--ink)',
    secondary: 'var(--ink-soft)',
    muted: 'var(--ink-muted)',
  },
  accent: {
    main: 'var(--accent)',
    soft: 'var(--accent-soft)',
    deep: 'var(--accent-deep)',
  },
  status: {
    success: '#047857',
    warning: '#b45309',
    error: '#b91c1c',
    info: 'var(--accent)',
  },
} as const
