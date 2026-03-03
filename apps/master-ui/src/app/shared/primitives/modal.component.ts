import { CommonModule } from '@angular/common';
import { Component, HostListener, input, output } from '@angular/core';

@Component({
  selector: 'ui-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="open()" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        class="absolute inset-0 bg-black/60"
        aria-label="Close dialog"
        (click)="close.emit()"
      ></button>
      <section
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="labelId()"
        class="relative z-10 w-full max-w-lg rounded-lg border border-gray-200 bg-surface p-6 shadow-elevated"
      >
        <ng-content />
      </section>
    </div>
  `
})
export class UiModalComponent {
  public readonly open = input(false);
  public readonly labelId = input('ui-modal-title');
  public readonly close = output<void>();

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open()) {
      this.close.emit();
    }
  }
}
