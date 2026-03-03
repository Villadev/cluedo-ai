import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [attr.type]="type()"
      [disabled]="disabled()"
      [ngClass]="buttonClass"
      class="inline-flex items-center justify-center gap-2 rounded-md border px-4 font-medium transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60"
    >
      <ng-content />
    </button>
  `
})
export class UiButtonComponent {
  public readonly variant = input<ButtonVariant>('primary');
  public readonly size = input<ButtonSize>('md');
  public readonly type = input<'button' | 'submit' | 'reset'>('button');
  public readonly disabled = input(false);

  protected get buttonClass(): string {
    const sizeClass = {
      sm: 'h-9 text-sm',
      md: 'h-10 text-sm',
      lg: 'h-11 text-base'
    }[this.size()];

    const variantClass = {
      primary: 'border-primary/60 bg-primary text-white hover-glow hover:bg-primary/90',
      secondary: 'border-gray-200 bg-surface text-text-primary hover:border-primary/60 hover:text-white',
      danger: 'border-danger/60 bg-danger text-white hover:bg-danger/90'
    }[this.variant()];

    return `${sizeClass} ${variantClass}`;
  }
}
