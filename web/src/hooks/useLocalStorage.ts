import { useState, useEffect } from 'react'

/**
 * 带持久化的 State Hook（使用 localStorage）
 * @param key - localStorage 的键名
 * @param initialValue - 初始值
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key)
            return item ? JSON.parse(item) : initialValue
        } catch (error) {
            console.error(`Error loading ${key} from localStorage:`, error)
            return initialValue
        }
    })

    const setValue = (value: T) => {
        try {
            setStoredValue(value)
            window.localStorage.setItem(key, JSON.stringify(value))
        } catch (error) {
            console.error(`Error saving ${key} to localStorage:`, error)
        }
    }

    return [storedValue, setValue]
}
