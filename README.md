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
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: <your-access-key-id>
        aws-secret-access-key: <your-secret-access-key>
        aws-region: <your-aws-region>
    ```

2. **Upload Artifacts to S3:** Next, use `s3-artifact-upload` to upload your files to S3:

    ```yaml
    - name: Upload artifacts to AWS S3
      uses: usualdesigner/s3-artifact-upload@main
      with:
        bucket-name: <your-bucket-name>
        file: <your-file-name>
    ```

### Inputs

- `bucket-name`: The name of the S3 bucket where files will be uploaded.
- `file`: The local file to be uploaded.

### Outputs

- `output`: Object of the PutObjectCommand Output, see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand