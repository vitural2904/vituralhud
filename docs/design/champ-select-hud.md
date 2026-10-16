# Champ-select HUD

Reference: the user's supplied LCS crop and two text specifications (countdown and player identity). The screenshot is a visual reference; its teams, sponsor and logos are not hard-coded into the product.

## Layout

- Transparent 1920 × 1080 OBS canvas. HUD sits at the bottom, 336px high at reference size.
- Five 68px ban tiles at each outer corner. Center space above the portraits stays transparent.
- Ten adjacent portrait cards, five per team. Each side uses equal widths. Existing champion asset selection, image source and cropping logic remain.
- A 320px black center panel contains series score pips, side labels, supplied team logos, team codes, current game and draft phase. No extra team-name footer, champion-name row or numeric countdown.
- Player names are normal single-line words rotated −90°. At 1080p: 24px Archivo, 10px visible inset; long names use ellipsis. Role icons are 32px with a 9px horizontal gap from the rotated name region. Both sides use the same anchors.

## Countdown

The existing LCU timing source remains. State now publishes the current action-window identity and its first observed duration. A new action resets the denominator; repeated corrections do not. Manual timer changes and demo steps also start a new window. Old snapshots without these optional fields remain readable.

The 8px countdown line uses `scaleX(progress)` around a fixed 50% center. Its ends move inward symmetrically. A monotonic browser clock interpolates between server ticks. Short time corrections settle over 160ms; delayed snapshots slow the remaining movement without growing the bar backwards. New windows refill outward from the displayed width over 200ms with quintic easing, then continue shrinking. The clock keeps running during refill; no extra time is added. Server ticks do not restart the animation. A reset while paused still refills, but pausing an active refill freezes it immediately. Waiting, completed draft and zero time hide it.

No fixed pick duration is guessed. A client connecting mid-action uses the first available time as its window duration. A fresh overlay connecting to a server already observing that action uses the server's captured duration.

## Tentative and locked selections

LCU action `completed` controls confirmation for both picks and bans. Lockfile contents only establish the connection. Tentative known champions (including exposed pick intent) keep a softer image and a subtle 1.8-second veil/border pulse. Player labels and role icons remain steady. Confirmed picks stop pulsing; confirmed bans use a stable grayscale portrait. Empty and skipped slots never pulse. Waiting, completed and hidden overlays stop the pulse; reduced-motion uses a static border. The timing is a local design choice, not a measured tournament animation.

Tournament spectator output shows both teams. There is no local-player or active-side visibility filter. Legacy ban arrays remain readable; optional parallel `banLocked` metadata carries explicit LCU confirmation. Manual bans default to confirmed, with optional `locked: false` for rehearsal/API previews. A null champion with explicit `locked: true` records a skipped ban; ordinary removal clears the lock. See [source research](../research/champ-select-lock-states.md).

Artwork and content crossfade over 180ms; assets decode before replacing the last ready picture. Confirmation fades the paused pulse veil out over 160ms. Forced timer closure uses a 160ms centered collapse; natural expiry retains its original deadline. Hidden drafts stop their animation work. Unified output keeps both screens mounted for handoff. Full decisions and exceptions: [transition audit](../audits/champ-select-transitions.md).

## Checks

- Unit checks: centered full/half/zero geometry; fractional elapsed time; pause/resume; new action; forward and delayed resynchronization.
- State-manager check: duration stays stable within one action and resets on the next action, even within the same draft phase.
- LCU checks: spectator pick/ban intent from both sides, changed ban candidate, lock-only updates, skipped bans and legacy-state compatibility.
- Browser checks: continuous inward movement within 120ms; fixed center; pause freeze; reset; zero disappearance; all ten rotated-name bounds; 24px/32px sizes; 9px role gap; long-name ellipsis; transparent pixels above and between bans; completed draft.
- Browser lock checks: tentative art and borders, steady labels, no repeating animation after lock, grayscale confirmed bans, reduced-motion and completed-draft behavior.
- Screenshots: `test-results/playwright/draft-lcs-full-1920.png`, `draft-lcs-band-1920.png` and `draft-hover-states.png`.
- Real League Client and OBS validation remains a manual check on the user's machine.
