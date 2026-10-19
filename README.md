# iHOUZZ Uni — Angular

Ứng dụng tìm/thuê phòng, quản lý ca làm và nghiệp vụ môi giới, dựng theo `Prompt_Codex_Angular_iHOUZZ_Uni.md` và 27 frame được cung cấp. Workspace ban đầu chỉ có ảnh và tài liệu. Kiến trúc: **Angular 22, NgModule, routing lazy loading, CSS, không SSR**.

## Chạy ứng dụng

Môi trường đã kiểm tra: Node **24.20.0**, npm **11.19.0**. Phiên bản thư viện được khóa trong `package-lock.json`.

```bash
npm ci
```

Trên Windows, nếu gặp lỗi `EPERM ... rename ... vite/deps_temp ... vite/deps`, hãy dừng server bằng `Ctrl+C` rồi chạy lại từ thư mục dự án:

```powershell
cd D:\Front_end_web2
npm.cmd start -- --open
```

`angular.json` đã đặt `serve.options.prebundle: false` để tránh bước đổi tên cache dependency của Vite bị Windows chặn, và `host: "127.0.0.1"` để dùng địa chỉ loopback nhất quán. Cấu hình áp dụng cho cả `npm start` và `ng serve`; lần khởi động có thể chậm hơn và không ảnh hưởng bản build production. Giữ terminal mở khi sử dụng ứng dụng.

Nếu trang đứng ở “Đang tải iHOUZZ Uni…” và các file JavaScript trả về `504 Outdated Optimize Dep`, dừng phiên `ng serve` cũ rồi khởi động lại để cấu hình mới có hiệu lực. Sau đó mở **http://127.0.0.1:4200/** và tải lại trang bằng `Ctrl+F5`.

Mở **http://localhost:4200**. Trang chủ và danh sách/chi tiết phòng truy cập được khi chưa đăng nhập.

```bash
npm run build         # dist/ihouzz-uni/browser
npm run test:unit     # Angular + Vitest, không watch
npm run check:frames  # kiểm tra 27 component / 108 file / 27 ảnh
npx playwright install chromium
npm run test:e2e      # kiểm thử trình duyệt headless
```

Playwright tự chạy server nếu cổng 4200 chưa được sử dụng. Mỗi test dùng browser context riêng, không thay đổi dữ liệu trình duyệt của bạn. Ảnh kiểm tra nằm tại `docs/screenshots/`, báo cáo test tại `playwright-report/`.

## Chế độ minh họa hiện tại

Giao diện đăng nhập, phòng khách, bản đồ và quản trị hiện chạy hoàn toàn bằng dữ liệu minh họa ở trình duyệt, không cần API hay MongoDB. Tài khoản đăng nhập: **admin123 / 123**, **employee123 / 123**, **customer123 / 123**. Phòng/tòa nhà mẫu nằm trong `src/app/data/`; thay đổi phòng và thao tác quản trị lưu vào localStorage. Tọa độ tòa nhà được ghi rõ là minh họa; ảnh mẫu đi cùng từng phòng là ảnh tham khảo chứ không phải ảnh của bất động sản đã xác minh. Ảnh người dùng tải lên trong phiên demo chỉ là preview tạm thời.

### Nhân sự & Ca trực (demo trên thiết bị)

Các trang `/admin/staff`, `/admin/staff/new`, `/admin/staff/:id`, `/admin/staff/schedule` và `/admin/staff/performance` dùng chung `StaffDemoRepository` và khóa localStorage `ihouzz-staff-demo-v1`. Hồ sơ, đăng ký ca, công việc, chấm công và chỉ số hiệu suất là dữ liệu giả để thử luồng trên một trình duyệt; không gọi API/MongoDB, không đồng bộ nhiều thiết bị và không xử lý cạnh tranh chỗ đăng ký giữa nhiều người dùng. Nút **Đặt lại dữ liệu demo** khôi phục bộ dữ liệu mẫu cho riêng module này. Ảnh đại diện tải lên lưu dạng data URL trong localStorage nên chịu giới hạn dung lượng trình duyệt; reset module sẽ xóa cả ảnh đó. Doanh thu/hoa hồng/đánh giá/xếp hạng chưa có dữ liệu demo liên kết.

### Phê duyệt Cọc, Bảng lương & Cấu hình Admin

Ba trang desktop dùng chung `AdminLayoutComponent`, header và sidebar:

