# s3-artifact-upload

A GitHub Action for efficiently uploading artifacts to AWS S3, `s3-artifact-upload` simplifies integrating file uploads into your CI/CD pipeline.

## Why Use `s3-artifact-upload`?

This action streamlines the process of uploading files directly to your AWS S3 buckets, making it an essential tool for developers looking to automate their deployment and storage solutions. By leveraging `s3-artifact-upload`, you can easily integrate S3 uploads into your GitHub Actions workflows.

## Recommended Authentication Method

For authentication, it is strongly recommended to use the [`configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials) action by AWS. This method ensures that AWS credentials are handled securely, adhering to the principle of separation of concerns. This way, the action focuses on uploading artifacts, while credential management is securely handled, aligning with best practices for security and efficiency.

## How to Use

### Setup

1. **Configure AWS Credentials:** First, securely set up your AWS credentials using the `configure-aws-credentials` GitHub Action:

    ```yaml
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: <your-aws-region>
    ```

2. **Upload Artifacts to S3:** Next, use `s3-artifact-upload` to upload your files to S3:

    ```yaml
    - name: Upload artifacts to AWS S3
      uses: usualdesigner/s3-artifact-upload@main
      with:
        s3-bucket: "<your-s3-bucket-name>"
        source-dir: "<path-to-your-artifacts>"
    ```

### Inputs

- `s3-bucket`: The name of the S3 bucket where files will be uploaded.
- `source-dir`: The local directory of the files to be uploaded.

## Example Workflow

Here is a sample workflow using `s3-artifact-upload` with secure authentication:

```yaml
name: Deploy to S3

on: push

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: ${{ vars.ROLE_TO_ASSUME }}
        role-session-name: ${{ vars.ROLE_SESSION_NAME }}
        aws-region: ${{ env.AWS_REGION }}

    - name: Upload artifacts to S3
      uses: usualdesigner/s3-artifact-upload@v1.0.0
      with:
        bucket-name: ${{ vars.BUCKET }}
        aws-region: ${{ env.AWS_REGION }}
        file: file.json
