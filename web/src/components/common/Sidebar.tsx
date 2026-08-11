import { motion } from 'framer-motion'
import {
  Home,
  Upload,
  FileText,
  List,
  LineChart,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Leaf,
  type LucideIcon,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useUIStore } from '../../store/uiStore'

interface MenuItem {
  id: string
  icon: LucideIcon
  label: string
  path: string
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', icon: Home, label: '工作台', path: '/' },
  { id: 'upload', icon: Upload, label: '知识导入', path: '/upload' },
  { id: 'documents', icon: FileText, label: '文档库', path: '/documents' },
  { id: 'chunks', icon: List, label: '文本切片', path: '/chunks' },
  { id: 'retrieval', icon: LineChart, label: '召回试验', path: '/retrieval' },
  { id: 'agent', icon: MessageSquare, label: '智能问答', path: '/agent' },
]

export default function Sidebar() {
  const location = useLocation()
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  const isGlass = theme === 'glass'

  return (
    <div className="theme-surface flex h-full flex-col border-r border-line bg-paper-raised/90">
      <div className={`flex items-center gap-3 px-4 pt-8 ${sidebarOpen ? 'justify-between' : 'flex-col gap-4'}`}>
        <Link to="/" className={`flex min-w-0 items-center gap-3 ${sidebarOpen ? '' : 'justify-center'}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-sm font-bold tracking-tight text-accent-deep font-display">
            RA
          </span>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="min-w-0"
            >
              <p className="font-display text-base font-bold leading-tight tracking-tight text-ink">
                RAG Agent
              </p>
              <p className="truncate text-xs text-ink-muted">Workbench</p>
            </motion.div>
          )}
        </Link>

        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-paper hover:text-ink"
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      <nav className="mt-10 flex flex-1 flex-col gap-1 px-3">
        {menuItems.map((item) => {
          const active = location.pathname === item.path
          return (
            <Link
              key={item.id}
              to={item.path}
              title={item.label}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent-soft text-accent-deep'
                  : 'text-ink-soft hover:bg-paper hover:text-ink'
              } ${sidebarOpen ? '' : 'justify-center px-2'}`}
            >
              <item.icon
                size={18}
                className={active ? 'text-accent-deep' : 'text-ink-muted group-hover:text-ink'}
              />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className={`mt-auto space-y-3 px-3 pb-5 ${sidebarOpen ? 'px-4' : ''}`}>
        <button
          type="button"
          onClick={toggleTheme}
          title={isGlass ? '切换到纸片感主题' : '切换到玻璃科技感主题'}
          className={`flex w-full items-center gap-2.5 rounded-xl border border-line bg-paper px-3 py-2.5 text-sm font-medium text-ink-soft transition-all hover:border-accent/35 hover:text-ink ${
            sidebarOpen ? '' : 'justify-center px-2'
          }`}
        >
          {isGlass ? (
            <Leaf size={16} className="shrink-0 text-accent" />
          ) : (
            <Sparkles size={16} className="shrink-0 text-accent" />
          )}
          {sidebarOpen && (
            <span className="truncate">{isGlass ? '纸片感主题' : '玻璃科技感'}</span>
          )}
        </button>

        {sidebarOpen && (
          <p className="px-1 text-[11px] leading-relaxed text-ink-muted">
            文档入库 · 切分检索 · Agent 对话
          </p>
        )}
      </div>
    </div>
  )
}
