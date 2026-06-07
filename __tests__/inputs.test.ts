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
