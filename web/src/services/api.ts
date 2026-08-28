import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { buildHttpDedupeKey, dedupeInflight } from '../utils/inflightRequest'

const API_BASE_URL = 'http://localhost:8000/api/v1'

const rawApi: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

rawApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // FormData 必须由浏览器/axios 自动附带 boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    return config
  },
  (error) => Promise.reject(error),
)

rawApi.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

type DataPromise<T> = Promise<T>

/**
 * 对 GET 做 in-flight 去重：相同 url+params 的并发请求只打一次网络。
 * POST/PATCH/DELETE 不去重，避免误合并写操作。
 */
async function get<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): DataPromise<T> {
  const key = buildHttpDedupeKey('GET', url, config?.params)
  return dedupeInflight(key, () => rawApi.get(url, config) as DataPromise<T>)
}

async function post<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): DataPromise<T> {
  return rawApi.post(url, data, config) as DataPromise<T>
}

async function patch<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): DataPromise<T> {
  return rawApi.patch(url, data, config) as DataPromise<T>
}

async function put<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): DataPromise<T> {
  return rawApi.put(url, data, config) as DataPromise<T>
}

async function del<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): DataPromise<T> {
  return rawApi.delete(url, config) as DataPromise<T>
}

/** 兼容原先 `api.get/post/...` 用法的轻量封装 */
const api = {
  get,
  post,
  patch,
  put,
  delete: del,
  /** 原始 axios 实例（特殊场景） */
  raw: rawApi,
  defaults: rawApi.defaults,
  interceptors: rawApi.interceptors,
}

export type { AxiosRequestConfig, AxiosResponse }
export default api
