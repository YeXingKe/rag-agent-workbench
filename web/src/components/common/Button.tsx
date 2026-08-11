import type { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  className = '',
  disabled = false,
  type = 'button',
}: ButtonProps) {
  const baseClass =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed'

  const variantClass = {
    primary:
      'border border-accent/30 bg-[var(--btn-bg)] text-[var(--btn-text)] hover:bg-[var(--btn-bg-hover)] hover:border-accent/45',
    secondary: 'bg-paper-raised hover:bg-paper text-ink border border-line',
    ghost: 'bg-transparent hover:bg-paper text-ink-soft border border-transparent hover:border-line',
  }

  const sizeClass = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    >
      {children}
    </button>
  )
}
