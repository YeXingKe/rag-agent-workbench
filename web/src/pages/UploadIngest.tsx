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

const pipelineSteps = [
  '上传源文件',
  '解析切分',
  '写入向量库',
  '刷新验证',
]

const chunkStrategies = ['自动识别', '按段落', '按标题', '固定长度']

const tableHeaders = ['文件名', '进度', '状态', '类型', 'Chunks', '大小', '更新时间', '操作']

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent/40'
const labelClass = 'text-sm font-medium text-ink-soft'
const cardClass = 'rounded-2xl border border-line bg-paper-raised p-5 sm:p-6'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink'
const primaryBtnClass = 'btn-primary'

export default function UploadIngest() {
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
          <button type="button" className={ghostBtnClass}>
            <RefreshCw size={15} />
            刷新配置
          </button>
        </motion.div>

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
              <button type="button" className={ghostBtnClass}>
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
              <button type="button" className={ghostBtnClass}>
                <RefreshCw size={14} />
                刷新配置
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>知识库名称</span>
                <input className={fieldClass} defaultValue="default" />
              </label>
              <label className="block">
                <span className={labelClass}>切分策略</span>
                <select className={fieldClass} defaultValue="自动识别">
                  {chunkStrategies.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-paper px-4 py-8 text-center transition-colors hover:border-accent/40 hover:bg-accent-soft/20">
              <UploadCloud size={36} strokeWidth={1.4} className="mb-3 text-accent" />
              <p className="text-sm text-ink-soft">
                将文件拖到这里，或{' '}
                <span className="font-semibold text-accent">点击选择文件</span>
              </p>
              <p className="mt-2 text-xs text-ink-muted">支持 txt / md / pdf / docx</p>
            </div>

            <div className="mt-5">
              <button type="button" className={primaryBtnClass}>
                <UploadCloud size={16} />
                上传并解析入库
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
            <button type="button" className={ghostBtnClass}>
              <Copy size={14} />
              复制内容
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className={labelClass}>文件名</span>
              <input className={fieldClass} placeholder="例如: product_sales.md" />
            </label>
            <label className="block">
              <span className={labelClass}>知识库名称</span>
              <input className={fieldClass} defaultValue="default" />
            </label>
            <label className="block">
              <span className={labelClass}>切分策略</span>
              <select className={fieldClass} defaultValue="自动识别">
                {chunkStrategies.map((item) => (
                  <option key={item} value={item}>
                    {item}
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
            />
          </label>

          <div className="mt-5">
            <button type="button" className={primaryBtnClass}>
              <CheckCircle2 size={16} />
              文本直接入库
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
            <button type="button" className={ghostBtnClass}>
              <RefreshCw size={14} />
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
                <tr>
                  <td colSpan={tableHeaders.length} className="px-4 py-16 text-center text-ink-muted">
                    暂无入库记录
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>
    </MainLayout>
  )
}
