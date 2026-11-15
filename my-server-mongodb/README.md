# Web server MongoDB — iHOUZZ Uni (chương 7–8)

CommonJS, một `index.js`, Express và MongoDB driver theo mẫu LearnAngular. Cổng **3002**, MongoDB `mongodb://127.0.0.1:27017`, database **iHouzzUniData**. Giữ CRUD danh mục hiện có, thêm Account, session và Viewing.

Chạy trong `my-server-mongodb/` với MongoDB đang hoạt động:

```sh
npm install
npm run seed
npm start
```

Phụ thuộc mới: `cookie-parser` (`^1.4.7`), `express-session` (`^1.18.2`). Giữ `express`, `cors`, `body-parser`, `mongodb`; dev: `morgan`, `nodemon`. `crypto` có sẵn trong Node.js. Chạy `npm install` để cập nhật package-lock cho phụ thuộc mới.

## Seed

DATA-01 thay **toàn bộ dữ liệu trong 43 collection** được liệt kê trong `scripts/seed/manifest.json`, bao gồm 12 phòng cũ, tài khoản và lịch xem cũ. Chỉ nạp vào database được chỉ định `iHouzzUniData`. Seed không drop database và không chạm collection ngoài manifest. Dừng API trước khi seed; MongoDB standalone không hỗ trợ transaction nhiều collection. Nếu bị gián đoạn, giữ API dừng và chạy lại seed đến khi có PASS.

Từ gốc repository:

```sh
python -I scripts/seed/gen_seed.py
node --check my-server-mongodb/seed.js
```

Sau đó chạy `npm run seed` trong `my-server-mongodb/` khi MongoDB đang hoạt động. Generator dùng Python 3 và thư viện chuẩn, đọc `scripts/seed/catalog.json` cùng `data/schools.json`, kiểm nghiệp vụ trước khi ghi 43 tệp JSON, 15 SVG và manifest. Loader kiểm count/SHA-256/ID của tất cả tệp trước khi kết nối MongoDB, thay dữ liệu, tạo index và kiểm lại số lượng. Không tự chạy generator trong `npm run seed`: dữ liệu đã sinh có thể được kiểm tra trước.

56 tài khoản gồm 1 ADMIN, 15 EMPLOYEE, 40 CUSTOMER; mật khẩu khởi tạo **123** băm scrypt tương thích `index.js`. Salt khởi tạo cố định theo số điện thoại để tái lập dữ liệu; tài khoản tạo qua API dùng salt riêng. Ba tài khoản giữ nguyên số điện thoại, tên, vai trò:

| Phone | Role | Name |
| --- | --- | --- |
| 0901234567 | CUSTOMER | Nguyễn Trần Anh Tú |
| 0909876543 | EMPLOYEE | Tăng Khả Ái |
| 0901122334 | ADMIN | Nguyễn Tuấn Kiệt |

Số bản ghi từng collection, quy ước FK và các kịch bản vận hành: [hướng dẫn DATA-01](../scripts/seed/README.md). Seed giữ trường API hiện có (`Room.images` là đường dẫn chuỗi, `price`, `deposit`, `fees`, `status`; Account `role/name/salt/passwordHash`; các trường checkout của Viewing). `_id` được sinh ổn định, nạp thành ObjectId; ID nghiệp vụ `phong-01`…`phong-50` và FK danh mục vẫn là chuỗi. Viewing giữ `customerId` là ObjectId của Account như checkout hiện tại, thêm `customerProfileId` tham chiếu Customer.

Các thời điểm ISO có offset được nạp thành BSON Date; ngày lịch/giờ ca giữ chuỗi. Kỳ lương dùng `status` OPEN/CLOSED/PAID và `displayStatus` DANG_MO/DA_CHOT/DA_TRA. Lịch tuần biên mở rộng 27/07–08/11 để kiểm BR-10 đủ tuần; chấm công chỉ có 01/08–02/11/2026. Hoa hồng tháng 11 chưa chốt, phiếu lương còn dự thảo. Ảnh chấm công mới phải tải lên máy chủ; thông tin lịch sử lấy từ bản ghi MongoDB.

Server và seed bảo đảm unique index `Room.id`, `Room.code`, `Room.slug` (sparse), `Account.phone`. Seed bổ sung index FK ghép/duy nhất cho collection mới và index giữ chỗ hiệu lực. Khi tạo/đổi tên phòng, server tạo lại slug và thêm id nếu trùng tên; PUT giữ slug cũ nếu tên không đổi. Tên không sinh được slug → 400; vi phạm unique index → 409.

## AUTH-01 — tên đăng nhập

`POST /user-register` nhận thêm `username` bắt buộc cho khách đăng ký mới, khớp `^[A-Za-z][A-Za-z0-9_-]{2,29}$`, lưu chữ thường vào `Account.username`. Server khởi tạo unique partial index `{ username: 1 }` với `{ unique: true, partialFilterExpression: { username: { $type: 'string' } } }`; tài khoản cũ thiếu username không bị ảnh hưởng. Không đổi seed/JSON.

Trùng tên đăng nhập trả HTTP 409 `{ code: 'USERNAME_TAKEN' }`; trùng số điện thoại trả HTTP 409 `{ code: 'PHONE_TAKEN' }`, kể cả xung đột unique index lúc ghi. Username thiếu/sai định dạng trả 400. Các response lỗi có thêm `message`.

`POST /user-login` giữ body `{phone,password,rememberMe}`: `phone` là giá trị ô định danh. Nếu sau normalizePhone (+84 → 0) là SĐT hợp lệ thì tìm `Account.phone`; ngược lại tìm `Account.username` chữ thường. Tài khoản cũ vẫn đăng nhập bằng SĐT. Session và response đăng ký/đăng nhập thêm `username` nếu có; profile trả cùng session. Giữ session regenerate, viewingCart và cookie `remember_user` luôn chứa **số điện thoại tài khoản**, kể cả đăng nhập bằng username.

## Endpoint

Base URL: `http://localhost:3002`. API danh mục trả JSON bỏ `_id`; khóa phòng seed là `id` dạng `phong-01`. Tìm kiếm và slug được đăng ký trước route `/:id`.

| Method | Endpoint | Kết quả |
| --- | --- | --- |
| GET | `/` | Thông báo server |
| GET | `/data/rooms` | Mảng phòng |
| GET | `/data/rooms/search?q=duplex` | Regex không phân biệt hoa thường trên name/description; ký tự regex được escape; q rỗng trả tất cả |
| GET | `/data/rooms/slug/:slug` | Một phòng theo slug; không có → 404 |
| GET | `/data/rooms/:id` | Một phòng theo id; không có → 404 |
| POST | `/data/rooms` | Chèn body phòng, server tạo slug; trả phòng |
| PUT | `/data/rooms` | Cập nhật theo body.id, bỏ `_id`, tự quản lý slug; không có → 404 |
| DELETE | `/data/rooms/:id` | Trả phòng đã xóa; không có → 404 |
| GET | `/data/properties` | Mảng Property |
| GET | `/data/schools` | Mảng School |
| GET | `/data/property-schools` | Mảng PropertySchool |
| POST | `/user-login` | `{phone,password,rememberMe}` (phone nhận SĐT hoặc username) → `{message,user:{id,phone,role,name,username?}}`; sai → 401 |
| GET | `/auth/profile` | `{id,phone,role,name,username?}` từ session; chưa đăng nhập → 401 |
| POST | `/auth/logout` | Destroy session, clear cookie `connect.sid` |
| POST | `/viewing-cart/add` | `{roomId}` → mảng id phòng trong session, không trùng; phòng không có → 404 |
| GET | `/viewing-cart` | Mảng id phòng, mặc định `[]` |
| DELETE | `/viewing-cart/:roomId` | Mảng id còn lại; bỏ id không có không gây lỗi |
| POST | `/viewing-cart/checkout` | CUSTOMER; tạo Viewing + ViewingDetail, trả 201 bản ghi gồm `id`, `_id`, `details`, xóa giỏ sau khi ghi thành công |

Lỗi trả `{message:"..."}`. JSON và URL-encoded body giới hạn 50mb; file tĩnh từ `public/`.

POST/PUT/DELETE `/data/rooms` dùng chung `requireAdmin`: chưa có session đăng nhập → 401,
session khác ADMIN → 403. Đăng nhập bằng `0901122334 / 123` để ghi phòng; các API GET vẫn công khai.

Frontend proxy `/data`, `/user-login`, `/auth`, `/viewing-cart` và các endpoint P2 bên dưới đến cổng 3002;
`/api`, `/uploads` đến cổng 3000. Đăng nhập và mọi thao tác nghiệp vụ chỉ qua API;
lỗi kết nối không tạo phiên hoặc bản ghi cục bộ. Cookie ghi nhớ số điện thoại không cấp quyền đăng nhập.

## Session và checkout

CORS dùng origin `http://localhost:4200`, `credentials: true` ở cả middleware chung và từng route. Client phải gửi cookie với `withCredentials: true` hoặc `credentials: 'include'`. Session một giờ, `httpOnly`, SameSite Lax; secret lấy từ `SESSION_SECRET`, có giá trị mẫu cho localhost. Session dùng MemoryStore và mất khi server khởi động lại. Đăng nhập đổi session id, giữ giỏ đang chọn, không trả hash/salt. `rememberMe: true` đặt cookie `remember_user` bằng phone trong 30 ngày, SameSite Lax; đây là ghi nhớ số điện thoại, không tự đăng nhập. `false`/không truyền sẽ xóa cookie ghi nhớ. Logout vẫn giữ cookie ghi nhớ số điện thoại.

Checkout yêu cầu đã đăng nhập (401), role CUSTOMER (403), giỏ không rỗng (400). Body:

```json
{
  "date": "2026-11-15",
  "startTime": "09:00",
  "endTime": "10:00",
  "viewerName": "Nguyễn Trần Anh Tú",
  "viewerPhone": "0901234567",
  "peopleCount": 2,
  "note": "Gọi trước khi đến"
}
```

Ngày phải tồn tại theo `YYYY-MM-DD`; giờ `HH:mm` theo giờ Việt Nam, endTime sau startTime và startAt ở tương lai; điện thoại hợp lệ, peopleCount là số nguyên dương; note tối đa 1000 ký tự, mặc định rỗng. Sai dữ liệu → 400; phòng không còn PUBLISHED/AVAILABLE → 409. Viewing lưu customerId là ObjectId của Account, customerProfileId là Customer.id, employeeId mặc định null, status `CHO_XAC_NHAN`. Mỗi phòng có ViewingDetail (`viewingId` = Viewing.id, order từ 1, viewStatus `CHUA_XEM`, note rỗng); `rooms` giữ bản chiếu tương ứng như seed. Lưu cả visitorName/Phone/Count và viewerName/Phone/peopleCount; startAt/endAt/createdAt là Date. Giỏ giữ nguyên khi validation hoặc insert thất bại; lỗi insert chi tiết được bù bằng cách gỡ những bản ghi vừa tạo trong request.

## P2 — API khách hàng và quyền

Các đường dẫn dưới đây ở cổng 3002; API trả JSON, bỏ `_id` (checkout vẫn trả thêm `_id` để tương thích FE-02). Tham số `:id` nhận ID nghiệp vụ hoặc ObjectId; roomId, employeeId và các FK còn lại dùng ID nghiệp vụ DATA-01. Quyền P2 được kiểm lại từ Account đang ACTIVE trong MongoDB ở mỗi request. Không nhận customerId/accountId/chủ sở hữu từ body.

