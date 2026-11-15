import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-icon',
  standalone: false,
  templateUrl: './icon.html',
  styleUrls: ['./icon.css'],
})
export class IconComponent {
  @Input() name = 'home';
  @Input() size = 18;
  paths: Record<string, string> = {
    home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    lock: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3',
    eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    'eye-off':
      'm3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.1 3.7M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7c1.1 0 2.1-.2 3-.5',
    search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    heart:
      'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    calendar: 'M4 5h16v16H4zM16 3v4M8 3v4M4 11h16M8 15h2m4 0h2M8 18h2',
    clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
    building: 'M4 21V3h12v18M16 9h4v12M2 21h20M8 7h4M8 11h4M8 15h4M9 21v-3',
    user: 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    users:
      'M16 21v-2a6 6 0 0 0-12 0v2M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M18 4a4 4 0 0 1 0 8M20 15a5 5 0 0 1 2 4v2',
    wallet: 'M3 6h17v15H3zM3 6V3h14v3M15 11h6v5h-6z',
    check: 'm5 12 4 4L19 6',
    close: 'm6 6 12 12M6 18 18 6',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    chevron: 'm9 5 7 7-7 7',
    plus: 'M12 5v14M5 12h14',
    download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
    edit: 'm15 4 5 5M3 21l5-1L21 7l-5-5L3 15z',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
    image: 'M3 3h18v18H3zM3 16l6-6 6 6 3-3 3 3M17 7h.01',
    bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21h4',
    chart: 'M3 3v18h18M7 17v-5m5 5V7m5 10v-8',
    file: 'M14 2H4v20h16V8zM14 2v6h6M8 12h8M8 16h8',
    shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6',
    logout: 'M9 3H3v18h6M10 12h12m-5-5 5 5-5 5',
    filter: 'M3 5h18M6 12h12M10 19h4',
    area: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
    phone: 'M22 16v4c0 2-3 2-5 1C10 18 6 14 3 7 2 5 2 2 4 2h4l2 5-3 2c2 4 4 6 8 8l2-3z',
    info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 11v6M12 7h.01',
    star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    flame:
      'M13 2c1 4-1 6-3 8-1-1-1-2-1-3-3 2-5 5-5 9a8 8 0 0 0 16 0c0-4-2-7-7-14Zm-1 17a3 3 0 0 1-3-3c0-1 1-2 2-3 0 1 1 2 2 2 1-1 1-2 1-3 1 1 2 2 2 4a4 4 0 0 1-4 3Z',
  };
}
