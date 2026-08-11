import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
}

export default function Card({ children, className = '', title }: CardProps) {
  return (
    <section className={`border-t border-line pt-6 ${className}`}>
      {title && (
        <h2 className="mb-5 font-display text-lg font-bold tracking-tight text-ink">{title}</h2>
      )}
      {children}
    </section>
  )
}
