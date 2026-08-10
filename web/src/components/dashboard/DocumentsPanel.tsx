import { motion } from 'framer-motion'
import Card from '../common/Card'
import { FileText, Clock, TrendingUp } from 'lucide-react'
import { Document } from '../../types'

interface DocumentsPanelProps {
    documents?: Document[]
    loading?: boolean
}

export default function DocumentsPanel({ documents = [], loading = false }: DocumentsPanelProps) {
    const recentDocs = documents.slice(0, 5)

    return (
        <Card>
            <h2 className="text-xl font-bold text-slate-50 mb-6 flex items-center gap-2">
                <FileText className="text-blue-400" size={24} />
                最近文档
            </h2>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            ) : recentDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <FileText size={48} className="mb-4 opacity-50" />
                    <p>暂无文档记录</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {recentDocs.map((doc, index) => (
                        <motion.div
                            key={doc.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="group flex items-start gap-4 p-4 rounded-xl hover:bg-slate-800/50 transition-all cursor-pointer"
                        >
                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                                <FileText size={20} className="text-blue-400" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="text-slate-200 font-medium truncate mb-1">
                                    {doc.name}
                                </h3>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <Clock size={12} />
                                        {new Date(doc.uploadedAt).toLocaleDateString('zh-CN')}
                                    </span>
                                    <span>{(doc.size / 1024).toFixed(1)} KB</span>
                                    <span className="flex items-center gap-1">
                                        <TrendingUp size={12} />
                                        {doc.chunks} chunks
                                    </span>
                                </div>
                            </div>

                            <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${doc.status === 'success' ? 'bg-green-500/20 text-green-400' :
                                    doc.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                                        'bg-red-500/20 text-red-400'
                                }`}>
                                {doc.status === 'success' ? '已完成' : doc.status === 'processing' ? '处理中' : '失败'}
                            </span>
                        </motion.div>
                    ))}
                </div>
            )}
        </Card>
    )
}