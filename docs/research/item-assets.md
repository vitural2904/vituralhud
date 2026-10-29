# Icon trang bị

Nguồn là [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon_items). Trong `allPlayers[].items[]`, `itemID` là khóa tra trong `data/vi_VN/item.json` của phiên bản Data Dragon. Trường `image.full` cho tên file icon; `slot` là vị trí và `count` là số lượng. Danh sách item tĩnh chứa cả item ngoài Summoner's Rift, không nên coi mọi entry là đồ bán trong trận hiện tại.

Chạy `npm run assets:items` khi có mạng để tải catalog và icon vào repo. Mặc định dùng version Data Dragon mới nhất; đặt `DDRAGON_VERSION` để chọn bản cụ thể, ví dụ PowerShell `$env:DDRAGON_VERSION='16.16.1'; npm run assets:items`. Sau khi cập nhật cần build lại ứng dụng. Data Dragon có thể ra chậm hơn bản game hoặc khác patch theo khu vực; kiểm tra đúng bản trước khi broadcast.

HUD ưu tiên bộ ảnh local đã tải. Nếu thiếu hoặc lỗi, HUD thử CDN của cùng version; nếu vẫn lỗi thì hiện mã ID. Khi chưa tải catalog local, HUD dùng version champion hiện có trong repo và CDN. Kho local chưa được đóng gói sẵn; lệnh trên cần mạng ít nhất một lần. Bản cập nhật chỉ được xuất bản sau khi toàn bộ ảnh được kiểm tra; bản cũ vẫn dùng được nếu tải lỗi.
