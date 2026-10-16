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

Hai lượt review tách biệt trên candidate `73c82cb` và các bản sửa tiếp theo, so với main.

### Standards

- **P2 — Lockfile cũ trả 404 bị nhận nhầm là LCU.** Quy tắc README: bỏ lockfile cũ. Adapter trước đó coi mọi 404 ở bước probe là hợp lệ. Nếu cổng cũ bị app khác dùng lại, nó có thể kẹt ở trạng thái connected/idle. Đã đổi probe sang từ chối lỗi HTTP. Regression dùng hai HTTP server loopback thật: server 404 bị bỏ qua; client hợp lệ được tìm tiếp.
- Review lại: không còn vi phạm cụ thể hoặc blocker smell được báo.

### Spec

- **P2 — Thanh giờ reset giữa lượt chung.** Yêu cầu: giữ duration của cùng action window. Key trước đó đổi theo actor khi một người khóa. Đã đổi sang action-group identity; phase cũng dựa vào những nhóm trước đó. Regression kiểm tra duration giữ 30s khi còn 15s và cả nhóm ban vượt sáu người đã khóa.
- **P2 — Trao đổi tướng cuối draft bị ghi đè.** Yêu cầu: tiếp tục nhận đội hình trong finalization. Action pick cũ đè lên champion ownership mới của participant. Đã dùng ownership hợp lệ trong finalization; action completion vẫn quyết định khóa. Trước finalization, action vẫn là nguồn chọn chính.
- **P2 — Mất giữ 15s khi game custom dùng lại ID 0.** Yêu cầu: draft mới chưa hoàn tất phải mở lại cơ chế giữ đội hình. Reconnect ở pick-2 trước đó không xóa marker đã hoàn tất. Đã cho mọi draft chưa hoàn tất re-arm marker. Regression kiểm tra trọn hai phiên, reconnect muộn và deadline 15s.
- Review lại: không còn thiếu sót Spec cụ thể được báo.

Tổng: Standards 1 phát hiện P2, đã sửa. Spec 3 phát hiện P2, đã sửa. Không còn phát hiện chặn phát hành từ hai lượt review.

## Xác minh

| Kiểm tra | Kết quả |
| --- | --- |
| Cài sạch bằng `npm ci` | Qua. Node 22.19.0 / npm 10.9.3. |
| TypeScript + unit/integration + build | Qua. 116 test / 18 file. |
| Security audit, mức moderate | Qua. 0 lỗ hổng. |
| Coverage V8 | Qua. Lines 90,96%; statements 83,74%; branches 75,68%; functions 86,02%. Phạm vi theo vitest.config.ts; UI React được kiểm tra riêng bằng browser. |
| Browser | Qua đủ 30 ca, gồm dashboard, OBS, freshness, crash recovery, font và chuyển cảnh. |
| Stress / soak | Qua 3.000 lệnh theo 30 đợt; thêm một phút với 12 WebSocket client. Tổng 3.171 lệnh, 720 heartbeat, không lỗi. Revision/RAM/disk khớp; backup nằm trong giới hạn. |
| File phát hành | Không đưa .env, dữ liệu local, log, dependency hay font Lens riêng vào Git. OFL đi kèm hai font mới. |

GitHub CI trên đúng commit main phải thành công trước khi công bố release. Link run cuối được ghi trong phần release trên GitHub.

## Giới hạn

Chưa có kiểm tra League Client và OBS đấu giải thật. Không khẳng định đã tái hiện lỗi đóng app ban đầu trên máy người dùng; bản này thêm chẩn đoán và crash recovery có giới hạn. Các test spectator dùng payload mô phỏng, không chứng minh mọi phiên bản client có cùng schema.
