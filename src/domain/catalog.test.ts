import { describe, expect, it } from "vitest";
import { champions, searchChampions } from "./catalog";

describe("champion catalog", () => {
  it("contains a complete, unique roster with dedicated ban and pick assets", () => {
    expect(champions).toHaveLength(173);
    expect(new Set(champions.map((champion) => champion.id)).size).toBe(champions.length);

    for (const champion of champions) {
      expect(champion.iconUrl).toBe(`/champions/icons/${champion.id}.png`);
      expect(champion.loadingUrl).toBe(`/champions/loading/${champion.id}.jpg`);
    }
  });

  it("keeps Xayah and Rakan on separate individual assets", () => {
    const xayah = champions.find((champion) => champion.id === "Xayah");
    const rakan = champions.find((champion) => champion.id === "Rakan");

    expect(xayah?.iconUrl).toBe("/champions/icons/Xayah.png");
    expect(xayah?.loadingUrl).toBe("/champions/loading/Xayah.jpg");
    expect(rakan?.iconUrl).toBe("/champions/icons/Rakan.png");
    expect(rakan?.loadingUrl).toBe("/champions/loading/Rakan.jpg");
  });

  it("finds champions by partial, punctuation-free and accent-free text", () => {
    expect(searchChampions("zix")[0]?.id).toBe("Khazix");
    expect(searchChampions("sin")[0]?.id).toBe("LeeSin");
    expect(searchChampions("ngo")[0]?.id).toBe("MonkeyKing");
  });
});
