import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameApiService } from '../../services/game-api.service';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AccordionModule } from 'primeng/accordion';

@Component({
  selector: 'app-database-page',
  imports: [CommonModule, TableModule, ButtonModule, CardModule, AccordionModule],
  templateUrl: './database-page.component.html',
  styleUrl: './database-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
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
