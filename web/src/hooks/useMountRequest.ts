import { useEffect, type DependencyList } from 'react'

/**
 * 组件挂载（及依赖变化）时执行异步副作用，自动忽略过期结果。
 *
 * 用于替代手写 `useEffect(() => { void load() }, [])`，
 * 配合 `api.get` 去重可消除 Strict Mode 下的双请求。
 */
export function useMountRequest(
  loader: () => void | Promise<void>,
  dependencies: DependencyList = [],
): void {
  useEffect(() => {
    let active = true

    const run = async () => {
      await loader()
      if (!active) {
        return
      }
    }

    void run()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)
}
