import api from './api'
import { buildHttpDedupeKey, dedupeInflight } from '../utils/inflightRequest'

export interface DocumentItem {
    id: string
    knowledge_base: string
    filename: string
    file_type: string
    source_path?: string | null
    file_size?: number | null
    status: string
    chunk_count: number
    summary?: string | null
    created_at: string
    updated_at: string
}

export interface SplitterOption {
    name: string
    description: string
}

export interface DocumentMutationResponse {
    document: DocumentItem
    message: string
}

export const knowledgeApi = {
    /**
     * 获取文档列表
     */
    listDocuments: async () => {
        try {
            return await api.get<DocumentItem[]>('/documents')
        } catch (error) {
            console.error('获取文档列表失败:', error)
            throw error
        }
    },

    /**
     * 获取切分策略选项
     */
    getSplitterOptions: async () => {
        try {
            return await api.get<SplitterOption[]>('/documents/splitters/options')
        } catch (error) {
            console.error('获取切分策略失败:', error)
            throw error
        }
    },

    /**
     * 上传文档（同文件+参数的并发请求会合并为一次）
     */
    uploadDocument: async (
        file: File,
        options?: {
            knowledgeBase?: string
            preferredSplitter?: string | null
        },
    ) => {
        const formData = new FormData()
        formData.append('file', file)

        if (options?.knowledgeBase?.trim()) {
            formData.append('knowledge_base', options.knowledgeBase.trim())
        }
        if (options?.preferredSplitter?.trim()) {
            formData.append('preferred_splitter', options.preferredSplitter.trim())
        }

        const dedupeKey = buildHttpDedupeKey('POST', '/documents/upload', {
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            knowledgeBase: options?.knowledgeBase ?? '',
            preferredSplitter: options?.preferredSplitter ?? '',
        })

        try {
            return await dedupeInflight(dedupeKey, () =>
                api.post<DocumentMutationResponse>('/documents/upload', formData, {
                    timeout: 180_000,
                }),
            )
        } catch (error) {
            console.error('上传文档失败:', error)
            throw error
        }
    },

    /**
     * 纯文本入库
     */
    ingestText: async (payload: {
        filename: string
        content: string
        knowledge_base?: string
        preferred_splitter?: string | null
    }) => {
        try {
            return await api.post<DocumentMutationResponse>('/documents/ingest-text', payload, {
                timeout: 180_000,
            })
        } catch (error) {
            console.error('文本入库失败:', error)
            throw error
        }
    },

    /**
     * 获取文档详情
     */
    getDocument: async (id: string) => {
        try {
            return await api.get<DocumentItem>(`/documents/${id}`)
        } catch (error) {
            console.error('获取文档详情失败:', error)
            throw error
        }
    },

    /**
     * 删除文档
     */
    deleteDocument: async (id: string) => {
        try {
            return await api.delete<void>(`/documents/${id}`)
        } catch (error) {
            console.error('删除文档失败:', error)
            throw error
        }
    },

    /**
     * 获取文档的 Chunk 列表
     */
    getDocumentChunks: async (documentId: string) => {
        try {
            return await api.get(`/documents/${documentId}/chunks`)
        } catch (error) {
            console.error('获取文档 Chunk 失败:', error)
            return { code: 200, message: '成功', data: [] }
        }
    },

    /**
     * 重新处理文档
     */
    reprocessDocument: async (id: string) => {
        try {
            return await api.post<void>(`/documents/${id}/reprocess`)
        } catch (error) {
            console.error('重新处理文档失败:', error)
            throw error
        }
    },
}
