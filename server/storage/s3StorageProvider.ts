import { storageConfig } from '../config/index.js';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import type {
  DeleteRequest,
  GetPublicUrlRequest,
  ObjectStorageProvider,
  UploadRequest,
  UploadResult
} from './types.js';

const normalizeKey = (key: string): string => key.replace(/^\/+/, '');

export class S3StorageProvider implements ObjectStorageProvider {
  private readonly client: S3Client;

  private readonly bucketName: string;

  private readonly region: string;

  private readonly endpoint: string | undefined;

  private readonly forcePathStyle: boolean;

  constructor() {
    this.bucketName = storageConfig.s3.bucketName;
    this.region = storageConfig.s3.region;
    this.endpoint = storageConfig.s3.endpoint;
    this.forcePathStyle = storageConfig.s3.forcePathStyle;

    if (!this.bucketName || !this.region) {
      throw new Error('S3 storage requires S3_BUCKET_NAME and S3_REGION.');
    }

    const clientConfig: S3ClientConfig = {
      region: this.region,
      forcePathStyle: this.forcePathStyle
    };

    if (this.endpoint) {
      clientConfig.endpoint = this.endpoint;
    }

    if (storageConfig.s3.accessKeyId && storageConfig.s3.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: storageConfig.s3.accessKeyId,
        secretAccessKey: storageConfig.s3.secretAccessKey
      };
    }

    this.client = new S3Client(clientConfig);
  }

  async uploadObject(request: UploadRequest): Promise<UploadResult> {
    const key = normalizeKey(request.key);

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: request.body,
      ContentType: request.contentType,
      ContentDisposition: request.contentDisposition,
      Metadata: request.metadata
    }));

    return {
      key,
      url: this.getPublicUrl({ key })
    };
  }

  async deleteObject(request: DeleteRequest): Promise<void> {
    const key = normalizeKey(request.key);
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key
    }));
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
