import { useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutDashboard, FileText, Layers, MessageSquare, LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

interface MenuItem {
    id: string
    icon: LucideIcon
    label: string
    path: string
}

interface SidebarProps {
    isOpen: boolean
}

const menuItems: MenuItem[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: '总览看板', path: '/' },
    { id: 'documents', icon: FileText, label: '文档管理', path: '/documents' },
    { id: 'chunks', icon: Layers, label: 'Chunk 管理', path: '/chunks' },
    { id: 'agent', icon: MessageSquare, label: 'Agent 对话', path: '/agent' },
]

export default function Sidebar({ isOpen }: SidebarProps) {
    const location = useLocation()

    return (
        <div className="h-full bg-gradient-to-b from-slate-800 to-slate-900 border-r border-slate-700/50 p-4 space-y-4">
            <motion.div
                initial={false}
                animate={{ justifyContent: isOpen ? 'flex-start' : 'center' }}
                className="flex items-center gap-3 px-4 py-3 mb-8 rounded-lg bg-blue-500/10 border border-blue-500/20"
            >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
                    RA
                </div>
                {isOpen && <span className="text-sm font-bold text-blue-400 truncate">RAG Agent</span>}
            </motion.div>

            <nav className="space-y-2">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path
                    return (
                        <Link key={item.id} to={item.path}>
                            <motion.div
                                whileHover={{ x: 4 }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                                        ? 'bg-blue-500/20 border-l-2 border-blue-500 text-blue-300'
                                        : 'text-slate-400 hover:bg-slate-700/50'
                                    }`}
                            >
                                <item.icon size={20} />
                                {isOpen && <span className="text-sm font-medium truncate">{item.label}</span>}
                            </motion.div>
                        </Link>
                    )
                })}
            </nav>
        </div>
    )
}