| Method | Endpoint | Quyền / điều kiện |
| --- | --- | --- |
| POST | `/user-register` | Công khai; `{username,phone,password,name,email?}`; username và phone unique, chuẩn hóa +84 → 0; mật khẩu 8–128 ký tự; scrypt + salt ngẫu nhiên; tạo Account, AccountRole CUSTOMER, Customer và session mới, giữ giỏ; trả 201 `{user}` |
| GET | `/favorites` | CUSTOMER; chỉ Favorite.customerId = Customer.id của mình |
| POST | `/favorites` | CUSTOMER; `{roomId}`; phòng PUBLISHED; idempotent theo khách + phòng |
| DELETE | `/favorites/:roomId` | CUSTOMER; chỉ xóa của mình; bỏ mục không có trả `{removed:false}` |
| POST | `/contact-requests` | Công khai; `{name,phone,email,message}`; message 10–2000 ký tự; trùng phone + nội dung trong 60 giây → 409, không phụ thuộc tên/email |
| GET | `/contact-requests` | ADMIN; mới nhất trước |
| PUT | `/contact-requests/:id` | ADMIN; `{status,employeeId}`; status PENDING/RESPONDED; respondedBy trỏ Employee ACTIVE, RESPONDED cần employeeId; PENDING cho phép null |
| POST | `/viewing-cart/checkout` | CUSTOMER; ghi Viewing + ViewingDetail và audit; kiểm phòng và thời gian trên server |
| GET | `/viewings/mine` | CUSTOMER; chỉ lịch của mình, mới nhất theo startAt; có `details` với ID để cập nhật chi tiết |
| PUT | `/viewings/:id/cancel` | CUSTOMER sở hữu; CHO_XAC_NHAN/DA_XAC_NHAN → DA_HUY; gửi thông báo cho khách, NV được phân công và ADMIN |
| GET | `/viewings` | ADMIN; toàn bộ lịch, kèm `details`, mới nhất theo startAt |
| PUT | `/viewings/:id/assign` | ADMIN; `{employeeId}` là Employee ACTIVE; lịch còn CHO_XAC_NHAN/DA_XAC_NHAN; cùng NV là no-op; thông báo khách/NV mới/NV cũ nếu chuyển |
| PUT | `/viewings/:id/status` | EMPLOYEE được phân công; `{status}`; CHO_XAC_NHAN → DA_XAC_NHAN → DA_XEM; chuyển ngược/hủy/đổi lịch kết thúc → 409 |
| PUT | `/viewing-details/:id` | EMPLOYEE được phân công, lịch DA_XAC_NHAN; `{viewStatus,note}`; CHUA_XEM/DA_XEM, note ≤1000 ký tự; đồng bộ bản chiếu `Viewing.rooms` |
| GET | `/notifications` | Account đăng nhập; chỉ accountId của mình, mới nhất trước |
| PUT | `/notifications/:id/read` | Account nhận; đánh dấu đã đọc, idempotent |
| PUT | `/notifications/read-all` | Account đăng nhập; chỉ cập nhật thông báo chưa đọc của mình |

Thiếu session/Account ngừng hoạt động → 401; sai vai trò hoặc chủ bản ghi → 403; không có bản ghi/FK → 404; trùng SĐT/tư vấn hoặc trạng thái không cho thao tác → 409; body sai → 400. Đăng ký không trả/lưu mật khẩu trong session hay AuditLog. AuditLog dùng Account.id cho actorId; tư vấn vãng lai có actorId null. Tạo/sửa/xóa yêu thích, tạo tài khoản/vai trò/hồ sơ khách, tư vấn, lịch/chi tiết và tạo/đọc thông báo đều ghi audit.

P2 dùng thứ tự ghi trong **một tiến trình Express** để chống gửi tư vấn trùng trong cửa sổ 60 giây và tránh cập nhật lịch/chi tiết đồng thời. Unique index bảo vệ SĐT, yêu thích và chi tiết. MongoDB standalone không có transaction nhiều collection: đăng ký/checkout bù khi insert con lỗi, cập nhật chi tiết bù khi đồng bộ cha lỗi; sự cố tiến trình/DB giữa các lần ghi audit/thông báo vẫn cần đối soát. Không chạy nhiều instance với cơ chế chống trùng tư vấn này.

Frontend gọi qua `AuthAPIService`, `CustomerAPIService`, `ViewingCartAPIService`. Mọi lỗi kết nối/5xx hiển thị thông báo chung; không đọc snapshot hay ghi nghiệp vụ vào trình duyệt. Khối lịch xem có tải lại/hủy; chuông có số chưa đọc/đọc từng mục/đọc tất cả qua API.

Proxy dùng `/favorites/` (dấu `/` cuối) cho HttpClient và giới hạn các nhánh `/viewings/mine`, `/:id/cancel|assign|status`, `/viewings` để không chặn route Angular `/favorites`, `/viewings/new` khi tải lại trang. Express nhận cả `/favorites` và `/favorites/`. `/user-register`, `/contact-requests`, `/viewing-details`, `/notifications` cũng chuyển đến 3002. Form đăng ký gửi username; đăng nhập bằng SĐT hoặc username.

### Checklist chạy ngoài sandbox (Claude)

- `npm run build`, `npm run test:unit`, `npm run test:e2e` trong my-app; gồm spec customer API/state và `e2e/customer-p2.spec.ts` (API bị tắt có chủ đích). Kiểm tra ảnh desktop header/chuông, đăng ký, liên hệ, yêu thích, lịch xem. Tại sandbox chỉ kiểm source, chưa xác nhận render.
- Dùng cookie jar riêng cho CUSTOMER A/B, ADMIN (`0901122334/123`), EMPLOYEE được phân công (`0909876543/123`) và NV khác (`0912000002/123`). Thử mỗi endpoint bảo vệ khi chưa đăng nhập (401), sai role (403), ID không có (404); KH B hủy lịch/đọc thông báo A và NV khác sửa lịch/chi tiết phải 403.
- Đăng ký bằng SĐT mới: 201 + cookie session; GET profile/favorites được ngay. Gửi lại SĐT hoặc +84 tương đương: 409. Kiểm AccountRole và Customer liên kết Account.id; kiểm audit không có hash/salt/password.
- Thêm cùng yêu thích hai lần: một Favorite; xóa hai lần không lỗi. Tư vấn gửi hai lần cùng phone/nội dung, đổi tên/email vẫn 409 trong phút; sau 61 giây được tạo mới; ADMIN nhận đúng thông báo. Thử hai request đồng thời.
- Chọn `phong-48`/`phong-49`, checkout bằng ngày tương lai. Kiểm Viewing.customerId là Account ObjectId, customerProfileId đúng, ViewingDetail và rooms khớp thứ tự/trạng thái/note. Xác nhận giỏ rỗng sau thành công và còn nguyên khi body/phòng sai.
- ADMIN lấy GET viewings, phân công NV; khách/NV nhận thông báo. NV khác bị 403; NV đúng xác nhận, cập nhật từng detail (rooms đồng bộ), hoàn tất DA_XEM. Lịch hoàn tất không hủy/phân công lại được (409). Tạo lịch khác và hủy ở cả CHO_XAC_NHAN/DA_XAC_NHAN; kiểm thông báo và audit.
- GET notifications mỗi tài khoản không thấy thông báo người khác; thứ tự mới nhất trước. Đọc một/đọc tất cả hai lần không thêm audit trùng; không đổi thông báo tài khoản khác.
- Tắt server: hiển thị lỗi kết nối; không tạo dữ liệu cục bộ. Refresh trực tiếp `/favorites`, `/viewings/new` vẫn hiện Angular và trạng thái lỗi tương ứng.

## Kiểm tra thủ công

```sh
node --check index.js
node --check seed.js
curl -i -c cookies.txt -H "Content-Type: application/json" -d '{"phone":"0901234567","password":"123","rememberMe":true}' http://localhost:3002/user-login
curl -b cookies.txt http://localhost:3002/auth/profile
curl -b cookies.txt -c cookies.txt -H "Content-Type: application/json" -d '{"roomId":"phong-48"}' http://localhost:3002/viewing-cart/add
curl -b cookies.txt http://localhost:3002/viewing-cart
curl "http://localhost:3002/data/rooms/search?q=duplex"
curl http://localhost:3002/data/rooms/slug/can-ho-heritage-walnut-phong-46
curl -b cookies.txt -c cookies.txt -H "Content-Type: application/json" -d '{"date":"2026-11-15","startTime":"09:00","endTime":"10:00","viewerName":"Anh Tu","viewerPhone":"0901234567","peopleCount":2,"note":""}' http://localhost:3002/viewing-cart/checkout
curl -b cookies.txt http://localhost:3002/viewing-cart
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3002/auth/logout
```

Ví dụ curl dùng shell hỗ trợ dấu nháy đơn (Git Bash); trên Windows PowerShell gọi `curl.exe` hoặc dùng `Invoke-RestMethod` với body JSON. Thử thêm đăng nhập sai (401), profile sau logout (401), checkout bằng EMPLOYEE/ADMIN (403), checkout giỏ rỗng (400), thêm phòng hai lần (giỏ vẫn một id).

## P3 — giữ chỗ, cọc, hợp đồng và doanh thu

Chạy **một tiến trình API** trên MongoDB standalone như P2. Không dùng transaction,
không đổi seed. `MONGODB_DB` mặc định `iHouzzUniData`; chỉ đổi sang database test riêng
khi chạy bộ integration. Server tạo index trước khi mở cổng, phục hồi yêu cầu dở dang,
kiểm hết hạn khi đọc/ghi và quét mỗi 60 giây. Không có TTL xóa lịch sử.

Các route P3 nằm dưới `/data`, proxy Angular hiện có đã bao phủ nên không cần thêm proxy.
Mọi POST P3 yêu cầu `Idempotency-Key` dài 8–160 ký tự. Cùng key + actor + URL + nội dung
trả kết quả trước; đổi nội dung/actor/URL trả 409. Frontend giữ key trong sessionStorage
khi mất phản hồi và khi tải lại trang; không tự tạo giao dịch cục bộ sau lỗi ghi API.
Sau khi một hồ sơ mới đã được đọc lại thành công, bản nháp mới được phép dùng key mới.

