import * as fs from "fs";
import * as path from "path";
import fg from "fast-glob";
import * as core from "@actions/core";
import type { ActionInputs, UploadItem } from "./types";

function toKey(prefix: string | undefined, keyBody: string): string {
  const joined = [prefix, keyBody].filter(Boolean).join("/");
  return joined.replace(/\/{2,}/g, "/").replace(/^\//, "");
}

// Expand each input path entry: an existing directory becomes a recursive
// `<entry>/**/*` glob, while files and globs are passed through unchanged.
function expandEntry(entry: string): string {
  try {
    if (fs.statSync(entry).isDirectory()) {
      return `${entry}/**/*`;
    }
  } catch {
    // Not an existing path on disk — treat it as a glob/literal.
  }
  return entry;
}

export async function resolveFiles(
  inputs: ActionInputs,
): Promise<UploadItem[]> {
  const patterns = inputs.paths.map(expandEntry);

  const matches = await fg(patterns, {
    dot: true,
    onlyFiles: true,
    absolute: true,
    followSymbolicLinks: false,
    ignore: inputs.exclude,
  });

  const base = path.resolve(inputs.baseDirectory);
  // fast-glob already de-duplicates across overlapping patterns; `seen` is a
  // defensive guard so the key-collision check below only ever fires on two
  // genuinely different source files, never on the same path seen twice.
  const seen = new Set<string>();
  const keyToPath = new Map<string, string>();
  const items: UploadItem[] = [];

  for (const match of matches) {
    const absPath = path.normalize(match);
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
