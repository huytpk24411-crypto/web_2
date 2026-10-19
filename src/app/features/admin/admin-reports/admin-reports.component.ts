import { Component, inject } from '@angular/core';
import { DemoStore } from '../../../services/demo-store.service';
import { demoCsv, downloadDemo } from '../admin-finance-demo';

interface SystemConfig {
  radius: number;
  grace: number;
  lateFine: number;
  absentFine: number;
  deduct: boolean;
  portrait: boolean;
  holdHours: number;
  overdue: string;
  forfeiture: number;
  electricity: number;
  water: number;
  parking: number;
  cleaning: number;
  internet: number;
  maintenance: number;
  occupancyTarget: number;
  revenueTarget: number;
  staffExport: boolean;
  requireApproval: boolean;
}
interface AuditEntry {
  title: string;
  time: string;
  detail: string;
}
const DEFAULT_CONFIG: SystemConfig = {
  radius: 50,
  grace: 5,
  lateFine: 50000,
  absentFine: 100000,
  deduct: true,
  portrait: true,
  holdHours: 24,
  overdue: 'release',
  forfeiture: 100,
  electricity: 3500,
  water: 100000,
  parking: 100000,
  cleaning: 150000,
  internet: 0,
  maintenance: 50000,
  occupancyTarget: 95,
  revenueTarget: 430000000,
  staffExport: false,
  requireApproval: true,
};
const STORAGE_KEY = 'ihouzz-admin-system-config-v1';
@Component({
  selector: 'app-admin-reports',
  standalone: false,
  templateUrl: './admin-reports.component.html',
  styleUrls: ['../admin-finance-ui.css', './admin-reports.component.css'],
})
export class AdminReportsComponent {
  store = inject(DemoStore);
  config = { ...DEFAULT_CONFIG };
  private saved = JSON.stringify(DEFAULT_CONFIG);
  toast = '';
  error = '';
  activeTab = 'gps';
  savedAt = '';
  confirmReset = false;
  dialog: 'restore' | 'history' | 'report' | null = null;
  report = 'occupancy';
  audit: AuditEntry[] = [
    {
      title: 'Cập nhật phạt đi trễ v2.4',
      time: '08:30 hôm nay',
      detail:
        'Admin Nguyễn Tuấn Kiệt điều chỉnh mức phạt >30p từ 80k lên 100k. Đã áp dụng toàn hệ thống mẫu.',
    },
    {
      title: 'Tự động xả cọc phòng C2-205',
      time: 'Hôm qua 18:00',
      detail:
        'Bot kích hoạt tịch thu cọc 100% (2.200.000 đ) do quá hạn 72h theo quy chế. Đã gửi biên bản điện tử mẫu.',
    },
    {
      title: 'Đồng bộ hạn ngạch Wifi',
      time: '02 ngày trước',
      detail: 'Hệ thống nâng cấp miễn phí Mesh 500Mbps cho tòa Nhà Phố Dĩ An Căn A12.',
    },
  ];
  readonly tabs = [
    { id: 'gps', icon: 'pin', label: '1. Chấm công GPS & Phạt trễ' },
    { id: 'deposit', icon: 'wallet', label: '2. Quy chế Giữ cọc & Hạn duyệt UNC' },
    { id: 'occupancy', icon: 'chart', label: '3. Tỷ lệ Lấp đầy & Doanh thu' },
    { id: 'permissions', icon: 'shield', label: '4. Phân quyền' },
  ];
  readonly utilities: {
    key: 'electricity' | 'water' | 'parking' | 'cleaning' | 'internet' | 'maintenance';
    title: string;
    icon: string;
    unit: string;
    note: string;
  }[] = [
    {
      key: 'electricity',
      title: 'Điện sinh hoạt tiêu chuẩn',
      icon: 'flame',
      unit: 'đ / kWh',
      note: 'Theo công tơ điện tử từng tầng',
    },
    {
      key: 'water',
      title: 'Nước sinh hoạt KTX',
      icon: 'area',
      unit: 'đ / người',
      note: 'Khoán định mức nước theo đầu người',
    },
    {
      key: 'parking',
      title: 'Phí gửi xe máy giữ thẻ',
      icon: 'lock',
      unit: 'đ / xe',
      note: 'Thẻ NFC hầm giữ xe an ninh 24/7',
    },
    {
      key: 'cleaning',
      title: 'Vệ sinh hành lang & rác',
      icon: 'building',
      unit: 'đ / phòng',
      note: 'Dọn dẹp khu công cộng mỗi ngày',
    },
    {
      key: 'internet',
      title: 'Internet Wifi Mesh SV',
      icon: 'area',
      unit: 'đ / tháng',
      note: 'Băng thông 500Mbps nội bộ tòa nhà',
    },
    {
      key: 'maintenance',
      title: 'Bảo vệ & Thang máy',
      icon: 'shield',
      unit: 'đ / phòng',
      note: 'Bảo dưỡng định kỳ thang Mitsubishi',
    },
  ];
  constructor() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (
        stored?.config &&
        Object.keys(DEFAULT_CONFIG).every(
          (key) => typeof stored.config[key] === typeof DEFAULT_CONFIG[key as keyof SystemConfig],
        )
      ) {
        this.config = Object.fromEntries(
          Object.keys(DEFAULT_CONFIG).map((key) => [key, stored.config[key]]),
        ) as unknown as SystemConfig;
        if (this.validationError()) this.config = { ...DEFAULT_CONFIG };
        else {
          this.savedAt = typeof stored.savedAt === 'string' ? stored.savedAt : '';
          if (Array.isArray(stored.audit))
            this.audit = stored.audit
              .filter(
                (a: AuditEntry) =>
                  typeof a.title === 'string' &&
                  typeof a.time === 'string' &&
                  typeof a.detail === 'string',
              )
              .slice(0, 30);
        }
      }
      this.saved = JSON.stringify(this.config);
    } catch {
      this.toast = 'Không đọc được cấu hình đã lưu; đang dùng cấu hình mặc định.';
    }
  }
  get dirty() {
    return JSON.stringify(this.config) !== this.saved;
  }
  tab(id: string) {
    this.activeTab = id;
    setTimeout(
      () =>
        document
          .getElementById('config-' + id)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      0,
    );
  }
  validationError() {
    for (const [key, value] of Object.entries(this.config)) {
      if (
        typeof DEFAULT_CONFIG[key as keyof SystemConfig] === 'number' &&
        (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      )
        return 'Vui lòng nhập các giá trị số hợp lệ, không âm.';
    }
    if (this.config.radius < 1 || this.config.radius > 5000)
      return 'Bán kính GPS phải từ 1 đến 5.000 mét.';
    if (this.config.grace > 60) return 'Thời gian miễn trừ GPS tối đa 60 phút.';
    if (this.config.holdHours < 1 || this.config.holdHours > 168)
      return 'Thời hạn giữ chỗ phải từ 1 đến 168 giờ.';
    if (this.config.forfeiture > 100 || this.config.occupancyTarget > 100)
      return 'Các tỷ lệ phần trăm phải từ 0 đến 100.';
    if (!['release', 'review'].includes(this.config.overdue))
      return 'Hãy chọn cách xử lý khi quá hạn UNC.';
    return '';
  }
  save() {
    this.error = this.validationError();
    if (this.error) {
      this.toast = this.error;
      return;
    }
    const time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const previous = JSON.parse(this.saved);
    const changed = Object.keys(DEFAULT_CONFIG).filter(
      (key) => this.config[key as keyof SystemConfig] !== previous[key],
    );
    const entry = {
      title: 'Lưu cấu hình hệ thống',
      time,
      detail: changed.length
        ? `Đã cập nhật ${changed.length} thiết lập trong bản demo: ${changed.join(', ')}.`
        : 'Đã xác nhận giữ nguyên cấu hình hiện tại.',
    };
    const nextAudit = [entry, ...this.audit].slice(0, 30);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ config: this.config, savedAt: time, audit: nextAudit }),
      );
      this.audit = nextAudit;
      this.savedAt = time;
      this.saved = JSON.stringify(this.config);
      this.toast = 'Đã lưu tất cả cấu hình thành công trên trình duyệt này.';
    } catch {
      this.error = 'Không thể lưu cấu hình vào bộ nhớ trình duyệt. Các thay đổi vẫn chưa được lưu.';
      this.toast = this.error;
    }
  }
  restore() {
    this.config = { ...DEFAULT_CONFIG };
    this.dialog = null;
    this.error = '';
    this.toast = 'Đã khôi phục giá trị mặc định. Nhấn Lưu để áp dụng.';
  }
  backup() {
    downloadDemo(
      'ihouzz-cau-hinh-demo.json',
      JSON.stringify(
        { config: this.config, savedAt: this.savedAt, unsaved: this.dirty, audit: this.audit },
        null,
        2,
      ),
      'application/json',
    );
    this.toast = 'Đã sao lưu cấu hình hiện tại sang JSON.';
  }
  exportReport() {
    const rows: (string | number)[][] =
      this.report === 'occupancy'
        ? [
            ['Cụm tòa', 'Phòng có khách', 'Tổng phòng'],
            ['KTX Hoàng Diệu', 74, 80],
            ['ĐHQG Khu B', 64, 70],
            ['Nhà Phố Dĩ An', 38, 40],
          ]
        : [
            ['Chỉ số', 'Giá trị'],
            ['Doanh thu tháng 03/2026', 386400000],
            ['Hoa hồng', 38640000],
            ['Cọc bảo chứng', 32400000],
          ];
    downloadDemo('ihouzz-bao-cao-' + this.report + '.csv', demoCsv(rows));
    this.toast = 'Đã xuất báo cáo mẫu sang CSV.';
  }
  reset() {
    this.store.reset();
    this.confirmReset = false;
    this.toast = 'Đã đặt lại dữ liệu thử nghiệm của các luồng cũ.';
  }
}
