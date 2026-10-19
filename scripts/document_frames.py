from pathlib import Path
import json,re

root=Path(__file__).resolve().parents[1]
inventory=json.loads((root/'docs/asset-inventory.json').read_text(encoding='utf-8'))
reference_indexes=[2,1,3,6,5,23,22,26,11,12,18,19,14,7,4,21,27,20,16,8,10,25,24,15,13,9,17]
routes=[
('/employee/shifts/:id/tasks','Check-in → đánh dấu công việc → bàn giao ca'),
('/employee/shifts/:id/check-in','Ca đã đăng ký → chọn ảnh → check-in'),
('/employee/shifts/:id/check-out','Trong ca → ghi bàn giao → kết thúc → ca tiếp theo'),
('/employee/payroll','Menu bảng lương → chọn kỳ → in'),
('/employee/deposits/new','Menu báo cọc → nhập hồ sơ → xác nhận QR/tiền mặt'),
('/employee/deposits/:id/qr-receipt','Hồ sơ cọc → QR demo → xác nhận → in'),
('/employee/deposits/:id/cash-receipt','Hồ sơ cọc → tiền mặt demo → xác nhận → in'),
('/employee/shifts/register','Chọn ca còn chỗ → đăng ký ngay → ca của tôi'),
('/employee/deals/:id','Danh sách giao dịch → nhận nhà/bỏ cọc'),
('/employee/deals/:id/forfeiture','Giao dịch đã có cọc → nhập lý do → xử lý → in'),
('/','Guest → tìm kiếm → danh sách/chi tiết → đăng ký/đăng nhập'),
('/rooms','Bộ lọc → danh sách → phân trang/chi tiết'),
('/favorites','Header yêu thích → xem/bỏ lưu phòng'),
('/rooms/:id','Danh sách → ảnh/tiện ích → đặt lịch/giữ chỗ'),
('/bookings/new?roomId=:id','Phòng → tạo yêu cầu → xác nhận thanh toán demo'),
('/bookings/:id/receipt','Giữ chỗ đã xác nhận → xem tham chiếu → in/PDF'),
('/viewings/new?roomId=:id','Phòng → chọn nhiều phòng → chọn giờ → xác nhận/hủy'),
('/admin','Đăng nhập admin → phòng/nhân sự/giao dịch/báo cáo'),
('/admin/rooms/new/duplicate','Lưu mã/số phòng trùng → sửa dữ liệu → lưu lại'),
('/admin/rooms/:id/edit','Danh sách → sửa → lưu → dialog hoàn tất'),
('/admin/rooms','Dashboard/sidebar → lọc/thêm/sửa/ảnh/ẩn/xóa'),
('/admin/rooms · dialog xác nhận','Nút ẩn/xóa → xác nhận ẩn hoặc xóa → toast; Escape để đóng'),
('/admin/rooms · toast kết quả','Ẩn/xóa thành công → đọc trạng thái → đóng toast'),
('/admin/rooms/:id/images','Danh sách/sửa → tải/sắp xếp/chọn ảnh bìa/xóa ảnh → lưu'),
('/admin/rooms?saved=:id · dialog kết quả','Lưu thêm/sửa/ảnh → tiếp tục thêm hoặc về danh sách'),
('/admin/staff','Dashboard/sidebar → tìm nhân viên → xem hồ sơ'),
('/admin/rooms/new','Thêm mới → nhập thông tin → kiểm tra trùng → lưu')]
prompt=(root/'Prompt_Codex_Angular_iHOUZZ_Uni.md').read_text(encoding='utf-8')
rows=[]
for line in prompt.splitlines():
    if not re.match(r'\| \d{2} \|',line):continue
    parts=[s.strip().strip('`') for s in line.split('|')[1:-1]]
    number=int(parts[0]); cls=parts[2]
    candidates=[p for p in (root/'src/app/features').glob('*/*/*-frame.component.ts') if f'export class {cls} ' in p.read_text(encoding='utf-8')]
    if len(candidates)!=1:raise RuntimeError(f'Expected one component for {cls}: {candidates}')
    ts=candidates[0];base=str(ts.relative_to(root)).replace('\\','/').removesuffix('.ts')
    files=[base+ext for ext in ['.ts','.html','.css','.spec.ts']]
    assert all((root/p).is_file() for p in files)
    rows.append({'number':number,'frame':parts[1],'reference':inventory[reference_indexes[number-1]-1]['path'].replace('\\','/'),'component':cls,'files':files,'route':routes[number-1][0],'flow':routes[number-1][1],'status':'Đã triển khai; đủ 4 file và test render'})
