import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { GameService } from '../../services/game.service';
import { SessionService } from '../../services/session.service';

type NoteState = 'unknown' | 'discarded' | 'suspicious' | 'possible_solution';

interface NotebookData {
  suspects: Record<string, NoteState>;
  weapons: Record<string, NoteState>;
  locations: Record<string, NoteState>;
}

@Component({
  selector: 'app-detective-notebook',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule, TableModule, TagModule],
  templateUrl: './detective-notebook.component.html',
  styleUrl: './detective-notebook.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DetectiveNotebookComponent implements OnInit {
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);
  private readonly storageKey = 'cluedo_detective_notes';

  protected readonly suspects = signal<string[]>([]);
  protected readonly weapons = signal<string[]>([]);
  protected readonly locations = signal<string[]>([]);

  protected readonly notes = signal<NotebookData>({
    suspects: {},
    weapons: {},
    locations: {}
  });

  ngOnInit(): void {
    const gameId = this.sessionService.getGameId();
    if (gameId) {
      this.gameService.getParticipants(gameId).subscribe(response => {
        if (response.success && response.data) {
          const names = response.data.map(p => p.character?.name || p.nickname);
          this.suspects.set(names);
          this.initializeNotesIfMissing('suspects', names);
        }
      });
    }

    this.weapons.set(this.gameService.getPossibleWeapons());
    this.initializeNotesIfMissing('weapons', this.weapons());

    this.locations.set(this.gameService.getPossibleLocations());
    this.initializeNotesIfMissing('locations', this.locations());

    this.loadNotes();
  }

  private initializeNotesIfMissing(category: keyof NotebookData, items: string[]): void {
    const currentNotes = this.notes();
    items.forEach(item => {
      if (!currentNotes[category][item]) {
        currentNotes[category][item] = 'unknown';
      }
    });
    this.notes.set({ ...currentNotes });
  }

  protected cycleState(category: keyof NotebookData, item: string): void {
    const currentNotes = this.notes();
    const currentState = currentNotes[category][item];
    let nextState: NoteState = 'unknown';

    switch (currentState) {
      case 'unknown': nextState = 'suspicious'; break;
      case 'suspicious': nextState = 'discarded'; break;
      case 'discarded': nextState = 'possible_solution'; break;
      case 'possible_solution': nextState = 'unknown'; break;
    }

    currentNotes[category][item] = nextState;
    this.notes.set({ ...currentNotes });
    this.saveNotes();
  }

  protected getStateInfo(state: NoteState): { label: string, severity: "success" | "secondary" | "info" | "warning" | "danger" | "contrast" | undefined, icon: string } {
    switch (state) {
      case 'discarded': return { label: 'Descartat', severity: 'danger', icon: 'pi pi-times' };
      case 'suspicious': return { label: 'Sospitós', severity: 'warning', icon: 'pi pi-question' };
      case 'possible_solution': return { label: 'Possible Solució', severity: 'success', icon: 'pi pi-check' };
      default: return { label: 'Desconegut', severity: 'secondary', icon: 'pi pi-minus' };
    }
  }

  private loadNotes(): void {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.notes.set({
           suspects: { ...this.notes().suspects, ...parsed.suspects },
           weapons: { ...this.notes().weapons, ...parsed.weapons },
           locations: { ...this.notes().locations, ...parsed.locations }
        });
      } catch (e) {
        console.error('Error loading notes', e);
      }
    }
  }

  private saveNotes(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.notes()));
  }
}
