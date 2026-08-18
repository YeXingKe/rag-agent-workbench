/**
 * 通用健康检查相关 Zod Schema。
 *
 * 用于描述依赖服务（如 PG / Redis / Milvus）的聚合健康状态。
 */

import { z } from 'zod';

/** 单个依赖服务的健康项。 */
export const serviceHealthItemSchema = z.object({
  /** 该依赖是否可用 */
  ok: z.boolean(),
  /** 失败时的错误信息；成功时可为 null */
  error: z.string().nullable().optional().default(null),
});

/** 整体健康检查响应。 */
export const healthResponseSchema = z.object({
  /** 全局是否健康（通常为各服务 ok 的聚合） */
  ok: z.boolean(),
  /** 各依赖服务名 → 健康项 */
  services: z.record(serviceHealthItemSchema).default({}),
});

export type ServiceHealthItem = z.infer<typeof serviceHealthItemSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
