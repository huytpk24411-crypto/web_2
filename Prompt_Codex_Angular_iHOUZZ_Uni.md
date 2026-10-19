# Prompt cho Codex trong Visual Studio Code: dựng giao diện iHOUZZ Uni bằng Angular

Sao chép toàn bộ nội dung từ phần **BẮT ĐẦU PROMPT** đến **KẾT THÚC PROMPT** vào Codex khi đã mở thư mục dự án Angular và đặt bộ ảnh thiết kế vào thư mục mà agent có thể đọc.

---

## BẮT ĐẦU PROMPT

Bạn là lập trình viên Angular đang làm việc trực tiếp trong workspace VS Code này. Hãy **triển khai mã chạy được**, không chỉ giải thích hoặc đưa kế hoạch, để biến các ảnh chụp frame Figma của iHOUZZ Uni thành ứng dụng Angular có điều hướng và tương tác. Đây là web tìm/thuê phòng, quản lý giao dịch môi giới, ca làm nhân viên và quản trị. **Mỗi frame ảnh phải tương ứng đúng một component riêng**, kể cả frame là dialog, thông báo, hoặc trạng thái lỗi của một màn hình khác. Giao diện, nhãn và dữ liệu mẫu dùng tiếng Việt; tên file/class có thể dùng tiếng Anh nhất quán.

### 1. Khảo sát trước khi sửa mã

1. Đọc `package.json`, `angular.json`, `src/app`, routing và cấu trúc thư mục hiện có; xác định phiên bản Angular, dự án dùng `NgModule` hay standalone, CSS framework và cách khai báo assets. **Giữ kiến trúc hiện tại nếu đã có ứng dụng**, không tạo dự án Angular mới hoặc xóa mã đang có. Nếu khởi tạo từ thư mục trống, dùng Angular CLI với routing, CSS, không SSR; chọn kiến trúc `NgModule` như tài liệu học (`ng new ihouzz-uni --no-standalone --routing --ssr=false` nếu CLI tương thích).
2. Tìm bộ ảnh frame trong workspace, ví dụ `assets/`, `src/assets/`, `public/`, `design/`, `upload/`, hoặc `WEB NÂNG CAO (1).zip`; kiểm kê tên, kích thước và phân nhóm. Nếu có Figma link/file được cấp quyền trong workspace, dùng để đối chiếu thêm. Đọc PowerPoint được cung cấp, nếu có, đặc biệt các chương **I–V và VI–VIII**. Nội dung đã học gồm component/module, interpolation, property/event/two-way binding, directives, `@Input`/`@Output`, services và DI, `HttpClient`, route/parameter/query, nested routes, lazy loading, guards, template-driven và reactive forms, REST API Express/MongoDB, cookie/session. Áp dụng đúng vào nghiệp vụ; không ép dùng tất cả ở mọi màn hình.
3. Lập bảng ngắn **ảnh frame → đúng một component riêng → route hoặc trạng thái UI → thao tác dẫn vào/ra**. Mỗi component frame có đủ bốn file riêng: `ten-frame.component.ts`, `ten-frame.component.html`, `ten-frame.component.css`, `ten-frame.component.spec.ts`. Không viết template/style inline trong TypeScript; không gộp hai frame vào cùng một component; không dựng một trang khổng lồ rồi chỉ đổi trạng thái bằng nhiều `*ngIf` thay cho các component frame. Các frame thuộc cùng trang có thể dùng lại layout, form, dialog nền, component con và service. Trình tự ưu tiên là ảnh Figma, luồng nghiệp vụ bên dưới, rồi mới đến phỏng đoán.
4. Ảnh PNG chụp toàn bộ frame là **tài liệu tham chiếu bố cục**, không đặt nguyên ảnh làm nền của màn hình. Dựng header, văn bản, nút, form, danh sách, bảng, dialog bằng HTML/CSS/Angular thực. Kiểm tra assets ảnh phòng/logo/icon riêng trong workspace; dùng đúng tài nguyên hiện có. Nếu chỉ có ảnh chụp frame mà thiếu ảnh gốc, dùng hình đại diện/placeholder rõ ràng trong chế độ demo và ghi lại assets còn thiếu; không tạo URL ảnh giả hoặc phụ thuộc nguồn ảnh ngẫu nhiên trên mạng.

### 2. Bản đồ 27 frame bắt buộc

