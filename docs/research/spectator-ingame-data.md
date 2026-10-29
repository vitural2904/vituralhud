# Dữ liệu ingame cho spectator

Nghiên cứu ngày 2026-10-29. Chưa kiểm chứng trong trận trên máy này.

## Nguồn chính

- [Game Client API của Riot](https://developer.riotgames.com/docs/lol#game-client-api): game đang chạy cung cấp HTTPS local tại `127.0.0.1:2999`. Thử `GET /liveclientdata/allgamedata`; schema nằm tại `/swagger/v3/openapi.json`. Riot khuyên dùng endpoint con khi không cần toàn bộ dữ liệu. Chứng chỉ tự ký; có thể dùng root certificate của Riot để xác thực.
- `/liveclientdata/playerlist`, `/gamestats`, `/eventdata` là các tập con cần khảo sát. Tài liệu Riot mô tả playerlist gồm tướng, level, items, scores, team, trạng thái chết và thời gian hồi sinh. Khả năng thực tế ở spectator cần kiểm tra theo phiên bản game.
- Đây là API của tiến trình game, khác LCU của League Client dùng lockfile cho ban/pick. `activeplayer` chỉ dành cho người chơi hiện tại; [báo cáo spectator](https://github.com/RCVolus/league-prod-toolkit/issues/975) cho thấy endpoint active player có thể lỗi, dù danh sách người chơi vẫn có dữ liệu.

## Khoảng trống và nguồn cộng đồng

- [OpenForestUI](https://github.com/bluestand-jp/OpenForestUI#on-screen-ocr-exact-cs--gold) báo spectator API làm tròn CS theo bội số 10, không cung cấp team gold hoặc số objective monster. Dự án dùng OCR HUD để đọc các số này. OCR phụ thuộc độ phân giải, HUD, vùng hiển thị và không bị che. Đây là báo cáo của dự án, cần xác minh trên bản game đang dùng.
- [scoreboard-lol](https://github.com/drewfoos/scoreboard-lol#how-it-works) ước tính vàng đội từ CS, mạng, thu nhập và giá trị trang bị; giữ icon mục tiêu từ HUD gốc. Giá trị ước tính không phải số chính xác. Dự án báo event quái mục tiêu không còn đầy đủ trong spectator năm 2026.
- [Riot issue #216](https://github.com/RiotGames/developer-relations/issues/216) và [issue #416](https://github.com/RiotGames/developer-relations/issues/416) ghi nhận nhu cầu spectator API và hạn chế CS.
- [LiveEventsDocumentation](https://github.com/SkinSpotlights/LiveEventsDocumentation) mô tả API spectator cũ cùng `Config/game.cfg` và `LiveEvents.ini`, nhưng tác giả cảnh báo có vẻ bị tắt hoặc loại bỏ từ patch 14.1. Không dựa vào API này nếu chưa kiểm chứng. [Replay API](https://developer.riotgames.com/docs/lol#game-client-api_replay-api) chủ yếu điều khiển replay/camera; không có bằng chứng đây là nguồn đầy đủ stats.
- [Riot FAQ](https://developer.riotgames.com/docs/faqs) nói công cụ đọc bộ nhớ bên ngoài không còn hoạt động với Vanguard và không có allowlist. Không chọn đọc bộ nhớ làm nền tảng cho HUD.

## Đối chiếu máy này

- Có `D:\Game Files\Riot Games\League of Legends\Game\League of Legends.exe` và `Config\game.cfg`. Chưa thấy cấu hình chứng minh có feed đầy đủ dữ liệu.
- Không có tiến trình game hoặc cổng 2999 lúc kiểm tra. Chưa thể xác nhận dữ liệu thực tế. Không sửa file game.

## Bước kiểm chứng

1. Vào custom game ở chế độ spectator trên máy chạy ứng dụng. Đợi trận thực sự bắt đầu.
2. Trong PowerShell chạy `curl.exe -k https://127.0.0.1:2999/liveclientdata/allgamedata`. `-k` chỉ phục vụ thử local với chứng chỉ tự ký. Có thể xem schema tại `https://127.0.0.1:2999/swagger/v3/openapi.json`.
3. Đối chiếu lần lượt level, K/D/A, items, CS, vàng đội, trụ và mục tiêu với HUD gốc. Kiểm tra sau khi đổi chỉ số, chết, hạ mục tiêu và kết thúc trận. Ghi phiên bản game, độ trễ, trường thiếu và giá trị bị làm tròn. Ẩn Riot ID trước khi chia sẻ dữ liệu.
4. Xây adapter riêng cho Game Client, poll có timeout và tự kết nối lại; đưa trạng thái đã chuẩn hóa vào WebSocket sẵn có. Giữ LCU cho draft. Giá trị thiếu phải hiện là không có dữ liệu; giá trị OCR hoặc ước tính phải ghi rõ nguồn và độ mới.
