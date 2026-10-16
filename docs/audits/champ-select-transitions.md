# Audit chuyển trạng thái HUD ban/pick

Ngày: 2026-10-17. Phạm vi: overlay ban/pick, dữ liệu LCU, thao tác thủ công, preview và đầu ra OBS chung.

Giữ nguyên bố cục LCS đã chọn. Chuyển động dùng opacity, màu và tiến trình thanh thời gian. Không phóng to hoặc đẩy khung tuyển thủ.

| Nghiệp vụ | Trước audit | Cách xử lý |
| --- | --- | --- |
| Mở overlay lần đầu / lên sóng | Mount đầu không fade | Fade 200ms. |
| Ẩn thủ công / hết giữ đội hình | Fade 200ms đã có | Giữ fade. Giữ frame thanh thời gian trong lúc thoát. |
| Chuyển draft sang post-match tại `/overlay` | Draft unmount ngay | Giữ hai màn trong cùng khung cố định. Draft fade ra khi post-match hiện. |
| Ô trống → chọn tạm | Thay `src` ngay | Decode ảnh, rồi fade chéo 180ms. |
| Đổi tướng đang rê | Ảnh đổi tức thì; có thể trống khi tải | Giữ ảnh đã tải. Chỉ yêu cầu mới nhất được thay ảnh. Fade chéo khi sẵn sàng. |
| Chọn tạm / intent cả hai đội | Pulse 1,8 giây đã có | Giữ nhịp. Không reset bởi tick, đổi tên hay đổi ảnh. |
| Chọn tạm → khóa pick | Pulse bị xóa ngay | Đóng băng nhịp, fade lớp viền 160ms. Ảnh về độ sáng đầy trong 180ms. |
| Chọn tạm → khóa ban | Filter xám đổi ngay | Fade viền 160ms. Filter chuyển xám trong 180ms. |
| Khóa → mở lại / undo | Đổi trực tiếp | Fade ảnh/viền về trạng thái tạm. |
| Ban bị bỏ lượt | Trông giống ô chưa dùng | Dấu gạch nhỏ, fade chéo 180ms. Không pulse. `completed=true`, ID 0 vẫn là bỏ lượt. |
| Xóa pick/ban, reset, undo/redo | Nội dung nhảy | Dùng cùng fade chéo, giữ khung cố định. |
| Manual → trả quyền LCU / phiên mới | Thay cả snapshot ngay | Nhận dữ liệu ngay; nội dung có đổi mới fade. Không chạy lại hiệu ứng chỉ vì đổi nguồn hoặc revision. |
| Hoán đổi tướng giữa hai tuyển thủ | Hai ảnh nhảy | Hai ô fade chéo riêng. Không đổi slot/role hay nguồn ảnh. |
| Đổi lượt / đổi vòng / hoàn tất | Mũi tên và chữ nhảy | Fade chéo 180ms cho mũi tên, nhãn vòng, dấu hoàn tất. |
| Tên tuyển thủ, mã đội, game label | Chữ nhảy | Fade chéo 180ms. Giữ cỡ chữ, xoay tên và ellipsis. |
| Logo / monogram | Đổi tức thì | Decode logo và fade chéo 180ms; lỗi dùng monogram. |
| Tỉ số / best-of | Pip đổi tức thì | Màu pip chuyển 180ms. Số pip đổi bằng fade chéo. |
| Đếm giờ bình thường | Nội suy liên tục đã có | Giữ hai đầu co đều quanh tâm. Không animation lại theo mỗi tick. |
| Reset giờ / lượt mới | Refill 200ms đã có | Giữ quintic easing và đồng hồ thật. Không thêm thời gian. |
| Pause / resume | Dừng vị trí ngay đã có | Giữ dừng ngay. Opacity thanh dịu trong 160ms khi pause. |
| Hiệu chỉnh giờ | Nội suy tuyến tính 160ms | Đổi sang easing quintic để mềm ở đầu/cuối. Snapshot trễ không đẩy thanh ngược ra. |
| Ép giờ về 0 / phase kết thúc | Thanh biến mất ngay | Co về 0 trong 160ms. Lệnh 0 lặp lại không kéo dài hiệu ứng. Hết giờ tự nhiên vẫn đúng deadline. |
| Hoàn tất draft thật | Giữ 15 giây đã có | Giữ nghiệp vụ. Dừng pulse, đổi dấu hoàn tất, đóng thanh nhẹ; sau đó fade cả HUD. |
| Dữ liệu quá hạn / server ngừng | Ẩn ngay đã có | Giữ ẩn ngay. Đây là ngoại lệ để không phát dữ liệu cũ. Kết nối lại fade vào dữ liệu mới. |
| Reduced motion | Chỉ pulse có fallback | Áp dụng cả fade, filter, màu, refill và collapse. Đồng hồ chức năng vẫn theo thời gian thật. |

## Quy tắc nhất quán

- LCU và trạng thái server cập nhật ngay. Hiệu ứng chỉ trình bày. Không đợi animation mới nhận lượt tiếp theo.
- Giá trị nội dung là key chuyển cảnh. Không dùng revision, timer tick hoặc thời điểm nhận gói làm key.
- Lớp cũ trong fade có `aria-hidden`; lớp mới giữ nội dung hiện tại. Tên và role không nhấp nháy theo ảnh.
- Khi ảnh lỗi, hiện fallback. Không giữ ảnh sai vô hạn, không hiện biểu tượng ảnh vỡ. Yêu cầu ảnh cũ bị bỏ qua sau đổi tướng, xóa hoặc unmount.
- Overlay ẩn dừng RAF đếm giờ và pause nhịp viền. Khi hiện lại, lấy thời gian hiện tại.
- Metadata thời gian và khóa ban phải đúng kiểu ở phía nhận. Gói lỗi bị bỏ qua; giữ revision hợp lệ cuối cùng.
- Nguồn khóa vẫn là action `completed`. Lockfile chỉ cấp thông tin kết nối. Không lọc đội đối phương trong góc nhìn người xem đấu giải.

## Kiểm tra

- `src/domain/countdown.test.ts`: deadline, pause/resume, refill, đóng thanh, không kéo dài khi lặp trạng thái 0.
- `server/lcu/normalize.test.ts`, `adapter.test.ts`: chọn tạm/khóa, ban bỏ lượt và dữ liệu hai đội từ spectator.
- `tests/browser/draft-hud.spec.ts`: bố cục, tên Việt, tính đối xứng, pulse, trạng thái khóa và giảm chuyển động.
- `tests/browser/draft-transitions.spec.ts`: ghi frame thực để kiểm tra fade chéo, không nhảy khung, ảnh tải chậm/lỗi, xóa/undo/redo/reset, nhãn/đội/tỉ số, chuyển màn và tick lặp.
- `tests/browser/regression.spec.ts`: đầu ra OBS, quá hạn dữ liệu, server restart, font và dashboard.

Chưa có phiên League/OBS đấu giải thật trong môi trường kiểm thử. Cần kiểm tra cuối trên nguồn thật trước buổi phát sóng.
