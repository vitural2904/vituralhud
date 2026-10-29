# Nguồn icon và sự kiện ingame

Kiểm tra ngày 2026-10-29. Chưa xác minh bằng trận custom spectator trên máy này. Không suy ra một sự kiện không xảy ra chỉ vì API không trả về.

## Icon

- Trước thay đổi này repo có icon chung của rồng, Baron, Sứ Giả, nhà lính, Sâu Hư Không trong `public/objectives`. Trụ dùng icon Phosphor. Nguồn gốc có trong `public/objectives/README.md`.
- [CommunityDragon](https://raw.communitydragon.org/latest/game/assets/ux/announcements/) mirror ảnh announcement từ game: sáu ảnh rồng nguyên tố. [Ảnh Elder](https://raw.communitydragon.org/latest/game/assets/characters/sru_dragon_elder/hud/dragon_circle_elder.png) ở thư mục riêng. Chúng đã được lưu local trong `public/ingame-objectives`; xem README tại đó. Riot sở hữu các asset, CommunityDragon là nguồn cộng đồng.
- Có **sáu**, không phải năm, rồng nguyên tố: lửa, đất, nước, gió, Hextech và Chemtech; cộng Rồng Ngàn Tuổi. Riot giới thiệu [Hextech và Chemtech](https://intothearcane.leagueoflegends.com/en-us/), và [wiki](https://wiki.leagueoflegends.com/en-us/Dragon_pit) liệt kê cả bảy.
- [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon_items) cung cấp `cdn/{version}/data/vi_VN/item.json` và ảnh `cdn/{version}/img/item/{itemID}.png`. Kho champion hiện ghim 16.16.1; [danh sách phiên bản Riot](https://ddragon.leagueoflegends.com/api/versions.json) tại thời điểm nghiên cứu bắt đầu bằng 16.21.1. Phiên bản mới nhất không nhất thiết khớp trận của người dùng. Data Dragon cập nhật thủ công và có thể trễ patch; cần chọn theo patch thực tế và fallback có kiểm soát. Danh sách có thể chứa item của mode khác, không coi mọi mục trong JSON là món mua được ở Summoner's Rift.

## JSON của game

[Tài liệu Riot](https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api) mô tả API local 2999 và [mẫu event chính thức](https://static.developer.riotgames.com/docs/lol/liveclientdata_events.json). `allgamedata.events.Events[]` là mảng sự kiện; endpoint con `/liveclientdata/eventdata` trả `{ Events: [...] }`. Các trường chung gồm `EventID`, `EventTime` theo giây, `EventName`. Dùng ID để tránh phát lại khi poll; xử lý reset trận hoặc reconnect riêng. Không coi dữ liệu mẫu là bảo đảm đủ event spectator.

| EventName | Trường liên quan trong mẫu Riot | Nội dung |
| --- | --- | --- |
| `ChampionKill` | `KillerName`, `VictimName`, `Assisters` | Hạ gục tướng |
| `TurretKilled` | `TurretKilled`, `KillerName`, `Assisters` | Phá trụ |
| `InhibKilled` | `InhibKilled`, `KillerName`, `Assisters` | Phá nhà lính |
| `DragonKill` | `DragonType`, `KillerName`, `Stolen`, `Assisters` | Rồng; Riot có ví dụ `Earth` và `Elder` |
| `BaronKill`, `HeraldKill` | `KillerName`, `Stolen`, `Assisters` | Baron, Sứ Giả |
| `FirstBlood`, `FirstBrick`, `Multikill`, `Ace` | Tùy event | Thông báo bổ sung; tránh trùng thông báo kill cơ bản |

[Schema cộng đồng](https://github.com/AlsoSylv/Irelia/blob/master/schemas/game.json) liệt kê `DragonType`: `Fire` → Lửa, `Earth` → Đất, `Water` → Nước, `Air` → Gió, `Hextech`, `Chemtech`, `Elder`, `Unknown`; và `HordeKill` cho đàn Sâu. Đây là snapshot cộng đồng, không phải bảo đảm phiên bản hiện tại. Kiểm tra schema game đang chạy tại `https://127.0.0.1:2999/swagger/v3/openapi.json` và JSON spectator thực tế. `Stolen` trong mẫu Riot là chuỗi `"True"`/`"False"`.

Mỗi phần tử `allPlayers[].items[]` có `itemID`, `slot`, `count`, `displayName` theo [mẫu Riot](https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api). `slot` giữ vị trí 0–6; tra `itemID` trong Data Dragon và ghép ảnh bằng cùng ID. Snapshot chỉ cho trạng thái hiện tại; chênh lệch hai snapshot không đủ chứng minh là giao dịch mua: có bán, undo, tiêu hao hoặc nâng cấp.

## Giới hạn vận hành

[scoreboard-lol](https://github.com/drewfoos/scoreboard-lol#how-it-works) báo spectator API năm 2026 không phát neutral-monster kill events. [OpenForestUI](https://github.com/bluestand-jp/OpenForestUI#on-screen-ocr-exact-cs--gold) báo thiếu team gold, objective counts và CS chính xác, nên dùng OCR từ HUD gốc. Đây là kinh nghiệm dự án, cần xác minh trên patch thực tế. Nếu tắt toàn bộ HUD game, OCR từ các số đó không còn nguồn. Feed tùy biến chỉ thông báo event thực sự nhận được; không bảo đảm thay hoàn toàn HUD game.

Để kiểm chứng: vào custom spectator, lưu Swagger và mẫu JSON đã ẩn Riot ID, đối chiếu từng kill, trụ và từng loại mục tiêu với video; thử bắt đầu giữa trận, mất kết nối, vào trận mới và kết thúc trận. Kiểm tra độ trễ, thiếu event và trùng event trước khi dùng broadcast.
