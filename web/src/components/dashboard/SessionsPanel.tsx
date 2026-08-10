import { motion } from 'framer-motion'
import Card from '../common/Card'
import { MessageSquare, Clock, User } from 'lucide-react'
import { Session } from '../../types'

interface SessionsPanelProps {
    sessions?: Session[]
    loading?: boolean
}

export default function SessionsPanel({ sessions = [], loading = false }: SessionsPanelProps) {
    const recentSessions = sessions.slice(0, 5)

    return (
        <Card>
            <h2 className="text-xl font-bold text-slate-50 mb-6 flex items-center gap-2">
                <MessageSquare className="text-cyan-400" size={24} />
                最近会话
            </h2>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
                </div>
            ) : recentSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <MessageSquare size={48} className="mb-4 opacity-50" />
                    <p>暂无会话记录</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {recentSessions.map((session, index) => (
                        <motion.div
                            key={session.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="group flex items-start gap-4 p-4 rounded-xl hover:bg-slate-800/50 transition-all cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                                <MessageSquare size={20} className="text-cyan-400" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-slate-200 font-medium truncate mb-1">
                                    {session.title}
                                </h3>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Clock size={12} />
                                        {new Date(session.updatedAt).toLocaleDateString('zh-CN')}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <User size={12} />
                                        用户
                                    </span>
                                </div>
                            </div>

                            <div className="text-xs text-slate-500">
                                {new Date(session.updatedAt).toLocaleTimeString('zh-CN', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </Card>
    )
}