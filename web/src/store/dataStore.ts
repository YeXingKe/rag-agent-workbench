import { create } from 'zustand'
import { Document, Chunk, Session } from '../types'

interface DataState {
    // Documents
    documents: Document[]
    setDocuments: (docs: Document[]) => void
    addDocument: (doc: Document) => void
    updateDocument: (id: string, updates: Partial<Document>) => void
    removeDocument: (id: string) => void

    // Chunks
    chunks: Chunk[]
    setChunks: (chunks: Chunk[]) => void
    addChunk: (chunk: Chunk) => void
    removeChunk: (id: string) => void

    // Sessions
    sessions: Session[]
    setSessions: (sessions: Session[]) => void
    addSession: (session: Session) => void
    updateSession: (id: string, updates: Partial<Session>) => void
    removeSession: (id: string) => void

    // Loading & Error
    loading: boolean
    error: string | null
    setLoading: (loading: boolean) => void
    setError: (error: string | null) => void

    // Utility
    clearAll: () => void
}

/**
 * 数据状态管理
 * 管理文档、Chunk、会话等业务数据
 */
export const useDataStore = create<DataState>((set) => ({
    // Documents
    documents: [],
    setDocuments: (docs) => set({ documents: docs }),
    addDocument: (doc) =>
        set((state) => ({ documents: [...state.documents, doc] })),
    updateDocument: (id, updates) =>
        set((state) => ({
            documents: state.documents.map((doc) =>
                doc.id === id ? { ...doc, ...updates } : doc
            ),
        })),
    removeDocument: (id) =>
        set((state) => ({
            documents: state.documents.filter((doc) => doc.id !== id),
        })),

    // Chunks
    chunks: [],
    setChunks: (chunks) => set({ chunks }),
    addChunk: (chunk) => set((state) => ({ chunks: [...state.chunks, chunk] })),
    removeChunk: (id) =>
        set((state) => ({
            chunks: state.chunks.filter((chunk) => chunk.id !== id),
        })),

    // Sessions
    sessions: [],
    setSessions: (sessions) => set({ sessions }),
    addSession: (session) =>
        set((state) => ({ sessions: [...state.sessions, session] })),
    updateSession: (id, updates) =>
        set((state) => ({
            sessions: state.sessions.map((session) =>
                session.id === id ? { ...session, ...updates } : session
            ),
        })),
    removeSession: (id) =>
        set((state) => ({
            sessions: state.sessions.filter((session) => session.id !== id),
        })),

    // Loading & Error
    loading: false,
    error: null,
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    // Utility
    clearAll: () =>
        set({
            documents: [],
            chunks: [],
            sessions: [],
            loading: false,
            error: null,
        }),
}))
