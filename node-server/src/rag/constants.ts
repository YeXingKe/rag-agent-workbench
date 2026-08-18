/**
 * RAG 切分默认参数。
 *
 * 这里先采用最基础、最稳妥的一组默认值。
 * 后续接入前端调试台时，可以把这些参数暴露成可配置项。
 */

/** 默认 chunk 长度（字符数）。 */
export const DEFAULT_CHUNK_SIZE = 500;

/** 相邻 chunk 的重叠长度，用于降低跨边界语义断裂。 */
export const DEFAULT_CHUNK_OVERLAP = 50;

/**
 * 默认分隔符优先级：结构更强的分隔符优先。
 * 这样能尽量在段落/句读边界截断，保留语义完整性。
 */
export const DEFAULT_SEPARATORS = ['\n\n', '\n', '。', '！', '？', '；', '，', ' '];
