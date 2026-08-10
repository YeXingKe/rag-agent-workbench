import React from 'react'

interface CardProps {
    children: React.ReactNode
    className?: string
    title?: string
}

export default function Card({ children, className = '', title }: CardProps) {
    return (
        <div className={`bg-gradient-to-br from-slate-800/50 to-slate-800/20 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-xl ${className}`}>
            {title && <h2 className="text-xl font-bold text-slate-50 mb-6">{title}</h2>}
            {children}
        </div>
    )
}
