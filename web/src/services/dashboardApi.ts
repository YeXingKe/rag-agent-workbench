import { API_CONFIG } from '../utils/constants'
import api from './api'
import { chatApi, type SessionSummaryItem } from './chatApi'
import { knowledgeApi, type DocumentItem } from './knowledgeApi'

export interface HealthServiceItem {
  ok: boolean
  error: string | null
}

export interface HealthResponse {
  ok: boolean
  services: {
    postgres?: HealthServiceItem
    redis?: HealthServiceItem
    milvus?: HealthServiceItem
  }
  detail?: string
}

export type SystemHealth = 'healthy' | 'warning' | 'error'

export interface DashboardOverview {
  totalDocuments: number
  totalChunks: number
  totalSessions: number
  systemHealth: SystemHealth
  healthDetail: string
  recentDocuments: DocumentItem[]
  recentSessions: SessionSummaryItem[]
  health: HealthResponse | null
}

function resolveSystemHealth(health: HealthResponse | null): {
  systemHealth: SystemHealth
  healthDetail: string
} {
  if (!health) {
    return {
      systemHealth: 'error',
      healthDetail: '健康检查不可用',
    }
  }

  const services = health.services ?? {}
  const entries = [
    { name: 'Postgres', item: services.postgres },
    { name: 'Redis', item: services.redis },
    { name: 'Milvus', item: services.milvus },
  ]

  const failed = entries.filter((entry) => entry.item && !entry.item.ok)
  const okCount = entries.filter((entry) => entry.item?.ok).length

  if (health.ok && failed.length === 0) {
    return {
      systemHealth: 'healthy',
      healthDetail: 'Postgres / Redis / Milvus 均正常',
    }
  }

  if (okCount === 0) {
    return {
      systemHealth: 'error',
      healthDetail: failed.map((item) => item.name).join(' / ') || '依赖不可用',
    }
  }

  return {
    systemHealth: 'warning',
    healthDetail: `降级：${failed.map((item) => item.name).join(' / ')} 异常`,
  }
}

async function getHealth(): Promise<HealthResponse> {
  // /health 挂在根路径，不在 /api/v1 下
  return api.raw.get('/health', {
    baseURL: API_CONFIG.BASE_URL,
  }) as Promise<HealthResponse>
}

export const dashboardApi = {
  /**
   * 聚合工作台概览：文档 / 切片 / 会话 / 健康检查
   */
  getOverview: async (): Promise<DashboardOverview> => {
    const [documentsResult, sessionsResult, healthResult] = await Promise.allSettled([
      knowledgeApi.listDocuments(),
      chatApi.listSessions(50),
      getHealth(),
    ])

    const documents =
      documentsResult.status === 'fulfilled' ? documentsResult.value : ([] as DocumentItem[])
    const sessions =
      sessionsResult.status === 'fulfilled' ? sessionsResult.value : ([] as SessionSummaryItem[])
    const health = healthResult.status === 'fulfilled' ? healthResult.value : null

    const totalChunks = documents.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0)
    const { systemHealth, healthDetail } = resolveSystemHealth(health)

    const recentDocuments = [...documents]
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      )
      .slice(0, 5)

    const recentSessions = [...sessions]
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      )
      .slice(0, 5)

    return {
      totalDocuments: documents.length,
      totalChunks,
      totalSessions: sessions.length,
      systemHealth,
      healthDetail,
      recentDocuments,
      recentSessions,
      health,
    }
  },
}
