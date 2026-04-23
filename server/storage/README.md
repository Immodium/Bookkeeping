## Storage Abstraction Scaffold

This folder introduces a provider-based storage abstraction for AWS readiness:

- `ObjectStorageProvider` contract in `types.ts`
- `LocalStorageProvider` for current filesystem-backed behavior
- `S3StorageProvider` scaffold for future AWS S3 implementation
- Provider selection via `STORAGE_PROVIDER` in server config

### Runtime Selection

- `STORAGE_PROVIDER=local` (default): writes to `STORAGE_LOCAL_BASE_PATH`, serves URLs from `STORAGE_PUBLIC_BASE_URL`
- `STORAGE_PROVIDER=s3`: uses S3 config values (`S3_BUCKET_NAME`, `S3_REGION`, etc.)

### Current Status

- Local provider: functional for upload/delete/public URL generation.
- S3 provider: URL generation scaffolded; upload/delete methods intentionally throw until AWS SDK integration is added.
