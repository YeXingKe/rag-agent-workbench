export interface Document {
    id: string
    name: string
    size: number
    type: 'pdf' | 'docx' | 'txt' | 'md'
    uploadedAt: string
    status: 'processing' | 'success' | 'failed'
    chunks: number
}

export interface Chunk {
    id: string
    documentId: string
    content: string
    embedding: number[]
    createdAt: string
}

export interface Session {
    id: string
    title: string
    createdAt: string
    updatedAt: string
}

export interface DashboardStats {
    totalDocuments: number
    totalChunks: number
    totalSessions: number
    systemHealth: 'healthy' | 'warning' | 'error'
}
