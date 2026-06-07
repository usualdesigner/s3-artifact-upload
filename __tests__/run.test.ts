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
    ...over,
  };
}

const items: UploadItem[] = [
  { absPath: "/a", path: "a", key: "a", size: 1 },
  { absPath: "/b", path: "b", key: "b", size: 1 },
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
    jest.spyOn(core, "error").mockImplementation(() => {});
    jest.spyOn(inputsMod, "parseInputs").mockReturnValue(fakeInputs());
    jest.spyOn(resolveMod, "resolveFiles").mockResolvedValue(items);
  });
  afterEach(() => jest.restoreAllMocks());

  it("uploads all files and sets outputs", async () => {
    jest
      .spyOn(uploadMod, "uploadFile")
      .mockImplementation(async (_c, item) => ({
        path: item.path,
        key: item.key,
        bucket: "b",
        etag: '"e"',
        size: 1,
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
    expect(core.error).toHaveBeenCalledTimes(1);
  });

  it("empty resolve → empty outputs, no failure", async () => {
    jest.spyOn(resolveMod, "resolveFiles").mockResolvedValue([]);
    const uploadSpy = jest
      .spyOn(uploadMod, "uploadFile")
      .mockResolvedValue({ path: "x", key: "x", bucket: "b", size: 1 });

    await run();

    expect(outputs["results"]).toBe("[]");
    expect(outputs["failed"]).toBe("[]");
    expect(outputs["object-count"]).toBe("0");
    expect(outputs["keys"]).toBe("");
    expect(outputs["locations"]).toBe("");
    expect(failed).toBeUndefined();
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("fail-fast: true stops scheduling after first failure", async () => {
    jest
      .spyOn(inputsMod, "parseInputs")
      .mockReturnValue(fakeInputs({ failFast: true, concurrency: 1 }));
    const threeItems: UploadItem[] = [
      { absPath: "/a", path: "a", key: "a", size: 1 },
      { absPath: "/b", path: "b", key: "b", size: 1 },
      { absPath: "/c", path: "c", key: "c", size: 1 },
    ];
    jest.spyOn(resolveMod, "resolveFiles").mockResolvedValue(threeItems);
    const uploadSpy = jest
      .spyOn(uploadMod, "uploadFile")
      .mockRejectedValueOnce(new Error("first fails"))
      .mockResolvedValue({ path: "b", key: "b", bucket: "b", size: 1 });

    await run();

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(outputs["failed"])).toHaveLength(1);
    expect(JSON.parse(outputs["results"])).toHaveLength(0);
    expect(outputs["object-count"]).toBe("0");
    expect(failed).toBeDefined();
  });

  it("top-level error → setFailed with message", async () => {
    jest.spyOn(inputsMod, "parseInputs").mockImplementation(() => {
      throw new Error("bad input");
    });

    await run();

    expect(failed).toMatch(/bad input/);
  });
});
