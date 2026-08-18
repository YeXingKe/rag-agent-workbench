import { randomUUID } from 'node:crypto';

import { DataType, MilvusClient } from '@zilliz/milvus2-sdk-node';

import { getSettings } from '../config/settings.js';
import { getEmbeddings } from './embeddings.js';

export interface VectorDocument {
  pageContent: string;
  metadata: Record<string, unknown>;
}

let milvusClient: MilvusClient | null = null;
const ensuredCollections = new Set<string>();

function toMilvusAddress(uri: string): string {
  return uri.replace(/^https?:\/\//i, '');
}

export function getMilvusClient(): MilvusClient {
  if (milvusClient) {
    return milvusClient;
  }
  milvusClient = new MilvusClient({
    address: toMilvusAddress(getSettings().resolvedMilvusUri),
    timeout: 15_000,
  });
  return milvusClient;
}

export async function ensureCollection(collectionName?: string): Promise<string> {
  const settings = getSettings();
  const name = collectionName || settings.milvusCollection;
  if (ensuredCollections.has(name)) {
    return name;
  }

  const client = getMilvusClient();
  const existing = await client.hasCollection({ collection_name: name });
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

function truncateText(text: string, maxLength = 65_535): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

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
  await client.flushSync({ collection_names: [name] });
  return ids;
}

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
