import { describe, expect, it } from "vitest";
import { buildTeamLogoFilename, detectTeamLogoFormat, isTeamLogoFile } from "./team-logo-assets";

describe("team logo assets", () => {
  it("detects PNG by file signature", () => {
    expect(detectTeamLogoFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ extension: "png", mime: "image/png" });
  });

  it("rejects data that is not an allowed image", () => {
    expect(detectTeamLogoFormat(Buffer.from("not an image"))).toBeNull();
  });

  it("creates a safe predictable filename", () => {
    expect(buildTeamLogoFilename("Tuyển Đội #1.PNG", "png", "abc123")).toBe("tuyen-doi-1-abc123.png");
  });

  it("lists only supported image files", () => {
    expect(isTeamLogoFile("team.webp")).toBe(true);
    expect(isTeamLogoFile("payload.svg")).toBe(false);
  });
});
