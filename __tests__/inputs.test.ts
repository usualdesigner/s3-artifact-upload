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
