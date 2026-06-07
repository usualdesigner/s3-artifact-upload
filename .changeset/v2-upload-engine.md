---
"s3-artifact-upload": major
---

v2: multi-file/glob uploads, streamed multipart uploads via lib-storage,
richer S3 controls (SSE/KMS, storage class, tagging, content headers),
structured outputs (results/keys/locations), SHA-256 checksums, and the Node 24
runtime. Breaking: `putObjectCommandOutput` is removed and `file` is deprecated
in favor of `path`.
