import { CommonModule } from '@angular/common';
import { Component, HostListener, input, output, signal } from '@angular/core';

export type DropdownItem = { label: string; value: string };

@Component({
  selector: 'ui-dropdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative inline-block text-left">
      <button
        type="button"
        class="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-text-primary hover-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        {{ label() }}
      </button>
      <ul
        *ngIf="open()"
        role="menu"
        class="absolute right-0 z-40 mt-2 min-w-44 rounded-md border border-border bg-surface p-1 shadow-elevated"
      >
        <li *ngFor="let item of items()">
          <button
            type="button"
            role="menuitem"
            class="w-full rounded-sm px-3 py-2 text-left text-sm text-text-primary transition-smooth hover:bg-primary/15"
            (click)="select(item.value)"
          >
            {{ item.label }}
          </button>
        </li>
      </ul>
    </div>
  `
})
export class UiDropdownComponent {
  public readonly label = input('Actions');
  public readonly items = input<DropdownItem[]>([]);
  public readonly itemSelected = output<string>();
  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected select(value: string): void {
    this.itemSelected.emit(value);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event.target'])
  protected closeOnOutsideClick(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement) || !target.closest('ui-dropdown')) {
      this.open.set(false);
    }
  }
}
