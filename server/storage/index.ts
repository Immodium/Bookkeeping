import { storageConfig } from '../config/index.js';
import { LocalStorageProvider } from './localStorageProvider.js';
import { S3StorageProvider } from './s3StorageProvider.js';
import type { ObjectStorageProvider } from './types.js';

let providerInstance: ObjectStorageProvider | null = null;

const createStorageProvider = (): ObjectStorageProvider => {
  if (storageConfig.provider === 's3') {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
};

export const getStorageProvider = (): ObjectStorageProvider => {
  if (!providerInstance) {
    providerInstance = createStorageProvider();
  }
  return providerInstance;
};

export const resetStorageProvider = (): void => {
  providerInstance = null;
};

export type {
  DeleteRequest,
  GetPublicUrlRequest,
  ObjectStorageProvider,
  UploadRequest,
  UploadResult
} from './types.js';
