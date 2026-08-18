/**
 * Server-Sent Events (SSE) 格式化工具
 *
 * 供流式 chat 等接口写出 event/data 帧。
 */

/**
 * 格式化为标准 SSE 帧：`event` + JSON `data`，以空行结束。
 *
 * @param event 事件名（如 token / done / error）
 * @param data  将被 JSON.stringify 的载荷
 */
export function formatSseEvent(event: string, data: unknown): string {
  const payload = JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}
