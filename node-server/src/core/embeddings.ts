/**
 * DashScope 文本向量化客户端
 *
 * 把字符串变成浮点向量，供 Milvus 做语义检索：
 * - 入库：text_type=document（embedDocuments）
 * - 查询：text_type=query（embedQuery）
 */
import { getSettings } from '../config/settings.js'; // 读 API Key 与 embedding 模型名

const EMBEDDING_URL = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding'; // 通义 Embedding HTTP 地址
const MAX_BATCH_SIZE = 25; // 单次请求最多 25 条文本

/** 向量化接口抽象，便于注入 / mock */
export interface Embeddings {
  embedDocuments: (texts: string[]) => Promise<number[][]>; // 多条文档 → 多条向量
  embedQuery: (text: string) => Promise<number[]>; // 一条查询 → 一条向量
}

/** API 返回的单条向量 */
interface DashScopeEmbeddingItem {
  embedding: number[]; // 浮点向量
  text_index: number; // 对应请求 texts 的下标
}

interface DashScopeEmbeddingResponse {
  output?: { // 成功时的输出
    embeddings?: DashScopeEmbeddingItem[]; // 向量列表，顺序可能乱
  };
  code?: string; // 业务错误码
  message?: string; // 业务错误信息
}

/**
 * 调用 DashScope Embedding API。
 *
 * @param textType document=入库语义；query=检索语义
 * @returns 与 texts 下标对齐的向量数组
 */
async function requestEmbeddings(texts: string[], textType: 'document' | 'query'): Promise<number[][]> {
  if (texts.length === 0) { // 没有文本就不用打 API
    return []; // 空数组
  }

  const settings = getSettings(); // 读当前配置
  if (!settings.dashscopeApiKey) { // 没配密钥
    throw new Error('DASHSCOPE_API_KEY is not configured'); // 直接失败，避免发空请求
  }

  const response = await fetch(EMBEDDING_URL, { // 发 HTTP POST
    method: 'POST', // 创建向量
    headers: {
      Authorization: `Bearer ${settings.dashscopeApiKey}`, // Bearer Token
      'Content-Type': 'application/json', // JSON 体
    },
    body: JSON.stringify({ // 请求体
      model: settings.embeddingModel, // 如 text-embedding-v1
      input: { texts }, // 待向量化的字符串列表
      parameters: { text_type: textType }, // document 或 query
    }),
  });

  const payload = (await response.json()) as DashScopeEmbeddingResponse; // 解析 JSON
  if (!response.ok || payload.code) { // HTTP 失败或业务 code
    throw new Error( // 拼出可读错误
      `DashScope embedding failed: ${payload.code ?? response.status} ${payload.message ?? response.statusText}`,
    );
  }

  const items = payload.output?.embeddings ?? []; // 取出向量项，缺省空数组
  const sorted = [...items].sort((left, right) => left.text_index - right.text_index); // 按输入下标还原顺序
  if (sorted.length !== texts.length) { // 条数对不上说明丢了或多余
    throw new Error(`DashScope embedding count mismatch: expected ${texts.length}, got ${sorted.length}`);
  }
  return sorted.map((item) => item.embedding); // 只要向量数字，不要 text_index
}

/**
 * 批量向量化文档文本（入库侧）。
 * 自动按 MAX_BATCH_SIZE 分批。
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = []; // 按原顺序累积结果
  for (let index = 0; index < texts.length; index += MAX_BATCH_SIZE) { // 每次跳 25 条
    const batch = texts.slice(index, index + MAX_BATCH_SIZE); // 本批文本
    const batchVectors = await requestEmbeddings(batch, 'document'); // 入库语义
    vectors.push(...batchVectors); // 追加到总结果
  }
  return vectors; // 与 texts 一一对应
}

/** 单条查询文本向量化（检索侧）。 */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await requestEmbeddings([text], 'query'); // 包成数组再拆出第一条
  return vector; // 查询向量
}

let cachedEmbeddings: Embeddings | null = null; // 门面单例

/** 获取 Embeddings 门面（进程内单例）。 */
export function getEmbeddings(): Embeddings {
  if (!cachedEmbeddings) { // 第一次调用才创建
    cachedEmbeddings = {
      embedDocuments, // 绑定入库函数
      embedQuery, // 绑定查询函数
    };
  }
  return cachedEmbeddings; // 之后都返回同一对象
}
