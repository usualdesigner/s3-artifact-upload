# s3-artifact-upload

[![Lint Codebase](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/linter.yaml/badge.svg)](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/linter.yaml)
[![Continuous Integration](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/ci.yaml/badge.svg)](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/ci.yaml)
[![Check Transpiled JavaScript](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/check-dist.yaml/badge.svg)](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/check-dist.yaml)
[![CodeQL](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/codeql-analysis.yaml/badge.svg)](https://github.com/usualdesigner/s3-artifact-upload/actions/workflows/codeql-analysis.yaml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action for efficiently uploading artifacts to AWS S3.
`s3-artifact-upload` simplifies integrating file uploads into your CI/CD
pipeline.

## Why Use `s3-artifact-upload`?

This action streamlines the process of uploading files directly to your AWS S3
buckets, making it an essential tool for developers looking to automate their
deployment and storage solutions. By leveraging `s3-artifact-upload`, you can
easily integrate S3 uploads into your GitHub Actions workflows.

It uploads a single file using the AWS SDK for JavaScript (v3) and
automatically sets sensible object metadata for you:

- `Content-Type` is detected from the file extension.
- `Content-Length` and a base64 `Content-MD5` integrity checksum are computed
  and sent with the request.

## Recommended Authentication Method

For authentication, it is strongly recommended to use the
[`configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials)
action by AWS. This method ensures that AWS credentials are handled securely,
adhering to the principle of separation of concerns. This way, the action
focuses on uploading artifacts, while credential management is securely
handled, aligning with best practices for security and efficiency.

When you use `configure-aws-credentials`, leave the `aws-access-key-id`,
`aws-secret-access-key`, and `aws-region` inputs unset — the action picks the
credentials and region up from the environment. The inline credential inputs
are provided only as a fallback for cases where that is not possible.

## How to Use

### Setup

1. **Configure AWS Credentials:** First, securely set up your AWS credentials
   using the `configure-aws-credentials` GitHub Action:

   ```yaml
   - name: Configure AWS credentials
     uses: aws-actions/configure-aws-credentials@v4
     with:
       aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
       aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
       aws-region: <your-aws-region>
   ```

1. **Upload Artifacts to S3:** Next, use `s3-artifact-upload` to upload your
   file to S3:

   ```yaml
   - name: Upload artifact to AWS S3
     uses: usualdesigner/s3-artifact-upload@v1
     with:
       bucket-name: <your-bucket-name>
       file: <path/to/your-file>
   ```

### Advanced example

```yaml
- name: Upload artifact to AWS S3
  uses: usualdesigner/s3-artifact-upload@v1
  with:
    bucket-name: my-bucket
    file: dist/app.tar.gz
    prefix: releases/${{ github.sha }}
    acl: private
    cache-control: max-age=31536000, immutable
    meta-data: '{"git-sha": "${{ github.sha }}", "run-id": "${{ github.run_id }}"}'
```

### Inputs

- `bucket-name` (required): The name of the S3 bucket to upload to.
- `file` (required): Path to the local file to upload. Also used as the
  object key (combined with `prefix`).
- `aws-access-key-id` (optional): AWS access key ID. Prefer
  `configure-aws-credentials` instead of setting this.
- `aws-secret-access-key` (optional): AWS secret access key. Prefer
  `configure-aws-credentials` instead of setting this.
- `aws-region` (optional): AWS region. Falls back to the region configured
  in the environment.
- `endpoint` (optional): Custom S3 endpoint URL, for use with S3-compatible
  storage providers.
- `acl` (optional): S3 canned ACL applied to the object (for example
  `private` or `public-read`).
- `prefix` (optional): Key prefix. The final object key is `<prefix>/<file>`.
- `meta-data` (optional): JSON object of custom object metadata, for example
  `'{"key": "value"}'`.
- `cache-control` (optional): Value for the object's `Cache-Control` header.

### Outputs

- `putObjectCommandOutput`: The result of the `PutObjectCommand`. See the
  [AWS SDK documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand)
  for the response shape.
