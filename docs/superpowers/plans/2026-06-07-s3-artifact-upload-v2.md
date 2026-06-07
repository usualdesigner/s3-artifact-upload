# s3-artifact-upload v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-file uploader into a multi-file/glob upload engine with streamed multipart uploads, richer S3 controls, structured outputs, the Node 24 runtime, and Changesets-driven releases.

**Architecture:** Modular pipeline (`inputs` → `resolve` → `upload`, orchestrated by `run`) with typed seams (`ActionInputs`, `UploadItem`, `UploadResult`). Uploads stream through `@aws-sdk/lib-storage`. Files are matched with `@actions/glob`. Releases are automated with Changesets plus a custom tag-based publish step.

**Tech Stack:** TypeScript, `@actions/core`, `@actions/glob`, `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `mime-types`, Jest + `ts-jest`, `aws-sdk-client-mock`, ncc, Changesets.

**Spec:** `docs/superpowers/specs/2026-06-07-s3-artifact-upload-v2-design.md`

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Shared interfaces: `ActionInputs`, `UploadItem`, `UploadResult` |
| `src/inputs.ts` | `parseInputs(): ActionInputs` — read + validate all inputs |
| `src/resolve.ts` | `resolveFiles(inputs): Promise<UploadItem[]>` — globbing, key derivation, safety checks |
| `src/upload.ts` | `uploadFile(client, item, inputs): Promise<UploadResult>` — one streamed upload |
| `src/run.ts` | `run()` — orchestrate: parse → resolve → upload pool → outputs/fail (replaces `main.ts`) |
| `src/index.ts` | Entrypoint; calls `run()` (unchanged) |
| `__tests__/*.test.ts` | One test file per module |
| `action.yml` | Inputs/outputs metadata + `node24` runtime |
| `.changeset/config.json` | Changesets config |
| `.github/workflows/release.yaml` | Version PR + custom tag-based publish |
| `script/publish.mjs` | Tag `vX.Y.Z`, move major tag, create GitHub release |

`src/main.ts` is replaced by `src/run.ts` (+ the extracted modules). `getMd5` is removed (the SDK checksum supersedes it).

---

## Phase 0: Toolchain — Node 24, dependencies, test infra

### Task 0.1: Add runtime and dev dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install @aws-sdk/lib-storage @actions/glob
```
Expected: both added under `dependencies`, `npm install` exits 0.

- [ ] **Step 2: Install test deps**

Run:
```bash
npm install -D aws-sdk-client-mock aws-sdk-client-mock-jest
```
Expected: both added under `devDependencies`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add lib-storage, actions/glob, aws-sdk-client-mock"
```

### Task 0.2: Move runtime to Node 24

**Files:**
- Modify: `action.yml:43-45`, `.node-version`, `.nvmrc`, `tsconfig.json`

- [ ] **Step 1: Install Node 24 locally and capture the exact version**

Run:
```bash
source "$HOME/.nvm/nvm.sh" && nvm install 24 && node --version
```
Expected: prints e.g. `v24.x.y`. Use that exact `24.x.y` string (without the `v`) in the next step so CI and local builds match.

- [ ] **Step 2: Pin the Node version files**

Write the captured `24.x.y` to both files:
```bash
node --version | sed 's/^v//' > .node-version
cp .node-version .nvmrc
```

- [ ] **Step 3: Update `action.yml` runtime**

In `action.yml`, change:
```yaml
runs:
  using: node20
  main: dist/index.js
```
to:
```yaml
runs:
  using: node24
  main: dist/index.js
```

- [ ] **Step 4: Bump tsconfig target**

In `tsconfig.json`, change `"target": "ES2022"` to `"target": "ES2023"`.

- [ ] **Step 5: Verify install + tests still pass on Node 24**

Run:
```bash
nvm use && rm -rf node_modules package-lock.json && npm install && npm run ci-test
```
Expected: install exits 0, existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add action.yml .node-version .nvmrc tsconfig.json package-lock.json
git commit -m "build: move action runtime to Node 24"
```

---

## Phase 1: Shared types + input parsing

### Task 1.1: Define shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write the types**

```typescript
import type {
  ObjectCannedACL,
  StorageClass,
  ServerSideEncryption,
  ChecksumAlgorithm
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types for v2 upload engine"
```

### Task 1.2: parseInputs — happy path

**Files:**
- Create: `src/inputs.ts`
- Test: `__tests__/inputs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import * as core from "@actions/core";
import { parseInputs } from "../src/inputs";

function mockInputs(values: Record<string, string>): void {
  jest.spyOn(core, "getInput").mockImplementation((name) => values[name] ?? "");
  jest
    .spyOn(core, "getMultilineInput")
    .mockImplementation((name) =>
      (values[name] ?? "").split("\n").filter((l) => l.trim() !== "")
    );
  jest
    .spyOn(core, "getBooleanInput")
    .mockImplementation((name) => (values[name] ?? "false") === "true");
  jest.spyOn(core, "warning").mockImplementation(() => {});
}

describe("parseInputs", () => {
  afterEach(() => jest.restoreAllMocks());

  it("parses a basic multi-path config", () => {
    mockInputs({
      path: "dist/**/*.js\nREADME.md",
      "bucket-name": "my-bucket",
      "base-directory": "dist",
      "preserve-structure": "true",
      prefix: "web",
      concurrency: "8"
    });

    const inputs = parseInputs();

    expect(inputs.paths).toEqual(["dist/**/*.js", "README.md"]);
    expect(inputs.bucketName).toBe("my-bucket");
    expect(inputs.baseDirectory).toBe("dist");
    expect(inputs.preserveStructure).toBe(true);
    expect(inputs.prefix).toBe("web");
    expect(inputs.concurrency).toBe(8);
    expect(inputs.ifNoFilesFound).toBe("warn");
    expect(inputs.checksumAlgorithm).toBe("SHA256");
    expect(inputs.failFast).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest inputs -t "parses a basic multi-path config"`
Expected: FAIL — `parseInputs` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest inputs -t "parses a basic multi-path config"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/inputs.ts __tests__/inputs.test.ts
git commit -m "feat: add parseInputs with multi-path support"
```

