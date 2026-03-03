import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type NavItem = { label: string; icon: string; active?: boolean };

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss'
})
export class AppShellComponent {
  readonly title = input('Cluedo Player');
  readonly subtitle = input('Overview');
  readonly navItems = input<NavItem[]>([]);
}
