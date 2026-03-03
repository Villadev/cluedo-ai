import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, OnInit, inject } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { SidebarModule } from 'primeng/sidebar';
import { TopbarComponent } from './topbar.component';
import { SidebarComponent } from './sidebar.component';
import { MenuService } from './menu.service';

@Component({
  selector: 'ui-app-layout',
  standalone: true,
  imports: [CommonModule, SidebarModule, TopbarComponent, SidebarComponent],
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.scss'
})
export class AppLayoutComponent implements OnInit {
  @Input({ required: true }) appTitle = '';
  @Input({ required: true }) menuItems: MenuItem[] = [];

  protected readonly menuService = inject(MenuService);
  protected isDesktop = true;

  ngOnInit(): void {
    this.updateViewportState();
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.updateViewportState();
  }

  protected toggleMenu(): void {
    if (this.isDesktop) {
      return;
    }

    this.menuService.toggleMobileMenu();
  }

  protected closeMobileMenu(): void {
    this.menuService.closeMobileMenu();
  }

  private updateViewportState(): void {
    this.isDesktop = window.innerWidth >= 992;
    if (this.isDesktop) {
      this.menuService.closeMobileMenu();
    }
  }
}
