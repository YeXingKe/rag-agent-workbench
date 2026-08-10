import api from './api'
import { ApiResponse, DashboardStats } from '../types'

export const dashboardApi = {
    getStats: () => api.get<ApiResponse<DashboardStats>>('/dashboard/stats'),
    getDocuments: () => api.get('/documents'),
    getChunks: () => api.get('/chunks'),
    getSessions: () => api.get('/sessions'),
}
