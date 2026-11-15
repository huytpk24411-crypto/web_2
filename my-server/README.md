# my-server — iHOUZZ Uni (chương 6)

Server CommonJS, một `index.js`, theo mẫu LearnAngular; Express cổng **3000**, dữ liệu mảng trong bộ nhớ, không dùng DB. Khởi động lại sẽ khôi phục danh sách tiện nghi mẫu.

Chạy trong `my-server/`:

```sh
npm install
npm start
```

Phụ thuộc: `express`, `cors`, `body-parser`, `express-fileupload`; dev: `morgan`, `nodemon`. Script start: `nodemon index.js`. `path`, `fs`, `crypto` có sẵn trong Node.js.

## Endpoint

Base URL: `http://localhost:3000`.

| Method | Endpoint | Kết quả |
| --- | --- | --- |
| GET | `/api/amenities` | Mảng tiện nghi `{id,name,group}` |
| GET | `/api/amenities/filter/group?group=NOI_THAT` | Lọc chính xác theo group; thiếu group → 400 |
| GET | `/api/amenities/:id` | Một tiện nghi; không có → 404 |
| POST | `/api/amenities` | Body `{name,group,id?}`; tự sinh id khi bỏ trống; 201, trùng id → 409 |
| PUT | `/api/amenities` | Body `{id,name,group}`; trả tiện nghi đã cập nhật; không có → 404 |
| DELETE | `/api/amenities/:id` | Trả tiện nghi đã xóa; không có → 404 |
| GET | `/api/room-types` | `PHONG_TRO`, `CAN_HO_MINI`, `STUDIO`, `DUPLEX`, `CAN_HO`, `KTX` |
| POST | `/api/upload/:folder` | Multipart field `file`; 201 `{url:"/uploads/<folder>/<tên>"}` |

Tiện nghi mẫu dùng group `NOI_THAT`, `DICH_VU`, `TIEN_ICH`; POST/PUT nhận mọi group là chuỗi không rỗng. POST/PUT thiếu dữ liệu hợp lệ → 400.

File tĩnh phục vụ từ `public/`. Các thư mục `images/`, `uploads/rooms/`, `uploads/cccd/`, `uploads/attendance/`, `uploads/schools/` được tạo sẵn và bảo đảm tồn tại khi khởi động. Upload chỉ nhận đúng một file `.jpg`, `.png`, `.webp`, `.svg` với MIME tương ứng, tối đa 5 MB (5 × 1024 × 1024 byte). Sai folder/file/định dạng → 400; vượt dung lượng → 413. Tên lưu bằng UUID, không dùng đường dẫn do client cung cấp. URL trả về dùng origin cổng 3000.

## Kiểm tra thủ công

```sh
node --check index.js
curl http://localhost:3000/api/amenities
curl "http://localhost:3000/api/amenities/filter/group?group=NOI_THAT"
curl http://localhost:3000/api/room-types
curl -F "file=@photo.jpg" http://localhost:3000/api/upload/rooms
```
