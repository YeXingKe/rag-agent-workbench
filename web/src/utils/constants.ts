/**
 * 应用常量配置
 */

// API 配置
export const API_CONFIG = {
    BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
    TIMEOUT: 10000,
    RETRY_COUNT: 3,
} as const

// 文档配置
export const DOCUMENT_CONFIG = {
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
    ALLOWED_TYPES: ['pdf', 'docx', 'txt', 'md'] as const,
    ALLOWED_MIME_TYPES: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
    ] as const,
} as const

// 分页配置
export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 20,
    PAGE_SIZE_OPTIONS: [10, 20, 50, 100] as const,
} as const

// 主题配置
export const THEME = {
    COLORS: {
        PRIMARY: '#3b82f6',
        SUCCESS: '#10b981',
        WARNING: '#f59e0b',
        ERROR: '#ef4444',
        INFO: '#3b82f6',
    },
    TRANSITION: {
        FAST: '150ms',
        NORMAL: '300ms',
        SLOW: '500ms',
    },
} as const

// 本地存储键名
export const STORAGE_KEYS = {
    TOKEN: 'rag_token',
    USER: 'rag_user',
    THEME: 'rag_theme',
    SIDEBAR: 'rag_sidebar',
} as const

// 路由路径
export const ROUTES = {
    DASHBOARD: '/',
    DOCUMENTS: '/documents',
    CHUNKS: '/chunks',
    AGENT: '/agent',
    LOGIN: '/login',
    SETTINGS: '/settings',
} as const

// 文档状态
export const DOCUMENT_STATUS = {
    PROCESSING: 'processing',
    SUCCESS: 'success',
    FAILED: 'failed',
} as const

// 系统健康状态
export const HEALTH_STATUS = {
    HEALTHY: 'healthy',
    WARNING: 'warning',
    ERROR: 'error',
} as const

// 消息类型
export const MESSAGE_ROLE = {
    USER: 'user',
    ASSISTANT: 'assistant',
} as const
