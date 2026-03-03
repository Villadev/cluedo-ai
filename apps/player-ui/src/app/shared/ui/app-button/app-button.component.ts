import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-button.component.html',
  styleUrl: './app-button.component.scss'
})
export class AppButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly fullWidth = input(false);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  protected get buttonClass(): string {
    const variantClass = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      accent: 'btn-accent',
      ghost: 'btn-ghost'
    }[this.variant()];

    const widthClass = this.fullWidth() ? 'btn-block' : '';
    const sizeClass = `btn-${this.size()}`;

    return `btn ${variantClass} ${sizeClass} ${widthClass}`;
  }
}