| Method / endpoint (tiền tố `/data`) | Quyền / tác dụng |
| --- | --- |
| GET, POST `/me/holds`; GET `/me/holds/:id` | CUSTOMER, chỉ bản ghi của mình; tạo PAYMENT_PENDING, amount từ Policy/PolicyLevel GIU_CHO hiệu lực; CAS khóa phòng HOLD trong 15 phút, chưa tạo Payment |
| POST `/me/holds/:id/complete-payment` | CUSTOMER sở hữu; `{method:"BANK_TRANSFER"\|"ZALOPAY"\|"MOMO"}` + Idempotency-Key; trả 201 Payment CONFIRMED kèm receipt, Hold ACTIVE và Room HELD trong 48h từ paidAt |
| POST `/me/holds/:id/payments` | Đã bỏ, trả 410 HOLD_PAYMENT_SELF_SERVICE; chuyển sang complete-payment |
| POST `/me/holds/:id/cancel` | CUSTOMER sở hữu, chỉ trước thanh toán |
| GET `/holds/creditable?roomId=...` | EMPLOYEE/ADMIN; ACTIVE, tiền CONFIRMED, đúng hạn, chưa trừ |
| GET `/payments[/:id]` | Danh sách EMPLOYEE/ADMIN; chi tiết thêm CUSTOMER sở hữu; NV xem mọi tiền giữ chỗ và tiền cọc do mình lập |
| POST `/payments/:id/confirm`, `/reject` | Chỉ EMPLOYEE cho tiền cọc do mình lập; reject cần `{reason}`; CAS PENDING, chỉ một quyết định thắng. Tiền giữ chỗ trả 410 HOLD_PAYMENT_SELF_SERVICE |
| GET `/payments/:id/receipt` | CUSTOMER sở hữu, EMPLOYEE theo phạm vi, ADMIN; chỉ tiền CONFIRMED |
| GET, POST `/deposits`; GET `/deposits/:id` | GET: EMPLOYEE hồ sơ mình, ADMIN tất cả, chi tiết thêm CUSTOMER sở hữu. POST chỉ EMPLOYEE |
| POST `/deposits/:id/payments` | EMPLOYEE lập cọc, `{method}`; amount lấy từ amountDue; không có payment nếu amountDue=0 |
| POST `/deposits/:id/cancel` | EMPLOYEE lập cọc/ADMIN; PAYMENT_PENDING chưa nhận tiền, cần reason; payment PENDING phải đối soát/từ chối trước |
| POST `/deposits/:id/abandonment` | EMPLOYEE lập cọc/ADMIN; PAID; ghi reason, ownerDecision PENDING/REFUND/RETAIN/PARTIAL, ownerDecisionNote và evidenceFileIds; không tự hoàn/tịch thu tiền |
| GET, POST `/contracts`; GET `/contracts/:id` | POST: EMPLOYEE từ cọc PAID của mình; GET: NV theo deposit.employeeId, ADMIN tất cả, chi tiết thêm CUSTOMER sở hữu |
| POST `/contracts/:id/sign`, `/complete` | EMPLOYEE lập cọc; ký: RENTED + CONTRACTED; hoàn tất: giao dịch/doanh thu duy nhất theo tháng giờ VN |
| GET `/brokerage-transactions` | EMPLOYEE theo EmployeeRevenue của mình; ADMIN tất cả; hỗ trợ month/status |
| POST `/admin/deposits/:id/review` | ADMIN; `{status:"APPROVED" hoặc "REJECTED",reason}`. Duyệt hồ sơ lưu riêng, không xác nhận tiền, đổi hạn, quyết định hoàn cọc hay ghi doanh thu |

Danh sách holds/deposits/contracts/payments trả `{items,total}`; creditable và transactions
trả mảng. API chi tiết trả bản ghi. 400: sai dữ liệu/key; 401/403: session/quyền;
404: không có bản ghi; 409: khóa/trạng thái/key/policy/thỏa thuận/kỳ lương; 503: cần phục hồi,
**thử lại cùng key**, không ghi nhận thành công ở trình duyệt.

Lập cọc: `{roomId,customerId,totalRequired,holdId?,proposedLease?:{months,startDate}}`.
Frontend trực tiếp có thể dùng `customerPhone` thay customerId; server tra tài khoản CUSTOMER
ACTIVE, không tạo khách vãng lai. Tổng cọc giữ nguyên; `amountDue=totalRequired-holdCredit`.
Khấu trừ cần payment CONFIRMED, hold ACTIVE cùng khách/phòng chưa sử dụng, còn hạn.
Lập hợp đồng: `{depositId,startDate,endDate,monthlyRent,electricityPrice?,waterPrice?,otherFees?}`.
Không nhận employeeId từ client; NV doanh thu suy từ người lập cọc.

Phí lấy từ BrokerageAgreement ACTIVE hiệu lực ở ngày hoàn tất, đúng loại
PERCENT_OF_MONTHLY_RENT và feeValue=5000 (50%). Không có thỏa thuận hợp lệ → 409,
không dùng giá trị mặc định. SIGNED chưa có doanh thu; COMPLETED tạo BrokerageTransaction
RECOGNIZED gắn hai revenue ID. Tháng = completedAt theo Asia/Ho_Chi_Minh. Kỳ CLOSED/PAID
hoặc chưa mở → 409, không tự chuyển doanh thu sang tháng khác. Tiền giữ chỗ/cọc không
được cộng vào doanh thu. API P4–P6 và tính hoa hồng/lương không triển khai trong P3.

### Nhất quán và lỗi giữa chừng

- AuditLog lưu `P3Operation` với key, fingerprint, kế hoạch có ID/paymentId/paidAt/hạn cố định,
  cursor và trạng thái PENDING/DONE/FAILED/COMPENSATING **trước** khi ghi dữ liệu tiền.
  Audit chuyển trạng thái và Notification là bản ghi riêng có ID/dedupeKey ổn định.
- Khóa phòng là **một findOneAndUpdate có điều kiện** trên AVAILABLE/PUBLISHED và lock trống
  hoặc đã hết hạn, tăng version. Hai khách tạo yêu cầu đồng thời chỉ một thắng; người thua
  nhận 409 ROOM_LOCKED và không có Hold/Payment mới. Chuyển/nhả khóa kiểm kind/refId gốc, giữ publicationStatus.
  CRUD danh mục không được ghi đè khóa/trạng thái tiền; xóa phòng tuân theo ROOM-01 bên dưới.
- Mỗi bước CAS lưu `p3LastStep`; insert dùng upsert theo ID cố định. Dừng sau mutation nhưng
  trước cursor vẫn chạy lại an toàn. Startup, các lần đọc/ghi P3 và timer phục hồi bước thiếu
  trước khi xử lý tiếp. Lỗi kỹ thuật sau nhận tiền giữ khóa và roll forward; không tự nhả phòng.
- Tiền giữ chỗ: complete-payment chuyển khóa HOLD của đúng yêu cầu còn hạn sang 48h bằng CAS
  đầu tiên, tạo Payment CONFIRMED (`amount=Hold.amount`, `paidAt=confirmedAt=now`,
  `confirmedBy=SYSTEM`, `confirmedByEmployeeId=null`), Receipt duy nhất `BL-YYYYMM-NNNN`
  và Hold ACTIVE. Snapshot phiếu giữ khách/SĐT, mã giữ chỗ, mã/tên/địa chỉ phòng, số tiền,
  kênh, thời điểm thanh toán, hạn giữ chỗ. Không gán nhân viên xác nhận; có audit/thông báo khách.
  Journal đã nhận khóa thì phục hồi đến đủ kết quả; không kiểm lại hạn 15 phút sau khi CAS đầu đã thành công.
- Tiền cọc giữ luồng NV xác nhận/từ chối: CAS CONFIRMED cấp biên lai, chuyển cọc PAID;
  CAS REJECTED ghi lý do. Các bản ghi giữ chỗ cũ vẫn lưu để xem/đối soát, không còn hàng chờ xác nhận giữ chỗ.
- Lỗi ràng buộc cuối cùng giữa lúc chuyển hold sang cọc dùng kế hoạch COMPENSATING bền vững:
  chỉ nhả khóa DEPOSIT của hồ sơ đó, phục hồi hold nếu còn hạn hoặc EXPIRED nếu quá hạn,
  hủy hồ sơ lỗi nếu đã chèn, giữ audit/thông báo. Lỗi mạng/DB tạm thời tiếp tục roll forward.
  Không khôi phục ACTIVE sau hạn. Hủy cọc chưa thu tiền cũng phục hồi hạn giữ chỗ gốc;
  `holdId` của hồ sơ đã hủy được chuyển sang `sourceHoldId` để giữ lịch sử và cho phép lập lại.
- Hoàn tất: giữ completedAt, upsert transaction unique contractId và hai revenue IDs,
  tính lại tổng từ RECOGNIZED, không `$inc` số tiền. Hàng đợi P3 tuần tự hóa trong một tiến trình;
  CAS/version trên PayrollPeriod ngăn ghi đè kỳ đã thay đổi. Kỳ có `p3Pending=true` phải được
  phục hồi xong trước khi chốt; triển khai P5 sau này phải dùng cùng CAS/version và kiểm
  không còn P3Operation dở dang. Không chạy nhiều instance API song song với bản này.

Frontend chỉ đọc/ghi từ API. Kết quả thanh toán chưa xác định giữ Idempotency-Key và kênh đã chọn để thử lại cùng thao tác, kể cả sau tải lại trang. Nhân viên đối soát tiền cọc ở trang lập cọc, thu tiền/in biên lai ở trang receipt; trang giao dịch giữ lịch sử như trước. Biên lai hiển thị số/nội dung từ server.

### BOOK-01 — khách tự hoàn tất thanh toán giữ chỗ (08/11/2026)

Luồng `/bookings/new?roomId=...`: **Thông tin → Thanh toán → Hoàn tất**. POST tạo giữ chỗ nhận
`{roomId,contactName,contactPhone,moveIn?,note?}`; amount luôn lấy từ policy GIU_CHO hiện hành,
không nhận số tiền do khách quyết định. Hold PAYMENT_PENDING có `expiresAt=paymentExpiresAt=createdAt+15 phút`,
`isActive=false`; Room HELD với `lock.kind=HOLD`, `refId=Hold.id`, cùng hạn. Hủy trước thanh toán
nhả đúng khóa. Đọc/ghi và timer P3 chuyển PAYMENT_PENDING quá hạn thành EXPIRED, mở lại phòng;
ACTIVE cũng hết hạn tự động sau 48h như trước. Không xóa lịch sử hoặc sửa seed/JSON/checksum.

Trang thanh toán dùng ảnh thật `/assets/payment/qr-chuyen-khoan.png` trong `my-app/public`,
chung cho tab Ngân hàng/ZaloPay/MoMo (quét VietQR tới tài khoản ngân hàng). Nội dung chuyển khoản
là `Hold.number` dạng `GC-YYYYMM-NNNN` (giữ chỗ cũ thiếu number dùng Hold.id); không tự tạo QR hoặc bịa tài khoản. Khách chuyển khoản rồi bấm **Hoàn tất**:

```http
POST /data/me/holds/:id/complete-payment
Content-Type: application/json
Idempotency-Key: <key riêng, giữ lại để thử lại>

{"method":"BANK_TRANSFER"}
```

Ba giá trị method hợp lệ: BANK_TRANSFER, ZALOPAY, MOMO (nhãn Ngân hàng, ZaloPay, MoMo).
Không yêu cầu mã giao dịch ngân hàng. Đây là ghi nhận thanh toán theo thao tác khách đã được chốt;
chưa có webhook/xác minh tiền từ ngân hàng, ZaloPay hoặc MoMo. Khách không chờ nhân viên xác nhận.
Cùng key/actor/URL/body trả đúng Payment/Receipt cũ, không tạo phiếu hoặc gia hạn lần nữa.
`/bookings/:id/receipt` là trang thành công và phiếu, có **In phiếu**, **Về trang chủ**.
Hold ACTIVE đã CONFIRMED vẫn được khấu trừ một lần qua `/holds/creditable` như trước.

| HTTP / code | Ý nghĩa |
| --- | --- |
| 409 ROOM_LOCKED | Phòng vừa được khách khác giữ chỗ |
| 409 HOLD_EXPIRED | Đã hết cửa sổ thanh toán hoặc không có hạn/khóa thanh toán hợp lệ; không tạo tiền/phiếu |
| 409 INVALID_TRANSITION / PAYMENT_ALREADY_EXISTS | Yêu cầu đã thanh toán/hủy hoặc có khoản tiền; tải lại trạng thái |
| 409 IDEMPOTENCY_CONFLICT | Key đã dùng cho actor/URL/body khác |
| 400 INVALID_METHOD / IDEMPOTENCY_KEY_REQUIRED | Kênh sai hoặc thiếu/sai key |
| 410 HOLD_PAYMENT_SELF_SERVICE | Endpoint khách cũ hoặc thao tác NV xác nhận/từ chối tiền giữ chỗ đã bỏ |
| 503 RECOVERY_PENDING | Kết quả chưa xác định; thử lại cùng key và cùng kênh |

