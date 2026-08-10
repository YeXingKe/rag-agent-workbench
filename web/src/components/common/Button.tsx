import React from 'react'

interface ButtonProps {
    children: React.ReactNode
    variant?: 'primary' | 'secondary' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    onClick?: () => void
    className?: string
    disabled?: boolean
}

export default function Button({
    children,
    variant = 'primary',
    size = 'md',
    onClick,
    className = '',
    disabled = false,
}: ButtonProps) {
    const baseClass = 'font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'

    const variantClass = {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white',
        secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100',
        ghost: 'bg-transparent hover:bg-slate-700/50 text-slate-300 border border-slate-700',
    }

    const sizeClass = {
        sm: 'px-3 py-1 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
    }

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${baseClass} ${variantClass[variant]} ${sizeClass[size]} ${className}`}
        >
            {children}
        </button>
    )
}
