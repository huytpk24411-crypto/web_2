# Kiểm chứng ba trang Admin — 15/10/2026

| Lệnh / phạm vi | Kết quả |
|---|---|
| `npm.cmd run build` (lần cuối chạy riêng) | PASS; initial 504,21 kB, lazy Admin 413,45 kB; xuất `dist/ihouzz-uni/browser` |
| `npm.cmd run test:unit` | PASS; 77 test / 40 file; gồm xác minh return URL mới và chặn sai vai trò |
| `npm.cmd run check:frames` | PASS; giữ đủ 27 frame / 108 file / 27 ảnh tham chiếu cũ |
| Playwright: `admin-dashboard`, `admin-finance`, `admin-rooms-demo`, `staff` | PASS; 16 kịch bản trong lần chạy hồi quy rộng |
| Playwright: `admin-finance --grep "fit desktop widths" --output=test-results-desktop --reporter=list` | PASS; thêm 1 kịch bản với ba trang tại 1290, 1536, 1920 px; đủ cả bảy cột lương |
| `e2e/workflows.spec.ts` (bộ cũ, chạy cùng lượt hồi quy rộng) | FAIL 6; 4 test chờ nhãn đăng nhập cũ `Tên đăng nhập` trong khi giao diện hiện tại có dấu `*`; 1 test chờ nút `Yêu thích` không còn khớp nhãn; 1 test phát hiện trang chủ khách hàng ở 390 px có scrollWidth 471 px |

Lượt hồi quy rộng dùng lệnh `npx.cmd playwright test e2e/admin-finance.spec.ts e2e/admin-dashboard.spec.ts e2e/staff.spec.ts e2e/admin-rooms-demo.spec.ts e2e/workflows.spec.ts`: **16 passed / 6 failed**, 5,3 phút. Kịch bản kiểm tra thêm kích thước desktop chạy riêng và PASS, nên tổng cộng **17 kịch bản đạt**. Không tuyên bố toàn bộ E2E đạt. Các lỗi bộ `workflows` nằm ở selector cũ và trang chủ khách hàng mobile, ngoài ba trang Admin desktop; source và test `workflows.spec.ts` không được chỉnh trong tác vụ này. Báo cáo có trace/screenshot tại `test-results/` và `playwright-report/`. Bộ map/gallery không được chạy lại.

Ba kịch bản chức năng mới kiểm tra lọc và export theo bộ lọc; xem UNC; yêu cầu bổ sung/lý do bắt buộc; hủy/xác nhận duyệt; từ chối; gia hạn một lần; badge sidebar; kỳ lương, tìm kiếm không dấu, phân trang và trạng thái rỗng; duyệt cá nhân, tạo và chốt kỳ; tải lương/ủy nhiệm chi; tổng thực nhận tháng 04 xuất CSV khớp **126.080.000 đ**; kiểm tra giá trị cấu hình, công tắc, lưu và tải lại, JSON, nhật ký, báo cáo, phân quyền và khôi phục mặc định. Không có pageerror hoặc request `/api/` trong ba kịch bản này. In/Lưu PDF đã triển khai bằng `window.print()` và CSS print; chưa kiểm tra lưu một tệp PDF thực tế.

Đã mở và xem ảnh chụp desktop ba trang ở 1345 × 950, full-page: [Cọc](screenshots/admin-approvals-desktop.png), [Lương](screenshots/admin-payroll-desktop.png), [Báo cáo](screenshots/admin-reports-desktop.png). Sửa lại ảnh phòng minh họa và cỡ chữ bảng lương sau lượt xem đầu. Ảnh tham chiếu Cọc có các dải lặp/tràn ngang; bản dựng dùng một danh sách bốn hồ sơ và ba thẻ thông tin bên dưới. Chưa chạy pixel-diff; không tối ưu mobile cho ba trang mới.

Build còn cảnh báo initial vượt ngưỡng 500 kB **4,21 kB** và CSS vượt ngưỡng cảnh báo 4 kB: layout 4,96; dashboard 7,95; room-list 4,84; staff-shift-adjustment 5,64; finance-ui 5,18; approvals 4,25; payroll 4,94; reports 7,60 kB. Tất cả dưới ngưỡng lỗi 8 kB; không tăng budget. Một lượt build đồng thời unit test kết thúc mã 1 không có diagnostic; chạy lại build riêng thành công như bảng trên. Các lệnh Angular/Playwright cần chạy ngoài sandbox vì sandbox chặn tạo tiến trình `spawn EPERM`.

Route, phạm vi dữ liệu, thao tác và toàn bộ file nguồn thay đổi: [ADMIN_FINANCE_DEMO.md](ADMIN_FINANCE_DEMO.md).

---

# Kiểm chứng Nhân sự & Ca trực — 13/10/2026