### Task 1.3: parseInputs — meta-data, tagging, checksum, validation

**Files:**
- Modify: `src/inputs.ts`
- Test: `__tests__/inputs.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/inputs.test.ts`:
```typescript
describe("parseInputs validation and parsing", () => {
  afterEach(() => jest.restoreAllMocks());

  it("parses meta-data JSON into an object", () => {
    mockInputs({
      path: "a.txt",
      "bucket-name": "b",
      "meta-data": '{"k1":"v1","k2":"v2"}'
    });
    expect(parseInputs().metaData).toEqual({ k1: "v1", k2: "v2" });
  });

  it("throws on malformed meta-data JSON", () => {
    mockInputs({ path: "a.txt", "bucket-name": "b", "meta-data": "{nope" });
    expect(() => parseInputs()).toThrow(/meta-data/);
  });

  it("encodes a tagging object as a query string", () => {
    mockInputs({
      path: "a.txt",
      "bucket-name": "b",
      tagging: '{"team":"infra","env":"prod"}'
    });
    expect(parseInputs().tagging).toBe("team=infra&env=prod");
  });

  it("passes through a tagging query string", () => {
    mockInputs({ path: "a.txt", "bucket-name": "b", tagging: "a=1&b=2" });
    expect(parseInputs().tagging).toBe("a=1&b=2");
  });

  it("maps checksum-algorithm none to undefined", () => {
    mockInputs({ path: "a.txt", "bucket-name": "b", "checksum-algorithm": "none" });
    expect(parseInputs().checksumAlgorithm).toBeUndefined();
  });

  it("throws when kms-key-id is set without aws:kms", () => {
    mockInputs({ path: "a.txt", "bucket-name": "b", "kms-key-id": "abc" });
    expect(() => parseInputs()).toThrow(/aws:kms/);
  });

  it("throws on both path and file", () => {
    mockInputs({ path: "a.txt", file: "b.txt", "bucket-name": "b" });
    expect(() => parseInputs()).toThrow(/either `path` or `file`/);
  });

  it("throws on an unknown checksum-algorithm", () => {
    mockInputs({ path: "a.txt", "bucket-name": "b", "checksum-algorithm": "MD5" });
    expect(() => parseInputs()).toThrow(/checksum-algorithm/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest inputs -t "validation and parsing"`
