import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  RefreshCw,
  UploadCloud,
  Eraser,
  ListChecks,
  Copy,
  CheckCircle2,
} from 'lucide-react'
import MainLayout from '../components/layout/MainLayout'
import {
  knowledgeApi,
  type DocumentItem,
  type SplitterOption,
} from '../services/knowledgeApi'
import { formatDate, formatFileSize } from '../utils/formatters'

const pipelineSteps = [
  '上传源文件',
  '解析切分',
  '写入向量库',
  '刷新验证',
]

const tableHeaders = ['文件名', '进度', '状态', '类型', 'Chunks', '大小', '更新时间', '操作']

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/40'
const labelClass = 'text-sm font-medium text-ink-soft'
const cardClass = 'rounded-2xl border border-line bg-paper-raised p-5 sm:p-6'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'
const primaryBtnClass = 'btn-primary disabled:cursor-not-allowed disabled:opacity-50'

const ACCEPTED_FILE_TYPES = '.txt,.md,.pdf,.docx'

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

function formatStatus(status: string): string {
  switch (status) {
    case 'indexed':
      return '已入库'
    case 'parsed':
      return '已解析'
    case 'uploaded':
      return '已上传'
    case 'failed':
      return '失败'
    default:
      return status
  }
}

export default function UploadIngest() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadingRef = useRef(false)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadKnowledgeBase, setUploadKnowledgeBase] = useState('default')
  const [uploadSplitter, setUploadSplitter] = useState('')
  const [splitterOptions, setSplitterOptions] = useState<SplitterOption[]>([])
  const [uploading, setUploading] = useState(false)
  const [ingestingText, setIngestingText] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [recentDocuments, setRecentDocuments] = useState<DocumentItem[]>([])

  const [textFilename, setTextFilename] = useState('')
  const [textKnowledgeBase, setTextKnowledgeBase] = useState('default')
  const [textSplitter, setTextSplitter] = useState('')
  const [textContent, setTextContent] = useState('')

  const loadSplitterOptions = useCallback(async () => {
    try {
      const options = await knowledgeApi.getSplitterOptions()
      setSplitterOptions(options)
    } catch (loadError) {
      console.error(loadError)
    }
  }, [])

  const loadDocuments = useCallback(async () => {
    setLoadingDocuments(true)
    try {
      const documents = await knowledgeApi.listDocuments()
      setRecentDocuments(documents.slice(0, 10))
    } catch (loadError) {
      setError(resolveErrorMessage(loadError, '加载最近入库结果失败'))
    } finally {
      setLoadingDocuments(false)
    }
  }, [])

  useEffect(() => {
    void loadSplitterOptions()
    void loadDocuments()
  }, [loadDocuments, loadSplitterOptions])

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelection = (file: File | undefined) => {
    if (!file) {
      return
    }
    setSelectedFile(file)
    setError(null)
    setSuccessMessage(null)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(event.target.files?.[0])
    event.target.value = ''
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    handleFileSelection(event.dataTransfer.files?.[0])
  }

  const handleUpload = async () => {
    if (uploadingRef.current) {
      return
    }

    if (!selectedFile) {
      setError('请先选择要上传的文件')
      openFileDialog()
      return
    }

    uploadingRef.current = true
    setUploading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await knowledgeApi.uploadDocument(selectedFile, {
        knowledgeBase: uploadKnowledgeBase,
        preferredSplitter: uploadSplitter || null,
      })
      setSuccessMessage(response.message || '文档上传并入库成功')
      setSelectedFile(null)
      await loadDocuments()
    } catch (uploadError) {
      setError(resolveErrorMessage(uploadError, '上传文档失败'))
    } finally {
      uploadingRef.current = false
      setUploading(false)
    }
  }

  const handleTextIngest = async () => {
    if (!textFilename.trim()) {
      setError('请填写文件名')
      return
    }
    if (!textContent.trim()) {
      setError('请填写正文内容')
      return
    }

    setIngestingText(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await knowledgeApi.ingestText({
        filename: textFilename.trim(),
        content: textContent,
        knowledge_base: textKnowledgeBase.trim() || 'default',
        preferred_splitter: textSplitter || null,
      })
      setSuccessMessage(response.message || '文本入库成功')
      setTextContent('')
      await loadDocuments()
    } catch (ingestError) {
      setError(resolveErrorMessage(ingestError, '文本入库失败'))
    } finally {
      setIngestingText(false)
    }
  }

  const handleCopyTextContent = async () => {
    if (!textContent.trim()) {
      setError('当前没有可复制的内容')
      return
    }
    try {
      await navigator.clipboard.writeText(textContent)
      setSuccessMessage('正文内容已复制到剪贴板')
      setError(null)
    } catch {
      setError('复制失败，请手动选择文本复制')
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
              知识导入
            </h1>
          </div>
          <button
            type="button"
            className={ghostBtnClass}
            onClick={() => {
              void loadSplitterOptions()
              void loadDocuments()
            }}
            disabled={loadingDocuments}
          >
            <RefreshCw size={15} className={loadingDocuments ? 'animate-spin' : ''} />
            刷新配置
          </button>
        </motion.div>

        {(error || successMessage) && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              error
                ? 'border-red-300/60 bg-red-50 text-red-700'
                : 'border-emerald-300/60 bg-emerald-50 text-emerald-700'
            }`}
          >
            {error || successMessage}
          </div>
        )}

        {/* 流程说明横幅 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.04 }}
          className={`${cardClass} shrink-0`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Dataset Creation
              </p>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                上传文档并解析入向量数据库
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                上传 → 解析 → 切分 → 写入向量索引。完成后可在文本切片中查看抽取结果与清洗效果。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={ghostBtnClass}
                onClick={() => {
                  setSelectedFile(null)
                  setTextContent('')
                  setError(null)
                  setSuccessMessage(null)
                }}
              >
                <Eraser size={15} />
                清理数据
              </button>
              <Link to="/documents" className={ghostBtnClass}>
                <ListChecks size={15} />
                查看文档库
              </Link>
            </div>
          </div>
        </motion.section>

        {/* 上传 + 执行说明 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="grid shrink-0 grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]"
        >
          {/* 文件上传 */}
          <section className={cardClass}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Upload File
                </p>
                <h3 className="font-display text-lg font-bold text-ink">文件上传入库</h3>
              </div>
              <button
                type="button"
                className={ghostBtnClass}
                onClick={() => void loadSplitterOptions()}
              >
                <RefreshCw size={14} />
                刷新配置
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>知识库名称</span>
                <input
                  className={fieldClass}
                  value={uploadKnowledgeBase}
                  onChange={(event) => setUploadKnowledgeBase(event.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>切分策略</span>
                <select
                  className={fieldClass}
                  value={uploadSplitter}
                  onChange={(event) => setUploadSplitter(event.target.value)}
                >
                  <option value="">自动识别</option>
                  {splitterOptions.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={openFileDialog}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openFileDialog()
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`mt-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition-colors ${
                isDragging
                  ? 'border-accent bg-accent-soft/30'
                  : 'border-line bg-paper hover:border-accent/40 hover:bg-accent-soft/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPTED_FILE_TYPES}
                onChange={handleFileChange}
              />
              <UploadCloud size={36} strokeWidth={1.4} className="mb-3 text-accent" />
              {selectedFile ? (
                <>
                  <p className="text-sm font-semibold text-ink">{selectedFile.name}</p>
                  <p className="mt-2 text-xs text-ink-muted">
                    {formatFileSize(selectedFile.size)} · 点击可重新选择文件
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-soft">
                    将文件拖到这里，或{' '}
                    <span className="font-semibold text-accent">点击选择文件</span>
                  </p>
                  <p className="mt-2 text-xs text-ink-muted">支持 txt / md / pdf / docx</p>
                </>
              )}
            </div>

            <div className="mt-5">
              <button
                type="button"
                className={primaryBtnClass}
                onClick={() => void handleUpload()}
                disabled={uploading}
              >
                <UploadCloud size={16} className={uploading ? 'animate-pulse' : ''} />
                {uploading ? '上传并解析中...' : '上传并解析入库'}
              </button>
            </div>
          </section>

          {/* 执行说明 */}
          <section className={`${cardClass} flex flex-col`}>
            <div className="mb-5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Pipeline
              </p>
              <h3 className="font-display text-lg font-bold text-ink">执行说明</h3>
            </div>

            <ol className="space-y-3">
              {pipelineSteps.map((step, index) => (
                <li key={step} className="flex items-center gap-3 text-sm text-ink-soft">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-deep">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <p className="mt-6 flex-1 border-t border-line pt-5 text-sm leading-relaxed text-ink-muted">
              后端会保存原始文件，按类型解析内容，结构化清洗后生成 Chunk 元数据，向量化写入 Milvus，并将文档元信息记录到 PostgreSQL。完成后可在文本切片与召回试验中验证效果。
            </p>
          </section>
        </motion.div>

        {/* 纯文本快速入库 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className={`${cardClass} shrink-0`}
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Text Fallback
              </p>
              <h3 className="font-display text-lg font-bold text-ink">纯文本快速入库</h3>
            </div>
            <button type="button" className={ghostBtnClass} onClick={() => void handleCopyTextContent()}>
              <Copy size={14} />
              复制内容
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className={labelClass}>文件名</span>
              <input
                className={fieldClass}
                placeholder="例如: product_sales.md"
                value={textFilename}
                onChange={(event) => setTextFilename(event.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>知识库名称</span>
              <input
                className={fieldClass}
                value={textKnowledgeBase}
                onChange={(event) => setTextKnowledgeBase(event.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>切分策略</span>
              <select
                className={fieldClass}
                value={textSplitter}
                onChange={(event) => setTextSplitter(event.target.value)}
              >
                <option value="">自动识别</option>
                {splitterOptions.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block">
            <span className={labelClass}>正文内容</span>
            <textarea
              className={`${fieldClass} min-h-[140px] resize-y`}
              placeholder="在此粘贴需要导入的文本内容"
              value={textContent}
              onChange={(event) => setTextContent(event.target.value)}
            />
          </label>

          <div className="mt-5">
            <button
              type="button"
              className={primaryBtnClass}
              onClick={() => void handleTextIngest()}
              disabled={ingestingText}
            >
              <CheckCircle2 size={16} className={ingestingText ? 'animate-pulse' : ''} />
              {ingestingText ? '入库中...' : '文本直接入库'}
            </button>
          </div>
        </motion.section>

        {/* 最近入库结果 */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16 }}
          className={`${cardClass} flex min-h-[240px] flex-1 flex-col`}
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Recent Documents
              </p>
              <h3 className="font-display text-lg font-bold text-ink">最近入库结果</h3>
            </div>
            <button
              type="button"
              className={ghostBtnClass}
              onClick={() => void loadDocuments()}
              disabled={loadingDocuments}
            >
              <RefreshCw size={14} className={loadingDocuments ? 'animate-spin' : ''} />
              全部刷新
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
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
                {recentDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={tableHeaders.length} className="px-4 py-16 text-center text-ink-muted">
                      {loadingDocuments ? '加载中...' : '暂无入库记录'}
                    </td>
                  </tr>
                ) : (
                  recentDocuments.map((document) => (
                    <tr key={document.id} className="border-b border-line/70">
                      <td className="px-4 py-3 text-ink">{document.filename}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {document.status === 'indexed' ? '100%' : '处理中'}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{formatStatus(document.status)}</td>
                      <td className="px-4 py-3 text-ink-soft">{document.file_type}</td>
                      <td className="px-4 py-3 text-ink-soft">{document.chunk_count}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {document.file_size == null ? '-' : formatFileSize(document.file_size)}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {formatDate(document.updated_at, 'full')}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        <Link to="/documents" className="text-accent hover:underline">
                          查看
                        </Link>
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
