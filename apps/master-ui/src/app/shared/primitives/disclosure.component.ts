import { CommonModule } from '@angular/common';
import { Component, input, signal } from '@angular/core';

@Component({
  selector: 'ui-disclosure',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-md border border-gray-200 bg-surface/60">
      <button
        type="button"
        class="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
        [attr.aria-expanded]="open()"
        (click)="open.update((v) => !v)"
      >
        {{ title() }}
        <span aria-hidden="true">{{ open() ? '−' : '+' }}</span>
      </button>
      <div *ngIf="open()" class="border-t border-gray-200 px-4 py-3 text-sm text-text-secondary">
        <ng-content />
      </div>
    </div>
  `
})
export class UiDisclosureComponent {
  public readonly title = input('Details');
  protected readonly open = signal(false);
}
