# Bản đồ, dữ liệu và ảnh phòng — 09/10/2026

## Phạm vi và nguồn

- Leaflet **1.9.4**, leaflet.markercluster **1.5.3**, tile `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Không dùng Google Maps, AdvancedMarkerElement, Map ID, API key hoặc billing. Marker trường dùng `L.divIcon` chứa logo gốc; chỉ logo trên map, tên/cơ sở có nhãn truy cập và panel.
- 13 logo gốc trong `figma_images/school-logos-thu-duc/school-logos/` được giữ nguyên, sao chép vào `public/assets/schools/`. 11 cơ sở có tọa độ tâm polygon OSM trong [school-locations.json](school-locations.json), kèm URL nguồn. Bản chụp dữ liệu gốc: [osm-universities.json](osm-universities.json). Đây là dữ liệu cộng đồng, không phải xác minh thực địa hay tọa độ cổng trường.
- UEL và UTH chưa được ghép đúng bản ghi cơ sở trong tập dữ liệu đã lấy, nên **chưa đặt marker**; logo đã có. Không nhầm Phân hiệu ĐH Giao thông vận tải (UTC) với ĐH Giao thông vận tải TP.HCM (UTH).
- Chủ đồ án đã cho phép minh họa tòa nhà trong khi chờ MongoDB. 7 tòa, 12 phòng, tọa độ tòa và quan hệ trường–tòa đều là **demo**. `locationStatus: 'demo'`, `demo: true` được ghi trong catalog. Các phòng Nestro dùng p1, Mona dùng p2; các địa chỉ Đường số 2/KTX B/Tô Hiệu/Vành Đai/Đào Sư Tích có propertyId riêng. Đây là cấu hình minh họa, không suy diễn thành dữ liệu bất động sản thật.
- Tọa độ tòa demo là offset từ trường để thử marker; không dùng để chỉ đường, tính khoảng cách hoặc thời gian đi bộ. `LocationService.distance()` chỉ trả số với `locationStatus: 'sourced'`. Chưa có dữ liệu khoảng cách đáng tin nên UI không bật lọc bán kính/sắp xếp gần trường cho seed demo.
- 4 ảnh tòa minh họa từ frame cũ: asset-112/115/114/119.jpg. Tòa còn thiếu ảnh mặt ngoài có thông báo, không dùng ảnh nội thất làm mặt ngoài.

## Ảnh và logo

- [room-media-map.json](room-media-map.json) là bảng `roomId/code → file nguồn → URL → cover`. 26/32 ảnh mới được dùng thành 12 gallery minh họa; mỗi ảnh chỉ thuộc một gallery. Nhóm theo nội thất tương ứng để trình diễn, **chưa phải phép ghép đã được chủ phòng xác nhận**. r6 và r12 chỉ có 1 ảnh; không hiển thị nút chuyển ảnh/timer giả.
- [room-assets-pending.json](room-assets-pending.json) ghi 6 ảnh chưa đủ căn cứ ghép (bao gồm ảnh phòng tắm). Không gắn thêm vào gallery chỉ để tăng số lượng. [room-assets-contact.jpg](room-assets-contact.jpg) giúp đối chiếu toàn bộ ảnh mới.
- `scripts/prepare-demo-media.py` tạo WebP tối đa 1400 × 1050, giữ tỷ lệ, không sửa nội dung. Các PNG gốc vẫn nguyên vẹn. Ảnh bìa luôn là phần tử đầu `Room.images`, dùng chung ở card/panel/chi tiết; chỉnh bìa qua admin cập nhật cùng nguồn.
- BrandComponent dùng **file PNG gốc** `ihouzz-uni-logo-draft.png` ở header/footer. Không vẽ lại hoặc bọc PNG rồi gọi là vector. Cần SVG/AI chính thức nếu muốn logo vector cuối cùng. Hai màu nhận diện trong CSS: xanh #0057ec, cam #ff481c; CTA dùng sắc đỏ cam đậm để dễ đọc. Logo trắng (USSH/UFM) đặt trên nền navy bên trong vòng trắng, không đổi màu logo.

## Cấu trúc và đồng bộ

- `models/domain.ts`: Property, School, PropertySchool, Room.propertyId.
- `data/properties.ts`, `schools.ts`, `rooms.ts`, `room-media.ts`: dữ liệu tập trung; không rải tọa độ trong template.
- `LocationService`: join tòa–trường, kiểm tra tọa độ, Haversine chỉ với nguồn đáng tin.
- `RoomService.filter` + `RoomSearchService`: chung cho map, Trang chủ, `/rooms`. URL lưu q, district, school, property, type, minPrice/maxPrice, minArea/maxArea, capacity, amenities, status, bounds, sort. Giá/diện tích min > max có lỗi; bỏ lọc khôi phục kết quả. School/property có dropdown tìm kiếm.
- `MapSearchComponent`: Leaflet lifecycle, marker/cluster hai kiểu, lớp trường/tòa, phòng trống, khung nhìn mặc định từ tọa độ trường, tìm trong vùng, panel, trạng thái tile lỗi.
- `RoomFiltersComponent`, `SearchSelectComponent`, `RoomCardComponent`, `RoomGalleryComponent`, `ImageFallbackDirective` tách trách nhiệm. Frame components vẫn giữ đủ bốn file.
- Nút Quay lại chỉ nhận `from` cùng ứng dụng với path `/` hoặc `/rooms`; giữ query, chặn URL ngoài. Truy cập trực tiếp về `/rooms`.
- Hover 1,3 giây/ảnh, reset ảnh bìa khi rời, hủy timer khi destroy/đổi room; reduced motion dùng nút thủ công. Gallery có thumbnail, trái/phải/Escape, focus trap và phục hồi focus.

## Migration localStorage

Giữ key `ihouzz-demo-v1`, thêm `catalogVersion: 3`. Snapshot cũ sao lưu tại `ihouzz-demo-before-catalog-v3` trước khi cập nhật ảnh, propertyId, địa chỉ, khu vực, mô tả của **seed room có ID khớp**. Giữ ID phòng, trạng thái HELD/RENTED/HIDDEN, giá đã sửa, favorites, lịch hẹn, booking, cọc, thanh toán, nhân sự và phòng admin tự tạo. Room seed đã xóa không được tự chèn lại. Bản migration thay bộ ảnh seed cũ (kể cả ảnh admin từng chỉnh); có bản sao để đối chiếu. Sau migration lần đầu, ảnh admin chỉnh mới được giữ. Khi quota storage đầy, migration vẫn dùng được trong bộ nhớ và không reset nghiệp vụ.

## Nối backend MongoDB sau

API trả `Property[]`, `School[]`, `PropertySchool[]`, `Room[]` theo các model hiện có. Đổi nguồn trong LocationService/RoomService, tránh gọi API riêng trong card/map. Chỉ chuyển tòa sang `locationStatus: 'sourced'` sau khi có lat/lng và `locationSource`; `images` của Property phải là ảnh tòa, Room.images là ảnh đúng phòng theo thứ tự bìa. Join PropertySchool cần nguồn; không tự tạo gần trường theo tên. Khi có dữ liệu thật, thay nhãn demo của từng bản ghi bằng metadata tương ứng. Backend phải là nguồn có thẩm quyền cho trạng thái phòng và giao dịch.

## Cấu hình local và HTTP referrer

```powershell
cd D:\Front_end_web2
npm.cmd ci
npm.cmd start -- --open
```

Mở http://127.0.0.1:4200. Giữ cấu hình `prebundle: false` để tránh lỗi rename cache Vite trên máy Windows này. Leaflet tải từ npm; chỉ tile OSM cần Internet. Không có `.env` chứa key cần điền.

OSM public tiles **không có key và không có dashboard để giới hạn HTTP referrer**. Không thể giả lập hạn chế key như Google Cloud. Trình duyệt cần gửi Referer hợp lệ; không đặt `Referrer-Policy: no-referrer` cho tile. Khi triển khai có thể dùng `strict-origin-when-cross-origin`; nếu CSP thì cho phép `img-src 'self' data: blob: https://tile.openstreetmap.org`. Giữ attribution luôn nhìn thấy. Không tải hàng loạt, prefetch/offline cache tile hoặc bỏ qua HTTP cache. Public tile không có SLA; khi tải lớn phải dùng nhà cung cấp phù hợp hoặc tự host. Nếu sau này đổi sang nhà cung cấp có token, đặt allowed origins/referrers tại dashboard của nhà cung cấp cho localhost và domain thật, không hardcode secret.

Nguồn kỹ thuật: [Leaflet quick start](https://leafletjs.com/examples/quick-start/), [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/), [OSM attribution](https://www.openstreetmap.org/copyright).

## Kiểm chứng

Lệnh: `npm run build`, `npm run test:unit`, `npm run test:e2e`, `npm run check:frames`.

`e2e/map-gallery.spec.ts` dùng Chromium và **tile OSM thật**, ghi [map-network-validation.json](map-network-validation.json). Một test riêng chặn tile có chủ đích để kiểm tra lỗi mạng không làm mất danh sách phòng. Không có Google API để kiểm tra.

Ảnh: `screenshots/home-leaflet-1440.png`, `home-leaflet-768.png`, `home-leaflet-390.png`, `home-mobile-top.png`, `map-selected-school.png`, `map-selected-property.png`, `room-gallery-detail.png`. Bố cục đối chiếu ảnh mẫu: map đầu trang, bộ lọc, HOT 4 cột, danh sách 4 cột, trường, 3 bước, CTA, tòa demo, FAQ, footer. Thay phần đối tác giả bằng tòa/FAQ; tablet 2 cột, mobile 1 cột.
