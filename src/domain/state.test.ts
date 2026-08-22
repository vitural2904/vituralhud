import { describe, expect, it } from "vitest";
import { createInitialState, reduceDraft } from "./state";

describe("draft reducer", () => {
  it("updates one pick without mutating the prior revision", () => {
    const state = createInitialState();
    const next = reduceDraft(state, { type: "SET_PICK", side: "blue", index: 0, championId: "Ashe" });
    expect(next.teams.blue.picks[0].championId).toBe("Ashe");
    expect(state.teams.blue.picks[0].championId).toBe("Ziggs");
  });

  it("clamps unsafe timer and score values", () => {
    const state = createInitialState();
    const timed = reduceDraft(state, { type: "SET_TIMER", timerMs: -100 });
    const scored = reduceDraft(timed, { type: "SET_SCORE", side: "red", value: 99 });
    expect(scored.timerMs).toBe(0);
    expect(scored.teams.red.score).toBe(2);
  });

  it("adapts score capacity to BO1, BO3 and BO5", () => {
    const state = createInitialState();
    const bo5 = reduceDraft(state, { type: "SET_BEST_OF", value: 5 });
    const scored = reduceDraft(bo5, { type: "SET_SCORE", side: "blue", value: 9 });
    const bo1 = reduceDraft(scored, { type: "SET_BEST_OF", value: 1 });
    expect(scored.teams.blue.score).toBe(3);
    expect(bo1.teams.blue.score).toBe(1);
  });

  it("preserves Vietnamese diacritics and player name casing", () => {
    const state = createInitialState();
    const next = reduceDraft(state, { type: "SET_PLAYER", side: "blue", index: 0, value: "Đặng Văn lâm" });

    expect(next.teams.blue.picks[0].player).toBe("Đặng Văn lâm");
    expect(createInitialState().teams.blue.picks[0].player).toBe("Kiên");
  });

  it("lets manual control fade the overlay and restores LCU control", () => {
    const state = createInitialState();
    const blocked = reduceDraft(state, { type: "SET_OVERLAY_VISIBLE", value: true });
    const manual = reduceDraft(state, { type: "SET_OVERRIDE", value: true });
    const visible = reduceDraft(manual, { type: "SET_OVERLAY_VISIBLE", value: true });
    const automatic = reduceDraft(visible, { type: "SET_OVERRIDE", value: false });

    expect(state.overlayVisible).toBe(false);
    expect(blocked.overlayVisible).toBe(false);
    expect(visible.overlayVisible).toBe(true);
    expect(automatic.overlayVisible).toBe(false);
  });
});
