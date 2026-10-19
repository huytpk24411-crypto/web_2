# Ba trang Admin — demo desktop

Ngày cập nhật: 15/10/2026. Giữ Angular/NgModule, module Admin lazy-load và layout dùng chung; không thêm thư viện, route trùng, backend hoặc API mới.

## Mở trang

Chạy `npm.cmd start`, mở `http://127.0.0.1:4200`, đăng nhập `admin123 / 123`.

| Route | Trang |
|---|---|
| `/admin/approvals` | Phê duyệt Cọc & Quản lý Giao dịch |
| `/admin/payroll` | Bảng lương & Hiệu suất Doanh số |
| `/admin/reports` | Báo cáo Vận hành & Cấu hình Hệ thống |

`/admin/reports` dùng lại route cũ. Hai mục trước đây chỉ cuộn tới Dashboard nay dẫn tới trang riêng; các vùng Dashboard và URL fragment cũ vẫn giữ nguyên. Danh sách return URL sau đăng nhập đã bổ sung hai route mới. Sidebar đánh dấu đúng một mục đang mở.

## Thao tác demo

**Cọc:** Bốn hồ sơ theo ảnh, lọc tên/mã không dấu, cụm tòa, tiền cọc và trạng thái; áp dụng/đặt lại bộ lọc; trạng thái rỗng. Xem chi tiết, UNC minh họa bằng dữ liệu và dự thảo hợp đồng. Duyệt một/nhiều hồ sơ đang lọc, từ chối có lý do, yêu cầu bổ sung có nội dung và gia hạn một lần 24 giờ đều có hộp thoại xác nhận. Thẻ tổng quan và badge sidebar cập nhật theo xử lý. Xuất danh sách đang lọc thành CSV mở được trong Excel. Ba thẻ cuối trang trình bày quy trình bảo chứng, ảnh căn hộ có sẵn và phân bổ quỹ cọc. Các dải hồ sơ bị lặp/tràn ngang trong ảnh nguồn không được nhân bản vào giao diện.

**Lương:** Ba bộ dữ liệu kỳ 02/2026, 03/2026 và 04/2026; chỉ số và thanh tiến độ cập nhật theo tháng. Tháng 04 ban đầu chưa tạo, có thể tạo bảng mẫu 18 người. Tìm không dấu, lọc đã/chưa duyệt, phân trang ba trang, mở phiếu lương từ tên nhân viên, duyệt từng người và chốt toàn bộ kỳ. Tổng lương/phụ cấp, hoa hồng, doanh thu, khấu trừ và thực nhận được đối chiếu với 18 dòng mẫu. Tổng cuối bảng tính theo trang hiện tại. Xuất CSV theo bộ lọc; In/Lưu PDF in nội dung đang hiển thị bằng hộp thoại in của trình duyệt và CSS print. Ủy nhiệm chi tải CSV của nhân viên đã duyệt. Số “chờ duyệt” tính trên đủ 18 người nên ban đầu là 16; ảnh tham chiếu chỉ thể hiện 4 trên 6 người đầu.

**Báo cáo/Cấu hình:** Bốn nhóm điều hướng; hai nhóm đầu cuộn tới GPS và cọc, hai nhóm sau mở thêm mục báo cáo/mục tiêu hoặc phân quyền mẫu. Sửa các giá trị GPS, mức phạt, kỳ giữ chỗ, xử lý UNC, phần trăm tịch thu và sáu giá dịch vụ. Công tắc cập nhật trạng thái `aria-checked`. Kiểm tra số không âm, giới hạn GPS/thời gian/tỷ lệ; không lưu dữ liệu sai. Lưu thành công đổi trạng thái chưa lưu, hiển thị thời gian lưu/toast và thêm nhật ký. Khôi phục mặc định cần xác nhận rồi nhấn Lưu để ghi lại. Sao lưu JSON gồm bản cấu hình hiện tại và lịch sử. Báo cáo lấp đầy/doanh thu có preview và xuất CSV. Công cụ đặt lại dữ liệu demo cũ vẫn nằm trong nhóm thu gọn ở cuối trang.

## Phạm vi dữ liệu

- Hồ sơ và bảng lương lưu trong bộ nhớ component, đặt lại khi rời/tải lại trang; không ghi vào dữ liệu phòng, cọc hoặc lương của nhân viên.
- Cấu hình và nhật ký lưu riêng tại `ihouzz-admin-system-config-v1` trong localStorage, giữ lại khi tải lại. Lỗi lưu trữ được báo rõ và trạng thái chưa lưu được giữ lại.
- Chỉ mô phỏng duyệt, khóa phòng, ký hợp đồng, phạt và ủy nhiệm chi. Không gửi tin nhắn hoặc chuyển tiền. Trạng thái cổng tự động là số liệu minh họa.
- Các thiết lập phân quyền/lương/chấm công chỉ ghi nhận trong trang cấu hình demo, không sửa luồng xác thực hay các module cũ.
- Giao diện ưu tiên desktop; không triển khai tối ưu mobile cho ba trang này.

## File nguồn thay đổi

| Nhóm | File |
|---|---|
| Trang Cọc mới | `src/app/features/admin/admin-approvals/admin-approvals.component.{ts,html,css}` |
| Trang Lương mới | `src/app/features/admin/admin-payroll/admin-payroll.component.{ts,html,css}` |
| Trang Báo cáo nâng cấp | `src/app/features/admin/admin-reports/admin-reports.component.{ts,html,css}` |
| Style và xuất file dùng chung | `src/app/features/admin/admin-finance-ui.css`, `admin-finance-demo.ts` |
| NgModule/routes | `src/app/features/admin/admin.module.ts` |
| Điều hướng/layout | `src/app/layouts/admin-layout/admin-layout.component.{ts,html}` |
| Return URL đăng nhập | `src/app/services/auth.service.ts` |
| Kiểm thử | `e2e/admin-finance.spec.ts`, `e2e/admin-dashboard.spec.ts`, `src/app/services/workflows.spec.ts` |
| Hướng dẫn | `README.md`, `docs/ADMIN_FINANCE_DEMO.md`, `docs/VALIDATION.md` |

Ảnh kiểm tra: [Cọc](screenshots/admin-approvals-desktop.png), [Lương](screenshots/admin-payroll-desktop.png), [Báo cáo](screenshots/admin-reports-desktop.png). Kết quả chạy lệnh ghi tại [VALIDATION.md](VALIDATION.md).