(root/'docs/frame-map.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
md=['# Bảng đối chiếu 27 frame iHOUZZ Uni','', 'Kiểm kê: 27 PNG tham chiếu, 27 component frame riêng, 108 file bắt buộc. Các component Auth/Layout/Shared bổ sung nằm ngoài bảng này. Ảnh gốc giữ nguyên trong hai thư mục người dùng cung cấp.','', '| # | Ảnh frame | Component | Bốn file riêng | Route / trạng thái | Thao tác vào / ra | Kết quả |','|---|---|---|---|---|---|---|']
for row in rows:
    links=' · '.join(f'[{ext}](../{path})' for ext,path in zip(['TS','HTML','CSS','SPEC'],row['files']))
    md.append(f"| {row['number']:02d} | {row['frame']} | `{row['component']}` | {links} | `{row['route']}` | {row['flow']} | Hoàn thành demo |")
md+=['','## Điều chỉnh so với route gợi ý','','- Frame 19 dùng child path `/admin/rooms/new/duplicate` để có component độc lập. Dữ liệu nhập được giữ trong `AdminRoomService.draft` khi chuyển từ form bình thường.','- Frame 22, 23, 25 là ba component riêng được mở trên danh sách phòng; không cần ba URL độc lập.','- `:id` trong check-in/tasks/check-out luôn là `employeeShiftId`, không phải ID ca dùng chung.','- `/login`, `/register`, `/employee/shifts`, `/about`, `/contact`, `/admin/reports`, trang 404 và không có quyền được thêm ngoài 27 frame.','- Các frame ảnh chụp “đã thu/đã thanh toán” chỉ hiển thị trạng thái xác nhận sau khi bấm thao tác mô phỏng, theo yêu cầu không giả giao dịch thật.','','## Tài nguyên và giới hạn đối chiếu','','- Đã tìm thấy đủ 27 ảnh. Hai tên có dấu `/` nằm trong thư mục con do cách xuất: frame trang chủ và chi tiết phòng.','- Danh mục ảnh và kích thước: [asset-inventory.json](asset-inventory.json). Bản đồ nguồn ảnh → URL: [assets.json](assets.json).','- Không có PowerPoint, Figma link/file, logo vector, font riêng, QR thanh toán hợp lệ hoặc API trong workspace. Logo/icon được dựng bằng SVG/HTML/CSS; ảnh phòng/nhân sự dùng tài nguyên được cấp.','- Một số ảnh thành phần xuất từ Figma đã chứa viền/thanh công cụ trong chính ảnh gốc. Không đặt ảnh nguyên frame làm nền hoặc thay HTML.','- Bản đồ trang chủ là mô hình HTML/CSS có nhãn demo; bản đồ chi tiết dùng ảnh thành phần tham khảo. Không cung cấp tọa độ hay khoảng cách giả.','- Phòng mới chưa có ảnh hiển thị SVG “Chưa có ảnh phòng · Demo”.','- Số liệu dashboard tính từ dữ liệu demo hiện tại; không sao chép số liệu screenshot thành giao dịch thật.','- Ảnh UI kiểm tra ở [screenshots](screenshots/); giao diện bám bố cục, màu và thành phần của frame, chưa có phép đo pixel-diff tự động.']
(root/'docs/FRAME_MAP.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
print(f'Frame mapping: {len(rows)}/27; component files: {sum(len(r["files"]) for r in rows)}/108')
