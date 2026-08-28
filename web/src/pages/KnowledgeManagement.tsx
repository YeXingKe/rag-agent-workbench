import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { RefreshCw, Upload, FilePlus2, Layers, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import MainLayout from '../components/layout/MainLayout'
import { useApi } from '../hooks/useApi'
import { knowledgeApi, type DocumentItem } from '../services/knowledgeApi'
import { formatDate, formatFileSize } from '../utils/formatters'

const tableHeaders = ['文件名', '知识库', '类型', 'Chunks', '大小', '更新时间', '操作']

const cardClass = 'rounded-2xl border border-line bg-paper-raised p-5 sm:p-6'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'
const primaryBtnClass = 'btn-primary'

export default function KnowledgeManagement() {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const {
    data: documents,
    loading,
    error,
    refetch,
  } = useApi<DocumentItem[]>(() => knowledgeApi.listDocuments(), [])

  const rows = documents ?? []

  const handleDelete = async (id: string) => {
    if (deletingId) {
      return
    }
    setDeletingId(id)
    try {
      await knowledgeApi.deleteDocument(id)
      refetch()
    } catch (deleteError) {
      console.error(deleteError)
    } finally {
      setDeletingId(null)
    }
  }

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
              文档库
            </h1>
          </div>
          <button
            type="button"
            className={ghostBtnClass}
            onClick={() => void refetch()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            刷新数据
          </button>
        </motion.div>

        {error && (
          <div className="rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
            加载文档列表失败: {error}
          </div>
        )}

        {/* 入库与索引 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className={`${cardClass} shrink-0`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Ingestion Pipeline
              </p>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                文档入库与索引重建
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                支持文件上传、纯文本导入、切分策略选择与索引重建。写入结果会同步到文档库列表和文本切片页。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/chunks" className={ghostBtnClass}>
                <Layers size={15} />
                文本切片
              </Link>
              <Link to="/upload" className={ghostBtnClass}>
                <FilePlus2 size={15} />
                纯文本导入
              </Link>
              <Link to="/upload" className={primaryBtnClass}>
                <Upload size={15} />
                上传文件
              </Link>
            </div>
          </div>
        </motion.section>

        {/* 文档列表 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className={`${cardClass} flex min-h-[360px] flex-1 flex-col`}
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Documents
              </p>
              <h3 className="font-display text-lg font-bold text-ink">知识文档列表</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-deep">
                {rows.length} 份文档
              </span>
              <button
                type="button"
                aria-label="列表设置"
                className="rounded-xl border border-line bg-paper p-2 text-ink-muted transition-colors hover:border-accent/30 hover:text-ink"
              >
                <Settings2 size={15} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-paper">
                <tr>
                  {tableHeaders.map((header) => (
                    <th
                      key={header}
                      className="border-b border-line px-4 py-3 text-xs font-semibold tracking-wide text-ink-muted"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableHeaders.length}
                      className="px-4 py-20 text-center text-ink-muted"
                    >
                      {loading ? '加载中...' : '暂无文档数据'}
                    </td>
                  </tr>
                ) : (
                  rows.map((document) => (
                    <tr key={document.id} className="border-b border-line/70">
                      <td className="px-4 py-3 text-ink">{document.filename}</td>
                      <td className="px-4 py-3 text-ink-soft">{document.knowledge_base}</td>
                      <td className="px-4 py-3 text-ink-soft">{document.file_type}</td>
                      <td className="px-4 py-3 text-ink-soft">{document.chunk_count}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {document.file_size == null ? '-' : formatFileSize(document.file_size)}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {formatDate(document.updated_at, 'full')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className={ghostBtnClass}
                          disabled={deletingId === document.id}
                          onClick={() => void handleDelete(document.id)}
                        >
                          <Trash2 size={15} />
                          {deletingId === document.id ? '删除中...' : '删除'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>
    </MainLayout>
  )
}