Giữ chỗ PAYMENT_PENDING cũ thiếu hạn/khóa không được hoàn tất bằng endpoint mới; hủy rồi tạo lại.
Không chuyển dữ liệu cũ tự động. Spec HTTP mock ở booking-service và hai trang khách bao phủ kênh,
snapshot biên lai, lỗi/hết hạn và retry. Build/unit/render: **SKIPPED (sandbox) — Claude chạy**.

### Kiểm tra P3 (Claude chạy ngoài sandbox)

Từ gốc repo:

```powershell
node --check my-server-mongodb/index.js
node --test my-server-mongodb/p3.spec.js
$env:P3_MONGO_TEST='1'
node --test my-server-mongodb/p3.integration.spec.js
Remove-Item Env:P3_MONGO_TEST
cd my-app
npm run build
npm run test:unit
npx playwright test e2e/money-p3.spec.ts
```

Integration dùng DB test mới `iHouzzUniP3Test_<uuid>`, không seed/xóa dữ liệu hệ thống;
fixtures được giữ lại để kiểm tra. Bao phủ đua hai khách qua HTTP và đua hai kế hoạch đã chuẩn bị
trực tiếp trên Room CAS, confirm/reject, thử lại không trùng biên lai/doanh thu, lỗi sau lấy khóa,
hết hạn, không nhả khóa người mới, hủy cọc phục hồi hold, kỳ CLOSED và bù trừ lỗi lập cọc.
Không bật P3_MONGO_TEST thì các bài Mongo bị skip, không coi là đã kiểm luồng thật.
`money-service.spec.ts` kiểm key sau mất phản hồi, không fallback 409/503, cách ly tài khoản;
Kiểm lỗi kết nối/hết hạn/409 bằng HTTP fixtures không thay kiểm thử MongoDB thật.

Curl đua song song khi chạy API thật: đăng nhập hai khách khác nhau lấy cookie vào `a.txt`,
`b.txt`; chạy hai lệnh tạo yêu cầu trên cùng phòng AVAILABLE trong hai terminal:

```sh
curl -i -b a.txt -H "Content-Type: application/json" -H "Idempotency-Key: book01-customer-a-001" -d '{"roomId":"phong-48","contactName":"Khach A","contactPhone":"0901234567"}' http://localhost:3002/data/me/holds
curl -i -b b.txt -H "Content-Type: application/json" -H "Idempotency-Key: book01-customer-b-001" -d '{"roomId":"phong-48","contactName":"Khach B","contactPhone":"0911000001"}' http://localhost:3002/data/me/holds
```

Kỳ vọng một 201 và một 409 ROOM_LOCKED; đọc Room.lock/Hold, retry nguyên key.
Khách thắng gọi complete-payment trong 15 phút, nhận CONFIRMED + số BL ngay; thử lại cùng key
không đổi số BL hoặc hạn 48h. Thử quá hạn trả HOLD_EXPIRED và phòng được mở lại;
tiếp tục cọc → PAID → DRAFT → SIGNED → COMPLETED,
kiểm giao dịch và hai tổng doanh thu. Không chạy trên hồ sơ cần bảo toàn.

Tại sandbox: node --check, tsc/ngc --noEmit là kiểm tra tĩnh; build/unit/E2E,
curl đua song song và luồng Mongo thật: **SKIPPED (sandbox) — Claude chạy**.
Kiểm tra hình ảnh/render UI chưa thực hiện.

## P4 — ca làm, chấm công, công việc

BR-10 mới của task/02 §2 được ưu tiên hơn các mô tả 3–7 còn cũ trong schema:
5–8 ca/tuần khi nộp; 7 ngày × 2 ca 07:00–11:00, 13:00–17:00; 6 NV/ca.
ADMIN tạo đợt DRAFT theo `weekStart` thứ Hai và tự sinh đúng 14 ca tại WorkLocation duy nhất.
Server tính `opensAt` = 08:00 thứ Năm, `closesAt` = 20:00 Chủ Nhật tuần trước, múi giờ +07:00;
không nhận khung giờ/sức chứa từ client. ADMIN mở trong khoảng đó; có thể đóng sớm;
timer tự đóng khi hết hạn. Chốt chỉ từ CLOSED; kiểm từng nhân viên ACTIVE, kể cả chưa đăng ký,
ghi CONFIRMED hoặc BELOW_MINIMUM, giữ các ca đã nhận (không tự hủy/xếp lịch cho người thiếu ca).

### Endpoint và quyền P4

Tất cả endpoint `/data` dùng session cookie của P1/P2; role và hồ sơ nhân viên ACTIVE tra lại
MongoDB mỗi request. `me` chỉ thao tác trên assignment/TaskAssignment của chính NV.
Khách hàng không có quyền API P4. Đường dẫn ID là `id` nghiệp vụ, không dùng Account ObjectId
để thay Employee.id. API upload giữ nguyên trên my-server: `/api/upload/attendance`, multipart
trường `file`, trả `{url}`. Proxy hiện có đã chuyển `/data` sang 3002 và `/api`, `/uploads` sang
3000, nên không cần sửa proxy.

| Method | Endpoint | Quyền / dữ liệu |
| --- | --- | --- |
| GET | `/data/registration-periods/current` | EMPLOYEE; đợt OPEN trong cửa sổ, hoặc `null` |
| GET | `/data/shifts?periodId=...` | EMPLOYEE, ADMIN; giờ ca, capacity, assignedCount |
| POST | `/data/me/shift-registrations` | EMPLOYEE; `{periodId,shiftIds,submit?}`; mỗi ca độc lập; `submit:true` kiểm tổng 5–8 |
| GET | `/data/me/shift-assignments[?periodId=...]` | EMPLOYEE; kèm shift và attendance của mình |
| DELETE | `/data/me/shift-assignments/:id` | EMPLOYEE chủ bản ghi; REGISTERED, chưa bắt đầu, đợt chưa FINALIZED |
| POST | `/data/me/shift-assignments/:id/check-in` | EMPLOYEE chủ bản ghi; `{geo:{lat,lng},evidenceUrl,note?}` |
| POST | `/data/me/shift-assignments/:id/check-out` | EMPLOYEE chủ bản ghi; `{confirmed:true,evidenceUrl}`; không handover, không chọn ca đích |
| GET | `/data/me/shift-assignments/:id/tasks` | EMPLOYEE chủ assignment; task kèm lịch sử và currentAssignees |
| PUT | `/data/tasks/:id/my-status` | EMPLOYEE được giao, assignment IN_PROGRESS; `{assignmentId,personalStatus:TODO\|DONE}` |
| GET, POST | `/data/admin/registration-periods` | ADMIN; đọc các đợt / tạo `{name,weekStart}` |
| POST | `/data/admin/registration-periods/:id/open` | ADMIN; DRAFT → OPEN, kiểm cửa sổ đăng ký |
| POST | `/data/admin/registration-periods/:id/close` | ADMIN; DRAFT/OPEN → CLOSED, đánh dấu thiếu ca |
| POST | `/data/admin/registration-periods/:id/finalize` | ADMIN; CLOSED → FINALIZED |
| GET | `/data/admin/shift-state` | ADMIN; ca, phân ca, chấm công, công việc, nhân sự, trụ sở, đăng ký và chính sách |
| POST | `/data/admin/shift-registrations` | ADMIN; `{employeeId,shiftId}`; xếp bổ sung ca chưa bắt đầu, vẫn kiểm sức chứa/8 ca/trùng giờ |
| DELETE | `/data/admin/shift-assignments/:id` | ADMIN; hủy REGISTERED chưa bắt đầu, giữ lịch sử |
| POST | `/data/admin/shift-assignments/:id/move` | ADMIN; `{toShiftId}`, giữ movedFromAssignmentId và chuyển phần việc chưa xong |
| POST | `/data/admin/tasks` | ADMIN; `{title,description?,shiftId,assigneeAssignmentIds}` |
| POST | `/data/admin/tasks/:id/carry` | ADMIN; `{toShiftId,assigneeAssignmentIds}`, xếp lại phần việc đang chờ/chưa xong |

Đăng ký trả `{results:[{shiftId,ok,assignment?,error?}],shiftCount}`; nếu bất kỳ ca thất bại,
HTTP 409 và vẫn giữ kết quả thành công của các ca khác. Có thể lưu từng ca với `submit:false`,
sau đó nộp bằng `shiftIds:[],submit:true`. Nộp thiếu 5 hoặc quá 8 → 409 REQUIRE_5_TO_8_SHIFTS.
Một ca đủ chỗ → 409 SHIFT_FULL; trùng ca → 409 ALREADY_REGISTERED; khác chủ → 403.

### Chấm công và chuyển việc

- Check-in chỉ khi REGISTERED, `startsAt ≤ giờ server < endsAt`; tọa độ số hợp lệ và
  haversine ≤ WorkLocation.allowedRadiusM. Ảnh phải là URL `/uploads/attendance/...` từ
  upload server, không nhận data URL. Cửa sổ check-in ở đây là toàn bộ giờ ca,
  không tự thêm thời gian đến sớm hay hạn muộn ngoài yêu cầu P4.
- Phút trễ = ceil(phần chênh dương so với startsAt), tìm Policy PHAT_TRE ACTIVE hiệu lực và
  PolicyLevel `[from,to)`, to=null không giới hạn. Thiếu policy/mức/kỳ lương hoặc kỳ CLOSED/PAID
  → 409, không tự đặt mức phạt. Cộng đúng một lần vào PayrollAdjustment DRAFT của NV/kỳ,
  suy NV qua Payslip.adjustmentId; ghi ngày, phút, attendanceId và level vào notes.
  Chưa có phiếu/điều chỉnh thì tạo DRAFT liên kết; không sửa snapshot lương đã chốt hoặc tính P5.
- Attendance và AttendanceEvidence là collection rời theo DATA-01; evidence metadata cũng
  đi cùng Attendance để đọc. Check-out chỉ xác nhận + ảnh, tính workedMinutes từ giờ server.
  Phần TODO hiện hành của NV chuyển tới ca REGISTERED/OPEN chưa bắt đầu, sớm nhất sau ca nguồn.
  Mỗi phần có dòng TaskShift mới với fromShiftId/transferredAt, TaskAssignment mới trỏ nguồn;
  giữ taskId và mọi lịch sử, giữ phần của người khác.
- Không có ca kế tiếp: đánh dấu phần chờ, Task WAITING_ADMIN, Notification riêng cho từng ADMIN
  ACTIVE (dedupe theo task/assignment nguồn/người nhận). Đăng ký ca sau **không tự nhận lại việc chờ**.
  ADMIN chọn ca đích để phân công lại; task DONE khi mọi phần hiện hành DONE và không còn phần chờ.
- Mỗi 60 giây và lúc đọc lịch: ca kết thúc nhưng assignment REGISTERED không Attendance → ABSENT;
  chạy lặp không tạo audit/thông báo lần hai. Startup phục hồi thao tác rồi chạy quét.

### Nhất quán và frontend

P4 dùng hàng đợi riêng trong **một tiến trình API**, journal P4Operation trong AuditLog trước
mutation; mỗi effect có ID/token ổn định, CAS + cursor, audit riêng. Khởi động và trước API P4
tiếp tục effect còn thiếu. Retry cùng `Idempotency-Key`/nội dung trả kết quả cũ; khác nội dung
→ 409. Check-out đã COMPLETED không chuyển việc/phạt/thông báo lại, kể cả retry bằng key khác.
Reserve chỗ là `findOneAndUpdate` có điều kiện assignedCount < min(capacity,6) và snapshot
trước đó, là effect đầu tiên. Thua CAS không có bộ đếm/phân công cần bù. Sau reserve, journal
tiếp tục hoàn tất đăng ký và bộ đếm, không bỏ chỗ mồ côi khi dừng tiến trình.
Unique index bảo vệ ca/NV active, đợt/NV, tuần, attendance/assignment, ảnh/loại, phần chuyển nguồn.
Lỗi kỹ thuật sau mutation giữ PENDING để phục hồi; không trả thành công trước audit cuối.
Không chạy nhiều instance hoặc chỉnh trực tiếp DB trong lúc phục hồi. P5 sau này cần kiểm cả
P3Operation/P4Operation đang dở trước khi khóa lương (P4 không thay triển khai P3/P5).

