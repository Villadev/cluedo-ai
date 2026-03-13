import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { GameApiService, Question } from '../../services/game-api.service';

@Component({
  selector: 'app-questions-page',
  standalone: true,
  imports: [CommonModule, CardModule, TableModule, ProgressSpinnerModule, MessageModule, DatePipe],
  template: `
    <div class="p-4">
      <p-card header="Historial de preguntes">
        @if (loading()) {
          <div class="flex justify-content-center p-4">
            <p-progressSpinner></p-progressSpinner>
          </div>
        } @else if (error()) {
          <p-message severity="error" [text]="error() || ''"></p-message>
        } @else {
          <p-table [value]="questions()" [responsiveLayout]="'scroll'" styleClass="p-datatable-striped">
            <ng-template pTemplate="header">
              <tr>
                <th style="width: 10%">Ronda</th>
                <th style="width: 20%">Jugador</th>
                <th>Pregunta</th>
                <th style="width: 20%">Hora</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-q>
              <tr>
                <td>{{ q.roundNumber }}</td>
                <td>{{ q.playerName }}</td>
                <td>{{ q.question }}</td>
                <td>{{ q.timestamp | date: 'HH:mm:ss' }}</td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr>
                <td colspan="4" class="text-center p-4">Encara no s'ha fet cap pregunta.</td>
              </tr>
            </ng-template>
          </p-table>
        }
      </p-card>
    </div>
  `
})
export class QuestionsPageComponent implements OnInit {
  private readonly gameApi = inject(GameApiService);

  protected readonly questions = signal<Question[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const gameId = this.gameApi.gameId();
    if (!gameId) {
      this.error.set('No hi ha cap partida seleccionada.');
      this.loading.set(false);
      return;
    }

    this.gameApi.getQuestions(gameId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.questions.set(response.data);
        } else {
          this.error.set(response.error || 'Error en carregar les preguntes');
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Error en connectar amb el servidor');
        this.loading.set(false);
      }
    });
  }
}