Tên ảnh có thể ở trong ZIP hoặc thư mục đã giải nén. Đối chiếu tên thực tế, kể cả dấu tiếng Việt. **27 hàng = 27 component frame khác nhau, mỗi component có đủ bốn file `.ts`, `.html`, `.css`, `.spec.ts` riêng.** Các dialog và bước xác nhận có thể xuất hiện trên cùng một URL dưới dạng component con mở theo thao tác, hoặc một child route. Các trang login/register và các layout/shared component, nếu chưa có frame riêng, được tạo thêm ngoài 27 component này.

| # | Frame theo tên ảnh | Component gợi ý | Route/trạng thái gợi ý |
|---|---|---|---|
| 01 | `2. Trong ca trực & To-do List (iHOUZZ Uni).png` | `EmployeeShiftTasksFrameComponent` | `/employee/shifts/:id/tasks` |
| 02 | `1. Chấm công - Check-in đầu ca (iHOUZZ Uni).png` | `EmployeeCheckInFrameComponent` | `/employee/shifts/:id/check-in` |
| 03 | `3. Check-out thành công & Bàn giao ca (iHOUZZ Uni).png` | `EmployeeCheckOutFrameComponent` | `/employee/shifts/:id/check-out` |
| 04 | `Bảng lương & Hoa hồng giao dịch - iHOUZZ Uni.png` | `EmployeePayrollFrameComponent` | `/employee/payroll` |
| 05 | `Báo cọc & Hồ sơ đặt cọc phòng - iHOUZZ Uni.png` | `EmployeeDepositDossierFrameComponent` | `/employee/deposits/new` |
| 06 | `Xác nhận cọc VietQR & Xuất phiếu cọc PDF - iHOUZZ Uni.png` | `EmployeeQrDepositReceiptFrameComponent` | `/employee/deposits/:id/qr-receipt` |
| 07 | `Xác nhận cọc Tiền mặt & Xuất phiếu thu cọc PDF - iHOUZZ Uni.png` | `EmployeeCashDepositReceiptFrameComponent` | `/employee/deposits/:id/cash-receipt` |
| 08 | `Đăng ký ca làm việc tuần mới - iHOUZZ Uni.png` | `EmployeeShiftRegistrationFrameComponent` | `/employee/shifts/register` |
| 09 | `Giao dịch trực tiếp & Xử lý cọc - iHOUZZ Uni.png` | `EmployeeDirectDealFrameComponent` | `/employee/deals/:id` |
| 10 | `Giao dịch trực tiếp - Xử lý Khách bỏ cọc & Xuất biên bản phạt - iHOUZZ Uni.png` | `EmployeeForfeitureFrameComponent` | `/employee/deals/:id/forfeiture` |
| 11 | `Trang chủ iHOUZZ Uni - Tìm phòng & Đăng nhập/Đăng ký (Desktop).png` | `CustomerHomeFrameComponent` | `/` công khai; login/register là component riêng |
| 12 | `Tất cả các phòng.png` | `CustomerRoomListFrameComponent` | `/rooms` |
| 13 | `PHÒNG YÊU THÍCH.png` | `CustomerFavoritesFrameComponent` | `/favorites` |
| 14 | `Chi tiết phòng & Đặt lịch/Giữ chỗ - iHOUZZ Uni (Desktop).png` | `CustomerRoomDetailFrameComponent` | `/rooms/:id` |
| 15 | `Báo Cọc & Giữ Chỗ Phòng Trực Tuyến - iHOUZZ Uni.png` | `CustomerHoldPaymentFrameComponent` | `/bookings/new?roomId=...` |
| 16 | `Xuất Phiếu Cọc & Biên Lai Điện Tử PDF - iHOUZZ Uni (Đồng bộ Báo Cọc).png` | `CustomerBookingReceiptFrameComponent` | `/bookings/:id/receipt` |
| 17 | `Đặt Lịch Xem Phòng - iHOUZZ Uni (Desktop).png` | `CustomerViewingScheduleFrameComponent` | `/viewings/new?roomId=...` |
| 18 | `Tổng quan Quản trị (Admin Portal).png` | `AdminDashboardFrameComponent` | `/admin` |
| 19 | `Thêm Phòng Mới (Báo Lỗi Trùng Dữ Liệu) - iHOUZZ Uni Admin.png` | `AdminAddRoomDuplicateFrameComponent` | `/admin/rooms/new` trạng thái trùng |
| 20 | `Chỉnh sửa Thông tin Phòng - iHOUZZ Uni Admin.png` | `AdminEditRoomFrameComponent` | `/admin/rooms/:id/edit` |
| 21 | `Danh sách Phòng - iHOUZZ Uni Admin.png` | `AdminRoomListFrameComponent` | `/admin/rooms` |
| 22 | `Xác nhận Xóa hoặc Ẩn Phòng & Toast - iHOUZZ Uni Admin.png` | `AdminRoomDeleteConfirmFrameComponent` | dialog trên `/admin/rooms` |
| 23 | `Xác nhận Xóa hoặc Ẩn Phòng & Toast - iHOUZZ Uni Admin 2.png` | `AdminRoomDeleteToastFrameComponent` | trạng thái sau thao tác trên `/admin/rooms` |
| 24 | `Quản lý Hình ảnh Phòng - iHOUZZ Uni Admin.png` | `AdminRoomImagesFrameComponent` | `/admin/rooms/:id/images` |
| 25 | `Hộp thoại Kết thúc Thao tác - iHOUZZ Uni Admin.png` | `AdminActionCompleteFrameComponent` | dialog/thông báo kết quả trên admin |
| 26 | `Danh sách nhân sự.png` | `AdminStaffListFrameComponent` | `/admin/staff` |
| 27 | `Thêm phòng mới.png` | `AdminAddRoomFrameComponent` | `/admin/rooms/new` trạng thái bình thường |

