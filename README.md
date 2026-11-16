# iHOUZZ Uni

Ba ứng dụng Angular riêng cho khách hàng, nhân viên và quản trị; backend Express dùng MongoDB native driver. Cấu trúc giữ NgModule, component TS/HTML/CSS, DTO trong `classes`, HttpClient/Observable trong `services`, và các module route CommonJS theo bài thực hành LearnAngular.

## Chạy sau khi clone

1. Cài Node.js **24.15 trở lên trong nhánh 24.x** (hoặc 22.22.3+ trong nhánh 22.x, hoặc 26+) và MongoDB Community Server **8.x**. Bật dịch vụ MongoDB ở `127.0.0.1:27017`.
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

- `my-server-mongodb/.env.example`: mẫu MongoDB, cổng, phiên đăng nhập, payOS, SMS. Có thể sửa `MONGODB_URI`, `MONGODB_DB`, các cổng và `CUSTOMER_APP_URL` trong `.env`.
- API MongoDB mặc định 3002; upload và danh mục tiện ích mặc định 3000. Các ứng dụng dùng proxy cùng nguồn và header cổng riêng; đăng nhập ba vai trò không ghi đè cookie của nhau.
- `my-server-mongodb/data/manifest.json` mô tả bản chụp dữ liệu hiện tại đã làm sạch: 47 collection, 8.140 bản ghi, checksum và index. Giữ ID, liên kết, số tiền, trạng thái và lịch sử nghiệp vụ; thông tin cá nhân, mật khẩu gốc, ảnh định danh và khóa thanh toán đã được thay hoặc loại bỏ. Ảnh xác minh demo có nhãn placeholder, không phải giấy tờ thật.
- `npm run data:check` kiểm tra khóa và liên kết của database được cấu hình, chỉ đọc.
- `npm run data:restore -- --database TEN_DB` khôi phục nếu database trống. `--replace` là thao tác thay dữ liệu có chủ đích; công cụ sao lưu riêng trước khi thay và không tự thực hiện khi setup. Không dùng `--replace` cho database đang vận hành khi chưa kiểm tra bản sao lưu.
- Để thanh toán ngân hàng thật, cấu hình **khóa payOS của chính bạn**, `CUSTOMER_APP_URL` và webhook công khai `/payos/webhook` theo tài khoản merchant. Repository không chứa khóa dùng chung. Tiền giữ chỗ hiện là **10.000 đ để thử**, vẫn là tiền thật nếu dùng payOS thật. SMS chỉ gửi được sau khi có nhà cung cấp, tên gửi và mẫu OTP đã duyệt; chưa cấu hình thì hệ thống báo chưa sẵn sàng.

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

Backend hiện thiết kế cho **một tiến trình API** với hàng đợi và journal bền vững trong MongoDB; session dùng MemoryStore nên khởi động lại phải đăng nhập lại. Chưa cấu hình chạy đa instance hay session store cho triển khai công cộng. File upload mới nằm trên ổ đĩa local, cần sao lưu cùng database. Các tài liệu bàn giao tổng hợp MD, draw.io và Word được xuất riêng ngoài repository theo yêu cầu.
