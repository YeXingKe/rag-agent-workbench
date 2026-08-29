import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Search, ListFilter, FileText, X, Save, Trash2 } from 'lucide-react'
import MainLayout from '../components/layout/MainLayout'
import { useApi } from '../hooks/useApi'
import {
  knowledgeApi,
  type ChunkItem,
  type DocumentItem,
} from '../services/knowledgeApi'

const cardClass = 'rounded-2xl border border-line bg-paper-raised p-5 sm:p-6'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'
const primaryBtnClass = 'btn-primary disabled:cursor-not-allowed disabled:opacity-50'
const fieldClass =
  'w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/40'

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

function getChunkFilename(chunk: ChunkItem, documents: DocumentItem[]): string {
  const fromMeta = chunk.metadata_json?.filename
  if (typeof fromMeta === 'string' && fromMeta.trim()) {
    return fromMeta
  }
  const document = documents.find((item) => item.id === chunk.document_id)
  return document?.filename || chunk.document_id.slice(0, 8)
}

function previewContent(content: string, maxLength = 80): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength)}...`
}

export default function ChunkManagement() {
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null)
  const [draftContent, setDraftContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const {
    data: documents,
    loading: documentsLoading,
    error: documentsError,
    refetch: refetchDocuments,
  } = useApi<DocumentItem[]>(() => knowledgeApi.listDocuments(), [])

  const {
    data: chunks,
    loading: chunksLoading,
    error: chunksError,
    refetch: refetchChunks,
  } = useApi<ChunkItem[]>(
    () =>
      knowledgeApi.listChunks({
        documentId: selectedDocumentId || null,
        limit: 200,
      }),
    [selectedDocumentId],
  )

  const documentRows = documents ?? []
  const chunkRows = chunks ?? []
  const loading = documentsLoading || chunksLoading
  const loadError = documentsError || chunksError

  const filteredChunks = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) {
      return chunkRows
    }
    return chunkRows.filter((chunk) => {
      const filename = getChunkFilename(chunk, documentRows).toLowerCase()
      return (
        chunk.content.toLowerCase().includes(keyword) ||
        filename.includes(keyword) ||
        chunk.id.toLowerCase().includes(keyword)
      )
    })
  }, [chunkRows, documentRows, searchKeyword])

  const selectedChunk = useMemo(
    () => filteredChunks.find((chunk) => chunk.id === selectedChunkId) ?? null,
    [filteredChunks, selectedChunkId],
  )

  useEffect(() => {
    if (!selectedChunkId) {
      return
    }
    const stillVisible = filteredChunks.some((chunk) => chunk.id === selectedChunkId)
    if (!stillVisible) {
      setSelectedChunkId(null)
      setDraftContent('')
    }
  }, [filteredChunks, selectedChunkId])

  useEffect(() => {
    if (selectedChunk) {
      setDraftContent(selectedChunk.content)
    }
  }, [selectedChunk])

  const handleRefresh = () => {
    setActionError(null)
    setActionSuccess(null)
    void refetchDocuments()
    void refetchChunks()
  }

  const handleSelectChunk = (chunk: ChunkItem) => {
    setSelectedChunkId(chunk.id)
    setDraftContent(chunk.content)
    setActionError(null)
    setActionSuccess(null)
  }

  const handleCloseDetail = () => {
    setSelectedChunkId(null)
    setDraftContent('')
    setActionError(null)
    setActionSuccess(null)
  }

  const handleSave = async () => {
    if (!selectedChunk || saving) {
      return
    }
    const nextContent = draftContent.trim()
    if (!nextContent) {
      setActionError('切片内容不能为空')
      return
    }
    if (nextContent === selectedChunk.content) {
      setActionSuccess('内容未变化')
      return
    }

    setSaving(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      await knowledgeApi.updateChunk(selectedChunk.id, { content: nextContent })
      setActionSuccess('切片已保存')
      await refetchChunks()
    } catch (error) {
      setActionError(resolveErrorMessage(error, '保存切片失败'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedChunk || deleting) {
      return
    }
    const confirmed = window.confirm('确认删除当前切片？此操作不可恢复。')
    if (!confirmed) {
      return
    }

    setDeleting(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      await knowledgeApi.deleteChunk(selectedChunk.id)
      setSelectedChunkId(null)
      setDraftContent('')
      setActionSuccess('切片已删除')
      await refetchChunks()
    } catch (error) {
      setActionError(resolveErrorMessage(error, '删除切片失败'))
    } finally {
      setDeleting(false)
    }
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
              文本切片
            </h1>
          </div>
          <button
            type="button"
            className={ghostBtnClass}
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            刷新数据
          </button>
        </motion.div>

        {(loadError || actionError || actionSuccess) && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              loadError || actionError
                ? 'border-red-300/60 bg-red-50 text-red-700'
                : 'border-emerald-300/60 bg-emerald-50 text-emerald-700'
            }`}
          >
            {loadError
              ? `加载失败: ${loadError}`
              : actionError
                ? actionError
                : actionSuccess}
          </div>
        )}

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
                <select
                  className={`${fieldClass} appearance-none pl-9 pr-8`}
                  value={selectedDocumentId}
                  onChange={(event) => {
                    setSelectedDocumentId(event.target.value)
                    setSelectedChunkId(null)
                    setDraftContent('')
                  }}
                >
                  <option value="">全部文档</option>
                  {documentRows.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.filename}
                    </option>
                  ))}
                </select>
              </label>

              <label className="relative min-w-[180px] flex-[1.4]">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  className={`${fieldClass} pl-9`}
                  placeholder="搜索切片内容"
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                />
              </label>

              <button
                type="button"
                className={`${ghostBtnClass} shrink-0`}
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>
          </div>
        </motion.section>

        {/* 列表 + 详情：固定高度，避免列表无限撑高页面 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,0.9fr)_1.4fr]"
        >
          {/* 切片列表 */}
          <section className={`${cardClass} flex h-[560px] flex-col overflow-hidden`}>
            <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  List
                </p>
                <h3 className="font-display text-lg font-bold text-ink">切片列表</h3>
              </div>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-soft px-2 text-xs font-bold text-accent-deep">
                {filteredChunks.length}
              </span>
            </div>

            {loading ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-sm text-ink-muted">
                加载中...
              </div>
            ) : filteredChunks.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-center">
                <FileText size={28} strokeWidth={1.4} className="mb-3 text-accent" />
                <p className="text-sm text-ink-soft">暂无切片数据</p>
                <p className="mt-1 text-xs text-ink-muted">导入文档后将在此展示切分结果</p>
              </div>
            ) : (
              <div className="h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                {filteredChunks.map((chunk) => {
                  const active = chunk.id === selectedChunkId
                  return (
                    <button
                      key={chunk.id}
                      type="button"
                      onClick={() => handleSelectChunk(chunk)}
                      className={`block w-full shrink-0 rounded-xl border px-3 py-3 text-left transition-colors ${
                        active
                          ? 'border-accent/40 bg-accent-soft/40'
                          : 'border-line bg-paper hover:border-accent/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink">
                          {getChunkFilename(chunk, documentRows)}
                        </p>
                        <span className="shrink-0 text-xs text-ink-muted">#{chunk.chunk_index}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                        {previewContent(chunk.content)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-ink-muted">
                        <span>{chunk.token_count} tokens</span>
                        <span>{chunk.enabled ? '启用' : '禁用'}</span>
                        {chunk.page_number != null && <span>p.{chunk.page_number}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* 详情预览 */}
          <section className={`${cardClass} relative flex h-[560px] flex-col overflow-hidden`}>
            <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Detail
                </p>
                <h3 className="font-display text-lg font-bold text-ink">切片详情</h3>
              </div>
              <button
                type="button"
                className={ghostBtnClass}
                aria-label="关闭详情"
                onClick={handleCloseDetail}
                disabled={!selectedChunk}
              >
                <X size={14} />
                关闭
              </button>
            </div>

            <div className="grid shrink-0 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-paper px-3 py-3">
                <p className="text-xs text-ink-muted">所属文档</p>
                <p className="mt-1 truncate text-sm text-ink-soft">
                  {selectedChunk ? getChunkFilename(selectedChunk, documentRows) : '未选择'}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-paper px-3 py-3">
                <p className="text-xs text-ink-muted">元数据</p>
                <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                  {selectedChunk
                    ? JSON.stringify(selectedChunk.metadata_json || {})
                    : '—'}
                </p>
              </div>
            </div>

            <label className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
              <span className="mb-1.5 shrink-0 text-sm font-medium text-ink-soft">切片内容</span>
              <textarea
                className="h-0 min-h-0 flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/40"
                placeholder="从左侧选择一条切片后，可在此查看与编辑内容"
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                readOnly={!selectedChunk}
              />
            </label>

            {selectedChunk && (
              <div className="mt-4 flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  className={primaryBtnClass}
                  onClick={() => void handleSave()}
                  disabled={saving || deleting}
                >
                  <Save size={15} />
                  {saving ? '保存中...' : '保存修改'}
                </button>
                <button
                  type="button"
                  className={ghostBtnClass}
                  onClick={() => void handleDelete()}
                  disabled={saving || deleting}
                >
                  <Trash2 size={15} />
                  {deleting ? '删除中...' : '删除切片'}
                </button>
              </div>
            )}
          </section>
        </motion.div>
      </div>
    </MainLayout>
  )
}
