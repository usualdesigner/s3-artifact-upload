# s3-artifact-upload v2 — Design

Date: 2026-06-07
Status: Approved (pending spec review)

## Overview

v2 turns `s3-artifact-upload` from a single-file uploader into a multi-file /
glob upload engine with streamed multipart uploads, richer S3 object controls,
and structured outputs. It also introduces Changesets-driven release
automation. This is a breaking release (`v1 → v2`), primarily because the
output shape changes.

Directory **sync** (skip-unchanged, delete-stale) is explicitly **out of scope**
for v2.0 and deferred to v2.1. The module boundaries below leave a clean seam
for it.

## Goals

- Upload many files in one step via paths and globs, with excludes.
- Stream uploads through `@aws-sdk/lib-storage` so large files use multipart and
  memory stays flat (no `readFileSync` of whole files).
- Expose first-class S3 object controls (SSE/KMS, storage class, tagging,
  content headers).
- Return structured, actionable outputs (per-object results, keys, locations).
- Run on the Node 24 action runtime.
- Automate versioning and releases with Changesets, adapted to this repo's
  tag-based (non-npm) release model.

## Non-goals (v2.0)

- Directory sync semantics (skip-unchanged via ETag/checksum compare).
- Deletion of stale remote objects.
- Downloading or listing objects.
- `allow-empty` style success-on-zero-matches beyond the `if-no-files-found`
  control described below.

## Architecture

Approach A (modular pipeline). The monolithic `src/main.ts` is split into
focused units communicating through typed interfaces.

```
src/
  index.ts     entrypoint -> calls run()
  run.ts       orchestrator: parseInputs -> S3Client -> resolveFiles
               -> upload with bounded concurrency -> aggregate -> outputs/fail
  inputs.ts    parseInputs(): ActionInputs — read + validate all inputs,
               file->path alias, parse meta-data/tagging JSON
  resolve.ts   resolveFiles(inputs): UploadItem[] — expand globs + excludes,
               derive object keys, detect collisions and traversal
  upload.ts    uploadFile(client, item, inputs): UploadResult — streamed
               multipart via lib-storage + checksum
```

Interfaces (the seams):

- `ActionInputs` — fully parsed, validated configuration.
- `UploadItem` — `{ absPath: string; key: string; size: number }`.
- `UploadResult` — `{ path; key; bucket; etag?; versionId?; location?; size }`.

`resolveFiles` returning a plain `UploadItem[]` is the extension point for v2.1:
sync swaps the resolver for a planner that also emits delete operations, without
touching `upload.ts` or the orchestration shape.

Single-responsibility split: `upload.ts` knows S3 but not concurrency or
aggregation; `run.ts` knows orchestration but not S3 specifics.

## Inputs

Exactly one of `path` or `file` is required (error if both or neither).

| Input | Required | Default | Notes |
| --- | --- | --- | --- |
| `path` | yes¹ | — | Multiline; each line is a literal path, directory, or glob (e.g. `dist/**/*.js`) |
| `file` | — | — | Deprecated alias for a single `path` entry; emits a deprecation warning |
| `bucket-name` | yes | — | Target S3 bucket |
| `exclude` | — | — | Multiline glob patterns removed from matches |
| `base-directory` | — | `.` (cwd) | Object keys are derived relative to this directory |
| `preserve-structure` | — | `true` | `false` -> key is the file basename only |
| `prefix` | — | — | Prepended to every derived key |
| `if-no-files-found` | — | `warn` | `warn` / `error` / `ignore` (mirrors actions/upload-artifact) |
| `aws-access-key-id` | — | — | Prefer `configure-aws-credentials` |
| `aws-secret-access-key` | — | — | Prefer `configure-aws-credentials` |
| `aws-region` | — | — | Falls back to environment |
| `endpoint` | — | — | Custom endpoint for S3-compatible storage |
| `acl` | — | — | Canned ACL |
| `cache-control` | — | — | `Cache-Control` header |
| `content-encoding` | — | — | `Content-Encoding` header |
| `content-disposition` | — | — | `Content-Disposition` header |
| `content-type` | — | auto (mime) | Override auto-detection |
| `meta-data` | — | — | JSON object of custom metadata |
| `storage-class` | — | — | e.g. `STANDARD_IA`, `INTELLIGENT_TIERING`, `GLACIER`, `DEEP_ARCHIVE` |
| `server-side-encryption` | — | — | `AES256` or `aws:kms` |
| `kms-key-id` | — | — | Requires `server-side-encryption: aws:kms` |
| `tagging` | — | — | JSON object or `k1=v1&k2=v2`; URL-encoded before sending |
| `checksum-algorithm` | — | `SHA256` | `SHA256` / `CRC32` / `CRC32C` / `SHA1` / `none` |
| `concurrency` | — | `5` | Max files uploaded in parallel |
| `fail-fast` | — | `false` | Stop scheduling new uploads after the first failure |

