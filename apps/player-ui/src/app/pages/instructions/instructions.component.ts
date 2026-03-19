import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-instructions',
  standalone: true,
  imports: [CommonModule, CardModule],
  templateUrl: './instructions.component.html',
  styleUrl: './instructions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InstructionsComponent {}
