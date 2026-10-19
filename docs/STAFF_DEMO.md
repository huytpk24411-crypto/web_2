# Nhân sự & Ca trực — frontend demo

Cập nhật 13/10/2026. Chỉ triển khai desktop, không thêm backend, API, MongoDB hay yêu cầu URI cho chức năng này.

## Giao diện theo bộ ảnh tham chiếu mới

Tái sử dụng nguyên `AdminLayoutComponent` và sidebar dùng chung hiện có (258px); không có sidebar riêng hoặc route nhân sự trùng. Giữ nền tím nhạt, tab và nút xanh/đỏ, ô nhập lavender trong nội dung nhân sự. Danh sách có bộ lọc, thống kê, chọn/xuất hồ sơ và phân trang; hồ sơ và form chia hai cột. Bổ sung hộp thoại điều chỉnh lịch, trạng thái điều chỉnh thành công, xác nhận xóa và toast góc phải theo các ảnh mới. Hiệu suất có icon KPI và lọc tên/mã trong bảng xếp hạng.

Các file chỉnh giao diện trong lượt này:

- `src/app/layouts/admin-layout/admin-layout.component.html`: đổi nhãn “Trực tuyến” thành “Demo trên thiết bị”; giữ cấu trúc/sidebar dùng chung.
- `src/app/features/admin/admin-staff-list-frame/admin-staff-list-frame.component.{ts,html,css}`: bố cục, trạng thái, biểu đồ từ repository và lựa chọn xuất hồ sơ.
- `src/app/features/admin/staff-shift-adjustment/staff-shift-adjustment.component.{ts,html,css}`: hộp thoại điều chỉnh, kiểm tra ca, xác nhận thành công và tải phiếu CSV.
- `src/app/features/admin/admin.module.ts`: khai báo component hộp thoại trong NgModule hiện có; không thêm route.
- `src/app/models/domain.ts`: `StaffProfile.archivedAt`, `ShiftAssignment.movedFromAssignmentId` tùy chọn, đọc được snapshot cũ.
- `src/app/services/staff-demo.repository.ts`: chuyển ca trong một lần lưu, kiểm tra sức chứa/trùng giờ; lưu trữ hồ sơ khi xóa khỏi danh sách.
- `src/app/services/staff-demo.repository.spec.ts`, `e2e/staff.spec.ts`: kiểm tra nghiệp vụ mới, sidebar dùng chung và các luồng cũ.
- `docs/STAFF_DEMO.md`, `docs/VALIDATION.md`, `docs/screenshots/staff-*.png`: bàn giao và bằng chứng kiểm tra.

Ảnh tham chiếu là bộ ảnh đính kèm từ `Downloads` và bộ đã có trong `figma_images/admin/`; dùng làm mẫu bố cục, không làm nền giao diện. Avatar và icon SVG tận dụng tài nguyên hiện có. Số nhân viên, ca, trạng thái và biểu đồ được tính từ bộ demo.

## Chạy và truy cập

```powershell
cd D:\Front_end_web2
npm.cmd start
```

Mở `http://127.0.0.1:4200/admin/staff`, đăng nhập `admin123 / 123`. Đường dẫn được giữ qua màn đăng nhập, kể cả hồ sơ và lịch ca. Giữ terminal chạy. Dự án đã tắt prebundle để tránh bước đổi tên cache Vite từng gây lỗi EPERM trên Windows.

| Route | Chức năng |
|---|---|
| `/admin/staff` | Tìm theo tên/mã/điện thoại/email; lọc chức vụ, cơ sở, trạng thái; sắp xếp, phân trang, xuất CSV theo kết quả lọc |
| `/admin/staff/new` | Tạo hồ sơ; validate thông tin bắt buộc, liên hệ trùng và ngày tháng |
| `/admin/staff/:id/success` | Thông tin nhân sự vừa tạo và thao tác tiếp theo |
| `/admin/staff/:id` | Hồ sơ, lịch, công việc/chấm công, hiệu suất; sao chép email và liên kết `tel:` |
| `/admin/staff/:id/edit` | Sửa hồ sơ và ảnh đại diện; giữ dữ liệu khi có lỗi |
| `/admin/staff/schedule` | Lịch tuần, lọc cơ sở/nhân viên, đợt đăng ký, nhận/hủy chỗ, thêm/sửa ca, giao/chuyển việc |
| `/admin/staff/performance` | Chỉ số, biểu đồ và bảng xếp hạng theo đợt |

Tại `/admin/staff/schedule`, chọn ca đã có người nhận → **Điều chỉnh lịch trực** → chọn nhân viên/ca thay thế → **Lưu điều chỉnh**. Hộp thoại thành công hiển thị ca trước/sau, có tải phiếu **CSV** và nút về bảng lịch. **Sửa thông tin ca** vẫn dùng để sửa ngày/giờ/địa điểm/sức chứa cả ca. Ca gốc chưa bắt đầu, ca mới còn chỗ, đăng ký đang mở và không trùng giờ mới cho lưu. Có Escape và giữ focus trong hộp thoại.

