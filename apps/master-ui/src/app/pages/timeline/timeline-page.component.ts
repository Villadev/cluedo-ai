import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService, TimelineEvent } from '../../services/game-api.service';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AccordionModule } from 'primeng/accordion';

@Component({
  selector: 'app-timeline-page',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, TableModule, TagModule, AccordionModule],
  template: `
    <div class="p-4">
      <div class="flex justify-content-between align-items-center mb-4">
        <h1>Historial de la Partida</h1>
        <p-button label="Actualitzar Historial" icon="pi pi-refresh" (onClick)="loadTimeline()"></p-button>
      </div>

      <div *ngIf="loading()" class="text-center p-4">
        <i class="pi pi-spin pi-spinner" style="font-size: 2rem"></i>
      </div>

      <div *ngIf="error()" class="p-message p-message-error mb-4">
        {{ error() }}
      </div>

      <div *ngIf="events().length > 0">
        <p-table [value]="events()" [paginator]="true" [rows]="10" [responsiveLayout]="'scroll'" styleClass="p-datatable-striped">
          <ng-template pTemplate="header">
            <tr>
              <th>Timestamp</th>
              <th>Tipus</th>
              <th>Descripció</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-event>
            <tr>
              <td>{{ event.timestamp | date:'HH:mm:ss' }}</td>
              <td>
                <p-tag [value]="event.type" [severity]="getSeverity(event.type)"></p-tag>
              </td>
              <td>{{ event.description }}</td>
            </tr>
          </ng-template>
        </p-table>

        <p-accordion class="mt-4">
          <p-accordionTab header="Veure JSON Brut">
            <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 400px"><code>{{ events() | json }}</code></pre>
          </p-accordionTab>
        </p-accordion>
      </div>

      <div *ngIf="!loading() && events().length === 0 && !error()" class="text-center p-4">
        <p>No hi ha esdeveniments registrats encara.</p>
      </div>
    </div>
  `
})
export class TimelinePageComponent implements OnInit {
  private readonly gameApi = inject(GameApiService);

  protected readonly events = signal<TimelineEvent[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadTimeline();
  }

  loadTimeline(): void {
    const gameId = this.gameApi.gameId();
    if (!gameId) {
      this.error.set('No s\'ha trobat cap ID de partida al localStorage');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.gameApi.getTimeline(gameId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.events.set(response.data);
        } else {
          this.error.set(response.error || 'Error desconegut al carregar l\'historial');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en la comunicació amb el servidor');
        this.loading.set(false);
      }
    });
  }

  getSeverity(type: string): "success" | "info" | "warning" | "danger" | "secondary" | "contrast" | undefined {
    switch (type) {
      case 'STATE_CHANGE': return 'info';
      case 'PLAYER_JOIN': return 'success';
      case 'CHARACTER_ASSIGNED': return 'secondary';
      case 'ROUND_START': return 'warning';
      case 'QUESTION': return 'info';
      case 'CLUE': return 'secondary';
      case 'ACCUSATION': return 'danger';
      case 'GAME_END': return 'success';
      default: return undefined;
    }
  }
}
