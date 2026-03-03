import { CommonModule } from '@angular/common';
import { Component, input, signal } from '@angular/core';

export type NavItem = { label: string; icon: string; active?: boolean };

@Component({
  selector: 'ui-app-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-bg text-text-primary">
      <div class="flex min-h-screen">
        <aside
          class="fixed inset-y-0 left-0 z-40 w-72 border-r border-gray-200 bg-surface p-4 transition-smooth md:static md:translate-x-0"
          [ngClass]="sidebarOpen() ? 'translate-x-0' : '-translate-x-full md:translate-x-0'"
        >
          <div class="mb-8 flex items-center gap-3">
            <div class="h-10 w-10 rounded-md bg-primary/20 ring-1 ring-primary/40"></div>
            <div>
              <p class="text-xs uppercase tracking-[0.25em] text-text-secondary">Cluedo AI</p>
              <p class="text-lg font-semibold">{{ title() }}</p>
            </div>
          </div>

          <nav class="space-y-2" aria-label="Primary">
            <button
              *ngFor="let item of navItems()"
              type="button"
              class="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-sm transition-smooth"
              [ngClass]="item.active ? 'border-primary/40 bg-primary/15 text-text-primary' : 'border-transparent text-text-secondary hover:border-gray-200 hover:bg-bg'"
            >
              <span aria-hidden="true">{{ item.icon }}</span>
              {{ item.label }}
            </button>
          </nav>
        </aside>

        <div class="flex flex-1 flex-col md:pl-0">
          <header class="sticky top-0 z-30 border-b border-gray-200 bg-bg/90 backdrop-blur">
            <div class="ui-container flex h-16 items-center justify-between">
              <button
                type="button"
                class="rounded-md border border-gray-200 p-2 text-text-secondary md:hidden"
                aria-label="Toggle navigation"
                (click)="sidebarOpen.update((v) => !v)"
              >
                ☰
              </button>
              <h1 class="text-lg font-semibold">{{ subtitle() }}</h1>
              <ng-content select="[topbar-actions]" />
            </div>
          </header>

          <main class="ui-container flex-1 py-6 sm:py-8">
            <ng-content />
          </main>
        </div>
      </div>
    </div>
  `
})
export class UiAppShellComponent {
  public readonly title = input('Mystery Board');
  public readonly subtitle = input('Overview');
  public readonly navItems = input<NavItem[]>([]);
  protected readonly sidebarOpen = signal(false);
}
