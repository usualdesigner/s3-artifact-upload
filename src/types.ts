import type {
  ObjectCannedACL,
  StorageClass,
  ServerSideEncryption,
  ChecksumAlgorithm,
} from "@aws-sdk/client-s3";

export interface ActionInputs {
  paths: string[];
  bucketName: string;
  exclude: string[];
  baseDirectory: string;
  preserveStructure: boolean;
  prefix?: string;
  ifNoFilesFound: "warn" | "error" | "ignore";
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  endpoint?: string;
  acl?: ObjectCannedACL;
  cacheControl?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  contentType?: string;
  metaData?: Record<string, string>;
  storageClass?: StorageClass;
  serverSideEncryption?: ServerSideEncryption;
  kmsKeyId?: string;
  tagging?: string;
  checksumAlgorithm?: ChecksumAlgorithm;
  concurrency: number;
  failFast: boolean;
}

export interface UploadItem {
  absPath: string;
  path: string;
  key: string;
  size: number;
}

export interface UploadResult {
  path: string;
  key: string;
  bucket: string;
  etag?: string;
  versionId?: string;
  location?: string;
  size: number;
}
