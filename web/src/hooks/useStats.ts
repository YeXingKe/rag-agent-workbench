import { useState, useEffect } from 'react'
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
 * 自动轮询获取最新统计数据
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

    const fetchStats = async () => {
        try {
            setLoading(true)
            setError(null)

            // 这里调用真实 API
            const response = await dashboardApi.getStats()

            // 如果 API 返回成功，更新数据
            if (response && response.data) {
                setStats(response.data)
            } else {
                // 使用模拟数据（开发阶段）
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

            // 失败时使用模拟数据
            setStats({
                totalDocuments: 24,
                totalChunks: 128,
                totalSessions: 12,
                systemHealth: 'warning',
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStats()

        // 自动刷新
        if (autoRefresh) {
            const timer = setInterval(fetchStats, intervalMs)
            return () => clearInterval(timer)
        }
    }, [autoRefresh, intervalMs])

    return { stats, loading, error, refresh: fetchStats }
}
