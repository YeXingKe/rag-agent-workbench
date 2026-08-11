import { motion } from 'framer-motion'
import { RefreshCw, Search, ListFilter, FileText, X } from 'lucide-react'
import MainLayout from '../components/layout/MainLayout'

const cardClass = 'rounded-2xl border border-line bg-paper-raised p-5 sm:p-6'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink'
const fieldClass =
  'w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/40'

export default function ChunkManagement() {
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
              文本切片
            </h1>
          </div>
          <button type="button" className={ghostBtnClass}>
            <RefreshCw size={15} />
            刷新数据
          </button>
        </motion.div>

        {/* 观测与筛选 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className={`${cardClass} shrink-0`}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Chunk Explorer
              </p>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                切分结果观测与编辑
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                支持按文档过滤、全文搜索、查看元数据，并直接编辑切片内容，便于验证切分质量与溯源字段。
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto xl:max-w-xl">
              <label className="relative min-w-[140px] flex-1">
                <ListFilter
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <select className={`${fieldClass} appearance-none pl-9 pr-8`} defaultValue="全部文档">
                  <option>全部文档</option>
                  <option>default</option>
                </select>
              </label>

              <label className="relative min-w-[180px] flex-[1.4]">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input className={`${fieldClass} pl-9`} placeholder="搜索切片内容" />
              </label>

              <button type="button" className={`${ghostBtnClass} shrink-0`}>
                <RefreshCw size={14} />
                刷新
              </button>
            </div>
          </div>
        </motion.section>

        {/* 列表 + 详情 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="grid min-h-[420px] flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,0.9fr)_1.4fr]"
        >
          {/* 切片列表 */}
          <section className={`${cardClass} flex min-h-0 flex-col`}>
            <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  List
                </p>
                <h3 className="font-display text-lg font-bold text-ink">切片列表</h3>
              </div>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-soft px-2 text-xs font-bold text-accent-deep">
                0
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-center">
              <FileText size={28} strokeWidth={1.4} className="mb-3 text-accent" />
              <p className="text-sm text-ink-soft">暂无切片数据</p>
              <p className="mt-1 text-xs text-ink-muted">导入文档后将在此展示切分结果</p>
            </div>
          </section>

          {/* 详情预览 */}
          <section className={`${cardClass} relative flex min-h-0 flex-col`}>
            <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Detail
                </p>
                <h3 className="font-display text-lg font-bold text-ink">切片详情</h3>
              </div>
              <button type="button" className={ghostBtnClass} aria-label="关闭详情">
                <X size={14} />
                关闭
              </button>
            </div>

            <div className="grid shrink-0 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-paper px-3 py-3">
                <p className="text-xs text-ink-muted">所属文档</p>
                <p className="mt-1 text-sm text-ink-soft">未选择</p>
              </div>
              <div className="rounded-xl border border-line bg-paper px-3 py-3">
                <p className="text-xs text-ink-muted">元数据</p>
                <p className="mt-1 text-sm text-ink-soft">—</p>
              </div>
            </div>

            <label className="mt-4 flex min-h-0 flex-1 flex-col">
              <span className="mb-1.5 text-sm font-medium text-ink-soft">切片内容</span>
              <textarea
                className="min-h-[180px] flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/40"
                placeholder="从左侧选择一条切片后，可在此查看与编辑内容"
                readOnly
              />
            </label>
          </section>
        </motion.div>
      </div>
    </MainLayout>
  )
}
