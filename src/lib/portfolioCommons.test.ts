import { describe, expect, it } from "vitest";
import { describeUnknownError } from "./portfolioCommons";

describe("describeUnknownError", () => {
  it("reads a Postgrest-style object that is not an Error", () => {
    expect(
      describeUnknownError({
        message: "new row violates row-level security policy",
        code: "42501",
      }),
    ).toBe("new row violates row-level security policy (42501)");
  });

  it("falls back when nothing useful is present", () => {
    expect(describeUnknownError({}, "Unknown error")).toBe("Unknown error");
  });
});
