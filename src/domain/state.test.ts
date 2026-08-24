import { describe, expect, it } from "vitest";
import { createInitialState, reduceDraft } from "./state";

describe("broadcast reducer", () => {
  it("starts without invented post-match numbers", () => {
    const state = createInitialState();
    expect(state.postMatch.data.durationSeconds).toBe(0);
    expect(state.postMatch.data.teams.blue.kills).toBe(0);
    expect(state.postMatch.data.teams.red.gold).toBe(0);
    expect(state.postMatch.data.teams.blue.players[0].damageToChampions).toBe(0);
  });

  it("updates one pick without mutating the prior revision", () => {
    const state = createInitialState();
    const next = reduceDraft(state, { type: "SET_PICK", side: "blue", index: 0, championId: "Ashe" });
    expect(next.draft.teams.blue.picks[0].championId).toBe("Ashe");
    expect(state.draft.teams.blue.picks[0].championId).toBe("Ziggs");
  });

  it("clamps unsafe timer and score values", () => {
    const state = createInitialState();
    const timed = reduceDraft(state, { type: "SET_TIMER", timerMs: -100 });
    const scored = reduceDraft(timed, { type: "SET_SCORE", side: "red", value: 99 });
    expect(scored.draft.timerMs).toBe(0);
    expect(scored.match.teams.red.score).toBe(2);
  });

  it("preserves Vietnamese player names", () => {
    const state = createInitialState();
    const next = reduceDraft(state, { type: "SET_PLAYER", side: "blue", index: 0, value: "Đặng Văn Lâm" });
    expect(next.match.teams.blue.players[0]).toBe("Đặng Văn Lâm");
    expect(state.match.teams.blue.players[0]).toBe("Kiên");
  });

  it("keeps draft output under manual director control", () => {
    const state = createInitialState();
    const blocked = reduceDraft(state, { type: "SET_OVERLAY_VISIBLE", value: true });
    const manual = reduceDraft(state, { type: "SET_OVERRIDE", value: true });
    const visible = reduceDraft(manual, { type: "SET_OVERLAY_VISIBLE", value: true });
    const automatic = reduceDraft(visible, { type: "SET_OVERRIDE", value: false });
    expect(blocked.activeOutput).toBe("none");
    expect(visible.activeOutput).toBe("draft");
    expect(automatic.activeOutput).toBe("none");
  });

  it("requires review and approval before post-match can go live", () => {
    const waiting = createInitialState();
    const rejected = reduceDraft(waiting, { type: "SET_OUTPUT", output: "post-match" });
    const review = reduceDraft(waiting, { type: "POST_MATCH_LOAD_FIXTURE" });
    const stillRejected = reduceDraft(review, { type: "SET_OUTPUT", output: "post-match" });
    const ready = reduceDraft(review, { type: "POST_MATCH_SET_READY", value: true });
    const live = reduceDraft(ready, { type: "SET_OUTPUT", output: "post-match" });
    expect(rejected.activeOutput).toBe("none");
    expect(stillRejected.activeOutput).toBe("none");
    expect(ready.postMatch.status).toBe("ready");
    expect(live.postMatch.status).toBe("live");
    expect(live.activeOutput).toBe("post-match");
  });

  it("marks field overrides and takes a changed live report off air", () => {
    const review = reduceDraft(createInitialState(), { type: "POST_MATCH_LOAD_FIXTURE" });
    const ready = reduceDraft(review, { type: "POST_MATCH_SET_READY", value: true });
    const live = reduceDraft(ready, { type: "SET_OUTPUT", output: "post-match" });
    const changed = reduceDraft(live, { type: "POST_MATCH_SET_METRIC", side: "blue", field: "kills", value: 19 });
    expect(changed.postMatch.data.teams.blue.kills).toBe(19);
    expect(changed.postMatch.overrideFields).toContain("teams.blue.kills");
    expect(changed.postMatch.status).toBe("review");
    expect(changed.postMatch.confidence).toBe("unverified");
    expect(changed.postMatch.baselineConfidence).toBe("high");
    expect(changed.activeOutput).toBe("none");
  });

  it("restores the fetched baseline", () => {
    const review = reduceDraft(createInitialState(), { type: "POST_MATCH_LOAD_FIXTURE" });
    const changed = reduceDraft(review, { type: "POST_MATCH_SET_DURATION", seconds: 99 });
    const reset = reduceDraft(changed, { type: "POST_MATCH_RESET_OVERRIDES" });
    expect(reset.postMatch.data.durationSeconds).toBe(1986);
    expect(reset.postMatch.overrideFields).toEqual([]);
    expect(reset.postMatch.confidence).toBe("high");
  });

  it("resets one manual field without discarding other overrides", () => {
    const review = reduceDraft(createInitialState(), { type: "POST_MATCH_LOAD_FIXTURE" });
    const kills = reduceDraft(review, { type: "POST_MATCH_SET_METRIC", side: "blue", field: "kills", value: 20 });
    const duration = reduceDraft(kills, { type: "POST_MATCH_SET_DURATION", seconds: 2000 });
    const resetOne = reduceDraft(duration, { type: "POST_MATCH_RESET_FIELD", field: "teams.blue.kills" });
    expect(resetOne.postMatch.data.teams.blue.kills).toBe(18);
    expect(resetOne.postMatch.data.durationSeconds).toBe(2000);
    expect(resetOne.postMatch.overrideFields).toEqual(["durationSeconds"]);
    expect(resetOne.postMatch.source).toBe("manual");
  });

  it("keeps kills out of overview data while allowing macro edits", () => {
    const review = reduceDraft(createInitialState(), { type: "POST_MATCH_LOAD_FIXTURE" });
    const changed = reduceDraft(review, { type: "POST_MATCH_SET_METRIC", side: "blue", field: "inhibitors", value: 3 });
    const early = reduceDraft(changed, { type: "POST_MATCH_SET_EARLY_OBJECTIVE", objective: "riftHeralds" });
    expect(early.postMatch.data.teams.blue.kills).toBe(18);
    expect(early.postMatch.data.teams.blue.inhibitors).toBe(3);
    expect(early.postMatch.data.earlyObjective).toBe("riftHeralds");
    expect(early.postMatch.overrideFields).toEqual(["teams.blue.inhibitors", "earlyObjective"]);
  });

  it("returns a failed fetch to review after a manual correction", () => {
    const review = reduceDraft(createInitialState(), { type: "POST_MATCH_LOAD_FIXTURE" });
    const failed = structuredClone(review);
    failed.postMatch.status = "error";
    const corrected = reduceDraft(failed, { type: "POST_MATCH_SET_METRIC", side: "red", field: "dragons", value: 1 });
    expect(corrected.postMatch.status).toBe("review");
    expect(corrected.postMatch.source).toBe("manual");
  });
});
