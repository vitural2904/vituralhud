# VirtualHUD UI refresh

## Component map

| Product UI | React Bits base | Integration |
|---|---|---|
| Workspace and series tabs | RubberSegment | Adjusted. URL navigation stays native. |
| Draft phase, early objective, saved logo | GlideSelect | Adjusted. Keyboard and typeahead stay enabled. |
| Champion picker | GlideSelect pattern | Custom combobox. Images, search, clear, arrows, Enter, Escape. |
| Manual control | SquishSwitch | Adjusted colors and size. |
| Scores, timers, team and player metrics | ScrubField | Adjusted limits. Commit on drag end, Enter, or blur. Escape cancels. |
| Server, LCU, review, output | StatusMark | Adjusted labels and colors. |
| Network and upload work | LatticeLoader | Used only during real work. |
| Disabled actions and reset help | WarmTooltip | Used for reason and action help. |
| Save feedback | SwipeToast | Used after the server response. |
| Preview and logo media | RefineFrame | Loading effect runs only while loading. |
| Operator actions | HoldButton | Modified with instant mode and controlled status. Click, Enter, and Space run once. |
| Overlay result values | CountUp | Used for result values. Live clocks stay exact. |
| Tables and broadcast composition | Custom | Rebuilt for the workflow and OBS output. |

## Font setup

15 Lens Grotesk WOFF2 faces are available locally, converted from the user's supplied font folder. Thin, ExtraLight, Light, Book, Medium, SemiBold, Bold and their italics are available, plus Regular. ExtraBold is absent. Each face loads independently.

| Text role | Font choice |
|---|---|
| Dashboard body and introduction | Light 300; Light Italic for introduction |
| Editable fields, names, activity, error text | Book 400 |
| Buttons, segments, selects, champion results | Medium 500 |
| Labels, table sources, section headings | SemiBold 600 |
| Workspace title, key counts, draft clock | Bold 700 |
| Secondary hints | Book/Light Italic |
| Draft player names | Medium 500 |
| Broadcast team names and labels | SemiBold 600 |
| Post-match overview and support values | Medium 500 |
| Large post-match duration | Thin 100 |

These roles apply to `/control`, `/control/post-match`, `/preview/draft`, `/preview/post-match`, and both renderers behind `/overlay`. Numeric controls and clocks use tabular figures. No synthetic weights or italics.

The repository ignores Lens WOFF2 files. A clean clone uses bundled Be Vietnam Pro 400, 500, 600 and 700. Missing thin styles map to available fallback weights. The server lists served Lens faces; the client does not probe missing font URLs.
