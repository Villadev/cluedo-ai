import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChatViewComponent } from '../../components/chat-view/chat-view.component';
import { GameApiService } from '../../services/game-api.service';

@Component({
  selector: 'app-chat-history-page',
  standalone: true,
  imports: [RouterLink, ChatViewComponent],
  template: `
    <main class="history-page">
      <header class="history-header">
        <div><span class="eyebrow">ARXIU DE LA PARTIDA</span><h1>Historial de converses</h1>
          <p>Consulta les preguntes, respostes i intervencions del narrador.</p></div>
        <a routerLink="/control-center" class="back-link"><i class="pi pi-arrow-left"></i> Tornar al control</a>
      </header>
      @if (gameId()) {
        <app-chat-view [gameId]="gameId()!"></app-chat-view>
      } @else {
        <div class="empty-state">No hi ha cap partida activa. Torna al centre de control.</div>
      }
    </main>
  `,
  styles: [`
    .history-page { max-width:1100px; margin:0 auto; padding:clamp(1rem,3vw,2.5rem); }
    .history-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem; }
    .eyebrow { font-size:.72rem; font-weight:800; letter-spacing:.14em; color:#54769d; }
    h1 { margin:.35rem 0; } p { margin:0; color:#697b91; }
    .back-link { display:inline-flex; gap:.6rem; align-items:center; padding:.7rem 1rem; border:1px solid #d7e4f2; background:#fff; border-radius:11px; text-decoration:none; font-weight:700; }
    .empty-state { padding:2rem; background:#fff; border-radius:16px; color:#697b91; }
  `]
})
export class ChatHistoryPageComponent {
  private readonly gameApi = inject(GameApiService);
  protected readonly gameId = this.gameApi.gameId;
}
