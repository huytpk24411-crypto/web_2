# Giao diện Quản lý Phòng & Tòa nhà — Admin

## Mở trang

Chạy `npm start`, đăng nhập tài khoản mẫu `admin123 / 123`, rồi mở `/admin/rooms`.
Tất cả màn hình dùng Admin layout và sidebar chung. Không thêm route mới.

| Màn hình | Route |
| --- | --- |
| Danh sách | `/admin/rooms` |
| Thêm phòng | `/admin/rooms/new` |
| Lỗi trùng dữ liệu | `/admin/rooms/new/duplicate` |
| Chỉnh sửa phòng mẫu | `/admin/rooms/r1/edit` |
| Thư viện ảnh phòng mẫu | `/admin/rooms/r1/images` |

Route lỗi trùng được mở khi lưu mã phòng đã tồn tại hoặc số căn trùng trong cùng tòa nhà. Dữ liệu nhập và ảnh được giữ để sửa lại. Hộp thoại ẩn/xóa và thông báo hoàn tất được mở trong danh sách.

## Hành vi đã hoàn thiện

- Tìm kiếm; lọc loại phòng, trạng thái phòng/tin, tòa nhà và giá; sắp xếp mã, giá, diện tích, thời điểm cập nhật.
- Phân trang 6/12/24 phòng; chuyển bảng/thẻ; chọn phòng và xuất CSV mở bằng Excel.
- Thêm, lưu nháp, đăng phòng và sửa thông tin. Kiểm tra trường bắt buộc, giá trị số, định dạng mã, mã trùng và số căn trùng. Mã phòng được khóa khi sửa.
- Chọn tiện nghi, chèn mô tả mẫu, tự tạo mã phòng và đặt cọc bằng một tháng tiền thuê.
- Thêm ảnh mẫu hoặc đọc JPG/PNG/WebP từ thiết bị; xem ảnh, chọn ảnh bìa, kéo thả/đổi thứ tự, bỏ ảnh. Tối đa 15 ảnh, 10 MB/ảnh.
- Chỉnh sửa thư viện được giữ tạm trên trang; bấm Lưu để áp dụng, Hủy để bỏ thay đổi. Ảnh từ thiết bị được lưu bằng data URL để còn hiển thị khi tải lại trang, trong giới hạn dung lượng trình duyệt.
- Xem trước nội bộ được dùng cho cả phòng nháp, tin ẩn và phòng đang hiển thị.
- Xác nhận ẩn/đăng lại hoặc chọn xóa rồi xác nhận xóa. Phòng có lịch sử liên quan chỉ cho phép ẩn. Cập nhật bảng, thống kê và toast sau thao tác.
- Hộp thoại hoàn tất cho phép thêm phòng khác, về danh sách, xem trước hoặc mở thư viện ảnh.

Dữ liệu là danh mục mẫu hiện có của dự án, lưu qua `DemoStore`/localStorage. Số liệu danh sách tính từ số phòng thực có trong dữ liệu mẫu; không dùng số 190 cố định trong ảnh. Không có API, MongoDB, thanh toán hay đồng bộ máy chủ.

## File sửa/thêm

Các nhóm bên dưới gồm đủ file `.component.ts`, `.component.html`, `.component.css`, trừ những mục ghi rõ chỉ HTML/CSS:

- `src/app/features/admin/admin-room-list-frame/admin-room-list-frame.component.{ts,html,css}`
- `src/app/features/admin/room-form/room-form.component.{ts,html,css}`
- `src/app/features/admin/admin-room-images-frame/admin-room-images-frame.component.{ts,html,css}`
- `src/app/features/admin/admin-room-delete-confirm-frame/admin-room-delete-confirm-frame.component.{ts,html,css}`
- `src/app/features/admin/admin-action-complete-frame/admin-action-complete-frame.component.{ts,html,css}`
- `src/app/features/admin/admin-room-preview/admin-room-preview.component.{ts,html,css}` — mới
- `src/app/features/admin/admin-room-photo-editor/admin-room-photo-editor.component.{ts,html,css}` — mới
- `src/app/features/admin/admin-add-room-frame/admin-add-room-frame.component.html`
- `src/app/features/admin/admin-add-room-duplicate-frame/admin-add-room-duplicate-frame.component.html`
- `src/app/features/admin/admin-edit-room-frame/admin-edit-room-frame.component.html`
- `src/app/features/admin/admin-room-delete-toast-frame/admin-room-delete-toast-frame.component.css`
- `src/app/features/admin/admin-room-ui.css` — CSS chung, chỉ áp dụng bên trong `.room-admin`
- `src/app/features/admin/admin.module.ts` — khai báo hai component dùng chung mới
- `src/app/services/admin-room.service.ts` — lọc/phân trang, giữ bộ lọc sau thao tác, ảnh lưu qua tải lại trang, tiền cọc mặc định cho dữ liệu cũ
- `src/app/shared/form-error/form-error.component.ts` — hiển thị lỗi khi đánh dấu các trường là đã tương tác
- `src/app/shared/status-badge/status-badge.component.ts` — nhãn bảo trì tiếng Việt
- `src/styles.css` — import CSS giao diện phòng có phạm vi riêng
- `e2e/admin-rooms-demo.spec.ts` — mới
- `docs/ADMIN_ROOMS_DEMO.md` — báo cáo này
- `docs/screenshots/rooms-demo-*.png` — ảnh kiểm tra danh sách, form, lỗi trùng, thư viện, hộp thoại và màn hình nhỏ

Admin layout, sidebar và các route hiện có được giữ nguyên.

## Kiểm tra

- `npm run test:e2e -- e2e/admin-rooms-demo.spec.ts e2e/admin-dashboard.spec.ts`: 8/8 đạt.
- Sau chỉnh sửa cuối về bố cục di động và hiển thị giá: `npm run test:e2e -- e2e/admin-rooms-demo.spec.ts`: 5/5 đạt.
- Kiểm tra 390px và 320px; xác nhận các trang dùng cùng sidebar, không tràn chiều ngang.
- `npm run build`: thành công, không có lỗi biên dịch. Còn cảnh báo budget: initial bundle 500.55 kB, CSS danh sách 4.84 kB, CSS layout 4.96 kB và CSS dashboard 7.95 kB. Không thay đổi giới hạn budget của dự án.

Ảnh kiểm tra tiêu biểu: `docs/screenshots/rooms-demo-list-desktop.png`, `rooms-demo-list-mobile.png`, `rooms-demo-edit.png`, `rooms-demo-gallery.png`, `rooms-demo-hide-confirm.png`, `rooms-demo-delete-confirm.png`, `rooms-demo-complete.png`.
