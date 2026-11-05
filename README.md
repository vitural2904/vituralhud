# vituralHUD (LOL)

Overlay local cho League of Legends và OBS.

Hai màn hình chính:

- Ban/pick. Đồng bộ LCU hoặc nhập tay.
- Post-match. Nhập Match-V5 hoặc nhập tay.

LCU chỉ đọc. App không sửa League Client.

## Tính năng

- Overlay ban/pick trong suốt 1920 x 1080. Post-match phủ cả khung khi live. Tắt output: nền trong suốt.
- Dashboard riêng cho ban/pick và post-match.
- Tự hiện và ẩn ban/pick khi operator trả quyền cho LCU.
- Post-match có tỉ số, thời gian, damage, objective và Match Leaders.
- Có bước review trước khi phát post-match.
- Trường thiếu hiện dấu `—`. Phải điền. Hoặc xác nhận số 0.
- Upload logo ngay trong dashboard. Không cần chép file vào source.
- Dữ liệu và logo upload chỉ lưu local trong `data`.

## Yêu cầu

- Windows 10 hoặc Windows 11.
- Node.js 22.19 trở lên, trong nhánh 22. Node đi kèm npm.
- Internet khi cài dependency lần đầu bằng `npm ci`.
- League of Legends nếu dùng dữ liệu LCU. Không cần để nhập tay.
- OBS Studio nếu dùng overlay trên livestream. Không cần để mở dashboard.
- Riot API key nếu tải trận qua Match-V5. Không cần để nhập tay.

## Chạy nhanh

Cài Node.js 22.19 trở lên trong nhánh 22. Mở PowerShell mới. Kiểm tra:

```powershell
node --version
npm --version
```

Tải repo bằng Git hoặc ZIP. Mở PowerShell trong thư mục có `package.json`. Cài dependency đúng theo lockfile:

```powershell
npm ci
```

Sau đó nhấp đúp `START.cmd`. Mỗi lần cập nhật repo hoặc lockfile, chạy lại `npm ci`.

Launcher kiểm tra dependency. Nếu thiếu hoặc sai phiên bản, launcher báo lệnh cần chạy. App không tự cài.
Launcher kiểm tra đúng app trên cổng 4174. Bản cũ phải đóng trước.
Khởi động mới luôn tắt sóng. Dữ liệu cũ vẫn được giữ.
`START.cmd` theo dõi tiến trình server. Server lỗi: tự khởi động lại, tối đa 3 lần trong 60 giây.
Mỗi lần phục hồi vẫn tắt sóng. Lý do thoát và lịch sử phục hồi nằm trong `.codex-local/server.log`.
Server dừng sạch sẽ không tự mở lại. Chạy `npm start` trực tiếp không có bộ theo dõi này.

Nhấp đúp `STOP.cmd` để dừng app đã mở bằng `START.cmd`. Hoặc chạy `npm stop`.
Lệnh dừng cả server và bộ tự phục hồi. Dữ liệu vẫn được giữ. App không tự mở lại.
Nếu dùng `DRAFT_DATA_DIR` riêng, đặt cùng giá trị khi chạy STOP.
App mở trực tiếp bằng `npm start`: dùng Ctrl+C tại terminal đó.

Dashboard mở tại:

```text
http://127.0.0.1:4174/control
```

## Chạy bằng PowerShell

```powershell
npm ci
npm run build
npm start
```

## Route

- `/control`: dashboard ban/pick.
- `/overlay`: output chung. Đổi theo màn hình đang phát.
- `/control/post-match`: dashboard post-match.
- `/overlay/post-match`: chỉ hiện khi post-match đang live.
- `/preview/draft`: preview ban/pick. Luôn hiện.
- `/preview/post-match`: preview post-match. Luôn hiện.
- `/overlay/ingame`: HUD trong trận. Tự ẩn khi không nhận được dữ liệu game.
- `/preview/ingame`: xem HUD với dữ liệu mẫu. Không dùng để phát trận thật.

## OBS

Tạo Browser Source.

Nếu OBS mở Browser Source khi ứng dụng chưa chạy, trang lỗi của OBS không có mã ứng dụng để tự kết nối lại. Hãy khởi chạy ứng dụng trước, hoặc bật tùy chọn làm mới Browser Source khi chuyển cảnh trong OBS rồi chuyển lại cảnh. Khi trang overlay đã tải thành công, nó tự kết nối lại nếu server khởi động lại.

Output chung. Dùng cho cả ban/pick và post-match:

```text
http://127.0.0.1:4174/overlay
```

Post-match:

```text
http://127.0.0.1:4174/overlay/post-match
```

Dùng Width `1920`. Height `1080`. Không thêm nền.

Server mất kết nối quá 5 giây: output tự ẩn. Preview vẫn hiện.

