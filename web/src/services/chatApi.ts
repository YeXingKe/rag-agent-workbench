import api from './api'

export interface SourceChunkItem {
  ref_id: number
  chunk_id?: string | null
  document_id?: string | null
  file_name?: string | null
  file_type?: string | null
  chunk_index?: number | null
  content: string
  score: number
  vector_score?: number | null
  bm25_score?: number | null
  fused_score?: number | null
  retrieval_source?: string | null
  retrieval_sources?: string[]
  rank_vector?: number | null
  rank_bm25?: number | null
  rank_fused?: number | null
  splitter_name?: string | null
  parser_name?: string | null
  section_type?: string | null
  section_title?: string | null
  page_number?: number | null
  source_path?: string | null
  start_offset?: number | null
  end_offset?: number | null
}

export interface SessionSummaryItem {
  session_id: string
  latest_question: string
  latest_answer?: string | null
  message_count: number
  updated_at: string
}

export interface ChatHistoryItem {
  id: string
  session_id?: string | null
  user_question: string
  answer?: string | null
  route: string
  latency_ms?: number | null
  source_chunks: SourceChunkItem[]
  created_at: string
  updated_at: string
}

export interface ChatResponse {
  session_id: string
  answer: string
  route: string
  latency_ms: number
  source_chunks: SourceChunkItem[]
  created_at: string
}

export interface SessionClearResponse {
  session_id: string
  deleted_query_log_count: number
  cleared_memory: boolean
}

export type ChatSseEventName =
  | 'status'
  | 'sources'
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  | 'error'
  | 'done'

export type ChatSseHandler = (event: ChatSseEventName, data: Record<string, unknown>) => void

const API_BASE_URL = 'http://localhost:8000/api/v1'

function parseSseChunk(
  buffer: string,
  onEvent: ChatSseHandler,
): string {
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''

  for (const part of parts) {
    const lines = part.split('\n')
    let eventName: ChatSseEventName = 'status'
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() as ChatSseEventName
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (dataLines.length === 0) {
      continue
    }

    try {
      const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
      onEvent(eventName, payload)
    } catch (error) {
      console.error('解析 SSE 数据失败:', error, dataLines.join('\n'))
    }
  }

  return rest
}

export const chatApi = {
  listSessions: async (limit = 50) => {
    try {
      return await api.get<SessionSummaryItem[]>('/chat/sessions', {
        params: { limit },
      })
    } catch (error) {
      console.error('获取会话列表失败:', error)
      throw error
    }
  },

  getSessionHistory: async (sessionId: string, limit = 50) => {
    try {
      return await api.get<ChatHistoryItem[]>(`/chat/sessions/${sessionId}/history`, {
        params: { limit },
      })
    } catch (error) {
      console.error('获取会话历史失败:', error)
      throw error
    }
  },

  clearSession: async (sessionId: string) => {
    try {
      return await api.delete<SessionClearResponse>(`/chat/sessions/${sessionId}`)
    } catch (error) {
      console.error('清空会话失败:', error)
      throw error
    }
  },

  /**
   * 同步问答（非流式）
   */
  chat: async (payload: { session_id: string; message: string; top_k?: number }) => {
    try {
      return await api.post<ChatResponse>('/chat', payload, {
        timeout: 180_000,
      })
    } catch (error) {
      console.error('同步问答失败:', error)
      throw error
    }
  },

  /**
   * SSE 流式问答（POST + ReadableStream）
   */
  streamChat: async (
    payload: { session_id: string; message: string; top_k?: number },
    onEvent: ChatSseHandler,
    signal?: AbortSignal,
  ): Promise<void> => {
    const token = localStorage.getItem('token')
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        session_id: payload.session_id,
        message: payload.message,
        top_k: payload.top_k ?? 5,
      }),
      signal,
    })

    if (!response.ok) {
      let detail = `流式问答失败 (${response.status})`
      try {
        const body = (await response.json()) as { detail?: unknown }
        if (typeof body.detail === 'string') {
          detail = body.detail
        }
      } catch {
        // ignore
      }
      throw new Error(detail)
    }

    if (!response.body) {
      throw new Error('浏览器不支持流式响应')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      buffer = parseSseChunk(buffer, onEvent)
    }

    if (buffer.trim()) {
      parseSseChunk(`${buffer}\n\n`, onEvent)
    }
  },
}
