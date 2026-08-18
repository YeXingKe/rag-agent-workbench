import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { getSettings } from '../config/settings.js';

const CHUNK_SIZE = 1024 * 1024;

export class StorageError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'StorageError';
    this.statusCode = statusCode;
  }
}

export interface UploadLike {
  originalname?: string;
  filename?: string;
  buffer?: Buffer;
  path?: string;
  size?: number;
}

export function ensureUploadDir(): string {
  const uploadDir = getSettings().uploadDir;
  fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
}

export function sanitizeFilename(filename: string): string {
  const baseName = path.basename(filename).trim();
  if (!baseName) {
    return 'unnamed.txt';
  }
  const safeName = baseName.replace(/[^A-Za-z0-9._-]+/g, '_');
  return safeName || 'unnamed.txt';
}

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

async function writeBufferWithLimit(targetPath: string, buffer: Buffer, maxBytes: number): Promise<number> {
  if (buffer.length > maxBytes) {
    throw new StorageError(413, `File too large, max size is ${getSettings().maxUploadSizeMb} MB`);
  }
  await fs.promises.writeFile(targetPath, buffer);
  return buffer.length;
}

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
