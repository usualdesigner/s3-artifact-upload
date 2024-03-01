import * as fs from "fs";
import * as mime from "mime-types";
import * as core from "@actions/core";
import { createHash } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";

const handleInput = (): {
  bucketName: string;
  file: string;

  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  endpoint?: string;
  acl?: ObjectCannedACL;
  prefix?: string;
  metaData?: Record<string, string>;
  cacheControl?: string;
} => {
  const bucketName = core.getInput("bucket-name", {
    required: true,
  });

  const file = core.getInput("file", {
    required: true,
  });

  const accessKeyId = core.getInput("aws-access-key-id", {
    required: false,
  });

  const secretAccessKey = core.getInput("aws-secret-access-key", {
    required: false,
  });

  const region = core.getInput("aws-region", {
    required: false,
  });

  const endpoint = core.getInput("endpoint", {
    required: false,
  });

  const acl = core.getInput("acl", {
    required: false,
  }) as ObjectCannedACL;

  const prefix = core.getInput("prefix", {
    required: false,
  });

  const metaData = core.getInput("meta-data", {
    required: false,
  });

  const cacheControl = core.getInput("cache-control", {
    required: false,
  });

  let metaDataObject = {};

  try {
    metaDataObject = JSON.parse(metaData || "{}");
  } catch (error: unknown) {
    core.info("Error parsing meta-data");
  }

  return {
    bucketName,
    file,
    ...(accessKeyId ? { accessKeyId } : {}),
    ...(secretAccessKey ? { secretAccessKey } : {}),
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(acl ? { acl } : {}),
    ...(prefix ? { prefix } : {}),
    ...(metaData ? { metaData: metaDataObject } : {}),
    ...(cacheControl ? { cacheControl } : {}),
  };
};

const getMd5 = (fileName: string): string => {
  const hasher = createHash("md5");
  hasher.update(fs.readFileSync(fileName));
  return hasher.digest("base64");
};

export const run = async (): Promise<void> => {
  const {
    accessKeyId,
    secretAccessKey,
    bucketName,
    region,
    endpoint,
    acl,
    prefix,
    file,
    metaData,
    cacheControl,
  } = handleInput();

  const s3Client = new S3Client({
    ...(accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
        }
      : {}),
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
  });

  const mime_type = mime.lookup(file);

  const putObjectCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: [prefix, file].filter(Boolean).join("/"),
    Body: fs.readFileSync(file),
    ACL: acl,
    ContentLength: fs.statSync(file).size,
    ContentMD5: getMd5(file),
    ...(mime_type ? { ContentType: mime_type } : {}),
    ...(metaData ? { Metadata: metaData } : {}),
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
  });

  try {
    const putObjectCommandOutput = await s3Client.send(putObjectCommand);
    core.setOutput("putObjectCommandOutput", putObjectCommandOutput);
  } catch (error: unknown) {
    core.error(error as Error);
    core.setFailed((error as Error).message);
  }
};
