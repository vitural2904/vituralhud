import path from "node:path";

export const MAX_TEAM_LOGO_BYTES = 5 * 1024 * 1024;
export type TeamLogoFormat = { extension: "png" | "jpg" | "webp"; mime: "image/png" | "image/jpeg" | "image/webp" };

export function detectTeamLogoFormat(data: Buffer): TeamLogoFormat | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: "png", mime: "image/png" };
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { extension: "jpg", mime: "image/jpeg" };
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return { extension: "webp", mime: "image/webp" };
  return null;
}

export function buildTeamLogoFilename(originalName: string, extension: TeamLogoFormat["extension"], suffix: string) {
  const base = path.basename(originalName, path.extname(originalName))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "team-logo";
  return `${base}-${suffix}.${extension}`;
}

export function isTeamLogoFile(name: string) { return /\.(?:png|jpe?g|webp)$/i.test(name); }
