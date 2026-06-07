/**
 * Unit tests for the action's entrypoint, src/index.ts
 */

import * as run from "../src/run";

// Mock the action's entrypoint
const runMock = jest.spyOn(run, "run").mockImplementation();

describe("index", () => {
  it("calls run when imported", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("../src/index");

    expect(runMock).toHaveBeenCalled();
  });
});
