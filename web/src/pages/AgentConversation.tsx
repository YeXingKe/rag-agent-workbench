import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  RefreshCw,
  Plus,
  PackageOpen,
  Minus,
  Square,
  Send,
  Trash2,
} from 'lucide-react'
import MainLayout from '../components/layout/MainLayout'
import MarkdownContent from '../components/common/MarkdownContent'
import { useApi } from '../hooks/useApi'
import {
  chatApi,
  type ChatHistoryItem,
  type SessionSummaryItem,
  type SourceChunkItem,
} from '../services/chatApi'

const cardClass = 'rounded-2xl border border-line bg-paper-raised p-4 sm:p-5'
const ghostBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'
const primaryBtnClass = 'btn-primary disabled:cursor-not-allowed disabled:opacity-50'

const MIN_TOP_K = 1
const MAX_TOP_K = 8

type ChatRole = 'user' | 'assistant'
type TraceKind = 'status' | 'tool_call' | 'tool_result' | 'tool_error' | 'error' | 'info'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  streaming?: boolean
}

interface TraceEvent {
  id: string
  kind: TraceKind
  title: string
  detail?: string
  at: number
}

type RunStatus = 'idle' | 'streaming' | 'error' | 'done'

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper px-4 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper-raised">
        <PackageOpen size={26} strokeWidth={1.4} className="text-accent" />
      </div>
      <p className="max-w-[220px] text-sm leading-relaxed text-ink-soft">{text}</p>
    </div>
  )
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error != null && 'response' in error) {
    const response = (error as { response?: { data?: { detail?: unknown } } }).response
    const detail = response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function statusLabel(status: RunStatus): { text: string; className: string } {
  switch (status) {
    case 'streaming':
      return {
        text: '生成中',
        className: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]',
      }
    case 'done':
      return {
        text: '已完成',
        className: 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]',
      }
    case 'error':
      return {
        text: '出错',
        className: 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]',
      }
    default:
      return {
        text: '等待处理',
        className: 'border-[#f0c7c0] bg-[#fdf2f0] text-[#b91c1c]',
      }
  }
}

function historyToMessages(history: ChatHistoryItem[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (const item of [...history].reverse()) {
    messages.push({
      id: `${item.id}_user`,
      role: 'user',
      content: item.user_question,
    })
    if (item.answer) {
      messages.push({
        id: `${item.id}_assistant`,
        role: 'assistant',
        content: item.answer,
      })
    }
  }
  return messages
}

function formatScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) {
    return '—'
  }
  return Number(value).toFixed(4)
}

