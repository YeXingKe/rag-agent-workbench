import { getSettings } from '../config/settings.js';

const EMBEDDING_URL = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
const MAX_BATCH_SIZE = 25;

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
  const sorted = [...items].sort((left, right) => left.text_index - right.text_index);
  if (sorted.length !== texts.length) {
    throw new Error(`DashScope embedding count mismatch: expected ${texts.length}, got ${sorted.length}`);
  }
  return sorted.map((item) => item.embedding);
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += MAX_BATCH_SIZE) {
    const batch = texts.slice(index, index + MAX_BATCH_SIZE);
    const batchVectors = await requestEmbeddings(batch, 'document');
    vectors.push(...batchVectors);
  }
  return vectors;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await requestEmbeddings([text], 'query');
  return vector;
}

let cachedEmbeddings: Embeddings | null = null;

export function getEmbeddings(): Embeddings {
  if (!cachedEmbeddings) {
    cachedEmbeddings = {
      embedDocuments,
      embedQuery,
    };
  }
  return cachedEmbeddings;
}
