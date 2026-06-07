import * as fs from "fs";
import * as path from "path";
import * as glob from "@actions/glob";
import * as core from "@actions/core";
import type { ActionInputs, UploadItem } from "./types";

function toKey(prefix: string | undefined, keyBody: string): string {
  const joined = [prefix, keyBody].filter(Boolean).join("/");
  return joined.replace(/\/{2,}/g, "/").replace(/^\//, "");
}

export async function resolveFiles(
  inputs: ActionInputs,
): Promise<UploadItem[]> {
  const patterns = [
    ...inputs.paths,
    ...inputs.exclude.map((e) => `!${e}`),
  ].join("\n");

  const globber = await glob.create(patterns, {
    followSymbolicLinks: false,
    matchDirectories: false,
  });
  const matches = await globber.glob();

  const base = path.resolve(inputs.baseDirectory);
  const seen = new Set<string>();
  const keyToPath = new Map<string, string>();
  const items: UploadItem[] = [];

  for (const absPath of matches) {
    if (seen.has(absPath)) continue;
    seen.add(absPath);

    const rel = path.relative(base, absPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(
        `File ${absPath} is outside base-directory ${base}. ` +
          `Set \`base-directory\` to a parent of all matched files.`,
      );
    }

    const keyBody = inputs.preserveStructure
      ? rel.split(path.sep).join("/")
      : path.basename(absPath);
    const key = toKey(inputs.prefix, keyBody);

    if (keyToPath.has(key)) {
      throw new Error(
        `Key collision: "${keyToPath.get(key)}" and "${absPath}" both map to "${key}".`,
      );
    }
    keyToPath.set(key, absPath);

    items.push({
      absPath,
      path: path.relative(process.cwd(), absPath),
      key,
      size: fs.statSync(absPath).size,
    });
  }

  if (items.length === 0) {
    const message = `No files matched: ${inputs.paths.join(", ")}`;
    if (inputs.ifNoFilesFound === "error") throw new Error(message);
    if (inputs.ifNoFilesFound === "warn") core.warning(message);
  }

  return items;
}
