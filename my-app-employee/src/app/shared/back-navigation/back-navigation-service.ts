import { Injectable, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class BackNavigationService {
  private router = inject(Router);
  private location = inject(Location);
  private entries: { id: number; url: string }[] = [];
  private index = -1;
  private restoredId: number | undefined;
  private replace = false;
  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.restoredId = event.restoredState?.navigationId;
        this.replace = !!this.router.getCurrentNavigation()?.extras.replaceUrl;
      }
      if (event instanceof NavigationEnd) {
        const entry = { id: event.id, url: event.urlAfterRedirects };
        const restored = this.entries.findIndex((item) => item.id === this.restoredId);
        if (restored >= 0) {
          this.index = restored;
          this.entries[restored] = entry;
        } else if (this.replace && this.index >= 0) this.entries[this.index] = entry;
        else {
          this.entries = this.entries.slice(0, ++this.index);
          this.entries.push(entry);
        }
      }
    });
  }
  back(fallback: string) {
    const previous = this.entries[this.index - 1];
    if (
      previous &&
      !/^\/(login|register|forgot-password|access-denied)(?:[/?#]|$)/.test(previous.url)
    )
      this.location.back();
    else void this.router.navigateByUrl(fallback, { replaceUrl: true });
  }
}