Nút thùng rác ở danh sách hoặc **Xóa nhân sự** ở hồ sơ mở xác nhận. **Xác nhận Xóa** đưa hồ sơ khỏi danh sách vận hành; **Chỉ ngừng hoạt động** giữ hồ sơ trong danh sách với trạng thái ngừng hoạt động. Đây đều là thay đổi localStorage, không tác động tài khoản máy chủ.

## Dữ liệu và lưu trữ

`StaffDemoRepository` là nguồn dữ liệu chung cho toàn bộ các màn trên. Khóa localStorage: **`ihouzz-staff-demo-v1`**. Mỗi thao tác ghi một snapshot, chỉ cập nhật giao diện thành công sau khi lưu được. Nếu storage đầy/bị chặn, báo lỗi và giữ trạng thái trước thao tác. Nút **Đặt lại dữ liệu demo** có xác nhận, chỉ xóa dữ liệu của module nhân sự; không xóa phòng, booking hay dữ liệu demo cũ.

Bộ mẫu có 6 nhân sự giả, điện thoại bắt đầu bằng `000`, email `example.test`; ảnh dùng `ASSETS.staff` (`asset-045.jpg` đến `asset-050.jpg`) và avatar mặc định `asset-002.jpg` từ tài nguyên đã có. Cơ sở lấy 5 tòa nhà minh họa của catalog. Không lưu CCCD hoặc địa chỉ cư trú. Ảnh tải lên JPG/PNG/WebP tối đa 2 MB được lưu dạng data URL, có thể làm đầy storage.

Khi chưa có snapshot, tuần hiện tại và tuần trước được dựng theo ngày trên thiết bị. Tuần trước có ca/chấm công/công việc đã hoàn thành để minh họa KPI. Sau khi ghi dữ liệu, ngày của các ca đã lưu không tự thay đổi. Chuyển tuần chỉ đọc lịch: tuần chưa có dữ liệu sẽ trống, cần tạo đợt rõ ràng.

Module này độc lập với kho `ihouzz-demo-v1` của các luồng customer/employee cũ. Dropdown chọn nhân viên trên lịch admin là **mô phỏng hành động đăng ký của nhân viên**; hồ sơ vừa tạo không tự có tài khoản đăng nhập. Không có gửi email, SSO, VNeID, GPS hoặc sinh trắc học.

## Quy tắc đã triển khai

- Đợt bắt đầu thứ Hai, có thời điểm mở/đóng và sức chứa từng ca. Tạo đợt dựng 14 ca sáng/chiều; có thể thêm ca riêng hoặc sửa ca chưa bắt đầu.
- Người đang hoạt động nhận chỗ hợp lệ ngay, **không duyệt ca**. Chặn ca đã bắt đầu, ngoài thời hạn, đầy, đăng ký trùng và giao nhau về giờ. Sửa ca cũng kiểm tra xung đột của người đã nhận và không giảm sức chứa thấp hơn số người đã nhận.
- Hủy ca chưa bắt đầu giải phóng chỗ, đánh dấu suất cần bổ sung và phần việc chưa xong cần phân công lại. Nhận người thay thế giảm số suất cần bổ sung; không tự gán người ngẫu nhiên.
- Một việc có nhiều người. Checkbox lưu phần hoàn thành của từng người. Chuyển việc chỉ đến ca sau có người nhận; giữ một ID, ca gốc, đóng góp đã xong và lịch sử chuyển. Phần chưa xong được giao cho người đang hoạt động đã nhận ca đích. Không tạo bản sao để đếm trùng.
- Chấm công nằm trong tab **Công việc & chấm công**: nhập giờ giả lập theo ngày ca. Có thể dùng ca tương lai để thử; đây không phải giờ làm thật. Giờ vào đổi trạng thái đang làm; giờ ra phải sau giờ vào và mới hoàn thành ca.
- Ngừng hoạt động/xóa có modal hiển thị số đăng ký tương lai còn hiệu lực. Hủy đăng ký chưa bắt đầu, đánh dấu ca/việc cần phân công lại, giữ lịch sử. Xóa thêm `archivedAt` để ẩn hồ sơ khỏi danh sách; không xóa dây chuyền ca/công việc/chấm công.
- Điều chỉnh lịch hủy assignment cũ và tạo assignment mới có `movedFromAssignmentId` trong một lần ghi snapshot. Lỗi validation/storage không hủy ca gốc. Việc chưa xong giữ ở ca gốc và đánh dấu cần phân công lại; không tự mang sang ca mới.

