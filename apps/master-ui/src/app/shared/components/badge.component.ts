import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

@Component({
  selector: 'ui-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide" [ngClass]="toneClass">
      <ng-content />
    </span>
  `
})
export class UiBadgeComponent {
  public readonly tone = input<BadgeTone>('neutral');

  protected get toneClass(): string {
    return {
      primary: 'border-primary/50 bg-primary/15 text-primary',
      success: 'border-success/50 bg-success/15 text-success',
      warning: 'border-warning/50 bg-warning/15 text-warning',
      danger: 'border-danger/50 bg-danger/15 text-danger',
      neutral: 'border-gray-200 bg-surface text-text-secondary'
    }[this.tone()];
  }
}