- `/admin/approvals`: lọc hồ sơ, xem chi tiết/UNC/điều khoản, yêu cầu bổ sung, gia hạn 24h, duyệt/từ chối có xác nhận và xuất CSV theo bộ lọc.
- `/admin/payroll`: chọn kỳ 02–04/2026, phân trang/tìm/lọc 18 nhân sự, xem và duyệt phiếu lương, tạo kỳ 04/2026, chốt kỳ, xuất CSV hoặc In/Lưu PDF, tạo tệp ủy nhiệm chi mẫu.
- `/admin/reports`: thiết lập GPS, phạt trễ, giữ cọc, dịch vụ, mục tiêu và phân quyền mẫu; lưu localStorage, nhật ký thay đổi, khôi phục mặc định, sao lưu JSON và xem/xuất báo cáo.

Đăng nhập **admin123 / 123**. Hồ sơ và bảng lương là dữ liệu độc lập trong phiên trang; tải lại hoặc rời trang sẽ khôi phục mẫu. Cấu hình lưu riêng tại `ihouzz-admin-system-config-v1`, giữ lại khi tải lại trình duyệt. Các thiết lập không thay đổi nghiệp vụ hoặc quyền đăng nhập của các luồng cũ. Chi tiết thao tác, phạm vi và danh sách file: [ADMIN_FINANCE_DEMO.md](docs/ADMIN_FINANCE_DEMO.md).

API Express/MongoDB vẫn có trong repo để dùng ở giai đoạn tích hợp tiếp theo, nhưng **giao diện hiện chưa gọi API**. Vì vậy, tài khoản Admin trong MongoDB và lệnh seed phía dưới không cần thiết để đăng nhập bản minh họa.

## Backend tùy chọn cho giai đoạn sau

Sao chép `.env.example` thành `.env`, đặt `MONGODB_URI`, `JWT_SECRET` ngẫu nhiên tối thiểu 32 ký tự, `FRONTEND_ORIGIN` và `UPLOAD_DIR`. Không commit `.env`. Ảnh API lưu dưới `UPLOAD_DIR` trên server; MongoDB chỉ lưu metadata và ID ảnh. Dùng persistent storage/backup cho thư mục này khi triển khai.

Khởi động MongoDB. Chạy lệnh seed một lần nếu muốn thử riêng API:

```bash
npm run seed:admin
npm run build:api
```

Sau đó mở hai terminal riêng:

```bash
npm run start:api
```

```bash
npm start
```

Seed Admin là lệnh chủ động, không tự chạy lúc server khởi động và không sửa tài khoản trùng. Server tạo index MongoDB khi kết nối; không chạy seed dữ liệu phòng mặc định. Tài khoản đã seed chỉ dùng được khi frontend được nối lại API; các tài khoản minh họa phía trên không phải tài khoản API.

Room/Property/Image API được mô tả trong [docs/API_PLAN.md](docs/API_PLAN.md). Tạo nháp cần mã phòng và tòa nhà; đăng tin cần đủ trường hợp lệ, phòng AVAILABLE và ít nhất 3 ảnh. Bộ sưu tập ảnh giới hạn 15 ảnh/phòng, 10 MB/ảnh, nhận JPG/PNG/WEBP. `businessStatus` (AVAILABLE/HELD/RENTED/MAINTENANCE) độc lập với `publicationStatus` (DRAFT/PUBLISHED/HIDDEN). Chỉ tin PUBLISHED và phòng AVAILABLE được đưa vào API danh sách/chi tiết/map public. Occupancy = số phòng RENTED / tổng phòng trong MongoDB, gồm cả draft/hidden; đây là tỷ lệ trạng thái hiện tại, không phải tỷ lệ theo kỳ.

Hiện môi trường phát triển này không có MongoDB chạy sẵn. Không có dữ liệu property/room/ảnh mẫu nào được chèn vào database.

## Bản đồ Leaflet và gallery mới

Bản đồ dùng **Leaflet + OpenStreetMap**, không cần API key, Map ID hay thẻ thanh toán. Có kéo/zoom, gom marker, logo trường, panel tòa nhà, lọc đồng bộ qua URL và thông báo khi tile lỗi. Trong chế độ hiện tại, markers/tòa nhà/phòng dùng fixtures minh họa trong `src/app/data/`; quan hệ trường và khoảng cách không phải dữ liệu vị trí đã xác minh.

