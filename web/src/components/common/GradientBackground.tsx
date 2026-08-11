import type { ReactNode } from 'react'

interface GradientBackgroundProps {
  children: ReactNode
  className?: string
  intensity?: 'light' | 'medium' | 'strong'
}

/** 轻量氛围层：保留接口，避免旧引用报错 */
export default function GradientBackground({
  children,
  className = '',
}: GradientBackgroundProps) {
  return <div className={`relative min-h-screen ${className}`}>{children}</div>
}
