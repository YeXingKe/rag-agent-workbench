import { useRef, useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Search, Minus, Plus, PackageOpen, Settings2 } from 'lucide-react'
import MainLayout from '../components/layout/MainLayout'
import {
  retrievalApi,
  type RetrievalHitItem,
} from '../services/retrievalApi'

const cardClass = 'rounded-2xl border border-line bg-paper-raised p-5 sm:p-6'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'
const primaryBtnClass = 'btn-primary disabled:cursor-not-allowed disabled:opacity-50'
const fieldClass =
  'w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/40'

const MIN_TOP_K = 1
const MAX_TOP_K = 20

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error != null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } }).response
    const detail = response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string }
      if (typeof first?.msg === 'string') {
        return first.msg
      }
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function formatScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) {
    return '—'
  }
  return Number(value).toFixed(4)
}

function formatRank(value: number | null | undefined): string {
  if (value == null) {
    return '—'
  }
  return `#${value}`
}

function sourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'hybrid':
      return '混合'
    case 'vector':
      return '向量'
    case 'bm25':
      return 'BM25'
    case 'postgres_fallback':
      return 'Postgres'
    default:
      return source || '未知'
  }
}

export default function RetrievalDebug() {
  const searchingRef = useRef(false)
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [hits, setHits] = useState<RetrievalHitItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastQuery, setLastQuery] = useState('')

  const handleSearch = async () => {
    if (searchingRef.current) {
      return
    }

    const cleanedQuery = query.trim()
    if (!cleanedQuery) {
      setError('请输入检索问题或关键词')
      return
    }

    searchingRef.current = true
    setSearching(true)
    setError(null)

    try {
      const response = await retrievalApi.search({
        query: cleanedQuery,
        top_k: topK,
      })
      setHits(response.items ?? [])
      setLastQuery(cleanedQuery)
      setHasSearched(true)
    } catch (searchError) {
      setHits([])
      setHasSearched(true)
      setError(resolveErrorMessage(searchError, '检索失败'))
    } finally {
      searchingRef.current = false
      setSearching(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void handleSearch()
    }
  }

  const handleRefresh = () => {
    setError(null)
    if (lastQuery) {
      setQuery(lastQuery)
      void handleSearch()
      return
    }
    setHits([])
    setHasSearched(false)
  }

  return (
    <MainLayout>
      <div className="flex w-full flex-col gap-4 lg:gap-5">
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
          <button
            type="button"
            className={ghostBtnClass}
            onClick={handleRefresh}
            disabled={searching}
          >
            <RefreshCw size={15} className={searching ? 'animate-spin' : ''} />
            刷新数据
          </button>
        </motion.div>

        {error && (
          <div className="rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

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
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={searching}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-paper">
                  <button
                    type="button"
                    className="px-3 py-2 text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink disabled:opacity-50"
                    onClick={() => setTopK((v) => Math.max(MIN_TOP_K, v - 1))}
                    aria-label="减少条数"
                    disabled={searching}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-10 border-x border-line px-3 py-2 text-center text-sm font-semibold text-ink">
                    {topK}
                  </span>
                  <button
                    type="button"
                    className="px-3 py-2 text-ink-muted transition-colors hover:bg-paper-raised hover:text-ink disabled:opacity-50"
                    onClick={() => setTopK((v) => Math.min(MAX_TOP_K, v + 1))}
                    aria-label="增加条数"
                    disabled={searching}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  className={`${primaryBtnClass} flex-1 sm:flex-none`}
                  onClick={() => void handleSearch()}
                  disabled={searching}
                >
                  <Search size={15} className={searching ? 'animate-pulse' : ''} />
                  {searching ? '检索中...' : '开始检索'}
                </button>
              </div>
            </div>
          </div>
        </motion.section>

        {/* 召回结果：固定高度内部滚动 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className={`${cardClass} flex h-[560px] flex-col overflow-hidden`}
        >
          <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Results
              </p>
              <h3 className="font-display text-lg font-bold text-ink">召回结果</h3>
              {hasSearched && lastQuery && (
                <p className="mt-1 text-xs text-ink-muted">
                  查询：{lastQuery}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-deep">
                {hits.length} 条
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

          {!hasSearched ? (
            <div className="flex h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-paper-raised">
                <PackageOpen size={28} strokeWidth={1.4} className="text-accent" />
              </div>
              <p className="text-sm text-ink-soft">输入检索问题以查看召回结果</p>
              <p className="mt-1 text-xs text-ink-muted">
                结果将展示来源文档、分数、排名与切片元数据
              </p>
            </div>
          ) : searching ? (
            <div className="flex h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-sm text-ink-muted">
              检索中...
            </div>
          ) : hits.length === 0 ? (
            <div className="flex h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-center">
              <PackageOpen size={28} strokeWidth={1.4} className="mb-3 text-accent" />
              <p className="text-sm text-ink-soft">未召回相关内容</p>
              <p className="mt-1 text-xs text-ink-muted">可换个关键词，或先确认文档已入库</p>
            </div>
          ) : (
            <div className="h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
              {hits.map((hit, index) => (
                <article
                  key={`${hit.chunk_id ?? 'hit'}-${index}`}
                  className="rounded-xl border border-line bg-paper p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {hit.file_name || '未知文件'}
                        {hit.chunk_index != null ? ` · #${hit.chunk_index}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {hit.section_title || hit.section_type || '无章节信息'}
                        {hit.page_number != null ? ` · p.${hit.page_number}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-deep">
                      {sourceLabel(hit.retrieval_source)}
                    </span>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                    {hit.content}
                  </p>

                  <div className="mt-3 grid gap-2 text-[11px] text-ink-muted sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-line bg-paper-raised px-2.5 py-2">
                      <p>综合分</p>
                      <p className="mt-0.5 font-semibold text-ink">{formatScore(hit.score)}</p>
                    </div>
                    <div className="rounded-lg border border-line bg-paper-raised px-2.5 py-2">
                      <p>向量 / BM25 / 融合</p>
                      <p className="mt-0.5 font-semibold text-ink">
                        {formatScore(hit.vector_score)} / {formatScore(hit.bm25_score)} /{' '}
                        {formatScore(hit.fused_score)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-line bg-paper-raised px-2.5 py-2">
                      <p>排名 V / B / F</p>
                      <p className="mt-0.5 font-semibold text-ink">
                        {formatRank(hit.rank_vector)} / {formatRank(hit.rank_bm25)} /{' '}
                        {formatRank(hit.rank_fused)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-line bg-paper-raised px-2.5 py-2">
                      <p>切分 / 解析</p>
                      <p className="mt-0.5 truncate font-semibold text-ink">
                        {hit.splitter_name || '—'} / {hit.parser_name || '—'}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </motion.section>
      </div>
    </MainLayout>
  )
}
