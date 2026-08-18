/**
 * 文本清洗与粗略 token 估算工具
 *
 * 用于入库 / 切分前的规范化，以及 chunk token_count 的近似计算。
 */

/**
 * 规范化文本：统一换行、压缩多余空行与连续空白。
 */
export function cleanText(text: string): string {
  let normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  normalizedText = normalizedText.replace(/\n{3,}/g, '\n\n');
  normalizedText = normalizedText.replace(/[ \t]{2,}/g, ' ');
  return normalizedText;
}

/**
 * 粗略估算 token 数（约 4 字符 ≈ 1 token）。
 * 空文本返回 0；非空至少返回 1。
 */
export function estimateTokenCount(text: string): number {
  const cleanedText = cleanText(text);
  if (!cleanedText) {
    return 0;
  }
  return Math.max(1, Math.ceil(cleanedText.length / 4));
}
