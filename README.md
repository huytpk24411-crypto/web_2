# iHOUZZ Uni

Dự án Angular, Node.js/Express và MongoDB với ba giao diện customer, employee và admin.

## Chạy local

1. Cài Node.js 24.15+ trong nhánh 24.x và MongoDB Community Server. Bật MongoDB tại `127.0.0.1:27017`.
2. Trong thư mục gốc, chạy `npm run setup` để cài dependency, tạo cấu hình và nạp dữ liệu vào database trống.
3. Chạy `npm start`.

| Giao diện | Địa chỉ local | Tài khoản demo |
|---|---|---|
| Customer | http://127.0.0.1:4200 | 0900000017 |
| Employee | http://127.0.0.1:4201 | 0900000002 |
| Admin | http://127.0.0.1:4202 | 0900000001 |

Mật khẩu demo được tạo khi setup, xem `DEMO_PASSWORD` trong `my-server-mongodb/.env`. Cấu hình MongoDB, payOS, SMS và lưu ảnh theo `my-server-mongodb/.env.example`. Database có sẵn được giữ khi setup.

## Cấu trúc và kiểm tra

- `my-app-customer`, `my-app-employee`, `my-app-admin` chứa ba ứng dụng Angular.
- `my-server-mongodb` chứa API, nghiệp vụ và dữ liệu đã làm sạch để khôi phục.
- `my-server` phục vụ upload và media local. `scripts` quản lý setup, chạy và build.
- `npm run build` build ba giao diện. `npm test` chạy kiểm thử. `npm run test:deploy` kiểm tra định tuyến triển khai.

## Triển khai

Frontend Vercel dùng `npm run build:vercel`, biến `BACKEND_URL` trỏ backend và `PUBLIC_ASSET_BASE_URL` trỏ bucket ảnh public. Backend Render dùng build `npm run build:backend`, start `npm run start:backend`, health check `/healthz`. Đặt `CUSTOMER_APP_URL` bằng URL Vercel và cấu hình MongoDB Atlas, Supabase, payOS qua biến môi trường theo `.env.example`.

Các cổng online dùng `/`, `/staff/` và `/management/`.
