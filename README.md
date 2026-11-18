# iHOUZZ Uni

Ba ứng dụng Angular riêng cho khách hàng, nhân viên và quản trị; backend Express dùng MongoDB native driver. Cấu trúc giữ NgModule, component TS/HTML/CSS, DTO trong `classes`, HttpClient/Observable trong `services`, và các module route CommonJS theo bài thực hành LearnAngular.

## Chạy sau khi clone

1. Cài Node.js **24.15 trở lên trong nhánh 24.x** (hoặc 22.22.3+ trong nhánh 22.x, hoặc 26+) và MongoDB Community Server (phiên bản đã kiểm thử: **9.0.4**). Bật dịch vụ MongoDB ở `127.0.0.1:27017`.
2. Tại thư mục repository chạy `npm run setup`. Lệnh này cài bằng lockfile cho cả năm thư mục, tạo `.env` riêng trên máy, chuẩn bị ảnh minh họa và nạp dữ liệu nếu database còn trống. Database đã có dữ liệu được giữ nguyên.
3. Chạy `npm start`. Mở customer http://127.0.0.1:4200, employee http://127.0.0.1:4201, admin http://127.0.0.1:4202. Ctrl+C dừng các tiến trình do lệnh này tạo. Nếu cổng đang được dùng, chương trình báo lỗi và giữ nguyên tiến trình đó.

Tài khoản trong bản dữ liệu đã làm sạch:

| Cổng | Số điện thoại | Tên đăng nhập |
|---|---|---|
| Admin | 0900000001 | demo_admin_01 |
| Employee | 0900000002 | demo_employee_01 |
| Customer | 0900000017 | demo_customer_01 |

Mật khẩu dùng chung cho bản dữ liệu khôi phục được sinh ngẫu nhiên **trên máy cài**, xem `DEMO_PASSWORD` trong `my-server-mongodb/.env`. Có thể đặt biến này trước khi setup để chọn mật khẩu riêng (8–128 ký tự). Database cũ giữ nguyên mật khẩu cũ. Không đưa `.env` lên GitHub.

## Cấu hình và dữ liệu

- Khi phát sinh doanh thu đầu tiên của một tháng chưa có kỳ lương, backend tự tạo kỳ `OPEN` theo tháng ghi nhận ở múi giờ Việt Nam, rồi liên kết doanh thu công ty và nhân viên vào kỳ đó. Kỳ có sẵn được tái sử dụng; kỳ `CLOSED` hoặc `PAID` không tự mở lại. Vì vậy hồ sơ cọc mới vẫn bị chặn nếu tháng hiện tại đã chốt, theo quy tắc đã thống nhất.
- Cả ba giao diện có bố cục điện thoại: form xếp một cột, menu admin thu gọn, bộ lọc và nút thao tác xuống hàng; bảng quản trị/lịch ca nhiều cột cuộn ngang trong khung riêng. Bản customer giữ bản đồ và tour 360; các bản sao component không dùng ở admin/employee đã được loại bỏ.

- `my-server-mongodb/.env.example`: mẫu MongoDB, cổng, phiên đăng nhập, payOS, SMS. Có thể sửa `MONGODB_URI`, `MONGODB_DB`, các cổng và `CUSTOMER_APP_URL` trong `.env`.
- API MongoDB mặc định 3002; upload và danh mục tiện ích mặc định 3000. Các ứng dụng dùng proxy cùng nguồn và header cổng riêng; đăng nhập ba vai trò không ghi đè cookie của nhau.
- `my-server-mongodb/data/manifest.json` mô tả bản chụp dữ liệu hiện tại đã làm sạch: 47 collection, 8.140 bản ghi, checksum và index. Giữ ID, liên kết, số tiền, trạng thái và lịch sử nghiệp vụ; thông tin cá nhân, mật khẩu gốc, ảnh định danh và khóa thanh toán đã được thay hoặc loại bỏ. Ảnh xác minh demo có nhãn placeholder, không phải giấy tờ thật.
- `npm run data:check` kiểm tra khóa và liên kết của database được cấu hình, chỉ đọc.
- `npm run data:restore -- --database TEN_DB` khôi phục nếu database trống. `--replace` là thao tác thay dữ liệu có chủ đích; công cụ sao lưu riêng trước khi thay và không tự thực hiện khi setup. Không dùng `--replace` cho database đang vận hành khi chưa kiểm tra bản sao lưu.
- Để thanh toán ngân hàng thật, cấu hình **khóa payOS của chính bạn**, `CUSTOMER_APP_URL` và webhook công khai `/payos/webhook` theo tài khoản merchant. Repository không chứa khóa dùng chung. Tiền giữ chỗ hiện là **10.000 đ để thử**, vẫn là tiền thật nếu dùng payOS thật. SMS chỉ gửi được sau khi có nhà cung cấp, tên gửi và mẫu OTP đã duyệt; chưa cấu hình thì hệ thống báo chưa sẵn sàng.

## Thanh toán khi chạy riêng trên máy khác

Sau khi chạy `npm run setup`, điền `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` trong `my-server-mongodb/.env`. Lấy ba giá trị từ kênh thanh toán payOS dùng cho môi trường đó. Khởi động lại API sau khi sửa `.env`. Chạy `npm run payments:check` để kiểm tra biến nào còn thiếu. Lệnh chỉ in trạng thái có hoặc thiếu giá trị.

