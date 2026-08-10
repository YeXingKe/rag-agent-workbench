import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
    id: string
    username: string
    email: string
    role: 'admin' | 'user'
    avatar?: string
}

interface UserState {
    user: User | null
    isAuthenticated: boolean
    token: string | null

    // Actions
    setUser: (user: User) => void
    setToken: (token: string) => void
    logout: () => void
    updateProfile: (updates: Partial<User>) => void
}

/**
 * 用户状态管理
 * 持久化到 localStorage
 */
export const useUserStore = create<UserState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            token: null,

            setUser: (user) =>
                set({
                    user,
                    isAuthenticated: true,
                }),

            setToken: (token) => {
                set({ token })
                localStorage.setItem('token', token)
            },

            logout: () => {
                set({
                    user: null,
                    isAuthenticated: false,
                    token: null,
                })
                localStorage.removeItem('token')
            },

            updateProfile: (updates) =>
                set((state) => ({
                    user: state.user ? { ...state.user, ...updates } : null,
                })),
        }),
        {
            name: 'rag-user-storage',
        }
    )
)