| Lệnh | Kết quả |
|---|---|
| `npm.cmd run build` | PASS, initial 502,68 kB; có cảnh báo budget, không có lỗi build |
| `npm.cmd run test:unit` | PASS, 77 test / 40 file, gồm kiểm tra mới cho chuyển ca, ca đầy/trùng giờ và lưu trữ hồ sơ |
| `npx.cmd playwright test e2e/staff.spec.ts` | PASS, 5 kịch bản Chromium: điều chỉnh lịch/xuất phiếu/xóa; CRUD/lọc/CSV/reset; ca đầy/hủy/sửa/chuyển việc/ngừng hoạt động; chấm công/KPI; smoke test các route cũ |
| `npm.cmd run check:frames` | PASS, 27 component / 108 file / 27 ảnh tham chiếu |

Kiểm thử desktop 1345 × 950, danh sách 1920 × 1080, hiệu suất 1280 × 900 và hộp thoại mới 1440 × 1100. Năm kịch bản E2E chạy thành công (19,9 giây). Không có lỗi JavaScript ở các kịch bản có theo dõi pageerror (điều chỉnh/xóa, CRUD và smoke test). Kiểm tra sidebar cùng chiều rộng khi chuyển từ nhân sự sang quản trị phòng. Không kiểm tra mobile, không thêm hoặc gọi backend nhân sự.

Cảnh báo build: initial vượt ngưỡng cảnh báo 500 kB khoảng 2,68 kB; CSS `admin-layout` 4,96 kB, `admin-dashboard-frame` 7,95 kB, `admin-room-list-frame` 4,84 kB và `staff-shift-adjustment` 5,64 kB vượt ngưỡng cảnh báo 4 kB nhưng dưới ngưỡng lỗi 8 kB. Không tăng budget để che cảnh báo. Build xuất thành công tại `dist/ihouzz-uni`.

Đã đối chiếu ảnh chụp các trang cùng hộp thoại điều chỉnh lịch, thành công và toast xóa với bộ tham chiếu. Ca chưa tạo hiển thị trống; KPI lấy từ dữ liệu demo, không sao chép số kinh doanh. Phiếu điều chỉnh xuất CSV, không giả nút PDF. Ảnh và chi tiết quy tắc: [STAFF_DEMO.md](STAFF_DEMO.md). CSS của module được giới hạn phạm vi; sidebar dùng layout chung. Không chạy pixel-diff. Kiểm thử cũ bên dưới là kết quả lịch sử, không phải toàn bộ E2E đã chạy lại ngày 13/10.

---

# Kết quả kiểm chứng trước đây — 08/10/2026

## Các lệnh đã chạy

| Lệnh | Kết quả cuối |
|---|---|
| `npm run build` | PASS, production bundle tại `dist/ihouzz-uni/browser`; initial 404,72 kB, trong budget cấu hình |
| `npm run test:unit` | PASS, 57 test trong 38 file |
| `npm run test:e2e` | PASS, 6 kịch bản Chromium headless |
| `npm run check:frames` | PASS, 27 component riêng / 108 file bắt buộc / 27 ảnh tham chiếu |

Môi trường: Windows, Node 24.20.0, npm 11.19.0, Angular CLI 22.1.7, Vitest 4.1.11. Cài đặt dependency không báo lỗ hổng tại lần cài đã chạy. Không triển khai website ra internet.

## Luồng trình duyệt đã kiểm tra

1. Guest mở trang chủ → nhấn yêu thích → đăng ký → chuyển đăng nhập → xử lý sai mật khẩu → đăng nhập đúng → trở lại đúng phòng và lưu yêu thích → đặt lịch hai phòng → tạo giữ chỗ pending → xác nhận demo → xem phiếu và tải lại vẫn giữ dữ liệu.
2. Đăng ký khách mới → trở lại đúng phòng → kiểm tra mật khẩu không nằm trong browser storage → chặn khách truy cập admin → đăng xuất → chặn guest vào nhân viên và favorites.
3. Nhân viên đăng ký hai ca → check-in bằng ảnh mẫu → đánh dấu công việc cá nhân → bàn giao việc chưa xong sang ca tiếp theo → check-out → vào ca tiếp theo thấy việc bàn giao → xem bảng lương.
4. Nhân viên lập hồ sơ cọc trực tiếp → tiền mặt → chỉ bật nút in sau xác nhận demo → chuyển tab VietQR nhưng chứng từ vẫn giữ đúng phương thức tiền mặt đã xác nhận → giao dịch → nhập lý do bỏ cọc → mở lại phòng và không tạo payment trùng.
5. Admin dashboard → danh sách → thêm mã trùng → frame lỗi riêng giữ dữ liệu → sửa mã và lưu → dialog hoàn tất → sửa giá → quản lý/chọn ảnh bìa → xác nhận ẩn phòng có lịch sử (không có nút xóa) → toast → xóa phòng thử chưa có lịch sử → danh sách nhân sự → vào khu nhân viên.
6. Viewport 390 × 844: trang chủ, danh sách, chi tiết, đăng nhập, đăng ký và danh sách admin không tràn ngang toàn trang. Bảng admin có vùng cuộn riêng. Bộ lọc không có kết quả hiển thị trạng thái rỗng.

