import * as core from "@actions/core";
import type { ActionInputs } from "./types";

const DEFAULT_CONCURRENCY = 5;

export function parseInputs(): ActionInputs {
  const pathLines = core.getMultilineInput("path");
  const file = core.getInput("file");

  let paths: string[];
  if (file) {
    core.warning(
      "`file` is deprecated and will be removed in a future major version. Use `path` instead."
    );
    if (pathLines.length > 0) {
      throw new Error("Provide either `path` or `file`, not both.");
    }
    paths = [file];
  } else {
    if (pathLines.length === 0) {
      throw new Error("One of `path` or `file` is required.");
    }
    paths = pathLines;
  }

  const concurrencyRaw = core.getInput("concurrency");
  const concurrency = concurrencyRaw ? Number(concurrencyRaw) : DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("`concurrency` must be a positive integer.");
  }

  const ifNoFilesFound = (core.getInput("if-no-files-found") || "warn") as
    | "warn"
    | "error"
    | "ignore";

  return {
    paths,
    bucketName: core.getInput("bucket-name", { required: true }),
    exclude: core.getMultilineInput("exclude"),
    baseDirectory: core.getInput("base-directory") || ".",
    preserveStructure: core.getInput("preserve-structure")
      ? core.getBooleanInput("preserve-structure")
      : true,
    prefix: core.getInput("prefix") || undefined,
    ifNoFilesFound,
    accessKeyId: core.getInput("aws-access-key-id") || undefined,
    secretAccessKey: core.getInput("aws-secret-access-key") || undefined,
    region: core.getInput("aws-region") || undefined,
    endpoint: core.getInput("endpoint") || undefined,
    acl: (core.getInput("acl") || undefined) as ActionInputs["acl"],
    cacheControl: core.getInput("cache-control") || undefined,
    contentEncoding: core.getInput("content-encoding") || undefined,
    contentDisposition: core.getInput("content-disposition") || undefined,
    contentType: core.getInput("content-type") || undefined,
    metaData: undefined,
    storageClass: (core.getInput("storage-class") ||
      undefined) as ActionInputs["storageClass"],
    serverSideEncryption: (core.getInput("server-side-encryption") ||
      undefined) as ActionInputs["serverSideEncryption"],
    kmsKeyId: core.getInput("kms-key-id") || undefined,
    tagging: undefined,
    checksumAlgorithm: "SHA256",
    concurrency,
    failFast: core.getInput("fail-fast")
      ? core.getBooleanInput("fail-fast")
      : false
  };
}
