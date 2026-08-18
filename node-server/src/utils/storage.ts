/**
 * 上传文件本地存储工具
 *
 * 负责上传目录创建、文件名清洗、按大小限制落盘，
 * 失败时清理半写文件并通过 StorageError 上报 HTTP 语义状态码。
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { getSettings } from '../config/settings.js';

/** 从磁盘路径拷贝时的读写块大小。 */
const CHUNK_SIZE = 1024 * 1024;

/** 存储相关业务错误，携带建议的 HTTP 状态码。 */
export class StorageError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'StorageError';
    this.statusCode = statusCode;
  }
}

/** 兼容 multer / 内存 buffer / 临时文件路径的上传对象。 */
export interface UploadLike {
  originalname?: string;
  filename?: string;
  buffer?: Buffer;
  path?: string;
  size?: number;
}

/** 确保上传目录存在，返回绝对路径。 */
export function ensureUploadDir(): string {
  const uploadDir = getSettings().uploadDir;
  fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}

/**
 * 清洗原始文件名：只保留 basename，非法字符替换为 `_`。
 * 空名回退为 unnamed.txt。
 */
export function sanitizeFilename(filename: string): string {
  const baseName = path.basename(filename).trim();
  if (!baseName) {
    return 'unnamed.txt';
  }
  const safeName = baseName.replace(/[^A-Za-z0-9._-]+/g, '_');
  return safeName || 'unnamed.txt';
}

/**
 * 生成落盘绝对路径：UUID + 原扩展名，避免文件名冲突与路径穿越。
 */
export function buildStoragePath(filename: string): string {
  const uploadDir = ensureUploadDir();
  const safeFilename = sanitizeFilename(filename);
  const suffix = path.extname(safeFilename);
  const storedName = `${randomUUID().replace(/-/g, '')}${suffix}`;
  return path.join(uploadDir, storedName);
}

function resolveUploadFilename(uploadFile: UploadLike): string {
  return uploadFile.originalname || uploadFile.filename || '';
}

/** 内存 buffer 一次性写入，超限抛 413。 */
async function writeBufferWithLimit(targetPath: string, buffer: Buffer, maxBytes: number): Promise<number> {
  if (buffer.length > maxBytes) {
    throw new StorageError(413, `File too large, max size is ${getSettings().maxUploadSizeMb} MB`);
  }
  await fs.promises.writeFile(targetPath, buffer);
  return buffer.length;
}

/**
 * 从临时路径流式拷贝到目标路径。
 * 边读边累计大小，超限则删除目标文件并抛 413。
 */
async function copyPathWithLimit(sourcePath: string, targetPath: string, maxBytes: number): Promise<number> {
  const handle = await fs.promises.open(sourcePath, 'r');
  const output = await fs.promises.open(targetPath, 'w');
  let fileSize = 0;
  const chunk = Buffer.alloc(CHUNK_SIZE);
  try {
    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, CHUNK_SIZE, fileSize);
      if (bytesRead === 0) {
        break;
      }
      fileSize += bytesRead;
      if (fileSize > maxBytes) {
        await output.close();
        await fs.promises.unlink(targetPath).catch(() => undefined);
        throw new StorageError(413, `File too large, max size is ${getSettings().maxUploadSizeMb} MB`);
      }
      await output.write(chunk.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
    await output.close().catch(() => undefined);
  }
  return fileSize;
}

/**
 * 保存上传文件到本地 storage。
 *
 * 优先使用 buffer；否则从临时 path 流式拷贝。
 * 任意失败都会尝试删除已写出的目标文件。
 *
 * @returns 落盘路径与实际字节数
 */
export async function saveUploadFile(uploadFile: UploadLike): Promise<{ path: string; size: number }> {
  const filename = resolveUploadFilename(uploadFile);
  if (!filename) {
    throw new StorageError(400, 'No filename provided');
  }

  const settings = getSettings();
  const maxBytes = settings.maxUploadSizeMb * 1024 * 1024;
  const targetPath = buildStoragePath(filename);

  try {
    let fileSize = 0;
    if (uploadFile.buffer) {
      fileSize = await writeBufferWithLimit(targetPath, uploadFile.buffer, maxBytes);
    } else if (uploadFile.path) {
      fileSize = await copyPathWithLimit(uploadFile.path, targetPath, maxBytes);
    } else {
      throw new StorageError(400, 'No filename provided');
    }
    return { path: targetPath, size: fileSize };
  } catch (error) {
    await fs.promises.unlink(targetPath).catch(() => undefined);
    throw error;
  }
}
