import * as core from "@actions/core";
import type { ActionInputs } from "./types";

const DEFAULT_CONCURRENCY = 5;
const CHECKSUM_ALGORITHMS = ["SHA256", "SHA1", "CRC32", "CRC32C"];
const IF_NO_FILES_FOUND = ["warn", "error", "ignore"];

function parseMetaData(raw: string): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, string>;
  } catch {
    throw new Error("`meta-data` must be a JSON object.");
  }
}

function parseTagging(raw: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    let obj: Record<string, string>;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      throw new Error("`tagging` must be a JSON object or a query string.");
    }
    return Object.entries(obj)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
  }
  return trimmed;
}

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

  if (!IF_NO_FILES_FOUND.includes(ifNoFilesFound)) {
    throw new Error("`if-no-files-found` must be one of: warn, error, ignore.");
  }

  const checksumRaw = core.getInput("checksum-algorithm") || "SHA256";
  if (checksumRaw !== "none" && !CHECKSUM_ALGORITHMS.includes(checksumRaw)) {
    throw new Error(
      `\`checksum-algorithm\` must be one of: none, ${CHECKSUM_ALGORITHMS.join(", ")}.`
    );
  }

  const serverSideEncryption = core.getInput("server-side-encryption") || undefined;
  const kmsKeyId = core.getInput("kms-key-id") || undefined;
  if (kmsKeyId && serverSideEncryption !== "aws:kms") {
    throw new Error("`kms-key-id` requires `server-side-encryption: aws:kms`.");
  }

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
    metaData: parseMetaData(core.getInput("meta-data")),
    storageClass: (core.getInput("storage-class") ||
      undefined) as ActionInputs["storageClass"],
    serverSideEncryption: serverSideEncryption as ActionInputs["serverSideEncryption"],
    kmsKeyId,
    tagging: parseTagging(core.getInput("tagging")),
    checksumAlgorithm:
      checksumRaw === "none"
        ? undefined
        : (checksumRaw as ActionInputs["checksumAlgorithm"]),
    concurrency,
    failFast: core.getInput("fail-fast")
      ? core.getBooleanInput("fail-fast")
      : false
  };
}