Với #19/#27, tạo **hai component frame riêng** cùng dùng lại form thêm phòng và state/service; với #22/#23/#25, tạo **ba component frame riêng** thể hiện dialog hoặc toast trên trang nền, có thao tác mở/đóng thật. Tránh tạo 27 bản sao layout. Nếu thứ tự/chi tiết ảnh khác so với gợi ý route, điều chỉnh route mà vẫn giữ từng frame có component và giải thích sự khác biệt trong báo cáo.

### 3. Kiến trúc Angular

- Nếu dự án đang dùng `NgModule`, tổ chức `AppRoutingModule`, `SharedModule`, các module tính năng `CustomerModule`, `EmployeeModule`, `AdminModule`, `AuthModule`; lazy load module phù hợp. Nếu dự án đã dùng standalone, giữ standalone và dùng cơ chế route tương đương. Không trộn hai kiểu tùy tiện. Tách `models/`, `services/`, `guards/`, `shared/`, `features/` rõ ràng.
- Với **mỗi một trong 27 frame**, đặt bốn file của frame vào một thư mục cùng tên, ví dụ `src/app/features/customer/home-frame/customer-home-frame.component.ts`, `.html`, `.css`, `.spec.ts`. `@Component` phải trỏ `templateUrl` tới file HTML và `styleUrl`/`styleUrls` tới file CSS theo phiên bản Angular hiện có. Có thể dùng `ng generate component ... --skip-tests=false`, nhưng kiểm tra lại và tạo file còn thiếu nếu CLI hiện tại sinh tên khác. File `.spec.ts` của mỗi component phải kiểm tra được component khởi tạo/render với mock service cần thiết; thêm kiểm tra hành vi có ý nghĩa cho các component quan trọng. Chạy test phù hợp với cấu hình dự án.
- Tạo **CustomerLayoutComponent**, **EmployeeLayoutComponent**, **AdminLayoutComponent** với `<router-outlet>`. Header và footer khách hàng chỉ định nghĩa một lần và tái sử dụng ở tất cả trang customer. Header/navigation và sidebar/footer ở trang nhân viên và admin tái sử dụng cho từng nhóm theo đúng ảnh; phần chung giữa employee/admin dùng shared component khi thực sự giống nhau. Giữ menu active theo route, các link hoạt động bằng `routerLink` hoặc `Router.navigate`, không dùng anchor rỗng.
- Tách những khối lặp: room card, filter/search, image gallery, status badge, currency/date display, form field, progress steps, modal, notification toast, payroll summary. Đặt nội dung động qua `@Input`/`@Output` khi cần; giữ trạng thái dùng service, không đồng bộ bằng truy cập DOM thủ công.
- Models/types tối thiểu: `Account`, `Role`, `Customer`, `Employee`, `Property`, `Room`, `Favorite`, `Viewing`, `BookingHold`, `DepositDossier`, `Payment`, `Receipt`, `ShiftPeriod`, `Shift`, `EmployeeShift`, `Task`, `Attendance`, `PayrollPeriod`, `PayrollSlip`, `BrokerageDeal`, `RevenueAllocation`, `Commission`. Dùng ID ổn định; tách số tiền (`number`) và định dạng hiển thị VND. Không coi con số trên screenshot là dữ liệu thật.
- Service tách theo nghiệp vụ: `RoomService`, `FavoriteService`, `ViewingService`, `BookingService`, `DepositService`, `AuthService`, `ShiftService`, `AttendanceService`, `TaskService`, `PayrollService`, `AdminRoomService`. Nếu workspace có API, dùng `HttpClient` và cấu hình API/proxy hiện hữu. Nếu chưa có backend, tạo **mock data có ID nhất quán** tại một chỗ và lưu các thay đổi cần demo bằng service cùng `localStorage`/`sessionStorage` phù hợp; gắn nhãn trạng thái mô phỏng. Chuẩn bị interface service để sau thay bằng REST API, không rải mảng mẫu ở 27 component.
- Xác thực **tạm thời bằng username/mật khẩu mẫu theo mục 3.1 bên dưới**. Vai trò gắn với **tài khoản**: `CUSTOMER`, `EMPLOYEE`, `ADMIN`; `ADMIN` cũng là nhân viên và được vào khu employee. Dùng `AuthGuard`/`RoleGuard` để bảo vệ route và chuyển tới login kèm `returnUrl`; guard phía client chỉ phục vụ UI, kiểm tra quyền thực phải ở backend. Không lưu mật khẩu gốc trong browser hoặc log. Ghi rõ đăng nhập là demo và không giả vờ xác thực thật.
- Form: chọn Reactive Forms cho đăng nhập, đăng ký, đặt lịch, giữ chỗ, hồ sơ cọc, thêm/sửa phòng; có bắt buộc, định dạng số điện thoại, giá trị tiền dương, thời gian hợp lệ, thông báo lỗi sát trường nhập. Có thể dùng `[(ngModel)]` cho bộ lọc UI đơn giản, đúng `FormsModule`; không dùng `ngModel` và `formControlName` trên cùng control. Dùng binding và directives Angular thay cho thao tác DOM trực tiếp.

