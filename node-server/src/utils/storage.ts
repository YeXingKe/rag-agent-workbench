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
  // 从 multer 对象取原始文件名（originalname 优先，其次 filename）
  const filename = resolveUploadFilename(uploadFile);
  // 没有可用文件名则无法落盘，按客户端错误返回 400
  if (!filename) {
    throw new StorageError(400, 'No filename provided');
  }

  // 读取全局配置（含上传大小上限等）
  const settings = getSettings();
  // 将 MB 配置换算为字节，供后续写入校验使用
  const maxBytes = settings.maxUploadSizeMb * 1024 * 1024;
  // 生成安全落盘路径：uploads 目录 + UUID + 原扩展名
  const targetPath = buildStoragePath(filename);

  try {
    // 记录最终写入的实际字节数
    let fileSize = 0;
    // 优先：内存中的 buffer（multer memoryStorage）
    if (uploadFile.buffer) {
      // 校验大小后一次性写入目标路径
      fileSize = await writeBufferWithLimit(targetPath, uploadFile.buffer, maxBytes);
    // 其次：已有临时文件路径，流式拷贝到目标路径
    } else if (uploadFile.path) {
      // 边读边写并累计大小，超限则中止并抛 413
      fileSize = await copyPathWithLimit(uploadFile.path, targetPath, maxBytes);
    } else {
      // buffer 与 path 都没有，视为无效上传
      throw new StorageError(400, 'No filename provided');
    }
    // 落盘成功：返回绝对路径与文件大小供上层入库使用
    return { path: targetPath, size: fileSize };
  } catch (error) {
    // 写入中途失败时尽量删掉半成品文件，避免垃圾残留
    await fs.promises.unlink(targetPath).catch(() => undefined);
    // 原样抛出，由 API 层映射 StorageError.statusCode
    throw error;
  }
}
