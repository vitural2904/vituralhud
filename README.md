# VirtualHUD LoL

Overlay local cho League of Legends và OBS.

Hai màn hình chính:

- Ban/pick. Đồng bộ LCU hoặc nhập tay.
- Post-match. Nhập Match-V5 hoặc nhập tay.

LCU chỉ đọc. App không sửa League Client.

## Tính năng

- Overlay trong suốt 1920 x 1080.
- Dashboard riêng cho ban/pick và post-match.
- Tự hiện và ẩn ban/pick theo trạng thái Client.
- Post-match có tỉ số, thời gian, damage, objective và Match Leaders.
- Có bước review trước khi phát post-match.
- Thiếu dữ liệu vẫn giữ scorecard `0-0`. Operator có thể sửa tay.
- Upload logo ngay trong dashboard. Không cần chép file vào source.
- Dữ liệu và logo upload chỉ lưu local trong `data`.

## Yêu cầu

- Windows 10 hoặc Windows 11.
- Node.js 22 LTS.
- League of Legends nếu dùng LCU.
- OBS Studio nếu dùng cho livestream.

## Chạy nhanh

Tải repo. Giải nén. Nhấp đúp `START.cmd`.

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
- `/overlay`: overlay ban/pick.
- `/control/post-match`: dashboard post-match.
- `/overlay/post-match`: overlay post-match.

## OBS

Tạo Browser Source.

Ban/pick:

```text
http://127.0.0.1:4174/overlay
```

Post-match:

```text
http://127.0.0.1:4174/overlay/post-match
```

Dùng Width `1920`. Height `1080`. Không thêm nền.

## Ban/pick

Mở League Client trước. Chạy VirtualHUD. Vào ChampSelect.

App tự đọc LCU. Operator vẫn có thể bật Manual override và sửa tay.

Client cài ở chỗ lạ:

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
2. Bấm `LẤY MATCH-V5`.
3. Kiểm tra dữ liệu ở trạng thái review.
4. Sửa tay nếu cần.
5. Duyệt. Bấm `FADE IN`.

`NẠP FIXTURE` dùng để test local. Match Leaders không cần Match Timeline.

## Logo đội

Chọn hoặc upload PNG, JPG, WebP ngay trong dashboard.

Giới hạn mỗi file là 5 MB. File upload nằm trong `data/team-logos`. Thư mục này không commit.

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
```

## Asset tướng

Làm mới ảnh và catalog từ Data Dragon:

```powershell
npm run assets:champions
```

## Biến môi trường

- `LCU_DISABLED=1`: tắt LCU.
- `LCU_LOCKFILE_PATH`: đặt đường dẫn lockfile.
- `LCU_POLL_MS`: đổi chu kỳ đọc LCU.
- `DRAFT_DATA_DIR`: đổi thư mục dữ liệu local.
- `TEAM_LOGO_DIR`: đổi thư mục logo upload.
- `RIOT_API_KEY`: key cho Match-V5.
- `RIOT_REGIONAL_ROUTE`: regional route Match-V5. Mặc định tự suy ra.

## An toàn

- API chỉ nghe tại `127.0.0.1` theo mặc định.
- Credential LCU và Riot API key chỉ nằm ở server local.
- LCU adapter chỉ gửi lệnh `GET`.
- `data`, log, cache, build output và audit image không vào Git.

## License

Source code dùng MIT License.

Asset bên thứ ba có quyền riêng. Đọc `THIRD_PARTY_NOTICES.md`.

VirtualHUD không thuộc Riot Games.