### 3.1. Tài khoản demo, khách vãng lai và điều hướng sau đăng nhập

Hiện **chưa có backend hoặc MongoDB**. Dùng một `AuthService` có dữ liệu mẫu tập trung, đúng ba tài khoản sau (username là chuỗi dùng để đăng nhập, không bắt buộc định dạng số điện thoại cho ba tài khoản mẫu):

| Username | Mật khẩu | Vai trò tài khoản | Nơi đến sau đăng nhập |
|---|---|---|---|
| `customer123` | `123` | `CUSTOMER` | Trang customer hoặc `returnUrl` hợp lệ |
| `employee123` | `123` | `EMPLOYEE` | `/employee/shifts/register` hoặc màn nhân viên phù hợp |
| `admin123` | `123` | `ADMIN` và quyền nhân viên | `/admin` |

- Khởi đầu mọi lượt truy cập ở trạng thái **GUEST** nếu chưa đăng nhập: khách vãng lai mở được `/`, `/rooms`, `/rooms/:id`, tìm kiếm/lọc, xem ảnh, giá, địa chỉ và thông tin công khai. **Không ép đăng nhập ngay khi vào web.** Header hiện `Đăng nhập`/`Đăng ký` khi là guest; hiện tên/vai trò/đăng xuất khi đã đăng nhập. Nếu nhập URL trang nhân viên hoặc admin khi chưa có quyền, chuyển tới login hoặc trang không có quyền phù hợp.
- Yêu thích, lịch xem phòng, booking/giữ chỗ, thanh toán và xem dữ liệu cá nhân yêu cầu tài khoản khách hàng. Khi guest nhấn hành động như `Thêm yêu thích`, `Đặt lịch`, `Giữ chỗ/Booking`, mở/truy cập **trang đăng ký khách hàng** với lựa chọn chuyển sang trang đăng nhập nếu đã có tài khoản. Lưu đường dẫn và ngữ cảnh thao tác (`returnUrl`, `roomId`, action) để sau đăng ký hoặc đăng nhập quay về đúng phòng/thao tác cần làm; không tự ý thực hiện thanh toán khi vừa đăng nhập. `/favorites` và các route cá nhân khác phải guard đúng cách; nếu vào trực tiếp với guest cũng dẫn tới đăng ký/đăng nhập.
- Tạo thêm `LoginComponent`, `RegisterComponent` (mỗi component có đủ `.ts`, `.html`, `.css`, `.spec.ts`) và `AuthService`; có thể hiển thị form trong modal theo frame trang chủ và có route `/login`, `/register` để truy cập trực tiếp. Form login có nhãn **Tên đăng nhập** và **Mật khẩu**; không ép username demo là số điện thoại. Khi đăng ký khách hàng mới, form có số điện thoại, tên, mật khẩu và xác nhận mật khẩu; tạo **vai trò CUSTOMER**; nếu chưa có backend, giữ tài khoản đăng ký ở bộ nhớ ứng dụng cho luồng demo trong phiên đang mở, đăng nhập ngay và thông báo rằng tài khoản tạo thử có thể mất khi tải lại trang. Không tạo tài khoản EMPLOYEE/ADMIN qua form đăng ký công khai. Không ghi mật khẩu mới ra `localStorage`, `sessionStorage` hay console. Có thể lưu thông tin phiên không nhạy cảm (username, vai trò) trong `sessionStorage` để điều hướng demo, và xóa khi đăng xuất.
- Khi đăng nhập thành công: CUSTOMER tới `returnUrl` công khai/hợp lệ hoặc trang customer; EMPLOYEE tới khu nhân viên; ADMIN tới `/admin` theo mặc định và vẫn truy cập được `/employee/...`. `returnUrl` phải là route nội bộ hợp lệ và người dùng có quyền; không dùng redirect tới URL ngoài. Đăng xuất xóa phiên demo và đưa về trang chủ công khai. Sai username/mật khẩu phải có thông báo lỗi, không chuyển trang. Tài khoản demo/password `123` chỉ dùng cho bài tập giao diện, **không xem đây là bảo mật thực tế**.

