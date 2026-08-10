/**
 * 格式化工具函数
 */

/**
 * 格式化文件大小
 * @param bytes - 字节数
 * @returns 格式化后的字符串 (如: "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const k = 1024
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`
}

/**
 * 格式化日期
 * @param date - 日期字符串或 Date 对象
 * @param format - 格式类型
 * @returns 格式化后的日期字符串
 */
export function formatDate(
    date: string | Date,
    format: 'full' | 'date' | 'time' | 'relative' = 'full'
): string {
    const d = typeof date === 'string' ? new Date(date) : date

    if (isNaN(d.getTime())) {
        return '无效日期'
    }

    switch (format) {
        case 'full':
            return d.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            })
        case 'date':
            return d.toLocaleDateString('zh-CN')
        case 'time':
            return d.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
            })
        case 'relative':
            return formatRelativeTime(d)
        default:
            return d.toLocaleString('zh-CN')
    }
}

/**
 * 格式化相对时间
 * @param date - 日期
 * @returns "刚刚"、"5分钟前"、"2小时前"等
 */
export function formatRelativeTime(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 30) return `${days}天前`

    return formatDate(date, 'date')
}

/**
 * 格式化数字（千分位）
 * @param num - 数字
 * @returns 格式化后的字符串 (如: "1,234,567")
 */
export function formatNumber(num: number): string {
    return num.toLocaleString('zh-CN')
}

/**
 * 格式化百分比
 * @param value - 值
 * @param total - 总数
 * @param decimals - 小数位数
 * @returns 百分比字符串 (如: "75.5%")
 */
export function formatPercentage(
    value: number,
    total: number,
    decimals: number = 1
): string {
    if (total === 0) return '0%'
    return `${((value / total) * 100).toFixed(decimals)}%`
}

/**
 * 截断文本
 * @param text - 文本
 * @param maxLength - 最大长度
 * @param suffix - 后缀（默认 "..."）
 * @returns 截断后的文本
 */
export function truncateText(
    text: string,
    maxLength: number,
    suffix: string = '...'
): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength - suffix.length) + suffix
}

/**
 * 高亮搜索关键词
 * @param text - 文本
 * @param keyword - 关键词
 * @returns 带高亮的 HTML 字符串
 */
export function highlightKeyword(text: string, keyword: string): string {
    if (!keyword) return text
    const regex = new RegExp(`(${keyword})`, 'gi')
    return text.replace(regex, '<mark>$1</mark>')
}
