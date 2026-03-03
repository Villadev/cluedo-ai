import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-moderation-page',
  standalone: true,
  imports: [CardModule],
  templateUrl: './moderation-page.component.html',
  styleUrl: './moderation-page.component.scss'
})
export class ModerationPageComponent {}
