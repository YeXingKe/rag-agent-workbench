import { z } from 'zod';

export const serviceHealthItemSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable().optional().default(null),
});

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  services: z.record(serviceHealthItemSchema).default({}),
});

export type ServiceHealthItem = z.infer<typeof serviceHealthItemSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