`CUSTOMER_APP_URL` là địa chỉ giao diện khách hàng của môi trường đó. Khi chạy local, hệ thống giữ đúng hostname và cổng của trình duyệt lúc tạo thanh toán, kể cả `localhost` hoặc `127.0.0.1`, để quay về cùng phiên đăng nhập. Link payOS đã tạo được tái sử dụng cùng đơn hàng và giữ địa chỉ quay về đã lưu lúc tạo.

Webhook của kênh payOS phải tới backend sử dụng database đã tạo đơn. Các máy truy cập website online cùng dùng một backend/database. Các bản local chạy database độc lập nên dùng kênh thử riêng để webhook cập nhật đúng nơi. Mã đơn payOS mới dùng thời gian và phần ngẫu nhiên để tránh tái sử dụng mã từ bộ đếm trong bản dữ liệu sao chép.

Chế độ local mặc định lưu session trong bộ nhớ API. Khởi động lại API local sẽ yêu cầu đăng nhập lại. Chế độ production lưu session trong MongoDB và dùng cookie HTTPS. Trạng thái thanh toán và biên lai lưu trong MongoDB. Trình duyệt xác nhận tiền qua webhook hoặc tra cứu payOS đã kiểm tra phía backend.

## Triển khai trên Render

Môi trường đang dùng tách frontend Vercel, backend Render, ảnh Supabase và database Atlas. Trên Vercel dùng `npm run build:vercel`, `BACKEND_URL` trỏ tới Render và `PUBLIC_ASSET_BASE_URL` trỏ bucket public. Trên Render dùng build `npm run build:backend`, start `npm run start:backend`, health check `/healthz`; đặt `CUSTOMER_APP_URL` bằng URL Vercel. Ảnh mới dùng `MEDIA_STORAGE=supabase` cùng cấu hình trong `.env.example`; khóa Supabase chỉ đặt ở backend. Giấy tờ dùng bucket private và được kiểm tra quyền trước khi cấp URL tải.

Cách triển khai gộp cả ba giao diện trên Render dưới đây vẫn được hỗ trợ cho môi trường riêng:

Tạo Web Service từ repository, chọn runtime Node và gói phù hợp. Cấu hình build `npm run build:deploy`, start `npm run start:deploy`, health check `/healthz`. Giữ Root Directory là thư mục gốc repository. Build cài dependency bằng lockfile và biên dịch riêng cả ba ứng dụng Angular.

Thiết lập `NODE_VERSION=24.20.0`, `NODE_ENV=production`, `MONGODB_URI`, `MONGODB_DB` và `SESSION_SECRET` ngẫu nhiên ít nhất 32 ký tự. Backend tự lấy URL giao diện từ `RENDER_EXTERNAL_URL` do Render cấp. Với hosting khác, đặt `CUSTOMER_APP_URL` bằng URL HTTPS của website và `PORT` bằng cổng của hosting. Atlas cần cho phép các outbound IP của dịch vụ kết nối.

Các giao diện chạy tại `/` cho customer, `/staff/` cho employee và `/management/` cho admin. Ba thư mục `my-app-*` được build và phục vụ riêng. Các API dùng chung MongoDB. Phiên đăng nhập lưu trong collection `Session`, ảnh mới tải lên lưu trong GridFS `Upload.files` và `Upload.chunks`. API tải giấy tờ yêu cầu đăng nhập và kiểm tra quyền. Gói Atlas Free dùng chung giới hạn dung lượng cho dữ liệu và ảnh.

Tiếp tục cấu hình ba khóa payOS trong biến môi trường Render và trỏ webhook tới `https://TEN_WEBSITE/payos/webhook` để bật thanh toán online. Gói Render Free có thể ngủ sau thời gian không có truy cập, vì vậy lần mở lại có thể chờ dịch vụ khởi động.

## Thư mục

```text
my-app-customer/             Angular customer
my-app-employee/             Angular employee
my-app-admin/                Angular admin
my-server/                   Upload ảnh, static media, tiện ích
my-server-mongodb/
  index.js                   Điểm chạy
  app.js                     Middleware, service và route assembly
  config/                    Kết nối MongoDB
  middleware/                Phiên theo cổng
  routes/                    API theo nghiệp vụ
  services/                  Quy tắc nghiệp vụ, recovery journal
  models/relations.js        Danh mục liên kết logic
  scripts/                   Kiểm tra và khôi phục dữ liệu
  data/                      Dữ liệu đã làm sạch và manifest
scripts/                     Setup, start, build, test, proxy dùng chung
```

`npm run build` biên dịch production cả ba app. `npm test` chạy unit test ba app và backend. Có thể chạy `npm start` riêng trong một app; proxy sẽ bật backend local khi thiếu. Khi chạy đồng thời nhiều cổng, dùng lệnh ở thư mục gốc để quản lý tiến trình thống nhất.

Backend hiện thiết kế cho **một tiến trình API** với hàng đợi và journal bền vững trong MongoDB. Production lưu session trong MongoDB; ảnh tải lên dùng Supabase khi MEDIA_STORAGE=supabase, hoặc GridFS khi chọn MEDIA_STORAGE=gridfs. Các ảnh tải lên khi chạy server local riêng nằm trên ổ đĩa local, cần sao lưu cùng database. Các tài liệu bàn giao tổng hợp MD, draw.io và Word được xuất riêng ngoài repository theo yêu cầu.
