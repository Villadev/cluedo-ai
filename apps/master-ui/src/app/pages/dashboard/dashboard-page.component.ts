import { Component } from '@angular/core';
import { AppBadgeComponent } from '../../shared/ui/app-badge/app-badge.component';
import { AppButtonComponent } from '../../shared/ui/app-button/app-button.component';
import { AppCardComponent } from '../../shared/ui/app-card/app-card.component';
import { AppPageContainerComponent } from '../../shared/ui/app-page-container/app-page-container.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [AppBadgeComponent, AppButtonComponent, AppCardComponent, AppPageContainerComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss'
})
export class DashboardPageComponent {
  protected readonly stats = [
    { label: 'Active Tables', value: '4' },
    { label: 'Queued Players', value: '27' },
    { label: 'Reports Pending', value: '2' }
  ];
}
