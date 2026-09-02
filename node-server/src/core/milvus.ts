/**
 * Milvus 向量库封装
 *
 * 集合创建/加载、embedding 入库、余弦检索、按 id 删除。
 * 本地 Docker 与 Zilliz Cloud（token + SSL）共用同一套 SDK。
 */
import { randomUUID } from 'node:crypto'; // 生成向量主键
import net from 'node:net'; // TCP 探活本地端口

import { DataType, MilvusClient } from '@zilliz/milvus2-sdk-node'; // 官方 Node SDK

import { getSettings } from '../config/settings.js'; // URI / token / 维度 / 集合名
import { getEmbeddings } from './embeddings.js'; // 文本 → 向量

/** 检索返回的文档结构 */
export interface VectorDocument {
  pageContent: string; // chunk 正文
  metadata: Record<string, unknown>; // 溯源 JSON
}

let milvusClient: MilvusClient | null = null; // SDK 单例
const ensuredCollections = new Set<string>(); // 本进程已 load 过的集合，避免重复 ensure

/** SDK address 不要 http(s):// 前缀。 */
function toMilvusAddress(uri: string): string {
  return uri.replace(/^https?:\/\//i, ''); // 去掉协议，只留 host:port
}

/** 把 SDK / gRPC 错误转成可读字符串。 */
function formatMilvusError(error: unknown): string {
  if (error instanceof Error) { // 标准 Error
    return error.message; // 用人话
  }
  return String(error); // 其它类型强制转字符串
}

/** 清空客户端缓存，失败后下次重建。 */
export function resetMilvusClient(): void {
  milvusClient = null; // 丢掉坏实例
}

/**
 * TCP 探测本地 Milvus 端口。
 * 避免 SDK 连失败时抛未捕获的 gRPC rejection。
 */
export async function checkMilvusReachable(timeoutMs = 2_000): Promise<boolean> {
  const settings = getSettings(); // 读 host/port
  const host = settings.milvusHost || '127.0.0.1'; // 默认本机
  const port = settings.milvusPort || 19_530; // 默认 gRPC 端口

  return new Promise((resolve) => { // 把 socket 事件收成 boolean
    const socket = new net.Socket(); // 裸 TCP
    let settled = false; // 只 settle 一次

    const finish = (result: boolean) => { // 统一收尾
      if (settled) { // 已经回调过
        return; // 忽略重复的 connect/error/timeout
      }
      settled = true; // 锁住
      clearTimeout(timer); // 清超时器
      socket.destroy(); // 关掉 socket
      resolve(result); // true=通，false=不通
    };

    const timer = setTimeout(() => finish(false), timeoutMs); // 超时当失败
    socket.once('connect', () => finish(true)); // 握手成功
    socket.once('error', () => finish(false)); // 拒绝/重置
    socket.connect(port, host); // 开始连
  });
}

/**
 * GET /health 探活。
 * 本地走 TCP；云上有 token/https 则用 SDK listCollections。
 */
export async function probeMilvusHealth(): Promise<{ ok: boolean; error: string | null }> {
  const settings = getSettings(); // 读 URI / token
  const uri = settings.resolvedMilvusUri; // 最终地址
  const isCloud = // 是否云托管
    Boolean(settings.milvusToken) || /^https:\/\//i.test(uri) || uri.includes('zilliz.com');

  if (!isCloud) { // 本地 Docker
    const reachable = await checkMilvusReachable(); // TCP 探 19530
    if (!reachable) { // 端口不通
      resetMilvusClient(); // 丢掉可能坏掉的 SDK
      return {
        ok: false, // 健康检查失败
        error: `Milvus is not reachable at ${uri}`, // 给前端/运维看
      };
    }
    return { ok: true, error: null }; // 本地通
  }

  try {
    const client = getMilvusClient(); // 带 token 的云客户端
    await client.listCollections(); // 一次轻量 RPC
    return { ok: true, error: null }; // 云通
  } catch (error) { // 鉴权失败或网络失败
    resetMilvusClient(); // 下次重建
    return {
      ok: false,
      error: `Milvus cloud probe failed (${uri}): ${formatMilvusError(error)}`,
    };
  }
}

/** 获取 MilvusClient 单例；Zilliz 需 token + SSL。 */
export function getMilvusClient(): MilvusClient {
  if (milvusClient) { // 已有实例
    return milvusClient; // 复用
  }
  const settings = getSettings(); // 读连接配置
  const options: ConstructorParameters<typeof MilvusClient>[0] = { // SDK 构造参数
    address: toMilvusAddress(settings.resolvedMilvusUri), // host:port
    timeout: 15_000, // 15 秒超时
  };
  if (settings.milvusToken) { // 云上 API Key
    options.token = settings.milvusToken; // 鉴权
    options.ssl = true; // Zilliz Serverless 走 HTTPS
  }
  milvusClient = new MilvusClient(options); // 创建并缓存
  return milvusClient; // 返回单例
}

/**
 * 确保集合存在并已 load。
 * 不存在则建 schema + COSINE AUTOINDEX；load 失败则补索引再 load。
 */
export async function ensureCollection(collectionName?: string): Promise<string> {
  const settings = getSettings(); // 默认集合名与向量维度
  const name = collectionName || settings.milvusCollection; // 未传则用配置
  if (ensuredCollections.has(name)) { // 本进程已处理过
    return name; // 跳过 RPC
  }

  const client = getMilvusClient(); // SDK
  let existing; // hasCollection 结果
  try {
    existing = await client.hasCollection({ collection_name: name }); // 问集合在不在
  } catch (error) { // 连不上
    resetMilvusClient(); // 清缓存
    throw new Error(`Milvus unavailable: ${formatMilvusError(error)}`); // 往上抛
  }
  if (!existing.value) { // 集合不存在
    await client.createCollection({ // 创建
      collection_name: name, // 集合名
      fields: [ // 字段 schema
        {
          name: 'id', // 主键
          data_type: DataType.VarChar, // 字符串
          is_primary_key: true, // 主键
          autoID: false, // 我们自己生成 UUID
          max_length: 64, // 去掉连字符后够用
        },
        {
          name: 'vector', // 向量列
          data_type: DataType.FloatVector, // 浮点向量
          dim: settings.milvusDimension, // 必须和 embedding 维度一致
        },
        {
          name: 'text', // 原文
          data_type: DataType.VarChar, // 字符串
          max_length: 65_535, // VarChar 上限
        },
        {
          name: 'metadata', // 溯源 JSON
          data_type: DataType.JSON, // JSON 类型
        },
      ],
      index_params: [ // 向量索引
        {
          field_name: 'vector', // 建在向量列上
          index_name: 'vector_index', // 索引名
          index_type: 'AUTOINDEX', // 交给 Milvus 选实现
          metric_type: 'COSINE', // 余弦相似度
        },
      ],
    });
  }

  try {
    await client.loadCollectionSync({ collection_name: name }); // 加载到查询内存
  } catch { // 旧集合可能缺索引
    await client.createIndex({ // 补索引
      collection_name: name,
      field_name: 'vector',
      index_name: 'vector_index',
      extra_params: {
        index_type: 'AUTOINDEX',
        metric_type: 'COSINE',
      },
    });
    await client.loadCollectionSync({ collection_name: name }); // 再建完再 load
  }

  ensuredCollections.add(name); // 记下已就绪
  return name; // 返回实际集合名
}

/** 裁剪到 Milvus VarChar 上限。 */
function truncateText(text: string, maxLength = 65_535): string {
  if (text.length <= maxLength) { // 没超
    return text; // 原样
  }
  return text.slice(0, maxLength); // 截断，避免 insert 失败
}

/**
 * 文本向量化后写入 Milvus。
 *
 * @returns 与 texts 一一对应的主键 id
 */
export async function addTexts(
  texts: string[],
  metadatas: Record<string, unknown>[] = [],
  collectionName?: string,
): Promise<string[]> {
  if (texts.length === 0) { // 没有要写的
    return []; // 空 id 列表
  }

  const name = await ensureCollection(collectionName); // 集合就绪
  const embeddings = getEmbeddings(); // DashScope 向量化
  const vectors = await embeddings.embedDocuments(texts); // 批量 embedding
  const ids = texts.map(() => randomUUID().replace(/-/g, '')); // 无连字符 UUID 当主键

  const data = texts.map((text, index) => ({ // 一行对应一条向量
    id: ids[index], // 主键
    vector: vectors[index], // 向量
    text: truncateText(text), // 正文（可能截断）
    metadata: metadatas[index] ?? {}, // 缺省空对象
  }));

  const client = getMilvusClient(); // SDK
  await client.insert({ // 插入
    collection_name: name,
    data,
  });
  await client.flushSync({ collection_names: [name] }); // flush 后检索立刻可见
  return ids; // 回填到 Postgres chunk.vector_id
}

/**
 * 余弦相似度检索，返回 [文档, score]。
 */
export async function similaritySearchWithScore(
  query: string,
  k: number,
  collectionName?: string,
): Promise<Array<[VectorDocument, number]>> {
  const name = await ensureCollection(collectionName); // 集合就绪
  const embeddings = getEmbeddings(); // 查询向量化
  const queryVector = await embeddings.embedQuery(query); // text_type=query
  const client = getMilvusClient(); // SDK
  const response = await client.search({ // ANN 搜索
    collection_name: name, // 集合
    data: [queryVector], // 一条查询向量
    anns_field: 'vector', // 在哪一列搜
    limit: k, // 取 top k
    output_fields: ['text', 'metadata'], // 带回原文和元数据
    metric_type: 'COSINE', // 与建索引时一致
    params: { nprobe: 16 }, // 探测桶数，精度/速度折中
  });

  const rows = Array.isArray(response.results) ? response.results : []; // 保护非数组
  return rows.map((row) => { // 转成业务结构
    const record = row as Record<string, unknown>; // 宽松取值
    const metadataRaw = record.metadata; // 原始 metadata
    const metadata = // 必须是普通对象
      metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
        ? (metadataRaw as Record<string, unknown>)
        : {};
    const document: VectorDocument = {
      pageContent: String(record.text ?? record.pageContent ?? ''), // 正文
      metadata, // 溯源
    };
    return [document, Number(record.score ?? 0)]; // 文档 + 相似度
  });
}

/** 按主键 id 批量删除。 */
export async function deleteByIds(ids: string[], collectionName?: string): Promise<void> {
  if (ids.length === 0) { // 没有要删的
    return; // 直接返回
  }
  const name = await ensureCollection(collectionName); // 集合就绪
  const client = getMilvusClient(); // SDK
  await client.delete({ // 按主键删
    collection_name: name,
    ids, // vector_id 列表
  });
}

/**
 * 绑定到指定集合的门面。
 * 未传 collectionName 时用配置默认集合。
 */
export function getVectorStore(collectionName?: string) {
  return {
    async addTexts(texts: string[], metadatas: Record<string, unknown>[] = []): Promise<string[]> { // 入库
      return addTexts(texts, metadatas, collectionName);
    },
    async similaritySearchWithScore(query: string, k: number): Promise<Array<[VectorDocument, number]>> { // 检索
      return similaritySearchWithScore(query, k, collectionName);
    },
    async delete(ids: string[]): Promise<void> { // 删除
      return deleteByIds(ids, collectionName);
    },
  };
}
