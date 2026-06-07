import * as core from "@actions/core";
import { S3Client } from "@aws-sdk/client-s3";
import { parseInputs } from "./inputs";
import { resolveFiles } from "./resolve";
import { uploadFile } from "./upload";
import type { ActionInputs, UploadItem, UploadResult } from "./types";

interface Failure {
  path: string;
  key: string;
  error: string;
}

async function uploadAll(
  client: S3Client,
  items: UploadItem[],
  inputs: ActionInputs,
): Promise<{ results: UploadResult[]; failures: Failure[] }> {
  const results: UploadResult[] = [];
  const failures: Failure[] = [];
  let index = 0;
  let stop = false;

  async function worker(): Promise<void> {
    while (!stop) {
      const i = index++;
      if (i >= items.length) return;
      const item = items[i];
      try {
        results.push(await uploadFile(client, item, inputs));
        core.info(`Uploaded ${item.path} -> ${item.key}`);
      } catch (error) {
        failures.push({
          path: item.path,
          key: item.key,
          error: (error as Error).message,
        });
        if (inputs.failFast) stop = true;
      }
    }
  }

  const workerCount = Math.min(inputs.concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { results, failures };
}

function buildClient(inputs: ActionInputs): S3Client {
  return new S3Client({
    ...(inputs.accessKeyId && inputs.secretAccessKey
      ? {
          credentials: {
            accessKeyId: inputs.accessKeyId,
            secretAccessKey: inputs.secretAccessKey,
          },
        }
      : {}),
    ...(inputs.region ? { region: inputs.region } : {}),
    ...(inputs.endpoint ? { endpoint: inputs.endpoint } : {}),
  });
}

export const run = async (): Promise<void> => {
  try {
    const inputs = parseInputs();
    const items = await resolveFiles(inputs);
    if (items.length === 0) {
      core.setOutput("results", "[]");
      core.setOutput("failed", "[]");
      core.setOutput("object-count", "0");
      core.setOutput("keys", "");
      core.setOutput("locations", "");
      return;
    }

    const client = buildClient(inputs);
    const { results, failures } = await uploadAll(client, items, inputs);

    core.setOutput("results", JSON.stringify(results));
    core.setOutput("failed", JSON.stringify(failures));
    core.setOutput("object-count", results.length);
    core.setOutput("keys", results.map((r) => r.key).join("\n"));
    core.setOutput(
      "locations",
      results.map((r) => r.location ?? "").join("\n"),
    );

    if (failures.length > 0) {
      core.setFailed(`${failures.length} of ${items.length} uploads failed.`);
    }
  } catch (error) {
    core.setFailed((error as Error).message);
  }
};
