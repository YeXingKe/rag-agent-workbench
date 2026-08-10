/**
 * 验证工具函数
 */

import { DOCUMENT_CONFIG } from './constants'

/**
 * 验证结果接口
 */
export interface ValidationResult {
    valid: boolean
    errors: string[]
}

/**
 * 验证文件类型
 * @param file - 文件对象
 * @returns 是否有效
 */
export function validateFileType(file: File): ValidationResult {
    const errors: string[] = []

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const isValidExtension = DOCUMENT_CONFIG.ALLOWED_TYPES.includes(fileExtension as any)

    if (!isValidExtension) {
        errors.push(
            `不支持的文件类型。允许的类型：${DOCUMENT_CONFIG.ALLOWED_TYPES.join(', ')}`
        )
    }

    const isValidMimeType = DOCUMENT_CONFIG.ALLOWED_MIME_TYPES.includes(file.type as any)
    if (!isValidMimeType) {
        errors.push('文件 MIME 类型不正确')
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}

/**
 * 验证文件大小
 * @param file - 文件对象
 * @returns 是否有效
 */
export function validateFileSize(file: File): ValidationResult {
    const errors: string[] = []

    if (file.size > DOCUMENT_CONFIG.MAX_FILE_SIZE) {
        const maxSizeMB = DOCUMENT_CONFIG.MAX_FILE_SIZE / (1024 * 1024)
        errors.push(`文件大小不能超过 ${maxSizeMB}MB`)
    }

    if (file.size === 0) {
        errors.push('文件不能为空')
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}

/**
 * 验证邮箱
 * @param email - 邮箱地址
 * @returns 是否有效
 */
export function validateEmail(email: string): ValidationResult {
    const errors: string[] = []
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(email)) {
        errors.push('邮箱格式不正确')
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}

/**
 * 验证密码强度
 * @param password - 密码
 * @returns 验证结果
 */
export function validatePassword(password: string): ValidationResult {
    const errors: string[] = []

    if (password.length < 8) {
        errors.push('密码长度至少为 8 位')
    }

    if (!/[A-Z]/.test(password)) {
        errors.push('密码必须包含至少一个大写字母')
    }

    if (!/[a-z]/.test(password)) {
        errors.push('密码必须包含至少一个小写字母')
    }

    if (!/[0-9]/.test(password)) {
        errors.push('密码必须包含至少一个数字')
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}

/**
 * 验证 URL
 * @param url - URL 字符串
 * @returns 是否有效
 */
export function validateURL(url: string): ValidationResult {
    const errors: string[] = []

    try {
        new URL(url)
    } catch {
        errors.push('URL 格式不正确')
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}

/**
 * 验证必填字段
 * @param value - 值
 * @param fieldName - 字段名
 * @returns 验证结果
 */
export function validateRequired(value: any, fieldName: string = '字段'): ValidationResult {
    const errors: string[] = []

    if (value === null || value === undefined || value === '') {
        errors.push(`${fieldName}不能为空`)
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}
