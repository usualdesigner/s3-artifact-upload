import fs from "fs";
import * as core from "@actions/core";
import * as main from "../src/main";
import { Stats } from "node:fs";

let getInputMock: jest.SpyInstance;

const runMock = jest.spyOn(main, "run");

describe("Main test suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs, "statSync").mockReturnValue({ size: 42 } as Stats);
    jest.spyOn(fs, "readFileSync").mockReturnValue("Hello there!");

    // debugMock = jest.spyOn(core, "debug").mockImplementation();
    // errorMock = jest.spyOn(core, "error").mockImplementation();
    getInputMock = jest.spyOn(core, "getInput").mockImplementation();
    // setFailedMock = jest.spyOn(core, "setFailed").mockImplementation();
    // setOutputMock = jest.spyOn(core, "setOutput").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("first test", async () => {
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
        case "meta-data":
          return '{"key1": "value1", "key2": "value2"}';
        default:
          return "";
      }
    });

    await main.run();
    expect(runMock).toHaveReturned();
  });
});
