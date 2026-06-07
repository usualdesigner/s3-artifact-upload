# s3-artifact-upload

## 2.0.0

### Major Changes

- [#76](https://github.com/usualdesigner/s3-artifact-upload/pull/76) [`af9f33e`](https://github.com/usualdesigner/s3-artifact-upload/commit/af9f33e14efd9509f7d61b1bef9cf6e45d7ab50e) Thanks [@usualdesigner](https://github.com/usualdesigner)! - v2: multi-file/glob uploads, streamed multipart uploads via lib-storage,
  richer S3 controls (SSE/KMS, storage class, tagging, content headers),
  structured outputs (results/keys/locations), SHA-256 checksums, and the Node 24
  runtime. Breaking: `putObjectCommandOutput` is removed and `file` is deprecated
  in favor of `path`.