### 4. Hành vi và đường đi bắt buộc

**Khách hàng:** Guest được xem trang chủ → tìm/lọc và xem danh sách phòng → xem chi tiết phòng. Các nút yêu thích, đặt lịch xem và giữ chỗ yêu cầu đăng ký/đăng nhập theo mục 3.1; sau đăng nhập, nút toggle yêu thích và số lượng cập nhật nhất quán. Trên trang chi tiết hiển thị vị trí, ảnh, giá, tình trạng và mục trường học gần đó; nếu thiếu API bản đồ, dựng vùng bản đồ demo gọn, có mô tả và danh sách trường/phòng liên quan, không giả tọa độ như dữ liệu thật. Lịch xem phòng có người liên hệ, thời gian, có thể chọn **nhiều phòng cùng một lịch**. Giữ chỗ gắn một khách và một phòng, khóa 48 giờ **sau khi thanh toán giữ chỗ được xác nhận**; UI hiển thị mốc hết hạn và trạng thái. Giữ chỗ và cọc là hai nghiệp vụ: cọc có thể trực tiếp hoặc từ booking; nếu cọc từ booking thì tiền giữ chỗ đã thanh toán được khấu trừ đúng một lần, số tiền còn phải thu = tổng tiền cọc − phần giữ chỗ đã ghi nhận. Nếu chỉ có mock, trình bày đây là tính toán demo và chừa API xác nhận giao dịch/kiểm tra phòng trống trên server.

**Nhân viên:** Đăng ký ca của đợt/tuần theo số chỗ tối đa, ai đăng ký trước nhận chỗ, không có bước quản lý duyệt. UI cập nhật số chỗ còn, ngăn chọn trùng ca hoặc quá giới hạn; đồng thời ghi chú việc khóa suất và chống đặt trùng thực tế phải do server xử lý nguyên tử. Mỗi ca có thể nhiều nhân viên. Màn check-in → việc trong ca → check-out/bàn giao liên kết theo cùng `employeeShiftId`; chấm công và ảnh minh chứng gắn đúng lần phân ca của nhân viên. Công việc có thể do nhiều người phụ trách và chuyển sang ca sau nếu chưa xong; trạng thái chung và trạng thái cá nhân phải tách khi hiển thị. Màn giao dịch trực tiếp/hồ sơ cọc dẫn tới xác nhận VietQR hoặc tiền mặt rồi xem phiếu/biên lai; tình huống khách bỏ cọc có màn xử lý riêng. Trang lương hiển thị kỳ, lương cơ bản, doanh thu môi giới được phân bổ, tỷ lệ/tiền hoa hồng, thưởng, khấu trừ chấm công và thực lĩnh; thu nhập công ty là **phí môi giới chủ phòng trả**, không phải toàn bộ khoản cọc của khách. Khoản hoa hồng theo mức doanh thu tháng chỉ là dữ liệu mẫu/cấu hình nếu chưa có bảng chính sách cụ thể.

