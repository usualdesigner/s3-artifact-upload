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
    ...over,
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
        prefix: "web",
      }),
    );
    const keys = items.map((i) => i.key).sort();
    expect(keys).toEqual(["web/a/b.js", "web/app.js"]);
    expect(items.find((i) => i.key === "web/a/b.js")?.size).toBe(2);
  });

  it("recurses into a directory path and uploads all files under it", async () => {
    const items = await resolveFiles(
      baseInputs({
        paths: [path.join(dir, "dist")],
        baseDirectory: path.join(dir, "dist"),
        prefix: "web",
      }),
    );
    const keys = items.map((i) => i.key).sort();
    expect(keys).toEqual(["web/a/b.js", "web/app.js", "web/skip.map"]);
  });

  it("applies excludes", async () => {
    const items = await resolveFiles(
      baseInputs({
        paths: [path.join(dir, "dist", "**", "*")],
        exclude: [path.join(dir, "dist", "**", "*.map")],
        baseDirectory: path.join(dir, "dist"),
      }),
    );
    expect(items.some((i) => i.key.endsWith(".map"))).toBe(false);
  });

  it("flattens to basename when preserve-structure is false", async () => {
    const items = await resolveFiles(
      baseInputs({
        paths: [path.join(dir, "dist", "a", "b.js")],
        baseDirectory: path.join(dir, "dist"),
        preserveStructure: false,
        prefix: "flat",
      }),
    );
    expect(items[0].key).toBe("flat/b.js");
  });

  it("throws on key collisions when flattening", async () => {
    fs.mkdirSync(path.join(dir, "dist", "c"), { recursive: true });
    fs.writeFileSync(path.join(dir, "dist", "c", "app.js"), "dup");
    await expect(
      resolveFiles(
        baseInputs({
          paths: [path.join(dir, "dist", "**", "*.js")],
          baseDirectory: path.join(dir, "dist"),
          preserveStructure: false,
        }),
      ),
    ).rejects.toThrow(/Key collision/);
  });

  it("throws when a file resolves outside base-directory", async () => {
    await expect(
      resolveFiles(
        baseInputs({
          paths: [path.join(dir, "dist", "app.js")],
          baseDirectory: path.join(dir, "dist", "a"),
        }),
      ),
    ).rejects.toThrow(/outside base-directory/);
  });

  it("errors on no matches when if-no-files-found is error", async () => {
    await expect(
      resolveFiles(
        baseInputs({
          paths: [path.join(dir, "nope", "*.js")],
          ifNoFilesFound: "error",
        }),
      ),
    ).rejects.toThrow(/No files matched/);
  });

  it("returns empty and warns when if-no-files-found is warn", async () => {
    const warnSpy = jest.spyOn(core, "warning");
    const items = await resolveFiles(
      baseInputs({
        paths: [path.join(dir, "nope", "*.js")],
        ifNoFilesFound: "warn",
      }),
    );
    expect(items).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
