# CHANEY / Termina for the broadcast overlays

Checked: 2026-10-17 (Asia/Saigon). Scope: `/overlay` and post-match statistics. Dashboard typography stays unchanged.

**Follow-up decision:** the user chose two Vietnamese-capable open-font alternatives. Use **Unbounded + Archivo Expanded**. The original CHANEY/Termina investigation below explains the earlier licensing constraint; the new choice and verified assets are documented at the end.

## Finding

Neither font is an unrestricted, redistributable font. A noncommercial project still needs the appropriate rights. Do not put either font into this public repository or its downloadable package based only on a desktop license. In particular, a `local()` declaration is not proof of permission: it avoids transferring a file, but the relevant terms still govern how the font is used.

## CHANEY — Atipo

- The official family page advertises **Ultra Extended** as its free download. The full family has four styles. The actual browser UI currently presents a **pay with share** control; its download anchor has `href="#"`. No direct, publicly verifiable font-file URL was obtained. No social post was made. [Official CHANEY page](https://www.atipofoundry.com/fonts/chaney), [full-family purchase page](https://www.atipofoundry.com/fonts/chaney/pay-what-you-want).
- Atipo's desktop terms allow personal and commercial design at one location, up to five workstations, using OpenType files. They prohibit redistribution, modification, and conversion to webfont formats. The separate webfont license covers one website, unlimited pageviews, and supplies WOFF2/TTF. App, game, and broadcasting uses require contacting Atipo. **Interpretation:** the free desktop download alone does not establish permission to serve OTF through this application's `@font-face`, bundle it with releases, or use it as an OBS broadcast overlay. Obtain written coverage for that exact use, or a suitable license first. [Atipo license](https://www.atipofoundry.com/license).

Acquisition entry point: https://www.atipofoundry.com/fonts/chaney. The full-family page has separate desktop and web selections. There is no verified free web/app/broadcast grant in the inspected official pages.

## Termina — Fort Foundry

- The family has nine styles: Thin, Extra Light, Light, Regular, Medium, Demi, Bold, Heavy, Black. It is also listed in Adobe Fonts. [Fort family page](https://fortfoundry.com/fonts/termina), [Adobe family page](https://fonts.adobe.com/fonts/termina).
- Fort's retail desktop EULA, version 1.00 dated 2024-01-31, excludes websites, applications, and broadcast. Section 2(d) also excludes calling or linking fonts inside software; section 2(h) forbids redistribution. **Interpretation:** selecting an installed desktop font through `local()` is not a reliable licensing workaround for this overlay. [Desktop EULA](https://fortfoundry.com/static/licenses/Fort-Foundry_Desktop-License.pdf).
- Fort's web EULA permits WOFF/WOFF2 through CSS on controlled, owned-domain websites within the purchased pageview limit. It excludes applications and broadcast, and forbids redistribution. **Interpretation:** a normal retail web license is not clearly sufficient for a distributed localhost app rendered in OBS. [Web EULA](https://fortfoundry.com/static/licenses/Fort-Foundry_Web-License.pdf).
- Fort's app EULA permits embedding in covered software titles and future versions. It forbids including fonts with app source code or installing them into the user's OS. Websites and broadcast need separate coverage. **Interpretation:** app licensing alone still does not resolve the complete open-source-plus-broadcast use case. [App EULA](https://fortfoundry.com/static/licenses/Fort-Foundry_App-License.pdf).
- Fort lists separate Desktop, Web, App, and Film & Broadcast licenses. Ask the foundry about the combined deployment when purchasing. No general free noncommercial production entitlement was found. [License overview](https://fortfoundry.com/licenses).

### Adobe Fonts alternative

Adobe requires its own web-project embed for website font display. Copying activated font files or self-hosting them is forbidden. Its web FAQ explicitly says hosted webfonts can work in a mobile/desktop app's web view. It excludes app font embedding and custom typesetting services. The client's own subscription must own hosting; cancellation stops the hosted fonts. **Interpretation:** a user-owned Adobe web project is a possible Termina route for this browser overlay, subject to entitlement and the stated content restrictions. It needs an internet connection. Do not scrape a specimen font URL, copy a Creative Cloud cache, or replace the embed with `local()`. [Adobe web licensing FAQ](https://helpx.adobe.com/fonts/web/font-licensing/webfont-licensing.html).

Adobe explicitly supports using its embed code on local-development pages and `file://` pages. This establishes technical local support; it is not a separate grant to redistribute font files. [Adobe local development](https://helpx.adobe.com/fonts/web/web-design-and-development/develop-locally.html).

Adobe permits making film/video content, including broadcast and online video, with licensed fonts. It separately forbids packaging font files, embedding fonts in desktop/mobile apps, and server installation. [Adobe general licensing FAQ](https://helpx.adobe.com/fonts/web/font-licensing/font-licensing.html).

Fort also has trial fonts through its app. Trial names contain `Trial`; membership unlocks production rights. The app is currently Mac-only, requires an account, and does not expose font files for sharing. It is not a direct Windows/font-file download solution. [Fort app](https://fortfoundry.com/app).

## Local evidence

Read-only checks found no filenames matching `chaney` or `termina` in `C:\Windows\Fonts` or the current user's `AppData\Local\Microsoft\Windows\Fonts`. The installed-family collection also returned no matching family names. This does not inspect protected Creative Cloud caches or prove that the user has no license.

The project currently loads local Lens Grotesk faces using `src/font-loader.ts`. Its README requires licensed user-supplied files and keeps the binaries out of Git. That pattern can be extended to *appropriately licensed* webfont files, but ignoring binaries does not by itself grant the right to serve them.

## Design direction

Proposed roles once the correct assets/entitlements exist:

- **CHANEY Ultra Extended:** short display text only: timer, team abbreviations, score, win/loss. Use its actual face, with restrained tracking. Its very wide letters make long names unsuitable.
- **Termina Medium / Demi / Bold:** phase labels, team names, player/champion names, table headings, key statistics. Keep long names on one line with the existing truncation rules.
- **Be Vietnam Pro:** Vietnamese glyph fallback and readable dense text. Neither inspected official language list includes Vietnamese. Verify the exact acquired font's character coverage before claiming support. [CHANEY features](https://www.atipofoundry.com/fonts/chaney), [Termina supported languages/glyphs](https://fortfoundry.com/fonts/termina).

Keep typography scoped to the overlay/post-match roots. Do not change dashboard variables. Test long Vietnamese player/team names, five-digit statistics, 00:00 timers, narrow browser-source widths, offline rendering, and absent font files.

## Implementation boundary

Safe code can prepare font roles, fallback stacks, and optional licensed-file loading now. Real CHANEY/Termina rendering remains conditional on valid acquired assets or a user-owned Adobe project. A page displaying fallback text must not be reported as a completed visual verification of CHANEY/Termina.

No font purchase, account creation, personal-data submission, font installation, or font-binary repository change was performed during this research.

## Follow-up: selected open fonts

The user subsequently authorized open alternatives with Vietnamese support. **Unbounded** supplies the broad geometric display voice. **Archivo**, at its real Expanded width, supplies readable names and statistics. These are design substitutes, not metrically identical copies of CHANEY/Termina.

### Why these two

- Unbounded is a display family with weights 200–900. Google Fonts explicitly lists Vietnamese. Its broad, distinctive shapes suit timers, scores, short team codes, and large result headlines. Use 600/700/800 as needed. [Official metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/unbounded/METADATA.pb), [official description](https://raw.githubusercontent.com/google/fonts/main/ofl/unbounded/DESCRIPTION.en_us.html).
- Archivo provides weights 100–900 and a width axis from 62 to 125. Google Fonts explicitly lists Vietnamese. Width 125 is the Expanded endpoint; use 110–125 for headings, 100–112 for long player/team names and dense rows. Use weights 500/600/700. The foundry describes its variable range from ExtraCondensed to Expanded. [Official metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/METADATA.pb), [official description](https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/DESCRIPTION.en_us.html).
- Anybody was considered. It supports Vietnamese and width 50–150, but its more animated display character competes with Unbounded. Archivo makes a calmer secondary face. Syne was considered for its wide heavy weights, but its current Google Fonts metadata does **not** declare Vietnamese; do not select it on a coverage assumption. [Anybody metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/anybody/METADATA.pb), [Syne metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/syne/METADATA.pb).

### License and official downloads

Both packages carry SIL Open Font License 1.1. It permits use, embedding, modification, and redistribution with software, with the copyright notice and OFL preserved. Do not sell fonts on their own or relicense them under the application's license. No Reserved Font Name statement appears in these downloaded license headers. [Unbounded OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/unbounded/OFL.txt), [Archivo OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/OFL.txt).

Downloaded directly from the official Google Fonts repository on 2026-10-17:

| Family | Official source URL | Local original |
| --- | --- | --- |
| Unbounded | https://raw.githubusercontent.com/google/fonts/main/ofl/unbounded/Unbounded%5Bwght%5D.ttf | `public/fonts/unbounded/Unbounded-Variable.ttf` |
| Archivo | https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf | `public/fonts/archivo/Archivo-Variable.ttf` |

Each directory includes its original `OFL.txt`. The adjacent `.woff2` file was compressed locally from the complete official TTF using FontTools, with **no subsetting or outline changes**. Use WOFF2 in browser output; retain TTF as the reproducible upstream original. No global font installation occurred.

### Verified binary metadata

| Property | Unbounded | Archivo |
| --- | --- | --- |
| Typographic family | Unbounded (legacy family name) | Archivo (name ID 16) |
| Legacy family name (ID 1) | Unbounded | Archivo SemiBold |
| PostScript name | Unbounded-Regular | Archivo-SemiBold |
| Weight axis | 200–900; default 400 | 100–900; default 600 |
| Width axis | None | 62–125; default 100 |
| Unicode cmap entries | 1,138 | 653 |
| Full TTF bytes | 778,272 | 658,596 |
| Full WOFF2 bytes | 260,240 | 189,404 |

These values were read from the downloaded binaries, not inferred from the filename. In particular, Archivo's default weight is 600 despite Google's metadata file labeling the face 400. A CSS `@font-face` weight range is necessary; declare `100 900` for Archivo and `200 900` for Unbounded. Declare Archivo `font-stretch: 62% 125%`; choose the actual width with `font-stretch` or `font-variation-settings: "wdth" 125`. Do not claim a width axis for Unbounded.

### Vietnamese coverage check

FontTools verified **zero missing characters** across a 182-codepoint set containing ASCII letters, all precomposed characters U+1EA0–U+1EF9, the Vietnamese base forms Ă/Â/Đ/Ê/Ô/Ơ/Ư and lowercase equivalents, and the remaining acute/grave/tilde Latin vowels. Both fonts also contain combining grave, acute, tilde, hook above, dot below, circumflex, breve, and horn (U+0300/U+0301/U+0303/U+0309/U+0323/U+0302/U+0306/U+031B). The complete WOFF2 round-trip preserved each font's cmap exactly.

This establishes character coverage. Browser QA still needs to check mark positioning, long names, and clipping in the actual overlay. Use full fonts rather than a Latin-only CSS subset; keep Be Vietnam Pro as the fallback.

### Integrity

| File | SHA-256 |
| --- | --- |
| Unbounded-Variable.ttf | `323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f` |
| Unbounded-Variable.woff2 | `3134483dffe5608a596c19e66f2e0e3b1031b8d1381d155fe6f54d9108d5e77e` |
| Archivo-Variable.ttf | `0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053` |
| Archivo-Variable.woff2 | `c3ff4b3742dba581cebeedea58dd38ac67fb5a1c84b70046e82e7b46016b1805` |