## HUD ingame

Thêm Browser Source 1920 × 1080 tại `http://127.0.0.1:4174/overlay/ingame`. Lớp này trong suốt. Đặt trên nguồn game trong OBS. HUD để trống khu vực minimap và gameplay.

Thanh trên chỉ hiển thị tên và logo hai đội ở hai bên. Bật Score Display của spectator để xem tỉ số, vàng, trụ và đồng hồ gốc ở giữa. Vị trí ô đội được căn theo ảnh spectator 1920 × 1080; cần kiểm tra với độ phân giải và tỉ lệ HUD thực tế.

Mở trận custom ở chế độ khán giả trên cùng máy. App đọc Game Client API cổng 2999. Dashboard ban/pick có mục tải nhiều logo tài trợ và đặt thời gian đổi logo.

Vàng đội, trụ và chênh lệch vàng chưa có nguồn xác thực: hiện `—`. CS có dấu `≈` vì game có thể làm tròn khi spectate. Không có bộ đếm mục tiêu hoặc đồng hồ quái khi chưa xác minh được dữ liệu. Thứ tự người chơi lấy từ API; các dòng đối diện chưa chắc cùng đường. Ảnh trang bị dùng Data Dragon và cần Internet. HUD chưa được kiểm chứng trong trận spectator thật.

Bảng dưới hiển thị phép bổ trợ từ dữ liệu spectator, với icon lưu trên máy. API trong bản ghi chưa có thời gian hồi phép hay trạng thái chiêu cuối; `R —` nghĩa là chưa có dữ liệu.

## Ban/pick

HUD gọn kiểu broadcast: tên tuyển thủ xoay dọc, role nhỏ cạnh tên, logo và mã đội nằm giữa.
Thanh mảnh phía trên co đều từ hai đầu vào tâm. Không hiện số đếm trên overlay.
Thanh chạy mượt giữa các nhịp LCU. Pause dừng ngay. Lượt mới làm đầy lại thanh.
Dashboard vẫn có số giây để operator điều khiển. Đặc tả và kiểm tra: `docs/design/champ-select-hud.md`.

Mở League Client trước. Chạy VituralHUD. Vào ChampSelect.

App tự đọc LCU. Bấm `TRẢ QUYỀN CHO LCU` để bật phát tự động.
Draft hoàn tất: giữ đội hình cuối 15 giây rồi tự ẩn. Poll lặp không kéo dài thời gian.
Có thể tắt tay ngay. Hủy draft hoặc về lobby sẽ ẩn ngay.
Feed chưa rõ trước khi draft hoàn tất sẽ tắt output tự động.
LCU không tự giành output operator đang giữ.
Bật `Manual` để sửa và phát ban/pick bằng tay.
`DEMO STEP` dùng dữ liệu mẫu. Chỉ dùng để thử.

App tự tìm thư mục game qua League Client đang chạy, `RiotClientInstalls.json` và metadata cài đặt Riot.
App chỉ đọc đường dẫn executable. Không đọc command line chứa token. Không quét toàn ổ đĩa.
Lockfile cũ hoặc của Riot Client khác bị bỏ qua. Token được đọc lại sau khi mất kết nối.
Nếu cần chỉ định đường dẫn tay:

```powershell
$env:LCU_LOCKFILE_PATH="D:\Riot Games\League of Legends\lockfile"
npm start
```

Không chia sẻ nội dung file `lockfile`.

## Post-match

Match-V5 cần Riot API key:

```powershell
$env:RIOT_API_KEY="RGAPI-..."
$env:RIOT_REGIONAL_ROUTE="sea"
npm start
```

Trong `/control/post-match`:

1. Nhập Match ID. Ví dụ `VN2_123456789`.
2. Bấm `LOAD MATCH-V5`.
3. Kiểm tra dữ liệu ở trạng thái review.
4. Sửa tay nếu cần.
5. Duyệt. Bấm `FADE IN`.

`LOAD FIXTURE` dùng để test local. Có nhãn dữ liệu mẫu.
`TẠO BÁO CÁO TRỐNG` mở editor tay. Không cần API key.
Điền tên, tướng, winner và thời lượng. Điền chỉ số còn thiếu.
Có thể bấm `XÁC NHẬN SỐ 0 CÒN THIẾU`. App hỏi lại trước khi ghi.
Team kills phải bằng tổng player kills. Spree không vượt kills.
Thời lượng phải lớn hơn 0. Trường chưa rõ sẽ chặn duyệt.
Sửa dữ liệu live: tắt sóng. Cần duyệt lại.
Tab không đổi giá trị: giữ nguyên. Escape hủy nhập. Enter lưu.
Lấy Match-V5 quá 10 giây: báo lỗi. Có nút `HỦY FETCH`.
Kết quả cũ sau reset hoặc báo cáo mới sẽ bị bỏ.
Match Leaders không cần Match Timeline.

