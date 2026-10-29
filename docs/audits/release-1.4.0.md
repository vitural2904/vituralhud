# Audit chuẩn bị 1.4.0

Ngày: 2026-10-30. Phạm vi: bản chuẩn bị phát hành 1.4.0.

## Kiểm tra và sửa

- Logo đội trong HUD dùng chung trạng thái `match.teams` với ban/pick. Kiểm thử trình duyệt đổi logo khi cả hai overlay đang mở.
- Tăng kích thước vùng logo. Giữ vùng giữa trong suốt cho HUD game.
- Công cụ replay trước đây chỉ thay endpoint HTTP, trong khi HUD đã chuyển sang WebSocket. Đã thêm replay `/ws/ingame`; thử kết nối nhận hai frame và 10 người chơi.
- Audit npm phát hiện lỗi bảo mật. Đã nâng Fastify, fast-uri, Vite và Vitest; thư viện WebSocket trực tiếp dùng bản đã vá. `npm audit --audit-level=moderate`: không còn cảnh báo.
- `npm ci` qua trước khi thêm dependency WebSocket. Sau khi thêm, `npm ci --dry-run` qua. TypeScript, 128 unit/integration và build qua sau thay đổi cuối; 41 test trình duyệt qua, sau đó chạy lại 2 test WebSocket và logo đều qua.
- Stress 3.000 lệnh: qua; không có client WebSocket trong phép đo này.
- Các test LCU, lockfile, chuẩn hóa champ select, lưu trạng thái và khởi động thuộc bộ unit/integration. Chúng dùng fixture hoặc server mô phỏng.

## Chưa xác minh

- Đã kiểm tra nhận Lobby và ChampSelect trên client thật, đúng phía xanh và giữ tướng địch ẩn. Chưa kiểm tra chuyển chọn/khóa tướng đầy đủ.
- Replay thật 5 phút: 1.477 mẫu, 19 sự kiện phù hợp killfeed xuất hiện đúng thứ tự (14 hạ gục, 5 phá trụ), không ghi nhận mất kết nối. Không nhận được sự kiện quái lớn; chưa kiểm chứng được chúng.
- Chưa xác nhận hình ra OBS, độ trễ màn hình, độ mượt khung hình hoặc reconnect client thật trong trận.
- Cua Kỳ Cục chưa được xử lý. Bản ghi hiện có không chứa sự kiện cua. Các sự kiện quái không chắc được spectator API phát ra.
- Không thể chứng minh mọi lỗi vận hành đã được loại bỏ. Phải chạy CI trên commit cuối và thử thực tế trước khi niêm phong hoặc công bố bản phát hành.
