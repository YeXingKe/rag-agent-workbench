import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** `node-server/` directory (`.env` and `storage` live here). */
export const BASE_DIR = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(BASE_DIR, '.env');

dotenv.config({ path: ENV_FILE });

export interface Settings {
  appName: string;
  appVersion: string;
  appEnv: string;
  debug: boolean;
  apiPrefix: string;
  allowOrigins: string[];
  storageRoot: string;
  uploadDirName: string;
  maxUploadSizeMb: number;
  model: string;
  embeddingModel: string;
  dashscopeApiKey: string;
  milvusUri: string | null;
  milvusHost: string;
  milvusPort: number;
  milvusCollection: string;
  milvusDimension: number;
  postgresDsn: string | null;
  redisUrl: string | null;
  appHost: string;
  appPort: number;
  ocrEnabled: boolean;
  ocrTaskUrl: string;
  ocrQueryUrl: string;
  ocrTokenUrl: string;
  ocrAccessToken: string;
  ocrClientId: string;
  ocrClientSecret: string;
  ocrPdfMinPageChars: number;
  ocrPdfEmptyPageRatio: number;
  ocrPdfLowTextAvgChars: number;
  ocrTableLikeLineThreshold: number;
  ocrDocxMinChars: number;
  ocrPollMaxAttempts: number;
  ocrPollIntervalSec: number;
  readonly resolvedMilvusUri: string;
  readonly uploadDir: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseIntValue(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatValue(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAllowOrigins(raw: string | undefined): string[] {
  const fallback = ['http://localhost:5173'];
  if (!raw) {
    return fallback;
  }
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed as string[];
      }
    } catch {
      // Fall through to comma-separated parsing.
    }
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function loadSettings(): Settings {
  const storageRoot = readEnv('STORAGE_ROOT') ?? 'storage';
  const uploadDirName = readEnv('UPLOAD_DIR_NAME') ?? 'uploads';
  const milvusUri = readEnv('MILVUS_URI') ?? null;
  const milvusHost = readEnv('MILVUS_HOST') ?? '127.0.0.1';
  const milvusPort = parseIntValue(readEnv('MILVUS_PORT'), 19530);

  const settings: Settings = {
    appName: readEnv('APP_NAME') ?? 'RAG Agent Workbench',
    appVersion: readEnv('APP_VERSION') ?? '0.1.0',
    appEnv: readEnv('APP_ENV') ?? 'development',
    debug: parseBool(readEnv('DEBUG'), false),
    apiPrefix: readEnv('API_PREFIX') ?? '/api',
    allowOrigins: parseAllowOrigins(readEnv('ALLOW_ORIGINS')),
    storageRoot,
    uploadDirName,
    maxUploadSizeMb: parseIntValue(readEnv('MAX_UPLOAD_SIZE_MB'), 20),
    model: readEnv('MODEL') ?? 'qwen-plus',
    embeddingModel: readEnv('EMBEDDING_MODEL') ?? 'text-embedding-v1',
    dashscopeApiKey: readEnv('DASHSCOPE_API_KEY') ?? '',
    milvusUri,
    milvusHost,
    milvusPort,
    milvusCollection: readEnv('MILVUS_COLLECTION') ?? 'knowledge_base',
    milvusDimension: parseIntValue(readEnv('MILVUS_DIMENSION'), 1536),
    postgresDsn: readEnv('POSTGRES_DSN') ?? null,
    redisUrl: readEnv('REDIS_URL') ?? null,
    appHost: readEnv('APP_HOST') ?? '0.0.0.0',
    appPort: parseIntValue(readEnv('APP_PORT'), 8000),
    ocrEnabled: parseBool(readEnv('OCR_ENABLED'), false),
    ocrTaskUrl: readEnv('OCR_TASK_URL') ?? '',
    ocrQueryUrl: readEnv('OCR_QUERY_URL') ?? '',
    ocrTokenUrl: readEnv('OCR_TOKEN_URL') ?? 'https://aip.baidubce.com/oauth/2.0/token',
    ocrAccessToken: readEnv('OCR_ACCESS_TOKEN') ?? '',
    ocrClientId: readEnv('OCR_CLIENT_ID') ?? '',
    ocrClientSecret: readEnv('OCR_CLIENT_SECRET') ?? '',
    ocrPdfMinPageChars: parseIntValue(readEnv('OCR_PDF_MIN_PAGE_CHARS'), 80),
    ocrPdfEmptyPageRatio: parseFloatValue(readEnv('OCR_PDF_EMPTY_PAGE_RATIO'), 0.35),
    ocrPdfLowTextAvgChars: parseIntValue(readEnv('OCR_PDF_LOW_TEXT_AVG_CHARS'), 120),
    ocrTableLikeLineThreshold: parseIntValue(readEnv('OCR_TABLE_LIKE_LINE_THRESHOLD'), 3),
    ocrDocxMinChars: parseIntValue(readEnv('OCR_DOCX_MIN_CHARS'), 200),
    ocrPollMaxAttempts: parseIntValue(readEnv('OCR_POLL_MAX_ATTEMPTS'), 30),
    ocrPollIntervalSec: parseIntValue(readEnv('OCR_POLL_INTERVAL_SEC'), 2),
    get resolvedMilvusUri() {
      if (this.milvusUri) {
        return this.milvusUri;
      }
      return `http://${this.milvusHost}:${this.milvusPort}`;
    },
    get uploadDir() {
      return path.resolve(BASE_DIR, this.storageRoot, this.uploadDirName);
    },
  };

  return settings;
}

let cachedSettings: Settings | null = null;

export function getSettings(): Settings {
  if (!cachedSettings) {
    cachedSettings = loadSettings();
  }
  return cachedSettings;
}

export const settings: Settings = getSettings();
