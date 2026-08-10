import React from 'react'

interface GradientBackgroundProps {
    children: React.ReactNode
    className?: string
    intensity?: 'light' | 'medium' | 'strong'
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
    children,
    className = '',
    intensity = 'medium'
}) => {
    const glowIntensity = {
        light: 'opacity-40',
        medium: 'opacity-60',
        strong: 'opacity-80',
    }

    return (
        <div className={`relative w-full min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 ${className}`}>
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className={`absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-glow ${glowIntensity[intensity]}`} />
                <div className={`absolute top-1/4 right-1/4 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulseGlow ${glowIntensity[intensity]}`} />
                <div className={`absolute bottom-1/3 left-1/4 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-glow ${glowIntensity[intensity]} [animation-delay:1s]`} />
            </div>
            <div className="relative z-10">{children}</div>
        </div>
    )
}

export default GradientBackground
