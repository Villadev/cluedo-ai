import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService } from '../../services/game-api.service';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AccordionModule } from 'primeng/accordion';

@Component({
  selector: 'app-database-page',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, CardModule, AccordionModule],
  template: `
    <div class="p-4">
      <div class="flex justify-content-between align-items-center mb-4">
        <h1>Bases de Dades (Games)</h1>
        <p-button label="Actualitzar" icon="pi pi-refresh" (onClick)="loadGames()"></p-button>
      </div>

      <div *ngIf="loading()" class="text-center p-4">
        <i class="pi pi-spin pi-spinner" style="font-size: 2rem"></i>
      </div>

      <div *ngIf="error()" class="p-message p-message-error mb-4">
        {{ error() }}
      </div>

      <div *ngIf="games().length === 0 && !loading()" class="text-center p-4 text-xl">
        No hi ha partides a la base de dades.
      </div>

      <div *ngIf="games().length > 0">
        <p-table [value]="games()" [responsiveLayout]="'scroll'">
          <ng-template pTemplate="header">
            <tr>
              <th>ID Partida</th>
              <th>Estat</th>
              <th>Ronda</th>
              <th>Jugadors</th>
              <th>Darrera Act.</th>
              <th>Accions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-game>
            <tr>
              <td>{{ game.id }}</td>
              <td>{{ game.state }}</td>
              <td>{{ game.roundNumber }}</td>
              <td>{{ game.players?.length || 0 }}</td>
              <td>{{ game.updatedAt | date:'short' }}</td>
              <td>
                <p-button label="Veure JSON" icon="pi pi-search" (onClick)="selectedGame.set(game)"></p-button>
              </td>
            </tr>
          </ng-template>
        </p-table>

        <div *ngIf="selectedGame() as game" class="mt-4">
          <p-card [header]="'Detalls de la Partida: ' + game.id">
            <p-accordion [multiple]="true">
              <p-accordionTab header="JSON Complet">
                <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 500px"><code>{{ game | json }}</code></pre>
              </p-accordionTab>
              <p-accordionTab header="Jugadors">
                <pre class="bg-gray-900 text-white p-3 border-round overflow-auto"><code>{{ game.players | json }}</code></pre>
              </p-accordionTab>
              <p-accordionTab header="Pistes">
                <pre class="bg-gray-900 text-white p-3 border-round overflow-auto"><code>{{ game.clues | json }}</code></pre>
              </p-accordionTab>
            </p-accordion>
            <div class="mt-3 flex justify-content-end">
              <p-button label="Tancar" icon="pi pi-times" (onClick)="selectedGame.set(null)" class="p-button-secondary"></p-button>
            </div>
          </p-card>
        </div>
      </div>
    </div>
  `
})
export class DatabasePageComponent implements OnInit {
  private readonly gameApi = inject(GameApiService);

  protected readonly games = signal<any[]>([]);
  protected readonly selectedGame = signal<any | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadGames();
  }

  loadGames(): void {
    this.loading.set(true);
    this.error.set(null);

    this.gameApi.listAllGames().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.games.set(response.data);
        } else {
          this.error.set(response.error || 'Error al carregar les partides');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error en la comunicació amb el servidor');
        this.loading.set(false);
      }
    });
  }
}