my-app giữ NgModule/layout desktop. ShiftAPIService cách ly tài khoản, tải API khi đăng nhập server;
employee đăng ký/hủy, check-in GPS + upload, đánh dấu phần mình, check-out xác nhận + upload;
admin lịch/monitor/điều chỉnh ca/tạo và chuyển việc gọi API. Admin không đánh dấu DONE thay NV.
Giám sát tải lại mỗi 60 giây. Đợt online không cho thêm/sửa khung giờ ca vì đã sinh đủ 14 ca cố định.
Mất kết nối hiển thị lỗi, không đổi nguồn dữ liệu. Write chưa rõ kết quả giữ key để retry;
GPS/URL đã upload được giữ trong phiên cho lần thử lại. Không cần thay proxy hiện có.

### Kiểm tra P4 (Claude chạy ngoài sandbox)

```powershell
node --check my-server-mongodb/index.js
node --check my-server-mongodb/p4.spec.js
node --check my-server-mongodb/p4.integration.spec.js
node --test my-server-mongodb/p4.spec.js
$env:P4_MONGO_TEST='1'
node --test my-server-mongodb/p4.integration.spec.js
Remove-Item Env:P4_MONGO_TEST
cd my-app
npm run build
npm run test:unit
npx playwright test e2e/shifts-p4.spec.ts e2e/workflows.spec.ts e2e/staff.spec.ts
```

Unit thuần: 5–8 ca, ranh giới phút trễ/mức phạt, haversine trong/ngoài bán kính, chọn đúng ca
của NV và quyết định chuyển/chờ/bỏ qua phần đã xong. Integration opt-in dùng DB mới
`iHouzzUniP4Test_<uuid>`, giữ fixtures; kiểm đua HTTP chỗ cuối, retry/hủy/bộ đếm, role/chủ thể,
GPS/ảnh/phạt một lần, chuyển phần việc nhiều người, BR-19 mọi ADMIN, giả lỗi sau journal
rồi phục hồi check-out, ABSENT. HTTP fixtures kiểm GPS/upload, 409, task và
check-out E-05; chưa thay thế kiểm tra MongoDB/upload server thật.

Curl thật: đăng nhập hai NV ACTIVE khác nhau lấy cookie `a.txt`, `b.txt`; ADMIN tạo/mở đợt
đúng cửa sổ, chọn cùng ca còn **một chỗ**. Trong hai terminal chạy đồng thời (thay PERIOD/SHIFT):

```sh
curl -i -b a.txt -H "Content-Type: application/json" -H "Idempotency-Key: p4-race-a" -d '{"periodId":"PERIOD","shiftIds":["SHIFT"]}' http://localhost:3002/data/me/shift-registrations
curl -i -b b.txt -H "Content-Type: application/json" -H "Idempotency-Key: p4-race-b" -d '{"periodId":"PERIOD","shiftIds":["SHIFT"]}' http://localhost:3002/data/me/shift-registrations
```

Kỳ vọng một 200/một 409; assignedCount=6; người thua không tăng shiftCount; người thắng chỉ
một assignment active. Retry cùng key không tăng lại. Đủ 5–8 ca thì nộp; check-in trong giờ
với tọa độ trụ sở + ảnh từ `curl -F "file=@proof.jpg" http://localhost:3000/api/upload/attendance`;
kiểm notes/totalDeduction và hai ảnh CHECK_IN/CHECK_OUT; giao việc nhiều NV, đánh dấu một phần,
check-out để kiểm chuyển đúng người, không ca kế tiếp → WAITING_ADMIN/thông báo mọi ADMIN,
ADMIN carry, retry và audit. Kiểm thêm NV khác đọc/sửa bản ghi → 403; ngoài GPS/giờ → 409.

Tại sandbox: `node --check`, `tsc --noEmit`, `ngc --noEmit` là kiểm tra tĩnh.
Build/unit/E2E/integration Mongo/curl đua/luồng thật: **SKIPPED (sandbox) — Claude chạy**.
Chưa kiểm render/ảnh UI; đánh giá thay đổi giao diện chỉ theo source.

## P5 — doanh thu, hoa hồng, kỳ lương, phiếu lương và phiên bản chính sách

Backend giữ CommonJS trong `index.js`, dùng các collection DATA-01 hiện có, không đổi seed.
Angular dùng `/data` qua proxy 3002 đã có; không cần thêm cấu hình proxy. Đăng nhập máy chủ
để dùng MongoDB. GET mất kết nối hiển thị lỗi. POST chưa xác định giữ key để đối soát; không cập nhật thành công cục bộ.

### Endpoint / quyền

Mọi POST P5 yêu cầu cookie đăng nhập và `Idempotency-Key` (8–160 ký tự).
Retry cùng key/path/body/actor trả kết quả cũ; đổi nội dung cùng key trả 409.

| Method | Endpoint | Quyền / kết quả |
| --- | --- | --- |
| GET, POST | `/data/admin/payroll-periods` | ADMIN: danh sách; tạo `{code:"2026-11"}` OPEN, unique code và tháng/năm |
| POST | `/data/admin/payroll-periods/:id/calculate` | ADMIN: OPEN/CALCULATED → CALCULATED; tính lại được |
| POST | `/data/admin/payroll-periods/:id/close` | ADMIN: CALCULATED → CLOSED, đối soát cuối và khóa snapshot |
| GET | `/data/admin/payroll-periods/:id/payslips` | ADMIN: danh sách phiếu kèm doanh thu/hoa hồng/điều chỉnh |
| POST | `/data/admin/payslips/:id/adjustments` | ADMIN: `{kind,amount,reason}`, cộng vào một tổng hợp E-01, kỳ chưa khóa |
| POST | `/data/admin/payslips/:id/approve` | ADMIN: kỳ CLOSED, DRAFT → APPROVED, thông báo NV |
| POST | `/data/admin/payslips/:id/pay` | ADMIN: kỳ CLOSED, APPROVED → PAID, paidAt từ server, thông báo NV |
| GET | `/data/me/payroll-periods` | EMPLOYEE: các kỳ CALCULATED/CLOSED/PAID có phiếu của mình |
| GET | `/data/me/payslips?period=2026-11` | EMPLOYEE: chỉ phiếu của tài khoản hiện tại; bỏ qua employeeId client |
| GET, POST | `/data/admin/policies` | ADMIN: xem phiên bản + mức; tạo DRAFT mới, không sửa ACTIVE |
| POST | `/data/admin/policies/:id/activate` | ADMIN: kích hoạt DRAFT khi đã đến effectiveFrom và chưa effectiveTo |
| GET | `/data/admin/reports/revenue?month=2026-11` | ADMIN: doanh thu tháng, top NV, số hợp đồng |
| GET | `/data/admin/reports/revenue?year=2026` | ADMIN: 12 báo cáo tháng, kể cả tháng không có giao dịch |
| GET | `/data/admin/summary?month=2026-11` | ADMIN: số liệu doanh thu/hoa hồng cho dashboard |

### Cách tính và khóa số liệu

- Tháng Việt Nam là khoảng `[00:00 ngày 1, 00:00 ngày 1 tháng sau)`, múi giờ +07.
  Chỉ gom `BrokerageTransaction.status=RECOGNIZED` theo `recognizedAt` do P3 đặt từ
  thời điểm hoàn tất hợp đồng BR-17; giữ nguyên các ID doanh thu P3 sinh ra.
- Tổng NV = tổng finalFee trong tháng của NV; tổng công ty = tổng finalFee toàn tháng.
  HOA_HONG được chọn theo hiệu lực tại thời điểm cuối tháng. Tra **một** level theo tổng
  doanh thu NV: `[0,10tr):2000`, `[10,15tr):3000`, `[15,20tr):3500`, `[20,30tr):4000`,
  `[30tr,∞):4500` bps. Tiền hoa hồng = `Math.round(revenue * rateBps / 10000)`.
  Phép tính đọc mức đã lưu trong PolicyLevel; lịch BR-18 chỉ là ràng buộc kiểm đầu vào.
- Nhân sự ACTIVE bắt đầu làm trước/cuối kỳ, cùng NV đã có phiếu/doanh thu của kỳ,
  được tính lương. Thiếu baseSalary nguyên không âm hoặc thiếu policy hợp lệ thì từ chối;
  không tự điền chính sách hay lương chưa cấu hình.
- Mỗi phiếu giữ một PayrollAdjustment. Giữ nguyên thưởng/phạt và notes từ P4/nhập tay,
  không cộng lại phạt trễ khi tính lại. Giữ các attendance.adjustmentId P4 đã gắn;
  không sửa attendance, giao dịch hay nghiệp vụ P3/P4. Notes JSON seed và dòng notes P4
  được đọc thành chi tiết trễ/phạt. Không tạo employeeId/payslipId trên adjustment.
- Phiếu chụp baseSalary, tổng doanh thu, rateBps/level của commission, thưởng, khấu trừ,
  chi tiết giao dịch, trễ và số ca hoàn tất (chỉ đọc dữ liệu P4). `netPay = Math.max(0, baseSalary + commission + bonus - deduction)`.
  Điều chỉnh tay chỉ cho phiếu DRAFT/kỳ chưa khóa, làm kỳ về OPEN để yêu cầu tính lại.
- Chốt chỉ từ CALCULATED. Trong cùng vùng tuần tự, đối soát lần cuối để lấy thay đổi P3/P4
  sau lần tính trước, rồi khóa period/commission/adjustment. Chốt không tự duyệt phiếu.
  Phiếu chỉ duyệt/trả sau chốt; khi tất cả phiếu PAID, kỳ chuyển PAID. Đánh dấu đã trả chỉ
  ghi nhận nghiệp vụ, không gửi lệnh chuyển tiền ngân hàng.
- CLOSED/PAID từ chối tính lại/điều chỉnh. P3 vốn kiểm trạng thái kỳ khi hoàn tất hợp đồng;
  P5 dùng chung p3Serial + p4Serial, CAS trên kỳ và durable plan/audit trước mutation.
  Barrier `/data` và startup hoàn tất plan P5 đang dở trước khi tiếp tục nghiệp vụ.
  Retry sau lỗi mạng không nhân đôi tiền/thông báo. Mỗi effect ghi audit trong request/recovery.
  Cơ chế này dành cho **một Express process**, giống P3/P4; chưa hỗ trợ nhiều instance.
- Policy và PolicyLevel được tạo cùng plan, version tăng theo type; mức là `[from,to)`,
  null là không giới hạn; từ chối chồng khoảng, số lẻ/âm và lịch HOA_HONG khác BR-18.
  Bản mới chỉ kích hoạt sau ngày bắt đầu, ngày bắt đầu phải sau bản ACTIVE hiện tại.
  Khi kích hoạt, bản cũ RETIRED (`HET_HIEU_LUC`), effectiveTo được cắt tại effectiveFrom
  bản mới; không thay level/rate của phiếu đã chốt. Phiên bản tương lai giữ DRAFT đến khi
  admin kích hoạt. Không có PUT sửa phiên bản đã dùng.

### Kiểm tra dành cho Claude