## Công thức KPI

- Ca được phân: các assignment chưa hủy trong kỳ; một ca có 3 người là 3 lượt phân ca.
- Ca hoàn thành: assignment `COMPLETED`, có giờ ra demo.
- Đúng giờ: check-in không muộn quá giờ bắt đầu + 5 phút / tổng check-in trong kỳ × 100.
- Công việc: số phần việc người đó đã đánh dấu xong / số phần việc được giao × 100. Tổng là lượt giao theo người, không phải số task duy nhất. Việc chuyển ca vẫn thuộc kỳ của ca gốc; lịch sử người nhận trước được giữ trong `transfers`.
- Thứ tự bảng: tỷ lệ hoàn thành việc giảm dần, rồi số ca hoàn thành. Không gán hạng A/A+, doanh thu, hoa hồng hay đánh giá khách hàng khi chưa có dữ liệu liên kết.

## File chính và điểm nối sau này

- `src/app/models/domain.ts`: `StaffProfile`, `WorkLocation`, `RegistrationPeriod`, `StaffShift`, `ShiftAssignment`, `ShiftTask`, `StaffAttendance`. Tên có tiền tố Staff để không phá các model employee cũ.
- `src/app/services/staff-demo.repository.ts`: seed, tra cứu, validation, lưu trữ và tính KPI tập trung.
- `src/app/features/admin/admin-staff-list-frame/`: component, template và CSS cho các trạng thái theo route; style được giới hạn dưới selector của module, không ảnh hưởng trang khác.
- `src/app/features/admin/admin.module.ts`: các route tĩnh đặt trước `:id`.
- `src/app/services/auth.service.ts`: cho phép returnUrl hợp lệ của các route nhân sự khi đăng nhập admin.
- `src/app/services/staff-demo.repository.spec.ts`, `e2e/staff.spec.ts`: kiểm thử nghiệp vụ và trình duyệt.

Khi có backend, giữ các model và màn hình, thay phần đọc/ghi của repository bằng adapter API, bổ sung trạng thái chờ và xử lý lỗi bất đồng bộ ở các handler. Backend cần đảm nhiệm quyền, kiểm tra trùng, cấp chỗ nguyên tử và lịch sử cập nhật. Không xem các kiểm tra localStorage là thay thế cho những quy tắc server.

localStorage chỉ thuộc origin/trình duyệt hiện tại (`localhost` và `127.0.0.1` là hai vùng riêng), không đồng bộ nhiều máy hoặc giải quyết hai người nhận chỗ cuối đồng thời. Cũng không xử lý ghi đồng thời giữa nhiều tab; demo nên dùng một tab. Không lưu thông tin cá nhân thật.

## Kiểm chứng và ảnh chụp

Xem kết quả lệnh trong [VALIDATION.md](VALIDATION.md). Bộ `e2e/staff.spec.ts` bao phủ CRUD hồ sơ, lỗi trùng email, reload, lọc/sắp xếp/phân trang, CSV, reset, đợt mới, đầy/hủy ca, sửa ca, công việc chung/chuyển việc, ngừng hoạt động và chấm công/KPI. Có smoke test các route customer, employee, quản trị phòng hiện có.

Ảnh desktop tại [screenshots](screenshots/):

- [Danh sách](screenshots/staff-list-desktop.png), [desktop 1920](screenshots/staff-list-wide.png)
- [Form](screenshots/staff-form-desktop.png), [lỗi trùng](screenshots/staff-form-error.png)
- [Thành công](screenshots/staff-success.png), [hồ sơ có lịch sử](screenshots/staff-detail-populated.png), [chỉnh sửa](screenshots/staff-edit-desktop.png)
- [Lịch và việc chuyển ca](screenshots/staff-schedule-desktop.png)
- [Xác nhận ngừng hoạt động](screenshots/staff-deactivate-modal.png)
- [Hiệu suất](screenshots/staff-performance-desktop.png), [desktop 1280](screenshots/staff-performance-1280.png)
- [Điều chỉnh lịch](screenshots/staff-adjustment-dialog.png), [điều chỉnh thành công](screenshots/staff-adjustment-success.png)
- [Xác nhận xóa](screenshots/staff-delete-confirm.png), [toast xóa](screenshots/staff-delete-toast.png)

Đã đối chiếu cấu trúc với 8 ảnh tham chiếu: tabs, bảng, avatar/form chia cột, lỗi inline/banner, thành công, modal, lịch có panel bên phải và KPI. Nội dung được thay bằng dữ liệu demo nhất quán; không sao chép các tuyên bố xác thực hoặc số liệu kinh doanh trong ảnh. Lịch có vùng cuộn ngang riêng để xem đủ 7 ngày. Không thực hiện so sánh pixel-diff.
