import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

interface UseApiReturn<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * 通用 API 请求 Hook（兼容 React Strict Mode）。
 *
 * - 卸载 / Strict Mode 二次挂载时忽略过期结果，避免 setState 警告
 * - 配合 api.get 的 in-flight 去重，开发态双调用通常只会打 1 次网络
 *
 * @param apiCall 返回 Promise 的请求函数
 * @param dependencies 依赖变化时重新请求
 */
export function useApi<T>(
  apiCall: () => Promise<T>,
  dependencies: DependencyList = [],
): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const apiCallRef = useRef(apiCall)
  apiCallRef.current = apiCall

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiCallRef.current()
      setData(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误'
      setError(errorMessage)
      console.error('API 请求失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await apiCallRef.current()
        if (!active) {
          return
        }
        setData(result)
      } catch (err) {
        if (!active) {
          return
        }
        const errorMessage = err instanceof Error ? err.message : '未知错误'
        setError(errorMessage)
        console.error('API 请求失败:', err)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return { data, loading, error, refetch: fetchData }
}