```sh
node --check my-server-mongodb/index.js
node --check my-server-mongodb/p5.spec.js
node --check my-server-mongodb/p5.integration.spec.js
node --test my-server-mongodb/p5.spec.js
P5_MONGO_TEST=1 node --test my-server-mongodb/p5.integration.spec.js
cd my-app
npm run build
npm run test:unit
npx playwright test e2e/payroll-p5.spec.ts
```

Integration dùng DB riêng `iHouzzUniP5Test_<uuid>`, giữ fixture sau test, không xóa dữ liệu.
Kiểm: biên 9.999.999/10.000.000/15.000.000/30.000.000 (kèm biên 20tr), công thức và sàn 0,
unique kỳ/E-01, lọc VOID/tháng khác, bonus retry, CALCULATED tính lại, CLOSED từ chối,
P3 không hoàn tất vào kỳ đã khóa, quyền/owner, audit/recovery sau mất phản hồi MongoDB,
duyệt/trả/ngày trả/thông báo và phiên bản policy không đổi snapshot đã trả.

Luồng thật 11/2026 (Git Bash; chạy trên DB làm việc được phép chốt, thao tác chốt không đảo ngược):

```sh
curl -c admin-p5.txt -H 'Content-Type: application/json' -d '{"phone":"0901122334","password":"123"}' http://localhost:3002/user-login
curl -b admin-p5.txt http://localhost:3002/data/admin/payroll-periods
# Seed có luong-11. Chỉ tạo nếu chưa có kỳ; đã có trả 409 PERIOD_EXISTS.
curl -b admin-p5.txt -H 'Content-Type: application/json' -H 'Idempotency-Key: p5-create-2026-11' -d '{"code":"2026-11"}' http://localhost:3002/data/admin/payroll-periods
curl -b admin-p5.txt -H 'Content-Type: application/json' -H 'Idempotency-Key: p5-calculate-11-01' -d '{}' http://localhost:3002/data/admin/payroll-periods/luong-11/calculate
curl -b admin-p5.txt http://localhost:3002/data/admin/payroll-periods/luong-11/payslips
curl -b admin-p5.txt -H 'Content-Type: application/json' -H 'Idempotency-Key: p5-close-2026-11' -d '{}' http://localhost:3002/data/admin/payroll-periods/luong-11/close
curl -b admin-p5.txt -H 'Content-Type: application/json' -H 'Idempotency-Key: p5-recalculate-locked' -d '{}' http://localhost:3002/data/admin/payroll-periods/luong-11/calculate
# Lệnh cuối phải trả 409 PAYROLL_CLOSED. Thay SLIP bằng id từ danh sách phiếu.
curl -b admin-p5.txt -H 'Content-Type: application/json' -H 'Idempotency-Key: p5-approve-slip-01' -d '{}' http://localhost:3002/data/admin/payslips/SLIP/approve
curl -b admin-p5.txt -H 'Content-Type: application/json' -H 'Idempotency-Key: p5-pay-slip-01' -d '{}' http://localhost:3002/data/admin/payslips/SLIP/pay
curl -c employee-p5.txt -H 'Content-Type: application/json' -d '{"phone":"0909876543","password":"123"}' http://localhost:3002/user-login
curl -b employee-p5.txt 'http://localhost:3002/data/me/payslips?period=2026-11'
curl -b employee-p5.txt http://localhost:3002/notifications
curl -b admin-p5.txt 'http://localhost:3002/data/admin/reports/revenue?month=2026-11'
```

Đối chiếu phone ADMIN theo tài khoản seed hiện tại trước khi chạy curl. Trên UI kiểm tạo kỳ,
tính lại, thưởng/phạt, chốt, duyệt/trả từng phiếu; dashboard/report đổi tháng; NV chỉ thấy mình;
tạo/kích hoạt bản policy mới; tắt server kiểm thông báo kết nối; 403/409 và POST mất phản hồi phải báo lỗi.
Build/unit/E2E/Mongo/curl/luồng thật và kiểm render: **SKIPPED (sandbox) — Claude chạy**.

## P6 — Danh mục, nhân viên, khách hàng và nhật ký

Giữ collection PascalCase và các FK chuỗi của DATA-01; không chuyển sang schema đề xuất
lowercase/nhúng ở §3. `Room.images` vẫn là chuỗi URL; `RoomImage` và `PropertySchool` được
đồng bộ cùng bản chiếu trên Room/Property. Không thay seed hay nghiệp vụ P3–P5.

Mọi quyền bên dưới kiểm Account ACTIVE trong MongoDB, không dùng vai trò cũ trong cookie.
Chưa đăng nhập → 401, sai quyền → 403, không có bản ghi → 404, FK/trùng/khóa → 409,
thuộc tính sai → 400. Lỗi FK có `{code:"REFERENCED_RECORD",resource,message,reason}` với
thông báo tiếng Việt theo loại bản ghi, không đưa tên collection/trường ra giao diện.
Phòng còn giữ chỗ/cọc/hợp đồng đang xử lý → 409 `ROOM_HAS_ACTIVE_FLOW`; lịch sử đã kết thúc không chặn xóa (ROOM-01).

| Method | Endpoint | Quyền / body |
| --- | --- | --- |
| GET, POST | `/data/admin/employees` | ADMIN; danh sách / tạo Employee + Account + AccountRole EMPLOYEE |
| GET, PUT, DELETE | `/data/admin/employees/:id` | ADMIN; chi tiết / sửa / chỉ xóa Employee chưa có ca, lương, hồ sơ hay tham chiếu khác; Account giữ lại, DISABLED |
| POST | `/data/admin/employees/:id/deactivate` | ADMIN; Employee INACTIVE, Account DISABLED; giữ ca/lương và lịch sử; điều phối ca dùng luồng P4 hiện có |
| POST | `/data/admin/employees/:id/reset-password` | ADMIN; `{temporaryPassword?}` → `{id,phone,temporaryPassword}` |
| GET, POST | `/data/admin/{owners,properties,schools,brokerage-agreements,work-locations}` | ADMIN; danh sách / tạo |
| GET, PUT, DELETE | `/data/admin/{owners,properties,schools,brokerage-agreements,work-locations}/:id` | ADMIN; xem / sửa / xóa nếu không tham chiếu |
| POST | `/data/admin/{owners,properties,schools,brokerage-agreements,work-locations}/:id/deactivate` | ADMIN; `active:false`; thỏa thuận dùng `{effectiveTo:"YYYY-MM-DD"}` và ENDED |
| POST, PUT, DELETE | `/data/rooms`, `/data/rooms/:id` (DELETE) | ADMIN; API phòng hiện có được bổ sung validation/FK/audit/lịch sử giá; PUT có `body.id` |
| GET, POST, PUT | `/data/rooms/:id/images` | ADMIN; GET metadata; POST `{url}` hoặc `{images:string[]}` thêm; PUT `{images:string[]}` thay thư viện và thứ tự, ảnh đầu là bìa |
| PUT | `/data/rooms/:id/images/order` | ADMIN; `{imageIds:string[]}` phải là hoán vị đầy đủ của thư viện |
| PUT | `/data/rooms/:id/images/:imageId/cover` | ADMIN; đưa ảnh lên đầu và đặt bìa duy nhất |
| DELETE | `/data/rooms/:id/images/:imageId` | ADMIN; gỡ metadata/URL; tự chọn ảnh đầu còn lại làm bìa |
| GET | `/data/rooms/:id/price-history` | ADMIN; mới nhất trước; không có API sửa/xóa lịch sử |
| GET | `/data/admin/customers` | ADMIN; danh sách không chứa identity/CCCD |
| GET | `/data/admin/customers/:id` | ADMIN hoặc EMPLOYEE phụ trách qua Viewing/Deposit/Hold; CCCD chỉ hiện 4 số cuối; người khác → 403 |
| GET | `/audit-logs?entityType=Room&actorId=admin&from=2026-11-01&to=2026-11-30&page=1&limit=20` | ADMIN; lọc bảng/người/ngày VN, phân trang `{items,total,page,limit,pages}`; limit 1–100 |
| POST | `/api/upload/rooms`, `/api/upload/schools` (cổng 3000) | Upload hiện có ở my-server; multipart `file` → `{url}`; lưu URL vào API metadata ADMIN bên trên |

### Thuộc tính và tính nhất quán

- Employee: fullName 2–120, phone chuẩn hóa `+84` → `0` (10 chữ số, unique toàn bộ Account),
  email hợp lệ/không trùng, birthDate/startDate là ngày tồn tại, sinh trước hôm nay,
  ngày vào làm từ ngày sinh đến hôm nay; gender FEMALE/MALE/OTHER, position;
  contractType chỉ nhận FULL_TIME (Toàn thời gian), PART_TIME (Bán thời gian), INTERNSHIP
  (Thực tập); giá trị khác khi tạo/sửa trả 400 `INVALID_CONTRACT_TYPE`.
  status ACTIVE/ON_LEAVE/INACTIVE; baseSalary null hoặc số nguyên VND không âm.
  Mã NV sinh qua Counter, không nhận accountId/role/employeeCode từ body. WorkLocation chỉ là FK của Shift.
  Tạo trả `{employee,phone,temporaryPassword}`; mật khẩu scrypt/salt ngẫu nhiên tương thích login hiện có.
- Khi gửi `Idempotency-Key` cho tạo/reset nhân viên, phải gửi `temporaryPassword` dài 8–128;
  retry dùng lại cùng nội dung. Không có key có thể để server sinh mật khẩu. FE tự sinh một
  mật khẩu và giữ nguyên khi retry, chỉ hiển thị kết quả trong phiên; không ghi mật khẩu rõ vào audit/localStorage.
- Owner: fullName, phone; note tùy chọn. Property: name/addressLine/ward/district/province;
  lat/lng hợp lệ hoặc cùng null; locationStatus estimated/sourced/pending. School:
  name/campus/address/lat/lng/source, logoUrl tùy chọn. WorkLocation: name/address/lat/lng,
  allowedRadiusM > 0. Tọa độ đồng bộ GeoJSON `[lng,lat]`; đổi Property/School hoặc ngưng hoạt động
  tính lại PropertySchool và nearbySchools; khoảng cách haversine ×1.3, chỉ giữ ≤8.000 m,
  ước lượng xe máy 25 km/h như seed. Nguồn khoảng cách được lưu rõ.
- Thỏa thuận: roomId hợp lệ, ownerId khớp chủ phòng, effectiveFrom bắt buộc,
  effectiveTo null hoặc ≥ effectiveFrom. Hai đầu ngày **bao gồm** theo P3; không cho chồng
  khoảng kể cả bản ENDED để giữ lịch sử. Đổi bản mới phải kết thúc bản cũ trước ngày bắt đầu.
  DATA-PLAN cố định PERCENT_OF_MONTHLY_RENT/5000 (50%); không mở chính sách phí mới.
  Bản đã có giao dịch không đổi phòng/chủ/ngày bắt đầu/phí.
- Phòng kiểm Property/Owner, codeNormalized unique và số căn normalized unique/tòa;
  không ghi đè lock/hasHistory/trạng thái tiền từ body. Đổi price hoặc monthlyRent đồng bộ
  cả hai và tự thêm RoomPriceHistory, ghi changedBy/reason; không sửa bản lịch sử trước.
  Giá/cọc/phí là số nguyên không âm (giá thuê >0); area/capacity >0.