26 ảnh mới tạo thành gallery minh họa cho 12 phòng; hover card chuyển ảnh mỗi 1,3 giây, gallery hỗ trợ thumbnail/phím mũi tên/Escape. 6 ảnh còn chờ ghép. Logo dùng PNG gốc trong `figma_images/brand/`, chưa có SVG chính thức.

**Cấu hình local, HTTP referrer, nguồn tọa độ, bảng ảnh → phòng, migration và hướng dẫn nối MongoDB:** [docs/MAP_AND_MEDIA.md](docs/MAP_AND_MEDIA.md). OSM public tiles không có key để giới hạn referrer tại dashboard; giữ Referer hợp lệ và attribution, không tải hàng loạt/offline. Khi triển khai, dùng `Referrer-Policy: strict-origin-when-cross-origin`; chính sách chi tiết và cấu hình CSP có trong tài liệu.

## Tài khoản và phạm vi demo

| Tên đăng nhập | Mật khẩu | Vai trò | Trang mặc định |
|---|---|---|---|
| `customer123` | `123` | Khách hàng | `/` |
| `employee123` | `123` | Nhân viên | `/employee/shifts/register` |
| `admin123` | `123` | Quản trị demo | `/admin` |

Ba tài khoản trên đăng nhập được giao diện minh họa và không cần API backend. Đăng ký demo cũng chỉ lưu tài khoản CUSTOMER trong bộ nhớ ứng dụng hiện tại.

Các nghiệp vụ lịch xem, yêu thích, giữ chỗ/thanh toán, nhân viên, cọc, hợp đồng, lương và hoa hồng vẫn là ngoài phạm vi backend phòng; không coi các thao tác demo ở các màn này là dữ liệu nghiệp vụ thật. Route guard phía Angular chỉ hỗ trợ UX, API mới là nơi thực thi quyền.

## 27 frame và điều hướng

Đã triển khai **27 component frame riêng**, mỗi component có `.component.ts`, `.component.html`, `.component.css`, `.component.spec.ts` cùng thư mục. Login/Register, ba layout và Shared là các component bổ sung.

- Khách hàng: `/`, `/rooms`, `/rooms/:id`, `/favorites`, `/viewings/new?roomId=r1`, `/bookings/new?roomId=r1`, `/bookings/:id/receipt`.
- Nhân viên: `/employee/shifts/register`, `/employee/shifts`, `/employee/shifts/:id/check-in`, `/employee/shifts/:id/tasks`, `/employee/shifts/:id/check-out`, `/employee/payroll`, `/employee/deposits/new`, các màn QR/tiền mặt và giao dịch/bỏ cọc.
- Quản trị: `/admin`, `/admin/rooms`, `/admin/rooms/new`, `/admin/rooms/new/duplicate`, `/admin/rooms/:id/edit`, `/admin/rooms/:id/images`, `/admin/staff`. Dialog xác nhận, toast và dialog hoàn tất là ba component riêng trên danh sách phòng.

**Ảnh → component → bốn file → route → thao tác:** [docs/FRAME_MAP.md](docs/FRAME_MAP.md). ID booking/cọc/phân ca được tạo qua thao tác; ID không tồn tại có trạng thái lỗi rõ ràng.

## Luồng quản trị phòng minh họa

Đăng nhập bằng `admin123 / 123`, vào Quản lý Phòng & Tòa nhà. Có sẵn 12 phòng, gallery ảnh mẫu và các tòa nhà/vị trí minh họa. Có thể tạo/sửa nháp, đăng/ẩn/đăng lại, lọc, xem ảnh, tải CSV và thêm tòa nhà; thay đổi phòng lưu localStorage. Ảnh tải lên dùng preview trong phiên hiện tại. Đây là mô phỏng giao diện, không ghi dữ liệu sang MongoDB hay trang web production.

## Cấu trúc mã

```text
src/app/
  models/       Kiểu dữ liệu tài khoản, phòng, booking, cọc, ca, lương...
  data/         Tài khoản, phòng, ca và nhân sự mẫu tập trung
  services/     Nghiệp vụ, trạng thái signal, lưu trữ demo
  guards/       AuthGuard, RoleGuard
  shared/       Room card, tìm kiếm/bản đồ, icon, form error, phiếu, toast...
  layouts/      CustomerLayout, EmployeeLayout, AdminLayout
  features/     CustomerModule, EmployeeModule, AdminModule, AuthModule
  testing/      Fixture test render frame với dữ liệu hợp lệ
e2e/            Kiểm thử trình duyệt các luồng nghiệp vụ
public/assets/  Ảnh thành phần từ tài nguyên người dùng
docs/           Kiểm kê, bản đồ frame, kiểm chứng và ảnh chụp UI
```

