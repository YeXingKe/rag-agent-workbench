/**
 * 进行中的异步请求去重。
 *
 * 同一 key 在 Promise 未结束前复用同一个 Promise，避免 React Strict Mode
 * 或短时间重复触发导致的「同接口打两次」。
 */

const inflightRequests = new Map<string, Promise<unknown>>()

/**
 * @param key 去重键，例如 `GET:/documents`
 * @param factory 真正发起请求的工厂函数
 */
export function dedupeInflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key)
  if (existing) {
    return existing as Promise<T>
  }

  const promise = factory().finally(() => {
    if (inflightRequests.get(key) === promise) {
      inflightRequests.delete(key)
    }
  })

  inflightRequests.set(key, promise)
  return promise
}

/** 构造稳定的 HTTP 去重键 */
export function buildHttpDedupeKey(
  method: string,
  url: string,
  params?: unknown,
): string {
  const normalizedMethod = method.toUpperCase()
  const paramsPart = params === undefined ? '' : JSON.stringify(params)
  return `${normalizedMethod}:${url}:${paramsPart}`
}
