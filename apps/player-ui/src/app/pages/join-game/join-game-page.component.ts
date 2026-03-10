import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { SessionService } from '../../services/session.service';

@Component({
  selector: 'app-join-game-page',
  imports: [ReactiveFormsModule, CardModule, InputTextModule, CheckboxModule, ButtonModule],
  templateUrl: './join-game-page.component.html',
  styleUrl: './join-game-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JoinGamePageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionService = inject(SessionService);

  protected readonly joinForm = this.formBuilder.nonNullable.group({
    gameId: ['', Validators.required],
    usePlayerId: [false],
    playerId: ['']
  });

  ngOnInit(): void {
    const gameId = this.route.snapshot.queryParamMap.get('gameId') ?? '';
    const playerId = this.route.snapshot.queryParamMap.get('playerId') ?? '';

    if (gameId || playerId) {
      this.joinForm.patchValue({
        gameId,
        usePlayerId: Boolean(playerId),
        playerId
      });
    }
  }

  protected onJoin(): void {
    if (this.joinForm.invalid) {
      this.joinForm.markAllAsTouched();
      return;
    }

    const gameId = this.joinForm.controls.gameId.value.trim();
    const usePlayerId = this.joinForm.controls.usePlayerId.value;
    const playerId = usePlayerId ? this.joinForm.controls.playerId.value.trim() : '';

    this.sessionService.setSession(gameId, playerId);

    void this.router.navigate(['/game', gameId], {
      queryParams: playerId ? { playerId } : undefined
    });
  }
}
