/**
 * Milvus 向量库封装
 *
 * 负责集合创建/加载、文本入库（embedding + insert）、
 * 余弦相似度检索，以及按 id 删除。
 */
import { randomUUID } from 'node:crypto';
import net from 'node:net';

import { DataType, MilvusClient } from '@zilliz/milvus2-sdk-node';

import { getSettings } from '../config/settings.js';
import { getEmbeddings } from './embeddings.js';

/** 检索返回的文档结构（内容 + 元数据）。 */
export interface VectorDocument {
  pageContent: string;
  metadata: Record<string, unknown>;
}

let milvusClient: MilvusClient | null = null;
/** 本进程内已确保存在并加载的集合名，避免重复 ensure。 */
const ensuredCollections = new Set<string>();

/** SDK address 不需要协议前缀，去掉 http(s)://。 */
function toMilvusAddress(uri: string): string {
  return uri.replace(/^https?:\/\//i, '');
}

/** 将 Milvus SDK / gRPC 错误转成可读文案，便于日志与健康检查展示。 */
function formatMilvusError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** 清空已缓存的 Milvus 客户端，连接失败后便于下次重连。 */
export function resetMilvusClient(): void {
  milvusClient = null;
}

/**
 * 通过 TCP 探测 Milvus 端口是否可达。
 *
 * 健康检查使用此方式，避免 Milvus SDK 在连接失败时抛出未捕获的 gRPC rejection。
 */
export async function checkMilvusReachable(timeoutMs = 2_000): Promise<boolean> {
  const settings = getSettings();
  const host = settings.milvusHost || '127.0.0.1';
  const port = settings.milvusPort || 19_530;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * 供 /health 使用的探活。
 *
 * - 本地 Milvus：先做 TCP 探测
 * - Zilliz Cloud（有 Token 或 https URI）：直接用 SDK listCollections，避免误用 19530
 */
export async function probeMilvusHealth(): Promise<{ ok: boolean; error: string | null }> {
  const settings = getSettings();
  const uri = settings.resolvedMilvusUri;
  const isCloud =
    Boolean(settings.milvusToken) || /^https:\/\//i.test(uri) || uri.includes('zilliz.com');

  if (!isCloud) {
    const reachable = await checkMilvusReachable();
    if (!reachable) {
      resetMilvusClient();
      return {
        ok: false,
        error: `Milvus is not reachable at ${uri}`,
      };
    }
    return { ok: true, error: null };
  }

  try {
    const client = getMilvusClient();
    await client.listCollections();
    return { ok: true, error: null };
  } catch (error) {
    resetMilvusClient();
    return {
      ok: false,
      error: `Milvus cloud probe failed (${uri}): ${formatMilvusError(error)}`,
    };
  }
}

/** 获取 MilvusClient 单例（Zilliz 需带 token）。 */
export function getMilvusClient(): MilvusClient {
  if (milvusClient) {
    return milvusClient;
  }
  const settings = getSettings();
  const options: ConstructorParameters<typeof MilvusClient>[0] = {
    address: toMilvusAddress(settings.resolvedMilvusUri),
    timeout: 15_000,
  };
  if (settings.milvusToken) {
    options.token = settings.milvusToken;
    // Zilliz Serverless 走 HTTPS
    options.ssl = true;
  }
  milvusClient = new MilvusClient(options);
  return milvusClient;
}

/**
 * 确保集合存在并已加载。
 *
 * - 不存在则按 schema（id/vector/text/metadata）创建，向量索引为 COSINE AUTOINDEX
 * - load 失败时补建索引再加载
 */
export async function ensureCollection(collectionName?: string): Promise<string> {
  const settings = getSettings();
  const name = collectionName || settings.milvusCollection;
  if (ensuredCollections.has(name)) {
    return name;
  }

  const client = getMilvusClient();
  let existing;
  try {
    existing = await client.hasCollection({ collection_name: name });
  } catch (error) {
    resetMilvusClient();
    throw new Error(`Milvus unavailable: ${formatMilvusError(error)}`);
  }
  if (!existing.value) {
    await client.createCollection({
      collection_name: name,
      fields: [
        {
          name: 'id',
          data_type: DataType.VarChar,
          is_primary_key: true,
          autoID: false,
          max_length: 64,
        },
        {
          name: 'vector',
          data_type: DataType.FloatVector,
          dim: settings.milvusDimension,
        },
        {
          name: 'text',
          data_type: DataType.VarChar,
          max_length: 65_535,
        },
        {
          name: 'metadata',
          data_type: DataType.JSON,
        },
      ],
      index_params: [
        {
          field_name: 'vector',
          index_name: 'vector_index',
          index_type: 'AUTOINDEX',
          metric_type: 'COSINE',
        },
      ],
    });
  }

  try {
    await client.loadCollectionSync({ collection_name: name });
  } catch {
    // 旧集合可能缺索引：补建后再 load
    await client.createIndex({
      collection_name: name,
      field_name: 'vector',
      index_name: 'vector_index',
      extra_params: {
        index_type: 'AUTOINDEX',
        metric_type: 'COSINE',
      },
    });
    await client.loadCollectionSync({ collection_name: name });
  }

  ensuredCollections.add(name);
  return name;
}

/** Milvus VarChar 文本字段上限裁剪，避免超长写入失败。 */
function truncateText(text: string, maxLength = 65_535): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

/**
 * 文本向量化后写入 Milvus。
 *
 * @returns 与 texts 一一对应的主键 id 列表（无连字符 UUID）
 */
export async function addTexts(
  texts: string[],
  metadatas: Record<string, unknown>[] = [],
  collectionName?: string,
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  const name = await ensureCollection(collectionName);
  const embeddings = getEmbeddings();
  const vectors = await embeddings.embedDocuments(texts);
  const ids = texts.map(() => randomUUID().replace(/-/g, ''));

  const data = texts.map((text, index) => ({
    id: ids[index],
    vector: vectors[index],
    text: truncateText(text),
    metadata: metadatas[index] ?? {},
  }));

  const client = getMilvusClient();
  await client.insert({
    collection_name: name,
    data,
  });
  // flush 保证后续检索可见
  await client.flushSync({ collection_names: [name] });
  return ids;
}

/**
 * 余弦相似度检索，返回 [文档, score] 列表。
 *
 * score 为 Milvus 返回的相似度分值（COSINE）。
 */
export async function similaritySearchWithScore(
  query: string,
  k: number,
  collectionName?: string,
): Promise<Array<[VectorDocument, number]>> {
  const name = await ensureCollection(collectionName);
  const embeddings = getEmbeddings();
  const queryVector = await embeddings.embedQuery(query);
  const client = getMilvusClient();
  const response = await client.search({
    collection_name: name,
    data: [queryVector],
    anns_field: 'vector',
    limit: k,
    output_fields: ['text', 'metadata'],
    metric_type: 'COSINE',
    params: { nprobe: 16 },
  });

  const rows = Array.isArray(response.results) ? response.results : [];
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const metadataRaw = record.metadata;
    const metadata =
      metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
        ? (metadataRaw as Record<string, unknown>)
        : {};
    const document: VectorDocument = {
      pageContent: String(record.text ?? record.pageContent ?? ''),
      metadata,
    };
    return [document, Number(record.score ?? 0)];
  });
}

/** 按主键 id 批量删除向量记录。 */
export async function deleteByIds(ids: string[], collectionName?: string): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const name = await ensureCollection(collectionName);
  const client = getMilvusClient();
  await client.delete({
    collection_name: name,
    ids,
  });
}

/**
 * 绑定到指定集合的向量库门面（add / search / delete）。
 * 未传 collectionName 时使用配置默认集合。
 */
export function getVectorStore(collectionName?: string) {
  return {
    async addTexts(texts: string[], metadatas: Record<string, unknown>[] = []): Promise<string[]> {
      return addTexts(texts, metadatas, collectionName);
    },
    async similaritySearchWithScore(query: string, k: number): Promise<Array<[VectorDocument, number]>> {
      return similaritySearchWithScore(query, k, collectionName);
    },
    async delete(ids: string[]): Promise<void> {
      return deleteByIds(ids, collectionName);
    },
  };
}
