# Cấu hình SMS đặt lại mật khẩu

Ba cổng customer, employee, admin dùng chung API `/auth/password-reset/request`,
`/verify`, `/complete`. Backend hỗ trợ kết nối trực tiếp eSMS bằng HTTPS POST.
Không cần cài SDK hoặc dựng dịch vụ trung gian để dùng eSMS.

## Đăng ký tên gửi và mẫu tin

Lấy ApiKey, SecretKey từ Quản lý API. Với tên gửi riêng, liên hệ hỗ trợ eSMS để
được cấp Brandname, loại SMS và mẫu OTP đã được kích hoạt trên tài khoản.
Không tự dùng tên iHOUZZ Uni trước khi được cấp quyền gửi.

Nội dung đề xuất gửi hỗ trợ (chưa phải mẫu đã duyệt):

> Tôi cần gửi mã OTP đặt lại mật khẩu cho website iHOUZZ Uni, muốn đăng ký tên gửi
> iHOUZZ Uni. Xin hướng dẫn thủ tục, báo giá, xác nhận Brandname và kích hoạt gửi
> qua API OTP/CSKH (SmsType 2). Mẫu đề xuất: CODE la ma dat lai mat khau iHOUZZ Uni
> cua ban. Ma co hieu luc 5 phut. Khong chia se ma nay.

Giữ nguyên mẫu cuối cùng eSMS duyệt. Khi cấu hình website, thay chỉ vị trí mã
biến động bằng `{PIN}`. Backend không tự chọn mẫu thử nghiệm.

## Cấu hình trên máy

Mở `my-server-mongodb/.env` và điền các trường dưới đây. Giữ nguyên cấu hình
MongoDB/thanh toán đang có. Khóa API chỉ nằm ở backend, không điền vào mã Angular,
không gửi khóa trong chat và không commit `.env`.

```dotenv
SMS_PROVIDER=esms
ESMS_API_KEY=<ApiKey được cấp>
ESMS_SECRET_KEY=<SecretKey được cấp>
ESMS_BRANDNAME=<tên gửi chính xác đã kích hoạt>
ESMS_SMS_TYPE=2
ESMS_IS_UNICODE=0
ESMS_OTP_TEMPLATE="<mẫu không dấu đã duyệt, thay vị trí CODE bằng {PIN}>"
PASSWORD_RESET_SECRET=<khóa ngẫu nhiên riêng ít nhất 32 ký tự>
```

Nếu mẫu được duyệt có dấu, dùng `ESMS_IS_UNICODE=1` theo cấu hình eSMS.
Không đổi nội dung/Brandname tùy ý. Kết nối này hỗ trợ API OTP/CSKH loại `2`;
nếu eSMS cấp loại khác, cần đối chiếu API trước khi kích hoạt.
`PASSWORD_RESET_SECRET` phải độc lập với ApiKey/SecretKey. Nếu đã được chuẩn bị
trong `.env`, giữ nguyên khóa này.

Khởi động lại API local cổng 3002 sau khi lưu. Mở đúng cổng đăng nhập của tài
khoản có số điện thoại của bạn trong MongoDB, chọn Quên mật khẩu và gửi mã.
Tin thật sử dụng số dư eSMS theo gói được cấp. Nhập PIN nhận được, đặt mật khẩu
mới rồi đăng nhập lại. Không thử gửi bằng tài khoản demo mang số của người khác.

## Khi chưa nhận tin

- Thiếu cấu hình: chức năng vẫn bị khóa và trả HTTP 503.
- eSMS từ chối: backend không kích hoạt PIN và không tự thử gửi lại.
- `CodeResult=100` kèm `SMSID` chỉ xác nhận eSMS tiếp nhận yêu cầu, chưa bảo đảm
  điện thoại đã nhận tin. Kiểm tra báo cáo gửi tin trong tài khoản eSMS.
- Kiểm tra mẫu đã duyệt, Brandname hoạt động, số dư và quyền gửi của tài khoản.
- Chờ ít nhất 60 giây giữa hai lần yêu cầu; tối đa 5 yêu cầu/số điện thoại/giờ.

Endpoint cố định:
`https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/`.
Khóa nằm trong JSON POST, không nằm trên URL. Mỗi tin có RequestId riêng, timeout
10 giây, `Sandbox=0`. Không có chế độ trả PIN giả/ghi PIN vào log. Các bài test
chỉ mô phỏng HTTP và không gửi SMS tính phí.

PIN gồm 6 chữ số, hạn 5 phút, tối đa 5 lần xác minh, băm HMAC trong MongoDB.
Xác minh đúng cấp quyền đổi mật khẩu một lần, hạn 5 phút. Mã mới hủy mã/quyền
cũ của cùng số điện thoại/cổng; đổi mật khẩu hủy phiên đăng nhập cũ.
`PasswordReset`, `PasswordResetLimit` có TTL và kiểm tra hạn trong truy vấn.
Giới hạn lưu trong MongoDB nên không mất khi API khởi động lại.

## Gateway tùy chỉnh trước đây

Nếu có dịch vụ trung gian riêng: đặt `SMS_PROVIDER=gateway`,
`SMS_GATEWAY_URL=https://<adapter>/send`, `SMS_GATEWAY_TOKEN=<token>` và
`PASSWORD_RESET_SECRET`. Adapter nhận JSON `{phone,message,purpose}` qua POST
Bearer token, trả HTTP thành công và `{accepted:true}` sau khi nhà cung cấp chấp
nhận tin. Không trỏ gateway này thẳng đến eSMS vì hợp đồng API khác nhau.

Tài liệu: https://developers.esms.vn/esms-api/ham-gui-tin/tin-nhan-sms-otp-cskh
