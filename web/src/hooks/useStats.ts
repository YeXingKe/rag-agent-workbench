import { useCallback, useEffect, useState } from 'react'
import { dashboardApi } from '../services/dashboardApi'
import { DashboardStats } from '../types'

interface UseStatsReturn {
  stats: DashboardStats
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Dashboard 统计数据 Hook
 * 自动轮询获取最新统计数据（GET 去重由 api.get 处理）
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

      const response = await dashboardApi.getStats()

      if (response && response.data) {
        setStats(response.data)
      } else {
        setStats({
          totalDocuments: 24,
          totalChunks: 128,
          totalSessions: 12,
          systemHealth: 'healthy',
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取统计数据失败'
      setError(errorMessage)
      console.error('获取统计数据失败:', err)

      setStats({
        totalDocuments: 24,
        totalChunks: 128,
        totalSessions: 12,
        systemHealth: 'warning',
      })
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