Header/footer và điều hướng mỗi nhóm chỉ định nghĩa một lần. Form dùng Reactive Forms, bộ lọc đơn giản dùng FormsModule. Dialog có nhãn truy cập, giữ focus bàn phím và đóng bằng Escape.

## Tài nguyên

- `WEB NÂNG CAO (1)/`: 27 PNG nguyên frame, **chỉ tham chiếu bố cục**, không dùng làm nền màn hình.
- `figma_images/`: ảnh thành phần phòng, người và bản đồ.
- [docs/assets.json](docs/assets.json): ánh xạ tên gốc sang URL public; [docs/asset-inventory.json](docs/asset-inventory.json): kích thước, vị trí 27 frame. Hai tên có `/` được xuất thành thư mục con.
- Logo công ty PNG và 13 logo trường đã có; chưa có SVG công ty chính thức/font riêng, PowerPoint, Figma link/file, QR thanh toán hay API backend. Leaflet dùng tile OSM thật; vị trí trường có nguồn, vị trí tòa nhà vẫn là minh họa. Xem [kiểm kê và giới hạn dữ liệu](docs/MAP_AND_MEDIA.md).

## Dữ liệu và phần mô phỏng

`DemoStore` lưu nghiệp vụ bằng localStorage, key `ihouzz-demo-v1`. Có thể đặt lại qua `/admin/reports` sau xác nhận. Ảnh phòng giới hạn 8 ảnh, 500 KB/ảnh; ảnh check-in 2 MB. Khi storage đầy, UI thông báo thay đổi chỉ được giữ trong phiên hiện tại.

- Khóa phòng và suất ca chỉ hoạt động trong dữ liệu trình duyệt, **chưa đồng bộ đa thiết bị/đa người dùng**.
- Chấm công dùng ảnh mẫu/ảnh tải lên, chưa có camera/GPS xác thực. Cho phép mô phỏng ca tương lai để kiểm tra luồng.
- Lịch demo cố định ở tuần 12–18/10/2026 để mã ca và lịch sử không đổi ý nghĩa khi tải lại vào tuần khác; tạo đợt mới thực tế cần API ca làm.
- Payment là `CONFIRMED_DEMO`; không có tiền thật, tài khoản nhận tiền hay kết nối ngân hàng.
- PDF là **In / Lưu PDF của trình duyệt**, không phải chứng từ ký số do server phát hành.
- Lương, tỷ lệ hoa hồng, mức phạt là chính sách mẫu. Doanh thu là phí môi giới chủ phòng trả, tách khỏi tiền cọc khách hàng.
- Nhân sự & Ca trực tại `/admin/staff` đã có danh sách, thêm/sửa/hồ sơ/thành công, lịch tuần, đăng ký trực tiếp, công việc chung/chuyển việc, chấm công mô phỏng và KPI. Module dùng kho riêng `ihouzz-staff-demo-v1`, có nút đặt lại; không tự tạo tài khoản đăng nhập cho hồ sơ mới. Xem [hướng dẫn Nhân sự & Ca trực](docs/STAFF_DEMO.md).

## Nhân sự & Ca trực — desktop demo

Chạy `npm.cmd start`, mở `http://127.0.0.1:4200/admin/staff`, đăng nhập `admin123 / 123`. Không cần backend hoặc MongoDB cho module này. Tạo đợt mới trong tab Lịch làm việc & Ca trực rồi chọn nhân viên để mô phỏng nhận chỗ; ca hợp lệ nhận ngay, không có bước duyệt. Các tab hồ sơ, công việc/chấm công và hiệu suất dùng chung dữ liệu.

Thay đổi được lưu trong localStorage của origin hiện tại; không đồng bộ nhiều tab/thiết bị. Nếu không ghi được storage, thao tác báo lỗi và không hiện toast thành công. Reset nhân sự không xóa dữ liệu phòng/booking. Kho và luồng employee cũ được giữ độc lập. File chính, công thức KPI, quy tắc ca, kiểm thử và ảnh chụp: [docs/STAFF_DEMO.md](docs/STAFF_DEMO.md).

Các service tách theo nghiệp vụ để thay persistence bằng HttpClient. API cần bổ sung: [docs/API_PLAN.md](docs/API_PLAN.md). Kết quả kiểm thử: [docs/VALIDATION.md](docs/VALIDATION.md).
