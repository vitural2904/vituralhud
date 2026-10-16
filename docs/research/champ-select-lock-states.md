# Champion-select tentative and locked states

Research date: 2026-10-17. Read-only research. No live League client or tournament spectator feed was available. Findings distinguish shipped Riot client behavior from HUD design recommendations.

## Data source

The lockfile is connection metadata: process name, PID, port, password, protocol. Pick/ban state comes from authenticated local LCU session responses, not from changing lockfile contents. The existing adapter already reads `/lol-champ-select/v1/session`. Keep credentials server-side. [Client schema export retrieval instructions](https://github.com/nomi-san/lcu-api#-how-to-retrieve-from-league-client), [connector author's implementation](https://github.com/Pupix/lcu-connector/blob/master/lib/index.js)

Riot describes LCU as the local client front-end/back-end interface. It does not guarantee third-party support, full documentation, or change notification. Therefore these observations need defensive parsing and live validation on the user's client build. [Riot Developer Portal](https://developer.riotgames.com/docs/lol#league-client-api)

## What establishes a lock

Riot's shipped patch 16.20 champion-select JavaScript provides direct implementation evidence. CommunityDragon mirrors this original Riot asset; it is not a Riot-supported API specification. The bundle identifies its source tree as release 16.20. Its generic selection function sends a champion ID plus a `completed` boolean to the session action endpoint. That boolean defaults to false; the lock-button path sends true. Ban selection uses that same generic function. The client derives a picked status from the pick action's completion, and its banned status from completed ban actions. A positive champion ID alone does not establish a lock. [Riot 16.20 client bundle, mirrored by CommunityDragon](https://raw.communitydragon.org/16.20/plugins/rcp-fe-lol-champ-select/global/default/rcp-fe-lol-champ-select.js)

The exported 12.3 client schema independently lists action `championId` and `completed` as separate properties. It also lists participant `championPickIntent` separately from `championId`. This historical schema corroborates the distinction; it does not establish the complete current schema. [Original exported OpenAPI artifact](https://raw.githubusercontent.com/nomi-san/lcu-api/main/openapi.json)

| Received state | HUD interpretation |
| --- | --- |
| Known champion; matching action completed | Locked pick or ban. Stable image. |
| Known champion; matching action explicitly incomplete | Tentative pick or ban. Gentle pulse. |
| Known pick intent; no completed pick | Tentative intent. Gentle pulse is a HUD design choice. |
| Incomplete action; no known champion | Empty pending slot. Do not invent champion art. |
| Completed ban; champion ID zero | Completed skip/no-ban. Do not show champion art or pulse. |

These are display recommendations inferred from the source model. Lock status must remain independent of timer state, active side, and phase advancement.

## Intent versus active hover

The shipped client distinguishes planning/future intent from an active pick. Its intent predicate includes planning, or an unfinished pick outside the player's current picking/banning turn. Its hovered predicate uses whether the pick action is active. Thus pulsing every visible incomplete selection groups two tentative states: declared intent and current hover. That suits this HUD request, but should not be described as an exact copy of Riot's hover predicate. [Riot 16.20 client bundle](https://raw.communitydragon.org/16.20/plugins/rcp-fe-lol-champ-select/global/default/rcp-fe-lol-champ-select.js)

`isInProgress`, when supplied, describes turn activity rather than completion. It must not replace `completed`. Historical schema models include this property for legacy/team-builder action variants, while another champ-select action variant omits it. The shipped front end can derive active actions from action groups. Keep the field optional; do not require it for a known tentative champion to appear. [Exported OpenAPI models](https://raw.githubusercontent.com/nomi-san/lcu-api/main/openapi.json), [Riot 16.20 client bundle](https://raw.communitydragon.org/16.20/plugins/rcp-fe-lol-champ-select/global/default/rcp-fe-lol-champ-select.js)

Do not restrict pulse to one `activeSide`. Simultaneous bans and planning intents can involve multiple unfinished actions. Only completed actions contribute to confirmed pick/ban counts. [Riot 16.20 client action-group and simultaneous-ban logic](https://raw.communitydragon.org/16.20/plugins/rcp-fe-lol-champ-select/global/default/rcp-fe-lol-champ-select.js)

## Visibility limits

The user clarified the target: a tournament lobby viewed by an observer. The HUD must render both teams' tentative and locked picks and bans. Do not filter by local player, `myTeam`, active side, or whose turn it is. The implementation preserves every exposed champion from both teams; regression cases cover spectator picks and bans on both sides, even when only one action reports `isInProgress`.

The API only exposes what that local session receives. No primary current contract was found guaranteeing pre-lock champion visibility in every client mode. This is a live-feed validation limit, not a product rule to hide an observer's opposite team. Do not infer an absent champion from actor, turn order, the previous snapshot, or a timer. If the action has zero/unknown champion ID, leave its slot pending. A real tournament-observer session remains to be validated. [Riot API support scope](https://developer.riotgames.com/docs/lol#league-client-api)

## Broadcast direction

Riot's official LCS HUD design write-up prioritizes readability, quick recognition of game state, and a streamlined modern sports presentation. This supports a restrained effect: retain the same image crop and names, modulate only a subtle image veil/border, then settle on lock. [LCS: Summer Broadcast Updates — The HUD](https://lolesports.com/en-US/news/summer-broadcast-updates-the-hud)

This article describes the in-game broadcast HUD, not a champ-select pulse specification. An official LCS match reference was found, but the video could not be fetched for frame-by-frame inspection here. No verified claim is made about LCS/LEC/Worlds using an exact pulse duration or easing curve. [Official LCS TLAW vs C9 broadcast reference](https://www.youtube.com/watch?v=pTebdv1Oxeg)

Recommended local treatment: approximately 1.6–2 seconds per smooth breath, small brightness/veil variation, no disappearance, no moving card geometry. Stop the animation immediately on explicit completion. Honor reduced-motion with a static tentative treatment. The exact timing is our design decision, not a sourced tournament rule.

## Regression cases

Cover pick intent, active pick hover, changed hover champion, lock confirmation, ban hover, ban lock, skipped ban, simultaneous incomplete actions, finalization, missing `isInProgress`, unknown champions, and old saved state. Preserve existing legacy ban arrays; carry lock metadata alongside them. Confirm in a browser that incomplete cards animate and completed cards have no repeating animation.
