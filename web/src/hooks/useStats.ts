import { useCallback, useEffect, useState } from 'react'
import { dashboardApi, type DashboardOverview } from '../services/dashboardApi'
import type { DashboardStats } from '../types'

interface UseStatsReturn {
  stats: DashboardStats
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Dashboard 统计数据 Hook
 * 通过聚合接口拉取文档 / 切片 / 会话 / 健康状态
 */
export function useStats(autoRefresh: boolean = false, intervalMs: number = 30000): UseStatsReturn {
  const [stats, setStats] = useState<DashboardStats>({
    totalDocuments: 0,
    totalChunks: 0,
    totalSessions: 0,
    systemHealth: 'healthy',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const overview: DashboardOverview = await dashboardApi.getOverview()
      setStats({
        totalDocuments: overview.totalDocuments,
        totalChunks: overview.totalChunks,
        totalSessions: overview.totalSessions,
        systemHealth: overview.systemHealth,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取统计数据失败'
      setError(errorMessage)
      console.error('获取统计数据失败:', err)
      setStats((prev) => ({
        ...prev,
        systemHealth: 'warning',
      }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    const run = async () => {
      await fetchStats()
      if (!active) {
        return
      }
    }

    void run()

    if (autoRefresh) {
      const timer = setInterval(() => {
        void run()
      }, intervalMs)
      return () => {
        active = false
        clearInterval(timer)
      }
    }

    return () => {
      active = false
    }
  }, [autoRefresh, intervalMs, fetchStats])

  return { stats, loading, error, refresh: fetchStats }
}
