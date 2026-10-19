# API và phạm vi backend

API Express/TypeScript hiện có trong `server/src/index.ts`, nhưng giao diện Angular hiện đang ở chế độ minh họa cục bộ và không gọi API. Đăng nhập UI dùng tài khoản demo; catalog, ảnh và tọa độ lấy từ fixture; thay đổi phòng lưu trong trình duyệt. API không được seed dữ liệu phòng/tòa nhà/ảnh. Để chuyển sang tích hợp thật, cần nối lại các service Angular tới API và cấu hình `.env`/MongoDB trước.

## Các endpoint hiện có trong backend (chưa được UI gọi)

| Endpoint | Quyền | Mục đích |
|---|---|---|
| `POST /api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `GET /api/auth/me` | Public / phiên | Phiên cookie HttpOnly; đăng ký chỉ CUSTOMER |
| `GET /api/properties`, `GET /api/rooms`, `GET /api/rooms/:id` | Public | Chỉ property active, phòng PUBLISHED và AVAILABLE |
| `GET /api/admin/properties`, `POST /api/admin/properties` | ADMIN | Tra cứu/tạo tòa nhà |
| `GET /api/admin/rooms`, `GET /api/admin/rooms/:id`, `GET /api/admin/rooms/check-code` | ADMIN | Danh sách có tìm kiếm/lọc/phân trang/thống kê; chi tiết; kiểm tra trùng |
| `POST /api/admin/rooms`, `PATCH /api/admin/rooms/:id` | ADMIN | Tạo draft/cập nhật phòng |
| `POST /api/admin/rooms/:id/publish`, `/hide`, `/republish` | ADMIN | Xuất bản/ẩn/đăng lại theo điều kiện |
| `GET /api/admin/rooms/export.csv` | ADMIN | Xuất CSV theo bộ lọc, an toàn công thức CSV |
| `GET/POST /api/admin/rooms/:id/images`, `PUT .../images/order`, `DELETE .../images/:imageId` | ADMIN | Upload/đọc/sắp xếp/xóa ảnh phòng |
| `DELETE /api/admin/rooms/:id` | ADMIN | Xóa khi chưa có tham chiếu lịch sử; trả 409 nếu có |

| Service | Endpoint đề xuất | Ràng buộc chính |
|---|---|---|
| RoomService | `GET /rooms`, `GET /rooms/:id` | Bộ lọc, phân trang, loại phòng ẩn khỏi public |
| FavoriteService | `GET /me/favorites`, `PUT/DELETE /me/favorites/:roomId` | Chủ sở hữu, duy nhất customerId + roomId |
| ViewingService | `GET/POST /me/viewings`, `PATCH /me/viewings/:id` | Một lịch nhiều phòng, thời gian tương lai, chống trùng và kiểm tra phòng |
| BookingService | `POST /bookings`, `GET /me/bookings/:id` | Pending trước xác nhận, kiểm tra phòng trống nguyên tử |
| Payment | `POST /payments`, `POST /payments/webhook` | Chữ ký webhook, số tiền/phương thức, idempotency; chỉ xác nhận khi thực nhận |
| Hết hạn giữ chỗ | Tác vụ server theo `expiresAt` | 48 giờ từ confirmed; khóa/giải phóng bằng transaction; xử lý booking chuyển cọc |
| DepositService | `POST /deposits`, `GET /deposits/:id`, `POST /deposits/:id/confirm` | EMPLOYEE/ADMIN; credit duy nhất; tổng cọc − credit; xác nhận tiền mặt có audit |
| DealService | `GET /deals`, `POST /deals/:id/handover`, `/deals/:id/forfeit` | Cọc đã xác nhận; lưu lý do/actor; phí môi giới riêng; không mở lại phòng ẩn |
| Receipt | `GET /receipts/:id`, `/receipts/:id/pdf` | Payment confirmed, quyền sở hữu, đánh số và ký chứng từ |
| ShiftService | `GET /shift-periods`, `GET /shifts`, `POST /employee-shifts` | Đăng ký trước nhận trước, không duyệt; transaction capacity/chống trùng |
| AttendanceService | `POST /employee-shifts/:id/check-in`, `/check-out` | Nhân viên sở hữu, thời gian server, ảnh gắn employeeShiftId, object storage |
| TaskService | `GET /employee-shifts/:id/tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/handover` | Trạng thái nhóm/cá nhân, quyền từng người, lịch sử bàn giao |
| PayrollService | `GET /me/payroll?period=`, `GET /admin/payroll` | Phí môi giới, phân bổ, hoa hồng, thưởng/phạt bằng chính sách có phiên bản |
| AdminRoomService | `POST/PATCH/DELETE /admin/rooms`, `POST /admin/rooms/:id/publish|hide|republish` | Đã triển khai; ADMIN; unique code và propertyId + number; phòng có lịch sử chỉ ẩn |
| Ảnh phòng | `/admin/rooms/:id/images` và `/order` | Đã triển khai; kiểm tra signature MIME, kích thước, quyền; lưu file local trong `UPLOAD_DIR`, metadata/thứ tự/cover ở MongoDB |
| Nhân sự | `GET /admin/staff`, `GET /admin/staff/:id` | ADMIN, phạm vi dữ liệu phù hợp |
| Bản đồ | Geocoding/distance qua nhà cung cấp được chọn | Vị trí xác minh, quota/cache, không suy diễn tọa độ từ screenshot |

Business status (`AVAILABLE`, `HELD`, `RENTED`, `MAINTENANCE`) độc lập với publication status (`DRAFT`, `PUBLISHED`, `HIDDEN`). Chỉ API nghiệp vụ đặt chỗ/hợp đồng tương lai mới được chuyển `HELD`/`RENTED`; API admin hiện từ chối chuyển trực tiếp. Đăng tin cần trường bắt buộc hợp lệ, trạng thái AVAILABLE và tối thiểu 3 ảnh. Giới hạn thư viện: 15 ảnh/phòng, 10 MB/ảnh, JPEG/PNG/WEBP. `codeNormalized` có unique index toàn hệ thống; `(propertyId, numberNormalized)` có unique partial index. Lỗi duplicate Mongo `11000` được chuyển thành HTTP 409 để xử lý race giữa kiểm tra trước và ghi. Những quy tắc này chỉ áp dụng khi frontend/API được tích hợp; bản demo hiện lưu dữ liệu client-side.

Dashboard occupancy hiện là `RENTED / tổng phòng` trên toàn bộ document Room (bao gồm draft/hidden), tức ảnh chụp trạng thái hiện thời chứ không phải tỷ lệ theo kỳ. Delete kiểm tra các collection tham chiếu trong ERD trước khi xóa phòng/ảnh; không cascade dữ liệu hoạt động. Tên collection/schema cần được đối chiếu với DB thực trước khi triển khai delete lần đầu.

Cookie phiên có HttpOnly, SameSite=Strict, Secure ở production. Role được tra cứu lại từ MongoDB ở middleware thay vì tin role cũ trong JWT. Guard Angular/sessionStorage chỉ hỗ trợ UX, không thay phân quyền API. Lỗi theo `{code, message, fieldErrors}`; ID phòng Mongo ổn định; tiền lưu dạng number VND và timestamp Mongoose.

## Chưa triển khai

Các route/service lịch xem, yêu thích, booking/giữ chỗ, thanh toán/webhook, cọc, hợp đồng, nhân viên, GPS, bảng lương/hoa hồng, nhân sự và audit log chưa có backend nghiệp vụ. Dashboard không hiển thị số liệu mẫu cho chúng; không coi các màn demo nhân viên/khách hiện hữu là tích hợp thật. Map dùng danh sách tòa nhà/phòng minh họa ở frontend; quan hệ property-school và khoảng cách đều chưa xác minh.

Không thể kiểm chứng runtime Mongo, kiểm thử quyền/unique/upload/delete E2E hoặc chạy luồng publish end-to-end đến khi có MongoDB URI và dữ liệu môi trường. Chế độ giao diện demo có thể chạy mà không cần backend; `npm run build:api` chỉ kiểm tra biên dịch backend.
