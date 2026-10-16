# LCU discovery and end-of-draft lifecycle

Research date: 2026-10-17. Scope: Windows discovery, lockfile meaning, draft visibility. No live League client was available here. These findings do not identify the user's process-exit cause.

## Implemented and checked

- Discovery reads running League executable paths and Riot installation metadata. It does not read process command lines or scan entire disks. It bounds the process query, caches candidate paths briefly, probes credentials on loopback, skips stale installations, and re-reads credentials on reconnect.
- The live final lineup remains visible for 15 seconds after a known draft transitions to `complete`. A monotonic deadline prevents repeated polls or session-end 404s from extending the hold. New drafts, operator fades, cancellation to Lobby, and fresh server starts are covered by regression checks.
- Interrupted LCU HTTP responses previously left the polling promise pending. A local HTTP server reproduced this exact failure. Response abort/error handlers now reject it so the adapter can reconnect.
- `START.cmd` now launches a supervisor. Real child-process tests cover clean exit, retry exhaustion, and forced termination of the actual HUD server. Recovery retains saved match data and restarts off-air. This mitigates crashes; it does not establish the cause of the user's earlier exit. Exit records and fatal error diagnostics are written to the existing `.codex-local/server.log`.
- Live League/OBS broadcast validation is still required on the user's machine. Fixture and local-process tests cannot establish behavior for every LCU build or installation layout.

## Evidence and limits

- Riot describes LCU as local communication between its client front end and back end. It is unsupported for third-party applications, without guarantees of full documentation, uptime, or change notice. A robust integration must tolerate transient absence and schema changes. [Riot Developer Relations](https://support-developer.riotgames.com/hc/en-us/articles/22698698001939-League-of-Legends)
- The lockfile supplies `LeagueClient:PID:PORT:PASS:PROTOCOL`. It is connection metadata and credentials. Gameflow phase is not a field in this format. [LCU schema export project's retrieval instructions](https://github.com/nomi-san/lcu-api#-how-to-retrieve-from-league-client)
- The connector author's source derives the installation directory, reads the adjacent `lockfile`, then handles file addition, change, and removal. Its legacy Windows implementation reads process command lines using WMIC; this is implementation evidence, not a Riot API contract. [Pupix/lcu-connector source](https://github.com/Pupix/lcu-connector/blob/master/lib/index.js#L23-L133)
- Windows exposes `ExecutablePath` separately from `CommandLine` in `Win32_Process`. Therefore path discovery can request executable paths only, avoiding command-line authentication tokens. A missing/inaccessible path must be an ordinary discovery miss. [Microsoft Win32_Process](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process)
- A launcher author's source reads `%ProgramData%\Riot Games\RiotClientInstalls.json`. It treats `rc_live`, `rc_default`, and `patchlines.KeystoneFoundationLiveWin` as Riot Client executable hints. It also reads League's `product_install_full_path` from product metadata. This is third-party implementation source, not an official schema. [Launcher source](https://github.com/Karl-Cao/league-zh-cn-launcher/blob/main/League-zh_CN-Launcher.ps1#L43-L89)

No Riot-published `RiotClientInstalls.json` schema was found. In particular, `associated_client` must remain an optional heuristic. Its keys may be game-install path hints; values must not automatically be treated as League roots. They may identify the shared Riot Client. Validate the adjacent lockfile before use. No local installation record existed to verify the shape on this machine.

## Practical discovery policy

This is an engineering recommendation, not a Riot guarantee:

1. Preserve an explicit lockfile override. Validate it with the same rules as discovered files.
2. Check the last successful path. Re-read credentials after connection/authentication failure.
3. Query only paths of running `LeagueClient.exe` and `LeagueClientUx.exe`. Try adjacent lockfiles; allow one known parent for a nested executable layout.
4. Read bounded installation hints from Riot's known installation record and League product metadata. Check both associated-client keys and recognizable game-root fields defensively. Never execute a path from metadata.
5. Check a small set of known install roots on available local drives. No recursive or whole-disk search. Normalize, deduplicate, and cap candidate count.
6. Require the exact client name `LeagueClient`, positive PID, valid integer TCP port, nonempty password, and allowed protocol. Reject the shared Riot Client's lockfile. Before caching a winning candidate, verify an authenticated read-only LCU request over loopback. Continue to the next candidate on stale credentials.
7. Keep secrets server-side. Never include raw lockfile contents, command lines, passwords, or Authorization headers in state, API responses, or logs. Cache paths, not credentials, across restarts.

Timeout the process query and all network probes. Back off when League is closed. A transient discovery failure must not stop the HUD server.

## Finalization and visibility

`timer.phase` belongs to the champ-select session. A captured session response contains `FINALIZATION`; another integration author's example handles both `FINALIZATION` and `GAME_STARTING`, and notes that game ID can be zero throughout a custom-game draft. These are direct observations/source from their authors, not a supported current Riot contract. [Captured session](https://gist.github.com/xadamxk/8cb5d21d24bb78d63c5241e97087bb23), [integration source](https://gist.github.com/mrtolkien/68b9f37546f3f1b6ba27f47fa91f66c4)

Gameflow is a separate API concept. A historical client schema export lists `ChampSelect`, `GameStart`, `InProgress`, `Reconnect`, and later phases. It does not establish exact timing in today's client. [Historical exported client schema](https://gist.github.com/Pupix/1078c64c9bc33809eccfd60556411679)

The pre-fix code here explains immediate overlay hiding without any lockfile change: `derivePhase` maps `FINALIZATION`, `GAME_STARTING`, or ten completed picks to `complete`; `reconcileOutput` immediately excludes `complete` from automatic draft output. The state rules themselves cause the hide. See [normalization](../../server/lcu/normalize.ts) and [output reconciliation](../../src/domain/state.ts). These are source-level findings; a live trace is still needed to establish which trigger the user's client emits first.

The user chose a 15-second final-lineup hold. Start one deadline on the first confirmed completion. Keep the final lineup visible through temporary missing session data or disconnection until that deadline. Do not extend it on each repeated poll. Keep accepting lineup updates during finalization so swaps can appear. A new draft/reset/operator output change must cancel the old hold. Only a new uncompleted draft should re-arm automatic visibility. Use actual session identity where available; do not rely solely on custom-game `gameId = 0`.

There is no evidence that LCU requires the HUD process to exit after champion select. Overlay visibility and server lifetime must be handled separately. Preserve error diagnostics and test recoverable read, write, and disconnect failures. A process log or crash record is needed before asserting the cause of the full app/server closure.
