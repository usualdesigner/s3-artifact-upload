import * as core from "@actions/core";
import {
  S3Client,
  PutObjectCommand,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { AwsCredentialIdentity } from "@aws-sdk/types";

const handleInput = (): {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region?: string;
  endpoint?: string;
  acl?: ObjectCannedACL;
  prefix?: string;
  file: string;
} => {
  const accessKeyId = core.getInput("access-key-id", {
    required: true,
  });

  const secretAccessKey = core.getInput("secret-access-key", {
    required: true,
  });

  const bucketName = core.getInput("bucket-name", {
    required: true,
  });

  const region = core.getInput("region", {
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

  const file = core.getInput("file", {
    required: true,
  });

  return {
    accessKeyId,
    secretAccessKey,
    bucketName,
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(acl ? { acl } : {}),
    ...(prefix ? { prefix } : {}),
    file,
  };
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
  } = handleInput();

  const credentials: AwsCredentialIdentity = {
    accessKeyId,
    secretAccessKey,
  };

  const s3Client = new S3Client({
    credentials,
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
  });

  const putObjectCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: [prefix, file].filter(Boolean).join("/"),
    Body: file,
    ACL: acl,
  });

  try {
    const putObjectCommandOutput = await s3Client.send(putObjectCommand);
    core.setOutput("putObjectCommandOutput", putObjectCommandOutput);
  } catch (error: unknown) {
    core.error(error as Error);
    core.setFailed((error as Error).message);
  }
};
