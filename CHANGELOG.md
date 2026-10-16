# Changelog

## 1.3.0 - 2026-10-17

- Audit draft state transitions: decoded artwork crossfades, gentle lock settling, animated turn/team labels, skipped-ban markers, smooth timer closure and persistent unified-output handoff. Respect reduced motion and ignore stale image loads.
- Distinguish tentative picks and bans with a gentle 1.8-second pulse. Stop on confirmed LCU actions, keep locked bans grayscale and respect reduced motion.
- Add STOP.cmd and npm stop for managed START.cmd sessions. Stop gracefully, persist off-air and cancel pending automatic restarts.
- Simplify champ-select to a compact LCS-inspired strip: vertical player names, adjacent role icons, outer ban rows and a central team panel.
- Replace the numeric broadcast timer with a smooth, centered countdown line. Preserve action duration across updates and reset on the next action.
- Discover active League installations from process paths and Riot metadata; skip stale lockfiles and refresh rotated credentials.
- Reject interrupted LCU responses instead of leaving the polling loop stuck.
- Hold the final live draft lineup for 15 seconds, including the transition out of champ select. Respect operator fades and lobby cancellation.
- Supervise START.cmd servers with bounded crash recovery and exit diagnostics. Recovered servers remain off-air.
- Bundle Vietnamese Unbounded and Archivo variable fonts for the broadcast overlays. Keep dashboard typography unchanged.
- Prevent LCU champ-select timer bounce within the same action window. Preserve manual control.
- Fix CI security audit failures by updating sharp, fast-uri, brace-expansion and source-map-js to patched versions.
- Read the health-check version from package metadata so START.cmd accepts future releases. Correct repository links and include the HUD design specification.
- Preserve shared action-group timers when one participant locks. Keep traded champion ownership during finalization. Re-arm the final hold after late reconnects to custom games that reuse an ID.
- Reject generic 404 responses when validating discovered LCU candidates, so stale ports do not mask the real client.

## 1.2.0 - 2026-09-28

- Validate all commands and snapshots. Guard local control requests.
- Queue durable writes. Keep recovery snapshots. Rotate event logs.
- Preserve operator output ownership. Restart off-air.
- Add blank manual reports, explicit missing fields, editable player identities and approval checks.
- Bound Match-V5 fetches. Cancel requests. Discard late results.
- Correct OBS routes, keyboard edits, responsive controls and accessibility labels.
- Decode and normalize uploads. Publish complete versioned champion assets.
- Check launcher dependencies. Tell users to run `npm ci` when needed. Update vulnerable packages.
- Split dashboard and overlay bundles. Bundle complete Vietnamese fallback font weights.
- Add API, persistence, crash, browser, load and soak regression tests.

Real OBS, LCU and Riot-key checks remain manual steps before use in a live show.

## 1.1.0 - 2026-08-24

- Add the post-match overlay and operator dashboard.
- Add Match-V5 import with review, manual repair, and publish flow.
- Add Match Leaders and compact objective overview panels.
- Add team logo upload and local asset selection.
- Add post-match tests and safer missing-data defaults.

## 1.0.0

- First public release.
- Add the OBS ban/pick overlay, manual dashboard, and read-only LCU sync.