export default function AgentConversation() {
  const sendingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [topK, setTopK] = useState(5)
  const [sessionId, setSessionId] = useState(() => createId('session'))
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([])
  const [sourceChunks, setSourceChunks] = useState<SourceChunkItem[]>([])
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const {
    data: sessions,
    loading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
  } = useApi<SessionSummaryItem[]>(() => chatApi.listSessions(50), [])

  const sessionRows = sessions ?? []
  const statusMeta = statusLabel(runStatus)

  const pushTrace = useCallback((kind: TraceKind, title: string, detail?: string) => {
    setTraceEvents((prev) => [
      ...prev,
      {
        id: createId('trace'),
        kind,
        title,
        detail,
        at: Date.now(),
      },
    ])
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const loadHistory = useCallback(async (targetSessionId: string) => {
    setLoadingHistory(true)
    setError(null)
    try {
      const history = await chatApi.getSessionHistory(targetSessionId, 100)
      setMessages(historyToMessages(history))
      const latestSources = history[0]?.source_chunks ?? []
      setSourceChunks(latestSources)
      setTraceEvents([
        {
          id: createId('trace'),
          kind: 'info',
          title: '已加载历史会话',
          detail: `共 ${history.length} 轮问答`,
          at: Date.now(),
        },
      ])
      setRunStatus('idle')
    } catch (loadError) {
      setError(resolveErrorMessage(loadError, '加载会话历史失败'))
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const handleSelectSession = async (nextSessionId: string) => {
    if (sendingRef.current || nextSessionId === sessionId) {
      return
    }
    setSessionId(nextSessionId)
    setInput('')
    await loadHistory(nextSessionId)
  }

  const handleNewSession = () => {
    if (sendingRef.current) {
      return
    }
    abortRef.current?.abort()
    abortRef.current = null
    setSessionId(createId('session'))
    setMessages([])
    setTraceEvents([])
    setSourceChunks([])
    setInput('')
    setError(null)
    setRunStatus('idle')
  }

  const handleRefresh = () => {
    void refetchSessions()
    if (messages.length > 0 || sessionRows.some((item) => item.session_id === sessionId)) {
      void loadHistory(sessionId)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    sendingRef.current = false
    setRunStatus('idle')
    setMessages((prev) =>
      prev.map((msg) => (msg.streaming ? { ...msg, streaming: false } : msg)),
    )
    pushTrace('info', '已停止生成')
  }

  const handleClearSession = async () => {
    if (sendingRef.current) {
      return
    }
    const confirmed = window.confirm('确认清空当前会话的历史记录与短期记忆？')
    if (!confirmed) {
      return
    }
    try {
      await chatApi.clearSession(sessionId)
      setMessages([])
      setTraceEvents([])
      setSourceChunks([])
      setRunStatus('idle')
      setError(null)
      await refetchSessions()
      pushTrace('info', '会话已清空')
    } catch (clearError) {
      setError(resolveErrorMessage(clearError, '清空会话失败'))
    }
  }

  const handleSend = async () => {
    if (sendingRef.current) {
      return
    }

    const message = input.trim()
    if (!message) {
      setError('请输入问题')
      return
    }

    const userMessageId = createId('msg')
    const assistantMessageId = createId('msg')
    const controller = new AbortController()
    abortRef.current = controller
    sendingRef.current = true

    setInput('')
    setError(null)
    setRunStatus('streaming')
    setTraceEvents([])
    setSourceChunks([])
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: message },
      { id: assistantMessageId, role: 'assistant', content: '', streaming: true },
    ])
    pushTrace('status', '开始处理', `session=${sessionId}`)

    try {
      let finishedOk = true
      await chatApi.streamChat(
        {
          session_id: sessionId,
          message,
          top_k: topK,
        },
        (event, data) => {
          if (event === 'status') {
            const phase = String(data.phase ?? 'status')
            pushTrace('status', `状态: ${phase}`, JSON.stringify(data))
            return
          }

          if (event === 'sources') {
            const items = Array.isArray(data.items) ? (data.items as SourceChunkItem[]) : []
            setSourceChunks(items)
            pushTrace('info', `命中来源 ${items.length} 条`)
            return
          }

          if (event === 'token') {
            const text = typeof data.text === 'string' ? data.text : ''
            if (!text) {
              return
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: `${msg.content}${text}`, streaming: true }
                  : msg,
              ),
            )
            return
          }

          if (event === 'tool_call') {
            pushTrace(
              'tool_call',
              `调用工具: ${String(data.tool_name ?? 'unknown')}`,
              JSON.stringify(data.args ?? {}),
            )
            return
          }

          if (event === 'tool_result') {
            pushTrace('tool_result', '工具返回', String(data.content ?? '').slice(0, 240))
            return
          }

          if (event === 'tool_error') {
            pushTrace('tool_error', '工具失败', String(data.content ?? data.message ?? ''))
            return
          }

          if (event === 'error') {
            finishedOk = false
            const messageText = String(data.message ?? '流式对话失败')
            setError(messageText)
            setRunStatus('error')
            pushTrace('error', '执行失败', messageText)
            return
          }

          if (event === 'done') {
            const answer = typeof data.answer === 'string' ? data.answer : undefined
            const ok = data.ok !== false
            finishedOk = ok
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== assistantMessageId) {
                  return msg
                }
                return {
                  ...msg,
                  content: answer && answer.trim() ? answer : msg.content,
                  streaming: false,
                }
              }),
            )
            setRunStatus(ok ? 'done' : 'error')
            pushTrace(
              ok ? 'info' : 'error',
              ok ? '对话完成' : '对话结束（失败）',
              typeof data.latency_ms === 'number' ? `耗时 ${data.latency_ms} ms` : undefined,
            )
          }
        },
        controller.signal,
      )

      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, streaming: false } : msg)),
      )
      setRunStatus(finishedOk ? 'done' : 'error')
      await refetchSessions()
    } catch (sendError) {
      if ((sendError as { name?: string })?.name === 'AbortError') {
        pushTrace('info', '请求已取消')
      } else {
        const messageText = resolveErrorMessage(sendError, '发送失败')
        setError(messageText)
        setRunStatus('error')
        pushTrace('error', '发送失败', messageText)
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: msg.content || `（失败）${messageText}`,
                  streaming: false,
                }
              : msg,
          ),
        )
      }
    } finally {
      sendingRef.current = false
      abortRef.current = null
    }
  }

  const activeSessionTitle = useMemo(() => {
    const found = sessionRows.find((item) => item.session_id === sessionId)
    return found?.latest_question || '新会话'
  }, [sessionId, sessionRows])

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
              智能问答
            </h1>
          </div>
          <button
            type="button"
            className={ghostBtnClass}
            onClick={handleRefresh}
            disabled={sessionsLoading || loadingHistory || runStatus === 'streaming'}
          >
            <RefreshCw
              size={15}
              className={sessionsLoading || loadingHistory ? 'animate-spin' : ''}
            />
            刷新数据
          </button>
        </motion.div>

        {(error || sessionsError) && (
          <div className="rounded-2xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error || `加载会话失败: ${sessionsError}`}
          </div>
        )}

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
              <p className="mt-2 truncate text-xs text-ink-muted">
                当前会话：{activeSessionTitle}（{sessionId}）
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusMeta.className}`}
              >
                {statusMeta.text}
              </span>
              <button
                type="button"
                className={ghostBtnClass}
                onClick={handleRefresh}
                disabled={runStatus === 'streaming'}
              >
                <RefreshCw size={14} />
                刷新对话
              </button>
              <button
                type="button"
                className={ghostBtnClass}
                onClick={handleNewSession}
                disabled={runStatus === 'streaming'}
              >
                <Plus size={14} />
                新建对话
              </button>
              <button
                type="button"
                className={ghostBtnClass}
                onClick={() => void handleClearSession()}
                disabled={runStatus === 'streaming'}
              >
                <Trash2 size={14} />
                清空会话
              </button>
            </div>
          </div>
        </motion.section>

        {/* 三栏主区：固定高度，避免无限撑高 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,0.95fr)_minmax(0,1.35fr)_minmax(320px,1fr)]"
        >
          {/* 会话列表 */}
          <section className={`${cardClass} flex h-[620px] flex-col overflow-hidden`}>
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Sessions
                </p>
                <h3 className="font-display text-base font-bold text-ink">会话列表</h3>
              </div>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-soft px-2 text-xs font-bold text-accent-deep">
                {sessionRows.length}
              </span>
            </div>

            {sessionsLoading ? (
              <div className="flex h-0 flex-1 items-center justify-center text-sm text-ink-muted">
                加载中...
              </div>
            ) : sessionRows.length === 0 ? (
              <EmptyPanel text="暂无历史会话，可直接新建或发送进行问答" />
            ) : (
              <div className="h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
                {sessionRows.map((session) => {
                  const active = session.session_id === sessionId
                  return (
                    <button
                      key={session.session_id}
                      type="button"
                      onClick={() => void handleSelectSession(session.session_id)}
                      disabled={runStatus === 'streaming'}
                      className={`block w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                        active
                          ? 'border-accent/40 bg-accent-soft/40'
                          : 'border-line bg-paper hover:border-accent/30'
                      }`}
                    >
                      <p className="truncate text-sm font-semibold text-ink">
                        {session.latest_question || '未命名会话'}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
                        {session.latest_answer || '暂无回答'}
                      </p>
                      <p className="mt-2 text-[11px] text-ink-muted">
                        {session.message_count} 轮 ·{' '}
                        {new Date(session.updated_at).toLocaleString('zh-CN')}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* 对话窗口 */}
          <section className={`${cardClass} flex h-[620px] flex-col overflow-hidden`}>
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Conversation
                </p>
                <h3 className="font-display text-base font-bold text-ink">对话窗口</h3>
              </div>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-deep">
                {messages.length} 条记录
              </span>
            </div>

            <div className="mb-3 h-0 min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-paper">
              {loadingHistory ? (
                <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                  加载历史中...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[180px] flex-col items-center justify-center px-4 text-center text-ink-muted">
                  <p className="text-sm text-ink-soft">开始提问后，消息将显示在这里</p>
                </div>
              ) : (
                <div className="space-y-3 p-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          message.role === 'user'
                            ? 'bg-accent text-white'
                            : 'border border-line bg-paper-raised text-ink'
                        }`}
                      >
                        <p className="mb-1 text-[11px] opacity-70">
                          {message.role === 'user' ? '你' : '助手'}
                          {message.streaming ? ' · 生成中' : ''}
                        </p>
                        {message.role === 'assistant' ? (
                          message.content ? (
                            <MarkdownContent content={message.content} />
                          ) : (
                            <p className="text-ink-muted">{message.streaming ? '...' : ''}</p>
                          )
                        ) : (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="shrink-0 rounded-xl border border-line bg-paper p-3">
              <textarea
                className="min-h-[88px] w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
                placeholder="输入你的问题。例如：总结 rule.md 的编写规范，并给出来源切片"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
                disabled={runStatus === 'streaming'}
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-paper-raised">
                  <span className="border-r border-line px-2.5 py-1.5 text-xs text-ink-muted">
                    Top K
                  </span>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                    onClick={() => setTopK((v) => Math.max(MIN_TOP_K, v - 1))}
                    aria-label="减少 Top K"
                    disabled={runStatus === 'streaming'}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="min-w-8 border-x border-line px-2 py-1.5 text-center text-sm font-semibold text-ink">
                    {topK}
                  </span>
                  <button
                    type="button"
                    className="px-2.5 py-1.5 text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                    onClick={() => setTopK((v) => Math.min(MAX_TOP_K, v + 1))}
                    aria-label="增加 Top K"
                    disabled={runStatus === 'streaming'}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={ghostBtnClass}
                    onClick={handleStop}
                    disabled={runStatus !== 'streaming'}
                  >
                    <Square size={13} />
                    停止生成
                  </button>
                  <button
                    type="button"
                    className={primaryBtnClass}
                    onClick={() => void handleSend()}
                    disabled={runStatus === 'streaming'}
                  >
                    <Send size={14} />
                    {runStatus === 'streaming' ? '生成中...' : '发送消息'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 执行轨迹 */}
          <section className={`${cardClass} flex h-[620px] flex-col overflow-hidden`}>
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  Trace
                </p>
                <h3 className="font-display text-base font-bold text-ink">执行轨迹与来源</h3>
              </div>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-deep">
                {traceEvents.length} 个事件
              </span>
            </div>

            <div className="mb-3 shrink-0">
              <span className="inline-flex rounded-lg border border-[#e8d5a3] bg-[#fbf6e9] px-2.5 py-1 text-xs font-medium text-[#92400e]">
                调度器
              </span>
            </div>

            <div className="h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
              {traceEvents.length === 0 && sourceChunks.length === 0 ? (
                <EmptyPanel text="进行一轮对话以查看执行轨迹和命中切片" />
              ) : (
                <>
                  {traceEvents.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-xl border border-line bg-paper px-3 py-2.5"
                    >
                      <p className="text-xs font-semibold text-ink">
                        [{event.kind}] {event.title}
                      </p>
                      {event.detail && (
                        <p className="mt-1 whitespace-pre-wrap break-all text-[11px] leading-relaxed text-ink-muted">
                          {event.detail}
                        </p>
                      )}
                    </div>
                  ))}

                  {sourceChunks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                        Sources
                      </p>
                      {sourceChunks.map((chunk) => (
                        <div
                          key={`${chunk.ref_id}-${chunk.chunk_id ?? chunk.content.slice(0, 12)}`}
                          className="rounded-xl border border-line bg-paper px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-ink">
                              [{chunk.ref_id}] {chunk.file_name || '未知文件'}
                            </p>
                            <span className="text-[11px] text-ink-muted">
                              {formatScore(chunk.score)}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-ink-soft">
                            {chunk.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </motion.div>
      </div>
    </MainLayout>
  )
}
