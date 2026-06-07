import "aws-sdk-client-mock-jest";
import fs from "fs";
import os from "os";
import path from "path";
import * as core from "@actions/core";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { run } from "../src/run";

const s3Mock = mockClient(S3Client);

describe("run — end-to-end integration", () => {
  let tmpDir: string;
  let outputs: Record<string, string>;
  let failedMsg: string | undefined;

  beforeEach(() => {
    // Create a real nested file tree
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "s3-integration-"));
    fs.mkdirSync(path.join(tmpDir, "sub"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "app.js"), "console.log('app');");
    fs.writeFileSync(path.join(tmpDir, "sub", "b.js"), "console.log('b');");

    // Capture outputs and failures
    outputs = {};
    failedMsg = undefined;

    jest.spyOn(core, "setOutput").mockImplementation((k, v) => {
      outputs[k] = String(v);
    });
    jest.spyOn(core, "setFailed").mockImplementation((m) => {
      failedMsg = String(m);
    });
    jest.spyOn(core, "info").mockImplementation(() => {});
    jest.spyOn(core, "warning").mockImplementation(() => {});
    jest.spyOn(core, "error").mockImplementation(() => {});

    // Mock @actions/core inputs to return real-looking values
    jest.spyOn(core, "getMultilineInput").mockImplementation((name) => {
      if (name === "path") return [`${tmpDir}/**/*.js`];
      if (name === "exclude") return [];
      return [];
    });
    jest.spyOn(core, "getInput").mockImplementation((name) => {
      if (name === "bucket-name") return "test-bucket";
      // Provide explicit region + credentials so the client is fully specified
      // and the test does not depend on ambient AWS config (which is absent in CI).
      if (name === "aws-region") return "us-east-1";
      if (name === "aws-access-key-id") return "test-access-key";
      if (name === "aws-secret-access-key") return "test-secret-key";
      if (name === "base-directory") return tmpDir;
      if (name === "prefix") return "web";
      if (name === "concurrency") return "5";
      if (name === "checksum-algorithm") return "SHA256";
      if (name === "if-no-files-found") return "warn";
      if (name === "preserve-structure") return "true";
      if (name === "fail-fast") return "false";
      if (name === "file") return "";
      return "";
    });
    jest.spyOn(core, "getBooleanInput").mockImplementation((name) => {
      if (name === "preserve-structure") return true;
      if (name === "fail-fast") return false;
      return false;
    });

    // Mock S3 — real files are read from disk; only the network call is intercepted
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({
      ETag: '"e"',
      VersionId: "v1",
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uploads real files end-to-end and sets correct outputs", async () => {
    await run();

    // No failure
    expect(failedMsg).toBeUndefined();

    // Object count
    expect(outputs["object-count"]).toBe("2");

    // results JSON
    const results = JSON.parse(outputs["results"]) as Array<{
      key: string;
      bucket: string;
      etag?: string;
    }>;
    expect(results).toHaveLength(2);

    const sorted = [...results].sort((a, b) => a.key.localeCompare(b.key));
    expect(sorted[0].key).toBe("web/app.js");
    expect(sorted[1].key).toBe("web/sub/b.js");

    // Both have the mocked etag
    for (const r of results) {
      expect(r.etag).toBe('"e"');
      expect(r.bucket).toBe("test-bucket");
    }

    // keys output contains both keys
    const keys = outputs["keys"].split("\n");
    expect(keys).toContain("web/app.js");
    expect(keys).toContain("web/sub/b.js");

    // S3 received exactly 2 PutObjectCommands
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 2);
  });
});
