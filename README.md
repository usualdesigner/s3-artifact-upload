[![GitHub Super-Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

# Upload S3 GitHub Action

This action allows you to upload files to an S3 bucket as part of your GitHub Actions workflow. It provides inputs for specifying the name of the file. To include the action in a workflow in another repository, you can use the uses syntax with the @ symbol to reference a specific branch, tag, or commit hash.

The example usage shows how to use this action with the usualdesigner/upload-s3-action:

```yaml
steps:
  - name: Checkout
    id: checkout
    uses: actions/checkout@v4
  - name: Upload file to S3 bucket
    id: upload-s3
    uses: usualdesigner/upload-s3-action@v1
    with:
        access-key-id: ${{ secrets.ACCESS_KEY_ID }}
        secret-access-key: ${{ secrets.SECRET_ACCESS_KEY }}
        bucket-name: ${{ vars.SECRET_ACCESS_KEY }}
        region: us-east-2
        file: README.md
        endpoint: s3.amazonaws.com
        acl: 'public-read'
        prefix: 'my-folder-1'
  - name: Print Output
    run: echo "The main output data is ${{ steps.upload-s3.outputs.putObjectCommandOutput }}"
```

### TBD:
- Improve tests
- Support STS Auth
- Support folder upload