Test render của 27 frame có fixture đăng nhập, booking, payment, hồ sơ cọc, giao dịch và ca hợp lệ. Kiểm thử nghiệp vụ bổ sung bao phủ quyền, returnUrl, dữ liệu cá nhân, giới hạn suất ca, khấu trừ cọc một lần, giữ chỗ 48 giờ, hết hạn, công việc chung/cá nhân, ảnh thiếu, giá trị tiền không hợp lệ, bảo toàn phòng ẩn và lý do bỏ cọc sau tải lại.

## Đối chiếu UI

Đã xem contact sheet của toàn bộ 27 ảnh nguồn và ảnh chụp các màn đại diện ở desktop/mobile. 18 ảnh chụp UI nằm trong [screenshots](screenshots/), gồm:

- [Trang chủ desktop](screenshots/customer-home-desktop.png), [mobile](screenshots/customer-home-mobile.png), [chi tiết phòng](screenshots/customer-room-detail.png).
- [Lịch xem đã xác nhận](screenshots/customer-viewing-confirmed.png), [phiếu giữ chỗ](screenshots/customer-booking-receipt.png).
- [Đăng ký ca](screenshots/employee-shift-registration.png), [công việc](screenshots/employee-tasks.png), [bàn giao](screenshots/employee-checkout.png), [phiếu tiền mặt](screenshots/employee-cash-receipt.png).
- [Dashboard](screenshots/admin-dashboard.png), [danh sách phòng](screenshots/admin-room-list.png), [danh sách mobile](screenshots/admin-room-list-mobile.png), [lỗi trùng](screenshots/admin-duplicate-room.png), [thư viện ảnh](screenshots/admin-room-images.png), [nhân sự](screenshots/admin-staff.png).
- [Dialog ẩn/xóa](screenshots/admin-room-delete-dialog.png), [toast](screenshots/admin-room-delete-toast.png), [dialog hoàn tất](screenshots/admin-action-complete.png).

Giao diện bám cấu trúc, màu và thành phần của frame; chưa thực hiện phép đo pixel-diff. Một số nội dung được điều chỉnh để phản ánh trạng thái thực của demo thay vì hiển thị thanh toán thành công trước thao tác xác nhận.

## Các vấn đề đã sửa trong quá trình rà soát

- Module Auth nhận nhầm route `/`, làm trang chủ chỉ có header/footer: bổ sung canMatch để chỉ nhận login/register.
- Locale tiếng Việt và mock route trong test: cấu hình locale ở shared và bổ sung route data.
- Tìm kiếm không dấu với chữ “đ”: chuẩn hóa đúng sang “d”.
- Ảnh chính chi tiết phòng lấy nhầm ảnh tòa nhà: ánh xạ lại ảnh nội thất, ban công, phòng ngủ, bếp và phòng tắm.
- Header admin mobile bị ép chữ: bố trí link chế độ nhân viên thành hàng riêng.
- Phiếu sau xác nhận lấy phương thức từ tab thay vì payment: dùng phương thức đã được xác nhận trong giao dịch.
- Lý do bỏ cọc chưa lưu: thêm lý do/thời điểm vào deal và giữ lại qua localStorage.
- Admin có thể mở lại phòng có hold/cọc: chặn trạng thái AVAILABLE trước khi xử lý giao dịch.
- Mã ca có thể đổi ngày theo tuần hiện tại: cố định đợt demo 12–18/10/2026 để lịch sử ổn định.
- Thiếu ảnh phòng: dùng placeholder có nhãn rõ ràng.

## Giới hạn còn lại

Đây là frontend demo: chưa có backend, bảo mật server, thanh toán/QR thật, khóa phòng/ca nguyên tử đa người dùng, xác minh camera/GPS, PDF ký số hoặc bảng lương chính thức. Dữ liệu chỉ lưu trong trình duyệt, tài khoản tự đăng ký chỉ tồn tại trong bộ nhớ phiên. Các API cần bổ sung được liệt kê trong [API_PLAN.md](API_PLAN.md).

## Nhóm file triển khai

- `src/app/features/`: 27 frame và các component hỗ trợ; [FRAME_MAP.md](FRAME_MAP.md) liên kết đủ bốn file của từng frame.
- `src/app/layouts/`, `shared/`, `guards/`, `models/`, `data/`, `services/`: layout dùng chung, nghiệp vụ và dữ liệu demo.
- `src/styles.css`, `src/index.html`, `public/assets/`, `public/favicon.svg`: giao diện chung, ảnh và metadata.
- `e2e/workflows.spec.ts`, `playwright.config.ts`, `src/app/testing/`, các `*.spec.ts`: kiểm thử.
- `package.json`, `package-lock.json`, `angular.json`, `tsconfig*.json`: cấu hình Angular/build/test.
- `README.md`, `docs/`, `scripts/verify-frames.mjs`, `scripts/document_frames.py`, `scripts/inspect_assets.py`: hướng dẫn và kiểm kê. Script dựng mã ban đầu đã được gỡ để tránh ghi đè các bản sửa hiện tại.

Hai thư mục ảnh gốc và file prompt của người dùng được giữ nguyên.
