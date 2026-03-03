import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-evidence-page',
  standalone: true,
  imports: [CardModule],
  templateUrl: './evidence-page.component.html',
  styleUrl: './evidence-page.component.scss'
})
export class EvidencePageComponent {}
