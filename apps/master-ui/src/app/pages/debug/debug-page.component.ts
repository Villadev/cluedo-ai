import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService, DebugData } from '../../services/game-api.service';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';

@Component({
  selector: 'app-debug-page',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, AccordionModule],
  template: `
    <div class="p-4">
      <div class="flex justify-content-between align-items-center mb-4">
        <h1>Depuració de la Partida</h1>
        <p-button label="Actualitzar Estat" icon="pi pi-refresh" (onClick)="loadDebugData()"></p-button>
      </div>

      <div *ngIf="loading()" class="text-center p-4">
        <i class="pi pi-spin pi-spinner" style="font-size: 2rem"></i>
      </div>

      <div *ngIf="error()" class="p-message p-message-error mb-4">
        {{ error() }}
      </div>

      <div *ngIf="debugData() as data">
        <div class="grid">
          <div class="col-12 md:col-6 lg:col-3">
            <p-card header="Estat" subheader="Estat actual del joc">
              <span class="text-xl font-bold">{{ data.state }}</span>
            </p-card>
          </div>
          <div class="col-12 md:col-6 lg:col-3">
            <p-card header="Ronda" subheader="Número de ronda actual">
              <span class="text-xl font-bold">{{ data.roundNumber }}</span>
            </p-card>
          </div>
          <div class="col-12 md:col-6 lg:col-3">
            <p-card header="Jugadors" subheader="Total de jugadors">
              <span class="text-xl font-bold">{{ data.players.length }}</span>
            </p-card>
          </div>
          <div class="col-12 md:col-6 lg:col-3">
            <p-card header="Errors" subheader="Total d'errors registrats">
              <span class="text-xl font-bold" [class.text-red-500]="data.errors.length > 0">{{ data.errors.length }}</span>
            </p-card>
          </div>
        </div>

        <p-accordion [multiple]="true" class="mt-4">
          <p-accordionTab header="Errors del Servidor (Recents)">
            <div *ngIf="data.errors.length === 0" class="p-3 text-green-600 font-bold">
              No s'ha detectat cap error recent al servidor.
            </div>
            <ul *ngIf="data.errors.length > 0" class="list-none p-0 m-0">
              <li *ngFor="let err of data.errors" class="p-3 mb-2 border-round bg-red-50 border-left-3 border-red-500">
                <div class="flex justify-content-between mb-1">
                  <span class="font-bold text-red-700">[{{ err.timestamp | date:'HH:mm:ss' }}] {{ err.source }}</span>
                </div>
                <div class="text-red-600">{{ err.message }}</div>
                <details *ngIf="err.stack" class="mt-2">
                  <summary class="cursor-pointer text-sm text-red-400">Veure stack trace</summary>
                  <pre class="text-xs mt-2 p-2 bg-red-100 border-round overflow-auto"><code>{{ err.stack }}</code></pre>
                </details>
              </li>
            </ul>
          </p-accordionTab>

          <p-accordionTab header="Informació Detallada de la Partida">
            <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 400px"><code>{{ data.game | json }}</code></pre>
          </p-accordionTab>

          <p-accordionTab header="Errors (Raw JSON)">
            <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 400px"><code>{{ data.errors | json }}</code></pre>
          </p-accordionTab>

          <p-accordionTab header="Jugadors">
            <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 400px"><code>{{ data.players | json }}</code></pre>
          </p-accordionTab>
          <p-accordionTab header="Personatges">
            <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 400px"><code>{{ data.characters | json }}</code></pre>
          </p-accordionTab>
          <p-accordionTab header="Pistes">
            <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 400px"><code>{{ data.clues | json }}</code></pre>
          </p-accordionTab>
        </p-accordion>
      </div>
    </div>
  `
})
export class DebugPageComponent implements OnInit {
  private readonly gameApi = inject(GameApiService);

  protected readonly debugData = signal<DebugData | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadDebugData();
  }

  loadDebugData(): void {
    const gameId = this.gameApi.gameId();
    if (!gameId) {
      this.error.set('No s\'ha trobat cap ID de partida al localStorage');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.gameApi.getDebug(gameId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.debugData.set(response.data);
        } else {
          this.error.set(response.error || 'Error desconegut al carregar les dades de depuració');
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