Expected: FAIL.

- [ ] **Step 3: Implement parsing + validation**

In `src/inputs.ts`, add these helpers above `parseInputs`:
```typescript
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
```

Then in `parseInputs`, replace the relevant lines:
```typescript
  const checksumRaw = core.getInput("checksum-algorithm") || "SHA256";
  if (checksumRaw !== "none" && !CHECKSUM_ALGORITHMS.includes(checksumRaw)) {
    throw new Error(
      `\`checksum-algorithm\` must be one of: none, ${CHECKSUM_ALGORITHMS.join(", ")}.`
    );
  }

  if (!IF_NO_FILES_FOUND.includes(ifNoFilesFound)) {
    throw new Error("`if-no-files-found` must be one of: warn, error, ignore.");
  }

  const serverSideEncryption = core.getInput("server-side-encryption") || undefined;
  const kmsKeyId = core.getInput("kms-key-id") || undefined;
  if (kmsKeyId && serverSideEncryption !== "aws:kms") {
    throw new Error("`kms-key-id` requires `server-side-encryption: aws:kms`.");
  }
```
And update the return object fields:
```typescript
    metaData: parseMetaData(core.getInput("meta-data")),
    serverSideEncryption: serverSideEncryption as ActionInputs["serverSideEncryption"],
    kmsKeyId,
    tagging: parseTagging(core.getInput("tagging")),
    checksumAlgorithm:
      checksumRaw === "none"
        ? undefined
        : (checksumRaw as ActionInputs["checksumAlgorithm"]),
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest inputs`
Expected: PASS (all input tests).

- [ ] **Step 5: Commit**

```bash
git add src/inputs.ts __tests__/inputs.test.ts
git commit -m "feat: validate inputs and parse meta-data/tagging/checksum"
```

---

## Phase 2: File resolution + key derivation

### Task 2.1: resolveFiles — globbing and key derivation

**Files:**
- Create: `src/resolve.ts`
- Test: `__tests__/resolve.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import { resolveFiles } from "../src/resolve";
import type { ActionInputs } from "../src/types";

function baseInputs(over: Partial<ActionInputs>): ActionInputs {
  return {
    paths: [],
    bucketName: "b",
    exclude: [],
    baseDirectory: ".",
    preserveStructure: true,
    ifNoFilesFound: "warn",
    concurrency: 5,
    failFast: false,
    checksumAlgorithm: "SHA256",
    ...over
  };
}

