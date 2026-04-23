import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { storageConfig } from '../config/index.js';
import type {
  DeleteRequest,
  GetPublicUrlRequest,
  ObjectStorageProvider,
  UploadRequest,
  UploadResult
} from './types.js';

const normalizeKey = (key: string): string => key.replace(/^\/+/, '');

export class LocalStorageProvider implements ObjectStorageProvider {
  private readonly basePath: string;

  private readonly publicBaseUrl: string;

  constructor(basePath = storageConfig.local.basePath, publicBaseUrl = storageConfig.local.publicBaseUrl) {
    this.basePath = resolve(basePath);
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
  }

  async uploadObject(request: UploadRequest): Promise<UploadResult> {
    const key = normalizeKey(request.key);
    const absolutePath = join(this.basePath, key);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, request.body);

    return {
      key,
      url: this.getPublicUrl({ key })
    };
  }

  async deleteObject(request: DeleteRequest): Promise<void> {
    const key = normalizeKey(request.key);
    const absolutePath = join(this.basePath, key);
    try {
      await unlink(absolutePath);
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  getPublicUrl(request: GetPublicUrlRequest): string {
    const key = normalizeKey(request.key);
    return `${this.publicBaseUrl}/${key}`;
  }
}