**Admin:** Dashboard → danh sách phòng → thêm phòng → sửa, quản lý ảnh, ẩn/xóa với dialog xác nhận và toast đúng ảnh; kiểm tra mã/phòng trùng với dữ liệu hiện có. Ưu tiên **ẩn** phòng đang có lịch sử giao dịch thay vì xóa cứng; chỉ hiển thị thao tác xóa nếu điều kiện nghiệp vụ cho phép. Dashboard liên kết được tới quản lý phòng/nhân sự. Quyền thêm/sửa/ẩn phòng chỉ dành cho `ADMIN`. Admin được truy cập chức năng nhân viên do cùng là nhân viên có quyền cao hơn.

**Thanh toán và chứng từ:** Cho phép đi từ booking hoặc hồ sơ cọc đến màn thanh toán tương ứng; mỗi giao dịch thanh toán có số tiền, phương thức, trạng thái. Biên lai hiển thị tham chiếu giao dịch đã xác nhận. Nếu không có tích hợp cổng thanh toán/QR và server tạo PDF, chỉ dựng giao diện mô phỏng và bản xem trước/in từ trình duyệt; **không hiển thị “đã thu tiền” hoặc biên lai thật khi chưa có xác nhận**. Đặt label “Demo/Bản xem trước” rõ trên chứng từ mô phỏng.

### 5. Chất lượng, cách triển khai và bàn giao

1. Dựng UI sát frame về grid, kích thước, màu, typography, spacing và thứ tự thông tin. Ưu tiên viewport desktop giống ảnh (~1280–1350px) rồi hỗ trợ tablet/mobile để không tràn ngang; các màn admin rộng có thể dùng bảng cuộn ngang có kiểm soát. Viết CSS dùng chung và CSS riêng từng màn; không nhét toàn bộ UI vào `app.component.html`.
2. Làm tính năng theo các cụm có thể chạy: (a) shared layouts + routes, (b) customer, (c) employee, (d) admin; sau mỗi cụm chạy lệnh build/serve tương ứng với dự án và sửa lỗi thực tế. Có loading/empty/error state tối thiểu, label cho input, alt cho ảnh và điều hướng bằng bàn phím cho dialog.
3. Ghi `README` hướng dẫn chạy, vị trí ảnh tham chiếu/asset, những màn/route đã hoàn thành, **ba cặp tài khoản demo nêu trên và quy tắc guest**, danh sách chức năng mô phỏng do thiếu backend và các API cần bổ sung. Xuất bảng kiểm **27/27 frame → 27 component riêng → bốn file của từng component → route/state → trạng thái hoàn thành**, kèm các ảnh/tài nguyên còn thiếu. Nếu có vấn đề quan trọng không thể suy ra từ ảnh hoặc workspace, hỏi tôi câu hỏi cụ thể, nhưng hoàn thành trước các phần độc lập.
4. Không tự tuyên bố hệ thống đã có thanh toán thật, khóa phòng 48 giờ đồng bộ, xác thực thật hay tính lương chính thức khi chưa có backend. Không tự ý đổi quy trình đã nêu. Sau khi triển khai, báo các file thay đổi, câu lệnh build/test và kết quả; kiểm tra đường đi **guest xem phòng → nhấn yêu thích → đăng ký/đăng nhập → trở về đúng phòng**, customer booking/đặt lịch, employee, và admin.

Hãy bắt đầu bằng kiểm kê dự án/ảnh và lập bản đồ frame trong báo cáo ngắn, sau đó **tiếp tục sửa mã cho đến khi ứng dụng chạy và các màn hình liên kết được**.

## KẾT THÚC PROMPT
