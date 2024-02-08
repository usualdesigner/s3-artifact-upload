/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` should be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from "@actions/core";
import * as main from "../src/main";

// Mock the action's main function
const runMock = jest.spyOn(main, "run");

// Mock the GitHub Actions core library
// let debugMock: jest.SpyInstance;
// let errorMock: jest.SpyInstance;
let getInputMock: jest.SpyInstance;
// let setFailedMock: jest.SpyInstance;
// let setOutputMock: jest.SpyInstance;

describe("action", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // debugMock = jest.spyOn(core, "debug").mockImplementation();
    // errorMock = jest.spyOn(core, "error").mockImplementation();
    getInputMock = jest.spyOn(core, "getInput").mockImplementation();
    // setFailedMock = jest.spyOn(core, "setFailed").mockImplementation();
    // setOutputMock = jest.spyOn(core, "setOutput").mockImplementation();
  });

  it("sets the time output", async () => {
    getInputMock.mockImplementation((name: string): string => {
      switch (name) {
        case "aws-access-key-id":
          return "testAccessKeyId";
        case "aws-secret-access-key":
          return "testSecretAccessKey";
        case "bucket-name":
          return "testBucketName";
        case "region":
          return "us-west-2";
        case "endpoint":
          return "http://localhost:9000";
        case "acl":
          return "public-read";
        case "prefix":
          return "test";
        case "file":
          return "file.txt";
        default:
          return "";
      }
    });

    await main.run();
    expect(runMock).toHaveReturned();
  });
});
