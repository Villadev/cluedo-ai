import { CommonModule } from '@angular/common';
import { Component, HostListener, input, output, signal } from '@angular/core';

export type MenuAction = { label: string; action: string; tone?: 'default' | 'danger' };

@Component({
  selector: 'ui-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative inline-flex">
      <button
        type="button"
        class="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-secondary transition-smooth hover:text-text-primary"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
        (click)="open.update((v) => !v)"
      >
        {{ triggerLabel() }}
      </button>
      <div *ngIf="open()" role="menu" class="absolute right-0 top-11 z-50 min-w-48 rounded-md border border-border bg-surface p-1 shadow-elevated">
        <button
          *ngFor="let menuAction of actions()"
          type="button"
          role="menuitem"
          class="w-full rounded-sm px-3 py-2 text-left text-sm transition-smooth hover:bg-primary/10"
          [ngClass]="menuAction.tone === 'danger' ? 'text-danger' : 'text-text-primary'"
          (click)="onAction(menuAction.action)"
        >
          {{ menuAction.label }}
        </button>
      </div>
    </div>
  `
})
export class UiMenuComponent {
  public readonly triggerLabel = input('Menu');
  public readonly actions = input<MenuAction[]>([]);
  public readonly actionTriggered = output<string>();
  protected readonly open = signal(false);

  protected onAction(action: string): void {
    this.actionTriggered.emit(action);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event.target'])
  protected closeOnOutsideClick(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement) || !target.closest('ui-menu')) {
      this.open.set(false);
    }
  }
}
