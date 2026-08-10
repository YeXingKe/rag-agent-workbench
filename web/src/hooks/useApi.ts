import { useState, useEffect, DependencyList } from 'react'

interface UseApiReturn<T> {
    data: T | null
    loading: boolean
    error: string | null
    refetch: () => void
}

/**
 * 通用 API 请求 Hook
 * @param apiCall - 返回 Promise 的 API 函数
 * @param dependencies - 依赖项数组，变化时重新请求
 * @returns { data, loading, error, refetch }
 */
export function useApi<T>(
    apiCall: () => Promise<T>,
    dependencies: DependencyList = []
): UseApiReturn<T> {
    const [data, setData] = useState<T | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchData = async () => {
        try {
            setLoading(true)
            setError(null)
            const result = await apiCall()
            setData(result)
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '未知错误'
            setError(errorMessage)
            console.error('API 请求失败:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, dependencies)

    return { data, loading, error, refetch: fetchData }
}
