import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MenuService {
  readonly mobileMenuVisible = signal(false);

  toggleMobileMenu(): void {
    this.mobileMenuVisible.update((visible) => !visible);
  }

  closeMobileMenu(): void {
    this.mobileMenuVisible.set(false);
  }
}
