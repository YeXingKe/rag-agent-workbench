import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import MainLayout from '../components/layout/MainLayout'
import StatBox from '../components/common/StatBox'
import Card from '../components/common/Card'
import { FileText, Layers, MessageSquare, BarChart3 } from 'lucide-react'
import { DashboardStats } from '../types'

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

export default function Dashboard() {
    const [stats, setStats] = useState<DashboardStats>({
        totalDocuments: 0,
        totalChunks: 0,
        totalSessions: 0,
        systemHealth: 'healthy',
    })

    useEffect(() => {
        // 模拟 API 调用
        setStats({
            totalDocuments: 24,
            totalChunks: 128,
            totalSessions: 12,
            systemHealth: 'healthy',
        })
    }, [])

    return (
        <MainLayout>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                    RAG Agent Studio
                </h1>
                <p className="text-slate-400">
                    从文档输入库 / OCR 图片表格识别到 Agent 源数据对话的端到端解决方案
                </p>
            </motion.div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
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
                        value={stats.systemHealth === 'healthy' ? '正常' : '异常'}
                        icon={BarChart3}
                    />
                </motion.div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <Card title="最近文档">
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                            <FileText size={48} className="mb-4 opacity-50" />
                            <p>暂无文档记录</p>
                        </div>
                    </Card>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <Card title="最近会话">
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                            <MessageSquare size={48} className="mb-4 opacity-50" />
                            <p>暂无会话记录</p>
                        </div>
                    </Card>
                </motion.div>
            </div>
        </MainLayout>
    )
}
