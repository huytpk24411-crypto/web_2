import { HttpErrorResponse } from '@angular/common/http';
import { isApiUnavailable } from './api-fallback';

export const CONNECTION_ERROR = 'Không kết nối được máy chủ. Vui lòng thử lại.';
const messages: Record<string, string> = {
  PAYMENT_GATEWAY_NOT_CONFIGURED: 'Chưa cấu hình cổng thanh toán. Vui lòng liên hệ nhân viên.',
  PAYMENT_GATEWAY_REQUIRED: 'Vui lòng thanh toán qua cổng ngân hàng.',
  INVALID_SIGNATURE: 'Chữ ký thanh toán không hợp lệ.',
  FLOW_CHANGED: 'Quy trình cọc đã thay đổi.',
  CONTRACT_NOT_SIGNED: 'Hợp đồng chưa ký.',
  ALREADY_DECIDED: 'Hợp đồng này đã được xác nhận.',
  PAYROLL_CLOSED: 'Kỳ lương tháng này đã đóng, không ghi được doanh thu.',
  WRONG_PORTAL: 'Tài khoản này không được đăng nhập tại khu vực này.',
  ROOM_LOCKED: 'Phòng vừa được khách khác giữ chỗ',
  ROOM_UNAVAILABLE: 'Phòng hiện không còn trống hoặc tin đã ngừng đăng.',
  ROOM_HAS_ACTIVE_FLOW:
    'Phòng còn giữ chỗ, cọc hoặc hợp đồng đang xử lý. Hãy kết thúc hồ sơ trước khi xóa.',
  HOLD_EXPIRED: 'Đã hết thời gian thanh toán. Vui lòng tạo yêu cầu giữ chỗ mới.',
  POLICY_NOT_CONFIGURED: 'Chưa có mức tiền giữ chỗ hiệu lực. Vui lòng liên hệ nhân viên.',
  INVALID_CONTACT: 'Vui lòng kiểm tra họ tên và số điện thoại liên hệ.',
  INVALID_MOVE_IN: 'Ngày nhận phòng không hợp lệ.',
  INVALID_TRANSITION: 'Trạng thái đã thay đổi. Vui lòng tải lại hồ sơ.',
  PAYMENT_ALREADY_EXISTS: 'Đã có khoản thanh toán cho yêu cầu này. Vui lòng tải lại hồ sơ.',
  BANK_REFERENCE_CONFLICT: 'Mã giao dịch ngân hàng đã được sử dụng.',
  IDEMPOTENCY_CONFLICT: 'Mã yêu cầu đã được dùng với nội dung khác.',
  INVALID_METHOD: 'Phương thức thanh toán không hợp lệ.',
  AMOUNT_MISMATCH: 'Số tiền không khớp yêu cầu. Vui lòng tải lại hồ sơ.',
};
export function apiMessage(error: unknown, fallback: string): string {
  // This configured gateway rejection is actionable even though it uses HTTP 503.
  if (error instanceof HttpErrorResponse && error.status === 503) {
    try {
      const body = typeof error.error === 'string' ? JSON.parse(error.error) : error.error;
      if (body?.code === 'PAYMENT_GATEWAY_NOT_CONFIGURED') return messages[body.code];
    } catch {}
  }
  if (isApiUnavailable(error)) return CONNECTION_ERROR;
  if (error instanceof HttpErrorResponse) {
    let body = error.error;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    if (body?.code && messages[body.code]) return messages[body.code];
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.status === 404) return 'Không tìm thấy bản ghi. Vui lòng tải lại danh sách.';
    if (error.status === 409)
      return 'Dữ liệu đã thay đổi hoặc yêu cầu bị trùng. Vui lòng kiểm tra lại.';
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
