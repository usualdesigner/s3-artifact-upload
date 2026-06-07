import * as fs from "fs";
import * as mime from "mime-types";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { ActionInputs, UploadItem, UploadResult } from "./types";

export async function uploadFile(
  client: S3Client,
  item: UploadItem,
  inputs: ActionInputs,
): Promise<UploadResult> {
  const contentType =
    inputs.contentType || mime.lookup(item.absPath) || undefined;

  const upload = new Upload({
    client,
    params: {
      Bucket: inputs.bucketName,
      Key: item.key,
      Body: fs.createReadStream(item.absPath),
      ...(contentType ? { ContentType: contentType } : {}),
      ...(inputs.acl ? { ACL: inputs.acl } : {}),
      ...(inputs.cacheControl ? { CacheControl: inputs.cacheControl } : {}),
      ...(inputs.contentEncoding
        ? { ContentEncoding: inputs.contentEncoding }
        : {}),
      ...(inputs.contentDisposition
        ? { ContentDisposition: inputs.contentDisposition }
        : {}),
      ...(inputs.metaData ? { Metadata: inputs.metaData } : {}),
      ...(inputs.storageClass ? { StorageClass: inputs.storageClass } : {}),
      ...(inputs.serverSideEncryption
        ? { ServerSideEncryption: inputs.serverSideEncryption }
        : {}),
      ...(inputs.kmsKeyId ? { SSEKMSKeyId: inputs.kmsKeyId } : {}),
      ...(inputs.tagging ? { Tagging: inputs.tagging } : {}),
      ...(inputs.checksumAlgorithm
        ? { ChecksumAlgorithm: inputs.checksumAlgorithm }
        : {}),
    },
  });

  const res = await upload.done();

  return {
    path: item.path,
    key: item.key,
    bucket: inputs.bucketName,
    etag: res.ETag,
    versionId: res.VersionId,
    location: res.Location,
    size: item.size,
  };
}
