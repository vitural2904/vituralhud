import { describe, expect, it } from "vitest";
import { getPostMatchOverviewMetrics } from "./post-match-overview";

describe("post-match overview", () => {
  it("keeps every row visible when all values are zero", () => {
    expect(getPostMatchOverviewMetrics("voidGrubs")).toEqual([
      "gold",
      "towers",
      "dragons",
      "barons",
      "inhibitors",
      "voidGrubs",
    ]);
  });

  it("uses Rift Herald as the final row for older matches", () => {
    expect(getPostMatchOverviewMetrics("riftHeralds").at(-1)).toBe("riftHeralds");
  });
});
