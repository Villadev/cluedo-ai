import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Coartada } from '../../models/player.model';

@Component({
  selector: 'app-coartada',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './coartada.component.html',
  styleUrl: './coartada.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CoartadaComponent {
  @Input({ required: true }) coartada!: Coartada;
}
