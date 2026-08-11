import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { RefreshCw, ArrowUpRight, PackageOpen } from 'lucide-react'
import MainLayout from '../components/layout/MainLayout'

const stats = [
  { label: '知识文档', value: '0', hint: '已入库文档总数' },
  { label: '文本切片', value: '0', hint: '当前文件切分总量' },
  { label: '最近会话', value: '0', hint: '已记录的智能问答' },
  { label: '后端状态', value: '检查中', hint: 'Postgres / Redis / Milvus 健康度探测' },
]

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-ink-muted">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-line bg-paper">
        <PackageOpen size={28} strokeWidth={1.4} className="text-accent" />
      </div>
      <p className="text-sm text-ink-soft">{text}</p>
    </div>
  )
}

export default function Dashboard() {
  return (
    <MainLayout>
      <div className="flex min-h-full w-full flex-1 flex-col gap-4 lg:gap-5">
        {/* 页头 */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex shrink-0 flex-wrap items-end justify-between gap-4 rounded-2xl border border-line bg-paper-raised px-5 py-4 sm:px-6"
        >
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
              Workspace
            </p>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              工作台
            </h1>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink"
          >
            <RefreshCw size={15} />
            刷新数据
          </button>
        </motion.div>

        {/* 产品横幅 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="relative shrink-0 overflow-hidden rounded-2xl border border-accent/15 bg-accent-soft/40 px-5 py-6 sm:px-7 sm:py-7"
        >
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-10 h-24 w-24 rounded-full border border-accent/20 bg-paper-raised/50" />

          <div className="relative grid gap-6 lg:grid-cols-[1.5fr_auto] lg:items-end">
            <div className="max-w-4xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                RAG Product Surface
              </p>
              <h2 className="font-display text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl lg:text-[26px] lg:leading-snug">
                从知识导入 / OCR 图片表格识别、文本切片观测到智能问答溯源，前后端链路已全部打通
                <span className="text-accent">【全栈 AI 开发工程化能力】</span>
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">
                这里汇聚文档、检索、会话与系统面板的核心状态。你可以从工作台进入任意板块，直接进行知识导入、切片检查、召回试验和对话回放。
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:flex-col lg:items-stretch">
              <Link
                to="/upload"
                className="btn-primary"
              >
                开始知识导入
                <ArrowUpRight size={15} />
              </Link>
              <Link
                to="/agent"
                className="inline-flex items-center justify-center rounded-xl border border-line bg-paper-raised px-5 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink"
              >
                打开智能问答
              </Link>
            </div>
          </div>
        </motion.section>

        {/* 指标 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          {stats.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-line bg-paper-raised px-4 py-4 sm:px-5 sm:py-5"
            >
              <p className="text-sm text-ink-muted">{item.label}</p>
              <p className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:mt-3 sm:text-3xl">
                {item.value}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">{item.hint}</p>
            </div>
          ))}
        </motion.div>

        {/* 最近列表：占满剩余高度 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16 }}
          className="grid min-h-[280px] flex-1 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2"
        >
          <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-paper-raised p-5 sm:p-6">
            <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Documents
                </p>
                <h3 className="font-display text-lg font-bold text-ink">最近文档</h3>
              </div>
              <Link
                to="/documents"
                className="text-sm font-medium text-accent-deep transition-colors hover:text-accent"
              >
                查看全部
              </Link>
            </div>
            <EmptyState text="暂无文档数据" />
          </section>

          <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-paper-raised p-5 sm:p-6">
            <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Sessions
                </p>
                <h3 className="font-display text-lg font-bold text-ink">最近会话</h3>
              </div>
              <Link
                to="/agent"
                className="text-sm font-medium text-accent-deep transition-colors hover:text-accent"
              >
                进入问答
              </Link>
            </div>
            <EmptyState text="暂无会话记录" />
          </section>
        </motion.div>
      </div>
    </MainLayout>
  )
}
