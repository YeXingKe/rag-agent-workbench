import { useState } from 'react'
import { motion } from 'framer-motion'
import Card from '../common/Card'
import Button from '../common/Button'
import { FileText, Upload, Search, Filter } from 'lucide-react'
import { Document } from '../../types'

interface KnowledgeBoardProps {
    documents?: Document[]
}

export default function KnowledgeBoard({ documents = [] }: KnowledgeBoardProps) {
    const [searchQuery, setSearchQuery] = useState('')

    const filteredDocs = documents.filter(doc =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <Card className="min-h-[400px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-50 flex items-center gap-2">
                    <FileText className="text-blue-400" size={24} />
                    知识库概览
                </h2>
                <Button variant="primary" size="sm">
                    <Upload size={16} className="mr-2" />
                    上传文档
                </Button>
            </div>

            {/* Search Bar */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="搜索文档..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <Button variant="ghost" size="md">
                    <Filter size={18} />
                </Button>
            </div>

            {/* Content */}
            {filteredDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <FileText size={48} className="mb-4 opacity-50" />
                    <p className="text-lg">暂无文档记录</p>
                    <p className="text-sm mt-2">上传文档开始构建知识库</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredDocs.map((doc) => (
                        <motion.div
                            key={doc.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <FileText size={20} className="text-blue-400" />
                                <div>
                                    <p className="text-slate-200 font-medium">{doc.name}</p>
                                    <p className="text-slate-500 text-sm">{doc.chunks} chunks · {(doc.size / 1024).toFixed(1)} KB</p>
                                </div>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${doc.status === 'success' ? 'bg-green-500/20 text-green-400' :
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