# VirtualHUD LoL

Overlay ban/pick cho League of Legends.

Dùng với OBS.

Chạy trên máy có League Client.

LCU chỉ đọc.

Không sửa Client.

## Có gì

- Overlay nền trong suốt.
- Dashboard chỉnh tay.
- Đồng bộ ban/pick từ LCU.
- Hỗ trợ góc nhìn tuyển thủ.
- Hỗ trợ góc nhìn khán giả.
- Tự hiện khi vào `ChampSelect`.
- Tự ẩn khi rời `ChampSelect`.
- Có nút `FADE IN` và `FADE OUT` trong Manual mode.
- Có đủ icon và ảnh dọc của tướng.
- Có font tiếng Việt.

## Cần cài

Máy Windows 10 hoặc Windows 11.

Cài League of Legends.

Cài [Node.js 22 LTS](https://nodejs.org/).

Không cần Node mới nhất.

Muốn livestream thì cài OBS Studio.

## Chạy nhanh

Tải repo.

Giải nén.

Nhấp đúp `START.cmd`.

Đợi.

Dashboard tự mở.

Xong.

## Chạy bằng terminal

Mở PowerShell trong thư mục repo.

Chạy:

```powershell
npm ci
npm run build
npm start
```

Mở dashboard:

```text
http://127.0.0.1:4174/control
```

Mở overlay:

```text
http://127.0.0.1:4174/overlay
```

## Thêm vào OBS

Mở OBS.

Thêm `Browser Source`.

URL:

```text
http://127.0.0.1:4174/overlay
```

Width: `1920`.

Height: `1080`.

Không thêm nền.

Giữ Browser Source luôn bật.

VirtualHUD tự fade.

## Dùng LCU

Mở League Client trước.

Chạy VirtualHUD.

Vào màn hình cấm/chọn.

Overlay tự hiện.

Rời màn hình cấm/chọn.

Overlay tự ẩn.

## Client cài ở chỗ lạ

Tìm file `lockfile` trong thư mục League of Legends.

Mở PowerShell.

Chạy:

```powershell
$env:LCU_LOCKFILE_PATH="D:\Riot Games\League of Legends\lockfile"
npm start
```

Đổi đường dẫn cho đúng máy.

Không chia sẻ nội dung file `lockfile`.

## Chỉnh tay

Mở dashboard.

Bật `Manual override`.

Sửa đội.

Sửa tướng.

Sửa đồng hồ.

Bấm `FADE IN`.

Muốn ẩn thì bấm `FADE OUT`.

Tắt `Manual override` để trả quyền cho LCU.

## Chạy dev

Terminal 1:

```powershell
npm run dev:server
```

Terminal 2:

```powershell
npm run dev
```

Mở:

```text
http://127.0.0.1:4173/control
```

## Test

Chạy:

```powershell
npm run check
```

Thấy lỗi thì dừng.

Không thấy lỗi là đạt.

## Cập nhật ảnh tướng

Cần Internet.

Chạy:

```powershell
npm run assets:champions
```

## Dừng app

Tìm cửa sổ `VirtualHUD Server`.

Nhấn `Ctrl + C`.

Xong.

## Dữ liệu local

App tạo thư mục `data`.

Thư mục này không lên GitHub.

## An toàn

LCU adapter chỉ gửi lệnh `GET`.

Mật khẩu LCU chỉ nằm trong tiến trình local.

API chỉ nghe tại `127.0.0.1`.

## License

Code dùng MIT License.

Asset bên thứ ba có license riêng.

Đọc `THIRD_PARTY_NOTICES.md`.

VirtualHUD không thuộc Riot Games.

