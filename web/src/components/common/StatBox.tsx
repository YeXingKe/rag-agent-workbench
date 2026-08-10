import { motion } from 'framer-motion'
import { TrendingUp, LucideIcon } from 'lucide-react'

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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -8 }}
            className="group relative overflow-hidden bg-gradient-to-br from-slate-800/50 to-slate-800/20 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <p className="text-slate-400 text-sm font-medium">{title}</p>
                        <div className="flex items-baseline gap-2 mt-2">
                            <h3 className="text-3xl font-bold text-slate-50">{value}</h3>
                            {unit && <span className="text-slate-500 text-sm">{unit}</span>}
                        </div>
                    </div>
                    {Icon && (
                        <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                            <Icon size={24} className="text-blue-400" />
                        </div>
                    )}
                </div>

                {trend && (
                    <div className="flex items-center gap-1 text-sm text-green-400">
                        <TrendingUp size={14} />
                        <span>{trend}% 环比增长</span>
                    </div>
                )}
            </div>

            <div className="absolute inset-0 border border-transparent group-hover:border-blue-500/20 rounded-2xl transition-all duration-300" />
        </motion.div>
    )
}