- Thư viện ≤15 URL duy nhất, không nhận base64/đường dẫn ngoài `/assets/rooms` hoặc
  `/uploads/rooms`. Thư viện có ảnh luôn đúng một bìa; phòng PUBLISHED không được hết ảnh;
  DRAFT/HIDDEN được phép thư viện rỗng. Xóa metadata không xóa file vật lý dùng chung ở my-server.
  Xóa phòng lưu snapshot lịch sử rồi xóa Favorite, RoomImage, RoomPriceHistory và Room
  trong P6Operation; từng effect có audit và recovery. Không xóa file ảnh vật lý trên my-server.
  GET `/data/rooms/:id` giữ `hasHistory` để mô tả lịch sử và thêm `hasActiveFlow` cho dialog xóa.
  Chỉ các trạng thái đang xử lý nêu trong ROOM-01 chặn xóa; ảnh/lịch sử giá không chặn.
- Ngưng hoạt động giữ các FK hiện có; bản ghi inactive không được dùng cho liên kết mới.
  Employee không xóa cứng khi đã có ca/lương. Owner/Property/School/WorkLocation/Agreement còn
  tham chiếu trả 409 kèm lý do; không cascade hồ sơ vận hành.

P2 đã có audit cho đăng ký/AccountRole/Customer, favorites, tư vấn, Viewing/ViewingDetail,
notification; P3/P4/P5 đã ghi audit trong các plan nghiệp vụ và recovery. P6 bổ sung toàn bộ
CRUD phòng/danh mục, Account/AccountRole nhân viên, ảnh, giá và các liên kết phát sinh.
`/audit-logs` chỉ trả event, loại P3Operation–P6Operation và các trường kỹ thuật; loại hash/salt/
mật khẩu đệ quy, kể cả trong before/after. Không có API ghi AuditLog trực tiếp.

P6 dùng chung thứ tự khóa P3 → P4 → P2 trong **một Express process**, standalone MongoDB.
Intent P6Operation được lưu trước mutation, có cursor/token để replay effects/audit sau lỗi;
recovery chạy trước khi phục vụ request/startup. Plan riêng có hash/salt để khôi phục tài khoản,
không công khai và được gỡ sau khi hoàn tất. Không thay thế transaction nhiều collection,
không hỗ trợ nhiều instance. FE ghi API thành công rồi mới nhận dữ liệu vào màn hình;
403/409 và POST mất phản hồi không chuyển thành lưu cục bộ thành công. Retry giữ key/nội dung.

### Giao diện và kiểm tra dành cho Claude

Vào `/admin/rooms` → **Quản lý danh mục & nhật ký**, hoặc `/admin/catalog/{owners,properties,
schools,brokerage-agreements,work-locations,customers,audit-logs}`. Giữ sidebar/layout và NgModule.
Nhân sự dùng API ở màn danh sách/form/chi tiết; tạo/reset hiển thị mật khẩu tạm có nút ẩn.
Form phòng có chọn chủ, thư viện ảnh dùng uploader hiện có, trang sửa có lịch sử giá.
Khi server tắt, hiển thị lỗi kết nối; danh mục và audit chỉ lấy qua API.
Các JSON seed chỉ đọc, không sửa hoặc sinh lại. Từ điển Claude Docs không truy cập được trong
phiên triển khai; validation đối chiếu DATA-PLAN, §4/§9 và seed đang có trong repository.

```sh
node --check my-server-mongodb/index.js
node --check my-server-mongodb/p6.spec.js
node --check my-server-mongodb/p6.integration.spec.js
# Claude chạy ngoài sandbox:
node --test my-server-mongodb/p6.spec.js
P6_MONGO_TEST=1 node --test my-server-mongodb/p6.integration.spec.js
cd my-app
npm run build
npm run test:unit
npx playwright test e2e/catalog-p6.spec.ts
```

Integration chỉ tạo DB riêng `iHouzzUniP6Test_<uuid>`, giữ fixture sau chạy, không drop DB/seed.
Phủ RBAC, phone unique, tạo/reset/ngưng NV, FK/409, tọa độ/8 km, thỏa thuận không chồng,
ảnh/15/bìa/sắp xếp, giá/retry, CCCD, audit và recovery sau mất phản hồi MongoDB.
Frontend spec phủ 403/409, mất kết nối, không lưu cục bộ khi API từ chối, key/mật khẩu retry.
HTTP fixtures không thay kiểm tra luồng API thật và ảnh desktop.

Ví dụ curl (Git Bash, thay ROOM/OWNER bằng id thực; dùng tài khoản ADMIN seed localhost):

```sh
curl -c admin-p6.txt -H 'Content-Type: application/json' -d '{"phone":"0901122334","password":"123"}' http://localhost:3002/user-login
curl -b admin-p6.txt http://localhost:3002/data/admin/owners
curl -b admin-p6.txt -X DELETE http://localhost:3002/data/admin/owners/OWNER
# Chủ có phòng phải trả 409 với reason; không xóa dữ liệu tham chiếu.
curl -b admin-p6.txt -X DELETE http://localhost:3002/data/rooms/ROOM
# Phòng có hợp đồng/cọc/lịch sử phải trả 409.
curl -b admin-p6.txt 'http://localhost:3002/audit-logs?entityType=Room&actorId=admin&page=1&limit=20'
curl -b admin-p6.txt http://localhost:3002/data/admin/customers
```

**checks: SKIPPED (sandbox) — Claude chạy build/unit/e2e + curl ràng buộc 409 + luồng thật + render UI.**


## REAL-02 — Nhân viên chỉ dùng API

### Endpoint mới và quyền

| Method | Endpoint (:3002) | Quyền / dữ liệu |
| --- | --- | --- |
| GET | `/data/me/employee` | EMPLOYEE đang hoạt động, lấy Employee từ session/Account hiện tại; whitelist thông tin hồ sơ, không trả `baseSalary`. |
| POST | `/data/customers/identity-context` | EMPLOYEE đang lập cọc; body `{ customerPhone, roomId }`. Khách phải có tài khoản CUSTOMER hoạt động. Phòng phải đang khả dụng hoặc có giữ chỗ hiệu lực đúng khách; không nhận giữ chỗ của nhân viên khác. Tạo ngữ cảnh trên session, ràng buộc nhân viên/khách/phòng, hạn 30 phút; trả hồ sơ khách cho form CCCD. Giữ chỗ chưa có người phụ trách được nhận bởi nhân viên này và ghi AuditLog. |
| PUT | `/data/customers/:id/identity` | ADMIN hoặc EMPLOYEE phụ trách khách qua lịch xem/giữ chỗ/cọc, hoặc có ngữ cảnh lập cọc hợp lệ. Body `{ idNumber, issuedOn, issuedBy, permanentAddress, frontImageUrl, backImageUrl }`; cần `Idempotency-Key`. Dùng journal/recovery P3 để lưu Customer cùng AuditLog. |

CCCD được ánh xạ sang `Customer.identity.{number,issuedDate,issuedPlace,frontImage,backImage}` và `Customer.permanentAddress` theo từ điển dữ liệu. Số CCCD là chuỗi đúng 12 chữ số, có unique partial index trên `identity.number`; ngày cấp là ngày lịch hợp lệ, không trong tương lai. Cần nơi cấp, địa chỉ thường trú và đủ hai ảnh. URL ảnh phải thuộc `/uploads/cccd/`, định dạng JPG/JPEG/PNG/WebP và file đã tồn tại trong `my-server/public`. Upload dùng endpoint đã có **POST `/api/upload/cccd` (:3000)**; không cần thêm thư mục hay sửa `my-server/index.js`. Hồ sơ thiếu CCCD không thể tạo cọc (`CUSTOMER_IDENTITY_REQUIRED`). CCCD đầy đủ chỉ được trả cho ADMIN hoặc nhân viên có quyền với khách.

**POST ngữ cảnh là thao tác bắt đầu lập cọc, không phải API danh sách khách.** Nhân viên nhập đúng số điện thoại tài khoản khách và chọn phòng trước, tải hồ sơ rồi lưu CCCD. Khi giữ chỗ chưa có người phụ trách, thao tác này nhận hồ sơ để xem lịch sử và khấu trừ khoản giữ chỗ đã CONFIRMED vào cọc; không xác nhận lại thanh toán giữ chỗ. Không cho đổi nhân viên của hồ sơ đã có người phụ trách.

### Endpoint hiện có được siết / nối giao diện

- `/data/holds/creditable`, `/data/payments`, các endpoint chi tiết/biên lai và confirm/reject giữ chỗ: nhân viên chỉ nhận hoặc xử lý hồ sơ của mình; ADMIN giữ quyền đọc đã có. Hợp đồng/cọc/doanh thu/lương tiếp tục lọc theo nhân viên trên session.
- Cọc dùng CASH hoặc BANK_TRANSFER. Chuyển khoản phải có `bankTransactionRef` trước khi ghi nhận tiền cọc và trước khi xác nhận; mã ngân hàng có unique index P3 hiện có. Không có QR hay tài khoản nhận tiền tự dựng.
- Layout đọc `/data/me/employee`; chuông đọc `/notifications` và dùng PUT `/notifications/:id/read`, `/notifications/read-all` hiện có.
- Đăng ký ca, hủy ca, check-in/out, trạng thái công việc và lương dùng P4/P5; check-in cần GPS thiết bị và File upload thật. Công việc bàn giao và tổng lương/hoa hồng/khấu trừ lấy từ phản hồi server.
- `/employee/deals` là route danh sách; ID hồ sơ/hợp đồng và link biên lai lấy từ API. Danh sách bao gồm cọc chưa lập hợp đồng và cọc đã bỏ, không mất lịch sử khi bỏ cọc trước khi lập hợp đồng.
- Khi mất kết nối, dữ liệu lỗi không được thay bằng dữ liệu cục bộ. Thông báo dùng `api-message`. Key chống gửi trùng và nội dung check-in chưa rõ kết quả được giữ trong bộ nhớ cho lần thử lại cùng thao tác; không lưu hồ sơ nghiệp vụ vào browser storage. Sau tải lại trang, tải trạng thái hiện tại từ API trước khi thao tác tiếp.

### File đổi / thêm / xóa

Tiền tố frontend: `my-app/src/app/`.

| Nhóm | File |
| --- | --- |
| Employee module / routing | `employee/employee-module.ts`, `employee/employee-routing-module.ts` |
| Employee components (TS, HTML và spec tương ứng) | `deposit-payment`, `employee-cash-receipt`, `employee-check-in`, `employee-check-out`, `employee-deal-detail`, `employee-deposit-new`, `employee-forfeiture`, `employee-layout`, `employee-payroll`, `employee-qr-receipt`, `employee-shift-list`, `employee-shift-register`, `employee-shift-tasks` trong `employee/<tên>/<tên>.{ts,html,spec.ts}` |
| CSS | `employee/deposit-payment/deposit-payment.css` (bỏ tên lớp của QR giả; dùng stylesheet ngoài component) |
| HTTP helper / spec mới | `employee/employee-http-testing.ts`, `employee/employee-layout/employee-layout.spec.ts`, `services/employee-api.spec.ts`, `services/employee-attendance.spec.ts` |
| Services | `services/money-service.ts`, `deposit-service.ts`, `deal-service.ts`, `shift-service.ts`, `shift-apiservice.ts`, `attendance-service.ts`, `task-service.ts`, `payroll-service.ts`, `payroll-apiservice.ts` |
| Service specs | `services/money-service.spec.ts`, `shift-apiservice.spec.ts`, `payroll-service.spec.ts`, `payroll-apiservice.spec.ts` |
| Classes | `classes/Deposit.ts`, `classes/Deal.ts`, `classes/Money.ts`, `classes/ShiftApi.ts` |
| Backend | `my-server-mongodb/index.js`, `my-server-mongodb/README.md` |
| Ngoài phạm vi, chỉ tháo phụ thuộc | `services/workflows.spec.ts`: bỏ lời gọi các hàm cục bộ đã xóa, thay các khẳng định nghiệp vụ nhân viên bằng HTTP suites nêu trên; giữ suite customer REAL-01 và phần admin cũ. `admin/admin-dashboard/admin-dashboard.ts`, `admin/admin-payroll/admin-payroll.ts`, `admin/admin-reports/admin-reports.ts`: adapter tối thiểu cho `periodView(code)` sau khi bỏ tham số dữ liệu dự phòng; giữ phần dữ liệu admin để REAL-04 xử lý. |

