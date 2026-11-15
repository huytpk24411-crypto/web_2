// Ứng dụng này là cổng quản trị.
// Ba cổng (khách hàng 4200, nhân viên 4201, quản trị 4202) chạy riêng nhưng dùng chung API và MongoDB;
// proxy gửi kèm tên cổng để server giữ phiên đăng nhập riêng cho từng cổng.
export const PORTAL: 'customer' | 'employee' | 'admin' = 'admin';
export const REMEMBER_COOKIE = 'remember_user_admin';
