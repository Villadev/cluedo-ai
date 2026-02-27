import { CommonModule } from '@angular/common';
import { Component, effect, input, signal } from '@angular/core';

export type TabItem = { id: string; label: string; content: string };

@Component({
  selector: 'ui-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <div role="tablist" class="flex flex-wrap gap-2 border-b border-border pb-2">
        <button
          *ngFor="let tab of tabs()"
          type="button"
          role="tab"
          [attr.aria-selected]="activeTab() === tab.id"
          [attr.aria-controls]="'panel-' + tab.id"
          (click)="activeTab.set(tab.id)"
          class="rounded-md px-3 py-1.5 text-sm transition-smooth"
          [ngClass]="activeTab() === tab.id ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface'"
        >
          {{ tab.label }}
        </button>
      </div>

      <section
        *ngFor="let tab of tabs()"
        [id]="'panel-' + tab.id"
        role="tabpanel"
        [hidden]="activeTab() !== tab.id"
        class="pt-3 text-sm text-text-secondary"
      >
        {{ tab.content }}
      </section>
    </div>
  `
})
export class UiTabsComponent {
  public readonly tabs = input<TabItem[]>([]);
  protected readonly activeTab = signal('');

  public constructor() {
    effect(() => {
      const availableTabs = this.tabs();
      if (availableTabs.length > 0 && !availableTabs.some((tab) => tab.id === this.activeTab())) {
        this.activeTab.set(availableTabs[0].id);
      }
    });
  }
}
