import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-cases-page',
  standalone: true,
  imports: [CardModule],
  templateUrl: './cases-page.component.html',
  styleUrl: './cases-page.component.scss'
})
export class CasesPageComponent {}
