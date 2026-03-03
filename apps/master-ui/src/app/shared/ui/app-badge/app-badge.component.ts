import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type BadgeTone = 'primary' | 'secondary' | 'accent' | 'neutral';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-badge.component.html',
  styleUrl: './app-badge.component.scss'
})
export class AppBadgeComponent {
  readonly tone = input<BadgeTone>('neutral');

  protected get badgeClass(): string {
    const toneClass = {
      primary: 'badge-primary',
      secondary: 'badge-secondary',
      accent: 'badge-accent',
      neutral: 'badge-neutral'
    }[this.tone()];

    return `badge ${toneClass}`;
  }
}
