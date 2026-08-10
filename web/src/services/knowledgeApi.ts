import api from './api'
import { ApiResponse, Document } from '../types'

export const knowledgeApi = {
    /**
     * 上传文档
     */
    uploadDocument: async (file: File) => {
        const formData = new FormData()
        formData.append('file', file)

        try {
            return await api.post<ApiResponse<Document>>('/documents/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })
        } catch (error) {
            console.error('上传文档失败:', error)
            throw error
        }
    },

    /**
     * 获取文档详情
     */
    getDocument: async (id: string) => {
        try {
            return await api.get<ApiResponse<Document>>(`/documents/${id}`)
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
            return await api.delete<ApiResponse<void>>(`/documents/${id}`)
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
            return await api.post<ApiResponse<void>>(`/documents/${id}/reprocess`)
        } catch (error) {
            console.error('重新处理文档失败:', error)
            throw error
        }
    },
}
