import { ChangeDetectionStrategy, Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageModule } from 'primeng/message';

@Component({
  selector: 'app-generation-status-card',
  standalone: true,
  imports: [CommonModule, CardModule, ProgressBarModule, MessageModule],
  templateUrl: './generation-status-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenerationStatusCardComponent {
  phase = input<string | undefined>();
  attempts = input<number | undefined>(1);
  error = input<string | null | undefined>();
  hasSolution = input<boolean>(false);

  protected readonly progressValue = computed(() => {
    const p = this.phase();
    switch (p) {
      case 'SKELETON': return 20;
      case 'CHARACTERS': return 40;
      case 'NARRATIVES': return 60;
      case 'CLUES': return 80;
      case 'RECOVERY': return 90;
      case 'DONE': return 100;
      default: return 0;
    }
  });
}
