import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
    // 侧边栏状态
    sidebarOpen: boolean
    setSidebarOpen: (open: boolean) => void
    toggleSidebar: () => void

    // 主题模式
    isDarkMode: boolean
    setDarkMode: (dark: boolean) => void
    toggleDarkMode: () => void

    // 加载状态
    globalLoading: boolean
    setGlobalLoading: (loading: boolean) => void

    // 通知
    notifications: Notification[]
    addNotification: (notification: Omit<Notification, 'id'>) => void
    removeNotification: (id: string) => void
    clearNotifications: () => void
}

interface Notification {
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    duration?: number
}

/**
 * UI 状态管理
 * 持久化到 localStorage
 */
export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            // 侧边栏
            sidebarOpen: true,
            setSidebarOpen: (open) => set({ sidebarOpen: open }),
            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

            // 主题
            isDarkMode: true,
            setDarkMode: (dark) => set({ isDarkMode: dark }),
            toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),

            // 全局加载
            globalLoading: false,
            setGlobalLoading: (loading) => set({ globalLoading: loading }),

            // 通知系统
            notifications: [],
            addNotification: (notification) =>
                set((state) => ({
                    notifications: [
                        ...state.notifications,
                        { ...notification, id: Date.now().toString() },
                    ],
                })),
            removeNotification: (id) =>
                set((state) => ({
                    notifications: state.notifications.filter((n) => n.id !== id),
                })),
            clearNotifications: () => set({ notifications: [] }),
        }),
        {
            name: 'rag-ui-storage',
            partialize: (state) => ({
                sidebarOpen: state.sidebarOpen,
                isDarkMode: state.isDarkMode,
            }),
        }
    )
)
