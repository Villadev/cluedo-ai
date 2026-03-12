import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { GameService } from '../../services/game.service';
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
  private readonly gameService = inject(GameService);
  private readonly destroyRef = inject(DestroyRef);

  protected isSubmitting = false;
  protected errorMessage = '';

  protected readonly joinForm = this.formBuilder.nonNullable.group({
    gameId: ['', Validators.required],
    usePlayerId: [false],
    playerId: [''],
    name: ['']
  });

  ngOnInit(): void {
    this.configureConditionalValidation();

    const gameId = this.route.snapshot.queryParamMap.get('gameId') ?? '';
    const playerId = this.route.snapshot.queryParamMap.get('playerId') ?? '';

    this.joinForm.patchValue({
      gameId,
      usePlayerId: Boolean(playerId),
      playerId
    });

    this.applyConditionalValidation(Boolean(playerId));
  }

  protected onJoin(): void {
    if (this.joinForm.invalid || this.isSubmitting) {
      this.joinForm.markAllAsTouched();
      return;
    }

    const gameId = this.joinForm.controls.gameId.value.trim();
    const playerId = this.joinForm.controls.playerId.value.trim();
    const useExistingPlayerId = this.joinForm.controls.usePlayerId.value;

    this.errorMessage = '';

    if (useExistingPlayerId && playerId) {
      this.completeJoin(gameId, playerId);
      return;
    }

    const name = this.joinForm.controls.name.value.trim();

    this.isSubmitting = true;
    this.gameService
      .joinGame(gameId, name)
      .pipe(finalize(() => (this.isSubmitting = false)))
      .subscribe({
        next: (response) => {
          this.completeJoin(gameId, response.playerId);
        },
        error: () => {
          this.errorMessage = 'No hem pogut unir-te a la partida. Revisa les dades i torna-ho a provar.';
        }
      });
  }

  private completeJoin(gameId: string, playerId: string): void {
    this.sessionService.setSession(gameId, playerId);
    void this.router.navigate(['/game', gameId]);
  }

  private configureConditionalValidation(): void {
    this.joinForm.controls.usePlayerId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((usePlayerId: boolean) => {
        this.applyConditionalValidation(usePlayerId);
      });

    this.applyConditionalValidation(this.joinForm.controls.usePlayerId.value);
  }

  private applyConditionalValidation(usePlayerId: boolean): void {
    const playerIdControl = this.joinForm.controls.playerId;
    const nameControl = this.joinForm.controls.name;

    if (usePlayerId) {
      playerIdControl.setValidators([Validators.required]);
      nameControl.clearValidators();
      nameControl.setValue('');
    } else {
      playerIdControl.clearValidators();
      playerIdControl.setValue('');
      nameControl.setValidators([Validators.required]);
    }

    playerIdControl.updateValueAndValidity({ emitEvent: false });
    nameControl.updateValueAndValidity({ emitEvent: false });
  }
}
