import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService, DebugData, GenerationTelemetryEvent } from '../../services/game-api.service';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { TableModule } from 'primeng/table';
import { ChartModule } from 'primeng/chart';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-debug-page',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, AccordionModule, TableModule, ChartModule, TagModule],
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

        <div class="mt-4" *ngIf="data.generationTelemetry && data.generationTelemetry.events.length > 0">
           <h2 class="text-2xl font-bold mb-3">Telemetria de Generació</h2>

           <div class="grid mb-4">
              <div class="col-12 md:col-4 lg:col-2">
                <p-card header="Total Crides" class="text-center">
                  <div class="text-3xl font-bold">{{ data.generationTelemetry.summary.totalCalls }}</div>
                  <div class="text-sm text-500">({{ data.generationTelemetry.summary.totalAttempts }} intents)</div>
                </p-card>
              </div>
              <div class="col-12 md:col-4 lg:col-2">
                <p-card header="Temps Mitjà" class="text-center">
                  <div class="text-3xl font-bold text-blue-600">{{ data.generationTelemetry.summary.avgDurationMs | number:'1.0-0' }}ms</div>
                </p-card>
              </div>
              <div class="col-12 md:col-4 lg:col-2">
                <p-card header="p95 Duration" class="text-center">
                  <div class="text-3xl font-bold text-purple-600">{{ data.generationTelemetry.summary.p95DurationMs | number:'1.0-0' }}ms</div>
                </p-card>
              </div>
              <div class="col-12 md:col-4 lg:col-2">
                <p-card header="Errors / Timeouts" class="text-center">
                  <div class="text-3xl font-bold text-red-600">
                    {{ data.generationTelemetry.summary.totalErrors + data.generationTelemetry.summary.totalTimeouts }}
                  </div>
                  <div class="text-xs text-500">VF: {{ data.generationTelemetry.summary.totalValidationFailed }} | AB: {{ data.generationTelemetry.summary.totalAborted }}</div>
                </p-card>
              </div>
              <div class="col-12 md:col-8 lg:col-4">
                <p-card header="Consum de Tokens" class="text-center">
                  <div class="text-2xl font-bold">{{ data.generationTelemetry.summary.totalTokens | number }}</div>
                  <div class="text-xs text-500">P: {{ data.generationTelemetry.summary.totalPromptTokens | number }} | C: {{ data.generationTelemetry.summary.totalCompletionTokens | number }}</div>
                </p-card>
              </div>
           </div>

           <div class="grid mb-4">
              <div class="col-12 lg:col-6">
                 <p-card header="Durada per Crida (ms)">
                    <p-chart type="bar" [data]="durationChartData()" [options]="chartOptions"></p-chart>
                 </p-card>
              </div>
              <div class="col-12 md:col-6 lg:col-3">
                 <p-card header="Distribució de Resultats">
                    <p-chart type="doughnut" [data]="outcomeChartData()" [options]="chartOptions"></p-chart>
                 </p-card>
              </div>
              <div class="col-12 md:col-6 lg:col-3">
                 <p-card header="Tokens per Pas">
                    <p-chart type="pie" [data]="tokensChartData()" [options]="chartOptions"></p-chart>
                 </p-card>
              </div>
           </div>

           <p-card header="Events de Generació Detallats" class="mb-4">
              <p-table [value]="data.generationTelemetry.events" [paginator]="true" [rows]="10" responsiveLayout="scroll" sortField="startAt" [sortOrder]="-1">
                <ng-template pTemplate="header">
                  <tr>
                    <th pSortableColumn="startAt">Hora <p-sortIcon field="startAt"></p-sortIcon></th>
                    <th pSortableColumn="phase">Fase <p-sortIcon field="phase"></p-sortIcon></th>
                    <th pSortableColumn="stepLabel">Pas <p-sortIcon field="stepLabel"></p-sortIcon></th>
                    <th pSortableColumn="durationMs">Temps <p-sortIcon field="durationMs"></p-sortIcon></th>
                    <th pSortableColumn="outcome">Resultat <p-sortIcon field="outcome"></p-sortIcon></th>
                    <th>Tokens</th>
                    <th>Detalls</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-event>
                  <tr>
                    <td>{{ event.startAt | date:'HH:mm:ss' }}</td>
                    <td>{{ event.phase }}</td>
                    <td>{{ event.stepLabel }} ({{ event.attempt }})</td>
                    <td>{{ event.durationMs }}ms</td>
                    <td>
                      <p-tag [severity]="getOutcomeSeverity(event.outcome)" [value]="event.outcome"></p-tag>
                    </td>
                    <td>{{ event.usage?.total_tokens || '-' }}</td>
                    <td>
                      <button *ngIf="event.validationDetails || event.errorMessage" pButton icon="pi pi-info-circle" class="p-button-text p-button-sm" (click)="showDetails(event)"></button>
                    </td>
                  </tr>
                </ng-template>
              </p-table>
           </p-card>
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

          <p-accordionTab header="Jugadors">
            <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 400px"><code>{{ data.players | json }}</code></pre>
          </p-accordionTab>
          <p-accordionTab header="Personatges">
            <pre class="bg-gray-900 text-white p-3 border-round overflow-auto" style="max-height: 400px"><code>{{ data.characters | json }}</code></pre>
          </p-accordionTab>
        </p-accordion>
      </div>
    </div>
  `,
  styles: [`
    :host ::ng-deep .p-card-header { padding: 1rem 1rem 0 1rem; }
    :host ::ng-deep .p-card-body { padding: 0 1rem 1rem 1rem; }
  `]
})
export class DebugPageComponent implements OnInit {
  private readonly gameApi = inject(GameApiService);

  protected readonly debugData = signal<DebugData | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly durationChartData = computed(() => {
    const events = this.debugData()?.generationTelemetry?.events || [];
    return {
      labels: events.map((_, i) => `#${i+1}`),
      datasets: [
        {
          label: 'Durada (ms)',
          data: events.map(e => e.durationMs),
          backgroundColor: '#3B82F6',
          borderColor: '#2563EB',
          fill: false
        }
      ]
    };
  });

  protected readonly outcomeChartData = computed(() => {
    const events = this.debugData()?.generationTelemetry?.events || [];
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.outcome] = (counts[e.outcome] || 0) + 1);

    return {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ['#10B981', '#F59E0B', '#EF4444', '#6366F1', '#6B7280']
      }]
    };
  });

  protected readonly tokensChartData = computed(() => {
    const events = this.debugData()?.generationTelemetry?.events || [];
    const groups: Record<string, number> = {};

    events.forEach(e => {
        const stepName = e.stepLabel.split(' ')[0] || 'unknown';
        groups[stepName] = (groups[stepName] || 0) + (e.usage?.total_tokens || 0);
    });

    return {
      labels: Object.keys(groups),
      datasets: [{
        data: Object.values(groups),
        backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#EC4899', '#8B5CF6']
      }]
    };
  });

  protected chartOptions = {
    plugins: {
      legend: { position: 'bottom' }
    },
    maintainAspectRatio: false,
    aspectRatio: 2
  };

  ngOnInit(): void {
    this.loadDebugData();
  }

  loadDebugData(): void {
    const gameId = this.gameApi.gameId();
    if (!gameId) {
      this.error.set('No s\'ha trobat cap ID de partida al sessionStorage');
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

  getOutcomeSeverity(outcome: string): 'success' | 'warning' | 'danger' | 'info' {
    switch (outcome) {
      case 'success': return 'success';
      case 'validation_failed': return 'warning';
      case 'timeout':
      case 'aborted':
      case 'error': return 'danger';
      default: return 'info';
    }
  }

  showDetails(event: GenerationTelemetryEvent): void {
      const details = {
          outcome: event.outcome,
          errorMessage: event.errorMessage,
          validation: event.validationDetails,
          usage: event.usage
      };
      alert(JSON.stringify(details, null, 2));
  }
}