¹ Provide either `path` or `file`, not both.

Validation (fails before any upload):

- Both or neither of `path`/`file` set.
- `kms-key-id` set without `server-side-encryption: aws:kms`.
- Malformed JSON for `meta-data` or `tagging`.
- Unknown enum values for `acl`, `storage-class`, `server-side-encryption`,
  `checksum-algorithm`, `if-no-files-found`.

## File resolution and key derivation

`resolveFiles(inputs)` produces the upload list:

1. Expand `path` lines with `@actions/glob` (GHA-native glob semantics).
   A line may be a literal file, a directory (recursed), or a glob.
2. Apply `exclude` globs; remove any match they hit.
3. Drop directories, resolve to absolute paths, de-duplicate identical paths.
4. Derive each key:
   - `rel = relative(resolve(base-directory), absPath)`.
   - If `absPath` is outside `base-directory` (rel starts with `..` or is
     absolute) -> validation error (prevents traversal keys).
   - `preserve-structure: true` -> `keyBody = rel` with POSIX `/` separators.
   - `preserve-structure: false` -> `keyBody = basename(absPath)`.
   - `key = [prefix, keyBody].filter(Boolean).join("/")`, then normalize
     (strip leading `/`, collapse repeated `/`).
5. Collision check: if two source files map to the same key, error before
   uploading anything (no silent within-run overwrite).
6. Empty match: governed by `if-no-files-found` (`warn` default succeeds with
   zero uploads but logs; `error` fails; `ignore` is silent).

Worked examples (cwd = repo root):

| `path` | `base-directory` | `preserve-structure` | `prefix` | file -> key |
| --- | --- | --- | --- | --- |
| `dist/app.js` | `.` | true | — | `dist/app.js` -> `dist/app.js` |
| `dist/**/*.js` | `dist` | true | `web` | `dist/a/b.js` -> `web/a/b.js` |
| `dist/**/*.js` | `.` | false | `assets` | `dist/a/b.js` -> `assets/b.js` |
| `file.txt` | `.` | true | `test` | `file.txt` -> `test/file.txt` (matches v1) |

The last row shows existing single-file v1 usage (`file:` + `prefix:`) produces
identical keys under v2.

## Upload behavior

Per-file (`upload.ts`):

- Stream with `fs.createReadStream(absPath)` into `@aws-sdk/lib-storage`'s
  `Upload`. Large files auto-switch to multipart; `Upload` manages part sizing
  and per-file part concurrency (`queueSize`) internally.
- Integrity via `ChecksumAlgorithm` (default `SHA256`); the SDK computes part
  and full-object checksums. The legacy manual base64 MD5 (`ContentMD5`) is
  removed (incompatible with multipart).
- `ContentType`: explicit `content-type` input, else `mime.lookup(file)`, else
  omitted.
- Params mapped from inputs: `ACL`, `CacheControl`, `ContentEncoding`,
  `ContentDisposition`, `Metadata`, `StorageClass`, `ServerSideEncryption`,
  `SSEKMSKeyId`, `Tagging` (URL-encoded), `ChecksumAlgorithm`.
- Returns `UploadResult` from the `Upload` response (`Location`, `ETag`,
  `VersionId`) plus `{ path, key, size }`.

Orchestration (`run.ts`):

- One `S3Client`; `region`/`endpoint`/credentials optional and fall back to the
  environment (recommended with `configure-aws-credentials`).
- Upload through a bounded worker pool of size `concurrency` (default 5),
  implemented as a small in-house semaphore (no new runtime dependency).
- `fail-fast: false` (default): attempt every file, collect successes and
  failures, then `setFailed` with a summary if any failed.
