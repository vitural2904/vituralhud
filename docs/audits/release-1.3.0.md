# Audit release 1.3.0

Ngày: 2026-10-17. Repository: vitural2904/vituralhud. Mốc: main `585ea27e496ca7298587b64ddbcbbf8255c82c20`.

## Phạm vi

- API điều khiển: Host, Origin, token, schema, upload logo, WebSocket và đóng kết nối.
- Dữ liệu: revision, undo/redo, lưu nguyên tử, phục hồi snapshot, giới hạn backup/log, lỗi lưu và tắt sóng khi restart.
- LCU: tìm lockfile, giới hạn đường dẫn, giữ kín credential, timeout/abort, map đội, pick/ban/intent/khóa, timer và giữ đội hình cuối.
- Post-match: Match-V5, timeout/cancel, missing fields, nhập tay, override, review/approve/live và chặn request cũ.
- Giao diện: dashboard, overlay, OBS 1920×1080, chữ Việt, reduced motion, ảnh chậm/lỗi và chuyển trạng thái.
- Vận hành: START/STOP, crash recovery, package/lockfile, giấy phép, README, version, CI và release.

## Phát hiện đã sửa trước phát hành

- CI trên main dừng ở npm security audit: dependency đã được cập nhật bằng lockfile, không dùng audit force.
- Health-check ghi cứng 1.2.0: chuyển sang package version; thêm regression qua API thật để launcher nhận đúng bản mới.
- Repository URLs cũ trong package metadata: sửa sang vitural2904/vituralhud.
- Quy tắc ignore `design/` che cả đặc tả `docs/design/`: giới hạn ignore vào thư mục gốc `/design/`.
- UI_REFRESH.md mô tả font overlay cũ: cập nhật phạm vi dashboard và trỏ đến đặc tả mới.
- Các lỗi nghiệp vụ và chuyển cảnh đã xử lý trong phiên phát triển: xem `champ-select-transitions.md` và các ghi chép `docs/research/`.

## Review độc lập

Đang chờ hai lượt review Standards và Spec trên bản candidate, so với main.

## Xác minh

Đang chạy lại cài sạch, TypeScript, unit/integration, build, security audit, coverage, browser và stress/soak trước push. Kết quả cuối sẽ được ghi sau khi hoàn tất.

## Giới hạn

Chưa có kiểm tra League Client và OBS đấu giải thật. Không khẳng định đã tái hiện lỗi đóng app ban đầu trên máy người dùng; bản này thêm chẩn đoán và crash recovery có giới hạn. Các test spectator dùng payload mô phỏng, không chứng minh mọi phiên bản client có cùng schema.
