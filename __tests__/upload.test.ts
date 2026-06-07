import "aws-sdk-client-mock-jest";
import * as fs from "fs";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { uploadFile } from "../src/upload";
import type { ActionInputs, UploadItem } from "../src/types";

// Node 24 marks fs properties non-configurable; use module-level mock instead.
jest.mock("fs", () => ({
  ...jest.requireActual<typeof fs>("fs"),
  createReadStream: jest.fn(),
}));

const s3Mock = mockClient(S3Client);

function inputs(over: Partial<ActionInputs>): ActionInputs {
  return {
    paths: [],
    bucketName: "my-bucket",
    exclude: [],
    baseDirectory: ".",
    preserveStructure: true,
    ifNoFilesFound: "warn",
    concurrency: 5,
    failFast: false,
    checksumAlgorithm: "SHA256",
    ...over,
  };
}

const item: UploadItem = {
  absPath: "/tmp/app.js",
  path: "dist/app.js",
  key: "web/app.js",
  size: 3,
};

describe("uploadFile", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({ ETag: '"abc"', VersionId: "v1" });
    (fs.createReadStream as jest.Mock).mockReturnValue(
      Buffer.from("xyz") as unknown as fs.ReadStream,
    );
  });
  afterEach(() => jest.clearAllMocks());

  it("uploads with mapped params and returns a result", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const result = await uploadFile(
      client,
      item,
      inputs({
        acl: "private",
        cacheControl: "max-age=60",
        storageClass: "STANDARD_IA",
        contentType: "application/javascript",
        metaData: { team: "infra" },
        tagging: "env=prod",
      }),
    );

    expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
      Bucket: "my-bucket",
      Key: "web/app.js",
      ACL: "private",
      CacheControl: "max-age=60",
      StorageClass: "STANDARD_IA",
      ContentType: "application/javascript",
      Metadata: { team: "infra" },
      Tagging: "env=prod",
      ChecksumAlgorithm: "SHA256",
    });
    expect(result).toMatchObject({
      key: "web/app.js",
      bucket: "my-bucket",
      etag: '"abc"',
      versionId: "v1",
      size: 3,
    });
  });

  it("omits ChecksumAlgorithm when not set", async () => {
    const client = new S3Client({ region: "us-east-1" });
    await uploadFile(client, item, inputs({ checksumAlgorithm: undefined }));
    const call = s3Mock.commandCalls(PutObjectCommand)[0];
    expect(call.args[0].input.ChecksumAlgorithm).toBeUndefined();
  });
});

// Keeps the unused import meaningful for readers; multipart is exercised by lib-storage.
void CreateMultipartUploadCommand;
