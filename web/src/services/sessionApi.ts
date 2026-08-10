import api from './api'
import { ApiResponse, Session, Message } from '../types'

export const sessionApi = {
    /**
     * 创建新会话
     */
    createSession: async (title: string) => {
        try {
            return await api.post<ApiResponse<Session>>('/sessions', { title })
        } catch (error) {
            console.error('创建会话失败:', error)
            throw error
        }
    },

    /**
     * 获取会话详情
     */
    getSession: async (id: string) => {
        try {
            return await api.get<ApiResponse<Session>>(`/sessions/${id}`)
        } catch (error) {
            console.error('获取会话详情失败:', error)
            throw error
        }
    },

    /**
     * 发送消息
     */
    sendMessage: async (sessionId: string, content: string) => {
        try {
            return await api.post<ApiResponse<Message>>(`/sessions/${sessionId}/messages`, {
                content,
            })
        } catch (error) {
            console.error('发送消息失败:', error)
            throw error
        }
    },

    /**
     * 获取会话消息列表
     */
    getMessages: async (sessionId: string) => {
        try {
            return await api.get(`/sessions/${sessionId}/messages`)
        } catch (error) {
            console.error('获取消息列表失败:', error)
            return { code: 200, message: '成功', data: [] }
        }
    },

    /**
     * 删除会话
     */
    deleteSession: async (id: string) => {
        try {
            return await api.delete<ApiResponse<void>>(`/sessions/${id}`)
        } catch (error) {
            console.error('删除会话失败:', error)
            throw error
        }
    },
}
