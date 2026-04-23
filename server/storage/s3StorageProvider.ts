import { storageConfig } from '../config/index.js';
import type {
  DeleteRequest,
  GetPublicUrlRequest,
  ObjectStorageProvider,
  UploadRequest,
  UploadResult
} from './types.js';

const normalizeKey = (key: string): string => key.replace(/^\/+/, '');

export class S3StorageProvider implements ObjectStorageProvider {
  private readonly bucketName: string;

  private readonly region: string;

  private readonly endpoint: string | undefined;

  private readonly forcePathStyle: boolean;

  constructor() {
    this.bucketName = storageConfig.s3.bucketName;
    this.region = storageConfig.s3.region;
    this.endpoint = storageConfig.s3.endpoint;
    this.forcePathStyle = storageConfig.s3.forcePathStyle;
  }

  async uploadObject(request: UploadRequest): Promise<UploadResult> {
    void request;
    throw new Error('S3 storage provider scaffold is not implemented yet.');
  }

  async deleteObject(request: DeleteRequest): Promise<void> {
    void request;
    throw new Error('S3 storage provider scaffold is not implemented yet.');
  }

  getPublicUrl(request: GetPublicUrlRequest): string {
    const key = normalizeKey(request.key);
    if (this.endpoint) {
      const base = this.endpoint.replace(/\/$/, '');
      if (this.forcePathStyle) {
        return `${base}/${this.bucketName}/${key}`;
      }
      return `${base}/${key}`;
    }

    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
