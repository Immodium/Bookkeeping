export interface UploadRequest {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  url: string;
}

export interface DeleteRequest {
  key: string;
}

export interface GetPublicUrlRequest {
  key: string;
}

export interface ObjectStorageProvider {
  uploadObject(request: UploadRequest): Promise<UploadResult>;
  deleteObject(request: DeleteRequest): Promise<void>;
  getPublicUrl(request: GetPublicUrlRequest): string;
}