Không xóa file; không sửa DemoStore, dữ liệu khởi tạo MongoDB, customer/login/register/shared. Các nhánh tạo/xác nhận/đăng ký/chấm công/đổi trạng thái cục bộ đã được loại khỏi services nhân viên. Spec dùng HttpTestingController và dữ liệu HTTP độc lập.

### Kiểm tra REAL-02

- `node --check my-server-mongodb/index.js`: PASS.
- `node my-app/node_modules/typescript/bin/tsc -p my-app/tsconfig.spec.json --noEmit`: PASS (bao gồm source và spec).
- `node my-app/node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p my-app/tsconfig.app.json --noEmit`: PASS (TS và template, không spawn esbuild).
- Prettier trên các file frontend đã sửa: PASS.
- Rà `employee/**` và services phạm vi: không còn tham chiếu nguồn dữ liệu cục bộ bị loại, từ khóa bị cấm hoặc link giao dịch cố định.
- Kiểm tra Node với collection giả lập trong bộ nhớ, không kết nối database: quyền session, whitelist hồ sơ, ngữ cảnh lập cọc, validation CCCD/unique/path/file, plan AuditLog P3, lọc và từ chối xử lý payment của nhân viên khác: PASS.
- Build/unit/E2E/render: **SKIPPED (sandbox) — Claude chạy**. Chưa kiểm chứng MongoDB thực tế, trình duyệt/GPS/camera/upload và bố cục render. Review UI dựa trên source theo skill `ihouzz-ui-ux`, không kết luận hình thức thực tế.

## REAL-04 — Dashboard và báo cáo quản trị

Hai GET dưới đây yêu cầu session **ADMIN** (401 nếu hết phiên, 403 nếu khác vai trò), gửi cookie credentials.
Dùng read barrier P3/P4/P5 trước khi đọc; không ghi hoặc tạo collection mới.

- `GET /data/admin/summary?month=YYYY-MM`: giữ các trường tài chính P5 (doanh thu môi giới hợp đồng đã ghi nhận, hoa hồng từ phiếu lương) của tháng; thêm `asOf`, `rooms: {total, byStatus, occupancy}`, `activeStaff` (Employee ACTIVE), `pendingDeposits`, `pendingDepositAmount`, `today: {date, shifts, assignments, checkedIn, checkedOut, late, absent}`. Hàng chờ = Deposit chưa có adminReview, tương ứng trang duyệt. Ngày hiện tại theo Asia/Ho_Chi_Minh, phân ca CANCELLED bị loại; late so checkInAt với startsAt. `month` sai trả 400 INVALID_PERIOD. Chỉ trường tài chính phụ thuộc tháng; phòng/nhân sự/hàng chờ/chấm công là hiện trạng.
- **Mới:** `GET /data/admin/reports/occupancy`: trả `asOf`, `date`, `total`, `byStatus`, `occupancy`, `depositCount`, `contractCount`, `rows`. Mỗi dòng nhóm theo `propertyId` và `roomType`, có tên tòa, số phòng theo trạng thái, số cọc, `depositRequired`, `depositConfirmed`, số hợp đồng. Occupancy = RENTED / tổng phòng (0 nếu chưa có phòng); không suy lịch sử lấp đầy. Hợp đồng SIGNED/COMPLETED và startDate <= hôm nay <= endDate; cọc PAYMENT_PENDING/PAID hoặc CONTRACTED gắn hợp đồng hiện hành. Tiền đã xác nhận = holdCredit + các Payment DEPOSIT CONFIRMED của hồ sơ, không dùng totalRequired làm tiền đã thu.

Frontend dùng `/notifications` cho chuông; `/data/admin/work-locations` cho GPS và `/data/admin/policies` cho phiên bản PHAT_TRE. Duyệt cọc chỉ qua POST `/data/admin/deposits/:id/review`; đối soát tiền thuộc nhân viên. Không có duyệt nhanh trên dashboard, gia hạn/yêu cầu bổ sung/phân bổ quỹ hay cấu hình trong trình duyệt. Lương chỉ dùng API P5.

Không thay data JSON hoặc checksum trong REAL-04. Build/unit và kiểm tra MongoDB thật: Claude chạy ngoài sandbox.

## ROOM-01 — chỉ đăng phòng trống, lưu lịch sử khi xóa (08/11/2026)

- Khách/guest đọc danh sách, tìm kiếm, chi tiết theo id/slug chỉ thấy Room có
  `status=AVAILABLE` và `publicationStatus=PUBLISHED`. Không còn phòng phù hợp trả
  danh sách rỗng; chi tiết trả 404 `ROOM_UNAVAILABLE` với thông báo tiếng Việt.
  Session ADMIN/EMPLOYEE được kiểm tra vai trò hiện tại trong DB và vẫn đọc đủ trạng thái;
  trang quản lý Admin dùng dữ liệu này. Danh sách/trang chủ/bản đồ/gợi ý phía khách chỉ lấy
  AVAILABLE/PUBLISHED, kể cả khi catalog được nạp bằng session nhân viên.
- Đăng mới hoặc đăng lại PUBLISHED chỉ khi AVAILABLE; sai trả 409 `ROOM_NOT_AVAILABLE`.
  Không sửa trạng thái 50 phòng sẵn có trong task này; script dữ liệu do Claude thực hiện riêng.
- `/data/contracts/:id/complete` lưu `roomSnapshot` rồi xóa phòng trong **cùng P3Operation**
  với hoàn tất hợp đồng và ghi nhận doanh thu. ADMIN xóa phòng dùng cùng hàm
  `deleteRoomWithSnapshot` trong P6Operation hiện có. Snapshot gồm
  `{id, code, name, type, address, propertyId, propertyName, ownerId, monthlyRent, area, capacity}`,
  có địa chỉ/tên tòa dự phòng từ Property.
- Snapshot được ghi vào Contract, Deposit, mọi Hold, BrokerageTransaction (kể cả giao dịch
  cũ chỉ liên kết qua contractId), BrokerageAgreement và ViewingDetail; bản chiếu rooms
  trong Viewing cũng được cập nhật. BrokerageAgreement ACTIVE chuyển ENDED.
  Receipt và snapshot thu tiền đã phát hành giữ nguyên. Favorite, RoomImage,
  RoomPriceHistory và Room được xóa; AuditLog ghi DELETE và journal phát lại an toàn.
- Chặn 409 `ROOM_HAS_ACTIVE_FLOW` nếu còn Hold PAYMENT_PENDING/ACTIVE,
  Deposit PAYMENT_PENDING/PAID hoặc Contract DRAFT/SIGNED. Luồng complete chỉ miễn
  hợp đồng SIGNED đang được hoàn tất; hồ sơ hoạt động khác vẫn chặn.
  Thay mã `ROOM_HAS_HISTORY`; lịch sử đã kết thúc không chặn. Dialog hiển thị lý do tiếng Việt.
- **Không xóa file ảnh** trong `my-server/public/uploads/rooms`; chỉ xóa metadata DB.
  Lịch sử hiển thị mã/tên/địa chỉ từ roomSnapshot khi không tìm được Room, không tạo
  liên kết trang phòng. Biên lai giữ snapshot gốc; thông báo và chi tiết giao dịch lương
  cũng có thông tin lưu trữ. Occupancy/summary phòng chỉ tính Room còn tồn tại;
  doanh thu và hợp đồng lịch sử vẫn tính từ giao dịch như trước.
- Hold mới có `number` từ `p3Number('GC', now)`, dạng `GC-YYYYMM-NNNN` theo tháng Việt Nam.
  Nội dung chuyển khoản, sao chép, phiếu/biên lai/danh sách dùng number; Hold cũ thiếu
  number dùng id. Receipt mới giữ `holdNumber`, không sửa receipt cũ.
  Hold mới và DTO đọc Hold/cọc/hợp đồng có thông tin phòng dự phòng để mở lại thanh toán
  khi Room HELD đã bị lọc khỏi catalog. Giữ nguyên hạn 15 phút/48 giờ, ba kênh, tự xác nhận,
  khấu trừ một lần và nút Về trang chủ của BOOK-01.

Kiểm tra mock, không kết nối DB hoặc sửa seed:
`node D:/Front_end_web2_tai-lieu/tests/backend/room-01.spec.js` → 14/14 PASS (file kiểm thử để ngoài đồ án). Chạy trực tiếp để tránh
Node test runner mặc định spawn tiến trình con (`node --test` bị sandbox chặn EPERM).
Bao gồm lọc công khai/quyền hiện tại, sáu trạng thái chặn xóa, snapshot/receipt,
khôi phục P3/P6 sau lỗi xóa Room, doanh thu không lặp, số GC/cũ thiếu số, đăng lại,
occupancy và thông báo/chi tiết lương khi phòng đã bị xóa.
`node --check my-server-mongodb/index.js`, TypeScript `--noEmit`, Angular compiler
`ngc --noEmit`: PASS. Build/unit Angular/E2E/render: **SKIPPED (sandbox) — Claude chạy**.
Chưa kiểm chứng MongoDB thật hoặc giao diện trên trình duyệt; đánh giá UI dựa trên source.

### File thay đổi ROOM-01

49 file; không sửa dữ liệu JSON/checksum, auth/login/register, map-search hoặc CSS.
Đường dẫn frontend dưới đây tính từ `my-app/src/app/`; dấu `{}` liệt kê chính xác
các đuôi/tên file đã đổi, không bao gồm file khác trong cùng thư mục.

| Nhóm | File |
| --- | --- |
| Backend | `my-server-mongodb/index.js`, `my-server-mongodb/README.md` |
| Classes | `classes/{Room,Money,Booking,Deposit,Deal,CustomerApi,Viewing,Notification}.ts` |
| Services | `services/{room-service,deposit-service,deal-service,viewing-service,admin-room-service,admin-catalog-apiservice,notification-service,api-message}.ts` |
| Service specs | `services/{admin-room-service,room-apiservice,workflows}.spec.ts` |
| Giữ chỗ/biên lai khách | `customer/customer-booking-new/customer-booking-new.{ts,html,spec.ts}`, `customer/customer-booking-receipt/customer-booking-receipt.{ts,html,spec.ts}` |
| Chi tiết phòng/lịch xem | `customer/customer-room-detail/customer-room-detail.{ts,html,spec.ts}`, `customer/customer-viewing-new/customer-viewing-new.html`, `customer/customer-home/customer-home.spec.ts` |
| Hợp đồng/cọc nhân viên | `employee/employee-deal-detail/employee-deal-detail.{ts,html}`, `employee/employee-forfeiture/employee-forfeiture.{ts,html}`, `employee/deposit-payment/deposit-payment.{ts,html}`, `employee/employee-deposit-new/employee-deposit-new.html` |
| Xóa phòng/phê duyệt Admin | `admin/admin-room-delete-confirm/admin-room-delete-confirm.{ts,html,spec.ts}`, `admin/admin-room-list/admin-room-list.{ts,spec.ts}`, `admin/admin-approvals/admin-approvals.{ts,html}` |
| Fixture kiểm tra | `employee/employee-http-testing.ts`, `testing/frame-fixture.ts` |
