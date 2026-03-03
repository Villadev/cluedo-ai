import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { CasesPageComponent } from './pages/cases/cases-page.component';
import { EvidencePageComponent } from './pages/evidence/evidence-page.component';
import { SettingsPageComponent } from './pages/settings/settings-page.component';

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: DashboardPageComponent },
  { path: 'cases', component: CasesPageComponent },
  { path: 'evidence', component: EvidencePageComponent },
  { path: 'settings', component: SettingsPageComponent }
];
