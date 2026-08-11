import { useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Search, Minus, Plus, PackageOpen, Settings2 } from 'lucide-react'
import MainLayout from '../components/layout/MainLayout'

const cardClass = 'rounded-2xl border border-line bg-paper-raised p-5 sm:p-6'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink'
const primaryBtnClass = 'btn-primary'
const fieldClass =
  'w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/40'

export default function RetrievalDebug() {
  const [topK, setTopK] = useState(5)

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
              召回试验
            </h1>
          </div>
          <button type="button" className={ghostBtnClass}>
            <RefreshCw size={15} />
            刷新数据
          </button>
        </motion.div>

        {/* 检索调试台 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className={`${cardClass} shrink-0`}
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Retrieval Debugger
              </p>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                检索链路调试台
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                直接命中后端{' '}
                <code className="rounded bg-paper px-1.5 py-0.5 text-[12px] text-accent-deep">
                  /retrieval/search
                </code>
                ，查看 Milvus 向量检索、BM25 词法检索与 RRF 融合后的最终召回结果，并对照来源、分数、排名与切分元数据。
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:max-w-md xl:w-[420px]">
              <label className="relative block">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  className={`${fieldClass} pl-9`}
                  placeholder="输入检索问题或关键词"
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-paper">
                  <button
                    type="button"
                    className="px-3 py-2 text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink"
                    onClick={() => setTopK((v) => Math.max(1, v - 1))}
                    aria-label="减少条数"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-10 border-x border-line px-3 py-2 text-center text-sm font-semibold text-ink">
                    {topK}
                  </span>
                  <button
                    type="button"
                    className="px-3 py-2 text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink"
                    onClick={() => setTopK((v) => Math.min(50, v + 1))}
                    aria-label="增加条数"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <button type="button" className={`${primaryBtnClass} flex-1 sm:flex-none`}>
                  <Search size={15} />
                  开始检索
                </button>
              </div>
            </div>
          </div>
        </motion.section>

        {/* 召回结果 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className={`${cardClass} flex min-h-[360px] flex-1 flex-col`}
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Results
              </p>
              <h3 className="font-display text-lg font-bold text-ink">召回结果</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-deep">
                0 条
              </span>
              <button
                type="button"
                aria-label="结果视图设置"
                className="rounded-xl border border-line bg-paper p-2 text-ink-muted transition-colors hover:border-accent/30 hover:text-ink"
              >
                <Settings2 size={15} />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-paper-raised">
              <PackageOpen size={28} strokeWidth={1.4} className="text-accent" />
            </div>
            <p className="text-sm text-ink-soft">输入检索问题以查看召回结果</p>
            <p className="mt-1 text-xs text-ink-muted">
              结果将展示来源文档、分数、排名与切片元数据
            </p>
          </div>
        </motion.section>
      </div>
    </MainLayout>
  )
}
