import { motion } from 'framer-motion'
import StatBox from '../common/StatBox'
import { FileText, Layers, MessageSquare, BarChart3 } from 'lucide-react'
import { DashboardStats } from '../../types'

interface OverviewProps {
    stats: DashboardStats
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2,
        },
    },
}

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: 'easeOut' },
    },
}

export default function Overview({ stats }: OverviewProps) {
    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
            <motion.div variants={itemVariants}>
                <StatBox
                    title="知识文档"
                    value={stats.totalDocuments}
                    unit="已入库"
                    icon={FileText}
                    trend={12}
                />
            </motion.div>
            <motion.div variants={itemVariants}>
                <StatBox
                    title="总 Chunk"
                    value={stats.totalChunks}
                    unit="已分割"
                    icon={Layers}
                    trend={8}
                />
            </motion.div>
            <motion.div variants={itemVariants}>
                <StatBox
                    title="最近会话"
                    value={stats.totalSessions}
                    unit="已记录"
                    icon={MessageSquare}
                    trend={15}
                />
            </motion.div>
            <motion.div variants={itemVariants}>
                <StatBox
                    title="系统检查"
                    value={stats.systemHealth === 'healthy' ? '正常' : stats.systemHealth === 'warning' ? '警告' : '异常'}
                    icon={BarChart3}
                />
            </motion.div>
        </motion.div>
    )
}