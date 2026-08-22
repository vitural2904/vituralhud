import { describe, expect, it } from "vitest";
import { parseLockfile } from "./lockfile";

describe("LCU lockfile", () => {
  it("parses credentials without exposing them elsewhere", () => {
    expect(parseLockfile("LeagueClient:1234:45678:secret:https", "C:/lockfile")).toEqual({
      port: 45_678,
      password: "secret",
      protocol: "https",
      sourcePath: "C:/lockfile",
    });
  });

  it("rejects malformed ports", () => {
    expect(() => parseLockfile("LeagueClient:1234:nope:secret:https", "C:/lockfile")).toThrow();
  });
});
