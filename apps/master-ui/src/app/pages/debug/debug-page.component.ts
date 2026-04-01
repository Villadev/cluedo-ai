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
  templateUrl: './debug-page.component.html',
  styleUrl: './debug-page.component.scss'
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
