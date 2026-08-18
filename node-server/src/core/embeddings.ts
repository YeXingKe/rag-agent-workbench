/**
 * DashScope 文本向量化客户端
 *
 * 文档入库用 text_type=document，查询用 query；
 * 大批量按 MAX_BATCH_SIZE 分批请求，避免单次超限。
 */
import { getSettings } from '../config/settings.js';

const EMBEDDING_URL = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
/** DashScope 单次请求文本条数上限。 */
const MAX_BATCH_SIZE = 25;

/** 向量化接口抽象，便于注入 / mock。 */
export interface Embeddings {
  embedDocuments: (texts: string[]) => Promise<number[][]>;
  embedQuery: (text: string) => Promise<number[]>;
}

interface DashScopeEmbeddingItem {
  embedding: number[];
  text_index: number;
}

interface DashScopeEmbeddingResponse {
  output?: {
    embeddings?: DashScopeEmbeddingItem[];
  };
  code?: string;
  message?: string;
}

/**
 * 调用 DashScope Embedding API。
 *
 * 按 text_index 排序后返回，保证与输入 texts 顺序一致。
 */
async function requestEmbeddings(texts: string[], textType: 'document' | 'query'): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const settings = getSettings();
  if (!settings.dashscopeApiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.dashscopeApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.embeddingModel,
      input: { texts },
      parameters: { text_type: textType },
    }),
  });

  const payload = (await response.json()) as DashScopeEmbeddingResponse;
  if (!response.ok || payload.code) {
    throw new Error(
      `DashScope embedding failed: ${payload.code ?? response.status} ${payload.message ?? response.statusText}`,
    );
  }

  const items = payload.output?.embeddings ?? [];
  // API 可能乱序返回，按 text_index 还原输入顺序
  const sorted = [...items].sort((left, right) => left.text_index - right.text_index);
  if (sorted.length !== texts.length) {
    throw new Error(`DashScope embedding count mismatch: expected ${texts.length}, got ${sorted.length}`);
  }
  return sorted.map((item) => item.embedding);
}

/**
 * 批量向量化文档文本（入库侧）。
 * 自动按 MAX_BATCH_SIZE 分批。
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += MAX_BATCH_SIZE) {
    const batch = texts.slice(index, index + MAX_BATCH_SIZE);
    const batchVectors = await requestEmbeddings(batch, 'document');
    vectors.push(...batchVectors);
  }
  return vectors;
}

/** 单条查询文本向量化（检索侧）。 */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await requestEmbeddings([text], 'query');
  return vector;
}

let cachedEmbeddings: Embeddings | null = null;

/** 获取 Embeddings 门面（单例）。 */
export function getEmbeddings(): Embeddings {
  if (!cachedEmbeddings) {
    cachedEmbeddings = {
      embedDocuments,
      embedQuery,
    };
  }
  return cachedEmbeddings;
}
