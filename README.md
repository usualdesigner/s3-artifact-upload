# s3-artifact-upload

[![Lint Codebase](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/linter.yaml/badge.svg)](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/linter.yaml)
[![Continuous Integration](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/ci.yaml/badge.svg)](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/ci.yaml)
[![Check Transpiled JavaScript](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/check-dist.yaml/badge.svg)](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/check-dist.yaml)
[![CodeQL](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/codeql-analysis.yaml/badge.svg)](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/codeql-analysis.yaml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action for uploading one or more files (or glob patterns) to AWS S3.

## Why Use `s3-artifact-upload`?

This action uploads files directly to your AWS S3 buckets, making it easy to
automate deployment and storage in your GitHub Actions workflows. v2 supports
multi-file and glob uploads, streamed multipart transfers, richer S3 object
controls, and structured outputs.

## Recommended Authentication Method

Use the
[`configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials)
action by AWS. Leave the `aws-access-key-id`, `aws-secret-access-key`, and
`aws-region` inputs unset — the action picks credentials and region from the
environment. The inline credential inputs are a fallback only.

## How to Use

### Setup

1. Configure AWS credentials:

   ```yaml
   - name: Configure AWS credentials
     uses: aws-actions/configure-aws-credentials@v4
     with:
       aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
       aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
       aws-region: <your-aws-region>
   ```

1. Upload files to S3:

   ```yaml
   - name: Upload artifact to AWS S3
     uses: usualdesigner/s3-artifact-upload@v2
     with:
       bucket-name: <your-bucket-name>
       path: <path/to/your-file>
   ```

### Advanced example

```yaml
- name: Upload build artifacts
  uses: usualdesigner/s3-artifact-upload@v2
  with:
    bucket-name: my-bucket
    path: |
      dist/**/*.js
      dist/**/*.css
      README.md
    base-directory: dist
    prefix: releases/${{ github.sha }}
    acl: private
    cache-control: max-age=31536000, immutable
    content-type: application/javascript
    meta-data: '{"git-sha": "${{ github.sha }}"}'
    storage-class: STANDARD_IA
    server-side-encryption: aws:kms
    kms-key-id: ${{ secrets.KMS_KEY_ID }}
    tagging: '{"env": "prod", "team": "infra"}'
    checksum-algorithm: SHA256
    concurrency: 10
    fail-fast: false
```

### Inputs

#### File selection

- `path` (optional): Newline-separated list of files, directories, or globs
  to upload. Required unless `file` is set.
- `file` (optional): **Deprecated.** Single file to upload. Use `path`
  instead.
- `bucket-name` (required): S3 bucket to upload to.
- `exclude` (optional): Newline-separated glob patterns to exclude from
  matches.
- `base-directory` (optional, default `.`): Directory that object keys are
  derived relative to.
- `preserve-structure` (optional, default `true`): Keep the directory
  structure in the object key. Set to `false` to use only the file basename.
- `prefix` (optional): Key prefix prepended to every object.
- `if-no-files-found` (optional, default `warn`): Behavior when no files
  match — `warn`, `error`, or `ignore`.

#### AWS / client

- `aws-access-key-id` (optional): AWS access key ID. Prefer
  `configure-aws-credentials`.
- `aws-secret-access-key` (optional): AWS secret access key. Prefer
  `configure-aws-credentials`.
- `aws-region` (optional): AWS region. Falls back to the environment.
- `endpoint` (optional): Custom S3 endpoint URL for S3-compatible storage.

#### Object options

- `acl` (optional): S3 canned ACL (e.g. `private`, `public-read`).
- `cache-control` (optional): `Cache-Control` header for the object.
- `content-encoding` (optional): `Content-Encoding` header for the object.
- `content-disposition` (optional): `Content-Disposition` header for the
  object.
- `content-type` (optional): Override the auto-detected `Content-Type`.
- `meta-data` (optional): JSON object of custom S3 object metadata, e.g.
  `'{"key": "value"}'`.
- `storage-class` (optional): S3 storage class, e.g. `STANDARD_IA`,
  `INTELLIGENT_TIERING`, `GLACIER`, `DEEP_ARCHIVE`.
- `server-side-encryption` (optional): `AES256` or `aws:kms`.
- `kms-key-id` (optional): KMS key ID. Requires
  `server-side-encryption: aws:kms`.
- `tagging` (optional): Object tags as a JSON object or `k=v&k2=v2` query
  string, e.g. `'{"team": "infra"}'`.
- `checksum-algorithm` (optional, default `SHA256`): Integrity checksum
  algorithm — `SHA256`, `SHA1`, `CRC32`, `CRC32C`, or `none`.

#### Behavior

- `concurrency` (optional, default `5`): Max number of files uploaded in
  parallel.
- `fail-fast` (optional, default `false`): Stop after the first upload
  failure instead of attempting all files.

### Outputs

- `results`: JSON array of successful uploads. Each entry contains
  `path`, `key`, `bucket`, `etag`, `versionId`, `location`, and `size`.
- `failed`: JSON array of failed uploads. Each entry contains `path`,
  `key`, and `error`. Empty array (`[]`) on full success.
- `object-count`: Number of objects uploaded successfully.
- `keys`: Newline-separated list of uploaded object keys.
- `locations`: Newline-separated list of uploaded object URLs.

## Migrating from v1

- Replace `file:` with `path:` (a newline-separated list of paths/globs).
  `file:` still works for one file but is deprecated.
- The `putObjectCommandOutput` output is removed. Use `results` (JSON),
  `keys`, or `locations` instead.
- The action now runs on Node 24.
- Single-file uploads behave the same: `path: file.txt` with
  `prefix: test` still produces the key `test/file.txt`.
