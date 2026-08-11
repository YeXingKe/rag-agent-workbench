import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  RefreshCw,
  Plus,
  PackageOpen,
  Minus,
  Square,
  Send,
} from 'lucide-react'
import MainLayout from '../components/layout/MainLayout'

const cardClass = 'rounded-2xl border border-line bg-paper-raised p-4 sm:p-5'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink'
const primaryBtnClass = 'btn-primary'

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper-raised">
        <PackageOpen size={26} strokeWidth={1.4} className="text-accent" />
      </div>
      <p className="max-w-[220px] text-sm leading-relaxed text-ink-soft">{text}</p>
    </div>
  )
}

export default function AgentConversation() {
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
              智能问答
            </h1>
          </div>
          <button type="button" className={ghostBtnClass}>
            <RefreshCw size={15} />
            刷新数据
          </button>
        </motion.div>

        {/* Agent Console */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.04 }}
          className={`${cardClass} shrink-0`}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                Agent Console
              </p>
              <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                多轮对话、工具调用与溯源结果全链路观测
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                当前页面直连后端流式对话接口，可查看对话历史、实时生成内容、工具调用过程以及最终命中来源切片。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#f0c7c0] bg-[#fdf2f0] px-3 py-1.5 text-xs font-semibold text-[#b91c1c]">
                等待处理
              </span>
              <button type="button" className={ghostBtnClass}>
                <RefreshCw size={14} />
                刷新对话
              </button>
              <button type="button" className={ghostBtnClass}>
                <Plus size={14} />
                新建对话
              </button>
            </div>
          </div>
        </motion.section>

        {/* 三栏主区 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="grid min-h-[520px] flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,0.95fr)_minmax(0,1.35fr)_minmax(320px,1fr)]"
        >
          {/* 会话列表 */}
          <section className={`${cardClass} flex min-h-[280px] flex-col xl:min-h-0`}>
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Sessions
                </p>
                <h3 className="font-display text-base font-bold text-ink">会话列表</h3>
              </div>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-soft px-2 text-xs font-bold text-accent-deep">
                0
              </span>
            </div>
            <EmptyPanel text="暂无历史会话，可直接新建或发送进行问答" />
          </section>

          {/* 对话窗口 */}
          <section className={`${cardClass} flex min-h-[420px] flex-col xl:min-h-0`}>
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Conversation
                </p>
                <h3 className="font-display text-base font-bold text-ink">对话窗口</h3>
              </div>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-deep">
                0 条记录
              </span>
            </div>

            <div className="mb-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-dashed border-line bg-paper">
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-4 text-center text-ink-muted">
                <p className="text-sm text-ink-soft">开始提问后，消息将显示在这里</p>
              </div>
            </div>

            <div className="shrink-0 rounded-xl border border-line bg-paper p-3">
              <textarea
                className="min-h-[88px] w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
                placeholder="输入你的问题。例如：总结 rule.md 的编写规范，并给出来源切片"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-paper-raised">
                  <span className="border-r border-line px-2.5 py-1.5 text-xs text-ink-muted">
                    Top K
                  </span>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 text-ink-muted transition-colors hover:text-ink"
                    onClick={() => setTopK((v) => Math.max(1, v - 1))}
                    aria-label="减少 Top K"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-8 border-x border-line px-2 py-1.5 text-center text-sm font-semibold text-ink">
                    {topK}
                  </span>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 text-ink-muted transition-colors hover:text-ink"
                    onClick={() => setTopK((v) => Math.min(50, v + 1))}
                    aria-label="增加 Top K"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" className={ghostBtnClass}>
                    <Square size={13} />
                    停止生成
                  </button>
                  <button type="button" className={primaryBtnClass}>
                    <Send size={14} />
                    发送消息
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 执行轨迹 */}
          <section className={`${cardClass} flex min-h-[280px] flex-col xl:min-h-0`}>
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Trace
                </p>
                <h3 className="font-display text-base font-bold text-ink">执行轨迹与来源</h3>
              </div>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-deep">
                0 个事件
              </span>
            </div>

            <div className="mb-3 shrink-0">
              <span className="inline-flex rounded-lg border border-[#e8d5a3] bg-[#fbf6e9] px-2.5 py-1 text-xs font-medium text-[#92400e]">
                调度器
              </span>
            </div>

            <EmptyPanel text="进行一轮对话以查看执行轨迹和命中切片" />
          </section>
        </motion.div>
      </div>
    </MainLayout>
  )
}