## Logo đội

Chọn hoặc upload PNG, JPG, WebP ngay trong dashboard.

Ứng dụng không đặt giới hạn dung lượng hoặc số pixel khi upload logo đội và nhà tài trợ; ảnh lớn vẫn phụ thuộc bộ nhớ khả dụng. Chỉ nhận ảnh PNG, JPG hoặc WebP tĩnh giải mã được.
Ảnh được chuyển thành PNG tĩnh. File nằm trong `data/team-logos`.
Thư mục này không commit.

## Dev và test

Terminal 1:

```powershell
npm run dev:server
```

Terminal 2:

```powershell
npm run dev
```

Kiểm tra toàn bộ:

```powershell
npm run check
npm run test:coverage
npm audit --audit-level=moderate
```

Test trình duyệt:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD/.codex-local/ms-playwright"
npx playwright install chromium
npm run test:browser
```

Test tải. Dùng dữ liệu riêng. Không đụng `data` thật:

```powershell
npm run test:stress
npm run test:stress -- --soak-minutes 120
```

Test tải: 30 vòng. Mỗi vòng 100 lệnh đồng thời.
Test dài: 12 kết nối WebSocket. Poll API và cập nhật state liên tục.
Kết quả test nằm trong `test-results`. Git bỏ qua thư mục này.

## Asset tướng

Làm mới ảnh và catalog từ Data Dragon:

```powershell
npm run assets:champions
npm run assets:champions -- --force
```

Cache có version và SHA-256. Ảnh lỗi sẽ tải lại.
Tải đủ ảnh mới công bố catalog. Thất bại giữ catalog cũ.
`--force` làm mới cả loading art. Upstream loading art không có version trong URL.
Generation cũ được giữ. Browser cũ vẫn đọc được ảnh.

## Lưu và phục hồi

Snapshot schema 2. App tự chuyển snapshot cũ được hỗ trợ.
Lệnh được xếp hàng. Ghi file tạm, flush, rồi thay snapshot.
Lỗi lưu: thay đổi chưa áp dụng. Dashboard báo lỗi.
Giữ 10 snapshot dự phòng trong `data/backups`.
Snapshot lỗi được giữ thành `corrupt-*.json`. App thử bản dự phòng.
Không có bản tốt: dữ liệu trống. Có cảnh báo. Sóng tắt.
Event log xoay vòng ở 10 MiB. Giữ 5 file gồm file đang ghi.
Event log là lịch sử ngắn. Phục hồi dữ liệu dùng snapshot dự phòng.
Một thư mục dữ liệu chỉ có một tiến trình server.

## Font

Ban/pick và post-match dùng Unbounded cho số lớn, Archivo Expanded cho tên và nhãn.
Hai font có đủ chữ Việt. File WOFF2 và giấy phép OFL đi kèm repo. OBS không cần tải font từ Internet.
Dashboard giữ font hiện tại. Nguồn và kiểm tra glyph: `docs/research/overlay-fonts.md`.

Repo có Be Vietnam Pro 400, 500, 600 và 700. Dùng được tiếng Việt.
Lens Grotesk là font riêng trên máy người dùng. Không có trong clone sạch.
Không có Lens: app dùng font dự phòng. Không giả weight mỏng.

## Biến môi trường

- `LCU_DISABLED=1`: tắt LCU.
- `LCU_LOCKFILE_PATH`: đặt đường dẫn lockfile.
- `LCU_POLL_MS`: đổi chu kỳ đọc LCU.
- `DRAFT_DATA_DIR`: đổi thư mục dữ liệu local.
- `TEAM_LOGO_DIR`: đổi thư mục logo upload.
- `RIOT_API_KEY`: key cho Match-V5.
- `RIOT_REGIONAL_ROUTE`: regional route Match-V5. Mặc định tự suy ra.

## An toàn

- Chỉ cho loopback: `127.0.0.1`, `localhost`, `::1`. Không hỗ trợ LAN.
- API và WebSocket kiểm tra Host/Origin.
- Lệnh sửa và upload cần token local. Dashboard lấy token tự động.
- Credential LCU và Riot API key chỉ nằm ở server local.
- LCU adapter chỉ gửi lệnh `GET`.
- `data`, log, cache và build output không vào Git.
- Báo cáo cũ đã dọn khỏi repo. Kết quả test mới chỉ nằm trong thư mục được Git bỏ qua.

## License

Source code dùng MIT License.

Asset bên thứ ba có quyền riêng. Đọc `THIRD_PARTY_NOTICES.md`.

VituralHUD không thuộc Riot Games.