describe("resolveFiles", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "s3au-"));
    fs.mkdirSync(path.join(dir, "dist", "a"), { recursive: true });
    fs.writeFileSync(path.join(dir, "dist", "app.js"), "x");
    fs.writeFileSync(path.join(dir, "dist", "a", "b.js"), "yy");
    fs.writeFileSync(path.join(dir, "dist", "skip.map"), "z");
    jest.spyOn(core, "warning").mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it("expands globs and preserves structure relative to base-directory", async () => {
    const items = await resolveFiles(
      baseInputs({
        paths: [path.join(dir, "dist", "**", "*.js")],
        baseDirectory: path.join(dir, "dist"),
        prefix: "web"
      })
    );
    const keys = items.map((i) => i.key).sort();
    expect(keys).toEqual(["web/a/b.js", "web/app.js"]);
    expect(items.find((i) => i.key === "web/a/b.js")?.size).toBe(2);
  });

  it("applies excludes", async () => {
    const items = await resolveFiles(
      baseInputs({
        paths: [path.join(dir, "dist", "**", "*")],
        exclude: [path.join(dir, "dist", "**", "*.map")],
        baseDirectory: path.join(dir, "dist")
      })
    );
    expect(items.some((i) => i.key.endsWith(".map"))).toBe(false);
  });

  it("flattens to basename when preserve-structure is false", async () => {
    const items = await resolveFiles(
      baseInputs({
        paths: [path.join(dir, "dist", "a", "b.js")],
        baseDirectory: path.join(dir, "dist"),
        preserveStructure: false,
        prefix: "flat"
      })
    );
    expect(items[0].key).toBe("flat/b.js");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx jest resolve`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement resolveFiles**

```typescript
import * as fs from "fs";
import * as path from "path";
import * as glob from "@actions/glob";
import * as core from "@actions/core";
import type { ActionInputs, UploadItem } from "./types";

function toKey(prefix: string | undefined, keyBody: string): string {
  const joined = [prefix, keyBody].filter(Boolean).join("/");
  return joined.replace(/\/{2,}/g, "/").replace(/^\//, "");
}

export async function resolveFiles(inputs: ActionInputs): Promise<UploadItem[]> {
  const patterns = [
    ...inputs.paths,
    ...inputs.exclude.map((e) => `!${e}`)
  ].join("\n");

  const globber = await glob.create(patterns, {
    followSymbolicLinks: false,
    matchDirectories: false
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
          `Set \`base-directory\` to a parent of all matched files.`
      );
    }

    const keyBody = inputs.preserveStructure
      ? rel.split(path.sep).join("/")
      : path.basename(absPath);
    const key = toKey(inputs.prefix, keyBody);

    if (keyToPath.has(key)) {
      throw new Error(
        `Key collision: "${keyToPath.get(key)}" and "${absPath}" both map to "${key}".`
      );
    }
    keyToPath.set(key, absPath);

    items.push({
      absPath,
      path: path.relative(process.cwd(), absPath),
      key,
      size: fs.statSync(absPath).size
    });
  }

  if (items.length === 0) {
    const message = `No files matched: ${inputs.paths.join(", ")}`;
    if (inputs.ifNoFilesFound === "error") throw new Error(message);
    if (inputs.ifNoFilesFound === "warn") core.warning(message);
  }

  return items;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest resolve`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resolve.ts __tests__/resolve.test.ts
git commit -m "feat: add file resolution and key derivation"
```

### Task 2.2: resolveFiles — collisions, traversal, if-no-files-found

**Files:**
- Test: `__tests__/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Add inside the `describe("resolveFiles", ...)` block:
```typescript
  it("throws on key collisions when flattening", async () => {
    fs.mkdirSync(path.join(dir, "dist", "c"), { recursive: true });
    fs.writeFileSync(path.join(dir, "dist", "c", "app.js"), "dup");
    await expect(
      resolveFiles(
        baseInputs({
          paths: [path.join(dir, "dist", "**", "*.js")],
          baseDirectory: path.join(dir, "dist"),
          preserveStructure: false
        })
      )
    ).rejects.toThrow(/Key collision/);
  });

  it("throws when a file resolves outside base-directory", async () => {
    await expect(
      resolveFiles(
        baseInputs({
          paths: [path.join(dir, "dist", "app.js")],
          baseDirectory: path.join(dir, "dist", "a")
        })
      )
    ).rejects.toThrow(/outside base-directory/);
  });

  it("errors on no matches when if-no-files-found is error", async () => {
    await expect(
      resolveFiles(
        baseInputs({
          paths: [path.join(dir, "nope", "*.js")],
          ifNoFilesFound: "error"
        })
      )
    ).rejects.toThrow(/No files matched/);
  });

  it("returns empty and warns when if-no-files-found is warn", async () => {
    const warnSpy = jest.spyOn(core, "warning");
    const items = await resolveFiles(
      baseInputs({ paths: [path.join(dir, "nope", "*.js")], ifNoFilesFound: "warn" })
    );
    expect(items).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify fail/pass**

Run: `npx jest resolve`
Expected: PASS — the Task 2.1 implementation already covers these. If any fail, fix `resolve.ts` until green.

- [ ] **Step 3: Commit**

```bash
git add __tests__/resolve.test.ts
git commit -m "test: cover collision, traversal, and empty-match behavior"
```

---

## Phase 3: Upload

### Task 3.1: uploadFile — streamed upload with param mapping

**Files:**
- Create: `src/upload.ts`
- Test: `__tests__/upload.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import "aws-sdk-client-mock-jest";
import * as fs from "fs";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand
} from "@aws-sdk/client-s3";
import { uploadFile } from "../src/upload";
import type { ActionInputs, UploadItem } from "../src/types";

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
    ...over
  };
}

const item: UploadItem = {
  absPath: "/tmp/app.js",
  path: "dist/app.js",
  key: "web/app.js",
  size: 3
};

describe("uploadFile", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({ ETag: '"abc"', VersionId: "v1" });
    jest
      .spyOn(fs, "createReadStream")
      .mockReturnValue(Buffer.from("xyz") as unknown as fs.ReadStream);
  });
  afterEach(() => jest.restoreAllMocks());

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
        tagging: "env=prod"
      })
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
      ChecksumAlgorithm: "SHA256"
    });
    expect(result).toMatchObject({
      key: "web/app.js",
      bucket: "my-bucket",
      etag: '"abc"',
      versionId: "v1",
      size: 3
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
```

- [ ] **Step 2: Run to verify fail**

Run: `npx jest upload`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement uploadFile**

```typescript
import * as fs from "fs";
import * as mime from "mime-types";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { ActionInputs, UploadItem, UploadResult } from "./types";

export async function uploadFile(
  client: S3Client,
  item: UploadItem,
  inputs: ActionInputs
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
      ...(inputs.contentEncoding ? { ContentEncoding: inputs.contentEncoding } : {}),
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
        : {})
    }
  });

  const res = await upload.done();

  return {
    path: item.path,
    key: item.key,
    bucket: inputs.bucketName,
    etag: res.ETag,
    versionId: res.VersionId,
    location: res.Location,
    size: item.size
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest upload`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/upload.ts __tests__/upload.test.ts
git commit -m "feat: add streamed multipart upload with param mapping"
```

---

## Phase 4: Orchestration

### Task 4.1: run — concurrency pool, aggregation, outputs

**Files:**
- Create: `src/run.ts`
- Test: `__tests__/run.test.ts`
- Delete: `src/main.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import * as core from "@actions/core";
import * as inputsMod from "../src/inputs";
import * as resolveMod from "../src/resolve";
import * as uploadMod from "../src/upload";
import { run } from "../src/run";
import type { ActionInputs, UploadItem } from "../src/types";

function fakeInputs(over: Partial<ActionInputs> = {}): ActionInputs {
  return {
    paths: ["x"],
    bucketName: "b",
    exclude: [],
    baseDirectory: ".",
    preserveStructure: true,
    ifNoFilesFound: "warn",
    concurrency: 2,
    failFast: false,
    checksumAlgorithm: "SHA256",
    ...over
  };
}

const items: UploadItem[] = [
  { absPath: "/a", path: "a", key: "a", size: 1 },
  { absPath: "/b", path: "b", key: "b", size: 1 }
];

describe("run", () => {
  let outputs: Record<string, string>;
  let failed: string | undefined;

  beforeEach(() => {
    outputs = {};
    failed = undefined;
    jest.spyOn(core, "setOutput").mockImplementation((k, v) => {
      outputs[k] = String(v);
    });
    jest.spyOn(core, "setFailed").mockImplementation((m) => {
      failed = String(m);
    });
    jest.spyOn(core, "info").mockImplementation(() => {});
    jest.spyOn(inputsMod, "parseInputs").mockReturnValue(fakeInputs());
    jest.spyOn(resolveMod, "resolveFiles").mockResolvedValue(items);
  });
  afterEach(() => jest.restoreAllMocks());

  it("uploads all files and sets outputs", async () => {
    jest.spyOn(uploadMod, "uploadFile").mockImplementation(async (_c, item) => ({
      path: item.path,
      key: item.key,
      bucket: "b",
      etag: '"e"',
      size: 1
    }));

    await run();

    expect(JSON.parse(outputs["results"])).toHaveLength(2);
    expect(outputs["object-count"]).toBe("2");
    expect(outputs["keys"].split("\n").sort()).toEqual(["a", "b"]);
    expect(failed).toBeUndefined();
  });

  it("fails when any upload fails but still uploads the rest", async () => {
    jest.spyOn(uploadMod, "uploadFile").mockImplementation(async (_c, item) => {
      if (item.key === "a") throw new Error("boom");
      return { path: item.path, key: item.key, bucket: "b", size: 1 };
    });

    await run();

    expect(JSON.parse(outputs["results"])).toHaveLength(1);
    expect(JSON.parse(outputs["failed"])).toHaveLength(1);
    expect(failed).toMatch(/1 of 2/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx jest run`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement run + a concurrency helper**

```typescript
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
  inputs: ActionInputs
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
          error: (error as Error).message
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
            secretAccessKey: inputs.secretAccessKey
          }
        }
      : {}),
    ...(inputs.region ? { region: inputs.region } : {}),
    ...(inputs.endpoint ? { endpoint: inputs.endpoint } : {})
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
      results.map((r) => r.location ?? "").join("\n")
    );

    if (failures.length > 0) {
      core.setFailed(`${failures.length} of ${items.length} uploads failed.`);
    }
  } catch (error) {
    core.setFailed((error as Error).message);
  }
};
```

- [ ] **Step 4: Delete the old monolith and update the entrypoint**

Run: `git rm src/main.ts`

In `src/index.ts`, change the import:
```typescript
import { run } from "./run";

run();
```

- [ ] **Step 5: Update the index test import**

In `__tests__/index.test.ts`, replace `"../src/main"` with `"../src/run"` (both the `import` and the `jest.spyOn` target). Delete the old `__tests__/main.test.ts` if it still references `src/main`:
```bash
git rm __tests__/main.test.ts
```

- [ ] **Step 6: Run the full suite**

Run: `npm run ci-test`
Expected: PASS — inputs, resolve, upload, run, index.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: orchestrate uploads with bounded concurrency and structured outputs"
```

---

## Phase 5: Action metadata, build, and docs

### Task 5.1: Update action.yml inputs/outputs

**Files:**
- Modify: `action.yml`

- [ ] **Step 1: Replace the inputs/outputs blocks**

Set `inputs:` to (keeping `bucket-name`, adding the rest):
```yaml
inputs:
  path:
    description: Newline-separated list of files, directories, or globs to upload
    required: false
  file:
    description: "[Deprecated] Single file to upload. Use `path` instead."
    required: false
  bucket-name:
    description: S3 Bucket Name
    required: true
  exclude:
    description: Newline-separated glob patterns to exclude from matches
    required: false
  base-directory:
    description: Directory that object keys are derived relative to
    required: false
    default: "."
  preserve-structure:
    description: Keep the directory structure in the object key
    required: false
    default: "true"
  prefix:
    description: Key prefix prepended to every object
    required: false
  if-no-files-found:
    description: Behavior when no files match (warn, error, ignore)
    required: false
    default: warn
  aws-access-key-id:
    description: AWS Access Key ID
    required: false
  aws-secret-access-key:
    description: AWS Secret Access Key
    required: false
  aws-region:
    description: AWS Region
    required: false
  endpoint:
    description: Custom S3 endpoint URL
    required: false
  acl:
    description: S3 Object ACL
    required: false
  cache-control:
    description: S3 Object Cache-Control
    required: false
  content-encoding:
    description: S3 Object Content-Encoding
    required: false
  content-disposition:
    description: S3 Object Content-Disposition
    required: false
  content-type:
    description: Override the auto-detected Content-Type
    required: false
  meta-data:
    description: JSON object of custom S3 object metadata
    required: false
  storage-class:
    description: S3 storage class (e.g. STANDARD_IA, GLACIER)
    required: false
  server-side-encryption:
    description: Server-side encryption (AES256 or aws:kms)
    required: false
  kms-key-id:
    description: KMS key id (requires server-side-encryption aws:kms)
    required: false
  tagging:
    description: Object tags as a JSON object or query string
    required: false
  checksum-algorithm:
    description: Integrity checksum algorithm (SHA256, SHA1, CRC32, CRC32C, none)
    required: false
    default: SHA256
  concurrency:
    description: Max number of files uploaded in parallel
    required: false
    default: "5"
  fail-fast:
    description: Stop after the first upload failure
    required: false
    default: "false"
```

Set `outputs:` to:
```yaml
outputs:
  results:
    description: JSON array of successful uploads (path, key, bucket, etag, versionId, location, size)
  failed:
    description: JSON array of failed uploads (path, key, error)
  object-count:
    description: Number of objects uploaded successfully
  keys:
    description: Newline-separated list of uploaded object keys
  locations:
    description: Newline-separated list of uploaded object URLs
```

- [ ] **Step 2: Commit**

```bash
git add action.yml
git commit -m "feat: declare v2 action inputs and outputs"
```

### Task 5.2: Rebuild dist and verify reproducibility

**Files:**
- Modify: `dist/**`

- [ ] **Step 1: Build under Node 24**

Run:
```bash
source "$HOME/.nvm/nvm.sh" && nvm use && npm run bundle
```
Expected: ncc build succeeds.

- [ ] **Step 2: Lint, format, test**

Run: `npm run lint && npm run format:check && npm run ci-test`
Expected: all pass.

- [ ] **Step 3: Verify dist is reproducible**

Run:
```bash
git add -A dist/ && npm run bundle && git diff --ignore-space-at-eol --text dist/ | wc -l
```
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add -A dist/
git commit -m "build: rebuild dist for v2"
```

### Task 5.3: Rewrite README for v2

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update usage, inputs, outputs, and add a Migrating section**

Update the `### Inputs` list to include every input from `action.yml` (grouped: selection, AWS, object options, behavior), change the basic example to use `path:` and `@v2`, replace the `### Outputs` section with `results`/`failed`/`object-count`/`keys`/`locations`, and add:
```markdown
## Migrating from v1

- Replace `file:` with `path:` (a newline-separated list of paths/globs).
  `file:` still works for one file but is deprecated.
- The `putObjectCommandOutput` output is removed. Use `results` (JSON),
  `keys`, or `locations` instead.
- The action now runs on Node 24.
- Single-file uploads behave the same: `path: file.txt` with `prefix: test`
  still produces the key `test/file.txt`.
```

- [ ] **Step 2: Lint the README**

Run: `npx markdownlint -c .github/linters/.markdown-lint.yaml README.md`
Expected: exit 0. Fix any line-length (80) or list-style findings.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document v2 usage, inputs, outputs, and migration"
```

---

## Phase 6: Changesets release automation

### Task 6.1: Install and configure Changesets

**Files:**
- Create: `.changeset/config.json`, `.changeset/README.md`
- Modify: `package.json`

- [ ] **Step 1: Install Changesets**

Run:
```bash
npm install -D @changesets/cli @changesets/changelog-github
```

- [ ] **Step 2: Write `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": [
    "@changesets/changelog-github",
    { "repo": "usualdesigner/s3-artifact-upload" }
  ],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 3: Add `.changeset/README.md`**

```markdown
# Changesets

This folder holds [changesets](https://github.com/changesets/changesets).
Run `npx changeset` to add one describing your change; the release workflow
consumes them to bump the version and update the changelog.
```

- [ ] **Step 4: Set version source of truth and scripts**

In `package.json`, set `"version": "1.0.17"` (the last released version) and add to `scripts`:
```json
    "changeset": "changeset",
    "changeset:version": "changeset version",
    "release:publish": "node script/publish.mjs"
```

- [ ] **Step 5: Commit**

```bash
git add .changeset package.json package-lock.json
git commit -m "build: add Changesets configuration"
```

### Task 6.2: Custom tag-based publish script

**Files:**
- Create: `script/publish.mjs`
- Delete: `script/release.sh`

- [ ] **Step 1: Write `script/publish.mjs`**

```javascript
// Tag-based publish for this GitHub Action (no npm publish).
// Reads the version from package.json; if the tag does not already exist,
// creates vX.Y.Z, moves the major tag (vX), pushes both, and cuts a release.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "pipe" }).toString().trim();
const tryRun = (cmd) => {
  try {
    return run(cmd);
  } catch {
    return "";
  }
};

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const tag = `v${version}`;
const major = `v${version.split(".")[0]}`;

if (tryRun(`git tag -l ${tag}`) === tag) {
  console.log(`Tag ${tag} already exists; nothing to publish.`);
  process.exit(0);
}

run('git config user.name "github-actions[bot]"');
run('git config user.email "github-actions[bot]@users.noreply.github.com"');
run(`git tag -a ${tag} -m "${tag}"`);
run(`git tag -f -a ${major} -m "${major} -> ${tag}"`);
run(`git push origin ${tag}`);
run(`git push -f origin ${major}`);

const notesCmd =
  `gh release create ${tag} --title ${tag} --latest ` +
  `--notes-file CHANGELOG-latest.md`;
// Extract the newest CHANGELOG section for release notes.
const changelog = readFileSync("CHANGELOG.md", "utf8");
const sections = changelog.split(/^## /m);
const latest = sections.length > 1 ? `## ${sections[1]}`.trim() : tag;
execSync("cat > CHANGELOG-latest.md", { input: latest });
run(notesCmd);
console.log(`Published ${tag} and moved ${major}.`);
```

- [ ] **Step 2: Remove the obsolete interactive script**

Run: `git rm script/release.sh`

- [ ] **Step 3: Commit**

```bash
git add script/publish.mjs
git commit -m "build: add tag-based publish script for Changesets"
```

### Task 6.3: Release workflow + changeset CI guard

**Files:**
- Create: `.github/workflows/release.yaml`
- Modify: `.github/workflows/ci.yaml`

- [ ] **Step 1: Write `.github/workflows/release.yaml`**

```yaml
name: Release

on:
  push:
    branches:
      - main

permissions:
  contents: write
  pull-requests: write

concurrency: release-${{ github.ref }}

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: npm

      - name: Install Dependencies
        run: npm ci

      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          version: npm run changeset:version
          publish: npm run release:publish
          createGithubReleases: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Add a changeset guard to CI**

In `.github/workflows/ci.yaml`, inside the `test-typescript` job after the `Test` step, add:
```yaml
      - name: Changeset status
        if: github.event_name == 'pull_request'
        run: npx changeset status --since=origin/${{ github.base_ref }}
```

- [ ] **Step 3: Validate workflow YAML locally**

Run: `npx --yes @action-validator/cli .github/workflows/release.yaml || true`
Expected: no fatal syntax errors (informational tool; if unavailable, skip).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yaml .github/workflows/ci.yaml
git commit -m "ci: add Changesets release workflow and PR guard"
```

### Task 6.4: Add the v2 major changeset

**Files:**
- Create: `.changeset/<name>.md`

- [ ] **Step 1: Create a major changeset**

Create `.changeset/v2-upload-engine.md`:
```markdown
---
"s3-artifact-upload": major
---

v2: multi-file/glob uploads, streamed multipart uploads via lib-storage,
richer S3 controls (SSE/KMS, storage class, tagging, content headers),
structured outputs (results/keys/locations), SHA-256 checksums, and the Node 24
runtime. Breaking: `putObjectCommandOutput` is removed and `file` is deprecated
in favor of `path`.
```

This makes the first post-merge release bump `1.0.17 -> 2.0.0`.

- [ ] **Step 2: Verify changeset is recognized**

Run: `npx changeset status`
Expected: lists `s3-artifact-upload` with a `major` bump to `2.0.0`.

- [ ] **Step 3: Commit**

```bash
git add .changeset/v2-upload-engine.md
git commit -m "chore: add v2 major changeset"
```

---

## Phase 7: Integration verification

### Task 7.1: Full green check before opening the PR

- [ ] **Step 1: Run everything on Node 24**

Run:
```bash
source "$HOME/.nvm/nvm.sh" && nvm use
rm -rf node_modules && npm ci
npm run lint && npm run format:check && npm run ci-test
npm run bundle && git diff --ignore-space-at-eol --text dist/ | wc -l
```
Expected: lint/format/tests pass; dist diff is `0`.

- [ ] **Step 2: Confirm no references to removed symbols**

Run: `grep -rn "putObjectCommandOutput\|src/main\|getMd5" src __tests__ action.yml || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Push and open the PR (base `main`)**

```bash
git push -u origin feat/v2-upload-engine
gh pr create --base main --title "v2: multi-file streamed upload engine" --body "Implements the v2 upload engine and Changesets release automation per docs/superpowers/specs/2026-06-07-s3-artifact-upload-v2-design.md"
```

- [ ] **Step 4: Confirm CI is green on the PR**

Run: `gh pr checks --watch`
Expected: Check dist/, Continuous Integration, Lint Codebase, CodeQL all pass.

---

## Notes for the implementer

- Commit messages must not mention AI assistants (user preference).
- Keep each file focused; do not re-merge modules back into one file.
- `@actions/glob` treats lines starting with `!` as excludes — that is why
  `resolve.ts` appends `!`-prefixed exclude patterns.
- `aws-sdk-client-mock` intercepts `lib-storage`'s `Upload` because small files
  issue a single `PutObjectCommand`; do not assert on multipart commands for the
  small test fixtures.
- The release workflow only tags/releases once the "Version Packages" PR is
  merged and `package.json`'s version no longer matches an existing tag.
