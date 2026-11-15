# iHOUZZ Uni – cổng khách hàng (my-app-customer)

Chạy `npm ci` một lần, sau đó `npm start` (hoặc `ng serve`, nút Run của VS Code, công cụ preview) rồi mở http://localhost:4200.

Khi dev server khởi động, `src/proxy.conf.mjs` tự bật MongoDB API (`../my-server-mongodb`, cổng 3002) và server upload ảnh (`../my-server`, cổng 3000) nếu chúng chưa chạy; server nào đã bật sẵn thì dùng lại. Cần bật dịch vụ MongoDB (cổng 27017) trước. Giao diện lấy toàn bộ dữ liệu qua API; thiếu server sẽ báo "Không kết nối được máy chủ".

Khác: `npm run build`, `npm run test:unit`.

Ba ứng dụng `my-app-customer` (4200), `my-app-employee` (4201), `my-app-admin` (4202) dùng chung API và MongoDB. Mỗi app tự gửi tên cổng qua proxy nên có phiên đăng nhập riêng, và chỉ nhận đúng loại tài khoản của mình (khách hàng tự đăng ký; tài khoản nhân viên, quản trị do công ty cấp).
