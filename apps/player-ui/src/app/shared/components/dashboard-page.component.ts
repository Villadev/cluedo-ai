import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { UiBadgeComponent } from './badge.component';
import { UiButtonComponent } from './button.component';
import { UiCardComponent } from './card.component';
import { UiDisclosureComponent } from '../primitives/disclosure.component';
import { UiDropdownComponent } from '../primitives/dropdown.component';
import { UiMenuComponent } from '../primitives/menu.component';
import { UiModalComponent } from '../primitives/modal.component';
import { UiTabsComponent } from '../primitives/tabs.component';

@Component({
  selector: 'ui-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    UiCardComponent,
    UiButtonComponent,
    UiBadgeComponent,
    UiModalComponent,
    UiDropdownComponent,
    UiMenuComponent,
    UiDisclosureComponent,
    UiTabsComponent
  ],
  template: `
    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ui-card class="hover-glow">
        <p class="text-sm text-text-secondary">Active Detectives</p>
        <p class="mt-3 text-3xl font-semibold">6</p>
      </ui-card>
      <ui-card class="hover-glow">
        <p class="text-sm text-text-secondary">Mysteries Solved</p>
        <p class="mt-3 text-3xl font-semibold">18</p>
      </ui-card>
      <ui-card class="hover-glow">
        <p class="text-sm text-text-secondary">Live Sessions</p>
        <p class="mt-3 text-3xl font-semibold">3</p>
      </ui-card>
      <ui-card class="hover-glow">
        <p class="text-sm text-text-secondary">System Status</p>
        <p class="mt-3"><ui-badge tone="success">Operational</ui-badge></p>
      </ui-card>
    </section>

    <section class="mt-6 grid gap-6 lg:grid-cols-3">
      <ui-card class="lg:col-span-2">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-semibold">Investigation Hub</h2>
          <ui-dropdown [items]="actions" (itemSelected)="lastAction.set($event)"></ui-dropdown>
        </div>
        <ui-tabs [tabs]="tabItems"></ui-tabs>
      </ui-card>

      <ui-card>
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-xl font-semibold">Session Controls</h2>
          <ui-menu [actions]="menuActions" triggerLabel="Options"></ui-menu>
        </div>
        <div class="space-y-3">
          <ui-button (click)="modalOpen.set(true)">Open Case Modal</ui-button>
          <ui-button variant="secondary">Review Clues</ui-button>
          <ui-button variant="danger">End Session</ui-button>
          <p class="text-xs text-text-secondary">Last action: {{ lastAction() || 'none' }}</p>
        </div>
      </ui-card>
    </section>

    <section class="mt-6">
      <ui-disclosure title="Case Notes">
        Keep witness reports concise and sync card assignments with all participants before moving phases.
      </ui-disclosure>
    </section>

    <ui-modal [open]="modalOpen()" (close)="modalOpen.set(false)">
      <h3 id="ui-modal-title" class="text-xl font-semibold">Case briefing</h3>
      <p class="mt-3 text-sm text-text-secondary">
        Confirm all players have joined and assigned aliases before starting the interrogation round.
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <ui-button variant="secondary" (click)="modalOpen.set(false)">Cancel</ui-button>
        <ui-button (click)="modalOpen.set(false)">Confirm</ui-button>
      </div>
    </ui-modal>
  `
})
export class UiDashboardPageComponent {
  protected readonly modalOpen = signal(false);
  protected readonly lastAction = signal('');
  protected readonly actions = [
    { label: 'Create room', value: 'create-room' },
    { label: 'Invite players', value: 'invite-players' },
    { label: 'Archive case', value: 'archive-case' }
  ];

  protected readonly menuActions = [
    { label: 'Duplicate session', action: 'duplicate' },
    { label: 'Export logs', action: 'export' },
    { label: 'Delete session', action: 'delete', tone: 'danger' as const }
  ];

  protected readonly tabItems = [
    { id: 'timeline', label: 'Timeline', content: 'Track each turn with timestamped deduction events.' },
    { id: 'players', label: 'Players', content: 'Monitor participant readiness and role distribution.' },
    { id: 'intel', label: 'Intel', content: 'Organize hints, contradictions, and likely suspects.' }
  ];
}