- `fail-fast: true`: stop scheduling new uploads after the first failure, await
  in-flight uploads, then fail.
- Validation errors fail immediately, before any upload.

## Outputs

Action outputs are strings; structured data is JSON-encoded.

| Output | Type | Description |
| --- | --- | --- |
| `results` | JSON array | One entry per successful upload: `{ path, key, bucket, etag, versionId, location, size }` |
| `failed` | JSON array | One entry per failure: `{ path, key, error }`; `[]` on full success |
| `object-count` | number | Count of successful uploads |
| `keys` | multiline string | Uploaded object keys, newline-separated |
| `locations` | multiline string | Object URLs (SDK `Location`), newline-separated |

`putObjectCommandOutput` is removed (the headline breaking change). Single-file
users read `results[0]` or the convenience `keys` / `locations` outputs.

## Node 24, build, and CI

- `action.yml`: `runs.using: node20` -> `node24`.
- `.node-version` and `.nvmrc` -> latest Node 24 LTS; CI uses
  `node-version-file`, so all jobs follow. `dist/` is rebuilt under Node 24.
- `tsconfig.json`: `target` -> `ES2023`; `module`/`moduleResolution` stay
  `NodeNext`.
- New runtime deps: `@aws-sdk/lib-storage`, `@actions/glob`.
- `check-dist` continues to verify committed `dist/` matches a clean build.

## Changesets integration

- Dev deps: `@changesets/cli`, `@changesets/changelog-github`.
- `.changeset/config.json`: changelog via `@changesets/changelog-github`
  (repo `usualdesigner/s3-artifact-upload`), `baseBranch: main`,
  `commit: false`. Package stays `private: true` (never `npm publish`ed);
  Changesets still versions it.
- `package.json` `version` becomes the source of truth, set to `2.0.0`.
  Contributors add a changeset per change (`npx changeset`).
- Release workflow `.github/workflows/release.yaml` (on push to `main`):
  - Checkout (`fetch-depth: 0`), Node 24, `npm ci`.
  - `changesets/action@v1` with:
    - `version: npm run changeset:version` (`changeset version`: bumps
      `package.json` + writes `CHANGELOG.md`, opens/updates the "Version
      Packages" PR).
    - `publish: npm run release:publish` (custom; no npm publish).
    - `createGithubReleases: false` (release created by our script).
  - `release:publish` reads `version` from `package.json`; if tag `vX.Y.Z` does
    not exist, creates the annotated tag, moves the major tag (`v2`), pushes
    both, and `gh release create vX.Y.Z` using the matching `CHANGELOG.md`
    section.
- `dist/` is current on `main` (each feature PR commits its rebuilt `dist/`,
  enforced by `check-dist`); the version-only bump does not touch `dist/`, so
  the release step only tags and releases.
- A `changeset status` check is added to PR CI so contributions missing a
  changeset are flagged.
- The interactive `script/release.sh` is removed (superseded by the workflow).

## Testing strategy

Replaces today's superficial single test. Adds `aws-sdk-client-mock` and
`aws-sdk-client-mock-jest`.

- `inputs.test.ts`: parsing; `file`->`path` alias and deprecation warning;
  validation errors (both/neither path|file, `kms-key-id` without `aws:kms`,
  malformed `meta-data`/`tagging`, bad enums).
- `resolve.test.ts`: glob expansion and excludes against a temp fixture tree;
  key derivation across the matrix above; collision and traversal errors;
  `if-no-files-found` behavior.
- `upload.test.ts`: mocked S3; assert param mapping (SSE/KMS, storage class,
  tagging encoding, checksum, content type) and `UploadResult` shape.
- `run.test.ts`: concurrency bound respected; `fail-fast` vs aggregate; outputs
  set correctly; `setFailed` when any file fails.

## v1 -> v2 migration (README section)

- `file:` -> `path:` (deprecated alias still works; warns).
- Output `putObjectCommandOutput` removed -> use `results` / `keys` /
  `locations`.
- Runtime is Node 24 (drops Node-20-only runners).
- Single-file behavior is unchanged; key derivation reproduces v1 keys (see the
  resolution table).

## Breaking changes summary

1. `putObjectCommandOutput` output removed.
2. Action runtime moves to Node 24.
3. `file` input deprecated in favor of `path` (still functional this major).
