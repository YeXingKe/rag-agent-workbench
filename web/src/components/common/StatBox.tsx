import { motion } from 'framer-motion'
import { TrendingUp, type LucideIcon } from 'lucide-react'

interface StatBoxProps {
  title: string
  value: string | number
  unit?: string
  icon?: LucideIcon
  trend?: number
}

export default function StatBox({ title, value, unit = '', icon: Icon, trend }: StatBoxProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="border-t border-line pt-5"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">{title}</p>
        {Icon && <Icon size={16} className="text-accent" strokeWidth={1.75} />}
      </div>
      <div className="flex items-baseline gap-2">
        <p className="font-display text-3xl font-bold tracking-tight text-ink">{value}</p>
        {unit && <span className="text-sm text-ink-muted">{unit}</span>}
      </div>
      {typeof trend === 'number' && (
        <div className="mt-3 flex items-center gap-1 text-xs text-[#047857]">
          <TrendingUp size={12} />
          <span>{trend}% 环比</span>
        </div>
      )}
    </motion.div>
  )
}
